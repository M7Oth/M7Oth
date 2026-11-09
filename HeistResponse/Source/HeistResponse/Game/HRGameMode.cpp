#include "Game/HRGameMode.h"
#include "Game/HRGameState.h"
#include "Game/HRPlayerState.h"
#include "Game/HRPlayerController.h"
#include "Character/HRCharacter.h"
#include "Combat/HRHealthComponent.h"
#include "Combat/HRGadgets.h"
#include "Inventory/HRInventoryComponent.h"
#include "Heist/HRLootBag.h"
#include "Heist/HRVault.h"
#include "Heist/HRDoor.h"
#include "Heist/HRExtractionZone.h"
#include "Heist/HRSecurityCamera.h"
#include "AI/HRNPCCharacter.h"
#include "Vehicles/HRVehicle.h"
#include "UI/HRHUD.h"
#include "HeistResponse.h"

#include "GameFramework/PlayerStart.h"
#include "Engine/TargetPoint.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "TimerManager.h"

using namespace HeistRules;

AHRGameMode::AHRGameMode()
{
	PrimaryActorTick.bCanEverTick = true;
	bDelayedStart = true; // WaitingToStart = lobby
	GameStateClass = AHRGameState::StaticClass();
	PlayerStateClass = AHRPlayerState::StaticClass();
	PlayerControllerClass = AHRPlayerController::StaticClass();
	HUDClass = AHRHUD::StaticClass();
	DefaultPawnClass = AHRCharacter::StaticClass();
	bUseSeamlessTravel = true;
	InactivePlayerStateLifeSpan = 300.f; // reconnect window

	PoliceWeapon.WeaponId = TEXT("PoliceCarbine");
	PoliceWeapon.Damage = 24.f;
	PoliceWeapon.RoundsPerMinute = 650.f;
	PoliceWeapon.MagazineSize = 30;
	PoliceWeapon.StartingReserve = 120;
	PoliceWeapon.HipSpreadDegrees = 3.f;

	RobberWeapon.WeaponId = TEXT("RobberSMG");
	RobberWeapon.Damage = 18.f;
	RobberWeapon.RoundsPerMinute = 800.f;
	RobberWeapon.MagazineSize = 32;
	RobberWeapon.StartingReserve = 128;
	RobberWeapon.HipSpreadDegrees = 3.4f;
	RobberWeapon.Range = 5000.f;
	RobberWeapon.FalloffStart = 1500.f;
}

AHRGameState* AHRGameMode::GetHRGameState() const { return GetGameState<AHRGameState>(); }
float AHRGameMode::ServerNow() const { const AHRGameState* GS = GetHRGameState(); return GS ? GS->GetServerNow() : GetWorld()->GetTimeSeconds(); }

EHRTeam AHRGameMode::TeamOf(const AController* C) const
{
	const AHRPlayerState* PS = C ? C->GetPlayerState<AHRPlayerState>() : nullptr;
	return PS ? PS->GetTeam() : EHRTeam::None;
}

// ============================================================================ Setup / lobby

void AHRGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	bSoloTest = UGameplayStatics::HasOption(Options, TEXT("Solo"));
	if (UGameplayStatics::HasOption(Options, TEXT("ShortMatch")))
	{
		PreparationSeconds = 10.f;
		MainClockSeconds = 300.f;
		ResponseClockSeconds = 180.f;
		MinResponseSeconds = 90.f;
	}

	MatchConfig.PreparationSeconds = PreparationSeconds;
	MatchConfig.MainClockSeconds = MainClockSeconds;
	MatchConfig.ResponseClockSeconds = ResponseClockSeconds;
	MatchConfig.MinResponseSeconds = MinResponseSeconds;
	MatchConfig.TargetLootFraction = TargetLootFraction;
	MatchConfig.MinPlayersPerTeamToStart = MinPlayersPerTeam;
	Alarm.Config.DispatchDelaySeconds = DispatchDelaySeconds;
	Alarm.Config.VaultDispatchDelaySeconds = VaultDispatchDelaySeconds;
	Ledger.MaxBagsPerPlayer = 1;
}

FString AHRGameMode::InitNewPlayer(APlayerController* NewPlayerController, const FUniqueNetIdRepl& UniqueId, const FString& Options, const FString& Portal)
{
	const FString Result = Super::InitNewPlayer(NewPlayerController, UniqueId, Options, Portal);
	if (AHRPlayerState* PS = NewPlayerController ? NewPlayerController->GetPlayerState<AHRPlayerState>() : nullptr)
	{
		const FString Team = UGameplayStatics::ParseOption(Options, TEXT("Team"));
		PS->PreferredTeam = Team.Equals(TEXT("Police"), ESearchCase::IgnoreCase) ? EHRTeam::Police
			: (Team.Equals(TEXT("Robbers"), ESearchCase::IgnoreCase) ? EHRTeam::Robbers : EHRTeam::None);
	}
	return Result;
}

void AHRGameMode::PostLogin(APlayerController* NewPlayer)
{
	Super::PostLogin(NewPlayer);
	AHRPlayerState* PS = NewPlayer ? NewPlayer->GetPlayerState<AHRPlayerState>() : nullptr;
	AHRGameState* GS = GetHRGameState();
	if (!PS || !GS) { return; }
	GS->MaxPlayersPerTeam = MaxPlayersPerTeam;

	if (PS->GetTeam() == EHRTeam::None) // reconnecting players keep their team (OverrideWith)
	{
		const ETeam T = ChooseTeamForNewPlayer(GS->CountTeam(EHRTeam::Police), GS->CountTeam(EHRTeam::Robbers), MaxPlayersPerTeam, ToRules(PS->PreferredTeam));
		if (T == ETeam::None)
		{
			// Match full: join as spectator.
			MoveToSpectator(NewPlayer);
			return;
		}
		PS->SetTeam(FromRules(T));
	}
	UE_LOG(LogHeist, Log, TEXT("PostLogin %s -> team %d"), *PS->GetPlayerName(), static_cast<int32>(PS->GetTeam()));
}

void AHRGameMode::Logout(AController* Exiting)
{
	if (AHRCharacter* Ch = Exiting ? Cast<AHRCharacter>(Exiting->GetPawn()) : nullptr)
	{
		DropBagFrom(Ch, false);
		if (Ch->GetCurrentVehicle()) { Ch->GetCurrentVehicle()->ServerRemoveOccupant(Ch); }
	}
	if (AHRVehicle* V = Exiting ? Cast<AHRVehicle>(Exiting->GetPawn()) : nullptr)
	{
		V->ServerDriverDisconnected();
	}
	if (const AHRPlayerState* PS = Exiting ? Exiting->GetPlayerState<AHRPlayerState>() : nullptr)
	{
		Ledger.DropAllCarriedBy(PS->GetPlayerId());
		RefreshLootState();
	}
	RespawnTimers.Remove(Exiting);
	Super::Logout(Exiting);
}

UClass* AHRGameMode::GetDefaultPawnClassForController_Implementation(AController* InController)
{
	if (!CharacterClass.IsNull())
	{
		if (UClass* C = CharacterClass.LoadSynchronous()) { return C; }
	}
	return Super::GetDefaultPawnClassForController_Implementation(InController);
}

