#include "Heist/HRVault.h"
#include "Character/HRCharacter.h"
#include "Inventory/HRInventoryComponent.h"
#include "Game/HRGameMode.h"
#include "Core/HRLocalization.h"
#include "Core/HRTypes.h"
#include "Components/StaticMeshComponent.h"
#include "Components/AudioComponent.h"
#include "GameFramework/GameStateBase.h"
#include "Kismet/GameplayStatics.h"
#include "Net/UnrealNetwork.h"

AHRVault::AHRVault()
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	bAlwaysRelevant = true; // the vault state drives everyone's objective UI
	SetNetUpdateFrequency(5.f);

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	FrameMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Frame"));
	FrameMesh->SetupAttachment(Root);
	Hinge = CreateDefaultSubobject<USceneComponent>(TEXT("Hinge"));
	Hinge->SetupAttachment(Root);
	DoorMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Door"));
	DoorMesh->SetupAttachment(Hinge);
	DoorMesh->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
	DrillMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Drill"));
	DrillMesh->SetupAttachment(DoorMesh);
	DrillMesh->SetVisibility(false);
	DrillMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	DrillAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("DrillAudio"));
	DrillAudio->SetupAttachment(DrillMesh);
	DrillAudio->bAutoActivate = false;
}

void AHRVault::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRVault, VaultState);
	DOREPLIFETIME(AHRVault, DrillProgress);
	DOREPLIFETIME(AHRVault, OpenStartServerTime);
}

bool AHRVault::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By) { return false; }
	switch (VaultState)
	{
	case EHRVaultState::Locked:
		if (!By->IsRobber()) { return false; }
		if (By->GetInventory()->HasItem(HRItems::VaultKeycard) || By->GetInventory()->HasItem(HRItems::ThermalDrill)) { return true; }
		OutBlockedReason = HRText("Interact.VaultNeedTool");
		return false;
	case EHRVaultState::Drilling:
		return By->IsPolice();
	case EHRVaultState::DrillJammed:
	case EHRVaultState::DrillStopped:
		return By->IsRobber() || (By->IsPolice() && VaultState == EHRVaultState::DrillJammed);
	default:
		return false;
	}
}

FText AHRVault::GetInteractPrompt(const AHRCharacter* By) const
{
	if (!By) { return FText::GetEmpty(); }
	switch (VaultState)
	{
	case EHRVaultState::Locked:
		return By->GetInventory()->HasItem(HRItems::VaultKeycard) ? HRText("Interact.VaultCode") : HRText("Interact.VaultPlaceDrill");
	case EHRVaultState::Drilling:
		return HRText("Interact.VaultDisableDrill");
	case EHRVaultState::DrillJammed:
	case EHRVaultState::DrillStopped:
		return By->IsPolice() ? HRText("Interact.VaultDisableDrill") : HRText("Interact.VaultFixDrill");
	default:
		return FText::GetEmpty();
	}
}

float AHRVault::GetInteractDuration(const AHRCharacter* By) const
{
	if (!By) { return 0.f; }
	switch (VaultState)
	{
	case EHRVaultState::Locked: return By->GetInventory()->HasItem(HRItems::VaultKeycard) ? 6.f : 3.f;
	case EHRVaultState::Drilling: return 3.f;
	case EHRVaultState::DrillJammed:
	case EHRVaultState::DrillStopped: return By->IsPolice() ? 3.f : 2.5f;
	default: return 0.f;
	}
}

