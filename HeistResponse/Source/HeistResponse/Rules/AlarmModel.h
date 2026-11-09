// Bank security / alarm rules.
//  * Suspicion accumulates from witnesses (guards, cameras, employees) and decays slowly.
//  * Crossing the threshold raises the alarm.
//  * MANDATORY: opening the vault raises the alarm immediately, regardless of suspicion.
//  * Once raised, the alarm never resets during a match.
//  * Police dispatch is delayed after the alarm so robbers get a meaningful window.
#pragma once

#include "HeistRulesCommon.h"

namespace HeistRules
{
	enum class EAlarmReason : uint8_t
	{
		None,
		Suspicion,      // Guards / cameras / civilians accumulated enough evidence.
		GuardTriggered, // A guard reached a panic button.
		Gunfire,        // Shots fired inside the bank.
		VaultOpened,    // Mandatory alarm on vault opening.
		Manual,         // Debug / admin.
	};

	struct FAlarmConfig
	{
		float SuspicionThreshold = 100.f;
		float SuspicionDecayPerSecond = 2.f;
		float DispatchDelaySeconds = 20.f;          // Normal response delay.
		float VaultDispatchDelaySeconds = 10.f;     // Faster: vault sensors call police directly.
	};

	class FAlarmModel
	{
	public:
		FAlarmConfig Config;

		bool IsRaised() const { return bRaised; }
		bool IsDispatched() const { return bDispatched; }
		EAlarmReason Reason() const { return RaisedReason; }
		float Suspicion() const { return SuspicionValue; }
		float TimeUntilDispatch() const { return bRaised && !bDispatched ? DispatchTimer : 0.f; }

		// Returns true if this call raised the alarm.
		bool AddSuspicion(float Amount)
		{
			if (bRaised || Amount <= 0.f) { return false; }
			SuspicionValue = Clamp(SuspicionValue + Amount, 0.f, Config.SuspicionThreshold);
			if (SuspicionValue >= Config.SuspicionThreshold)
			{
				return Raise(EAlarmReason::Suspicion);
			}
			return false;
		}

		// Returns true if this call raised the alarm. Later reasons never override the first one,
		// except that a vault opening can shorten an already-running dispatch timer.
		bool Raise(EAlarmReason Why)
		{
			const float Delay = (Why == EAlarmReason::VaultOpened) ? Config.VaultDispatchDelaySeconds : Config.DispatchDelaySeconds;
			if (bRaised)
			{
				if (!bDispatched && Delay < DispatchTimer) { DispatchTimer = Delay; }
				return false;
			}
			bRaised = true;
			RaisedReason = Why;
			SuspicionValue = Config.SuspicionThreshold;
			DispatchTimer = Delay;
			return true;
		}

		void OnVaultOpened() { Raise(EAlarmReason::VaultOpened); }

		// Returns true on the tick police get dispatched.
		bool Tick(float Dt)
		{
			if (!bRaised)
			{
				SuspicionValue = Clamp(SuspicionValue - Config.SuspicionDecayPerSecond * Dt, 0.f, Config.SuspicionThreshold);
				return false;
			}
			if (bDispatched) { return false; }
			DispatchTimer -= Dt;
			if (DispatchTimer <= 0.f)
			{
				DispatchTimer = 0.f;
				bDispatched = true;
				return true;
			}
			return false;
		}

	private:
		bool bRaised = false;
		bool bDispatched = false;
		EAlarmReason RaisedReason = EAlarmReason::None;
		float SuspicionValue = 0.f;
		float DispatchTimer = 0.f;
	};
}