AActor* AHRGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
	const AHRPlayerState* PS = Player ? Player->GetPlayerState<AHRPlayerState>() : nullptr;
	FName Tag = NAME_None;
	if (PS)
	{
		if (PS->IsArrested()) { Tag = HRTags::HoldingCell; }
		else if (PS->GetTeam() == EHRTeam::Police) { Tag = (GetHRGameState() && GetHRGameState()->bAlarmRaised) ? HRTags::PoliceRespawn : HRTags::PoliceStart; }
		else if (PS->GetTeam() == EHRTeam::Robbers) { Tag = HRTags::RobberStart; }
	}
	TArray<APlayerStart*> Free, Any;
	for (TActorIterator<APlayerStart> It(GetWorld()); It; ++It)
	{
		APlayerStart* S = *It;
		if (S->PlayerStartTag != Tag && !(Tag == HRTags::PoliceRespawn && S->PlayerStartTag == HRTags::PoliceStart)) { continue; }
		Any.Add(S);
		TArray<AActor*> Overlaps;
		S->GetOverlappingActors(Overlaps, APawn::StaticClass());
		if (Overlaps.Num() == 0) { Free.Add(S); }
	}
	if (Free.Num() > 0) { return Free[FMath::RandRange(0, Free.Num() - 1)]; }
	if (Any.Num() > 0) { return Any[FMath::RandRange(0, Any.Num() - 1)]; }
	return Super::ChoosePlayerStart_Implementation(Player);
}

void AHRGameMode::RestartPlayer(AController* NewPlayer)
{
	const AHRPlayerState* PS = NewPlayer ? NewPlayer->GetPlayerState<AHRPlayerState>() : nullptr;
	if (PS && (PS->HasEscaped() || PS->GetTeam() == EHRTeam::None))
	{
		MoveToSpectator(NewPlayer);
		return;
	}
	Super::RestartPlayer(NewPlayer);
}

bool AHRGameMode::CanSpectate_Implementation(APlayerController* Viewer, APlayerState* ViewTarget)
{
	// Spectators that belong to a team may only watch teammates (no ghosting the enemy).
	const EHRTeam ViewerTeam = TeamOf(Viewer);
	const AHRPlayerState* Target = Cast<AHRPlayerState>(ViewTarget);
	if (!Target || Target->IsOnlyASpectator()) { return false; }
	if (ViewerTeam == EHRTeam::None) { return true; }
	return Target->GetTeam() == ViewerTeam && !Target->HasEscaped();
}

void AHRGameMode::RequestTeamChange(AHRPlayerController* PC, EHRTeam Desired)
{
	AHRPlayerState* PS = PC ? PC->GetPlayerState<AHRPlayerState>() : nullptr;
	AHRGameState* GS = GetHRGameState();
	if (!PS || !GS || GetMatchState() != MatchState::WaitingToStart || PS->GetTeam() == Desired) { return; }
	const int32 P = GS->CountTeam(EHRTeam::Police);
	const int32 R = GS->CountTeam(EHRTeam::Robbers);
	const bool bAllowed = (PS->GetTeam() == EHRTeam::None)
		? (Desired == EHRTeam::Police ? P < MaxPlayersPerTeam : R < MaxPlayersPerTeam)
		: CanSwitchTeam(ToRules(PS->GetTeam()), P, R, MaxPlayersPerTeam) || bSoloTest;
	if (!bAllowed)
	{
		PC->ClientNotify(TEXT("Lobby.TeamUnbalanced"), FString(), EHRNotifyType::Warning);
		return;
	}
	PS->SetTeam(Desired);
	PS->SetReady(false);
}

void AHRGameMode::SetPlayerReady(AHRPlayerController* PC, bool bReady)
{
	if (AHRPlayerState* PS = PC ? PC->GetPlayerState<AHRPlayerState>() : nullptr)
	{
		if (GetMatchState() == MatchState::WaitingToStart) { PS->SetReady(bReady); }
	}
}

void AHRGameMode::TickLobby()
{
	AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }
	const int32 P = GS->CountTeam(EHRTeam::Police);
	const int32 R = GS->CountTeam(EHRTeam::Robbers);
	int32 Ready = 0, Total = 0;
	for (APlayerState* Raw : GS->PlayerArray)
	{
		const AHRPlayerState* PS = Cast<AHRPlayerState>(Raw);
		if (!PS || PS->GetTeam() == EHRTeam::None) { continue; }
		++Total;
		Ready += PS->IsReady() ? 1 : 0;
	}
	const bool bTeamsOk = bSoloTest ? Total >= 1 : (P >= MinPlayersPerTeam && R >= MinPlayersPerTeam);
	const bool bEnoughReady = Total > 0 && Ready * 2 > Total; // majority ready starts the countdown
	if (bTeamsOk && bEnoughReady)
	{
		if (GS->LobbyCountdownEnd <= 0.f) { GS->LobbyCountdownEnd = ServerNow() + (Ready == Total ? 3.f : LobbyCountdownSeconds); }
		else if (Ready == Total) { GS->LobbyCountdownEnd = FMath::Min(GS->LobbyCountdownEnd, ServerNow() + 3.f); }
	}
	else
	{
		GS->LobbyCountdownEnd = 0.f;
	}
}

bool AHRGameMode::ReadyToStartMatch_Implementation()
{
	const AHRGameState* GS = GetHRGameState();
	return GS && GS->LobbyCountdownEnd > 0.f && ServerNow() >= GS->LobbyCountdownEnd;
}

void AHRGameMode::HandleMatchHasStarted()
{
	Super::HandleMatchHasStarted(); // spawns all players
	AHRGameState* GS = GetHRGameState();

	// Bank location for dispatch / truce perimeter.
	for (TActorIterator<AHRVault> It(GetWorld()); It; ++It) { GS->IncidentLocation = It->GetActorLocation(); break; }
	for (TActorIterator<ATargetPoint> It(GetWorld()); It; ++It)
	{
		if (It->Tags.Contains(HRTags::BankIncident)) { GS->IncidentLocation = It->GetActorLocation(); break; }
	}

	// Alternative extraction objectives: activate a random subset.
	TArray<AHRExtractionZone*> Zones;
	for (TActorIterator<AHRExtractionZone> It(GetWorld()); It; ++It) { Zones.Add(*It); }
	for (int32 i = Zones.Num() - 1; i > 0; --i) { Zones.Swap(i, FMath::RandRange(0, i)); }
	for (int32 i = 0; i < Zones.Num(); ++i) { Zones[i]->ServerSetActive(i < FMath::Max(1, ActiveExtractionZones)); }

	SetPhase(EHRMatchPhase::Preparation, PreparationSeconds);
	RefreshLootState();
	NotifyTeam(EHRTeam::Robbers, TEXT("Notify.PrepRobbers"), EHRNotifyType::Objective);
	NotifyTeam(EHRTeam::Police, TEXT("Notify.PrepPolice"), EHRNotifyType::Objective);
}

void AHRGameMode::SetPhase(EHRMatchPhase Phase, float Duration)
{
	if (AHRGameState* GS = GetHRGameState()) { GS->ServerSetPhase(Phase, Duration); }
}

void AHRGameMode::BeginInfiltration()
{
	SetPhase(EHRMatchPhase::Infiltration, MainClockSeconds);
	NotifyTeam(EHRTeam::Robbers, TEXT("Notify.InfiltrationRobbers"), EHRNotifyType::Objective);
	NotifyTeam(EHRTeam::Police, TEXT("Notify.InfiltrationPolice"), EHRNotifyType::Objective);
}

// ============================================================================ Tick

void AHRGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }

	if (GetMatchState() == MatchState::WaitingToStart) { TickLobby(); return; }
	if (GetMatchState() != MatchState::InProgress) { return; }

	const float Now = ServerNow();
	switch (GS->Phase)
	{
	case EHRMatchPhase::Preparation:
		if (Now >= GS->PhaseEndServerTime) { BeginInfiltration(); }
		return;
	case EHRMatchPhase::Infiltration:
	case EHRMatchPhase::Response:
		break;
	default:
		return;
	}

	if (Alarm.Tick(DeltaSeconds)) { OnPoliceDispatched(); }
	GS->Suspicion01 = Alarm.Suspicion() / FMath::Max(1.f, Alarm.Config.SuspicionThreshold);
	if (!bSuspicionReportSent && !Alarm.IsRaised() && GS->Suspicion01 >= 0.5f)
	{
		bSuspicionReportSent = true;
		NotifyTeam(EHRTeam::Police, TEXT("Notify.SuspiciousReport"), EHRNotifyType::Dispatch);
		NotifyTeam(EHRTeam::Robbers, TEXT("Notify.SuspicionHigh"), EHRNotifyType::Warning);
	}
	if (Alarm.IsRaised() && !bPoliceIntelSent && Now - AlarmServerTime >= PoliceIntelDelaySeconds)
	{
		bPoliceIntelSent = true;
		for (TActorIterator<AHRExtractionZone> It(GetWorld()); It; ++It) { if (It->IsActive()) { It->ServerRevealToPolice(); } }
		NotifyTeam(EHRTeam::Police, TEXT("Notify.PoliceIntelZones"), EHRNotifyType::Dispatch);
	}

	if (Negotiation.Tick(Now))
	{
		NotifyAll(TEXT("Negotiation.Expired"), EHRNotifyType::Negotiation);
	}
	UpdateNegotiationLine();
	EnforceTruce();
	RefreshNegotiationView();

	EvaluateMatch(DeltaSeconds);
}

FMatchSnapshot AHRGameMode::BuildSnapshot() const
{
	FMatchSnapshot S;
	S.Loot = Ledger.Totals();
	const AHRGameState* GS = GetHRGameState();
	if (GS)
	{
		for (APlayerState* Raw : GS->PlayerArray)
		{
			const AHRPlayerState* PS = Cast<AHRPlayerState>(Raw);
			if (!PS || PS->IsOnlyASpectator()) { continue; }
			if (PS->GetTeam() == EHRTeam::Police) { ++S.PoliceConnected; }
			else if (PS->GetTeam() == EHRTeam::Robbers)
			{
				++S.RobbersConnected;
				if (PS->HasEscaped()) { ++S.RobbersEscaped; }
				else if (PS->IsArrested()) { ++S.RobbersArrested; }
				else { ++S.RobbersInPlay; }
			}
		}
		// Disconnected-but-inactive robbers that already escaped still count for the team.
		for (APlayerState* Raw : InactivePlayerArray)
		{
			const AHRPlayerState* PS = Cast<AHRPlayerState>(Raw);
			if (PS && PS->GetTeam() == EHRTeam::Robbers)
			{
				if (PS->HasEscaped()) { ++S.RobbersEscaped; }
				else if (PS->IsArrested()) { ++S.RobbersArrested; }
			}
		}
		S.TimeRemaining = (GS->Phase == EHRMatchPhase::Infiltration || GS->Phase == EHRMatchPhase::Response) ? GS->PhaseEndServerTime - ServerNow() : 1.f;
	}
	S.PoliceAbsentSeconds = PoliceAbsent;
	S.RobbersAbsentSeconds = RobbersAbsent;
	S.bRobbersSurrendered = false;
	S.bHeistStarted = bHeistStarted;
	return S;
}

void AHRGameMode::EvaluateMatch(float DeltaSeconds)
{
	FMatchSnapshot S = BuildSnapshot();
	PoliceAbsent = S.PoliceConnected == 0 ? PoliceAbsent + DeltaSeconds : 0.f;
	RobbersAbsent = S.RobbersConnected == 0 ? RobbersAbsent + DeltaSeconds : 0.f;
	S.PoliceAbsentSeconds = PoliceAbsent;
	S.RobbersAbsentSeconds = RobbersAbsent;
	if (bSoloTest)
	{
		// Solo test sessions never forfeit.
		S.PoliceAbsentSeconds = 0.f;
		S.RobbersAbsentSeconds = 0.f;
		if (S.PoliceConnected == 0) { S.PoliceConnected = 1; }
		if (S.RobbersConnected == 0) { S.RobbersConnected = 1; }
	}
	FMatchOutcome O = EvaluateOutcome(MatchConfig, S);
	if (O.IsDecided())
	{
		if (bRobbersSurrendered && O.Winner == EMatchWinner::Police) { O.Reason = EMatchEndReason::RobbersSurrendered; }
		EndHeist(O);
	}
}

void AHRGameMode::EndHeist(const FMatchOutcome& Outcome)
{
	AHRGameState* GS = GetHRGameState();
	if (!GS || GS->Phase == EHRMatchPhase::Ended) { return; }
	GS->Winner = static_cast<EHRMatchWinner>(Outcome.Winner);
	GS->EndReason = static_cast<EHRMatchEndReason>(Outcome.Reason);
	GS->RematchDecisionServerTime = ServerNow() + PostMatchSeconds;
	Negotiation.Close();
	RefreshNegotiationView();
	SetPhase(EHRMatchPhase::Ended, PostMatchSeconds);

	// Team score bonus.
	for (APlayerState* Raw : GS->PlayerArray)
	{
		if (AHRPlayerState* PS = Cast<AHRPlayerState>(Raw))
		{
			const bool bWon = (GS->Winner == EHRMatchWinner::Police && PS->GetTeam() == EHRTeam::Police) || (GS->Winner == EHRMatchWinner::Robbers && PS->GetTeam() == EHRTeam::Robbers);
			if (bWon) { PS->AddScore(500); }
		}
	}
	for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
	{
		if (AHRPlayerController* PC = Cast<AHRPlayerController>(It->Get())) { PC->ClientMatchEnded(); }
	}
	UE_LOG(LogHeist, Log, TEXT("Match ended: winner=%d reason=%d secured=%d/%d"), static_cast<int32>(GS->Winner), static_cast<int32>(GS->EndReason), GS->SecuredLootValue, GS->TargetLootValue);
	GetWorldTimerManager().SetTimer(PostMatchTimer, this, &AHRGameMode::FinishPostMatch, PostMatchSeconds, false);
}

void AHRGameMode::VoteRematch(AHRPlayerController* PC)
{
	AHRGameState* GS = GetHRGameState();
	AHRPlayerState* PS = PC ? PC->GetPlayerState<AHRPlayerState>() : nullptr;
	if (!GS || !PS || GS->Phase != EHRMatchPhase::Ended) { return; }
	PS->SetVotedRematch(true);
	int32 Votes = 0;
	for (APlayerState* Raw : GS->PlayerArray) { if (const AHRPlayerState* P = Cast<AHRPlayerState>(Raw)) { Votes += P->HasVotedRematch() ? 1 : 0; } }
	if (Votes == GS->PlayerArray.Num()) { FinishPostMatch(); }
}

void AHRGameMode::FinishPostMatch()
{
	if (bPostMatchDone) { return; }
	bPostMatchDone = true;
	GetWorldTimerManager().ClearTimer(PostMatchTimer);
	const AHRGameState* GS = GetHRGameState();
	int32 Votes = 0;
	for (APlayerState* Raw : GS->PlayerArray) { if (const AHRPlayerState* P = Cast<AHRPlayerState>(Raw)) { Votes += P->HasVotedRematch() ? 1 : 0; } }
	if (Votes * 2 > GS->PlayerArray.Num() || GetNetMode() == NM_DedicatedServer)
	{
		RestartGame(); // seamless travel back into the same map; teams re-balanced in PostLogin/Lobby
	}
	else
	{
		ReturnToMainMenuHost();
	}
}

// ============================================================================ Loot

int32 AHRGameMode::RegisterLootBag(int32 Value)
{
	const int32 Id = Ledger.AddBag(Value);
	LedgerValue.Add(Id, Value);
	RefreshLootState();
	return Id;
}

