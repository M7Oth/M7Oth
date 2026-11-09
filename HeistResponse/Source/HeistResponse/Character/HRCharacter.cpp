#include "Character/HRCharacter.h"
#include "Character/HRCharacterMovementComponent.h"
#include "CameraSystem/HRCameraRigComponent.h"
#include "Interaction/HRInteractionComponent.h"
#include "Inventory/HRInventoryComponent.h"
#include "Combat/HRHealthComponent.h"
#include "Combat/HRWeaponComponent.h"
#include "Heist/HRLockpickComponent.h"
#include "Heist/HRLootBag.h"
#include "Vehicles/HRVehicle.h"
#include "Game/HRGameMode.h"
#include "Game/HRPlayerState.h"
#include "Game/HRPlayerController.h"
#include "Input/HRInputConfig.h"
#include "Core/HRLocalization.h"
#include "Core/HRGameUserSettings.h"
#include "HeistResponse.h"

#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "EnhancedInputComponent.h"
#include "InputActionValue.h"
#include "Net/UnrealNetwork.h"
#include "Engine/DamageEvents.h"
#include "Animation/AnimInstance.h"

AHRCharacter::AHRCharacter(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer.SetDefaultSubobjectClass<UHRCharacterMovementComponent>(ACharacter::CharacterMovementComponentName))
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	SetNetUpdateFrequency(60.f);
	SetMinNetUpdateFrequency(20.f);

	GetCapsuleComponent()->InitCapsuleSize(38.f, 92.f);
	BaseEyeHeight = 68.f;
	CrouchedEyeHeight = 40.f;

	bUseControllerRotationPitch = false;
	bUseControllerRotationRoll = false;
	bUseControllerRotationYaw = false;
	GetCharacterMovement()->bOrientRotationToMovement = true;

	GetMesh()->SetRelativeLocationAndRotation(FVector(0.f, 0.f, -92.f), FRotator(0.f, -90.f, 0.f));
	GetMesh()->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
	GetMesh()->SetCollisionResponseToChannel(ECC_GameTraceChannel2, ECR_Block); // HRWeapon hits per-bone
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_GameTraceChannel2, ECR_Ignore);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block); // interaction focus

	CameraArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraArm"));
	CameraArm->SetupAttachment(GetCapsuleComponent());
	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(CameraArm, USpringArmComponent::SocketName);

	MaskMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("MaskMesh"));
	MaskMesh->SetupAttachment(GetMesh(), TEXT("head"));
	MaskMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	MaskMesh->SetVisibility(false);

	WeaponMesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("WeaponMesh"));
	WeaponMesh->SetupAttachment(GetMesh(), TEXT("hand_r"));
	WeaponMesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	CameraRig = CreateDefaultSubobject<UHRCameraRigComponent>(TEXT("CameraRig"));
	Interaction = CreateDefaultSubobject<UHRInteractionComponent>(TEXT("Interaction"));
	Inventory = CreateDefaultSubobject<UHRInventoryComponent>(TEXT("Inventory"));
	Health = CreateDefaultSubobject<UHRHealthComponent>(TEXT("Health"));
	Weapon = CreateDefaultSubobject<UHRWeaponComponent>(TEXT("Weapon"));
	Lockpick = CreateDefaultSubobject<UHRLockpickComponent>(TEXT("Lockpick"));
}

void AHRCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME_CONDITION(AHRCharacter, bAiming, COND_SkipOwner);
	DOREPLIFETIME(AHRCharacter, bSurrendering);
	DOREPLIFETIME(AHRCharacter, bMasked);
	DOREPLIFETIME(AHRCharacter, CarriedBag);
	DOREPLIFETIME(AHRCharacter, CurrentVehicle);
	DOREPLIFETIME(AHRCharacter, RobberOutfitIndex);
}

void AHRCharacter::BeginPlay()
{
	Super::BeginPlay();
	CameraRig->Initialize(CameraArm, Camera, GetMesh());
	Health->OnLifeStateChanged.AddUObject(this, &AHRCharacter::HandleLifeStateChanged);
	RefreshTeamVisuals();
}

