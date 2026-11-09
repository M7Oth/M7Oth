#include "Character/HRCharacterMovementComponent.h"
#include "Character/HRCharacter.h"
#include "GameFramework/Character.h"

UHRCharacterMovementComponent::UHRCharacterMovementComponent()
{
	MaxWalkSpeed = WalkSpeed;
	MaxWalkSpeedCrouched = 200.f;
	NavAgentProps.bCanCrouch = true;
	bCanWalkOffLedgesWhenCrouching = true;
	JumpZVelocity = 420.f;
	AirControl = 0.25f;
	BrakingDecelerationWalking = 1600.f;
	GroundFriction = 8.f;
	RotationRate = FRotator(0.f, 540.f, 0.f);
}

bool UHRCharacterMovementComponent::IsSprinting() const
{
	if (!bWantsToSprint || bWantsToAim || IsCrouching() || !IsMovingOnGround()) { return false; }
	const AHRCharacter* Ch = Cast<AHRCharacter>(CharacterOwner);
	if (Ch && (Ch->IsCarryingBag() || Ch->IsSurrendering() || !Ch->IsAliveState())) { return false; }
	// Only sprint when moving mostly forward.
	if (Ch && Velocity.SizeSquared2D() > 100.f)
	{
		const float Dot = FVector::DotProduct(Velocity.GetSafeNormal2D(), Ch->GetActorForwardVector());
		if (Dot < 0.5f) { return false; }
	}
	return true;
}

float UHRCharacterMovementComponent::GetMaxSpeed() const
{
	const AHRCharacter* Ch = Cast<AHRCharacter>(CharacterOwner);
	if (!Ch || MovementMode != MOVE_Walking) { return Super::GetMaxSpeed(); }
	if (!Ch->IsAliveState()) { return DownedSpeed; }
	if (Ch->IsSurrendering()) { return SurrenderSpeed; }
	if (IsCrouching()) { return MaxWalkSpeedCrouched; }
	float Speed = IsSprinting() ? SprintSpeed : WalkSpeed;
	if (bWantsToAim) { Speed = FMath::Min(Speed, AimSpeed); }
	if (Ch->IsCarryingBag()) { Speed = FMath::Min(Speed, BagCarrySpeed); }
	return Speed;
}

void UHRCharacterMovementComponent::UpdateFromCompressedFlags(uint8 Flags)
{
	Super::UpdateFromCompressedFlags(Flags);
	bWantsToSprint = (Flags & FSavedMove_Character::FLAG_Custom_0) != 0;
	bWantsToAim = (Flags & FSavedMove_Character::FLAG_Custom_1) != 0;
}

FNetworkPredictionData_Client* UHRCharacterMovementComponent::GetPredictionData_Client() const
{
	if (!ClientPredictionData)
	{
		UHRCharacterMovementComponent* Mutable = const_cast<UHRCharacterMovementComponent*>(this);
		Mutable->ClientPredictionData = new FNetworkPredictionData_Client_HR(*this);
	}
	return ClientPredictionData;
}

void FSavedMove_HR::Clear()
{
	Super::Clear();
	bSavedWantsToSprint = 0;
	bSavedWantsToAim = 0;
}

uint8 FSavedMove_HR::GetCompressedFlags() const
{
	uint8 Result = Super::GetCompressedFlags();
	if (bSavedWantsToSprint) { Result |= FLAG_Custom_0; }
	if (bSavedWantsToAim) { Result |= FLAG_Custom_1; }
	return Result;
}

bool FSavedMove_HR::CanCombineWith(const FSavedMovePtr& NewMove, ACharacter* InCharacter, float MaxDelta) const
{
	const FSavedMove_HR* Other = static_cast<const FSavedMove_HR*>(NewMove.Get());
	if (bSavedWantsToSprint != Other->bSavedWantsToSprint || bSavedWantsToAim != Other->bSavedWantsToAim) { return false; }
	return Super::CanCombineWith(NewMove, InCharacter, MaxDelta);
}

void FSavedMove_HR::SetMoveFor(ACharacter* C, float InDeltaTime, FVector const& NewAccel, FNetworkPredictionData_Client_Character& ClientData)
{
	Super::SetMoveFor(C, InDeltaTime, NewAccel, ClientData);
	if (const UHRCharacterMovementComponent* M = Cast<UHRCharacterMovementComponent>(C->GetCharacterMovement()))
	{
		bSavedWantsToSprint = M->bWantsToSprint;
		bSavedWantsToAim = M->bWantsToAim;
	}
}

void FSavedMove_HR::PrepMoveFor(ACharacter* C)
{
	Super::PrepMoveFor(C);
	if (UHRCharacterMovementComponent* M = Cast<UHRCharacterMovementComponent>(C->GetCharacterMovement()))
	{
		M->bWantsToSprint = bSavedWantsToSprint;
		M->bWantsToAim = bSavedWantsToAim;
	}
}