int32 AHRGameMode::RegisterVehicle(AHRVehicle* Vehicle)
{
	const int32 Id = NextVehicleId++;
	Vehicles.Add(Id, Vehicle);
	return Id;
}

AHRLootBag* AHRGameMode::SpawnBagActor(int32 LedgerId, const FVector& Location)
{
	UClass* Cls = LootBagClass.IsNull() ? AHRLootBag::StaticClass() : LootBagClass.LoadSynchronous();
	if (!Cls) { Cls = AHRLootBag::StaticClass(); }
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AHRLootBag* Bag = GetWorld()->SpawnActor<AHRLootBag>(Cls, Location, FRotator::ZeroRotator, P);
	if (Bag)
	{
		Bag->LedgerId = LedgerId;
		Bag->Value = LedgerValue.FindRef(LedgerId);
		BagActors.Add(LedgerId, Bag);
	}
	return Bag;
}

bool AHRGameMode::GiveLootBagFromSource(AHRCharacter* Robber, int32 LedgerId, const FVector& SpawnLocation)
{
	const AHRPlayerState* PS = Robber ? Robber->GetHRPlayerState() : nullptr;
	if (!PS || Robber->IsCarryingBag()) { return false; }
	if (Ledger.PickUp(LedgerId, PS->GetPlayerId(), ETeam::Robbers) != ELootResult::Ok) { return false; }
	AHRLootBag* Bag = SpawnBagActor(LedgerId, SpawnLocation);
	if (!Bag)
	{
		Ledger.Drop(LedgerId, PS->GetPlayerId());
		return false;
	}
	Bag->AttachToCarrier(Robber);
	Robber->ServerSetCarriedBag(Bag);
	bHeistStarted = true;
	RefreshLootState();
	return true;
}

void AHRGameMode::PickUpDroppedBag(AHRCharacter* By, AHRLootBag* Bag)
{
	AHRPlayerState* PS = By ? By->GetHRPlayerState() : nullptr;
	if (!PS || !Bag) { return; }
	const ELootResult R = Ledger.PickUp(Bag->LedgerId, PS->GetPlayerId(), ToRules(PS->GetTeam()));
	if (R != ELootResult::Ok) { return; }
	if (PS->GetTeam() == EHRTeam::Police)
	{
		PS->MutableStats().LootRecovered += Bag->Value;
		PS->AddScore(Bag->Value / 250);
		BagActors.Remove(Bag->LedgerId);
		Bag->Destroy();
		NotifyAll(TEXT("Notify.BagRecovered"), EHRNotifyType::Info, PS->GetPlayerName());
	}
	else
	{
		Bag->AttachToCarrier(By);
		By->ServerSetCarriedBag(Bag);
	}
	RefreshLootState();
}

void AHRGameMode::DropBagFrom(AHRCharacter* Carrier, bool bThrow)
{
	AHRLootBag* Bag = Carrier ? Carrier->GetCarriedBag() : nullptr;
	const AHRPlayerState* PS = Carrier ? Carrier->GetHRPlayerState() : nullptr;
	if (!Bag || !PS) { return; }
	if (Ledger.Drop(Bag->LedgerId, PS->GetPlayerId()) != ELootResult::Ok)
	{
		UE_LOG(LogHeist, Warning, TEXT("DropBagFrom: ledger refused drop of bag %d"), Bag->LedgerId);
		return;
	}
	Carrier->ServerSetCarriedBag(nullptr);
	const FVector Fwd = Carrier->GetBaseAimRotation().Vector();
	const FVector Loc = Carrier->GetActorLocation() + Carrier->GetActorForwardVector() * 60.f + FVector(0.f, 0.f, 20.f);
	const FVector Impulse = bThrow ? (Fwd * 650.f + FVector(0.f, 0.f, 250.f)) : FVector::ZeroVector;
	Bag->DetachAndDrop(Loc, Impulse);
	RefreshLootState();
}

void AHRGameMode::TrunkAction(AHRCharacter* By, AHRVehicle* Vehicle)
{
	AHRPlayerState* PS = By ? By->GetHRPlayerState() : nullptr;
	if (!PS || !Vehicle) { return; }
	if (PS->GetTeam() == EHRTeam::Robbers && By->IsCarryingBag())
	{
		AHRLootBag* Bag = By->GetCarriedBag();
		if (Ledger.StoreInVehicle(Bag->LedgerId, PS->GetPlayerId(), Vehicle->VehicleLedgerId) == ELootResult::Ok)
		{
			Vehicle->ServerAddTrunkBag(Bag->LedgerId);
			By->ServerSetCarriedBag(nullptr);
			BagActors.Remove(Bag->LedgerId);
			Bag->Destroy();
		}
	}
	else if (PS->GetTeam() == EHRTeam::Robbers && Vehicle->GetTrunkCount() > 0)
	{
		const int32 Id = Vehicle->ServerPeekTrunkBag();
		if (Ledger.PickUp(Id, PS->GetPlayerId(), ETeam::Robbers) == ELootResult::Ok)
		{
			Vehicle->ServerRemoveTrunkBag(Id);
			if (AHRLootBag* Bag = SpawnBagActor(Id, Vehicle->GetActorLocation()))
			{
				Bag->AttachToCarrier(By);
				By->ServerSetCarriedBag(Bag);
			}
		}
	}
	else if (PS->GetTeam() == EHRTeam::Police && Vehicle->GetTrunkCount() > 0 && !Vehicle->IsMoving())
	{
		while (Vehicle->GetTrunkCount() > 0)
		{
			const int32 Id = Vehicle->ServerPeekTrunkBag();
			Vehicle->ServerRemoveTrunkBag(Id);
			if (Ledger.PickUp(Id, PS->GetPlayerId(), ETeam::Police) == ELootResult::Ok)
			{
				PS->MutableStats().LootRecovered += LedgerValue.FindRef(Id);
			}
		}
		NotifyAll(TEXT("Notify.TrunkRecovered"), EHRNotifyType::Info, PS->GetPlayerName());
	}
	RefreshLootState();
}

void AHRGameMode::OnVehicleWrecked(AHRVehicle* Vehicle)
{
	if (!Vehicle) { return; }
	// Trunk contents stay in the trunk (players can still take them out) - the car is just immobile.
	NotifyAll(TEXT("Notify.VehicleDisabled"), EHRNotifyType::Warning);
}

void AHRGameMode::RefreshLootState()
{
	AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }
	const FLootTotals T = Ledger.Totals();
	GS->TotalLootValue = static_cast<int32>(T.Total);
	GS->TargetLootValue = static_cast<int32>(TargetLootValue(MatchConfig, T));
	GS->SecuredLootValue = static_cast<int32>(T.Secured);
	GS->RecoveredLootValue = static_cast<int32>(T.Recovered);
	ensureMsgf(Ledger.CheckInvariants(), TEXT("Loot ledger invariant violated"));
}

// ============================================================================ Alarm / security

void AHRGameMode::AddSuspicion(float Amount, AHRCharacter* Robber, AActor* Source)
{
	const AHRGameState* GS = GetHRGameState();
	if (!GS || GS->Phase != EHRMatchPhase::Infiltration) { return; }
	if (Alarm.AddSuspicion(Amount)) { OnAlarmRaisedInternal(EHRAlarmReason::Suspicion); }
}

void AHRGameMode::RaiseAlarm(EHRAlarmReason Reason, const FVector& Location)
{
	const AHRGameState* GS = GetHRGameState();
	if (!GS || (GS->Phase != EHRMatchPhase::Infiltration && GS->Phase != EHRMatchPhase::Response)) { return; }
	if (Alarm.Raise(static_cast<EAlarmReason>(Reason))) { OnAlarmRaisedInternal(Reason); }
}