UHRCharacterMovementComponent* AHRCharacter::GetHRMovement() const
{
	return Cast<UHRCharacterMovementComponent>(GetCharacterMovement());
}

AHRPlayerState* AHRCharacter::GetHRPlayerState() const
{
	if (AHRPlayerState* PS = GetPlayerState<AHRPlayerState>()) { return PS; }
	// While driving, the controller possesses the vehicle; the PlayerState lives there.
	return CurrentVehicle ? CurrentVehicle->GetPlayerState<AHRPlayerState>() : nullptr;
}

EHRTeam AHRCharacter::GetTeam() const
{
	const AHRPlayerState* PS = GetHRPlayerState();
	return PS ? PS->GetTeam() : EHRTeam::None;
}

bool AHRCharacter::IsAliveState() const
{
	return Health && Health->IsAlive();
}

bool AHRCharacter::IsArrested() const
{
	const AHRPlayerState* PS = GetHRPlayerState();
	return PS && PS->IsArrested();
}

bool AHRCharacter::IsLockpicking() const
{
	return Lockpick && Lockpick->IsActive();
}

bool AHRCharacter::CanPerformActions() const
{
	return IsAliveState() && !IsArrested() && !IsInVehicle();
}

bool AHRCharacter::CanUseWeapon() const
{
	if (!CanPerformActions() || bSurrendering || IsLockpicking()) { return false; }
	if (IsRobber() && !bMasked) { return false; }
	return GetTeam() != EHRTeam::None;
}

bool AHRCharacter::IsVisiblyHostile() const
{
	return IsRobber() && (bMasked || IsCarryingBag() || IsLockpicking() || bAiming);
}

FVector AHRCharacter::GetEyeLocation() const
{
	return GetActorLocation() + FVector(0.f, 0.f, bIsCrouched ? CrouchedEyeHeight : BaseEyeHeight);
}

FVector AHRCharacter::GetMuzzleLocation() const
{
	if (WeaponMesh && WeaponMesh->GetStaticMesh() && WeaponMesh->DoesSocketExist(TEXT("Muzzle")))
	{
		// Clamp the muzzle to stay inside the capsule's line of fire from the eyes.
		const FVector Socket = WeaponMesh->GetSocketLocation(TEXT("Muzzle"));
		if (FVector::DistSquared(Socket, GetEyeLocation()) < FMath::Square(90.f)) { return Socket; }
	}
	return GetEyeLocation() + GetBaseAimRotation().Vector() * 30.f + FVector(0.f, 0.f, -12.f);
}

// --------------------------------------------------------------------- Possession / input

void AHRCharacter::PossessedBy(AController* NewController)
{
	Super::PossessedBy(NewController);
	ApplyTeamLoadout();
	RefreshTeamVisuals();
}

void AHRCharacter::OnRep_PlayerState()
{
	Super::OnRep_PlayerState();
	RefreshTeamVisuals();
}

void AHRCharacter::PawnClientRestart()
{
	Super::PawnClientRestart();
	if (AHRPlayerController* PC = Cast<AHRPlayerController>(GetController()))
	{
		PC->ApplyInputContextsFor(this);
	}
	if (CameraRig) { CameraRig->ApplyUserSettings(true); }
}

void AHRCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (!EIC) { return; }
	if (!InputConfig)
	{
		if (AHRPlayerController* PC = Cast<AHRPlayerController>(GetController())) { InputConfig = PC->GetInputConfig(); }
	}
	if (!InputConfig)
	{
		UE_LOG(LogHeist, Error, TEXT("AHRCharacter: no input config"));
		return;
	}
	const UHRInputConfig* C = InputConfig;
	EIC->BindAction(C->Move, ETriggerEvent::Triggered, this, &AHRCharacter::InputMove);
	EIC->BindAction(C->Look, ETriggerEvent::Triggered, this, &AHRCharacter::InputLook);
	EIC->BindAction(C->Sprint, ETriggerEvent::Started, this, &AHRCharacter::InputSprintStart);
	EIC->BindAction(C->Sprint, ETriggerEvent::Completed, this, &AHRCharacter::InputSprintStop);
	EIC->BindAction(C->Crouch, ETriggerEvent::Started, this, &AHRCharacter::InputCrouch);
	EIC->BindAction(C->Jump, ETriggerEvent::Started, this, &AHRCharacter::InputJump);
	EIC->BindAction(C->Interact, ETriggerEvent::Started, this, &AHRCharacter::InputInteractStart);
	EIC->BindAction(C->Interact, ETriggerEvent::Completed, this, &AHRCharacter::InputInteractStop);
	EIC->BindAction(C->Fire, ETriggerEvent::Started, this, &AHRCharacter::InputFireStart);
	EIC->BindAction(C->Fire, ETriggerEvent::Completed, this, &AHRCharacter::InputFireStop);
	EIC->BindAction(C->Aim, ETriggerEvent::Started, this, &AHRCharacter::InputAimStart);
	EIC->BindAction(C->Aim, ETriggerEvent::Completed, this, &AHRCharacter::InputAimStop);
	EIC->BindAction(C->Reload, ETriggerEvent::Started, this, &AHRCharacter::InputReload);
	EIC->BindAction(C->ToggleCamera, ETriggerEvent::Started, this, &AHRCharacter::InputToggleCamera);
	EIC->BindAction(C->SwapShoulder, ETriggerEvent::Started, this, &AHRCharacter::InputSwapShoulder);
	EIC->BindAction(C->Surrender, ETriggerEvent::Started, this, &AHRCharacter::InputSurrender);
	EIC->BindAction(C->ToggleMask, ETriggerEvent::Started, this, &AHRCharacter::InputToggleMask);
	EIC->BindAction(C->DropBag, ETriggerEvent::Started, this, &AHRCharacter::InputDropBag);
	EIC->BindAction(C->Shout, ETriggerEvent::Started, this, &AHRCharacter::InputShout);
	EIC->BindAction(C->Trunk, ETriggerEvent::Started, this, &AHRCharacter::InputTrunk);
	EIC->BindAction(C->Gadget, ETriggerEvent::Started, this, &AHRCharacter::InputGadget);
}

void AHRCharacter::InputMove(const FInputActionValue& Value)
{
	if (IsLockpicking() || !Controller) { return; }
	const FVector2D V = Value.Get<FVector2D>();
	const FRotator Yaw(0.f, Controller->GetControlRotation().Yaw, 0.f);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::X), V.Y);
	AddMovementInput(FRotationMatrix(Yaw).GetUnitAxis(EAxis::Y), V.X);
}

void AHRCharacter::InputLook(const FInputActionValue& Value)
{
	FVector2D V = Value.Get<FVector2D>();
	if (IsLockpicking())
	{
		Lockpick->AddLocalPickInput(V.X);
		return;
	}
	float Sens = 1.f;
	bool bInvert = false;
	if (const UHRGameUserSettings* S = UHRGameUserSettings::Get())
	{
		Sens = S->MouseSensitivity * (bAiming ? S->AimSensitivityMultiplier : 1.f);
		bInvert = S->bInvertY;
	}
	AddControllerYawInput(V.X * Sens);
	AddControllerPitchInput((bInvert ? V.Y : -V.Y) * Sens);
}

void AHRCharacter::InputSprintStart() { if (UHRCharacterMovementComponent* M = GetHRMovement()) { M->bWantsToSprint = true; } }
void AHRCharacter::InputSprintStop() { if (UHRCharacterMovementComponent* M = GetHRMovement()) { M->bWantsToSprint = false; } }

void AHRCharacter::InputCrouch()
{
	if (bIsCrouched) { UnCrouch(); } else if (CanPerformActions()) { Crouch(); }
}

void AHRCharacter::InputJump()
{
	if (CanPerformActions() && !IsCarryingBag() && !bSurrendering && !IsLockpicking()) { Jump(); }
}

void AHRCharacter::InputInteractStart() { if (!IsLockpicking()) { Interaction->PressInteract(); } }
void AHRCharacter::InputInteractStop() { Interaction->ReleaseInteract(); }

void AHRCharacter::InputFireStart()
{
	if (IsLockpicking()) { Lockpick->SetLocalTension(true); return; }
	Weapon->StartFire();
}

