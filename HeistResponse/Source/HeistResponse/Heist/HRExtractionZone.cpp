#include "Heist/HRExtractionZone.h"
#include "Character/HRCharacter.h"
#include "Vehicles/HRVehicle.h"
#include "Game/HRGameMode.h"
#include "Components/BoxComponent.h"
#include "Net/UnrealNetwork.h"

AHRExtractionZone::AHRExtractionZone()
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	bAlwaysRelevant = true;
	SetNetUpdateFrequency(2.f);
	Box = CreateDefaultSubobject<UBoxComponent>(TEXT("Box"));
	SetRootComponent(Box);
	Box->SetBoxExtent(FVector(600.f, 600.f, 300.f));
	Box->SetCollisionProfileName(TEXT("OverlapAllDynamic"));
	Box->SetGenerateOverlapEvents(true);
}

void AHRExtractionZone::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRExtractionZone, bActive);
	DOREPLIFETIME(AHRExtractionZone, bRevealedToPolice);
}

void AHRExtractionZone::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (!HasAuthority() || !bActive) { return; }
	CheckAccumulator += DeltaSeconds;
	if (CheckAccumulator < 0.25f) { return; }
	CheckAccumulator = 0.f;

	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
	if (!GM) { return; }
	TArray<AActor*> Overlapping;
	Box->GetOverlappingActors(Overlapping);
	for (AActor* A : Overlapping)
	{
		if (AHRVehicle* V = Cast<AHRVehicle>(A))
		{
			if (bAllowsVehicles) { GM->OnVehicleReachedExtraction(V, this); }
		}
		else if (AHRCharacter* C = Cast<AHRCharacter>(A))
		{
			if (bAllowsOnFoot && C->IsRobber() && !C->IsInVehicle()) { GM->OnRobberReachedExtraction(C, this); }
		}
	}
}
