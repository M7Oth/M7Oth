#include "Heist/HRLootBag.h"
#include "Character/HRCharacter.h"
#include "Game/HRGameMode.h"
#include "Core/HRLocalization.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"
#include "Engine/StaticMesh.h"

AHRLootBag::AHRLootBag()
{
	bReplicates = true;
	SetReplicateMovement(true);
	SetNetUpdateFrequency(20.f);
	SetNetCullDistanceSquared(FMath::Square(60000.f));
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionProfileName(TEXT("PhysicsActor"));
	Mesh->SetCollisionResponseToChannel(ECC_Pawn, ECR_Ignore);
	Mesh->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
	Mesh->SetSimulatePhysics(false);
	Mesh->SetMassOverrideInKg(NAME_None, 18.f, true);

	// Placeholder shape until BP_LootBag provides the production duffel-bag mesh (tracked in PROJECT_STATUS.md).
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (Cube.Succeeded())
	{
		Mesh->SetStaticMesh(Cube.Object);
		Mesh->SetRelativeScale3D(FVector(0.55f, 0.32f, 0.32f));
	}
}

void AHRLootBag::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRLootBag, Carrier);
	DOREPLIFETIME(AHRLootBag, ReplicatedValue);
}

bool AHRLootBag::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By || Carrier) { return false; }
	if (By->IsRobber())
	{
		if (By->IsCarryingBag()) { OutBlockedReason = HRText("Interact.AlreadyCarrying"); return false; }
		return true;
	}
	return By->IsPolice();
}

FText AHRLootBag::GetInteractPrompt(const AHRCharacter* By) const
{
	return (By && By->IsPolice()) ? HRText("Interact.RecoverBag") : HRText("Interact.PickUpBag");
}

float AHRLootBag::GetInteractDuration(const AHRCharacter* By) const
{
	return (By && By->IsPolice()) ? 2.5f : 0.6f;
}

void AHRLootBag::OnInteractCompleted(AHRCharacter* By)
{
	FText Reason;
	if (!HasAuthority() || !CanInteract(By, Reason)) { return; }
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>())
	{
		GM->PickUpDroppedBag(By, this);
	}
}

void AHRLootBag::AttachToCarrier(AHRCharacter* InCarrier)
{
	if (!HasAuthority()) { return; }
	ReplicatedValue = Value;
	Carrier = InCarrier;
	OnRep_Carrier();
}

void AHRLootBag::DetachAndDrop(const FVector& Location, const FVector& Impulse)
{
	if (!HasAuthority()) { return; }
	Carrier = nullptr;
	OnRep_Carrier();
	SetActorLocation(Location, false, nullptr, ETeleportType::TeleportPhysics);
	Mesh->SetSimulatePhysics(true);
	if (!Impulse.IsNearlyZero()) { Mesh->AddImpulse(Impulse, NAME_None, true); }
}

void AHRLootBag::OnRep_Carrier()
{
	if (Carrier)
	{
		Mesh->SetSimulatePhysics(false);
		Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		AttachToComponent(Carrier->GetMesh(), FAttachmentTransformRules::SnapToTargetNotIncludingScale, CarrySocket);
		AddActorLocalOffset(FVector(-18.f, 0.f, 0.f));
	}
	else
	{
		DetachFromActor(FDetachmentTransformRules::KeepWorldTransform);
		Mesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	}
}
