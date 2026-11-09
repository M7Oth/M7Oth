#include "Session/HRSessionSubsystem.h"
#include "Core/HRLocalization.h"
#include "HeistResponse.h"
#include "OnlineSubsystem.h"
#include "OnlineSubsystemUtils.h"
#include "Online/OnlineSessionNames.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"
#include "GameFramework/PlayerController.h"
#include "Core/HRGameUserSettings.h"

const FName UHRSessionSubsystem::SettingBuild(TEXT("HR_BUILD"));
const FName UHRSessionSubsystem::SettingRoomCode(TEXT("HR_ROOMCODE"));
const FName UHRSessionSubsystem::SettingPrivate(TEXT("HR_PRIVATE"));

FString UHRSessionSubsystem::GetTravelOptions()
{
	const UHRGameUserSettings* Settings = UHRGameUserSettings::Get();
	FString Name = Settings ? Settings->PlayerDisplayName.Left(20) : FString();
	for (TCHAR& C : Name.GetCharArray()) { if (C == TEXT('?') || C == TEXT('=') || C == TEXT('#') || C == TEXT(' ') || C == TEXT('/')) { C = TEXT('_'); } }
	return Name.IsEmpty() ? FString() : FString::Printf(TEXT("?Name=%s"), *Name);
}

int32 UHRSessionSubsystem::BuildId()
{
	// Bump with every network-protocol-affecting change.
	return 100;
}

void UHRSessionSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	if (IOnlineSessionPtr S = GetSessions())
	{
		CreateHandle = S->AddOnCreateSessionCompleteDelegate_Handle(FOnCreateSessionCompleteDelegate::CreateUObject(this, &UHRSessionSubsystem::OnCreateComplete));
		FindHandle = S->AddOnFindSessionsCompleteDelegate_Handle(FOnFindSessionsCompleteDelegate::CreateUObject(this, &UHRSessionSubsystem::OnFindComplete));
		JoinHandle = S->AddOnJoinSessionCompleteDelegate_Handle(FOnJoinSessionCompleteDelegate::CreateUObject(this, &UHRSessionSubsystem::OnJoinComplete));
		DestroyHandle = S->AddOnDestroySessionCompleteDelegate_Handle(FOnDestroySessionCompleteDelegate::CreateUObject(this, &UHRSessionSubsystem::OnDestroyComplete));
	}
}

void UHRSessionSubsystem::Deinitialize()
{
	if (IOnlineSessionPtr S = GetSessions())
	{
		S->ClearOnCreateSessionCompleteDelegate_Handle(CreateHandle);
		S->ClearOnFindSessionsCompleteDelegate_Handle(FindHandle);
		S->ClearOnJoinSessionCompleteDelegate_Handle(JoinHandle);
		S->ClearOnDestroySessionCompleteDelegate_Handle(DestroyHandle);
	}
	Super::Deinitialize();
}

IOnlineSessionPtr UHRSessionSubsystem::GetSessions() const
{
	const IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
	return OSS ? OSS->GetSessionInterface() : nullptr;
}

FString UHRSessionSubsystem::GetSubsystemName() const
{
	const IOnlineSubsystem* OSS = Online::GetSubsystem(GetWorld());
	return OSS ? OSS->GetSubsystemName().ToString() : TEXT("None");
}

void UHRSessionSubsystem::Fail(const FName LocKey)
{
	CurrentOp = EHRSessionOp::None;
	OnSessionError.Broadcast(FHRLocalization::Get().Text(LocKey));
}

FString UHRSessionSubsystem::MakeRoomCode() const
{
	static const TCHAR* Alphabet = TEXT("ABCDEFGHJKLMNPQRSTUVWXYZ23456789"); // no 0/O/1/I confusion
	FString Code;
	for (int32 i = 0; i < 6; ++i) { Code.AppendChar(Alphabet[FMath::RandRange(0, 31)]); }
	return Code;
}

