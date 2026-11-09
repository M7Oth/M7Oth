#include "Combat/HRGadgets.h"
#include "Vehicles/HRVehicle.h"
#include "Components/BoxComponent.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "NiagaraFunctionLibrary.h"

AHRSpikeStrip::AHRSpikeStrip()
{
	bReplicates = true;
	SetNetCullDistanceSquared(FMath::Square(30000.f));
	Trigger = CreateDefaultSubobject<UBoxComponent>(TEXT("Trigger"));
	SetRootComponent(Trigger);
	Trigger->SetBoxExtent(FVector(40.f, 300.f, 20.f));
	Trigger->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Trigger);
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AHRSpikeStrip::BeginPlay()
{
	Super::BeginPlay();
	SetLifeSpan(LifetimeSeconds);
	if (HasAuthority()) { Trigger->OnComponentBeginOverlap.AddDynamic(this, &AHRSpikeStrip::OnOverlap); }
}

void AHRSpikeStrip::OnOverlap(UPrimitiveComponent* OverlappedComp, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep)
{
	if (bUsed) { return; }
	if (AHRVehicle* V = Cast<AHRVehicle>(Other))
	{
		bUsed = true;
		V->ServerBlowTires();
		SetLifeSpan(2.f);
	}
}

AHRSmokeCloud::AHRSmokeCloud()
{
	bReplicates = true;
	Blocker = CreateDefaultSubobject<USphereComponent>(TEXT("Blocker"));
	SetRootComponent(Blocker);
	Blocker->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Blocker->SetCollisionResponseToAllChannels(ECR_Ignore);
	Blocker->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	Blocker->SetCanEverAffectNavigation(false);
}

void AHRSmokeCloud::BeginPlay()
{
	Super::BeginPlay();
	Blocker->SetSphereRadius(Radius);
	SetLifeSpan(LifetimeSeconds);
	if (SmokeFX && GetNetMode() != NM_DedicatedServer)
	{
		UNiagaraFunctionLibrary::SpawnSystemAttached(SmokeFX, Blocker, NAME_None, FVector::ZeroVector, FRotator::ZeroRotator, EAttachLocation::KeepRelativeOffset, true);
	}
}
