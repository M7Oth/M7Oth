#include "Vehicles/HRVehicle.h"
#include "Character/HRCharacter.h"
#include "Game/HRGameMode.h"
#include "Game/HRPlayerController.h"
#include "Input/HRInputConfig.h"
#include "Core/HRLocalization.h"
#include "HeistResponse.h"

#include "ChaosWheeledVehicleMovementComponent.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "Components/AudioComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "EnhancedInputComponent.h"
#include "InputActionValue.h"
#include "Kismet/GameplayStatics.h"
#include "Net/UnrealNetwork.h"

UHRVehicleWheelFront::UHRVehicleWheelFront()
{
	WheelRadius = 36.f;
	WheelWidth = 22.f;
	bAffectedByHandbrake = false;
	bAffectedBySteering = true;
	MaxSteerAngle = 38.f;
	FrictionForceMultiplier = 3.f;
	CorneringStiffness = 1200.f;
	SuspensionMaxRaise = 8.f;
	SuspensionMaxDrop = 10.f;
}

UHRVehicleWheelRear::UHRVehicleWheelRear()
{
	WheelRadius = 36.f;
	WheelWidth = 24.f;
	bAffectedByHandbrake = true;
	bAffectedBySteering = false;
	MaxSteerAngle = 0.f;
	FrictionForceMultiplier = 3.f;
	CorneringStiffness = 1100.f;
	SuspensionMaxRaise = 8.f;
	SuspensionMaxDrop = 10.f;
}

AHRVehicle::AHRVehicle()
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	SetNetUpdateFrequency(60.f);
	SetNetCullDistanceSquared(FMath::Square(120000.f)); // pursuits span the whole district

	UChaosWheeledVehicleMovementComponent* Move = CastChecked<UChaosWheeledVehicleMovementComponent>(GetVehicleMovement());
	Move->WheelSetups.SetNum(4);
	Move->WheelSetups[0].WheelClass = UHRVehicleWheelFront::StaticClass();
	Move->WheelSetups[0].BoneName = TEXT("wheel_front_left");
	Move->WheelSetups[1].WheelClass = UHRVehicleWheelFront::StaticClass();
	Move->WheelSetups[1].BoneName = TEXT("wheel_front_right");
	Move->WheelSetups[2].WheelClass = UHRVehicleWheelRear::StaticClass();
	Move->WheelSetups[2].BoneName = TEXT("wheel_rear_left");
	Move->WheelSetups[3].WheelClass = UHRVehicleWheelRear::StaticClass();
	Move->WheelSetups[3].BoneName = TEXT("wheel_rear_right");
	Move->ChassisHeight = 140.f;
	Move->DragCoefficient = 0.31f;
	Move->DownforceCoefficient = 0.3f;
	Move->CenterOfMassOverride = FVector(0.f, 0.f, -15.f);
	Move->bEnableCenterOfMassOverride = true;
	Move->EngineSetup.MaxRPM = 6500.f;
	Move->EngineSetup.MaxTorque = 600.f;
	Move->TransmissionSetup.bUseAutomaticGears = true;
	Move->TransmissionSetup.bUseAutoReverse = true;
	Move->SteeringSetup.SteeringType = ESteeringType::AngleRatio;
	Move->bReverseAsBrake = true;

	ChaseArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("ChaseArm"));
	ChaseArm->SetupAttachment(GetMesh());
	ChaseArm->TargetArmLength = 650.f;
	ChaseArm->SocketOffset = FVector(0.f, 0.f, 180.f);
	ChaseArm->bEnableCameraLag = true;
	ChaseArm->CameraLagSpeed = 8.f;
	ChaseArm->bEnableCameraRotationLag = true;
	ChaseArm->CameraRotationLagSpeed = 6.f;
	ChaseArm->bInheritPitch = false;
	ChaseArm->bInheritRoll = false;
	ChaseArm->bDoCollisionTest = true;
	ChaseCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("ChaseCamera"));
	ChaseCamera->SetupAttachment(ChaseArm, USpringArmComponent::SocketName);
	ChaseCamera->SetFieldOfView(90.f);
	CockpitCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("CockpitCamera"));
	CockpitCamera->SetupAttachment(GetMesh());
	CockpitCamera->SetRelativeLocation(FVector(-20.f, -38.f, 120.f));
	CockpitCamera->SetAutoActivate(false);

	EngineAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("EngineAudio"));
	EngineAudio->SetupAttachment(GetMesh());
	EngineAudio->bAutoActivate = false;
	SirenAudio = CreateDefaultSubobject<UAudioComponent>(TEXT("SirenAudio"));
	SirenAudio->SetupAttachment(GetMesh());
	SirenAudio->bAutoActivate = false;

	LightBarRed = CreateDefaultSubobject<UPointLightComponent>(TEXT("LightBarRed"));
	LightBarRed->SetupAttachment(GetMesh());
	LightBarRed->SetRelativeLocation(FVector(-10.f, -30.f, 160.f));
	LightBarRed->SetLightColor(FLinearColor(1.f, 0.05f, 0.05f));
	LightBarRed->SetIntensity(0.f);
	LightBarRed->SetAttenuationRadius(900.f);
	LightBarRed->SetCastShadows(false);
	LightBarBlue = CreateDefaultSubobject<UPointLightComponent>(TEXT("LightBarBlue"));
	LightBarBlue->SetupAttachment(GetMesh());
	LightBarBlue->SetRelativeLocation(FVector(-10.f, 30.f, 160.f));
	LightBarBlue->SetLightColor(FLinearColor(0.05f, 0.2f, 1.f));
	LightBarBlue->SetIntensity(0.f);
	LightBarBlue->SetAttenuationRadius(900.f);
	LightBarBlue->SetCastShadows(false);

	GetMesh()->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
	GetMesh()->SetCollisionResponseToChannel(ECC_GameTraceChannel2, ECR_Block);
	GetMesh()->SetNotifyRigidBodyCollision(true);
}

