#include "UI/HRHUD.h"
#include "UI/SHRGameHUD.h"
#include "UI/HRUIStyle.h"
#include "Core/HRLocalization.h"
#include "Game/HRPlayerController.h"
#include "Game/HRGameState.h"
#include "Game/HRPlayerState.h"
#include "Character/HRCharacter.h"
#include "Heist/HRExtractionZone.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "EngineUtils.h"
#include "Kismet/GameplayStatics.h"
#include "Widgets/SWeakWidget.h"

void AHRHUD::BeginPlay()
{
	Super::BeginPlay();
	AHRPlayerController* PC = Cast<AHRPlayerController>(GetOwningPlayerController());
	if (!PC || !PC->IsLocalController() || !GEngine || !GEngine->GameViewport) { return; }
	SAssignNew(Root, SHRGameHUD).PlayerController(PC).HUD(this);
	RootContainer = SNew(SWeakWidget).PossiblyNullContent(Root);
	GEngine->GameViewport->AddViewportWidgetContent(RootContainer.ToSharedRef(), 10);
}

void AHRHUD::EndPlay(const EEndPlayReason::Type Reason)
{
	if (RootContainer.IsValid() && GEngine && GEngine->GameViewport)
	{
		GEngine->GameViewport->RemoveViewportWidgetContent(RootContainer.ToSharedRef());
	}
	RootContainer.Reset();
	Root.Reset();
	Super::EndPlay(Reason);
}

void AHRHUD::ToggleMenu()
{
	if (bSettingsOpen) { bSettingsOpen = false; return; }
	if (bNegotiationOpen) { bNegotiationOpen = false; return; }
	bMenuOpen = !bMenuOpen;
}

void AHRHUD::CloseAllPanels()
{
	bMenuOpen = bSettingsOpen = bNegotiationOpen = false;
}

void AHRHUD::ToggleNegotiation()
{
	const AHRGameState* GS = GetWorld()->GetGameState<AHRGameState>();
	if (!bNegotiationOpen && (!GS || GS->Negotiation.State == EHRNegotiationState::Closed))
	{
		PushNotification(HRText("Negotiation.NotAvailable"), EHRNotifyType::Info);
		return;
	}
	bNegotiationOpen = !bNegotiationOpen;
}

void AHRHUD::PushNotification(const FText& Text, EHRNotifyType Type)
{
	FHRNotification N;
	N.Text = Text;
	N.Type = Type;
	N.Time = GetWorld()->GetTimeSeconds();
	Notifications.Insert(N, 0);
	if (Notifications.Num() > 6) { Notifications.SetNum(6); }
	if (Type == EHRNotifyType::Alarm) { PlayUISound(TEXT("Alarm")); }
	else if (Type == EHRNotifyType::Negotiation) { PlayUISound(TEXT("Phone")); }
	else if (Type == EHRNotifyType::Dispatch) { PlayUISound(TEXT("Radio")); }
}

void AHRHUD::ShowDispatch(const FVector& Location)
{
	DispatchFlashUntil = GetWorld()->GetTimeSeconds() + 6.f;
	PlayUISound(TEXT("Radio"));
}

void AHRHUD::PlayUISound(FName Cue)
{
	if (const TObjectPtr<USoundBase>* S = UISounds.Find(Cue))
	{
		if (*S) { UGameplayStatics::PlaySound2D(this, *S); }
	}
}

bool AHRHUD::WantsCursor() const
{
	const AHRGameState* GS = GetWorld()->GetGameState<AHRGameState>();
	const bool bLobby = GS && !GS->HasMatchStarted();
	const bool bEnded = GS && GS->Phase == EHRMatchPhase::Ended;
	return bMenuOpen || bSettingsOpen || bNegotiationOpen || bLobby || bEnded;
}

void AHRHUD::UpdateInputMode()
{
	APlayerController* PC = GetOwningPlayerController();
	if (!PC) { return; }
	const bool bWants = WantsCursor();
	if (bWants == bLastWantsCursor) { return; }
	bLastWantsCursor = bWants;
	if (bWants)
	{
		FInputModeGameAndUI Mode;
		Mode.SetHideCursorDuringCapture(false);
		Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		PC->SetInputMode(Mode);
		PC->bShowMouseCursor = true;
	}
	else
	{
		PC->SetInputMode(FInputModeGameOnly());
		PC->bShowMouseCursor = false;
	}
}

void AHRHUD::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Now = GetWorld()->GetTimeSeconds();
	Notifications.RemoveAll([Now](const FHRNotification& N) { return Now - N.Time > 7.f; });
	const AHRGameState* GS = GetWorld()->GetGameState<AHRGameState>();
	if (GS && GS->Phase != EHRMatchPhase::Ended) { bSummaryRequested = false; }
	UpdateInputMode();
}