void UHRSessionSubsystem::HostSession(bool bPrivate, int32 MaxPlayers)
{
	IOnlineSessionPtr S = GetSessions();
	if (!S) { Fail(TEXT("Error.NoOnline")); return; }
	if (S->GetNamedSession(NAME_GameSession))
	{
		bHostAfterDestroy = true;
		bPendingPrivate = bPrivate;
		PendingMaxPlayers = MaxPlayers;
		S->DestroySession(NAME_GameSession);
		return;
	}
	CurrentOp = EHRSessionOp::Creating;
	RoomCode = bPrivate ? MakeRoomCode() : FString();

	FOnlineSessionSettings Settings;
	Settings.bIsLANMatch = GetSubsystemName() == TEXT("NULL");
	Settings.NumPublicConnections = MaxPlayers;
	Settings.bShouldAdvertise = true; // private rooms are advertised but only matched by code
	Settings.bAllowJoinInProgress = true;
	Settings.bAllowInvites = true;
	Settings.bUsesPresence = true;
	Settings.bUseLobbiesIfAvailable = true;
	Settings.bAllowJoinViaPresence = true;
	Settings.Set(SettingBuild, BuildId(), EOnlineDataAdvertisementType::ViaOnlineService);
	Settings.Set(SettingPrivate, bPrivate ? 1 : 0, EOnlineDataAdvertisementType::ViaOnlineService);
	Settings.Set(SettingRoomCode, RoomCode, EOnlineDataAdvertisementType::ViaOnlineService);
	Settings.Set(SETTING_MAPNAME, MatchMap, EOnlineDataAdvertisementType::ViaOnlineService);

	const ULocalPlayer* LP = GetGameInstance()->GetFirstGamePlayer();
	if (!LP || !S->CreateSession(*LP->GetPreferredUniqueNetId(), NAME_GameSession, Settings))
	{
		Fail(TEXT("Error.CreateFailed"));
	}
}

void UHRSessionSubsystem::OnCreateComplete(FName SessionName, bool bOk)
{
	if (CurrentOp != EHRSessionOp::Creating) { return; }
	CurrentOp = EHRSessionOp::None;
	if (!bOk) { Fail(TEXT("Error.CreateFailed")); return; }
	UE_LOG(LogHeist, Log, TEXT("Session created (%s) code=%s"), *GetSubsystemName(), *RoomCode);
	UGameplayStatics::OpenLevel(GetWorld(), FName(*MatchMap), true, FString(RoomCode.IsEmpty() ? TEXT("listen") : TEXT("listen?Private")) + GetTravelOptions());
}

void UHRSessionSubsystem::StartSearch(int32 MaxResults, const FString& Code, bool bPublicOnly)
{
	IOnlineSessionPtr S = GetSessions();
	const ULocalPlayer* LP = GetGameInstance()->GetFirstGamePlayer();
	if (!S || !LP) { Fail(TEXT("Error.NoOnline")); return; }
	Search = MakeShared<FOnlineSessionSearch>();
	Search->MaxSearchResults = MaxResults;
	Search->bIsLanQuery = GetSubsystemName() == TEXT("NULL");
	Search->QuerySettings.Set(SEARCH_PRESENCE, true, EOnlineComparisonOp::Equals);
	Search->QuerySettings.Set(SettingBuild, BuildId(), EOnlineComparisonOp::Equals);
	if (!Code.IsEmpty()) { Search->QuerySettings.Set(SettingRoomCode, Code, EOnlineComparisonOp::Equals); }
	else if (bPublicOnly) { Search->QuerySettings.Set(SettingPrivate, 0, EOnlineComparisonOp::Equals); }
	PendingCode = Code;
	if (!S->FindSessions(*LP->GetPreferredUniqueNetId(), Search.ToSharedRef()))
	{
		Fail(TEXT("Error.SearchFailed"));
	}
}

void UHRSessionSubsystem::QuickPlay()
{
	CurrentOp = EHRSessionOp::QuickPlaySearching;
	StartSearch(50, FString(), true);
}

void UHRSessionSubsystem::JoinByCode(const FString& Code)
{
	const FString Clean = Code.TrimStartAndEnd().ToUpper();
	if (Clean.Len() != 6) { Fail(TEXT("Error.BadCode")); return; }
	CurrentOp = EHRSessionOp::Joining;
	StartSearch(20, Clean, false);
}

void UHRSessionSubsystem::RefreshBrowser()
{
	CurrentOp = EHRSessionOp::Searching;
	StartSearch(100, FString(), true);
}

