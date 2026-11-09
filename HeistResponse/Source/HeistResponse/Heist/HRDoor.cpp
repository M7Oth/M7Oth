#include "Heist/HRDoor.h"
#include "Heist/HRLockpickComponent.h"
#include "Character/HRCharacter.h"
#include "Inventory/HRInventoryComponent.h"
#include "Game/HRGameMode.h"
#include "Core/HRLocalization.h"
#include "Core/HRTypes.h"
#include "Components/StaticMeshComponent.h"
#include "Kismet/GameplayStatics.h"
#include "Net/UnrealNetwork.h"

AHRDoor::AHRDoor()
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	SetNetUpdateFrequency(10.f);

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	FrameMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Frame"));
	FrameMesh->SetupAttachment(Root);
	Hinge = CreateDefaultSubobject<USceneComponent>(TEXT("Hinge"));
	Hinge->SetupAttachment(Root);
	LeafMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Leaf"));
	LeafMesh->SetupAttachment(Hinge);
	LeafMesh->SetCollisionProfileName(TEXT("BlockAllDynamic"));
	LeafMesh->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
	LeafMesh->SetCanEverAffectNavigation(false); // doors are crossed by NPCs via nav links
}

void AHRDoor::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRDoor, DoorState);
	DOREPLIFETIME(AHRDoor, OpenSign);
}

void AHRDoor::BeginPlay()
{
	Super::BeginPlay();
	if (HasAuthority())
	{
		DoorState = bStartsLocked ? EHRDoorState::Locked : EHRDoorState::Closed;
		LockSeed = static_cast<uint32>(GetTypeHash(GetName())) ^ static_cast<uint32>(FDateTime::Now().GetTicks());
	}
}

bool AHRDoor::TryClaimPicker(AHRCharacter* Picker)
{
	if (CurrentPicker.IsValid() && CurrentPicker.Get() != Picker && CurrentPicker->IsLockpicking()) { return false; }
	CurrentPicker = Picker;
	return true;
}

void AHRDoor::ReleasePicker(AHRCharacter* Picker)
{
	if (CurrentPicker.Get() == Picker) { CurrentPicker.Reset(); }
}

uint32 AHRDoor::ConsumeLockSeed()
{
	LockSeed = LockSeed * 1664525u + 1013904223u;
	return LockSeed;
}

bool AHRDoor::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By) { return false; }
	if (DoorState != EHRDoorState::Locked) { return true; }

	if (!KeyItem.IsNone() && By->GetInventory()->HasItem(KeyItem)) { return true; }
	if (bIsHoldingCell && By->IsPolice()) { return true; }
	if (By->IsPolice() && bPoliceCanBreach && !bIsHoldingCell) { return true; }
	if (By->IsRobber() && bLockpickable)
	{
		if (CurrentPicker.IsValid() && CurrentPicker.Get() != By && CurrentPicker->IsLockpicking())
		{
			OutBlockedReason = HRText("Interact.DoorBusy");
			return false;
		}
		if (!By->GetInventory()->HasItem(HRItems::Lockpick))
		{
			OutBlockedReason = HRText("Interact.NeedLockpick");
			return false;
		}
		return true;
	}
	OutBlockedReason = HRText("Interact.Locked");
	return false;
}

FText AHRDoor::GetInteractPrompt(const AHRCharacter* By) const
{
	if (DoorState == EHRDoorState::Open) { return HRText("Interact.CloseDoor"); }
	if (DoorState == EHRDoorState::Closed) { return HRText("Interact.OpenDoor"); }
	if (By && !KeyItem.IsNone() && By->GetInventory()->HasItem(KeyItem)) { return HRText("Interact.UseKeycard"); }
	if (By && By->IsPolice()) { return bIsHoldingCell ? HRText("Interact.OpenDoor") : HRText("Interact.Breach"); }
	return HRText("Interact.Lockpick");
}

