// Match flow and resolution rules.
//
// Phases:  WaitingForPlayers -> Preparation -> Infiltration -> Response -> Ended
//   Preparation : robbers gear up at the safehouse / van, police patrol (dynamic events).
//   Infiltration: heist is live, alarm not yet raised. Main clock runs.
//   Response    : alarm raised. Clock is clamped to ResponseClockSeconds so the loud phase
//                 is always bounded but never shorter than a fair escape window.
//   Ended       : result decided.
//
// Win rules (evaluated by EvaluateOutcome every server tick during Infiltration/Response):
//   * Robbers win when every robber still in play has escaped or been neutralised AND
//     secured loot >= target, or when the clock runs out with secured >= target.
//   * Police win when the target becomes mathematically unreachable
//     (secured + loot still in play < target), when all robbers are arrested/escaped with
//     secured < target, on time-out with secured < target, or on robber surrender.
//   * Forfeits: a team with zero connected players for ForfeitGraceSeconds loses.
#pragma once

#include "HeistRulesCommon.h"
#include "LootLedger.h"

namespace HeistRules
{
	enum class EMatchPhase : uint8_t
	{
		WaitingForPlayers,
		Preparation,
		Infiltration,
		Response,
		Ended,
	};

	enum class EMatchWinner : uint8_t
	{
		Undecided,
		Police,
		Robbers,
		Draw,
	};

	enum class EMatchEndReason : uint8_t
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

	struct FMatchConfig
	{
		float PreparationSeconds = 60.f;
		float MainClockSeconds = 900.f;     // 15 min total heist window.
		float ResponseClockSeconds = 420.f; // Max remaining time once the alarm goes off.
		float MinResponseSeconds = 240.f;   // Never fewer than this after the alarm (fair escape window).
		float TargetLootFraction = 0.5f;    // Robbers must secure at least this share of total loot.
		float ForfeitGraceSeconds = 30.f;
		int32_t MinPlayersPerTeamToStart = 1;
	};

	struct FMatchSnapshot
	{
		FLootTotals Loot;
		int32_t RobbersConnected = 0;
		int32_t PoliceConnected = 0;
		int32_t RobbersInPlay = 0;    // Connected, not arrested, not escaped (downed still counts).
		int32_t RobbersEscaped = 0;
		int32_t RobbersArrested = 0;
		float TimeRemaining = 0.f;
		float PoliceAbsentSeconds = 0.f;  // How long police has had zero connected players.
		float RobbersAbsentSeconds = 0.f;
		bool bRobbersSurrendered = false;
		bool bHeistStarted = false;       // At least one robber left the prep area / vault touched.
	};

	struct FMatchOutcome
	{
		EMatchWinner Winner = EMatchWinner::Undecided;
		EMatchEndReason Reason = EMatchEndReason::None;
		bool IsDecided() const { return Winner != EMatchWinner::Undecided; }
	};

	inline int64_t TargetLootValue(const FMatchConfig& Cfg, const FLootTotals& Loot)
	{
		const int64_t T = static_cast<int64_t>(static_cast<double>(Loot.Total) * Cfg.TargetLootFraction + 0.5);
		return T < 1 ? 1 : T;
	}

	// Time remaining right after the alarm is raised.
	inline float ClampClockOnAlarm(const FMatchConfig& Cfg, float TimeRemaining)
	{
		float T = TimeRemaining;
		if (T > Cfg.ResponseClockSeconds) { T = Cfg.ResponseClockSeconds; }
		if (T < Cfg.MinResponseSeconds) { T = Cfg.MinResponseSeconds; }
		return T;
	}

	inline FMatchOutcome EvaluateOutcome(const FMatchConfig& Cfg, const FMatchSnapshot& S)
	{
		FMatchOutcome O;

		// Forfeits first.
		if (S.RobbersConnected == 0 && S.PoliceConnected == 0)
		{
			O.Winner = EMatchWinner::Draw; O.Reason = EMatchEndReason::Abandoned; return O;
		}
		if (S.RobbersConnected == 0 && S.RobbersEscaped == 0 && S.RobbersAbsentSeconds >= Cfg.ForfeitGraceSeconds)
		{
			O.Winner = EMatchWinner::Police; O.Reason = EMatchEndReason::RobbersForfeit; return O;
		}
		if (S.PoliceConnected == 0 && S.PoliceAbsentSeconds >= Cfg.ForfeitGraceSeconds)
		{
			O.Winner = EMatchWinner::Robbers; O.Reason = EMatchEndReason::PoliceForfeit; return O;
		}

		if (S.bRobbersSurrendered)
		{
			O.Winner = EMatchWinner::Police; O.Reason = EMatchEndReason::RobbersSurrendered; return O;
		}

		const int64_t Target = TargetLootValue(Cfg, S.Loot);
		const bool bTargetMet = S.Loot.Secured >= Target;

		// Police made the target unreachable (recovered enough money).
		if (S.Loot.Total > 0 && S.Loot.Secured + S.Loot.StillInPlay() < Target)
		{
			O.Winner = EMatchWinner::Police; O.Reason = EMatchEndReason::LootUnreachable; return O;
		}

		// No robber left in play (everyone escaped or arrested).
		if (S.bHeistStarted && S.RobbersInPlay == 0 && (S.RobbersEscaped + S.RobbersArrested) > 0)
		{
			if (bTargetMet) { O.Winner = EMatchWinner::Robbers; O.Reason = EMatchEndReason::LootExtracted; }
			else            { O.Winner = EMatchWinner::Police;  O.Reason = EMatchEndReason::AllRobbersNeutralized; }
			return O;
		}

		if (S.TimeRemaining <= 0.f)
		{
			if (bTargetMet) { O.Winner = EMatchWinner::Robbers; O.Reason = EMatchEndReason::TimeExpiredRobbersHadLoot; }
			else            { O.Winner = EMatchWinner::Police;  O.Reason = EMatchEndReason::TimeExpired; }
			return O;
		}
		return O;
	}

	// Team balancing: which team should the next joining player go to.
	inline ETeam ChooseTeamForNewPlayer(int32_t PoliceCount, int32_t RobberCount, int32_t MaxPerTeam, ETeam Preferred)
	{
		const bool bPoliceFull = PoliceCount >= MaxPerTeam;
		const bool bRobbersFull = RobberCount >= MaxPerTeam;
		if (bPoliceFull && bRobbersFull) { return ETeam::None; }
		if (Preferred == ETeam::Police && !bPoliceFull && PoliceCount <= RobberCount) { return ETeam::Police; }
		if (Preferred == ETeam::Robbers && !bRobbersFull && RobberCount <= PoliceCount) { return ETeam::Robbers; }
		if (bPoliceFull) { return ETeam::Robbers; }
		if (bRobbersFull) { return ETeam::Police; }
		return (PoliceCount <= RobberCount) ? ETeam::Police : ETeam::Robbers;
	}

	// Whether a manual team switch keeps teams within one player of each other.
	inline bool CanSwitchTeam(ETeam From, int32_t PoliceCount, int32_t RobberCount, int32_t MaxPerTeam)
	{
		if (From == ETeam::Police) { return RobberCount < MaxPerTeam && (RobberCount + 1) - (PoliceCount - 1) <= 1; }
		if (From == ETeam::Robbers) { return PoliceCount < MaxPerTeam && (PoliceCount + 1) - (RobberCount - 1) <= 1; }
		return false;
	}
}
