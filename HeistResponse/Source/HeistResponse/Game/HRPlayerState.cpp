#include "Game/HRPlayerState.h"
#include "Net/UnrealNetwork.h"

void AHRPlayerState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRPlayerState, Team);
	DOREPLIFETIME(AHRPlayerState, bArrested);
	DOREPLIFETIME(AHRPlayerState, bEscaped);
	DOREPLIFETIME(AHRPlayerState, bReady);
	DOREPLIFETIME(AHRPlayerState, bVotedRematch);
	DOREPLIFETIME(AHRPlayerState, Stats);
}

void AHRPlayerState::CopyProperties(APlayerState* PlayerState)
{
	Super::CopyProperties(PlayerState);
	if (AHRPlayerState* Other = Cast<AHRPlayerState>(PlayerState))
	{
		Other->Team = Team;
		Other->bArrested = bArrested;
		Other->bEscaped = bEscaped;
		Other->Stats = Stats;
		Other->PreferredTeam = PreferredTeam;
	}
}

void AHRPlayerState::OverrideWith(APlayerState* PlayerState)
{
	Super::OverrideWith(PlayerState);
	if (const AHRPlayerState* Other = Cast<AHRPlayerState>(PlayerState))
	{
		Team = Other->Team;
		bArrested = Other->bArrested;
		bEscaped = Other->bEscaped;
		Stats = Other->Stats;
		PreferredTeam = Other->PreferredTeam;
	}
}
