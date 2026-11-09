#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "HRInventoryComponent.generated.h"

USTRUCT(BlueprintType)
struct FHRItemStack
{
	GENERATED_BODY()

	FHRItemStack() {}
	FHRItemStack(FName InItemId, int32 InCount) : ItemId(InItemId), Count(InCount) {}

	UPROPERTY(EditAnywhere, BlueprintReadOnly) FName ItemId;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) int32 Count = 0;
};

DECLARE_MULTICAST_DELEGATE(FOnHRInventoryChanged);

/**
 * Server-authoritative inventory. Clients get an owner-only replicated copy for UI.
 * Replaces the original BP "HasLockpick" boolean: every check (HasItem) on the server reads this
 * array, and every mutation goes through AddItem/ConsumeItem, which only run with authority.
 */
UCLASS(ClassGroup = (HeistResponse), meta = (BlueprintSpawnableComponent))
class HEISTRESPONSE_API UHRInventoryComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UHRInventoryComponent();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	UFUNCTION(BlueprintPure, Category = "Inventory")
	int32 GetCount(FName ItemId) const;

	UFUNCTION(BlueprintPure, Category = "Inventory")
	bool HasItem(FName ItemId, int32 MinCount = 1) const { return GetCount(ItemId) >= MinCount; }

	/** Server only. Returns the number actually added (respects MaxStack). */
	int32 AddItem(FName ItemId, int32 Count = 1);

	/** Server only. Returns true if Count items were removed. */
	bool ConsumeItem(FName ItemId, int32 Count = 1);

	/** Server only. */
	void ClearAll();

	const TArray<FHRItemStack>& GetItems() const { return Items; }

	/** Max per item id. Missing = DefaultMaxStack. */
	UPROPERTY(EditDefaultsOnly, Category = "Inventory")
	TMap<FName, int32> MaxStack;

	UPROPERTY(EditDefaultsOnly, Category = "Inventory")
	int32 DefaultMaxStack = 5;

	FOnHRInventoryChanged OnInventoryChanged;

private:
	UFUNCTION()
	void OnRep_Items();

	UPROPERTY(ReplicatedUsing = OnRep_Items)
	TArray<FHRItemStack> Items;
};