void AHRVault::OnInteractCompleted(AHRCharacter* By)
{
	FText Reason;
	if (!HasAuthority() || !CanInteract(By, Reason)) { return; }
	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();

	if (VaultState == EHRVaultState::Locked)
	{
		if (By->GetInventory()->ConsumeItem(HRItems::VaultKeycard))
		{
			if (KeypadSound) { UGameplayStatics::PlaySoundAtLocation(this, KeypadSound, GetActorLocation()); }
			BeginOpening(By);
			return;
		}
		if (By->GetInventory()->ConsumeItem(HRItems::ThermalDrill))
		{
			JamCheckpoints.Reset();
			for (float C : { 0.3f, 0.65f })
			{
				if (FMath::FRand() < JamChancePerCheckpoint) { JamCheckpoints.Add(C + FMath::FRandRange(-0.05f, 0.05f)); }
			}
			SetVaultState(EHRVaultState::Drilling);
			if (GM) { GM->NotifyNoise(By, GetActorLocation(), 0.5f); GM->NotifyVaultDrillStarted(By); }
		}
		return;
	}

	if (By->IsPolice())
	{
		SetVaultState(EHRVaultState::DrillStopped);
		if (GM) { GM->NotifyVaultDrillDisabled(By); }
		return;
	}

	// Robber fixes / restarts the drill.
	SetVaultState(EHRVaultState::Drilling);
}

void AHRVault::BeginOpening(AHRCharacter* By)
{
	if (VaultState == EHRVaultState::Opening || VaultState == EHRVaultState::Open) { return; }
	const AGameStateBase* GS = GetWorld()->GetGameState();
	OpenStartServerTime = GS ? static_cast<float>(GS->GetServerWorldTimeSeconds()) : 0.f;
	SetVaultState(EHRVaultState::Opening);
	// MANDATORY: vault opening always raises the alarm.
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->OnVaultOpened(this, By); }
}

void AHRVault::ServerForceOpen()
{
	if (HasAuthority()) { BeginOpening(nullptr); }
}

void AHRVault::SetVaultState(EHRVaultState NewState)
{
	const EHRVaultState Old = VaultState;
	VaultState = NewState;
	OnRep_VaultState(Old);
}

void AHRVault::OnRep_VaultState(EHRVaultState OldState)
{
	const bool bDrillVisible = VaultState == EHRVaultState::Drilling || VaultState == EHRVaultState::DrillJammed || VaultState == EHRVaultState::DrillStopped;
	DrillMesh->SetVisibility(bDrillVisible);
	if (GetNetMode() == NM_DedicatedServer) { return; }
	if (VaultState == EHRVaultState::Drilling && DrillLoop)
	{
		DrillAudio->SetSound(DrillLoop);
		DrillAudio->Play();
	}
	else
	{
		DrillAudio->Stop();
	}
	if (VaultState == EHRVaultState::DrillJammed && JamSound) { UGameplayStatics::PlaySoundAtLocation(this, JamSound, GetActorLocation()); }
	if (VaultState == EHRVaultState::Opening && OpenSound) { UGameplayStatics::PlaySoundAtLocation(this, OpenSound, GetActorLocation()); }
}

void AHRVault::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (HasAuthority())
	{
		if (VaultState == EHRVaultState::Drilling)
		{
			DrillProgress = FMath::Min(1.f, DrillProgress + DeltaSeconds / FMath::Max(1.f, DrillSeconds));
			if (JamCheckpoints.Num() > 0 && DrillProgress >= JamCheckpoints[0])
			{
				JamCheckpoints.RemoveAt(0);
				SetVaultState(EHRVaultState::DrillJammed);
			}
			else if (DrillProgress >= 1.f)
			{
				BeginOpening(nullptr);
			}
		}
		if (VaultState == EHRVaultState::Opening)
		{
			const AGameStateBase* GS = GetWorld()->GetGameState();
			const float Now = GS ? static_cast<float>(GS->GetServerWorldTimeSeconds()) : 0.f;
			if (Now - OpenStartServerTime >= OpenSeconds) { SetVaultState(EHRVaultState::Open); }
		}
	}

	// Visual swing (all machines) driven by replicated state.
	const float Target = (VaultState == EHRVaultState::Opening || VaultState == EHRVaultState::Open) ? OpenAngle : 0.f;
	if (!FMath::IsNearlyEqual(CurrentAngle, Target, 0.05f))
	{
		const float Speed = OpenAngle / FMath::Max(0.5f, OpenSeconds);
		CurrentAngle = FMath::FInterpConstantTo(CurrentAngle, Target, DeltaSeconds, Speed);
		Hinge->SetRelativeRotation(FRotator(0.f, CurrentAngle, 0.f));
	}
}
