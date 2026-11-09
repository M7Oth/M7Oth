#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameState.h"
#include "Core/HRTypes.h"
#include "HRGameState.generated.h"

class AHRPlayerState;

USTRUCT(BlueprintType)
struct FHRNegotiationView
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) EHRNegotiationState State = EHRNegotiationState::Closed;
	UPROPERTY(BlueprintReadOnly) EHRDealType PendingDeal = EHRDealType::None;
	UPROPERTY(BlueprintReadOnly) EHRTeam Proposer = EHRTeam::None;
	UPROPERTY(BlueprintReadOnly) float ExpiresServerTime = 0.f;
	UPROPERTY(BlueprintReadOnly) float TruceEndsServerTime = 0.f;
	UPROPERTY(BlueprintReadOnly) float PoliceCooldownEnds = 0.f;
	UPROPERTY(BlueprintReadOnly) float RobberCooldownEnds = 0.f;
	UPROPERTY(BlueprintReadOnly) int32 AcceptedDeals = 0;
	UPROPERTY(BlueprintReadOnly) int32 MaxDeals = 0;
};

DECLARE_MULTICAST_DELEGATE(FOnHRGameStateChanged);

/** Replicated, read-only view of the match for every client (HUD, AI cosmetics, spectators). */
UCLASS()
class HEISTRESPONSE_API AHRGameState : public AGameState
{
	GENERATED_BODY()

public:
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

	float GetServerNow() const { return static_cast<float>(GetServerWorldTimeSeconds()); }
	float GetPhaseTimeRemaining() const { return FMath::Max(0.f, PhaseEndServerTime - GetServerNow()); }
	bool IsTruceActive() const { return Negotiation.TruceEndsServerTime > GetServerNow(); }

	TArray<AHRPlayerState*> GetTeamPlayers(EHRTeam Team) const;
	int32 CountTeam(EHRTeam Team) const;

	UPROPERTY(ReplicatedUsing = OnRep_Phase, BlueprintReadOnly) EHRMatchPhase Phase = EHRMatchPhase::WaitingForPlayers;
	UPROPERTY(Replicated, BlueprintReadOnly) float PhaseEndServerTime = 0.f;
	UPROPERTY(ReplicatedUsing = OnRep_Alarm, BlueprintReadOnly) bool bAlarmRaised = false;
	UPROPERTY(Replicated, BlueprintReadOnly) EHRAlarmReason AlarmReason = EHRAlarmReason::None;
	UPROPERTY(Replicated, BlueprintReadOnly) bool bPoliceDispatched = false;
	UPROPERTY(Replicated, BlueprintReadOnly) float DispatchServerTime = 0.f;
	UPROPERTY(Replicated, BlueprintReadOnly) float Suspicion01 = 0.f;
	UPROPERTY(Replicated, BlueprintReadOnly) bool bVaultOpened = false;
	UPROPERTY(Replicated, BlueprintReadOnly) int32 TotalLootValue = 0;
	UPROPERTY(Replicated, BlueprintReadOnly) int32 TargetLootValue = 0;
	UPROPERTY(Replicated, BlueprintReadOnly) int32 SecuredLootValue = 0;
	UPROPERTY(Replicated, BlueprintReadOnly) int32 RecoveredLootValue = 0;
	UPROPERTY(Replicated, BlueprintReadOnly) int32 HostagesHeld = 0;
	UPROPERTY(Replicated, BlueprintReadOnly) int32 HostagesRescued = 0;
	UPROPERTY(Replicated, BlueprintReadOnly) FVector IncidentLocation = FVector::ZeroVector;
	UPROPERTY(ReplicatedUsing = OnRep_Negotiation, BlueprintReadOnly) FHRNegotiationView Negotiation;
	UPROPERTY(Replicated, BlueprintReadOnly) EHRMatchWinner Winner = EHRMatchWinner::Undecided;
	UPROPERTY(Replicated, BlueprintReadOnly) EHRMatchEndReason EndReason = EHRMatchEndReason::None;
	UPROPERTY(Replicated, BlueprintReadOnly) float LobbyCountdownEnd = 0.f;
	UPROPERTY(Replicated, BlueprintReadOnly) float RematchDecisionServerTime = 0.f;
	UPROPERTY(Replicated, BlueprintReadOnly) int32 MaxPlayersPerTeam = 4;

	FOnHRGameStateChanged OnPhaseChanged;
	FOnHRGameStateChanged OnAlarmChanged;
	FOnHRGameStateChanged OnNegotiationChanged;

	/** Server: also fires delegates locally (listen server). */
	void ServerSetPhase(EHRMatchPhase NewPhase, float DurationSeconds);
	void ServerNegotiationUpdated() { OnRep_Negotiation(); }
	void ServerAlarmUpdated() { OnRep_Alarm(); }

private:
	UFUNCTION() void OnRep_Phase();
	UFUNCTION() void OnRep_Alarm();
	UFUNCTION() void OnRep_Negotiation();
};
