#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interaction/HRInteractable.h"
#include "HRSecurityCamera.generated.h"

class UStaticMeshComponent;
class UCameraComponent;
class USceneComponent;

/**
 * Bank CCTV. Sweeps a cone; robbers who look hostile (masked, carrying loot, lockpicking, aiming)
 * inside it feed suspicion to the alarm model. Can be shot out (loud) or looped from the security
 * room console. Police can watch the feeds from the station CCTV console (AHRCCTVConsole), which
 * uses the camera component as a view target.
 */
UCLASS()
class HEISTRESPONSE_API AHRSecurityCamera : public AActor
{
	GENERATED_BODY()

public:
	AHRSecurityCamera();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void Tick(float DeltaSeconds) override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;

	bool IsDisabled() const { return bDisabled; }
	void ServerSetDisabled(bool bInDisabled) { bDisabled = bInDisabled; }

	UPROPERTY(EditAnywhere, Category = "Camera") float ViewDistance = 2200.f;
	UPROPERTY(EditAnywhere, Category = "Camera") float HalfFOVDegrees = 32.f;
	UPROPERTY(EditAnywhere, Category = "Camera") float SweepDegrees = 50.f;
	UPROPERTY(EditAnywhere, Category = "Camera") float SweepPeriod = 8.f;
	UPROPERTY(EditAnywhere, Category = "Camera") float SuspicionPerSecond = 35.f;
	UPROPERTY(EditAnywhere, Category = "Camera") FName FeedLocKey = TEXT("CCTV.Lobby");

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Root;
	UPROPERTY(VisibleAnywhere) TObjectPtr<USceneComponent> Head;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;
	UPROPERTY(VisibleAnywhere) TObjectPtr<UCameraComponent> FeedCamera;

private:
	UPROPERTY(Replicated) bool bDisabled = false;
	float ScanAccumulator = 0.f;
};

/**
 * Security console. Police (at the station or the bank security room) can watch CCTV feeds.
 * Robbers using the bank security-room console loop the feeds, disabling every camera.
 */
UCLASS()
class HEISTRESPONSE_API AHRCCTVConsole : public AActor, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHRCCTVConsole();

	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override;
	virtual void OnInteractCompleted(AHRCharacter* By) override;

	/** If false, robbers cannot loop cameras here (e.g. the police station console). */
	UPROPERTY(EditAnywhere, Category = "Console") bool bRobbersCanLoop = true;

protected:
	UPROPERTY(VisibleAnywhere) TObjectPtr<UStaticMeshComponent> Mesh;

private:
	bool bLooped = false;
};
