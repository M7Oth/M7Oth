#include "Game/HRPlayerController.h"
#include "Game/HRGameMode.h"
#include "Game/HRGameState.h"
#include "Game/HRPlayerState.h"
#include "Character/HRCharacter.h"
#include "Heist/HRLockpickComponent.h"
#include "CameraSystem/HRCameraRigComponent.h"
#include "Heist/HRSecurityCamera.h"
#include "Vehicles/HRVehicle.h"
#include "Input/HRInputConfig.h"
#include "Core/HRGameUserSettings.h"
#include "Core/HRLocalization.h"
#include "UI/HRHUD.h"
#include "HeistResponse.h"

#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Camera/CameraActor.h"
#include "EngineUtils.h"
#include "Engine/LocalPlayer.h"

AHRPlayerController::AHRPlayerController()
{
	bAutoManageActiveCameraTarget = true;
}

void AHRPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (IsLocalController())
	{
		ApplyUserSettings();
		SetInputMode(FInputModeGameOnly());
		bShowMouseCursor = false;
	}
}

UHRInputConfig* AHRPlayerController::GetInputConfig()
{
	if (!InputConfig && IsLocalController())
	{
		InputConfig = UHRInputConfig::Create(this);
		if (const UHRGameUserSettings* S = UHRGameUserSettings::Get()) { InputConfig->RebuildMappings(S->KeyOverrides); }
	}
	return InputConfig;
}

void AHRPlayerController::ApplyUserSettings()
{
	if (UHRInputConfig* C = GetInputConfig())
	{
		if (const UHRGameUserSettings* S = UHRGameUserSettings::Get()) { C->RebuildMappings(S->KeyOverrides); }
		ApplyInputContextsFor(GetPawn());
	}
	if (AHRCharacter* Ch = Cast<AHRCharacter>(GetPawn()))
	{
		if (Ch->GetCameraRig()) { Ch->GetCameraRig()->ApplyUserSettings(false); }
	}
}

void AHRPlayerController::ApplyInputContextsFor(APawn* InPawn)
{
	UHRInputConfig* C = GetInputConfig();
	ULocalPlayer* LP = GetLocalPlayer();
	if (!C || !LP) { return; }
	UEnhancedInputLocalPlayerSubsystem* Sub = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(LP);
	if (!Sub) { return; }
	Sub->ClearAllMappings();
	Sub->AddMappingContext(C->GlobalContext, 10);
	if (Cast<AHRVehicle>(InPawn)) { Sub->AddMappingContext(C->VehicleContext, 0); }
	else if (InPawn) { Sub->AddMappingContext(C->OnFootContext, 0); }
}

void AHRPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();
	UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(InputComponent);
	UHRInputConfig* C = GetInputConfig();
	if (!EIC || !C) { return; }
	EIC->BindAction(C->Menu, ETriggerEvent::Started, this, &AHRPlayerController::InputMenu);
	EIC->BindAction(C->Scoreboard, ETriggerEvent::Started, this, &AHRPlayerController::InputScoreboardStart);
	EIC->BindAction(C->Scoreboard, ETriggerEvent::Completed, this, &AHRPlayerController::InputScoreboardStop);
	EIC->BindAction(C->Negotiate, ETriggerEvent::Started, this, &AHRPlayerController::InputNegotiate);
	EIC->BindAction(C->Ping, ETriggerEvent::Started, this, &AHRPlayerController::InputPing);
	EIC->BindAction(C->SpectateNext, ETriggerEvent::Started, this, &AHRPlayerController::InputSpectateNext);
	EIC->BindAction(C->SpectatePrev, ETriggerEvent::Started, this, &AHRPlayerController::InputSpectatePrev);
	ApplyInputContextsFor(GetPawn());
}

void AHRPlayerController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	if (IsLocalController()) { ApplyInputContextsFor(InPawn); }
}

void AHRPlayerController::AcknowledgePossession(APawn* P)
{
	Super::AcknowledgePossession(P);
	ApplyInputContextsFor(P);
	bLobbyCameraApplied = false;
}

AHRHUD* AHRPlayerController::GetHRHUD() const
{
	return Cast<AHRHUD>(GetHUD());
}

void AHRPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);
	const float Now = GetWorld()->GetTimeSeconds();
	Pings.RemoveAll([Now](const FHRPing& P) { return P.ExpireTime < Now; });
	if (!GetPawn() && !bViewingCCTV) { ApplyLobbyCamera(); }
}

void AHRPlayerController::ApplyLobbyCamera()
{
	if (bLobbyCameraApplied || GetStateName() == NAME_Spectating) { return; }
	const AHRGameState* GS = GetWorld()->GetGameState<AHRGameState>();
	if (!GS || GS->HasMatchStarted()) { return; }
	for (TActorIterator<ACameraActor> It(GetWorld()); It; ++It)
	{
		if (It->Tags.Contains(TEXT("LobbyCamera")))
		{
			SetViewTarget(*It);
			bLobbyCameraApplied = true;
			return;
		}
	}
}

// ---------------------------------------------------------------------------- Input

void AHRPlayerController::InputMenu()
{
	if (AHRCharacter* Ch = Cast<AHRCharacter>(GetPawn()))
	{
		if (Ch->IsLockpicking()) { Ch->GetLockpick()->RequestCancel(); return; }
	}
	if (bViewingCCTV) { ServerExitCCTV(); return; }
	if (AHRHUD* HUD = GetHRHUD()) { HUD->ToggleMenu(); }
}

void AHRPlayerController::InputScoreboardStart() { if (AHRHUD* HUD = GetHRHUD()) { HUD->SetScoreboardVisible(true); } }
void AHRPlayerController::InputScoreboardStop() { if (AHRHUD* HUD = GetHRHUD()) { HUD->SetScoreboardVisible(false); } }
void AHRPlayerController::InputNegotiate() { if (AHRHUD* HUD = GetHRHUD()) { HUD->ToggleNegotiation(); } }

