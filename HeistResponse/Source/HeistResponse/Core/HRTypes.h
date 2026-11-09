#pragma once

#include "CoreMinimal.h"
#include "Rules/HeistRulesCommon.h"
#include "Rules/MatchRules.h"
#include "Rules/AlarmModel.h"
#include "Rules/NegotiationModel.h"
#include "HRTypes.generated.h"

// Reflected mirrors of the engine-independent rule enums (Rules/*.h). Values MUST match;
// static_asserts at the bottom enforce it.

UENUM(BlueprintType)
enum class EHRTeam : uint8
{
	None = 0,
	Police = 1,
	Robbers = 2,
};

UENUM(BlueprintType)
enum class EHRMatchPhase : uint8
{
	WaitingForPlayers,
	Preparation,
	Infiltration,
	Response,
	Ended,
};

UENUM(BlueprintType)
enum class EHRMatchWinner : uint8
{
	Undecided,
	Police,
	Robbers,
	Draw,
};

UENUM(BlueprintType)
enum class EHRMatchEndReason : uint8
{
	None,
	LootExtracted,
	TimeExpiredRobbersHadLoot,
	TimeExpired,
	AllRobbersNeutralized,
	LootUnreachable,
	RobbersSurrendered,
	PoliceForfeit,
	RobbersForfeit,
	Abandoned,
};

UENUM(BlueprintType)
enum class EHRAlarmReason : uint8
{
	None,
	Suspicion,
	GuardTriggered,
	Gunfire,
	VaultOpened,
	Manual,
};

UENUM(BlueprintType)
enum class EHRDealType : uint8
{
	None,
	HostageForTruce,
	HostagesForVehicle,
	HostageForTime,
	SurrenderTerms,
	MutualCeasefire,
	Count UMETA(Hidden),
};

UENUM(BlueprintType)
enum class EHRNegotiationState : uint8
{
	Closed,
	Open,
	ProposalPending,
};

UENUM(BlueprintType)
enum class EHRNotifyType : uint8
{
	Info,
	Objective,
	Warning,
	Alarm,
	Dispatch,
	Negotiation,
	Error,
};

UENUM(BlueprintType)
enum class EHRCameraMode : uint8
{
	ThirdPerson,
	FirstPerson,
};

UENUM(BlueprintType)
enum class EHRLifeState : uint8
{
	Alive,
	Downed,         // Can be revived by teammate; robbers can be arrested.
	Incapacitated,  // Out until respawn (police) or arrest processing (robbers).
};

/** Item identifiers used by the replicated inventory. Kept as FNames so data tables can extend them. */
namespace HRItems
{
	inline const FName Lockpick(TEXT("Lockpick"));
	inline const FName ThermalDrill(TEXT("ThermalDrill"));
	inline const FName VaultKeycard(TEXT("VaultKeycard"));
	inline const FName Zipties(TEXT("Zipties"));
	inline const FName SmokeGrenade(TEXT("SmokeGrenade"));
	inline const FName SpikeStrip(TEXT("SpikeStrip"));
	inline const FName MedKit(TEXT("MedKit"));
}

namespace HRTags
{
	inline const FName PoliceStart(TEXT("Police"));
	inline const FName RobberStart(TEXT("Robbers"));
	inline const FName HoldingCell(TEXT("HoldingCell"));
	inline const FName HostageSafePoint(TEXT("HostageSafePoint"));
	inline const FName BankIncident(TEXT("BankIncident"));
	inline const FName GetawayDelivery(TEXT("GetawayDelivery"));
	inline const FName PoliceRespawn(TEXT("PoliceRespawn"));
}

FORCEINLINE HeistRules::ETeam ToRules(EHRTeam T) { return static_cast<HeistRules::ETeam>(T); }
FORCEINLINE EHRTeam FromRules(HeistRules::ETeam T) { return static_cast<EHRTeam>(T); }
FORCEINLINE HeistRules::EDealType ToRules(EHRDealType D) { return static_cast<HeistRules::EDealType>(D); }
FORCEINLINE EHRDealType FromRules(HeistRules::EDealType D) { return static_cast<EHRDealType>(D); }

FORCEINLINE EHRTeam OpposingTeam(EHRTeam T)
{
	return T == EHRTeam::Police ? EHRTeam::Robbers : (T == EHRTeam::Robbers ? EHRTeam::Police : EHRTeam::None);
}

static_assert(static_cast<uint8>(EHRMatchPhase::Ended) == static_cast<uint8>(HeistRules::EMatchPhase::Ended), "phase mirror");
static_assert(static_cast<uint8>(EHRMatchEndReason::Abandoned) == static_cast<uint8>(HeistRules::EMatchEndReason::Abandoned), "reason mirror");
static_assert(static_cast<uint8>(EHRMatchWinner::Draw) == static_cast<uint8>(HeistRules::EMatchWinner::Draw), "winner mirror");
static_assert(static_cast<uint8>(EHRAlarmReason::Manual) == static_cast<uint8>(HeistRules::EAlarmReason::Manual), "alarm mirror");
static_assert(static_cast<uint8>(EHRDealType::Count) == static_cast<uint8>(HeistRules::EDealType::Count), "deal mirror");
static_assert(static_cast<uint8>(EHRNegotiationState::ProposalPending) == static_cast<uint8>(HeistRules::ENegotiationState::ProposalPending), "negotiation mirror");