void AHRCharacter::InputFireStop()
{
	if (IsLockpicking()) { Lockpick->SetLocalTension(false); }
	Weapon->StopFire();
}

void AHRCharacter::InputAimStart()
{
	const UHRGameUserSettings* S = UHRGameUserSettings::Get();
	if (S && S->bToggleAim) { SetAimingLocal(!bAimHeld); return; }
	SetAimingLocal(true);
}

void AHRCharacter::InputAimStop()
{
	const UHRGameUserSettings* S = UHRGameUserSettings::Get();
	if (S && S->bToggleAim) { return; }
	SetAimingLocal(false);
}

void AHRCharacter::SetAimingLocal(bool bNewAiming)
{
	bNewAiming = bNewAiming && CanUseWeapon();
	bAimHeld = bNewAiming;
	bAiming = bNewAiming;
	if (UHRCharacterMovementComponent* M = GetHRMovement()) { M->bWantsToAim = bNewAiming; }
	CameraRig->SetAiming(bNewAiming);
	ServerSetAiming(bNewAiming);
}

void AHRCharacter::ServerSetAiming_Implementation(bool bNewAiming)
{
	bAiming = bNewAiming && CanUseWeapon();
}

void AHRCharacter::InputReload() { Weapon->RequestReload(); }
void AHRCharacter::InputToggleCamera() { CameraRig->ToggleMode(); }
void AHRCharacter::InputSwapShoulder() { CameraRig->SwapShoulder(); }

void AHRCharacter::InputSurrender()
{
	if (IsRobber()) { ServerToggleSurrender(); }
}

void AHRCharacter::ServerToggleSurrender_Implementation()
{
	if (!IsRobber() || !CanPerformActions()) { return; }
	ServerForceSurrender(!bSurrendering);
}

void AHRCharacter::ServerForceSurrender(bool bValue)
{
	if (!HasAuthority()) { return; }
	bSurrendering = bValue;
	if (bSurrendering)
	{
		bAiming = false;
		Interaction->CancelInteraction();
		if (Lockpick) { Lockpick->ServerEndSession(false); }
		if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifySurrenderChanged(this); }
	}
}

void AHRCharacter::InputToggleMask()
{
	if (IsRobber()) { ServerToggleMask(); }
}

void AHRCharacter::ServerToggleMask_Implementation()
{
	if (!IsRobber() || !CanPerformActions()) { return; }
	// Masking up is a commitment: once the alarm is raised, masks stay on.
	if (bMasked)
	{
		const AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
		if (GM && GM->IsAlarmRaised()) { return; }
	}
	bMasked = !bMasked;
	OnRep_Masked();
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyMaskChanged(this); }
}

void AHRCharacter::OnRep_Masked()
{
	if (MaskMesh) { MaskMesh->SetVisibility(bMasked); }
}

void AHRCharacter::InputDropBag()
{
	if (IsCarryingBag()) { ServerDropBag(true); }
}

void AHRCharacter::ServerDropBag_Implementation(bool bThrow)
{
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->DropBagFrom(this, bThrow); }
}

void AHRCharacter::InputShout()
{
	const float Now = GetWorld()->GetTimeSeconds();
	if (Now - LastShoutTime < 1.5f) { return; }
	LastShoutTime = Now;
	ServerShout();
}

void AHRCharacter::ServerShout_Implementation()
{
	if (!CanPerformActions() || bSurrendering) { return; }
	const float Now = GetWorld()->GetTimeSeconds();
	if (Now - LastShoutTime < 1.2f) { return; }
	LastShoutTime = Now;
	MulticastShout();
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyShout(this); }
}

void AHRCharacter::MulticastShout_Implementation()
{
	// Voice line hook: BP_HRCharacter plays team-specific shout cue (police "Hands up!", robbers "Get down!").
}

void AHRCharacter::InputTrunk()
{
	if (AHRVehicle* V = Cast<AHRVehicle>(Interaction->GetFocusedActor())) { ServerTrunkAction(V); }
}

