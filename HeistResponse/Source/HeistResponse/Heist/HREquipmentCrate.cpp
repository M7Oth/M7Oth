#include "Heist/HREquipmentCrate.h"
#include "Character/HRCharacter.h"
#include "Game/HRPlayerState.h"
#include "Core/HRLocalization.h"
#include "Components/StaticMeshComponent.h"
#include "Net/UnrealNetwork.h"

AHREquipmentCrate::AHREquipmentCrate()
{
	bReplicates = true;
	SetNetUpdateFrequency(2.f);
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);

	PersonalKit.Add(FHRItemStack(HRItems::Lockpick, 3));
	SharedStock.Add(FHRItemStack(HRItems::ThermalDrill, 1));
}

void AHREquipmentCrate::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHREquipmentCrate, ClaimedPlayerIds);
}

bool AHREquipmentCrate::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By || By->GetTeam() != Team) { return false; }
	const AHRPlayerState* PS = By->GetHRPlayerState();
	if (!PS) { return false; }
	if (ClaimedPlayerIds.Contains(PS->GetPlayerId()))
	{
		bool bAnyShared = false;
		for (const FHRItemStack& S : SharedStock) { bAnyShared |= S.Count > 0; }
		if (!bAnyShared) { OutBlockedReason = HRText("Interact.CrateEmpty"); return false; }
	}
	return true;
}

FText AHREquipmentCrate::GetInteractPrompt(const AHRCharacter* By) const
{
	return FHRLocalization::Get().Text(PromptLocKey);
}

void AHREquipmentCrate::OnInteractCompleted(AHRCharacter* By)
{
	FText Reason;
	if (!HasAuthority() || !CanInteract(By, Reason)) { return; }
	const int32 PlayerId = By->GetHRPlayerState()->GetPlayerId();
	UHRInventoryComponent* Inv = By->GetInventory();
	if (!ClaimedPlayerIds.Contains(PlayerId))
	{
		ClaimedPlayerIds.Add(PlayerId);
		for (const FHRItemStack& S : PersonalKit) { Inv->AddItem(S.ItemId, S.Count); }
	}
	for (FHRItemStack& S : SharedStock)
	{
		if (S.Count > 0)
		{
			const int32 Added = Inv->AddItem(S.ItemId, S.Count);
			S.Count -= Added;
		}
	}
}