float AHRDoor::GetInteractDuration(const AHRCharacter* By) const
{
	if (DoorState != EHRDoorState::Locked || !By) { return 0.f; }
	if (!KeyItem.IsNone() && By->GetInventory()->HasItem(KeyItem)) { return 1.f; }
	if (By->IsPolice()) { return bIsHoldingCell ? 0.f : 3.f; }
	return 0.f; // robbers: minigame starts instantly
}

void AHRDoor::OnInteractCompleted(AHRCharacter* By)
{
	FText Reason;
	if (!HasAuthority() || !CanInteract(By, Reason)) { return; }

	if (DoorState != EHRDoorState::Locked)
	{
		ServerSetOpen(DoorState == EHRDoorState::Closed, By->GetActorLocation());
		if (bRestricted && By->IsRobber())
		{
			if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyRestrictedAccess(By, GetActorLocation()); }
		}
		return;
	}

	if (!KeyItem.IsNone() && By->GetInventory()->HasItem(KeyItem))
	{
		ServerUnlock(By, true);
		return;
	}
	if (By->IsPolice())
	{
		if (!bIsHoldingCell && BreachSound) { UGameplayStatics::PlaySoundAtLocation(this, BreachSound, GetActorLocation()); }
		if (!bIsHoldingCell)
		{
			if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyNoise(By, GetActorLocation(), 0.6f); }
		}
		ServerUnlock(By, true);
		return;
	}
	if (By->IsRobber() && By->GetLockpick())
	{
		By->GetLockpick()->ServerBeginSession(this);
	}
}

void AHRDoor::ServerUnlock(AHRCharacter* By, bool bAlsoOpen)
{
	if (!HasAuthority() || DoorState != EHRDoorState::Locked) { return; }
	DoorState = EHRDoorState::Closed;
	OnRep_DoorState(EHRDoorState::Locked);
	if (bAlsoOpen) { ServerSetOpen(true, By ? By->GetActorLocation() : GetActorLocation()); }
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>())
	{
		GM->NotifyDoorUnlocked(this, By);
	}
}

void AHRDoor::ServerSetOpen(bool bOpen, const FVector& FromLocation)
{
	if (!HasAuthority() || DoorState == EHRDoorState::Locked) { return; }
	const EHRDoorState Old = DoorState;
	if (bOpen)
	{
		// Swing away from the user.
		const FVector ToUser = (FromLocation - GetActorLocation()).GetSafeNormal2D();
		OpenSign = FVector::DotProduct(ToUser, GetActorForwardVector()) > 0.f ? -1 : 1;
	}
	DoorState = bOpen ? EHRDoorState::Open : EHRDoorState::Closed;
	OnRep_DoorState(Old);
}

void AHRDoor::ServerLock()
{
	if (!HasAuthority()) { return; }
	const EHRDoorState Old = DoorState;
	DoorState = EHRDoorState::Locked;
	OnRep_DoorState(Old);
}

void AHRDoor::OnRep_DoorState(EHRDoorState OldState)
{
	if (OldState == DoorState) { return; }
	USoundBase* Sound = nullptr;
	if (OldState == EHRDoorState::Locked) { Sound = UnlockSound; }
	else if (DoorState == EHRDoorState::Open) { Sound = OpenSound; }
	else if (DoorState == EHRDoorState::Closed) { Sound = CloseSound; }
	if (Sound && GetNetMode() != NM_DedicatedServer) { UGameplayStatics::PlaySoundAtLocation(this, Sound, GetActorLocation()); }
}

void AHRDoor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Target = (DoorState == EHRDoorState::Open) ? OpenAngle * static_cast<float>(OpenSign) : 0.f;
	if (!FMath::IsNearlyEqual(CurrentYaw, Target, 0.1f))
	{
		CurrentYaw = FMath::FInterpConstantTo(CurrentYaw, Target, DeltaSeconds, SwingSpeedDegPerSec);
		Hinge->SetRelativeRotation(FRotator(0.f, CurrentYaw, 0.f));
	}
}
