#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "HRExtractionZone.generated.h"

class UBoxComponent;

/**
 * Escape point. Each match the GameMode activates a random subset (alternative extraction
 * objectives). Robbers learn active zones when the alarm sounds; police get the intel after
 * PoliceIntelDelay seconds (configurable on the GameMode), so the chase stays fair but tense.
 */
UCLASS()
class HEISTRESPONSE_API AHRExtractionZone : public AActor
{
	GENERATED_BODY()

public:
	AHRExtractionZone();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void Tick(float DeltaSeconds) override;

	void ServerSetActive(bool bInActive) { bActive = bInActive; }
	void ServerRevealToPolice() { bRevealedToPolice = true; }
	bool IsActive() const { return bActive; }
	bool IsRevealedToPolice() const { return bRevealedToPolice; }

	UPROPERTY(EditAnywhere, Category = "Extraction") FName ZoneLocKey = TEXT("Zone.Generic");
	UPROPERTY(EditAnywhere, Category = "Extraction") bool bAllowsVehicles = true;
	UPROPERTY(EditAnywhere, Category = "Extraction") bool bAllowsOnFoot = true;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Box;

private:
	UPROPERTY(Replicated) bool bActive = false;
	UPROPERTY(Replicated) bool bRevealedToPolice = false;
	float CheckAccumulator = 0.f;
};
