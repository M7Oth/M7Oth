#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/HRInteractable.h"
#include "HRLootPile.generated.h"

class UStaticMeshComponent;
class AHRVault;

/** Stack of cash/valuables. Each "bagging" interaction moves one ledger bag into a player's hands. */
UCLASS()
class HEISTRESPONSE_API AHRLootPile : public AActor, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHRLootPile();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void BeginPlay() override;

	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override { return BaggingSeconds; }
	virtual void OnInteractCompleted(AHRCharacter* By) override;

	int32 GetRemaining() const { return LedgerIds.Num() > 0 ? LedgerIds.Num() : RemainingBags; }

	UPROPERTY(EditAnywhere, Category = "Loot") int32 BagCount = 3;
	UPROPERTY(EditAnywhere, Category = "Loot") int32 ValuePerBag = 25000;
	UPROPERTY(EditAnywhere, Category = "Loot") float BaggingSeconds = 4.f;
	/** If set, loot is only reachable once this vault is open. */
	UPROPERTY(EditAnywhere, Category = "Loot") TObjectPtr<AHRVault> RequiredVault;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

private:
	UFUNCTION() void OnRep_Remaining();

	UPROPERTY(ReplicatedUsing = OnRep_Remaining) int32 RemainingBags = 0;
	TArray<int32> LedgerIds; // server only
};
