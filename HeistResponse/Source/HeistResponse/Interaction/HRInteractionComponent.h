#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "HRInteractionComponent.generated.h"

class AHRCharacter;

USTRUCT(BlueprintType)
struct FHRActiveInteraction
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) TWeakObjectPtr<AActor> Target;
	UPROPERTY(BlueprintReadOnly) float Duration = 0.f;
	UPROPERTY(BlueprintReadOnly) float StartServerTime = 0.f;
	UPROPERTY(BlueprintReadOnly) FText Prompt;

	bool IsActive() const { return Target.IsValid() && Duration > 0.f; }
};

/**
 * Focus detection (client), server-validated hold interactions with interruption rules.
 * Fixes the original project's equipment-state bugs: the client never decides outcomes, the
 * server re-validates range, line of sight from the eyes and IHRInteractable::CanInteract both at
 * start and continuously while the hold progresses.
 */
UCLASS(ClassGroup = (HeistResponse), meta = (BlueprintSpawnableComponent))
class HEISTRESPONSE_API UHRInteractionComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UHRInteractionComponent();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	/** Local input. */
	void PressInteract();
	void ReleaseInteract();

	/** Server: cancel whatever is in progress (damage, stun, arrest, vehicle entry). */
	void CancelInteraction();

	AActor* GetFocusedActor() const { return FocusedActor.Get(); }
	FText GetFocusedPrompt() const { return FocusedPrompt; }
	FText GetFocusedBlockedReason() const { return FocusedBlockedReason; }
	bool IsFocusedUsable() const { return bFocusedUsable; }

	const FHRActiveInteraction& GetActive() const { return Active; }
	float GetActiveProgress() const;

	UPROPERTY(EditDefaultsOnly, Category = "Interaction")
	float FocusTraceDistance = 600.f;

	UPROPERTY(EditDefaultsOnly, Category = "Interaction")
	float MoveCancelDistance = 60.f;

private:
	UFUNCTION(Server, Reliable)
	void ServerBeginInteract(AActor* Target);

	UFUNCTION(Server, Reliable)
	void ServerCancelInteract();

	bool ValidateTarget(AActor* Target, FText* OutReason) const;
	void UpdateFocus();
	AHRCharacter* GetCharacter() const;

	UPROPERTY(Replicated)
	FHRActiveInteraction Active;

	FVector ServerStartLocation = FVector::ZeroVector;

	TWeakObjectPtr<AActor> FocusedActor;
	FText FocusedPrompt;
	FText FocusedBlockedReason;
	bool bFocusedUsable = false;
};
