// Hostage negotiation rules.
//
// A negotiation line opens once the alarm is raised and robbers hold at least one hostage.
// Either team may propose one deal at a time; the other team has a limited window to answer.
// Accepted deals return an FDealOutcome that the GameMode applies (release hostages, truce,
// clock change, getaway vehicle delivery, surrender). Abuse limits:
//   * Only one pending proposal at a time, response window ResponseSeconds.
//   * Proposer cooldown after a rejection / expiry (no spam).
//   * Cap on accepted deals per match and on total truce seconds (no infinite stalling).
//   * Truce violations end the truce immediately and are recorded against the violator.
#pragma once

#include "HeistRulesCommon.h"

namespace HeistRules
{
	enum class EDealType : uint8_t
	{
		None,
		HostageForTruce,      // Robbers: release 1 hostage -> police hold perimeter + hold fire for TruceSeconds.
		HostagesForVehicle,   // Robbers: release 2 hostages -> police deliver a getaway vehicle.
		HostageForTime,       // Robbers: release 1 hostage -> match clock extended.
		SurrenderTerms,       // Police: robbers surrender now -> reduced penalties for robbers, early end.
		MutualCeasefire,      // Either: short ceasefire, no other terms.
		Count
	};

	enum class ENegotiationState : uint8_t
	{
		Closed,
		Open,
		ProposalPending,
	};

	enum class ENegotiationResult : uint8_t
	{
		Ok,
		LineClosed,
		ProposalAlreadyPending,
		NoPendingProposal,
		OnCooldown,
		NotAllowedForTeam,
		NotEnoughHostages,
		DealLimitReached,
		TruceBudgetExhausted,
		CannotAnswerOwnProposal,
	};

	struct FNegotiationConfig
	{
		float ResponseSeconds = 20.f;
		float RejectCooldownSeconds = 25.f;
		int32_t MaxAcceptedDeals = 4;
		float TruceSeconds = 45.f;
		float CeasefireSeconds = 25.f;
		float MaxTotalTruceSeconds = 120.f;
		float TimeExtensionSeconds = 60.f;
	};

	struct FDealOutcome
	{
		EDealType Deal = EDealType::None;
		int32_t HostagesToRelease = 0;
		float TruceSeconds = 0.f;           // Police must stay out of the bank perimeter, nobody fires.
		float ClockDeltaSeconds = 0.f;
		bool bDeliverGetawayVehicle = false;
		bool bRobbersSurrender = false;
	};

	struct FProposal
	{
		EDealType Deal = EDealType::None;
		ETeam Proposer = ETeam::None;
		float ExpiresAt = 0.f;
	};

	class FNegotiationModel
	{
	public:
		FNegotiationConfig Config;

		ENegotiationState State() const { return CurrentState; }
		const FProposal& Pending() const { return PendingProposal; }
		int32_t AcceptedDeals() const { return Accepted; }
		float TruceSecondsUsed() const { return TruceUsed; }
		bool IsTruceActive(float Now) const { return Now < TruceEndsAt; }
		float TruceEndsAtTime() const { return TruceEndsAt; }
		int32_t Violations(ETeam Team) const { return Team == ETeam::Police ? PoliceViolations : (Team == ETeam::Robbers ? RobberViolations : 0); }

		static int32_t HostagesRequired(EDealType Deal)
		{
			switch (Deal)
			{
			case EDealType::HostageForTruce:    return 1;
			case EDealType::HostagesForVehicle: return 2;
			case EDealType::HostageForTime:     return 1;
			default:                            return 0;
			}
		}

		static bool TeamMayPropose(ETeam Team, EDealType Deal)
		{
			switch (Deal)
			{
			case EDealType::HostageForTruce:
			case EDealType::HostagesForVehicle:
			case EDealType::HostageForTime:   return Team == ETeam::Robbers;
			case EDealType::SurrenderTerms:   return Team == ETeam::Police;
			case EDealType::MutualCeasefire:  return Team == ETeam::Police || Team == ETeam::Robbers;
			default:                          return false;
			}
		}

		void Open()
		{
			if (CurrentState == ENegotiationState::Closed) { CurrentState = ENegotiationState::Open; }
		}

		// Called when robbers have no hostages left, or the match is resolving.
		void Close()
		{
			CurrentState = ENegotiationState::Closed;
			PendingProposal = FProposal();
		}

		float CooldownRemaining(ETeam Team, float Now) const
		{
			const float Until = (Team == ETeam::Police) ? PoliceCooldownUntil : RobberCooldownUntil;
			return Until > Now ? Until - Now : 0.f;
		}

