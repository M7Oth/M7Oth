// HEIST RESPONSE - Core gameplay rules (engine-independent).
//
// Everything under Source/HeistResponse/Rules/ is plain C++17 with no Unreal
// includes. It is compiled into the game module AND into the standalone test
// runner under Tests/CoreRules, so the authoritative rules (loot ledger, alarm,
// lockpicking, negotiation, match resolution) are unit-tested outside the editor.
// Unreal-side classes own an instance of these models on the server only.
#pragma once

#include <cstdint>

namespace HeistRules
{
	using PlayerId = int32_t;   // Server-side stable id (PlayerState->GetPlayerId()).
	using EntityId = int32_t;   // Generic id for vehicles, bags, hostages.

	constexpr PlayerId InvalidPlayer = -1;
	constexpr EntityId InvalidEntity = -1;

	enum class ETeam : uint8_t
	{
		None = 0,
		Police = 1,
		Robbers = 2,
	};

	// Small deterministic RNG (xorshift32). Used by the lockpick model so the
	// server can regenerate the same lock from a seed for replays/tests.
	struct FRng
	{
		uint32_t State;
		explicit FRng(uint32_t Seed) : State(Seed ? Seed : 0x9E3779B9u) {}

		uint32_t Next()
		{
			uint32_t X = State;
			X ^= X << 13;
			X ^= X >> 17;
			X ^= X << 5;
			State = X;
			return X;
		}

		// Uniform float in [Min, Max).
		float Range(float Min, float Max)
		{
			const float Unit = static_cast<float>(Next() & 0x00FFFFFFu) / static_cast<float>(0x01000000u);
			return Min + (Max - Min) * Unit;
		}
	};

	inline float Clamp(float V, float Lo, float Hi) { return V < Lo ? Lo : (V > Hi ? Hi : V); }
	inline float Abs(float V) { return V < 0.f ? -V : V; }
}