void AHRGameMode::OnVaultOpened(AHRVault* Vault, AHRCharacter* By)
{
	AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }
	bHeistStarted = true;
	GS->bVaultOpened = true;
	// MANDATORY RULE: the vault opening always raises the alarm. This bypasses the phase check on
	// purpose: even a vault opened during Preparation (debug) triggers it.
	const bool bNew = Alarm.Raise(EAlarmReason::VaultOpened);
	if (bNew)
	{
		if (GS->Phase == EHRMatchPhase::Preparation) { BeginInfiltration(); }
		OnAlarmRaisedInternal(EHRAlarmReason::VaultOpened);
	}
	NotifyAll(TEXT("Notify.VaultOpened"), EHRNotifyType::Alarm);
	if (By) { if (AHRPlayerState* PS = By->GetHRPlayerState()) { PS->AddScore(150); } }
}

void AHRGameMode::OnAlarmRaisedInternal(EHRAlarmReason Reason)
{
	AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }
	bHeistStarted = true;
	AlarmServerTime = ServerNow();
	GS->bAlarmRaised = true;
	GS->AlarmReason = Reason;
	GS->DispatchServerTime = ServerNow() + Alarm.TimeUntilDispatch();
	const float Remaining = ClampClockOnAlarm(MatchConfig, GS->GetPhaseTimeRemaining());
	SetPhase(EHRMatchPhase::Response, Remaining);
	GS->ServerAlarmUpdated();

	NotifyTeam(EHRTeam::Robbers, TEXT("Notify.AlarmRobbers"), EHRNotifyType::Alarm);
	NotifyTeam(EHRTeam::Police, TEXT("Notify.AlarmPolice"), EHRNotifyType::Alarm);
	for (TActorIterator<AHRNPCCharacter> It(GetWorld()); It; ++It) { It->ServerOnAlarm(); }
	UpdateNegotiationLine();
	UE_LOG(LogHeist, Log, TEXT("ALARM raised (reason %d), dispatch in %.1fs"), static_cast<int32>(Reason), Alarm.TimeUntilDispatch());
}

void AHRGameMode::OnPoliceDispatched()
{
	AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }
	GS->bPoliceDispatched = true;
	GS->ServerAlarmUpdated();
	for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
	{
		AHRPlayerController* PC = Cast<AHRPlayerController>(It->Get());
		if (PC && TeamOf(PC) == EHRTeam::Police) { PC->ClientOnDispatch(GS->IncidentLocation); }
	}
	NotifyTeam(EHRTeam::Robbers, TEXT("Notify.PoliceEnRoute"), EHRNotifyType::Warning);
}

void AHRGameMode::NotifyVaultDrillStarted(AHRCharacter* By)
{
	bHeistStarted = true;
	NotifyTeam(EHRTeam::Robbers, TEXT("Notify.DrillStarted"), EHRNotifyType::Objective);
}

void AHRGameMode::NotifyVaultDrillDisabled(AHRCharacter* By)
{
	NotifyAll(TEXT("Notify.DrillDisabled"), EHRNotifyType::Warning);
	if (By) { if (AHRPlayerState* PS = By->GetHRPlayerState()) { PS->AddScore(100); } }
}

void AHRGameMode::NotifyGunfire(AHRCharacter* Shooter, const FVector& Location)
{
	const AHRGameState* GS = GetHRGameState();
	if (!GS || GS->Phase != EHRMatchPhase::Infiltration) { return; }
	RaiseAlarm(EHRAlarmReason::Gunfire, Location);
	for (TActorIterator<AHRNPCCharacter> It(GetWorld()); It; ++It) { It->ServerOnHeardNoise(Location, 1.f); }
}

void AHRGameMode::NotifyNoise(AHRCharacter* Source, const FVector& Location, float Loudness01)
{
	const float HearRadius = 400.f + 2600.f * Loudness01;
	bool bWitnessed = false;
	for (TActorIterator<AHRNPCCharacter> It(GetWorld()); It; ++It)
	{
		if (FVector::DistSquared(It->GetActorLocation(), Location) < FMath::Square(HearRadius))
		{
			It->ServerOnHeardNoise(Location, Loudness01);
			bWitnessed = true;
		}
	}
	AddSuspicion((bWitnessed ? 60.f : 12.f) * Loudness01, Source, nullptr);
}

void AHRGameMode::NotifyRestrictedAccess(AHRCharacter* Robber, const FVector& Location)
{
	for (TActorIterator<AHRNPCCharacter> It(GetWorld()); It; ++It)
	{
		if (It->CanSee(Robber)) { AddSuspicion(It->IsGuard() ? 30.f : 12.f, Robber, *It); }
	}
}

void AHRGameMode::NotifyMaskChanged(AHRCharacter* Robber)
{
	// NPC perception picks up masked robbers on its own; masking in plain view is an instant spike.
	if (!Robber || !Robber->IsMasked()) { return; }
	for (TActorIterator<AHRNPCCharacter> It(GetWorld()); It; ++It)
	{
		if (It->CanSee(Robber)) { AddSuspicion(25.f, Robber, *It); It->ServerOnThreatSeen(Robber); }
	}
}

void AHRGameMode::NotifyShout(AHRCharacter* Shouter)
{
	if (!Shouter) { return; }
	for (TActorIterator<AHRNPCCharacter> It(GetWorld()); It; ++It)
	{
		if (FVector::DistSquared(It->GetActorLocation(), Shouter->GetActorLocation()) < FMath::Square(1400.f) && It->CanSee(Shouter))
		{
			It->ServerOnShout(Shouter);
		}
	}
	// Police officers who spot armed, masked robbers can call it in before any alarm.
	if (Shouter->IsPolice() && !Alarm.IsRaised())
	{
		for (TActorIterator<AHRCharacter> It(GetWorld()); It; ++It)
		{
			AHRCharacter* R = *It;
			if (!R->IsRobber() || !R->IsVisiblyHostile()) { continue; }
			if (FVector::DistSquared(R->GetActorLocation(), Shouter->GetActorLocation()) > FMath::Square(2500.f)) { continue; }
			FHitResult Hit;
			FCollisionQueryParams Params(SCENE_QUERY_STAT(HRPoliceReport), false, Shouter);
			if (!GetWorld()->LineTraceSingleByChannel(Hit, Shouter->GetEyeLocation(), R->GetEyeLocation(), ECC_Visibility, Params) || Hit.GetActor() == R)
			{
				RaiseAlarm(EHRAlarmReason::Manual, R->GetActorLocation());
				break;
			}
		}
	}
}

void AHRGameMode::NotifyDoorUnlocked(AHRDoor* Door, AHRCharacter* By)
{
	if (!Door || !By) { return; }
	if (By->IsRobber())
	{
		if (AHRPlayerState* PS = By->GetHRPlayerState()) { PS->MutableStats().LocksPicked++; PS->AddScore(25); }
		if (Door->bIsHoldingCell) { ReleaseArrestedRobbers(By); }
		if (Door->bRestricted) { NotifyRestrictedAccess(By, Door->GetActorLocation()); }
	}
}

void AHRGameMode::NotifyCameraDestroyed(AHRSecurityCamera* Camera, AController* By)
{
	AddSuspicion(20.f, By ? Cast<AHRCharacter>(By->GetPawn()) : nullptr, Camera);
}

void AHRGameMode::NotifyCamerasLooped(AHRCharacter* By)
{
	NotifyTeam(EHRTeam::Robbers, TEXT("Notify.CamerasLooped"), EHRNotifyType::Objective);
}

// ============================================================================ Combat / arrests

