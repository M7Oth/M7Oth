#include "AI/HRNPCCharacter.h"
#include "Character/HRCharacter.h"
#include "Inventory/HRInventoryComponent.h"
#include "Game/HRGameMode.h"
#include "Core/HRLocalization.h"
#include "Core/HRTypes.h"
#include "AIController.h"
#include "NavigationSystem.h"
#include "Engine/TargetPoint.h"
#include "EngineUtils.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Net/UnrealNetwork.h"

AHRNPCCharacter::AHRNPCCharacter()
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	SetNetUpdateFrequency(10.f);
	AIControllerClass = AAIController::StaticClass();
	AutoPossessAI = EAutoPossessAI::PlacedInWorldOrSpawned;
	GetCapsuleComponent()->InitCapsuleSize(36.f, 90.f);
	GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
	GetMesh()->SetRelativeLocationAndRotation(FVector(0.f, 0.f, -90.f), FRotator(0.f, -90.f, 0.f));
	GetMesh()->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
	GetCharacterMovement()->bOrientRotationToMovement = true;
	GetCharacterMovement()->MaxWalkSpeed = 160.f;
	bUseControllerRotationYaw = false;
}

void AHRNPCCharacter::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRNPCCharacter, NPCState);
	DOREPLIFETIME(AHRNPCCharacter, bHasKeycard);
	DOREPLIFETIME(AHRNPCCharacter, MeshVariant);
	DOREPLIFETIME(AHRNPCCharacter, Detection);
}

void AHRNPCCharacter::BeginPlay()
{
	Super::BeginPlay();
	HomeLocation = GetActorLocation();
	if (HasAuthority())
	{
		bHasKeycard = (Role == EHRNPCRole::Manager);
		MeshVariant = static_cast<uint8>(MeshVariants.Num() > 0 ? FMath::RandRange(0, MeshVariants.Num() - 1) : 0);
		SetNPCState(Role == EHRNPCRole::Employee || Role == EHRNPCRole::Manager ? EHRNPCState::Idle : EHRNPCState::Wandering);
	}
	if (MeshVariants.IsValidIndex(MeshVariant) && MeshVariants[MeshVariant]) { GetMesh()->SetSkeletalMesh(MeshVariants[MeshVariant]); }
}

void AHRNPCCharacter::SetNPCState(EHRNPCState NewState)
{
	if (NPCState == NewState) { return; }
	NPCState = NewState;
	StateTime = 0.f;
	OnRep_NPCState();
}

void AHRNPCCharacter::OnRep_NPCState()
{
	const bool bRun = NPCState == EHRNPCState::Fleeing || NPCState == EHRNPCState::Released;
	GetCharacterMovement()->MaxWalkSpeed = bRun ? 450.f : 160.f;
	if (NPCState == EHRNPCState::Cowering || NPCState == EHRNPCState::Hostage)
	{
		GetCharacterMovement()->StopMovementImmediately();
	}
}

bool AHRNPCCharacter::CanSee(const AHRCharacter* Target) const
{
	if (!Target || Target->IsInVehicle()) { return false; }
	if (NPCState == EHRNPCState::Hostage) { return false; }
	const FVector Eye = GetActorLocation() + FVector(0.f, 0.f, BaseEyeHeight);
	const FVector To = Target->GetEyeLocation() - Eye;
	const float Dist = To.Size();
	if (Dist > SightDistance) { return false; }
	if (Dist > 150.f && FVector::DotProduct(To / Dist, GetActorForwardVector()) < FMath::Cos(FMath::DegreesToRadians(SightHalfAngle))) { return false; }
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(HRNPCSight), false, this);
	return !GetWorld()->LineTraceSingleByChannel(Hit, Eye, Target->GetEyeLocation(), ECC_Visibility, Params) || Hit.GetActor() == Target;
}

AHRCharacter* AHRNPCCharacter::FindVisibleThreat() const
{
	AHRCharacter* Best = nullptr;
	float BestDist = TNumericLimits<float>::Max();
	for (TActorIterator<AHRCharacter> It(GetWorld()); It; ++It)
	{
		AHRCharacter* C = *It;
		if (!C->IsRobber() || !C->IsVisiblyHostile() || !CanSee(C)) { continue; }
		const float D = FVector::DistSquared(C->GetActorLocation(), GetActorLocation());
		if (D < BestDist) { BestDist = D; Best = C; }
	}
	return Best;
}

void AHRNPCCharacter::MoveTo(const FVector& Location, bool bRun)
{
	if (AAIController* AI = Cast<AAIController>(GetController()))
	{
		GetCharacterMovement()->MaxWalkSpeed = bRun ? 450.f : 160.f;
		AI->MoveToLocation(Location, 60.f, true, true, true, true);
	}
}

