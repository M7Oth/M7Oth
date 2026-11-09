#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Core/HRTypes.h"
#include "HRCameraRigComponent.generated.h"

class USpringArmComponent;
class UCameraComponent;
class USkeletalMeshComponent;

/**
 * Shared first/third-person camera rig. One rig drives one SpringArm + Camera pair, so the
 * character, weapon and interaction systems never care which perspective is active:
 *   * Gameplay traces (shots, interaction validation) always originate from the pawn's EYES,
 *     never from the camera. The camera only chooses *where* the player looks.
 *   * Perspective changes blend over BlendTime (no cuts); shoulder swaps blend too.
 *   * The spring arm probes collision so the camera never clips through walls.
 *   * In first person the owner's head bone is hidden locally (others still see the full body).
 * Runs only for the locally controlled pawn. Preference persists in UHRGameUserSettings.
 */
UCLASS(ClassGroup = (HeistResponse), meta = (BlueprintSpawnableComponent))
class HEISTRESPONSE_API UHRCameraRigComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UHRCameraRigComponent();

	void Initialize(USpringArmComponent* InArm, UCameraComponent* InCamera, USkeletalMeshComponent* InBodyMesh);

	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	UFUNCTION(BlueprintCallable, Category = "Camera")
	void SetMode(EHRCameraMode NewMode, bool bInstant = false);

	UFUNCTION(BlueprintCallable, Category = "Camera")
	void ToggleMode();

	UFUNCTION(BlueprintCallable, Category = "Camera")
	void SwapShoulder();

	UFUNCTION(BlueprintPure, Category = "Camera")
	EHRCameraMode GetMode() const { return Mode; }

	UFUNCTION(BlueprintPure, Category = "Camera")
	bool IsFirstPersonView() const { return FPAlpha > 0.5f; }

	void SetAiming(bool bInAiming) { bAiming = bInAiming; }
	void SetCrouched(bool bInCrouched) { bCrouched = bInCrouched; }

	/** Mode forced by context (e.g. lockpicking pulls into a close over-the-shoulder view). */
	void SetContextOverride(bool bEnable, float InOverrideDistance = 120.f);

	/** Re-read user settings (FOV, distance, shoulder, preferred mode). */
	void ApplyUserSettings(bool bApplyMode);

	void AddRecoilKick(float Pitch, float Yaw);

	UPROPERTY(EditDefaultsOnly, Category = "Camera")
	float BlendTime = 0.25f;

	UPROPERTY(EditDefaultsOnly, Category = "Camera")
	float ShoulderOffset = 55.f;

	UPROPERTY(EditDefaultsOnly, Category = "Camera")
	float ShoulderHeight = 60.f;

	UPROPERTY(EditDefaultsOnly, Category = "Camera")
	float AimDistanceScale = 0.55f;

	UPROPERTY(EditDefaultsOnly, Category = "Camera")
	float AimFOVScale = 0.78f;

	UPROPERTY(EditDefaultsOnly, Category = "Camera")
	FVector FirstPersonEyeOffset = FVector(12.f, 0.f, 0.f);

	UPROPERTY(EditDefaultsOnly, Category = "Camera")
	FName HeadBoneName = TEXT("head");

private:
	UPROPERTY() TObjectPtr<USpringArmComponent> Arm;
	UPROPERTY() TObjectPtr<UCameraComponent> Camera;
	UPROPERTY() TObjectPtr<USkeletalMeshComponent> BodyMesh;

	EHRCameraMode Mode = EHRCameraMode::ThirdPerson;
	float FPAlpha = 0.f;           // 0 = third person, 1 = first person
	float ShoulderSign = 1.f;      // +1 right, -1 left
	float ShoulderCurrent = 1.f;
	float AimAlpha = 0.f;
	float CrouchAlpha = 0.f;
	bool bAiming = false;
	bool bCrouched = false;
	bool bContextOverride = false;
	float ContextDistance = 120.f;
	bool bHeadHidden = false;

	float TPDistance = 260.f;
	float TPFOV = 80.f;
	float FPFOV = 90.f;

	FRotator PendingRecoil = FRotator::ZeroRotator;

	bool IsLocallyControlled() const;
	void UpdateHeadVisibility();
};