void AHRVehicle::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRVehicle, OwnerTeam);
	DOREPLIFETIME(AHRVehicle, Driver);
	DOREPLIFETIME(AHRVehicle, Passengers);
	DOREPLIFETIME(AHRVehicle, bSirenOn);
	DOREPLIFETIME(AHRVehicle, bDisabled);
	DOREPLIFETIME(AHRVehicle, bTiresBlown);
	DOREPLIFETIME(AHRVehicle, Health);
	DOREPLIFETIME(AHRVehicle, TrunkCount);
}

void AHRVehicle::BeginPlay()
{
	Super::BeginPlay();
	Health = MaxHealth;
	if (HasAuthority())
	{
		if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { VehicleLedgerId = GM->RegisterVehicle(this); }
	}
	if (EngineLoop && GetNetMode() != NM_DedicatedServer)
	{
		EngineAudio->SetSound(EngineLoop);
		EngineAudio->Play();
	}
}

TArray<AHRCharacter*> AHRVehicle::GetOccupants() const
{
	TArray<AHRCharacter*> Out;
	if (Driver) { Out.Add(Driver); }
	for (AHRCharacter* P : Passengers) { if (P) { Out.Add(P); } }
	return Out;
}

// ------------------------------------------------------------------------- Interaction (enter)

bool AHRVehicle::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By || By->IsInVehicle() || By->IsCarryingBag() || By->IsSurrendering()) { return false; }
	// Police cruisers are locked to robbers, getaway cars are free for anyone (police can impound).
	if (OwnerTeam == EHRTeam::Police && !By->IsPolice()) { OutBlockedReason = HRText("Interact.VehicleLocked"); return false; }
	if (!Driver && !bDisabled) { return true; }
	if (Passengers.Num() < PassengerSeats) { return true; }
	OutBlockedReason = HRText("Interact.VehicleFull");
	return false;
}

FText AHRVehicle::GetInteractPrompt(const AHRCharacter* By) const
{
	return (!Driver && !bDisabled) ? HRText("Interact.Drive") : HRText("Interact.Ride");
}

