#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Core/HRTypes.h"
#include "HRHealthComponent.generated.h"

DECLARE_MULTICAST_DELEGATE_TwoParams(FOnHRLifeStateChanged, EHRLifeState /*Old*/, EHRLifeState /*New*/);
DECLARE_MULTICAST_DELEGATE_OneParam(FOnHRDamaged, float /*Amount*/);

/**
 * Health with non-lethal presentation: 0 HP = Downed (crawl, revivable, robbers arrestable),
 * bleed-out = Incapacitated (police respawn at the station, robbers are taken into custody).
 * Server-authoritative; clients receive Health/LifeState for HUD and animation.
 */
UCLASS(ClassGroup = (HeistResponse), meta = (BlueprintSpawnableComponent))
class HEISTRESPONSE_API UHRHealthComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UHRHealthComponent();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Server only. Returns the damage actually applied. */
	float ApplyDamage(float Amount, AController* InstigatedBy);

	/** Server only. */
	void Revive(float HealthFraction = 0.4f);
	void ResetToFull();
	void ForceIncapacitate();

	UFUNCTION(BlueprintPure) float GetHealth() const { return Health; }
	UFUNCTION(BlueprintPure) float GetMaxHealth() const { return MaxHealth; }
	UFUNCTION(BlueprintPure) EHRLifeState GetLifeState() const { return LifeState; }
	UFUNCTION(BlueprintPure) bool IsAlive() const { return LifeState == EHRLifeState::Alive; }
	UFUNCTION(BlueprintPure) bool IsDowned() const { return LifeState == EHRLifeState::Downed; }
	float GetBleedoutEndServerTime() const { return BleedoutEndServerTime; }

	TWeakObjectPtr<AController> LastDamageInstigator;

	UPROPERTY(EditDefaultsOnly, Category = "Health") float MaxHealth = 100.f;
	UPROPERTY(EditDefaultsOnly, Category = "Health") float BleedoutSeconds = 40.f;
	UPROPERTY(EditDefaultsOnly, Category = "Health") float RegenDelay = 8.f;
	UPROPERTY(EditDefaultsOnly, Category = "Health") float RegenPerSecond = 6.f;
	UPROPERTY(EditDefaultsOnly, Category = "Health") float RegenCapFraction = 0.6f;

	FOnHRLifeStateChanged OnLifeStateChanged;
	FOnHRDamaged OnDamaged;

private:
	void SetLifeState(EHRLifeState NewState);

	UFUNCTION() void OnRep_LifeState(EHRLifeState OldState);
	UFUNCTION() void OnRep_Health(float OldHealth);

	UPROPERTY(ReplicatedUsing = OnRep_Health) float Health = 100.f;
	UPROPERTY(ReplicatedUsing = OnRep_LifeState) EHRLifeState LifeState = EHRLifeState::Alive;
	UPROPERTY(Replicated) float BleedoutEndServerTime = 0.f;

	float LastDamageTime = -1000.f;
};
