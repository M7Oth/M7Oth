#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "HRWeaponComponent.generated.h"

class USoundBase;
class AHRCharacter;

USTRUCT(BlueprintType)
struct FHRWeaponSpec
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadOnly) FName WeaponId = TEXT("Carbine");
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float Damage = 22.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float RoundsPerMinute = 600.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) int32 MagazineSize = 30;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) int32 StartingReserve = 90;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float ReloadSeconds = 2.2f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float Range = 8000.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float HipSpreadDegrees = 3.5f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float AimSpreadDegrees = 0.6f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float RecoilPitch = 0.55f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float RecoilYaw = 0.2f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) bool bAutomatic = true;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float HeadshotMultiplier = 1.6f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float FalloffStart = 2500.f;
	UPROPERTY(EditAnywhere, BlueprintReadOnly) float FalloffMinMultiplier = 0.5f;
};

/**
 * Hitscan weapon, server-authoritative.
 * Anti-exploit model (works identically in first and third person):
 *  1. The client sends its camera ray. The server rejects camera origins that are implausibly far
 *     from the pawn (camera hacks / free-cam).
 *  2. The server resolves the aim point along that ray, starting the trace at the point closest to
 *     the pawn's eyes, so objects BEHIND the player never become targets.
 *  3. The actual shot is traced from the pawn's MUZZLE/EYES to that aim point. If the shooter's
 *     body has no line of fire (third-person corner peek), the bullet hits the wall, not the enemy.
 *  4. Fire rate, ammo, reload and spread are all decided by the server.
 */
UCLASS(ClassGroup = (HeistResponse), meta = (BlueprintSpawnableComponent))
class HEISTRESPONSE_API UHRWeaponComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UHRWeaponComponent();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;
	virtual void BeginPlay() override;

	/** Local input. */
	void StartFire();
	void StopFire();
	void RequestReload();

	/** Server: equip a spec (team loadout). */
	void SetWeaponSpec(const FHRWeaponSpec& InSpec);

	UFUNCTION(BlueprintPure) int32 GetAmmoInMag() const { return AmmoInMag; }
	UFUNCTION(BlueprintPure) int32 GetReserveAmmo() const { return ReserveAmmo; }
	UFUNCTION(BlueprintPure) bool IsReloading() const { return bReloading; }
	const FHRWeaponSpec& GetSpec() const { return Spec; }

	bool CanFireNow() const;

	UPROPERTY(EditDefaultsOnly, Category = "Weapon") FHRWeaponSpec Spec;
	UPROPERTY(EditDefaultsOnly, Category = "Weapon|FX") TObjectPtr<USoundBase> FireSound;
	UPROPERTY(EditDefaultsOnly, Category = "Weapon|FX") TObjectPtr<USoundBase> ReloadSound;
	UPROPERTY(EditDefaultsOnly, Category = "Weapon|FX") TObjectPtr<USoundBase> ImpactSound;
	UPROPERTY(EditDefaultsOnly, Category = "Weapon|FX") TObjectPtr<USoundBase> DryFireSound;

	/** Max distance between the reported camera and the pawn's eyes (cm). */
	UPROPERTY(EditDefaultsOnly, Category = "Weapon|Security") float MaxCameraOffset = 520.f;

	/** Client time between shots may be at most this much faster than spec (latency jitter). */
	UPROPERTY(EditDefaultsOnly, Category = "Weapon|Security") float FireRateTolerance = 0.8f;

private:
	void FireOnceLocal();
	AHRCharacter* GetCharacter() const;
	float ShotInterval() const { return 60.f / FMath::Max(1.f, Spec.RoundsPerMinute); }

	UFUNCTION(Server, Unreliable)
	void ServerFire(FVector_NetQuantize ViewLocation, FVector_NetQuantizeNormal ViewDirection);

	UFUNCTION(Server, Reliable)
	void ServerReload();

	UFUNCTION(NetMulticast, Unreliable)
	void MulticastShotFX(FVector_NetQuantize Muzzle, FVector_NetQuantize Impact, bool bHitCharacter);

	void FinishReload();

	UPROPERTY(Replicated) int32 AmmoInMag = 30;
	UPROPERTY(Replicated) int32 ReserveAmmo = 90;
	UPROPERTY(Replicated) bool bReloading = false;

	bool bWantsFire = false;
	float LocalNextShotTime = 0.f;
	float ServerLastShotTime = -100.f;
	FTimerHandle ReloadTimer;
	FRandomStream ServerSpreadStream;
};