FVector AHRNPCCharacter::RandomNearbyPoint() const
{
	if (const UNavigationSystemV1* Nav = FNavigationSystem::GetCurrent<UNavigationSystemV1>(GetWorld()))
	{
		FNavLocation Out;
		if (Nav->GetRandomReachablePointInRadius(HomeLocation, WanderRadius, Out)) { return Out.Location; }
	}
	return HomeLocation;
}

FVector AHRNPCCharacter::FindSafePoint() const
{
	FVector Best = HomeLocation;
	float BestDist = TNumericLimits<float>::Max();
	for (TActorIterator<ATargetPoint> It(GetWorld()); It; ++It)
	{
		if (!It->Tags.Contains(HRTags::HostageSafePoint)) { continue; }
		const float D = FVector::DistSquared(It->GetActorLocation(), GetActorLocation());
		if (D < BestDist) { BestDist = D; Best = It->GetActorLocation(); }
	}
	return Best;
}

void AHRNPCCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!HasAuthority()) { return; }
	ThinkAccumulator += DeltaSeconds;
	if (ThinkAccumulator >= 0.2f)
	{
		ServerThink(ThinkAccumulator);
		ThinkAccumulator = 0.f;
	}
}

void AHRNPCCharacter::ServerThink(float Dt)
{
	StateTime += Dt;
	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
	if (!GM) { return; }

	switch (NPCState)
	{
	case EHRNPCState::Idle:
	case EHRNPCState::Wandering:
	case EHRNPCState::Suspicious:
	{
		AHRCharacter* Threat = GM->IsAlarmRaised() ? nullptr : FindVisibleThreat();
		if (Threat)
		{
			CurrentThreat = Threat;
			const float Rate = DetectionPerSecond * (IsGuard() ? 1.6f : 1.f) * (Threat->IsMasked() ? 1.5f : 1.f);
			Detection = FMath::Min(1.f, Detection + Rate * Dt);
			if (NPCState != EHRNPCState::Suspicious) { SetNPCState(EHRNPCState::Suspicious); }
			if (AAIController* AI = Cast<AAIController>(GetController())) { AI->StopMovement(); AI->SetFocus(Threat); }
			GM->AddSuspicion(Detection * 8.f * Dt, Threat, this);
			if (Detection >= 1.f)
			{
				if (IsGuard())
				{
					if (AlarmCountdown < 0.f) { AlarmCountdown = GuardAlarmDelay; }
				}
				else
				{
					// Civilian bolts for the exit and calls it in.
					if (!bReportedToPolice) { GM->AddSuspicion(35.f, Threat, this); bReportedToPolice = true; }
					SetNPCState(EHRNPCState::Fleeing);
					MoveTo(FindSafePoint(), true);
				}
			}
		}
		else
		{
			Detection = FMath::Max(0.f, Detection - 0.15f * Dt);
			if (AAIController* AI = Cast<AAIController>(GetController())) { AI->ClearFocus(EAIFocusPriority::Gameplay); }
			if (NPCState == EHRNPCState::Suspicious && Detection <= 0.f) { SetNPCState(EHRNPCState::Wandering); }
		}

		// Guard runs the panic-button countdown even if line of sight breaks (they saw enough).
		if (AlarmCountdown >= 0.f)
		{
			AlarmCountdown -= Dt;
			if (AlarmCountdown <= 0.f)
			{
				AlarmCountdown = -1.f;
				GM->RaiseAlarm(EHRAlarmReason::GuardTriggered, GetActorLocation());
			}
		}

		if (NPCState == EHRNPCState::Wandering && StateTime > FMath::FRandRange(6.f, 14.f))
		{
			StateTime = 0.f;
			if (PatrolPoints.Num() > 0)
			{
				PatrolIndex = (PatrolIndex + 1) % PatrolPoints.Num();
				if (PatrolPoints[PatrolIndex]) { MoveTo(PatrolPoints[PatrolIndex]->GetActorLocation(), false); }
			}
			else
			{
				MoveTo(RandomNearbyPoint(), false);
			}
		}
		break;
	}
	case EHRNPCState::Fleeing:
	case EHRNPCState::Released:
		if (FVector::DistSquared2D(GetActorLocation(), FindSafePoint()) < FMath::Square(200.f) || StateTime > 60.f)
		{
			SetLifeSpan(1.f); // evacuated
			SetActorEnableCollision(false);
			SetActorHiddenInGame(true);
		}
		else if (StateTime > 3.f && GetVelocity().SizeSquared() < 100.f)
		{
			StateTime = 0.1f;
			MoveTo(FindSafePoint(), true);
		}
		break;
	case EHRNPCState::Cowering:
		// Intimidation wears off slowly if robbers leave; guards then resume alarm attempts.
		if (StateTime > 45.f && !GM->IsAlarmRaised())
		{
			SetNPCState(EHRNPCState::Suspicious);
			Detection = 1.f;
			if (IsGuard()) { AlarmCountdown = GuardAlarmDelay; }
		}
		break;
	default:
		break;
	}
}