void AHRCharacter::ServerTrunkAction_Implementation(AHRVehicle* Vehicle)
{
	if (!Vehicle || !CanPerformActions()) { return; }
	if (FVector::DistSquared(Vehicle->GetActorLocation(), GetActorLocation()) > FMath::Square(450.f)) { return; }
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->TrunkAction(this, Vehicle); }
}

void AHRCharacter::InputGadget() { ServerUseGadget(); }

void AHRCharacter::ServerUseGadget_Implementation()
{
	if (!CanPerformActions() || bSurrendering) { return; }
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->UseGadget(this); }
}

// --------------------------------------------------------------------- Damage / life

float AHRCharacter::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	if (!HasAuthority() || DamageAmount <= 0.f) { return 0.f; }
	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
	if (GM && !GM->ShouldApplyDamage(EventInstigator, this)) { return 0.f; }
	const float Applied = Health->ApplyDamage(DamageAmount, EventInstigator);
	if (Applied > 0.f)
	{
		Interaction->CancelInteraction();
		if (Lockpick) { Lockpick->ServerEndSession(false); }
		if (GM) { GM->NotifyDamage(EventInstigator, this, Applied); }
	}
	return Applied;
}

void AHRCharacter::HandleLifeStateChanged(EHRLifeState OldState, EHRLifeState NewState)
{
	if (NewState != EHRLifeState::Alive)
	{
		bAiming = false;
		if (CameraRig) { CameraRig->SetAiming(false); }
		if (UHRCharacterMovementComponent* M = GetHRMovement()) { M->bWantsToAim = false; M->bWantsToSprint = false; }
	}
	if (!HasAuthority()) { return; }
	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
	if (!GM) { return; }
	if (NewState == EHRLifeState::Downed)
	{
		Interaction->CancelInteraction();
		if (Lockpick) { Lockpick->ServerEndSession(false); }
		GM->NotifyPlayerDowned(this);
	}
	else if (NewState == EHRLifeState::Incapacitated)
	{
		GM->NotifyPlayerIncapacitated(this);
	}
}

// --------------------------------------------------------------------- IHRInteractable

bool AHRCharacter::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By || By == this || IsArrested() || IsInVehicle()) { return false; }
	const bool bSameTeam = By->GetTeam() == GetTeam();
	if (bSameTeam && Health->IsDowned()) { return true; }
	if (By->IsPolice() && IsRobber() && (Health->IsDowned() || bSurrendering))
	{
		if (!By->GetInventory()->HasItem(HRItems::Zipties))
		{
			OutBlockedReason = HRText("Interact.NoZipties");
			return false;
		}
		return true;
	}
	return false;
}

FText AHRCharacter::GetInteractPrompt(const AHRCharacter* By) const
{
	if (By && By->GetTeam() == GetTeam()) { return HRText("Interact.Revive"); }
	return HRText("Interact.Arrest");
}

float AHRCharacter::GetInteractDuration(const AHRCharacter* By) const
{
	if (By && By->GetTeam() == GetTeam()) { return 5.f; }
	return bSurrendering ? 1.5f : 3.f;
}

void AHRCharacter::OnInteractCompleted(AHRCharacter* By)
{
	FText Dummy;
	if (!CanInteract(By, Dummy)) { return; }
	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
	if (By->GetTeam() == GetTeam())
	{
		Health->Revive(0.4f);
		if (GM) { GM->NotifyRevive(By, this); }
		return;
	}
	if (GM && By->GetInventory()->ConsumeItem(HRItems::Zipties))
	{
		GM->ArrestRobber(this, By);
	}
}

// --------------------------------------------------------------------- Server state helpers

void AHRCharacter::ServerSetCarriedBag(AHRLootBag* Bag)
{
	if (!HasAuthority()) { return; }
	CarriedBag = Bag;
}

void AHRCharacter::ServerEnterVehicle(AHRVehicle* Vehicle)
{
	if (!HasAuthority() || !Vehicle) { return; }
	Interaction->CancelInteraction();
	Weapon->StopFire();
	bAiming = false;
	CurrentVehicle = Vehicle;
	OnRep_CurrentVehicle();
}

void AHRCharacter::ServerLeaveVehicle(const FVector& ExitLocation)
{
	if (!HasAuthority()) { return; }
	CurrentVehicle = nullptr;
	OnRep_CurrentVehicle();
	SetActorLocation(ExitLocation, false, nullptr, ETeleportType::TeleportPhysics);
}

