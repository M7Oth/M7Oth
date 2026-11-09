#include "Character/HRAnimInstance.h"
#include "Character/HRCharacter.h"
#include "Character/HRCharacterMovementComponent.h"
#include "Combat/HRHealthComponent.h"
#include "Combat/HRWeaponComponent.h"
#include "KismetAnimationLibrary.h"

void UHRAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
	Super::NativeUpdateAnimation(DeltaSeconds);
	const AHRCharacter* Ch = Cast<AHRCharacter>(TryGetPawnOwner());
	if (!Ch) { return; }

	const FVector Velocity = Ch->GetVelocity();
	Speed = Velocity.Size2D();
	bIsMoving = Speed > 5.f;
	Direction = bIsMoving ? UKismetAnimationLibrary::CalculateDirection(Velocity, Ch->GetActorRotation()) : 0.f;

	const UHRCharacterMovementComponent* Move = Cast<UHRCharacterMovementComponent>(Ch->GetCharacterMovement());
	bIsInAir = Move && Move->IsFalling();
	bIsCrouched = Ch->bIsCrouched;
	bIsSprinting = Move && Move->IsSprinting() && bIsMoving;

	bIsAiming = Ch->IsAiming();
	const FRotator Delta = (Ch->GetBaseAimRotation() - Ch->GetActorRotation()).GetNormalized();
	AimPitch = FMath::ClampAngle(Delta.Pitch, -90.f, 90.f);
	AimYaw = FMath::ClampAngle(Delta.Yaw, -90.f, 90.f);

	bIsDowned = Ch->GetHealth() && !Ch->GetHealth()->IsAlive();
	bIsSurrendering = Ch->IsSurrendering();
	bIsCarryingBag = Ch->IsCarryingBag();
	bIsLockpicking = Ch->IsLockpicking();
	bIsReloading = Ch->GetWeapon() && Ch->GetWeapon()->IsReloading();
	bWeaponReady = Ch->CanUseWeapon();
	bIsArrested = Ch->IsArrested();
}
