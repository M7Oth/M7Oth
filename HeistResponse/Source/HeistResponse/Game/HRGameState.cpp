#include "Game/HRGameState.h"
#include "Game/HRPlayerState.h"
#include "Net/UnrealNetwork.h"

void AHRGameState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRGameState, Phase);
	DOREPLIFETIME(AHRGameState, PhaseEndServerTime);
	DOREPLIFETIME(AHRGameState, bAlarmRaised);
	DOREPLIFETIME(AHRGameState, AlarmReason);
	DOREPLIFETIME(AHRGameState, bPoliceDispatched);
	DOREPLIFETIME(AHRGameState, DispatchServerTime);
	DOREPLIFETIME(AHRGameState, Suspicion01);
	DOREPLIFETIME(AHRGameState, bVaultOpened);
	DOREPLIFETIME(AHRGameState, TotalLootValue);
	DOREPLIFETIME(AHRGameState, TargetLootValue);
	DOREPLIFETIME(AHRGameState, SecuredLootValue);
	DOREPLIFETIME(AHRGameState, RecoveredLootValue);
	DOREPLIFETIME(AHRGameState, HostagesHeld);
	DOREPLIFETIME(AHRGameState, HostagesRescued);
	DOREPLIFETIME(AHRGameState, IncidentLocation);
	DOREPLIFETIME(AHRGameState, Negotiation);
	DOREPLIFETIME(AHRGameState, Winner);
	DOREPLIFETIME(AHRGameState, EndReason);
	DOREPLIFETIME(AHRGameState, LobbyCountdownEnd);
	DOREPLIFETIME(AHRGameState, RematchDecisionServerTime);
	DOREPLIFETIME(AHRGameState, MaxPlayersPerTeam);
}

TArray<AHRPlayerState*> AHRGameState::GetTeamPlayers(EHRTeam Team) const
{
	TArray<AHRPlayerState*> Out;
	for (APlayerState* PS : PlayerArray)
	{
		AHRPlayerState* HR = Cast<AHRPlayerState>(PS);
		if (HR && HR->GetTeam() == Team) { Out.Add(HR); }
	}
	return Out;
}

int32 AHRGameState::CountTeam(EHRTeam Team) const
{
	return GetTeamPlayers(Team).Num();
}

void AHRGameState::ServerSetPhase(EHRMatchPhase NewPhase, float DurationSeconds)
{
	Phase = NewPhase;
	PhaseEndServerTime = DurationSeconds > 0.f ? GetServerNow() + DurationSeconds : 0.f;
	OnRep_Phase();
}

void AHRGameState::OnRep_Phase() { OnPhaseChanged.Broadcast(); }
void AHRGameState::OnRep_Alarm() { OnAlarmChanged.Broadcast(); }
void AHRGameState::OnRep_Negotiation() { OnNegotiationChanged.Broadcast(); }
