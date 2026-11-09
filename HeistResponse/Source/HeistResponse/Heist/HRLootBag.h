#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/HRInteractable.h"
#include "HRLootBag.generated.h"

class UStaticMeshComponent;

/**
 * Physical money bag. Visual mirror of a HeistRules::FLootLedger entry; every state change goes
 * through AHRGameMode, which updates the ledger FIRST and only then moves this actor, so a bag can
 * never exist in two places (anti-duplication, see Tests/CoreRules).
 */
UCLASS()
class HEISTRESPONSE_API AHRLootBag : public AActor, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHRLootBag();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override;
	virtual void OnInteractCompleted(AHRCharacter* By) override;
	virtual float GetInteractRange() const override { return 180.f; }

	/** Server. */
	void AttachToCarrier(AHRCharacter* Carrier);
	void DetachAndDrop(const FVector& Location, const FVector& Impulse);

	int32 LedgerId = -1;      // server only
	int32 Value = 0;

	AHRCharacter* GetCarrier() const { return Carrier; }

	UPROPERTY(EditDefaultsOnly, Category = "Bag") FName CarrySocket = TEXT("spine_03");

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

private:
	UFUNCTION() void OnRep_Carrier();

	UPROPERTY(ReplicatedUsing = OnRep_Carrier) TObjectPtr<AHRCharacter> Carrier;
	UPROPERTY(Replicated) int32 ReplicatedValue = 0;
};
