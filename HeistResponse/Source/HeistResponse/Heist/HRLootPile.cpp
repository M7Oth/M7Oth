#include "Heist/HRLootPile.h"
#include "Heist/HRVault.h"
#include "Character/HRCharacter.h"
#include "Game/HRGameMode.h"
#include "Core/HRLocalization.h"
#include "Components/StaticMeshComponent.h"
#include "Net/UnrealNetwork.h"

AHRLootPile::AHRLootPile()
{
	bReplicates = true;
	SetNetUpdateFrequency(5.f);
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
}

void AHRLootPile::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRLootPile, RemainingBags);
}

void AHRLootPile::BeginPlay()
{
	Super::BeginPlay();
	if (HasAuthority())
	{
		if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>())
		{
			for (int32 i = 0; i < BagCount; ++i) { LedgerIds.Add(GM->RegisterLootBag(ValuePerBag)); }
		}
		RemainingBags = LedgerIds.Num();
		OnRep_Remaining();
	}
}

bool AHRLootPile::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By || !By->IsRobber() || RemainingBags <= 0) { return false; }
	if (RequiredVault && !RequiredVault->IsOpen()) { return false; }
	if (By->IsCarryingBag())
	{
		OutBlockedReason = HRText("Interact.AlreadyCarrying");
		return false;
	}
	return true;
}

FText AHRLootPile::GetInteractPrompt(const AHRCharacter* By) const
{
	return FText::Format(HRText("Interact.BagMoney"), FText::AsNumber(RemainingBags));
}

void AHRLootPile::OnInteractCompleted(AHRCharacter* By)
{
	FText Reason;
	if (!HasAuthority() || !CanInteract(By, Reason) || LedgerIds.Num() == 0) { return; }
	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
	if (!GM) { return; }
	const int32 Id = LedgerIds.Last();
	if (GM->GiveLootBagFromSource(By, Id, GetActorLocation()))
	{
		LedgerIds.Pop();
		RemainingBags = LedgerIds.Num();
		OnRep_Remaining();
	}
}

void AHRLootPile::OnRep_Remaining()
{
	Mesh->SetVisibility(RemainingBags > 0);
	const float Scale = BagCount > 0 ? FMath::Max(0.25f, static_cast<float>(RemainingBags) / static_cast<float>(BagCount)) : 1.f;
	Mesh->SetRelativeScale3D(FVector(1.f, 1.f, Scale));
}