void AHRVehicle::OnInteractCompleted(AHRCharacter* By)
{
	FText Reason;
	if (!HasAuthority() || !CanInteract(By, Reason)) { return; }
	if (!Driver && !bDisabled) { SeatDriver(By); }
	else { SeatPassenger(By); }
}

void AHRVehicle::SeatDriver(AHRCharacter* Ch)
{
	AController* C = Ch->GetController();
	if (!C) { return; }
	Driver = Ch;
	Ch->ServerEnterVehicle(this);
	C->UnPossess();
	C->Possess(this);
	// Keep the character's PlayerState association for team lookups on the vehicle's occupant.
	if (OwnerTeam == EHRTeam::None && Ch->IsRobber()) { OwnerTeam = EHRTeam::Robbers; }
}

void AHRVehicle::SeatPassenger(AHRCharacter* Ch)
{
	Passengers.Add(Ch);
	Ch->ServerEnterVehicle(this);
}

FVector AHRVehicle::FindExitLocation(int32 SeatIndex) const
{
	const FVector Right = GetActorRightVector();
	const FVector Fwd = GetActorForwardVector();
	const FVector Candidates[] = {
		GetActorLocation() - Right * 220.f,
		GetActorLocation() + Right * 220.f,
		GetActorLocation() - Right * 220.f - Fwd * 150.f,
		GetActorLocation() + Right * 220.f - Fwd * 150.f,
		GetActorLocation() - Fwd * 380.f,
		GetActorLocation() + FVector(0.f, 0.f, 250.f),
	};
	const FCollisionShape Capsule = FCollisionShape::MakeCapsule(38.f, 92.f);
	const int32 NumCandidates = static_cast<int32>(UE_ARRAY_COUNT(Candidates));
	for (int32 i = 0; i < NumCandidates; ++i)
	{
		const FVector P = Candidates[(i + FMath::Max(0, SeatIndex)) % NumCandidates] + FVector(0.f, 0.f, 60.f);
		if (!GetWorld()->OverlapAnyTestByChannel(P, FQuat::Identity, ECC_Pawn, Capsule)) { return P; }
	}
	return GetActorLocation() + FVector(0.f, 0.f, 300.f);
}

void AHRVehicle::Unseat(AHRCharacter* Ch, bool bRepossess)
{
	if (!Ch) { return; }
	const int32 SeatIndex = (Ch == Driver) ? 0 : 1 + Passengers.IndexOfByKey(Ch);
	const FVector Exit = FindExitLocation(SeatIndex);
	if (Ch == Driver)
	{
		Driver = nullptr;
		AController* C = GetController();
		GetVehicleMovementComponent()->SetThrottleInput(0.f);
		GetVehicleMovementComponent()->SetHandbrakeInput(true);
		if (C && bRepossess)
		{
			C->UnPossess();
			Ch->ServerLeaveVehicle(Exit);
			C->Possess(Ch);
		}
		else
		{
			if (C) { C->UnPossess(); }
			Ch->ServerLeaveVehicle(Exit);
		}
	}
	else
	{
		Passengers.Remove(Ch);
		Ch->ServerLeaveVehicle(Exit);
	}
	if (bSirenOn) { bSirenOn = false; OnRep_Siren(); }
}

void AHRVehicle::ServerExitVehicle_Implementation()
{
	if (IsMoving() && GetVelocity().Size() > 1500.f) { return; } // no bailing out at high speed
	Unseat(Driver, true);
}

void AHRVehicle::ServerRemoveOccupant(AHRCharacter* Ch)
{
	if (HasAuthority()) { Unseat(Ch, false); }
}

void AHRVehicle::ServerDriverDisconnected()
{
	if (HasAuthority() && Driver) { Unseat(Driver, false); }
}

void AHRVehicle::ServerEjectAllForExtraction()
{
	if (!HasAuthority()) { return; }
	TArray<AHRCharacter*> All = GetOccupants();
	for (AHRCharacter* C : All) { if (C && C->IsRobber()) { Unseat(C, true); } }
}