void UHRSessionSubsystem::OnFindComplete(bool bOk)
{
	const EHRSessionOp Op = CurrentOp;
	if (Op == EHRSessionOp::None || !Search.IsValid()) { return; }

	Rows.Reset();
	const TArray<FOnlineSessionSearchResult>& Results = Search->SearchResults;
	for (int32 i = 0; i < Results.Num(); ++i)
	{
		const FOnlineSessionSearchResult& R = Results[i];
		int32 Build = 0;
		R.Session.SessionSettings.Get(SettingBuild, Build);
		if (Build != BuildId()) { continue; } // subsystems that ignore query filters (Null) are filtered here
		int32 IsPrivate = 0;
		R.Session.SessionSettings.Get(SettingPrivate, IsPrivate);
		FString Code;
		R.Session.SessionSettings.Get(SettingRoomCode, Code);
		if (!PendingCode.IsEmpty() ? Code != PendingCode : IsPrivate != 0) { continue; }

		FHRSessionRow Row;
		Row.HostName = R.Session.OwningUserName;
		Row.MaxPlayers = R.Session.SessionSettings.NumPublicConnections;
		Row.Players = Row.MaxPlayers - R.Session.NumOpenPublicConnections;
		Row.PingMs = R.PingInMs;
		Row.SearchIndex = i;
		Rows.Add(Row);
	}
	Rows.Sort([](const FHRSessionRow& A, const FHRSessionRow& B) { return A.PingMs < B.PingMs; });

	if (Op == EHRSessionOp::Searching)
	{
		CurrentOp = EHRSessionOp::None;
		OnSessionsUpdated.Broadcast();
		return;
	}

	// QuickPlay / Join by code: pick the best row with a free slot.
	for (const FHRSessionRow& Row : Rows)
	{
		if (Row.Players < Row.MaxPlayers)
		{
			JoinResult(Results[Row.SearchIndex]);
			return;
		}
	}
	if (Op == EHRSessionOp::QuickPlaySearching)
	{
		UE_LOG(LogHeist, Log, TEXT("QuickPlay: no open sessions, hosting a public one"));
		CurrentOp = EHRSessionOp::None;
		HostSession(false);
		return;
	}
	Fail(TEXT("Error.RoomNotFound"));
}

void UHRSessionSubsystem::JoinBrowserRow(int32 RowIndex)
{
	if (!Rows.IsValidIndex(RowIndex) || !Search.IsValid() || !Search->SearchResults.IsValidIndex(Rows[RowIndex].SearchIndex)) { return; }
	JoinResult(Search->SearchResults[Rows[RowIndex].SearchIndex]);
}

void UHRSessionSubsystem::JoinResult(const FOnlineSessionSearchResult& Result)
{
	IOnlineSessionPtr S = GetSessions();
	const ULocalPlayer* LP = GetGameInstance()->GetFirstGamePlayer();
	if (!S || !LP) { Fail(TEXT("Error.NoOnline")); return; }
	if (S->GetNamedSession(NAME_GameSession)) { S->DestroySession(NAME_GameSession); }
	CurrentOp = EHRSessionOp::Joining;
	if (!S->JoinSession(*LP->GetPreferredUniqueNetId(), NAME_GameSession, Result))
	{
		Fail(TEXT("Error.JoinFailed"));
	}
}

void UHRSessionSubsystem::OnJoinComplete(FName SessionName, EOnJoinSessionCompleteResult::Type Result)
{
	CurrentOp = EHRSessionOp::None;
	if (Result != EOnJoinSessionCompleteResult::Success)
	{
		Fail(Result == EOnJoinSessionCompleteResult::SessionIsFull ? TEXT("Error.SessionFull") : TEXT("Error.JoinFailed"));
		return;
	}
	IOnlineSessionPtr S = GetSessions();
	FString Address;
	if (!S || !S->GetResolvedConnectString(SessionName, Address)) { Fail(TEXT("Error.JoinFailed")); return; }
	if (APlayerController* PC = GetGameInstance()->GetFirstLocalPlayerController())
	{
		PC->ClientTravel(Address + GetTravelOptions(), TRAVEL_Absolute);
	}
}

void UHRSessionSubsystem::LeaveSession()
{
	if (IOnlineSessionPtr S = GetSessions())
	{
		if (S->GetNamedSession(NAME_GameSession)) { S->DestroySession(NAME_GameSession); }
	}
	RoomCode.Reset();
}

void UHRSessionSubsystem::OnDestroyComplete(FName SessionName, bool bOk)
{
	if (bHostAfterDestroy)
	{
		bHostAfterDestroy = false;
		HostSession(bPendingPrivate, PendingMaxPlayers);
	}
}

void UHRSessionSubsystem::CancelOperation()
{
	if (CurrentOp == EHRSessionOp::Searching || CurrentOp == EHRSessionOp::QuickPlaySearching)
	{
		if (IOnlineSessionPtr S = GetSessions()) { S->CancelFindSessions(); }
	}
	CurrentOp = EHRSessionOp::None;
}