		ENegotiationResult Propose(ETeam Team, EDealType Deal, float Now, int32_t HostagesHeld)
		{
			if (CurrentState == ENegotiationState::Closed) { return ENegotiationResult::LineClosed; }
			if (CurrentState == ENegotiationState::ProposalPending) { return ENegotiationResult::ProposalAlreadyPending; }
			if (!TeamMayPropose(Team, Deal)) { return ENegotiationResult::NotAllowedForTeam; }
			if (CooldownRemaining(Team, Now) > 0.f) { return ENegotiationResult::OnCooldown; }
			if (Accepted >= Config.MaxAcceptedDeals) { return ENegotiationResult::DealLimitReached; }
			if (HostagesHeld < HostagesRequired(Deal)) { return ENegotiationResult::NotEnoughHostages; }
			if (TruceCost(Deal) > 0.f && TruceUsed + TruceCost(Deal) > Config.MaxTotalTruceSeconds) { return ENegotiationResult::TruceBudgetExhausted; }

			PendingProposal.Deal = Deal;
			PendingProposal.Proposer = Team;
			PendingProposal.ExpiresAt = Now + Config.ResponseSeconds;
			CurrentState = ENegotiationState::ProposalPending;
			return ENegotiationResult::Ok;
		}

		// HostagesHeld is re-checked at accept time: robbers cannot sell hostages they lost meanwhile.
		ENegotiationResult Respond(ETeam Team, bool bAccept, float Now, int32_t HostagesHeld, FDealOutcome& OutOutcome)
		{
			OutOutcome = FDealOutcome();
			if (CurrentState != ENegotiationState::ProposalPending) { return ENegotiationResult::NoPendingProposal; }
			if (Team == PendingProposal.Proposer || Team == ETeam::None) { return ENegotiationResult::CannotAnswerOwnProposal; }

			const EDealType Deal = PendingProposal.Deal;
			const ETeam Proposer = PendingProposal.Proposer;
			PendingProposal = FProposal();
			CurrentState = ENegotiationState::Open;

			if (!bAccept)
			{
				StartCooldown(Proposer, Now);
				return ENegotiationResult::Ok;
			}
			if (HostagesHeld < HostagesRequired(Deal))
			{
				StartCooldown(Proposer, Now);
				return ENegotiationResult::NotEnoughHostages;
			}

			++Accepted;
			OutOutcome.Deal = Deal;
			OutOutcome.HostagesToRelease = HostagesRequired(Deal);
			switch (Deal)
			{
			case EDealType::HostageForTruce:    OutOutcome.TruceSeconds = Config.TruceSeconds; break;
			case EDealType::MutualCeasefire:    OutOutcome.TruceSeconds = Config.CeasefireSeconds; break;
			case EDealType::HostagesForVehicle: OutOutcome.bDeliverGetawayVehicle = true; break;
			case EDealType::HostageForTime:     OutOutcome.ClockDeltaSeconds = Config.TimeExtensionSeconds; break;
			case EDealType::SurrenderTerms:     OutOutcome.bRobbersSurrender = true; break;
			default: break;
			}
			if (OutOutcome.TruceSeconds > 0.f)
			{
				TruceUsed += OutOutcome.TruceSeconds;
				TruceEndsAt = Now + OutOutcome.TruceSeconds;
			}
			return ENegotiationResult::Ok;
		}

		// Returns true if a pending proposal expired on this tick.
		bool Tick(float Now)
		{
			if (CurrentState == ENegotiationState::ProposalPending && Now >= PendingProposal.ExpiresAt)
			{
				StartCooldown(PendingProposal.Proposer, Now);
				PendingProposal = FProposal();
				CurrentState = ENegotiationState::Open;
				return true;
			}
			return false;
		}

		// A team damaged the other side / police breached the perimeter during a truce.
		// Returns true if a truce was actually broken.
		bool ReportViolation(ETeam Violator, float Now)
		{
			if (!IsTruceActive(Now)) { return false; }
			TruceEndsAt = Now;
			if (Violator == ETeam::Police) { ++PoliceViolations; }
			else if (Violator == ETeam::Robbers) { ++RobberViolations; }
			return true;
		}

	private:
		float TruceCost(EDealType Deal) const
		{
			if (Deal == EDealType::HostageForTruce) { return Config.TruceSeconds; }
			if (Deal == EDealType::MutualCeasefire) { return Config.CeasefireSeconds; }
			return 0.f;
		}

		void StartCooldown(ETeam Team, float Now)
		{
			if (Team == ETeam::Police) { PoliceCooldownUntil = Now + Config.RejectCooldownSeconds; }
			else if (Team == ETeam::Robbers) { RobberCooldownUntil = Now + Config.RejectCooldownSeconds; }
		}

		ENegotiationState CurrentState = ENegotiationState::Closed;
		FProposal PendingProposal;
		int32_t Accepted = 0;
		float TruceUsed = 0.f;
		float TruceEndsAt = -1.f;
		float PoliceCooldownUntil = 0.f;
		float RobberCooldownUntil = 0.f;
		int32_t PoliceViolations = 0;
		int32_t RobberViolations = 0;
	};
}
