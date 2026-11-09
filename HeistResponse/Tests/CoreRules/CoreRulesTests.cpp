// Standalone unit tests for Source/HeistResponse/Rules (no Unreal required).
// Build: cmake -S Tests/CoreRules -B Build/CoreRulesTests && cmake --build Build/CoreRulesTests && ctest --test-dir Build/CoreRulesTests
#include "LootLedger.h"
#include "AlarmModel.h"
#include "LockpickModel.h"
#include "NegotiationModel.h"
#include "MatchRules.h"

#include <cstdio>
#include <functional>
#include <string>
#include <vector>

using namespace HeistRules;

static int GFailures = 0;
static int GChecks = 0;

#define CHECK(Expr) do { ++GChecks; if (!(Expr)) { ++GFailures; std::printf("  FAIL %s:%d  %s\n", __FILE__, __LINE__, #Expr); } } while (0)

struct FTest { const char* Name; std::function<void()> Fn; };
static std::vector<FTest>& Registry() { static std::vector<FTest> R; return R; }
struct FReg { FReg(const char* N, std::function<void()> F) { Registry().push_back({N, F}); } };
#define TEST(Name) static void Name(); static FReg Name##_reg(#Name, Name); static void Name()

// ---------------------------------------------------------------- Loot ledger
TEST(Loot_PickupDropRecover)
{
	FLootLedger L;
	const EntityId A = L.AddBag(10000);
	const EntityId B = L.AddBag(10000);
	CHECK(L.PickUp(A, 1, ETeam::Robbers) == ELootResult::Ok);
	CHECK(L.PickUp(B, 1, ETeam::Robbers) == ELootResult::CarryLimitReached);
	CHECK(L.PickUp(A, 2, ETeam::Robbers) == ELootResult::InvalidTransition); // already carried
	CHECK(L.Drop(A, 2) == ELootResult::NotHolder);
	CHECK(L.Drop(A, 1) == ELootResult::Ok);
	CHECK(L.PickUp(A, 7, ETeam::Police) == ELootResult::Ok);                // police recovers
	CHECK(L.Find(A)->State == ELootState::Recovered);
	CHECK(L.PickUp(A, 1, ETeam::Robbers) == ELootResult::InvalidTransition); // terminal
	CHECK(L.PickUp(B, 7, ETeam::Police) == ELootResult::InvalidTransition);  // police can't empty the vault
	CHECK(L.CheckInvariants());
}

TEST(Loot_NoDuplicationOnSecure)
{
	FLootLedger L;
	const EntityId A = L.AddBag(5000);
	CHECK(L.PickUp(A, 1, ETeam::Robbers) == ELootResult::Ok);
	CHECK(L.SecureCarried(A, 1) == ELootResult::Ok);
	CHECK(L.SecureCarried(A, 1) == ELootResult::InvalidTransition);
	CHECK(L.Drop(A, 1) == ELootResult::InvalidTransition);
	CHECK(L.Totals().Secured == 5000);
	CHECK(L.Totals().Total == 5000);
	CHECK(L.CheckInvariants());
}

TEST(Loot_TransferAndVehicle)
{
	FLootLedger L;
	const EntityId A = L.AddBag(1000);
	const EntityId B = L.AddBag(2000);
	CHECK(L.PickUp(A, 1, ETeam::Robbers) == ELootResult::Ok);
	CHECK(L.PickUp(B, 2, ETeam::Robbers) == ELootResult::Ok);
	CHECK(L.Transfer(A, 1, 2) == ELootResult::CarryLimitReached);
	CHECK(L.StoreInVehicle(B, 2, 100) == ELootResult::Ok);
	CHECK(L.Transfer(A, 1, 2) == ELootResult::Ok);
	CHECK(L.StoreInVehicle(A, 2, 100) == ELootResult::Ok);
	CHECK(L.Totals().InVehicle == 3000);
	CHECK(L.SpillVehicle(100) == 2);       // vehicle wrecked -> bags on the ground
	CHECK(L.Totals().Dropped == 3000);
	CHECK(L.PickUp(A, 3, ETeam::Robbers) == ELootResult::Ok);
	CHECK(L.StoreInVehicle(A, 3, 200) == ELootResult::Ok);
	CHECK(L.SecureVehicle(200) == 1);
	CHECK(L.SecureVehicle(200) == 0);      // second call cannot double count
	CHECK(L.Totals().Secured == 1000);
	CHECK(L.CheckInvariants());
}

TEST(Loot_DisconnectDropsBags)
{
	FLootLedger L;
	L.MaxBagsPerPlayer = 2;
	const EntityId A = L.AddBag(1);
	const EntityId B = L.AddBag(2);
	CHECK(L.PickUp(A, 9, ETeam::Robbers) == ELootResult::Ok);
	CHECK(L.PickUp(B, 9, ETeam::Robbers) == ELootResult::Ok);
	CHECK(L.DropAllCarriedBy(9) == 2);
	CHECK(L.CountCarriedBy(9) == 0);
	CHECK(L.Totals().Dropped == 3);
	CHECK(L.CheckInvariants());
}

