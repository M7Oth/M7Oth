#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "HRGadgets.generated.h"

class UBoxComponent;
class USphereComponent;
class UStaticMeshComponent;
class UNiagaraSystem;
class UNiagaraComponent;

/** Police spike strip: blows the tires of the first vehicle that drives over it. */
UCLASS()
class HEISTRESPONSE_API AHRSpikeStrip : public AActor
{
	GENERATED_BODY()

public:
	AHRSpikeStrip();
	virtual void BeginPlay() override;

	UPROPERTY(EditDefaultsOnly, Category = "Spike") float LifetimeSeconds = 120.f;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UBoxComponent> Trigger;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

private:
	UFUNCTION()
	void OnOverlap(UPrimitiveComponent* OverlappedComp, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep);

	bool bUsed = false;
};

/**
 * Smoke cloud: blocks the Visibility channel (AI sight, CCTV, interaction LOS) for its lifetime.
 * Bullets (HRWeapon channel) still pass, so smoke is concealment, not cover.
 */
UCLASS()
class HEISTRESPONSE_API AHRSmokeCloud : public AActor
{
	GENERATED_BODY()

public:
	AHRSmokeCloud();
	virtual void BeginPlay() override;

	UPROPERTY(EditDefaultsOnly, Category = "Smoke") float LifetimeSeconds = 18.f;
	UPROPERTY(EditDefaultsOnly, Category = "Smoke") float Radius = 450.f;
	UPROPERTY(EditDefaultsOnly, Category = "Smoke") TObjectPtr<UNiagaraSystem> SmokeFX;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USphereComponent> Blocker;
};