// ------------------------------------------------------------------------- Input

void AHRVehicle::PawnClientRestart()
{
	Super::PawnClientRestart();
	if (AHRPlayerController* PC = Cast<AHRPlayerController>(GetController())) { PC->ApplyInputContextsFor(this); }
}

void AHRVehicle::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
	UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	AHRPlayerController* PC = Cast<AHRPlayerController>(GetController());
	UHRInputConfig* C = PC ? PC->GetInputConfig() : nullptr;
	if (!EIC || !C) { return; }
	EIC->BindAction(C->Throttle, ETriggerEvent::Triggered, this, &AHRVehicle::InputThrottle);
	EIC->BindAction(C->Throttle, ETriggerEvent::Completed, this, &AHRVehicle::InputThrottle);
	EIC->BindAction(C->Steer, ETriggerEvent::Triggered, this, &AHRVehicle::InputSteer);
	EIC->BindAction(C->Steer, ETriggerEvent::Completed, this, &AHRVehicle::InputSteer);
	EIC->BindAction(C->Handbrake, ETriggerEvent::Started, this, &AHRVehicle::InputHandbrakeOn);
	EIC->BindAction(C->Handbrake, ETriggerEvent::Completed, this, &AHRVehicle::InputHandbrakeOff);
	EIC->BindAction(C->VehicleExit, ETriggerEvent::Started, this, &AHRVehicle::InputExit);
	EIC->BindAction(C->Siren, ETriggerEvent::Started, this, &AHRVehicle::InputSiren);
	EIC->BindAction(C->VehicleLook, ETriggerEvent::Triggered, this, &AHRVehicle::InputLook);
	EIC->BindAction(C->VehicleCamera, ETriggerEvent::Started, this, &AHRVehicle::InputToggleCamera);
}

void AHRVehicle::InputThrottle(const FInputActionValue& V)
{
	const float Value = bDisabled ? 0.f : V.Get<float>();
	UChaosVehicleMovementComponent* M = GetVehicleMovementComponent();
	if (Value >= 0.f) { M->SetThrottleInput(Value); M->SetBrakeInput(0.f); }
	else { M->SetThrottleInput(0.f); M->SetBrakeInput(-Value); }
}

void AHRVehicle::InputSteer(const FInputActionValue& V)
{
	GetVehicleMovementComponent()->SetSteeringInput(V.Get<float>());
}

void AHRVehicle::InputHandbrakeOn() { GetVehicleMovementComponent()->SetHandbrakeInput(true); }
void AHRVehicle::InputHandbrakeOff() { GetVehicleMovementComponent()->SetHandbrakeInput(false); }
void AHRVehicle::InputExit() { ServerExitVehicle(); }
void AHRVehicle::InputSiren() { if (bHasSiren) { ServerToggleSiren(); } }

void AHRVehicle::InputLook(const FInputActionValue& V)
{
	const FVector2D L = V.Get<FVector2D>();
	ChaseArm->AddRelativeRotation(FRotator(0.f, L.X, 0.f));
}

void AHRVehicle::InputToggleCamera()
{
	bCockpitView = !bCockpitView;
	ChaseCamera->SetActive(!bCockpitView);
	CockpitCamera->SetActive(bCockpitView);
}

void AHRVehicle::ServerToggleSiren_Implementation()
{
	if (!bHasSiren || bDisabled) { return; }
	bSirenOn = !bSirenOn;
	OnRep_Siren();
}

void AHRVehicle::OnRep_Siren()
{
	if (GetNetMode() == NM_DedicatedServer) { return; }
	if (bSirenOn && SirenLoop) { SirenAudio->SetSound(SirenLoop); SirenAudio->Play(); }
	else { SirenAudio->Stop(); }
	if (!bSirenOn) { LightBarRed->SetIntensity(0.f); LightBarBlue->SetIntensity(0.f); }
}

// ------------------------------------------------------------------------- Damage

