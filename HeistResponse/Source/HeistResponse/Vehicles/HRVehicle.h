#pragma once

#include "CoreMinimal.h"
#include "WheeledVehiclePawn.h"
#include "ChaosVehicleWheel.h"
#include "Interaction/HRInteractable.h"
#include "Core/HRTypes.h"
#include "HRVehicle.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UAudioComponent;
class UPointLightComponent;
class AHRCharacter;
class USoundBase;
struct FInputActionValue;

UCLASS()
class HEISTRESPONSE_API UHRVehicleWheelFront : public UChaosVehicleWheel
{
	GENERATED_BODY()
public:
	UHRVehicleWheelFront();
};

UCLASS()
class HEISTRESPONSE_API UHRVehicleWheelRear : public UChaosVehicleWheel
{
	GENERATED_BODY()
public:
	UHRVehicleWheelRear();
};

/**
 * Drivable car (police cruiser, getaway car, civilian). Chaos Wheeled Vehicle with:
 *  * Driver seat (possession) + passenger seats (characters attached, hidden, camera follows).
 *  * Server-authoritative health with collision + bullet damage; disabled vehicles stop but stay as
 *    cover and keep their trunk loot (robbers continue on foot - the match does not end).
 *  * Police lights/siren (replicated toggle; light flashing simulated locally).
 *  * Trunk storage for loot bags via the ledger.
 *  * Chase camera (spring arm with lag) and optional cockpit camera (V).
 * Mesh, physics asset, wheel bone names and engine curves are set in the BP children
 * (BP_PoliceCruiser, BP_GetawaySedan) - see Docs/ASSET_PIPELINE.md.
 */
UCLASS()
class HEISTRESPONSE_API AHRVehicle : public AWheeledVehiclePawn, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHRVehicle();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;
	virtual void NotifyHit(UPrimitiveComponent* MyComp, AActor* Other, UPrimitiveComponent* OtherComp, bool bSelfMoved, FVector HitLocation, FVector HitNormal, FVector NormalImpulse, const FHitResult& Hit) override;
	virtual void PawnClientRestart() override;

	// IHRInteractable
	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override { return 0.f; }
	virtual void OnInteractCompleted(AHRCharacter* By) override;
	virtual float GetInteractRange() const override { return 320.f; }
	virtual bool RequiresStandingStill() const override { return false; }

	// Server API
	void ServerBlowTires();
	void ServerAddTrunkBag(int32 LedgerId);
	void ServerRemoveTrunkBag(int32 LedgerId);
	int32 ServerPeekTrunkBag() const { return TrunkBagIds.Num() > 0 ? TrunkBagIds.Last() : -1; }
	void ServerClearTrunk();
	void ServerRemoveOccupant(AHRCharacter* Ch);
	void ServerDriverDisconnected();
	void ServerEjectAllForExtraction();

	TArray<AHRCharacter*> GetOccupants() const;
	AHRCharacter* GetDriverCharacter() const { return Driver; }
	int32 GetTrunkCount() const { return TrunkCount; }
	bool IsDisabled() const { return bDisabled; }
	bool IsMoving() const { return GetVelocity().SizeSquared() > FMath::Square(150.f); }
	bool AreTiresBlown() const { return bTiresBlown; }
	float GetHealth01() const { return Health / FMath::Max(1.f, MaxHealth); }
	bool IsSirenOn() const { return bSirenOn; }

	UPROPERTY(EditAnywhere, Replicated, Category = "Vehicle") EHRTeam OwnerTeam = EHRTeam::None;
	UPROPERTY(EditAnywhere, Category = "Vehicle") int32 PassengerSeats = 3;
	UPROPERTY(EditAnywhere, Category = "Vehicle") float MaxHealth = 600.f;
	UPROPERTY(EditAnywhere, Category = "Vehicle") float CollisionDamageScale = 0.0009f;
	UPROPERTY(EditAnywhere, Category = "Vehicle") float BlownTireMaxSpeedScale = 0.45f;
	UPROPERTY(EditAnywhere, Category = "Vehicle") bool bHasSiren = false;
	UPROPERTY(EditAnywhere, Category = "Vehicle|Audio") TObjectPtr<USoundBase> EngineLoop;
	UPROPERTY(EditAnywhere, Category = "Vehicle|Audio") TObjectPtr<USoundBase> SirenLoop;
	UPROPERTY(EditAnywhere, Category = "Vehicle|Audio") TObjectPtr<USoundBase> CrashSound;

	int32 VehicleLedgerId = -1; // server

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USpringArmComponent> ChaseArm;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> ChaseCamera;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> CockpitCamera;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UAudioComponent> EngineAudio;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UAudioComponent> SirenAudio;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> LightBarRed;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UPointLightComponent> LightBarBlue;

private:
	void InputThrottle(const FInputActionValue& V);
	void InputSteer(const FInputActionValue& V);
	void InputHandbrakeOn();
	void InputHandbrakeOff();
	void InputExit();
	void InputSiren();
	void InputLook(const FInputActionValue& V);
	void InputToggleCamera();

	UFUNCTION(Server, Reliable) void ServerExitVehicle();
	UFUNCTION(Server, Reliable) void ServerToggleSiren();

	void SeatDriver(AHRCharacter* Ch);
	void SeatPassenger(AHRCharacter* Ch);
	void Unseat(AHRCharacter* Ch, bool bRepossess);
	FVector FindExitLocation(int32 SeatIndex) const;
	void SetDisabled();

	UFUNCTION() void OnRep_Siren();
	UFUNCTION() void OnRep_Disabled();

	UPROPERTY(Replicated) TObjectPtr<AHRCharacter> Driver;
	UPROPERTY(Replicated) TArray<TObjectPtr<AHRCharacter>> Passengers;
	UPROPERTY(ReplicatedUsing = OnRep_Siren) bool bSirenOn = false;
	UPROPERTY(ReplicatedUsing = OnRep_Disabled) bool bDisabled = false;
	UPROPERTY(Replicated) bool bTiresBlown = false;
	UPROPERTY(Replicated) float Health = 600.f;
	UPROPERTY(Replicated) int32 TrunkCount = 0;

	TArray<int32> TrunkBagIds; // server
	bool bCockpitView = false;
	float LightPhase = 0.f;
	float LastCrashTime = -10.f;
};