void AHRHUD::DrawWorldMarker(const FVector& World, const FLinearColor& Color, const FString& Label, bool bClampToEdge)
{
	if (!Canvas) { return; }
	APlayerController* PC = GetOwningPlayerController();
	FVector CamLoc;
	FRotator CamRot;
	PC->GetPlayerViewPoint(CamLoc, CamRot);
	const bool bBehind = FVector::DotProduct(CamRot.Vector(), (World - CamLoc).GetSafeNormal()) < 0.f;
	FVector Screen = Canvas->Project(World);
	const float W = Canvas->ClipX, H = Canvas->ClipY, Margin = 40.f;
	if (bBehind) { Screen.X = W - Screen.X; Screen.Y = H - Margin; }
	const bool bOff = bBehind || Screen.X < Margin || Screen.X > W - Margin || Screen.Y < Margin || Screen.Y > H - Margin;
	if (bOff && !bClampToEdge) { return; }
	Screen.X = FMath::Clamp(Screen.X, Margin, W - Margin);
	Screen.Y = FMath::Clamp(Screen.Y, Margin, H - Margin);

	const float S = 9.f;
	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.55f), Screen.X - S - 2.f, Screen.Y - S - 2.f, 2.f * S + 4.f, 2.f * S + 4.f);
	DrawRect(Color, Screen.X - S, Screen.Y - S, 2.f * S, 2.f * S);
	if (!Label.IsEmpty() && GEngine)
	{
		float TW = 0.f, TH = 0.f;
		GetTextSize(Label, TW, TH, GEngine->GetSmallFont(), 1.f);
		DrawText(Label, FLinearColor::White, Screen.X - TW * 0.5f, Screen.Y + S + 4.f, GEngine->GetSmallFont(), 1.f);
	}
}

void AHRHUD::DrawHUD()
{
	Super::DrawHUD();
	AHRPlayerController* PC = Cast<AHRPlayerController>(GetOwningPlayerController());
	const AHRGameState* GS = GetWorld()->GetGameState<AHRGameState>();
	if (!PC || !GS || !Canvas || GS->Phase == EHRMatchPhase::Ended || bCCTV) { return; }
	const AHRPlayerState* MyPS = PC->GetPlayerState<AHRPlayerState>();
	const EHRTeam MyTeam = MyPS ? MyPS->GetTeam() : EHRTeam::None;
	FVector CamLoc;
	FRotator CamRot;
	PC->GetPlayerViewPoint(CamLoc, CamRot);
	auto Meters = [&CamLoc](const FVector& P) { return FString::Printf(TEXT("%dm"), FMath::RoundToInt(FVector::Dist(CamLoc, P) / 100.f)); };

	// Tactical pings.
	for (const FHRPing& P : PC->GetPings())
	{
		DrawWorldMarker(P.Location, FHRUIStyle::Warning(), Meters(P.Location), true);
	}

	// Police dispatch waypoint.
	if (MyTeam == EHRTeam::Police && GS->bAlarmRaised)
	{
		DrawWorldMarker(GS->IncidentLocation, FHRUIStyle::Police(), Meters(GS->IncidentLocation), true);
	}

	// Extraction zones.
	for (TActorIterator<AHRExtractionZone> It(GetWorld()); It; ++It)
	{
		const bool bShow = It->IsActive() && GS->bAlarmRaised && (MyTeam == EHRTeam::Robbers || It->IsRevealedToPolice());
		if (bShow) { DrawWorldMarker(It->GetActorLocation(), FHRUIStyle::Success(), Meters(It->GetActorLocation()), MyTeam == EHRTeam::Robbers); }
	}

	// Teammates (on screen only, within 80 m) - keeps teams readable in crowded fights.
	for (TActorIterator<AHRCharacter> It(GetWorld()); It; ++It)
	{
		AHRCharacter* C = *It;
		if (C == PC->GetPawn() || C->GetTeam() != MyTeam || MyTeam == EHRTeam::None || C->IsInVehicle()) { continue; }
		if (FVector::DistSquared(CamLoc, C->GetActorLocation()) > FMath::Square(8000.f)) { continue; }
		const FLinearColor Col = C->IsAliveState() ? FHRUIStyle::TeamColor(MyTeam) : FHRUIStyle::Alarm();
		DrawWorldMarker(C->GetActorLocation() + FVector(0.f, 0.f, 120.f), Col, C->IsAliveState() ? FString() : TEXT("!"), false);
	}
}
