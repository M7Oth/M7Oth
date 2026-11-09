#include "Heist/HRLockpickComponent.h"
#include "Heist/HRDoor.h"
#include "Character/HRCharacter.h"
#include "Inventory/HRInventoryComponent.h"
#include "CameraSystem/HRCameraRigComponent.h"
#include "Game/HRGameMode.h"
#include "Core/HRTypes.h"
#include "Net/UnrealNetwork.h"

using namespace HeistRules;

UHRLockpickComponent::UHRLockpickComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	SetIsReplicatedByDefault(true);
}

void UHRLockpickComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME_CONDITION(UHRLockpickComponent, View, COND_OwnerOnly);
}

AHRCharacter* UHRLockpickComponent::GetCharacter() const
{
	return Cast<AHRCharacter>(GetOwner());
}

void UHRLockpickComponent::AddLocalPickInput(float MouseDeltaX)
{
	const float Range = Model.GetDifficulty().AngleRange; // default difficulty range, same on client
	LocalAngle = FMath::Clamp(LocalAngle + MouseDeltaX * MouseDegreesPerUnit, -Range, Range);
}

void UHRLockpickComponent::RequestCancel()
{
	if (View.bActive) { ServerCancel(); }
}

void UHRLockpickComponent::ServerCancel_Implementation()
{
	ServerEndSession(false);
}

bool UHRLockpickComponent::ServerBeginSession(AHRDoor* Door)
{
	AHRCharacter* Ch = GetCharacter();
	if (!Ch || !Ch->HasAuthority() || !Door || View.bActive) { return false; }
	if (!Ch->GetInventory()->HasItem(HRItems::Lockpick)) { return false; }
	if (!Door->TryClaimPicker(Ch)) { return false; }

	TargetDoor = Door;
	FLockpickDifficulty Diff;
	Diff.PinCount = Door->LockPinCount;
	Diff.SweetTolerance = Door->LockTolerance;
	Model.Reset(Door->ConsumeLockSeed(), Diff);
	ServerAngle = 0.f;
	ServerTension = 0.f;
	StartLocation = Ch->GetActorLocation();

	View = FHRLockpickView();
	View.bActive = true;
	View.PinCount = Diff.PinCount;
	View.LockpicksLeft = Ch->GetInventory()->GetCount(HRItems::Lockpick);
	OnRep_View(FHRLockpickView());
	return true;
}

void UHRLockpickComponent::ServerEndSession(bool bSuccess)
{
	AHRCharacter* Ch = GetCharacter();
	if (!Ch || !Ch->HasAuthority() || !View.bActive) { return; }
	if (AHRDoor* Door = TargetDoor.Get())
	{
		Door->ReleasePicker(Ch);
		if (bSuccess) { Door->ServerUnlock(Ch, true); }
	}
	TargetDoor.Reset();
	const FHRLockpickView Old = View;
	View.bActive = false;
	OnRep_View(Old);
}

void UHRLockpickComponent::ServerLockpickInput_Implementation(float Angle, float Tension)
{
	if (!View.bActive || !FMath::IsFinite(Angle) || !FMath::IsFinite(Tension)) { return; }
	ServerAngle = Angle;
	ServerTension = FMath::Clamp(Tension, 0.f, 1.f);
}

void UHRLockpickComponent::PushEvent(ELockpickEvent Event)
{
	View.LastEvent = static_cast<uint8>(Event);
	++View.EventSerial;
	OnLockpickEvent.Broadcast(View.LastEvent); // listen server feedback
}

void UHRLockpickComponent::OnRep_View(const FHRLockpickView& Old)
{
	if (View.EventSerial != Old.EventSerial) { OnLockpickEvent.Broadcast(View.LastEvent); }
	if (View.bActive != Old.bActive)
	{
		LocalAngle = 0.f;
		bLocalTension = false;
		if (AHRCharacter* Ch = GetCharacter())
		{
			if (Ch->IsLocallyControlled() && Ch->GetCameraRig()) { Ch->GetCameraRig()->SetContextOverride(View.bActive, 110.f); }
		}
	}
}

void UHRLockpickComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	AHRCharacter* Ch = GetCharacter();
	if (!Ch || !View.bActive) { return; }

	if (Ch->IsLocallyControlled())
	{
		SendAccumulator += DeltaTime;
		if (SendAccumulator >= InputSendInterval)
		{
			SendAccumulator = 0.f;
			ServerLockpickInput(LocalAngle, bLocalTension ? 1.f : 0.f);
		}
	}

	if (!Ch->HasAuthority()) { return; }

	AHRDoor* Door = TargetDoor.Get();
	const bool bMoved = FVector::DistSquared2D(Ch->GetActorLocation(), StartLocation) > FMath::Square(MaxMoveDistance);
	if (!Door || !Door->IsLocked() || bMoved || !Ch->IsAliveState() || Ch->IsArrested() || Ch->IsSurrendering())
	{
		ServerEndSession(false);
		return;
	}

	const FLockpickFeedback F = Model.Step(DeltaTime, ServerAngle, ServerTension);
	View.Closeness = F.Closeness;
	View.PinProgress = F.PinProgress;
	View.Stress = F.Stress;
	View.PinsSet = F.PinsSet;

	switch (F.Event)
	{
	case ELockpickEvent::PinSet:
		PushEvent(F.Event);
		break;
	case ELockpickEvent::PickBroken:
		PushEvent(F.Event);
		Ch->GetInventory()->ConsumeItem(HRItems::Lockpick);
		View.LockpicksLeft = Ch->GetInventory()->GetCount(HRItems::Lockpick);
		if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyNoise(Ch, Door->GetActorLocation(), 0.15f); }
		if (View.LockpicksLeft <= 0) { ServerEndSession(false); }
		break;
	case ELockpickEvent::Unlocked:
		PushEvent(F.Event);
		ServerEndSession(true);
		break;
	default:
		break;
	}
}