bool AHRGameMode::ShouldApplyDamage(AController* Instigator, AHRCharacter* Victim) const
{
	const AHRGameState* GS = GetHRGameState();
	if (!GS || !Victim) { return false; }
	if (GS->Phase != EHRMatchPhase::Infiltration && GS->Phase != EHRMatchPhase::Response) { return false; }
	if (Victim->IsArrested()) { return false; }
	const EHRTeam A = TeamOf(Instigator);
	if (A != EHRTeam::None && A == Victim->GetTeam()) { return false; } // no friendly fire
	return true;
}

void AHRGameMode::NotifyDamage(AController* Instigator, AHRCharacter* Victim, float Amount)
{
	const EHRTeam A = TeamOf(Instigator);
	if (!Alarm.IsRaised()) { RaiseAlarm(EHRAlarmReason::Gunfire, Victim ? Victim->GetActorLocation() : FVector::ZeroVector); }
	if (A != EHRTeam::None && Negotiation.ReportViolation(ToRules(A), ServerNow()))
	{
		NotifyAll(A == EHRTeam::Police ? TEXT("Negotiation.TruceBrokenPolice") : TEXT("Negotiation.TruceBrokenRobbers"), EHRNotifyType::Negotiation);
		RefreshNegotiationView();
	}
}

void AHRGameMode::NotifyPlayerDowned(AHRCharacter* Victim)
{
	if (!Victim) { return; }
	DropBagFrom(Victim, false);
	if (AHRPlayerState* PS = Victim->GetHRPlayerState()) { PS->MutableStats().TimesDowned++; }
	if (const UHRHealthComponent* H = Victim->GetHealth())
	{
		if (AController* By = H->LastDamageInstigator.Get())
		{
			if (AHRPlayerState* KPS = By->GetPlayerState<AHRPlayerState>()) { KPS->MutableStats().Takedowns++; KPS->AddScore(100); }
		}
	}
	NotifyTeam(Victim->GetTeam(), TEXT("Notify.TeammateDown"), EHRNotifyType::Warning, Victim->GetHRPlayerState() ? Victim->GetHRPlayerState()->GetPlayerName() : FString());
}

void AHRGameMode::NotifyPlayerIncapacitated(AHRCharacter* Victim)
{
	if (!Victim) { return; }
	AController* C = Victim->GetController();
	if (Victim->IsRobber())
	{
		// Bled out robbers are taken into custody (non-lethal presentation).
		ArrestRobber(Victim, nullptr);
		return;
	}
	if (Victim->IsPolice() && C)
	{
		if (AHRPlayerController* PC = Cast<AHRPlayerController>(C)) { PC->ClientNotify(TEXT("Notify.PoliceRespawning"), FString::FromInt(FMath::RoundToInt(PoliceRespawnSeconds)), EHRNotifyType::Info); }
		Victim->DetachFromControllerPendingDestroy();
		Victim->SetLifeSpan(5.f);
		MoveToSpectator(C);
		FTimerHandle& H = RespawnTimers.FindOrAdd(C);
		TWeakObjectPtr<AController> WeakC = C;
		GetWorldTimerManager().SetTimer(H, FTimerDelegate::CreateWeakLambda(this, [this, WeakC]()
		{
			if (AController* Ctrl = WeakC.Get())
			{
				if (APlayerController* PC = Cast<APlayerController>(Ctrl)) { PC->ChangeState(NAME_Playing); PC->ClientGotoState(NAME_Playing); }
				RestartPlayer(Ctrl);
			}
		}), PoliceRespawnSeconds, false);
	}
}

void AHRGameMode::NotifyRevive(AHRCharacter* Reviver, AHRCharacter* Target)
{
	if (AHRPlayerState* PS = Reviver ? Reviver->GetHRPlayerState() : nullptr) { PS->MutableStats().Revives++; PS->AddScore(75); }
}

void AHRGameMode::NotifySurrenderChanged(AHRCharacter* Robber)
{
	if (Robber && Robber->IsSurrendering())
	{
		NotifyTeam(EHRTeam::Police, TEXT("Notify.RobberSurrendering"), EHRNotifyType::Info, Robber->GetHRPlayerState() ? Robber->GetHRPlayerState()->GetPlayerName() : FString());
	}
}

void AHRGameMode::ArrestRobber(AHRCharacter* Robber, AHRCharacter* Officer)
{
	AHRPlayerState* PS = Robber ? Robber->GetHRPlayerState() : nullptr;
	if (!PS || PS->IsArrested()) { return; }
	DropBagFrom(Robber, false);
	Ledger.DropAllCarriedBy(PS->GetPlayerId());
	PS->SetArrested(true);
	Robber->ServerOnArrested();
	if (Officer)
	{
		if (AHRPlayerState* OPS = Officer->GetHRPlayerState()) { OPS->MutableStats().Arrests++; OPS->AddScore(200); }
	}

	// Move to the police station holding cell. Arrested robbers stay in control and can be broken out.
	for (TActorIterator<APlayerStart> It(GetWorld()); It; ++It)
	{
		if (It->PlayerStartTag == HRTags::HoldingCell)
		{
			Robber->TeleportTo(It->GetActorLocation(), It->GetActorRotation(), false, true);
			break;
		}
	}
	NotifyAll(TEXT("Notify.RobberArrested"), EHRNotifyType::Info, PS->GetPlayerName());
	RefreshLootState();
}

void AHRGameMode::ReleaseArrestedRobbers(AHRCharacter* Liberator)
{
	const AHRGameState* GS = GetHRGameState();
	if (!GS || BreakoutsUsed >= MaxBreakouts || GS->Phase != EHRMatchPhase::Response) { return; }
	int32 Freed = 0;
	for (APlayerState* Raw : GS->PlayerArray)
	{
		AHRPlayerState* PS = Cast<AHRPlayerState>(Raw);
		if (!PS || PS->GetTeam() != EHRTeam::Robbers || !PS->IsArrested()) { continue; }
		PS->SetArrested(false);
		if (AHRCharacter* Ch = Cast<AHRCharacter>(PS->GetPawn()))
		{
			Ch->ServerOnReleased();
			Ch->ApplyTeamLoadout();
		}
		++Freed;
	}
	if (Freed > 0)
	{
		++BreakoutsUsed;
		NotifyAll(TEXT("Notify.Breakout"), EHRNotifyType::Alarm);
	}
}

void AHRGameMode::UseGadget(AHRCharacter* User)
{
	if (!User) { return; }
	const AHRGameState* GS = GetHRGameState();
	if (!GS || GS->Phase == EHRMatchPhase::Ended) { return; }
	FActorSpawnParameters P;
	P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	P.Instigator = User;
	const FVector Fwd = User->GetActorForwardVector();

	if (User->IsPolice() && User->GetInventory()->HasItem(HRItems::SpikeStrip))
	{
		FHitResult Hit;
		const FVector Start = User->GetActorLocation() + Fwd * 250.f;
		if (GetWorld()->LineTraceSingleByChannel(Hit, Start + FVector(0, 0, 100), Start - FVector(0, 0, 400), ECC_Visibility))
		{
			UClass* Cls = SpikeStripClass.IsNull() ? AHRSpikeStrip::StaticClass() : SpikeStripClass.LoadSynchronous();
			if (GetWorld()->SpawnActor<AHRSpikeStrip>(Cls ? Cls : AHRSpikeStrip::StaticClass(), Hit.ImpactPoint, FRotator(0.f, User->GetActorRotation().Yaw, 0.f), P))
			{
				User->GetInventory()->ConsumeItem(HRItems::SpikeStrip);
			}
		}
		return;
	}
	if (User->IsRobber() && User->IsMasked() && User->GetInventory()->HasItem(HRItems::SmokeGrenade))
	{
		const FVector Loc = User->GetActorLocation() + User->GetBaseAimRotation().Vector() * 600.f;
		UClass* Cls = SmokeCloudClass.IsNull() ? AHRSmokeCloud::StaticClass() : SmokeCloudClass.LoadSynchronous();
		if (GetWorld()->SpawnActor<AHRSmokeCloud>(Cls ? Cls : AHRSmokeCloud::StaticClass(), Loc, FRotator::ZeroRotator, P))
		{
			User->GetInventory()->ConsumeItem(HRItems::SmokeGrenade);
		}
	}
}

