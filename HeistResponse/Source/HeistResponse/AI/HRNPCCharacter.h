#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Interaction/HRInteractable.h"
#include "HRNPCCharacter.generated.h"

class AHRCharacter;
class ATargetPoint;
class USkeletalMesh;

UENUM(BlueprintType)
enum class EHRNPCRole : uint8
{
	Civilian,
	Employee,
	Guard,
	Manager,   // Carries the vault keycard (quiet approach).
};

UENUM(BlueprintType)
enum class EHRNPCState : uint8
{
	Idle,
	Wandering,
	Suspicious,  // Detection meter rising: turns towards the threat.
	Fleeing,
	Cowering,    // Intimidated; can be taken hostage or evacuated.
	Hostage,
	Released,    // Walking out to the police cordon.
};

/**
 * Server-simulated bank NPC. Behaviour is a compact state machine ticked at 5 Hz on the server
 * (cheap for multiplayer), with replicated state driving the anim BP on clients.
 * Guards do not engage in gunfights: their job is to detect and alarm, keeping combat PvP-focused.
 */
UCLASS()
class HEISTRESPONSE_API AHRNPCCharacter : public ACharacter, public IHRInteractable
{
	GENERATED_BODY()

public:
	AHRNPCCharacter();

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;
	virtual float TakeDamage(float DamageAmount, struct FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser) override;

	// IHRInteractable
	virtual bool CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const override;
	virtual FText GetInteractPrompt(const AHRCharacter* By) const override;
	virtual float GetInteractDuration(const AHRCharacter* By) const override;
	virtual void OnInteractCompleted(AHRCharacter* By) override;

	// Server events (from GameMode)
	void ServerOnAlarm();
	void ServerOnHeardNoise(const FVector& Location, float Loudness01);
	void ServerOnShout(AHRCharacter* Shouter);
	void ServerOnThreatSeen(AHRCharacter* Threat);
	void ServerRelease(AHRCharacter* By);

	bool CanSee(const AHRCharacter* Target) const;
	bool IsGuard() const { return Role == EHRNPCRole::Guard; }
	bool IsHostage() const { return NPCState == EHRNPCState::Hostage; }
	EHRNPCState GetNPCState() const { return NPCState; }
	float GetDetection01() const { return Detection; }

	UPROPERTY(EditAnywhere, Category = "NPC") EHRNPCRole Role = EHRNPCRole::Civilian;
	UPROPERTY(EditAnywhere, Category = "NPC") float WanderRadius = 900.f;
	UPROPERTY(EditAnywhere, Category = "NPC") TArray<TObjectPtr<ATargetPoint>> PatrolPoints;
	UPROPERTY(EditAnywhere, Category = "NPC") float SightDistance = 2200.f;
	UPROPERTY(EditAnywhere, Category = "NPC") float SightHalfAngle = 65.f;
	UPROPERTY(EditAnywhere, Category = "NPC") float DetectionPerSecond = 0.55f;
	UPROPERTY(EditAnywhere, Category = "NPC") float GuardAlarmDelay = 2.5f;
	UPROPERTY(EditAnywhere, Category = "NPC") TArray<TObjectPtr<USkeletalMesh>> MeshVariants;

private:
	void SetNPCState(EHRNPCState NewState);
	void ServerThink(float Dt);
	void MoveTo(const FVector& Location, bool bRun);
	FVector FindSafePoint() const;
	FVector RandomNearbyPoint() const;
	AHRCharacter* FindVisibleThreat() const;

	UFUNCTION() void OnRep_NPCState();

	UPROPERTY(ReplicatedUsing = OnRep_NPCState) EHRNPCState NPCState = EHRNPCState::Idle;
	UPROPERTY(Replicated) bool bHasKeycard = false;
	UPROPERTY(Replicated) uint8 MeshVariant = 0;
	UPROPERTY(Replicated) float Detection = 0.f;

	FVector HomeLocation = FVector::ZeroVector;
	TWeakObjectPtr<AHRCharacter> CurrentThreat;
	float ThinkAccumulator = 0.f;
	float StateTime = 0.f;
	float AlarmCountdown = -1.f;
	int32 PatrolIndex = 0;
	bool bReportedToPolice = false;
};
