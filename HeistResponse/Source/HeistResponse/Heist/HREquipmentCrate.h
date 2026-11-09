#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/HRInteractable.h"
#include "Core/HRTypes.h"
#include "Inventory/HRInventoryComponent.h"
#include "HREquipmentCrate.generated.h"

class UStaticMeshComponent;

/**
 * Team equipment source, e.g. the robbers' van trunk (lockpicks, thermal drill) or the police
 * armory. Each player can take one kit; shared items (drill) have a team-wide stock.
 */
UCLASS()
class HEISTRESPONSE_API AHREquipmentCrate : public AActor, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHREquipmentCrate();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override { return 1.5f; }
	virtual void OnInteractCompleted(AHRCharacter* By) override;

	UPROPERTY(EditAnywhere, Category = "Crate") EHRTeam Team = EHRTeam::Robbers;
	/** Given to every player once. */
	UPROPERTY(EditAnywhere, Category = "Crate") TArray<FHRItemStack> PersonalKit;
	/** Limited team-wide stock (first come, first served). */
	UPROPERTY(EditAnywhere, Category = "Crate") TArray<FHRItemStack> SharedStock;
	UPROPERTY(EditAnywhere, Category = "Crate") FName PromptLocKey = TEXT("Interact.TakeEquipment");

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

private:
	UPROPERTY(Replicated) TArray<int32> ClaimedPlayerIds;
};
