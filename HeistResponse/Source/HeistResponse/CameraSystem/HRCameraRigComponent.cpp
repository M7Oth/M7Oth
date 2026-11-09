#include "CameraSystem/HRCameraRigComponent.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/Character.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Core/HRGameUserSettings.h"

UHRCameraRigComponent::UHRCameraRigComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PostPhysics;
	SetIsReplicatedByDefault(false);
}

void UHRCameraRigComponent::Initialize(USpringArmComponent* InArm, UCameraComponent* InCamera, USkeletalMeshComponent* InBodyMesh)
{
	Arm = InArm;
	Camera = InCamera;
	BodyMesh = InBodyMesh;
	if (Arm)
	{
		Arm->bUsePawnControlRotation = true;
		Arm->bDoCollisionTest = true;
		Arm->ProbeSize = 14.f;
		Arm->ProbeChannel = ECC_Camera;
		Arm->bEnableCameraLag = false;
		Arm->bEnableCameraRotationLag = false;
	}
	if (Camera)
	{
		Camera->bUsePawnControlRotation = false;
	}
	ApplyUserSettings(true);
	FPAlpha = (Mode == EHRCameraMode::FirstPerson) ? 1.f : 0.f;
}

bool UHRCameraRigComponent::IsLocallyControlled() const
{
	const APawn* Pawn = Cast<APawn>(GetOwner());
	return Pawn && Pawn->IsLocallyControlled();
}

void UHRCameraRigComponent::ApplyUserSettings(bool bApplyMode)
{
	if (const UHRGameUserSettings* S = UHRGameUserSettings::Get())
	{
		TPDistance = S->ThirdPersonDistance;
		TPFOV = S->ThirdPersonFOV;
		FPFOV = S->FirstPersonFOV;
		ShoulderSign = S->bRightShoulder ? 1.f : -1.f;
		if (bApplyMode) { Mode = S->PreferredCameraMode; }
	}
}

void UHRCameraRigComponent::SetMode(EHRCameraMode NewMode, bool bInstant)
{
	Mode = NewMode;
	if (bInstant) { FPAlpha = (Mode == EHRCameraMode::FirstPerson) ? 1.f : 0.f; }
	if (UHRGameUserSettings* S = UHRGameUserSettings::Get())
	{
		if (S->PreferredCameraMode != Mode)
		{
			S->PreferredCameraMode = Mode;
			S->SaveSettings();
		}
	}
}

void UHRCameraRigComponent::ToggleMode()
{
	SetMode(Mode == EHRCameraMode::ThirdPerson ? EHRCameraMode::FirstPerson : EHRCameraMode::ThirdPerson);
}

void UHRCameraRigComponent::SwapShoulder()
{
	ShoulderSign = -ShoulderSign;
	if (UHRGameUserSettings* S = UHRGameUserSettings::Get())
	{
		S->bRightShoulder = ShoulderSign > 0.f;
		S->SaveSettings();
	}
}

void UHRCameraRigComponent::SetContextOverride(bool bEnable, float InOverrideDistance)
{
	bContextOverride = bEnable;
	ContextDistance = InOverrideDistance;
}

void UHRCameraRigComponent::AddRecoilKick(float Pitch, float Yaw)
{
	PendingRecoil.Pitch += Pitch;
	PendingRecoil.Yaw += Yaw;
}

void UHRCameraRigComponent::UpdateHeadVisibility()
{
	if (!BodyMesh || HeadBoneName.IsNone()) { return; }
	const bool bShouldHide = FPAlpha > 0.5f;
	if (bShouldHide == bHeadHidden) { return; }
	bHeadHidden = bShouldHide;
	if (bHeadHidden) { BodyMesh->HideBoneByName(HeadBoneName, PBO_None); }
	else { BodyMesh->UnHideBoneByName(HeadBoneName); }
}

void UHRCameraRigComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (!Arm || !Camera || !IsLocallyControlled()) { return; }

	const float Rate = BlendTime > KINDA_SMALL_NUMBER ? DeltaTime / BlendTime : 1.f;
	const bool bWantFP = (Mode == EHRCameraMode::FirstPerson) && !bContextOverride;
	FPAlpha = FMath::Clamp(FPAlpha + (bWantFP ? Rate : -Rate), 0.f, 1.f);
	AimAlpha = FMath::Clamp(AimAlpha + (bAiming ? Rate * 1.5f : -Rate * 1.5f), 0.f, 1.f);
	CrouchAlpha = FMath::Clamp(CrouchAlpha + (bCrouched ? Rate : -Rate), 0.f, 1.f);
	ShoulderCurrent = FMath::FInterpTo(ShoulderCurrent, ShoulderSign, DeltaTime, 12.f);

	// Smoothstep for a pleasant ease-in/out.
	const float A = FPAlpha * FPAlpha * (3.f - 2.f * FPAlpha);
	const float Aim = AimAlpha * AimAlpha * (3.f - 2.f * AimAlpha);

	// Pivot: eye height for FP, shoulder height for TP.
	float EyeHeight = 64.f;
	if (const APawn* Pawn = Cast<APawn>(GetOwner()))
	{
		EyeHeight = Pawn->BaseEyeHeight;
		if (const ACharacter* Ch = Cast<ACharacter>(Pawn))
		{
			// Arm is attached to the capsule; account for crouch capsule shrink via EyeHeight.
			EyeHeight = Ch->bIsCrouched ? Ch->CrouchedEyeHeight : Ch->BaseEyeHeight;
		}
	}
	const FVector TPPivot(0.f, 0.f, EyeHeight - 10.f - CrouchAlpha * 10.f);
	const FVector FPPivot = FVector(0.f, 0.f, EyeHeight) + FirstPersonEyeOffset;
	Arm->SetRelativeLocation(FMath::Lerp(TPPivot, FPPivot, A));

	const float TPLen = bContextOverride ? ContextDistance : FMath::Lerp(TPDistance, TPDistance * AimDistanceScale, Aim);
	Arm->TargetArmLength = FMath::Lerp(TPLen, 0.f, A);
	const FVector TPSocket(0.f, ShoulderCurrent * ShoulderOffset * (1.f - 0.25f * Aim), ShoulderHeight * 0.35f);
	Arm->SocketOffset = FMath::Lerp(TPSocket, FVector::ZeroVector, A);
	Arm->bDoCollisionTest = A < 0.99f;

	const float BaseFOV = FMath::Lerp(TPFOV, FPFOV, A);
	Camera->SetFieldOfView(BaseFOV * FMath::Lerp(1.f, AimFOVScale, Aim));

	UpdateHeadVisibility();

	// Recoil is applied to the control rotation so it affects aim identically in both perspectives.
	if (!PendingRecoil.IsNearlyZero())
	{
		if (APawn* Pawn = Cast<APawn>(GetOwner()))
		{
			const FRotator Step = PendingRecoil * FMath::Min(1.f, DeltaTime * 20.f);
			Pawn->AddControllerPitchInput(-Step.Pitch);
			Pawn->AddControllerYawInput(Step.Yaw);
			PendingRecoil -= Step;
		}
	}
}
