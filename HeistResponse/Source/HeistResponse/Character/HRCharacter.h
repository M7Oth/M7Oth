#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Core/HRTypes.h"
#include "Interaction/HRInteractable.h"
#include "HRCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UStaticMeshComponent;
class UAnimMontage;
class USkeletalMesh;
class UHRCameraRigComponent;
class UHRInteractionComponent;
class UHRInventoryComponent;
class UHRHealthComponent;
class UHRWeaponComponent;
class UHRLockpickComponent;
class UHRCharacterMovementComponent;
class AHRLootBag;
class AHRVehicle;
class AHRPlayerState;
struct FInputActionValue;

/**
 * Playable police officer / robber. One class for both teams; team visuals and loadout are
 * applied from the PlayerState team (see ApplyTeamLoadout). Also an interactable so teammates can
 * revive it and police can arrest downed or surrendering robbers.
 */
UCLASS()
class HEISTRESPONSE_API AHRCharacter : public ACharacter, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHRCharacter(const FObjectInitializer& ObjectInitializer);

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void PossessedBy(AController* NewController) override;
	virtual void OnRep_PlayerState() override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;
	virtual void PawnClientRestart() override;

	// IHRInteractable (revive / arrest)
	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override;
	virtual void OnInteractCompleted(AHRCharacter* By) override;

	// State queries --------------------------------------------------------
	EHRTeam GetTeam() const;
	AHRPlayerState* GetHRPlayerState() const;
	bool IsPolice() const { return GetTeam() == EHRTeam::Police; }
	bool IsRobber() const { return GetTeam() == EHRTeam::Robbers; }
	bool IsAliveState() const;
	bool IsArrested() const;
	bool IsSurrendering() const { return bSurrendering; }
	bool IsMasked() const { return bMasked; }
	bool IsAiming() const { return bAiming; }
	bool IsCarryingBag() const { return CarriedBag != nullptr; }
	bool IsInVehicle() const { return CurrentVehicle != nullptr; }
	bool IsLockpicking() const;
	AHRLootBag* GetCarriedBag() const { return CarriedBag; }
	AHRVehicle* GetCurrentVehicle() const { return CurrentVehicle; }

	/** Can move and interact (alive, not arrested, not seated). */
	bool CanPerformActions() const;
	/** Can draw and fire a weapon. Robbers must be masked; nobody can while surrendering or carrying out a minigame. */
	bool CanUseWeapon() const;
	/** True if NPCs would consider this character a threat right now. */
	bool IsVisiblyHostile() const;

	FVector GetEyeLocation() const;
	FVector GetMuzzleLocation() const;

	UHRCameraRigComponent* GetCameraRig() const { return CameraRig; }
	UHRInteractionComponent* GetInteraction() const { return Interaction; }
	UHRInventoryComponent* GetInventory() const { return Inventory; }
	UHRHealthComponent* GetHealth() const { return Health; }
	UHRWeaponComponent* GetWeapon() const { return Weapon; }
	UHRLockpickComponent* GetLockpick() const { return Lockpick; }

	// Server-side state changes (called by game systems) -------------------
	void ServerSetCarriedBag(AHRLootBag* Bag);
	void ServerEnterVehicle(AHRVehicle* Vehicle);
	void ServerLeaveVehicle(const FVector& ExitLocation);
	void ServerForceSurrender(bool bValue);
	void ServerOnArrested();
	void ServerOnReleased();
	void ApplyTeamLoadout();

	// Cosmetic hooks ---------------------------------------------------------
	void PlayFireMontageLocal();
	void OnShotFX(const FVector& Muzzle, const FVector& Impact, bool bHitCharacter);

	/** Set by AHRPlayerController before input setup. */
	UPROPERTY(Transient) TObjectPtr<class UHRInputConfig> InputConfig;

	// Visuals (assigned in the BP child: BP_HRCharacter) ---------------------
	UPROPERTY(EditDefaultsOnly, Category = "Visuals") TObjectPtr<USkeletalMesh> PoliceMesh;
	UPROPERTY(EditDefaultsOnly, Category = "Visuals") TArray<TObjectPtr<USkeletalMesh>> RobberMeshes;
	UPROPERTY(EditDefaultsOnly, Category = "Visuals") TObjectPtr<UAnimMontage> FireMontage;
	UPROPERTY(EditDefaultsOnly, Category = "Visuals") TObjectPtr<UAnimMontage> InteractMontage;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visuals") TObjectPtr<UStaticMeshComponent> MaskMesh;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Visuals") TObjectPtr<UStaticMeshComponent> WeaponMesh;

protected:
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<USpringArmComponent> CameraArm;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UCameraComponent> Camera;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UHRCameraRigComponent> CameraRig;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UHRInteractionComponent> Interaction;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UHRInventoryComponent> Inventory;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UHRHealthComponent> Health;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UHRWeaponComponent> Weapon;
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<UHRLockpickComponent> Lockpick;

private:
	// Input handlers
	void InputMove(const FInputActionValue& Value);
	void InputLook(const FInputActionValue& Value);
	void InputSprintStart();
	void InputSprintStop();
	void InputCrouch();
	void InputJump();
	void InputInteractStart();
	void InputInteractStop();
	void InputFireStart();
	void InputFireStop();
	void InputAimStart();
	void InputAimStop();
	void InputReload();
	void InputToggleCamera();
	void InputSwapShoulder();
	void InputSurrender();
	void InputToggleMask();
	void InputDropBag();
	void InputShout();
	void InputTrunk();
	void InputGadget();

	void SetAimingLocal(bool bNewAiming);
	void HandleLifeStateChanged(EHRLifeState OldState, EHRLifeState NewState);
	void RefreshTeamVisuals();
	UHRCharacterMovementComponent* GetHRMovement() const;

	UFUNCTION(Server, Reliable) void ServerSetAiming(bool bNewAiming);
	UFUNCTION(Server, Reliable) void ServerToggleSurrender();
	UFUNCTION(Server, Reliable) void ServerToggleMask();
	UFUNCTION(Server, Reliable) void ServerDropBag(bool bThrow);
	UFUNCTION(Server, Reliable) void ServerShout();
	UFUNCTION(Server, Reliable) void ServerTrunkAction(AHRVehicle* Vehicle);
	UFUNCTION(Server, Reliable) void ServerUseGadget();

	UFUNCTION(NetMulticast, Unreliable) void MulticastShout();

	UFUNCTION() void OnRep_Masked();
	UFUNCTION() void OnRep_CurrentVehicle();

	UPROPERTY(Replicated) bool bAiming = false;
	UPROPERTY(Replicated) bool bSurrendering = false;
	UPROPERTY(ReplicatedUsing = OnRep_Masked) bool bMasked = false;
	UPROPERTY(Replicated) TObjectPtr<AHRLootBag> CarriedBag;
	UPROPERTY(ReplicatedUsing = OnRep_CurrentVehicle) TObjectPtr<AHRVehicle> CurrentVehicle;
	UPROPERTY(Replicated) uint8 RobberOutfitIndex = 0;

	bool bAimHeld = false;
	float LastShoutTime = -100.f;
	EHRTeam AppliedVisualTeam = EHRTeam::None;
};