TEST(Loot_RandomizedInvariantFuzz)
{
	FLootLedger L;
	for (int i = 0; i < 12; ++i) { L.AddBag(1000 + i); }
	FRng R(1234);
	for (int Step = 0; Step < 20000; ++Step)
	{
		const EntityId Bag = static_cast<EntityId>(R.Next() % 14) - 1; // includes invalid ids
		const PlayerId P = static_cast<PlayerId>(R.Next() % 5);
		switch (R.Next() % 8)
		{
		case 0: L.PickUp(Bag, P, (R.Next() & 1) ? ETeam::Robbers : ETeam::Police); break;
		case 1: L.Drop(Bag, P); break;
		case 2: L.Transfer(Bag, P, static_cast<PlayerId>(R.Next() % 5)); break;
		case 3: L.StoreInVehicle(Bag, P, 50 + static_cast<EntityId>(R.Next() % 2)); break;
		case 4: if (R.Next() % 10 == 0) { L.SecureVehicle(50); } break;
		case 5: if (R.Next() % 10 == 0) { L.SpillVehicle(51); } break;
		case 6: L.DropAllCarriedBy(P); break;
		case 7: if (R.Next() % 4 == 0) { L.SecureCarried(Bag, P); } break;
		}
		if (!L.CheckInvariants()) { CHECK(false); return; }
	}
	CHECK(L.Totals().Total == 12 * 1000 + 66);
}

// ---------------------------------------------------------------- Alarm
TEST(Alarm_VaultOpeningAlwaysRaisesAlarm)
{
	FAlarmModel A;
	CHECK(!A.IsRaised());
	A.OnVaultOpened();
	CHECK(A.IsRaised());
	CHECK(A.Reason() == EAlarmReason::VaultOpened);
	CHECK(A.TimeUntilDispatch() == A.Config.VaultDispatchDelaySeconds);
}

TEST(Alarm_SuspicionThresholdAndDecay)
{
	FAlarmModel A;
	CHECK(!A.AddSuspicion(60.f));
	A.Tick(10.f); // decays 20
	CHECK(A.Suspicion() > 39.f && A.Suspicion() < 41.f);
	CHECK(A.AddSuspicion(70.f));
	CHECK(A.IsRaised());
	CHECK(A.Reason() == EAlarmReason::Suspicion);
	A.Tick(100.f);
	CHECK(A.IsRaised()); // never resets
}

TEST(Alarm_DispatchTimingAndVaultShortensTimer)
{
	FAlarmModel A;
	A.Raise(EAlarmReason::GuardTriggered);
	CHECK(A.TimeUntilDispatch() == 20.f);
	CHECK(!A.Tick(5.f));
	A.OnVaultOpened(); // shortens to 10
	CHECK(A.Reason() == EAlarmReason::GuardTriggered);
	CHECK(A.TimeUntilDispatch() == 10.f);
	CHECK(!A.Tick(9.f));
	CHECK(A.Tick(1.5f));
	CHECK(A.IsDispatched());
	CHECK(!A.Tick(1.f)); // only fires once
}

// ---------------------------------------------------------------- Lockpick
TEST(Lockpick_SolvesWhenOnSweetSpot)
{
	FLockpickModel M;
	FLockpickDifficulty D;
	M.Reset(42, D);
	int Events = 0;
	for (int i = 0; i < 2000 && !M.IsUnlocked(); ++i)
	{
		const FLockpickFeedback F = M.Step(1.f / 30.f, M.DebugSweetAngle(), 1.f);
		CHECK(F.Event != ELockpickEvent::PickBroken);
		if (F.Event == ELockpickEvent::PinSet || F.Event == ELockpickEvent::Unlocked) { ++Events; }
	}
	CHECK(M.IsUnlocked());
	CHECK(Events == D.PinCount);
}

TEST(Lockpick_BreaksWhenForcingWrongAngle)
{
	FLockpickModel M;
	M.Reset(7, FLockpickDifficulty());
	const float Wrong = M.DebugSweetAngle() > 0.f ? -85.f : 85.f;
	bool bBroke = false;
	for (int i = 0; i < 600; ++i)
	{
		if (M.Step(1.f / 30.f, Wrong, 1.f).Event == ELockpickEvent::PickBroken) { bBroke = true; break; }
	}
	CHECK(bBroke);
	CHECK(!M.IsUnlocked());
}