FHRWeaponSpec AHRGameMode::GetWeaponSpecFor(EHRTeam Team) const
{
	return Team == EHRTeam::Police ? PoliceWeapon : RobberWeapon;
}

// ============================================================================ Hostages / negotiation

void AHRGameMode::NotifyHostageTaken(AHRNPCCharacter* Hostage, AHRCharacter* By)
{
	if (!Hostage) { return; }
	Hostages.AddUnique(Hostage);
	if (AHRGameState* GS = GetHRGameState()) { GS->HostagesHeld = Hostages.Num(); }
	if (By) { if (AHRPlayerState* PS = By->GetHRPlayerState()) { PS->MutableStats().HostagesTaken++; } }
	NotifyTeam(EHRTeam::Police, TEXT("Notify.HostageTaken"), EHRNotifyType::Warning);
	UpdateNegotiationLine();
}

void AHRGameMode::NotifyHostageFreed(AHRNPCCharacter* Hostage, AHRCharacter* RescuedBy)
{
	Hostages.Remove(Hostage);
	AHRGameState* GS = GetHRGameState();
	if (GS)
	{
		GS->HostagesHeld = Hostages.Num();
		GS->HostagesRescued++;
	}
	if (RescuedBy && RescuedBy->IsPolice())
	{
		if (AHRPlayerState* PS = RescuedBy->GetHRPlayerState()) { PS->MutableStats().HostagesRescued++; PS->AddScore(150); }
	}
	UpdateNegotiationLine();
}

void AHRGameMode::UpdateNegotiationLine()
{
	const AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }
	const bool bShouldBeOpen = Alarm.IsRaised() && GS->Phase == EHRMatchPhase::Response && (Hostages.Num() > 0 || Negotiation.State() == ENegotiationState::ProposalPending);
	if (bShouldBeOpen && Negotiation.State() == ENegotiationState::Closed)
	{
		Negotiation.Open();
		NotifyAll(TEXT("Negotiation.LineOpen"), EHRNotifyType::Negotiation);
	}
	else if (!bShouldBeOpen && Negotiation.State() == ENegotiationState::Open && !Negotiation.IsTruceActive(ServerNow()))
	{
		Negotiation.Close();
		NotifyAll(TEXT("Negotiation.LineClosed"), EHRNotifyType::Negotiation);
	}
}

void AHRGameMode::ProposeDeal(AHRPlayerController* PC, EHRDealType Deal)
{
	const EHRTeam Team = TeamOf(PC);
	const AHRPlayerState* PS = PC ? PC->GetPlayerState<AHRPlayerState>() : nullptr;
	if (!PS || PS->IsArrested() || PS->HasEscaped()) { return; }
	const ENegotiationResult R = Negotiation.Propose(ToRules(Team), ToRules(Deal), ServerNow(), Hostages.Num());
	if (R != ENegotiationResult::Ok)
	{
		PC->ClientNotify(*FString::Printf(TEXT("NegResult.%d"), static_cast<int32>(R)), FString(), EHRNotifyType::Error);
		return;
	}
	NotifyAll(*FString::Printf(TEXT("Deal.Proposed.%d"), static_cast<int32>(Deal)), EHRNotifyType::Negotiation, PS->GetPlayerName());
	RefreshNegotiationView();
}

void AHRGameMode::RespondToDeal(AHRPlayerController* PC, bool bAccept)
{
	const EHRTeam Team = TeamOf(PC);
	const AHRPlayerState* PS = PC ? PC->GetPlayerState<AHRPlayerState>() : nullptr;
	if (!PS || PS->IsArrested() || PS->HasEscaped()) { return; }
	FDealOutcome Outcome;
	const ENegotiationResult R = Negotiation.Respond(ToRules(Team), bAccept, ServerNow(), Hostages.Num(), Outcome);
	if (R != ENegotiationResult::Ok)
	{
		PC->ClientNotify(*FString::Printf(TEXT("NegResult.%d"), static_cast<int32>(R)), FString(), EHRNotifyType::Error);
		RefreshNegotiationView();
		return;
	}
	if (!bAccept)
	{
		NotifyAll(TEXT("Negotiation.Rejected"), EHRNotifyType::Negotiation, PS->GetPlayerName());
	}
	else
	{
		NotifyAll(*FString::Printf(TEXT("Deal.Accepted.%d"), static_cast<int32>(Outcome.Deal)), EHRNotifyType::Negotiation);
		ApplyDealOutcome(Outcome);
	}
	RefreshNegotiationView();
}

void AHRGameMode::ApplyDealOutcome(const FDealOutcome& Outcome)
{
	AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }
	for (int32 i = 0; i < Outcome.HostagesToRelease && Hostages.Num() > 0; ++i)
	{
		AHRNPCCharacter* H = Hostages.Last();
		H->ServerRelease(nullptr); // calls NotifyHostageFreed
	}
	if (Outcome.TruceSeconds > 0.f) { TruceStartServerTime = ServerNow(); }
	if (Outcome.ClockDeltaSeconds != 0.f) { GS->PhaseEndServerTime += Outcome.ClockDeltaSeconds; }
	if (Outcome.bDeliverGetawayVehicle)
	{
		GetWorldTimerManager().SetTimer(VehicleDeliveryTimer, this, &AHRGameMode::DeliverNegotiatedVehicle, 20.f, false);
		NotifyTeam(EHRTeam::Robbers, TEXT("Notify.VehicleIncoming"), EHRNotifyType::Objective);
	}
	if (Outcome.bRobbersSurrender)
	{
		bRobbersSurrendered = true;
		for (TActorIterator<AHRCharacter> It(GetWorld()); It; ++It)
		{
			if (It->IsRobber() && !It->IsArrested()) { ArrestRobber(*It, nullptr); }
		}
	}
}

void AHRGameMode::DeliverNegotiatedVehicle()
{
	UClass* Cls = NegotiatedVehicleClass.IsNull() ? nullptr : NegotiatedVehicleClass.LoadSynchronous();
	if (!Cls) { UE_LOG(LogHeist, Warning, TEXT("NegotiatedVehicleClass not set")); return; }
	for (TActorIterator<ATargetPoint> It(GetWorld()); It; ++It)
	{
		if (!It->Tags.Contains(HRTags::GetawayDelivery)) { continue; }
		FActorSpawnParameters P;
		P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;
		if (AHRVehicle* V = GetWorld()->SpawnActor<AHRVehicle>(Cls, It->GetActorLocation(), It->GetActorRotation(), P))
		{
			V->OwnerTeam = EHRTeam::Robbers;
			NotifyTeam(EHRTeam::Robbers, TEXT("Notify.VehicleDelivered"), EHRNotifyType::Objective);
		}
		return;
	}
}

void AHRGameMode::EnforceTruce()
{
	const float Now = ServerNow();
	if (!Negotiation.IsTruceActive(Now) || Now - TruceStartServerTime < TruceWithdrawGraceSeconds) { return; }
	const AHRGameState* GS = GetHRGameState();
	for (TActorIterator<AHRCharacter> It(GetWorld()); It; ++It)
	{
		if (It->IsPolice() && It->IsAliveState() && FVector::DistSquared2D(It->GetActorLocation(), GS->IncidentLocation) < FMath::Square(TrucePerimeterRadius))
		{
			if (Negotiation.ReportViolation(ETeam::Police, Now))
			{
				NotifyAll(TEXT("Negotiation.TruceBrokenPolice"), EHRNotifyType::Negotiation);
			}
			return;
		}
	}
}

