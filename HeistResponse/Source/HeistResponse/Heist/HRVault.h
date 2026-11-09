#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/HRInteractable.h"
#include "HRVault.generated.h"

class UStaticMeshComponent;
class USceneComponent;
class UAudioComponent;
class USoundBase;

UENUM(BlueprintType)
enum class EHRVaultState : uint8
{
	Locked,
	Drilling,
	DrillJammed,
	DrillStopped,   // Police disabled the drill; robbers can restart it.
	Opening,        // Door is swinging. ALARM IS RAISED ON ENTERING THIS STATE.
	Open,
};

/**
 * Main bank vault. Two approaches:
 *   Quiet  - VaultKeycard (taken from the branch manager) + code entry (6 s hold).
 *   Loud   - ThermalDrill: place (3 s), 75 s of drilling with random jams the robbers must fix,
 *            police can disable the drill if they reach it.
 * MANDATORY RULE: the moment the vault starts opening, AHRGameMode::OnVaultOpened raises the
 * alarm, even if nobody was ever detected.
 */
UCLASS()
class HEISTRESPONSE_API AHRVault : public AActor, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHRVault();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void Tick(float DeltaSeconds) override;

	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override;
	virtual void OnInteractCompleted(AHRCharacter* By) override;

	UFUNCTION(BlueprintPure) EHRVaultState GetVaultState() const { return VaultState; }
	UFUNCTION(BlueprintPure) float GetDrillProgress() const { return DrillProgress; }
	bool IsOpen() const { return VaultState == EHRVaultState::Opening || VaultState == EHRVaultState::Open; }

	/** Debug/admin: force open (still raises the alarm). */
	void ServerForceOpen();

	UPROPERTY(EditAnywhere, Category = "Vault") float DrillSeconds = 75.f;
	UPROPERTY(EditAnywhere, Category = "Vault") float JamChancePerCheckpoint = 0.6f;
	UPROPERTY(EditAnywhere, Category = "Vault") float OpenSeconds = 4.5f;
	UPROPERTY(EditAnywhere, Category = "Vault") float OpenAngle = 110.f;
	UPROPERTY(EditAnywhere, Category = "Vault|Audio") TObjectPtr<USoundBase> DrillLoop;
	UPROPERTY(EditAnywhere, Category = "Vault|Audio") TObjectPtr<USoundBase> JamSound;
	UPROPERTY(EditAnywhere, Category = "Vault|Audio") TObjectPtr<USoundBase> OpenSound;
	UPROPERTY(EditAnywhere, Category = "Vault|Audio") TObjectPtr<USoundBase> KeypadSound;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> FrameMesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Hinge;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> DoorMesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> DrillMesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UAudioComponent> DrillAudio;

private:
	void SetVaultState(EHRVaultState NewState);
	void BeginOpening(AHRCharacter* By);

	UFUNCTION() void OnRep_VaultState(EHRVaultState OldState);

	UPROPERTY(ReplicatedUsing = OnRep_VaultState) EHRVaultState VaultState = EHRVaultState::Locked;
	UPROPERTY(Replicated) float DrillProgress = 0.f;
	UPROPERTY(Replicated) float OpenStartServerTime = 0.f;

	TArray<float> JamCheckpoints;
	float CurrentAngle = 0.f;
	float DrillReplicationAccumulator = 0.f;
};