void AHRPlayerController::InputPing()
{
	const float Now = GetWorld()->GetTimeSeconds();
	if (Now - LastPingTime < 1.f) { return; }
	LastPingTime = Now;
	FVector Loc;
	FRotator Rot;
	GetPlayerViewPoint(Loc, Rot);
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(HRPing), false, GetPawn());
	if (GetWorld()->LineTraceSingleByChannel(Hit, Loc, Loc + Rot.Vector() * 20000.f, ECC_Visibility, Params))
	{
		ServerPing(Hit.ImpactPoint);
	}
}

void AHRPlayerController::InputSpectateNext()
{
	if (bViewingCCTV) { ServerCCTVCycle(1); return; }
	if (GetStateName() == NAME_Spectating) { ServerViewNextPlayer(); }
}

void AHRPlayerController::InputSpectatePrev()
{
	if (bViewingCCTV) { ServerCCTVCycle(-1); return; }
	if (GetStateName() == NAME_Spectating) { ServerViewPrevPlayer(); }
}

// ---------------------------------------------------------------------------- RPCs

void AHRPlayerController::ServerSelectTeam_Implementation(EHRTeam Team)
{
	if (Team != EHRTeam::Police && Team != EHRTeam::Robbers) { return; }
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->RequestTeamChange(this, Team); }
}

void AHRPlayerController::ServerSetReady_Implementation(bool bReady)
{
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->SetPlayerReady(this, bReady); }
}

void AHRPlayerController::ServerVoteRematch_Implementation()
{
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->VoteRematch(this); }
}

void AHRPlayerController::ServerProposeDeal_Implementation(EHRDealType Deal)
{
	if (Deal == EHRDealType::None || Deal >= EHRDealType::Count) { return; }
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->ProposeDeal(this, Deal); }
}

void AHRPlayerController::ServerRespondDeal_Implementation(bool bAccept)
{
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->RespondToDeal(this, bAccept); }
}

void AHRPlayerController::ServerPing_Implementation(FVector_NetQuantize Location)
{
	const float Now = GetWorld()->GetTimeSeconds();
	if (Now - ServerLastPingTime < 0.8f) { return; } // anti-spam
	ServerLastPingTime = Now;
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->BroadcastPing(this, Location); }
}

void AHRPlayerController::ClientReceivePing_Implementation(FVector_NetQuantize Location, const FString& From)
{
	FHRPing P;
	P.Location = Location;
	P.From = From;
	P.ExpireTime = GetWorld()->GetTimeSeconds() + 8.f;
	Pings.Add(P);
	if (Pings.Num() > 8) { Pings.RemoveAt(0); }
	if (AHRHUD* HUD = GetHRHUD()) { HUD->PlayUISound(TEXT("Ping")); }
}

void AHRPlayerController::ClientNotify_Implementation(FName LocKey, const FString& Arg, EHRNotifyType Type)
{
	FText Msg = FHRLocalization::Get().Text(LocKey);
	if (!Arg.IsEmpty()) { Msg = FText::Format(Msg, FText::FromString(Arg)); }
	if (AHRHUD* HUD = GetHRHUD()) { HUD->PushNotification(Msg, Type); }
	UE_LOG(LogHeist, Verbose, TEXT("Notify[%d] %s"), static_cast<int32>(Type), *Msg.ToString());
}

void AHRPlayerController::ClientOnDispatch_Implementation(FVector_NetQuantize IncidentLocation)
{
	bHasDispatch = true;
	DispatchLocation = IncidentLocation;
	if (AHRHUD* HUD = GetHRHUD()) { HUD->ShowDispatch(IncidentLocation); }
}

void AHRPlayerController::ClientMatchEnded_Implementation()
{
	if (AHRHUD* HUD = GetHRHUD()) { HUD->ShowMatchSummary(); }
}

// ---------------------------------------------------------------------------- CCTV

void AHRPlayerController::ServerEnterCCTV()
{
	if (!HasAuthority()) { return; }
	CCTVCameras.Reset();
	for (TActorIterator<AHRSecurityCamera> It(GetWorld()); It; ++It) { CCTVCameras.Add(*It); }
	if (CCTVCameras.Num() == 0) { return; }
	CCTVIndex = 0;
	bViewingCCTV = true;
	SetIgnoreMoveInput(true);
	SetViewTargetWithBlend(CCTVCameras[0], 0.3f);
	ClientSetCCTV(true);
}

void AHRPlayerController::ServerCCTVCycle_Implementation(int32 Direction)
{
	if (!bViewingCCTV || CCTVCameras.Num() == 0) { return; }
	CCTVIndex = (CCTVIndex + (Direction >= 0 ? 1 : -1) + CCTVCameras.Num()) % CCTVCameras.Num();
	SetViewTargetWithBlend(CCTVCameras[CCTVIndex], 0.f);
}

void AHRPlayerController::ServerExitCCTV_Implementation()
{
	if (!bViewingCCTV) { return; }
	bViewingCCTV = false;
	SetIgnoreMoveInput(false);
	SetViewTargetWithBlend(GetPawn(), 0.3f);
	ClientSetCCTV(false);
}

void AHRPlayerController::ClientSetCCTV_Implementation(bool bOn)
{
	bViewingCCTV = bOn;
	// While watching feeds the pawn receives no gameplay input (LMB/RMB cycle cameras instead).
	ApplyInputContextsFor(bOn ? nullptr : GetPawn());
	if (AHRHUD* HUD = GetHRHUD()) { HUD->SetCCTVOverlay(bOn); }
}
