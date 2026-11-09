#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/HRInteractable.h"
#include "HRDoor.generated.h"

class UStaticMeshComponent;
class USceneComponent;
class USoundBase;

UENUM(BlueprintType)
enum class EHRDoorState : uint8
{
	Closed,
	Open,
	Locked,
};

/**
 * Replicated hinged door (successor of the original BP_BackDoor).
 * Locked doors can be lockpicked by robbers (UHRLockpickComponent minigame), opened with a keycard,
 * or breached by police. Unlocked doors toggle open/closed and swing away from the user.
 * Visual swing is interpolated locally from the replicated state, so late joiners see the right pose.
 */
UCLASS()
class HEISTRESPONSE_API AHRDoor : public AActor, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHRDoor();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void BeginPlay() override;

	// IHRInteractable
	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override;
	virtual void OnInteractCompleted(AHRCharacter* By) override;

	bool IsLocked() const { return DoorState == EHRDoorState::Locked; }
	bool IsOpen() const { return DoorState == EHRDoorState::Open; }

	/** Server. */
	void ServerUnlock(AHRCharacter* By, bool bAlsoOpen);
	void ServerSetOpen(bool bOpen, const FVector& FromLocation);
	void ServerLock();

	bool TryClaimPicker(AHRCharacter* Picker);
	void ReleasePicker(AHRCharacter* Picker);
	uint32 ConsumeLockSeed();

	UPROPERTY(EditAnywhere, Category = "Door") bool bStartsLocked = false;
	UPROPERTY(EditAnywhere, Category = "Door") bool bLockpickable = true;
	UPROPERTY(EditAnywhere, Category = "Door") bool bPoliceCanBreach = true;
	/** If set, holding this item unlocks the door (e.g. VaultKeycard for the staff corridor). */
	UPROPERTY(EditAnywhere, Category = "Door") FName KeyItem;
	/** Behind this door is staff-only space; robbers seen opening it gain suspicion. */
	UPROPERTY(EditAnywhere, Category = "Door") bool bRestricted = false;
	/** Police station holding cell: police may open/close freely; robbers can pick it to free teammates. */
	UPROPERTY(EditAnywhere, Category = "Door") bool bIsHoldingCell = false;
	UPROPERTY(EditAnywhere, Category = "Door") float OpenAngle = 100.f;
	UPROPERTY(EditAnywhere, Category = "Door") float SwingSpeedDegPerSec = 220.f;
	UPROPERTY(EditAnywhere, Category = "Door|Lock", meta = (ClampMin = 1, ClampMax = 7)) int32 LockPinCount = 4;
	UPROPERTY(EditAnywhere, Category = "Door|Lock", meta = (ClampMin = 3, ClampMax = 20)) float LockTolerance = 9.f;
	UPROPERTY(EditAnywhere, Category = "Door|Audio") TObjectPtr<USoundBase> OpenSound;
	UPROPERTY(EditAnywhere, Category = "Door|Audio") TObjectPtr<USoundBase> CloseSound;
	UPROPERTY(EditAnywhere, Category = "Door|Audio") TObjectPtr<USoundBase> UnlockSound;
	UPROPERTY(EditAnywhere, Category = "Door|Audio") TObjectPtr<USoundBase> BreachSound;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> FrameMesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Hinge;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> LeafMesh;

private:
	UFUNCTION() void OnRep_DoorState(EHRDoorState OldState);

	UPROPERTY(ReplicatedUsing = OnRep_DoorState) EHRDoorState DoorState = EHRDoorState::Closed;
	UPROPERTY(Replicated) int8 OpenSign = 1;

	TWeakObjectPtr<AHRCharacter> CurrentPicker;
	uint32 LockSeed = 1;
	float CurrentYaw = 0.f;
};
