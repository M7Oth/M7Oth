// Lockpicking minigame rules (server-authoritative).
//
// The lock has N pins. Each pin has a hidden "sweet" angle. The player sweeps the pick
// angle with the mouse and holds tension (LMB). While tension is applied:
//   * inside the sweet window  -> the current pin rises; when full it sets and the next pin begins.
//   * outside the sweet window -> the pick accumulates stress proportional to the error;
//                                 full stress snaps the pick (one lockpick consumed).
// Releasing tension lets stress recover and the unset pin slowly fall back.
// The client only ever receives "Feedback" (closeness rumble, progress, stress) - never the
// sweet angle - so the solution cannot be read from replicated data.
#pragma once

#include "HeistRulesCommon.h"
#include <vector>

namespace HeistRules
{
	struct FLockpickDifficulty
	{
		int32_t PinCount = 4;
		float AngleRange = 90.f;          // Pick angle in [-AngleRange, +AngleRange] degrees.
		float SweetTolerance = 9.f;       // Half-width of the sweet window, degrees.
		float FeedbackRange = 45.f;       // Distance at which closeness rumble begins.
		float SetSeconds = 0.9f;          // Time at full tension inside window to set one pin.
		float StressSeconds = 1.6f;       // Time at full tension at max error to snap the pick.
		float StressRecoveryPerSecond = 0.8f;
		float PinFallPerSecond = 0.5f;
	};

	enum class ELockpickEvent : uint8_t
	{
		None,
		PinSet,
		PickBroken,
		Unlocked,
	};

	struct FLockpickFeedback
	{
		float Closeness = 0.f;    // 0..1, how close the pick is to the current sweet spot (UI rumble).
		float PinProgress = 0.f;  // 0..1, current pin.
		float Stress = 0.f;       // 0..1, pick stress.
		int32_t PinsSet = 0;
		int32_t PinCount = 0;
		ELockpickEvent Event = ELockpickEvent::None;
	};

	class FLockpickModel
	{
	public:
		FLockpickModel() : Rng(1u) {}

		void Reset(uint32_t Seed, const FLockpickDifficulty& InDifficulty)
		{
			Difficulty = InDifficulty;
			if (Difficulty.PinCount < 1) { Difficulty.PinCount = 1; }
			Rng = FRng(Seed);
			SweetAngles.clear();
			const float Margin = Difficulty.SweetTolerance;
			for (int32_t i = 0; i < Difficulty.PinCount; ++i)
			{
				SweetAngles.push_back(Rng.Range(-Difficulty.AngleRange + Margin, Difficulty.AngleRange - Margin));
			}
			PinsSet = 0;
			Progress = 0.f;
			Stress = 0.f;
		}

		bool IsUnlocked() const { return PinsSet >= Difficulty.PinCount; }
		int32_t GetPinsSet() const { return PinsSet; }
		const FLockpickDifficulty& GetDifficulty() const { return Difficulty; }

		// Test / debug only. Never replicate this.
		float DebugSweetAngle() const { return IsUnlocked() ? 0.f : SweetAngles[static_cast<size_t>(PinsSet)]; }

		// Advance the simulation. PickAngle in degrees, Tension in [0,1].
		FLockpickFeedback Step(float Dt, float PickAngle, float Tension)
		{
			FLockpickFeedback Out;
			Out.PinCount = Difficulty.PinCount;
			if (IsUnlocked() || Dt <= 0.f)
			{
				Out.PinsSet = PinsSet;
				Out.PinProgress = IsUnlocked() ? 1.f : Progress;
				Out.Closeness = IsUnlocked() ? 1.f : 0.f;
				return Out;
			}

			PickAngle = Clamp(PickAngle, -Difficulty.AngleRange, Difficulty.AngleRange);
			Tension = Clamp(Tension, 0.f, 1.f);

			const float Sweet = SweetAngles[static_cast<size_t>(PinsSet)];
			const float Error = Abs(PickAngle - Sweet);
			Out.Closeness = Clamp(1.f - Error / Difficulty.FeedbackRange, 0.f, 1.f);

			if (Tension > 0.05f)
			{
				if (Error <= Difficulty.SweetTolerance)
				{
					Progress += Tension * Dt / Difficulty.SetSeconds;
					Stress = Clamp(Stress - Difficulty.StressRecoveryPerSecond * 0.25f * Dt, 0.f, 1.f);
					if (Progress >= 1.f)
					{
						++PinsSet;
						Progress = 0.f;
						Out.Event = IsUnlocked() ? ELockpickEvent::Unlocked : ELockpickEvent::PinSet;
					}
				}
				else
				{
					const float ErrorFrac = Clamp((Error - Difficulty.SweetTolerance) / (2.f * Difficulty.AngleRange), 0.1f, 1.f);
					Stress += Tension * ErrorFrac * Dt / Difficulty.StressSeconds * 2.f;
					if (Stress >= 1.f)
					{
						Stress = 0.f;
						Progress = 0.f; // Current pin drops; already-set pins stay set.
						Out.Event = ELockpickEvent::PickBroken;
					}
				}
			}
			else
			{
				Stress = Clamp(Stress - Difficulty.StressRecoveryPerSecond * Dt, 0.f, 1.f);
				Progress = Clamp(Progress - Difficulty.PinFallPerSecond * Dt, 0.f, 1.f);
			}

			Out.PinsSet = PinsSet;
			Out.PinProgress = IsUnlocked() ? 1.f : Progress;
			Out.Stress = Stress;
			return Out;
		}

	private:
		FLockpickDifficulty Difficulty;
		FRng Rng;
		std::vector<float> SweetAngles;
		int32_t PinsSet = 0;
		float Progress = 0.f;
		float Stress = 0.f;
	};
}