TEST(Lockpick_DeterministicFromSeedAndClosenessMonotonic)
{
	FLockpickModel A, B;
	A.Reset(99, FLockpickDifficulty());
	B.Reset(99, FLockpickDifficulty());
	CHECK(A.DebugSweetAngle() == B.DebugSweetAngle());
	const float S = A.DebugSweetAngle();
	const float Near = A.Step(0.01f, S + 2.f, 0.f).Closeness;
	const float Far = A.Step(0.01f, S + 30.f, 0.f).Closeness;
	CHECK(Near > Far);
}

TEST(Lockpick_NoTensionRecoversStress)
{
	FLockpickModel M;
	M.Reset(3, FLockpickDifficulty());
	const float Wrong = M.DebugSweetAngle() > 0.f ? -80.f : 80.f;
	FLockpickFeedback F;
	for (int i = 0; i < 10; ++i) { F = M.Step(0.05f, Wrong, 1.f); }
	const float Stressed = F.Stress;
	CHECK(Stressed > 0.f);
	F = M.Step(0.5f, Wrong, 0.f);
	CHECK(F.Stress < Stressed);
}

// ---------------------------------------------------------------- Negotiation
TEST(Negotiation_FullDealFlow)
{
	FNegotiationModel N;
	FDealOutcome O;
	CHECK(N.Propose(ETeam::Robbers, EDealType::HostageForTruce, 0.f, 2) == ENegotiationResult::LineClosed);
	N.Open();
	CHECK(N.Propose(ETeam::Police, EDealType::HostageForTruce, 0.f, 2) == ENegotiationResult::NotAllowedForTeam);
	CHECK(N.Propose(ETeam::Robbers, EDealType::HostagesForVehicle, 0.f, 1) == ENegotiationResult::NotEnoughHostages);
	CHECK(N.Propose(ETeam::Robbers, EDealType::HostageForTruce, 0.f, 2) == ENegotiationResult::Ok);
	CHECK(N.Propose(ETeam::Police, EDealType::SurrenderTerms, 1.f, 2) == ENegotiationResult::ProposalAlreadyPending);
	CHECK(N.Respond(ETeam::Robbers, true, 2.f, 2, O) == ENegotiationResult::CannotAnswerOwnProposal);
	CHECK(N.Respond(ETeam::Police, true, 2.f, 2, O) == ENegotiationResult::Ok);
	CHECK(O.HostagesToRelease == 1);
	CHECK(O.TruceSeconds == N.Config.TruceSeconds);
	CHECK(N.IsTruceActive(10.f));
	CHECK(N.ReportViolation(ETeam::Police, 10.f));
	CHECK(!N.IsTruceActive(10.5f));
	CHECK(N.Violations(ETeam::Police) == 1);
}

TEST(Negotiation_RejectCooldownAndExpiry)
{
	FNegotiationModel N;
	FDealOutcome O;
	N.Open();
	CHECK(N.Propose(ETeam::Police, EDealType::SurrenderTerms, 0.f, 0) == ENegotiationResult::Ok);
	CHECK(N.Respond(ETeam::Robbers, false, 1.f, 0, O) == ENegotiationResult::Ok);
	CHECK(O.Deal == EDealType::None);
	CHECK(N.Propose(ETeam::Police, EDealType::MutualCeasefire, 5.f, 0) == ENegotiationResult::OnCooldown);
	CHECK(N.Propose(ETeam::Robbers, EDealType::MutualCeasefire, 5.f, 0) == ENegotiationResult::Ok);
	CHECK(!N.Tick(10.f));
	CHECK(N.Tick(25.1f)); // expired after ResponseSeconds
	CHECK(N.State() == ENegotiationState::Open);
	CHECK(N.CooldownRemaining(ETeam::Robbers, 26.f) > 0.f);
}

TEST(Negotiation_AntiStallLimits)
{
	FNegotiationModel N;
	FDealOutcome O;
	N.Open();
	float T = 0.f;
	int Accepted = 0;
	for (int i = 0; i < 10; ++i)
	{
		T += 100.f;
		if (N.Propose(ETeam::Robbers, EDealType::HostageForTruce, T, 10) == ENegotiationResult::Ok)
		{
			CHECK(N.Respond(ETeam::Police, true, T, 10, O) == ENegotiationResult::Ok);
			++Accepted;
		}
	}
	CHECK(N.TruceSecondsUsed() <= N.Config.MaxTotalTruceSeconds);
	CHECK(Accepted == 2); // 45 + 45 <= 120, third would exceed
	CHECK(N.Propose(ETeam::Robbers, EDealType::HostageForTruce, T + 100.f, 10) == ENegotiationResult::TruceBudgetExhausted);
}

