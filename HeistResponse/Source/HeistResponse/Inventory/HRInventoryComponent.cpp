#include "Inventory/HRInventoryComponent.h"
#include "Core/HRTypes.h"
#include "Net/UnrealNetwork.h"

UHRInventoryComponent::UHRInventoryComponent()
{
	SetIsReplicatedByDefault(true);
	MaxStack.Add(HRItems::Lockpick, 4);
	MaxStack.Add(HRItems::ThermalDrill, 1);
	MaxStack.Add(HRItems::VaultKeycard, 1);
	MaxStack.Add(HRItems::SmokeGrenade, 2);
	MaxStack.Add(HRItems::SpikeStrip, 1);
	MaxStack.Add(HRItems::Zipties, 6);
	MaxStack.Add(HRItems::MedKit, 1);
}

void UHRInventoryComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME_CONDITION(UHRInventoryComponent, Items, COND_OwnerOnly);
}

int32 UHRInventoryComponent::GetCount(FName ItemId) const
{
	for (const FHRItemStack& S : Items)
	{
		if (S.ItemId == ItemId) { return S.Count; }
	}
	return 0;
}

int32 UHRInventoryComponent::AddItem(FName ItemId, int32 Count)
{
	if (!GetOwner() || !GetOwner()->HasAuthority() || ItemId.IsNone() || Count <= 0) { return 0; }
	const int32* MaxPtr = MaxStack.Find(ItemId);
	const int32 Max = MaxPtr ? *MaxPtr : DefaultMaxStack;
	for (FHRItemStack& S : Items)
	{
		if (S.ItemId == ItemId)
		{
			const int32 Added = FMath::Clamp(Max - S.Count, 0, Count);
			S.Count += Added;
			if (Added > 0) { OnInventoryChanged.Broadcast(); }
			return Added;
		}
	}
	FHRItemStack New(ItemId, FMath::Min(Count, Max));
	if (New.Count <= 0) { return 0; }
	Items.Add(New);
	OnInventoryChanged.Broadcast();
	return New.Count;
}

bool UHRInventoryComponent::ConsumeItem(FName ItemId, int32 Count)
{
	if (!GetOwner() || !GetOwner()->HasAuthority() || Count <= 0) { return false; }
	for (int32 i = 0; i < Items.Num(); ++i)
	{
		if (Items[i].ItemId == ItemId)
		{
			if (Items[i].Count < Count) { return false; }
			Items[i].Count -= Count;
			if (Items[i].Count == 0) { Items.RemoveAt(i); }
			OnInventoryChanged.Broadcast();
			return true;
		}
	}
	return false;
}

void UHRInventoryComponent::ClearAll()
{
	if (!GetOwner() || !GetOwner()->HasAuthority()) { return; }
	Items.Reset();
	OnInventoryChanged.Broadcast();
}

void UHRInventoryComponent::OnRep_Items()
{
	OnInventoryChanged.Broadcast();
}