void AHRNPCCharacter::ServerOnAlarm()
{
	if (NPCState == EHRNPCState::Hostage || NPCState == EHRNPCState::Cowering || NPCState == EHRNPCState::Released) { return; }
	SetNPCState(EHRNPCState::Fleeing);
	MoveTo(FindSafePoint(), true);
}

void AHRNPCCharacter::ServerOnHeardNoise(const FVector& Location, float Loudness01)
{
	if (NPCState == EHRNPCState::Idle || NPCState == EHRNPCState::Wandering)
	{
		if (Loudness01 >= 0.8f)
		{
			SetNPCState(EHRNPCState::Cowering);
		}
		else
		{
			SetNPCState(EHRNPCState::Suspicious);
			Detection = FMath::Min(1.f, Detection + Loudness01 * 0.5f);
			SetActorRotation(FRotator(0.f, (Location - GetActorLocation()).Rotation().Yaw, 0.f));
		}
	}
}

void AHRNPCCharacter::ServerOnShout(AHRCharacter* Shouter)
{
	if (!Shouter) { return; }
	if (Shouter->IsRobber() && Shouter->IsMasked())
	{
		if (NPCState != EHRNPCState::Hostage && NPCState != EHRNPCState::Released)
		{
			AlarmCountdown = -1.f; // intimidated guards don't reach the button
			SetNPCState(EHRNPCState::Cowering);
		}
	}
	else if (Shouter->IsPolice() && NPCState == EHRNPCState::Cowering)
	{
		SetNPCState(EHRNPCState::Fleeing);
		MoveTo(FindSafePoint(), true);
	}
}

void AHRNPCCharacter::ServerOnThreatSeen(AHRCharacter* Threat)
{
	if (NPCState == EHRNPCState::Idle || NPCState == EHRNPCState::Wandering)
	{
		CurrentThreat = Threat;
		Detection = FMath::Max(Detection, 0.6f);
		SetNPCState(EHRNPCState::Suspicious);
	}
}

void AHRNPCCharacter::ServerRelease(AHRCharacter* By)
{
	if (!HasAuthority() || NPCState != EHRNPCState::Hostage) { return; }
	SetNPCState(EHRNPCState::Released);
	MoveTo(FindSafePoint(), true);
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyHostageFreed(this, By); }
}

float AHRNPCCharacter::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	// NPCs are never killed (no graphic violence). Being shot at makes them cower.
	if (HasAuthority() && NPCState != EHRNPCState::Hostage) { SetNPCState(EHRNPCState::Cowering); }
	return 0.f;
}

// ------------------------------------------------------------------------ Interaction

bool AHRNPCCharacter::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By) { return false; }
	if (By->IsRobber())
	{
		if (NPCState == EHRNPCState::Cowering || (bHasKeycard && NPCState != EHRNPCState::Released))
		{
			if (!By->IsMasked()) { OutBlockedReason = HRText("Interact.MaskUpFirst"); return false; }
			return NPCState == EHRNPCState::Cowering || NPCState == EHRNPCState::Hostage;
		}
		return false;
	}
	if (By->IsPolice()) { return NPCState == EHRNPCState::Hostage || NPCState == EHRNPCState::Cowering; }
	return false;
}

FText AHRNPCCharacter::GetInteractPrompt(const AHRCharacter* By) const
{
	if (By && By->IsRobber()) { return bHasKeycard ? HRText("Interact.TakeKeycard") : HRText("Interact.TakeHostage"); }
	return NPCState == EHRNPCState::Hostage ? HRText("Interact.FreeHostage") : HRText("Interact.Evacuate");
}

float AHRNPCCharacter::GetInteractDuration(const AHRCharacter* By) const
{
	if (By && By->IsRobber()) { return bHasKeycard ? 1.5f : 2.f; }
	return NPCState == EHRNPCState::Hostage ? 3.f : 0.f;
}

void AHRNPCCharacter::OnInteractCompleted(AHRCharacter* By)
{
	FText Reason;
	if (!HasAuthority() || !CanInteract(By, Reason)) { return; }
	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
	if (By->IsRobber())
	{
		if (bHasKeycard)
		{
			bHasKeycard = false;
			By->GetInventory()->AddItem(HRItems::VaultKeycard, 1);
			if (NPCState != EHRNPCState::Hostage) { SetNPCState(EHRNPCState::Cowering); }
			return;
		}
		SetNPCState(EHRNPCState::Hostage);
		if (GM) { GM->NotifyHostageTaken(this, By); }
		return;
	}
	if (NPCState == EHRNPCState::Hostage) { ServerRelease(By); return; }
	SetNPCState(EHRNPCState::Fleeing);
	MoveTo(FindSafePoint(), true);
}