void AHRGameMode::RefreshNegotiationView()
{
	AHRGameState* GS = GetHRGameState();
	if (!GS) { return; }
	FHRNegotiationView V;
	V.State = static_cast<EHRNegotiationState>(Negotiation.State());
	V.PendingDeal = FromRules(Negotiation.Pending().Deal);
	V.Proposer = FromRules(Negotiation.Pending().Proposer);
	V.ExpiresServerTime = Negotiation.Pending().ExpiresAt;
	V.TruceEndsServerTime = Negotiation.TruceEndsAtTime();
	const float Now = ServerNow();
	V.PoliceCooldownEnds = Now + Negotiation.CooldownRemaining(ETeam::Police, Now);
	V.RobberCooldownEnds = Now + Negotiation.CooldownRemaining(ETeam::Robbers, Now);
	V.AcceptedDeals = Negotiation.AcceptedDeals();
	V.MaxDeals = Negotiation.Config.MaxAcceptedDeals;
	const bool bChanged = V.State != GS->Negotiation.State || V.PendingDeal != GS->Negotiation.PendingDeal || V.AcceptedDeals != GS->Negotiation.AcceptedDeals
		|| !FMath::IsNearlyEqual(V.TruceEndsServerTime, GS->Negotiation.TruceEndsServerTime) || !FMath::IsNearlyEqual(V.ExpiresServerTime, GS->Negotiation.ExpiresServerTime)
		|| !FMath::IsNearlyEqual(V.PoliceCooldownEnds, GS->Negotiation.PoliceCooldownEnds, 0.5f) || !FMath::IsNearlyEqual(V.RobberCooldownEnds, GS->Negotiation.RobberCooldownEnds, 0.5f);
	if (bChanged)
	{
		GS->Negotiation = V;
		GS->ServerNegotiationUpdated();
	}
}

// ============================================================================ Extraction

void AHRGameMode::OnRobberReachedExtraction(AHRCharacter* Robber, AHRExtractionZone* Zone)
{
	const AHRGameState* GS = GetHRGameState();
	AHRPlayerState* PS = Robber ? Robber->GetHRPlayerState() : nullptr;
	if (!GS || !PS || GS->Phase != EHRMatchPhase::Response || PS->IsArrested() || PS->HasEscaped() || !Robber->IsAliveState()) { return; }
	if (AHRLootBag* Bag = Robber->GetCarriedBag())
	{
		if (Ledger.SecureCarried(Bag->LedgerId, PS->GetPlayerId()) == ELootResult::Ok)
		{
			PS->MutableStats().LootSecured += Bag->Value;
			PS->AddScore(Bag->Value / 200);
			Robber->ServerSetCarriedBag(nullptr);
			BagActors.Remove(Bag->LedgerId);
			Bag->Destroy();
		}
	}
	RefreshLootState();
	MarkRobberEscaped(Robber);
}

void AHRGameMode::OnVehicleReachedExtraction(AHRVehicle* Vehicle, AHRExtractionZone* Zone)
{
	const AHRGameState* GS = GetHRGameState();
	if (!GS || !Vehicle || GS->Phase != EHRMatchPhase::Response) { return; }
	TArray<AHRCharacter*> Occupants = Vehicle->GetOccupants();
	bool bAnyRobber = false;
	for (AHRCharacter* C : Occupants) { bAnyRobber |= C && C->IsRobber(); }
	if (!bAnyRobber) { return; }

	const int32 SecuredBefore = static_cast<int32>(Ledger.Totals().Secured);
	Ledger.SecureVehicle(Vehicle->VehicleLedgerId);
	Vehicle->ServerClearTrunk();
	const int32 Gained = static_cast<int32>(Ledger.Totals().Secured) - SecuredBefore;
	TArray<AHRCharacter*> Robbers;
	for (AHRCharacter* C : Occupants) { if (C && C->IsRobber()) { Robbers.Add(C); } }
	for (AHRCharacter* C : Robbers)
	{
		if (AHRPlayerState* PS = C->GetHRPlayerState())
		{
			PS->MutableStats().LootSecured += Gained / FMath::Max(1, Robbers.Num());
			PS->AddScore(Gained / FMath::Max(1, Robbers.Num()) / 200);
		}
	}
	// Carried bags of seated robbers are secured too.
	for (AHRCharacter* C : Robbers)
	{
		if (AHRLootBag* Bag = C->GetCarriedBag())
		{
			if (Ledger.SecureCarried(Bag->LedgerId, C->GetHRPlayerState()->GetPlayerId()) == ELootResult::Ok)
			{
				C->ServerSetCarriedBag(nullptr);
				BagActors.Remove(Bag->LedgerId);
				Bag->Destroy();
			}
		}
	}
	Vehicle->ServerEjectAllForExtraction();
	for (AHRCharacter* C : Robbers) { MarkRobberEscaped(C); }
	RefreshLootState();
}

void AHRGameMode::MarkRobberEscaped(AHRCharacter* Robber)
{
	AHRPlayerState* PS = Robber ? Robber->GetHRPlayerState() : nullptr;
	if (!PS || PS->HasEscaped()) { return; }
	PS->SetEscaped(true);
	PS->AddScore(250);
	NotifyAll(TEXT("Notify.RobberEscaped"), EHRNotifyType::Info, PS->GetPlayerName());
	AController* C = Robber->GetController();
	Robber->DetachFromControllerPendingDestroy();
	Robber->Destroy();
	if (C) { MoveToSpectator(C); }
}

void AHRGameMode::MoveToSpectator(AController* C)
{
	APlayerController* PC = Cast<APlayerController>(C);
	if (!PC) { return; }
	if (APawn* P = PC->GetPawn())
	{
		PC->UnPossess();
		if (P->IsA<AHRCharacter>() && !P->IsPendingKillPending()) { P->SetLifeSpan(3.f); }
	}
	PC->ChangeState(NAME_Spectating);
	PC->ClientGotoState(NAME_Spectating);
	PC->ServerViewNextPlayer();
}

// ============================================================================ Communication

void AHRGameMode::BroadcastPing(AHRPlayerController* From, const FVector& Location)
{
	const EHRTeam Team = TeamOf(From);
	const FString Name = From && From->PlayerState ? From->PlayerState->GetPlayerName() : FString();
	for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
	{
		AHRPlayerController* PC = Cast<AHRPlayerController>(It->Get());
		if (PC && TeamOf(PC) == Team) { PC->ClientReceivePing(Location, Name); }
	}
}

void AHRGameMode::NotifyTeam(EHRTeam Team, FName LocKey, EHRNotifyType Type, const FString& Arg)
{
	for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
	{
		AHRPlayerController* PC = Cast<AHRPlayerController>(It->Get());
		if (PC && TeamOf(PC) == Team) { PC->ClientNotify(LocKey, Arg, Type); }
	}
}

void AHRGameMode::NotifyAll(FName LocKey, EHRNotifyType Type, const FString& Arg)
{
	for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
	{
		if (AHRPlayerController* PC = Cast<AHRPlayerController>(It->Get())) { PC->ClientNotify(LocKey, Arg, Type); }
	}
}

void AHRGameMode::AwardScore(AController* C, int32 Points)
{
	if (AHRPlayerState* PS = C ? C->GetPlayerState<AHRPlayerState>() : nullptr) { PS->AddScore(Points); }
}
