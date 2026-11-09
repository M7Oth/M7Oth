#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Rules/LockpickModel.h"
#include "HRLockpickComponent.generated.h"

class AHRDoor;
class AHRCharacter;

/** What the owning client is allowed to know about the lock (never the solution). */
USTRUCT(BlueprintType)
struct FHRLockpickView
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) bool bActive = false;
	UPROPERTY(BlueprintReadOnly) float Closeness = 0.f;
	UPROPERTY(BlueprintReadOnly) float PinProgress = 0.f;
	UPROPERTY(BlueprintReadOnly) float Stress = 0.f;
	UPROPERTY(BlueprintReadOnly) int32 PinsSet = 0;
	UPROPERTY(BlueprintReadOnly) int32 PinCount = 0;
	UPROPERTY(BlueprintReadOnly) int32 LockpicksLeft = 0;
	/** Incremented on every event so the UI can play one-shot feedback (pin click, pick snap). */
	UPROPERTY(BlueprintReadOnly) uint8 EventSerial = 0;
	UPROPERTY(BlueprintReadOnly) uint8 LastEvent = 0; // HeistRules::ELockpickEvent
};

DECLARE_MULTICAST_DELEGATE_OneParam(FOnHRLockpickEvent, uint8 /*ELockpickEvent*/);

/**
 * Lockpicking session, rebuilt from the original BP_BackDoor / WBP_LockpickUI concept:
 *  * Server owns the FLockpickModel and the door reference; the client streams pick angle + tension
 *    at 20 Hz (unreliable) and receives FHRLockpickView (owner-only) for the minigame UI.
 *  * Broken picks consume a Lockpick from the replicated inventory; zero picks ends the session.
 *  * Session ends on: success, cancel (Esc / Interact), damage, moving away, door opened by others,
 *    being downed/arrested, or the door being destroyed.
 *  * Only one picker per door (AHRDoor tracks its current picker).
 */
UCLASS(ClassGroup = (HeistResponse), meta = (BlueprintSpawnableComponent))
class HEISTRESPONSE_API UHRLockpickComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UHRLockpickComponent();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	bool IsActive() const { return View.bActive; }
	const FHRLockpickView& GetView() const { return View; }
	float GetLocalAngle() const { return LocalAngle; }
	bool IsLocalTension() const { return bLocalTension; }

	/** Local input. */
	void AddLocalPickInput(float MouseDeltaX);
	void SetLocalTension(bool bOn) { bLocalTension = bOn; }
	void RequestCancel();

	/** Server. */
	bool ServerBeginSession(AHRDoor* Door);
	void ServerEndSession(bool bSuccess);

	UPROPERTY(EditDefaultsOnly, Category = "Lockpick") float MouseDegreesPerUnit = 0.9f;
	UPROPERTY(EditDefaultsOnly, Category = "Lockpick") float InputSendInterval = 0.05f;
	UPROPERTY(EditDefaultsOnly, Category = "Lockpick") float MaxMoveDistance = 80.f;

	FOnHRLockpickEvent OnLockpickEvent;

private:
	UFUNCTION(Server, Unreliable) void ServerLockpickInput(float Angle, float Tension);
	UFUNCTION(Server, Reliable) void ServerCancel();
	UFUNCTION() void OnRep_View(const FHRLockpickView& Old);

	AHRCharacter* GetCharacter() const;
	void PushEvent(HeistRules::ELockpickEvent Event);

	UPROPERTY(ReplicatedUsing = OnRep_View) FHRLockpickView View;

	// Server
	HeistRules::FLockpickModel Model;
	TWeakObjectPtr<AHRDoor> TargetDoor;
	float ServerAngle = 0.f;
	float ServerTension = 0.f;
	FVector StartLocation = FVector::ZeroVector;
	float ViewPushAccumulator = 0.f;

	// Client
	float LocalAngle = 0.f;
	bool bLocalTension = false;
	float SendAccumulator = 0.f;
};