float AHRVehicle::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	if (!HasAuthority() || bDisabled || DamageAmount <= 0.f) { return 0.f; }
	Health = FMath::Max(0.f, Health - DamageAmount);
	if (Health <= 0.f) { SetDisabled(); }
	return DamageAmount;
}

void AHRVehicle::NotifyHit(UPrimitiveComponent* MyComp, AActor* Other, UPrimitiveComponent* OtherComp, bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse, const FHitResult& Hit)
{
	Super::NotifyHit(MyComp, Other, OtherComp, bSelfMoved, HitLocation, HitNormal, NormalImpulse, Hit);
	const float Impulse = NormalImpulse.Size();
	const float Now = GetWorld()->GetTimeSeconds();
	if (Impulse < 60000.f || Now - LastCrashTime < 0.3f) { return; }
	LastCrashTime = Now;
	if (CrashSound && GetNetMode() != NM_DedicatedServer) { UGameplayStatics::PlaySoundAtLocation(this, CrashSound, HitLocation); }
	if (HasAuthority() && !bDisabled)
	{
		Health = FMath::Max(0.f, Health - Impulse * CollisionDamageScale);
		if (Health <= 0.f) { SetDisabled(); }
	}
}

void AHRVehicle::ServerBlowTires()
{
	if (!HasAuthority() || bTiresBlown) { return; }
	bTiresBlown = true;
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyAll(TEXT("Notify.TiresBlown"), EHRNotifyType::Info); }
}

void AHRVehicle::SetDisabled()
{
	bDisabled = true;
	OnRep_Disabled();
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->OnVehicleWrecked(this); }
}

void AHRVehicle::OnRep_Disabled()
{
	if (bDisabled)
	{
		GetVehicleMovementComponent()->SetThrottleInput(0.f);
		if (EngineAudio) { EngineAudio->Stop(); }
		bSirenOn = false;
		OnRep_Siren();
	}
}

// ------------------------------------------------------------------------- Trunk

void AHRVehicle::ServerAddTrunkBag(int32 LedgerId) { TrunkBagIds.AddUnique(LedgerId); TrunkCount = TrunkBagIds.Num(); }
void AHRVehicle::ServerRemoveTrunkBag(int32 LedgerId) { TrunkBagIds.Remove(LedgerId); TrunkCount = TrunkBagIds.Num(); }
void AHRVehicle::ServerClearTrunk() { TrunkBagIds.Reset(); TrunkCount = 0; }

// ------------------------------------------------------------------------- Tick

void AHRVehicle::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	UChaosWheeledVehicleMovementComponent* M = Cast<UChaosWheeledVehicleMovementComponent>(GetVehicleMovementComponent());

	// Blown tires / disabled: clamp speed by braking above the cap (server and owning client agree).
	if (M && (bTiresBlown || bDisabled))
	{
		const float CapKmh = bDisabled ? 0.f : 160.f * BlownTireMaxSpeedScale;
		if (FMath::Abs(M->GetForwardSpeed()) * 0.036f > CapKmh) { M->SetThrottleInput(0.f); M->SetBrakeInput(bDisabled ? 1.f : 0.4f); }
	}

	if (GetNetMode() == NM_DedicatedServer) { return; }

	if (M && EngineAudio && EngineAudio->IsPlaying())
	{
		const float Rpm01 = FMath::Clamp(M->GetEngineRotationSpeed() / FMath::Max(1.f, M->GetEngineMaxRotationSpeed()), 0.f, 1.f);
		EngineAudio->SetPitchMultiplier(0.7f + Rpm01 * 1.1f);
		EngineAudio->SetFloatParameter(TEXT("RPM"), Rpm01);
	}
	if (bSirenOn)
	{
		LightPhase += DeltaSeconds * 6.f;
		const bool bRedPhase = FMath::Fmod(LightPhase, 2.f) < 1.f;
		LightBarRed->SetIntensity(bRedPhase ? 20000.f : 0.f);
		LightBarBlue->SetIntensity(bRedPhase ? 0.f : 20000.f);
	}
}
