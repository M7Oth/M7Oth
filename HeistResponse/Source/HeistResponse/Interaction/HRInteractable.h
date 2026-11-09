#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "HRInteractable.generated.h"

class AHRCharacter;

UINTERFACE(MinimalAPI)
class UHRInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * Anything the player can use: doors, vault, loot, NPCs, vehicles, downed players, crates.
 * All gameplay effects happen on the SERVER in OnInteractCompleted; the client only predicts
 * prompts and progress UI. CanInteract is evaluated on both sides (client for the prompt,
 * server as the authoritative check), so it must only read replicated state.
 */
class HEISTRESPONSE_API IHRInteractable
{
	GENERATED_BODY()

public:
	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const = 0;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const = 0;

	/** Seconds the player must hold Interact. 0 = instant. */
	virtual float GetInteractDuration(const AHRCharacter* By) const { return 0.f; }

	/** Max distance from the pawn's eyes, in cm. */
	virtual float GetInteractRange() const { return 220.f; }

	/** If false, moving during a hold interaction does not cancel it. */
	virtual bool RequiresStandingStill() const { return true; }

	/** Server only. */
	virtual void OnInteractStarted(AHRCharacter* By) {}
	virtual void OnInteractCancelled(AHRCharacter* By) {}
	virtual void OnInteractCompleted(AHRCharacter* By) = 0;
};