TEST(Negotiation_HostagesLostBeforeAccept)
{
	FNegotiationModel N;
	FDealOutcome O;
	N.Open();
	CHECK(N.Propose(ETeam::Robbers, EDealType::HostagesForVehicle, 0.f, 2) == ENegotiationResult::Ok);
	CHECK(N.Respond(ETeam::Police, true, 3.f, 1, O) == ENegotiationResult::NotEnoughHostages);
	CHECK(!O.bDeliverGetawayVehicle);
	CHECK(N.AcceptedDeals() == 0);
}

// ---------------------------------------------------------------- Match rules
static FMatchSnapshot BaseSnapshot()
{
	FMatchSnapshot S;
	S.Loot.Total = 100; S.Loot.InVault = 100;
	S.RobbersConnected = 4; S.PoliceConnected = 4; S.RobbersInPlay = 4;
	S.TimeRemaining = 300.f; S.bHeistStarted = true;
	return S;
}

TEST(Match_RobbersWinOnExtraction)
{
	FMatchConfig C;
	FMatchSnapshot S = BaseSnapshot();
	CHECK(!EvaluateOutcome(C, S).IsDecided());
	S.Loot.InVault = 40; S.Loot.Secured = 60; S.RobbersInPlay = 0; S.RobbersEscaped = 3; S.RobbersArrested = 1;
	const FMatchOutcome O = EvaluateOutcome(C, S);
	CHECK(O.Winner == EMatchWinner::Robbers);
	CHECK(O.Reason == EMatchEndReason::LootExtracted);
}

TEST(Match_PoliceWinWhenLootUnreachable)
{
	FMatchConfig C;
	FMatchSnapshot S = BaseSnapshot();
	S.Loot.InVault = 0; S.Loot.Recovered = 60; S.Loot.Dropped = 30; S.Loot.Secured = 10;
	const FMatchOutcome O = EvaluateOutcome(C, S);
	CHECK(O.Winner == EMatchWinner::Police);
	CHECK(O.Reason == EMatchEndReason::LootUnreachable);
}

TEST(Match_TimeoutAndArrests)
{
	FMatchConfig C;
	FMatchSnapshot S = BaseSnapshot();
	S.TimeRemaining = 0.f;
	CHECK(EvaluateOutcome(C, S).Reason == EMatchEndReason::TimeExpired);
	S.Loot.InVault = 50; S.Loot.Secured = 50;
	CHECK(EvaluateOutcome(C, S).Winner == EMatchWinner::Robbers);
	S = BaseSnapshot();
	S.RobbersInPlay = 0; S.RobbersArrested = 4;
	CHECK(EvaluateOutcome(C, S).Reason == EMatchEndReason::AllRobbersNeutralized);
}

TEST(Match_ForfeitsAndSurrender)
{
	FMatchConfig C;
	FMatchSnapshot S = BaseSnapshot();
	S.PoliceConnected = 0; S.PoliceAbsentSeconds = 10.f;
	CHECK(!EvaluateOutcome(C, S).IsDecided()); // grace period
	S.PoliceAbsentSeconds = 31.f;
	CHECK(EvaluateOutcome(C, S).Reason == EMatchEndReason::PoliceForfeit);
	S = BaseSnapshot();
	S.bRobbersSurrendered = true;
	CHECK(EvaluateOutcome(C, S).Reason == EMatchEndReason::RobbersSurrendered);
}

TEST(Match_AlarmClockClamp)
{
	FMatchConfig C;
	CHECK(ClampClockOnAlarm(C, 800.f) == C.ResponseClockSeconds);
	CHECK(ClampClockOnAlarm(C, 100.f) == C.MinResponseSeconds);
	CHECK(ClampClockOnAlarm(C, 300.f) == 300.f);
}

TEST(Match_TeamBalancing)
{
	CHECK(ChooseTeamForNewPlayer(0, 0, 4, ETeam::Robbers) == ETeam::Robbers);
	CHECK(ChooseTeamForNewPlayer(2, 3, 4, ETeam::Robbers) == ETeam::Police);
	CHECK(ChooseTeamForNewPlayer(4, 3, 4, ETeam::Police) == ETeam::Robbers);
	CHECK(ChooseTeamForNewPlayer(4, 4, 4, ETeam::Police) == ETeam::None);
	CHECK(CanSwitchTeam(ETeam::Police, 3, 2, 4));
	CHECK(!CanSwitchTeam(ETeam::Police, 2, 3, 4));
	CHECK(!CanSwitchTeam(ETeam::Robbers, 4, 4, 4));
}

int main()
{
	for (const FTest& T : Registry())
	{
		const int Before = GFailures;
		T.Fn();
		std::printf("[%s] %s\n", GFailures == Before ? "PASS" : "FAIL", T.Name);
	}
	std::printf("\n%d tests, %d checks, %d failures\n", static_cast<int>(Registry().size()), GChecks, GFailures);
	return GFailures == 0 ? 0 : 1;
}
