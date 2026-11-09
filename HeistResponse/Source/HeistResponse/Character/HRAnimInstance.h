#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "HRAnimInstance.generated.h"

/**
 * C++ base for ABP_HRCharacter. Computes every variable the anim graph needs on the game thread
 * once per frame, so the AnimBP stays a thin, fast state machine (thread-safe update friendly).
 */
UCLASS()
class HEISTRESPONSE_API UHRAnimInstance : public UAnimInstance
{
	GENERATED_BODY()

public:
	virtual void NativeUpdateAnimation(float DeltaSeconds) override;

	UPROPERTY(BlueprintReadOnly, Category = "Locomotion") float Speed = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Locomotion") float Direction = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Locomotion") bool bIsMoving = false;
	UPROPERTY(BlueprintReadOnly, Category = "Locomotion") bool bIsInAir = false;
	UPROPERTY(BlueprintReadOnly, Category = "Locomotion") bool bIsCrouched = false;
	UPROPERTY(BlueprintReadOnly, Category = "Locomotion") bool bIsSprinting = false;
	UPROPERTY(BlueprintReadOnly, Category = "Aim") bool bIsAiming = false;
	UPROPERTY(BlueprintReadOnly, Category = "Aim") float AimPitch = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "Aim") float AimYaw = 0.f;
	UPROPERTY(BlueprintReadOnly, Category = "State") bool bIsDowned = false;
	UPROPERTY(BlueprintReadOnly, Category = "State") bool bIsSurrendering = false;
	UPROPERTY(BlueprintReadOnly, Category = "State") bool bIsCarryingBag = false;
	UPROPERTY(BlueprintReadOnly, Category = "State") bool bIsLockpicking = false;
	UPROPERTY(BlueprintReadOnly, Category = "State") bool bIsReloading = false;
	UPROPERTY(BlueprintReadOnly, Category = "State") bool bWeaponReady = false;
	UPROPERTY(BlueprintReadOnly, Category = "State") bool bIsArrested = false;
};