void AHRCharacter::OnRep_CurrentVehicle()
{
	const bool bSeated = CurrentVehicle != nullptr;
	SetActorHiddenInGame(bSeated);
	SetActorEnableCollision(!bSeated);
	GetCharacterMovement()->SetMovementMode(bSeated ? MOVE_None : MOVE_Walking);
	if (bSeated)
	{
		AttachToActor(CurrentVehicle, FAttachmentTransformRules::SnapToTargetNotIncludingScale);
	}
	else
	{
		DetachFromActor(FDetachmentTransformRules::KeepWorldTransform);
		SetActorRotation(FRotator(0.f, GetActorRotation().Yaw, 0.f));
	}
}

void AHRCharacter::ServerOnArrested()
{
	if (!HasAuthority()) { return; }
	Interaction->CancelInteraction();
	if (Lockpick) { Lockpick->ServerEndSession(false); }
	bSurrendering = false;
	bAiming = false;
	bMasked = false;
	OnRep_Masked();
	Health->ResetToFull();
	Inventory->ClearAll();
}

void AHRCharacter::ServerOnReleased()
{
	if (!HasAuthority()) { return; }
	Health->ResetToFull();
}

void AHRCharacter::ApplyTeamLoadout()
{
	if (!HasAuthority()) { return; }
	const EHRTeam Team = GetTeam();
	Inventory->ClearAll();
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>())
	{
		Weapon->SetWeaponSpec(GM->GetWeaponSpecFor(Team));
	}
	if (Team == EHRTeam::Police)
	{
		Inventory->AddItem(HRItems::Zipties, 6);
		Inventory->AddItem(HRItems::SpikeStrip, 1);
		Inventory->AddItem(HRItems::MedKit, 1);
	}
	else if (Team == EHRTeam::Robbers)
	{
		// Lockpicks and the drill are collected from the getaway van (AHREquipmentCrate).
		Inventory->AddItem(HRItems::SmokeGrenade, 1);
		RobberOutfitIndex = static_cast<uint8>(FMath::RandRange(0, FMath::Max(0, RobberMeshes.Num() - 1)));
	}
}

void AHRCharacter::RefreshTeamVisuals()
{
	const EHRTeam Team = GetTeam();
	if (Team == AppliedVisualTeam) { return; }
	AppliedVisualTeam = Team;
	if (Team == EHRTeam::Police && PoliceMesh)
	{
		GetMesh()->SetSkeletalMesh(PoliceMesh);
	}
	else if (Team == EHRTeam::Robbers && RobberMeshes.Num() > 0)
	{
		const int32 Idx = FMath::Clamp<int32>(RobberOutfitIndex, 0, RobberMeshes.Num() - 1);
		if (RobberMeshes[Idx]) { GetMesh()->SetSkeletalMesh(RobberMeshes[Idx]); }
	}
}

void AHRCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	if (AppliedVisualTeam != GetTeam()) { RefreshTeamVisuals(); }

	// Orientation: strafe-style when aiming or in first person, movement-oriented otherwise.
	const bool bStrafe = bAiming || (CameraRig && CameraRig->IsFirstPersonView() && IsLocallyControlled()) || Weapon->IsReloading();
	GetCharacterMovement()->bOrientRotationToMovement = !bStrafe;
	bUseControllerRotationYaw = bStrafe && CanPerformActions();
	if (CameraRig) { CameraRig->SetCrouched(bIsCrouched); }

	if (IsLocallyControlled() && bAimHeld && !CanUseWeapon()) { SetAimingLocal(false); }
}

void AHRCharacter::PlayFireMontageLocal()
{
	if (FireMontage && GetMesh()->GetAnimInstance())
	{
		GetMesh()->GetAnimInstance()->Montage_Play(FireMontage, 1.f);
	}
}

void AHRCharacter::OnShotFX(const FVector& Muzzle, const FVector& Impact, bool bHitCharacter)
{
	// Visual hook for BP: tracer / impact decal (Niagara assets live in the BP child).
}
