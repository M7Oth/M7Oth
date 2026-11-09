// Authoritative loot ledger. The ONLY place that decides who holds which money bag.
// Bag actors in the world are visual mirrors; they ask the ledger before changing state.
// Guarantees (unit-tested):
//  * A bag has exactly one state and at most one holder at any time.
//  * Total value is conserved: Unclaimed + Carried + Dropped + InVehicle + Secured + Recovered == Total.
//  * A player can never carry more than MaxBagsPerPlayer.
//  * Secured and Recovered are terminal (no duplication through re-securing).
#pragma once

#include "HeistRulesCommon.h"
#include <vector>

namespace HeistRules
{
	enum class ELootState : uint8_t
	{
		InVault,     // Still in the vault / loot pile, not yet bagged.
		Carried,     // On a player's back. Holder = PlayerId.
		Dropped,     // On the ground, anyone eligible can pick up.
		InVehicle,   // Stored in a vehicle trunk. Holder = vehicle EntityId.
		Secured,     // Extracted by robbers. Terminal.
		Recovered,   // Returned by police. Terminal.
	};

	enum class ELootResult : uint8_t
	{
		Ok,
		NoSuchBag,
		InvalidTransition,
		CarryLimitReached,
		NotHolder,
		WrongTeam,
	};

	struct FLootBag
	{
		EntityId Id = InvalidEntity;
		int32_t Value = 0;
		ELootState State = ELootState::InVault;
		int32_t Holder = InvalidPlayer; // PlayerId when Carried, vehicle id when InVehicle.
	};

	struct FLootTotals
	{
		int64_t Total = 0;
		int64_t InVault = 0;
		int64_t Carried = 0;
		int64_t Dropped = 0;
		int64_t InVehicle = 0;
		int64_t Secured = 0;
		int64_t Recovered = 0;

		// Value that robbers could still, in principle, extract.
		int64_t StillInPlay() const { return InVault + Carried + Dropped + InVehicle; }
	};

	class FLootLedger
	{
	public:
		int32_t MaxBagsPerPlayer = 1;

		EntityId AddBag(int32_t Value)
		{
			FLootBag Bag;
			Bag.Id = static_cast<EntityId>(Bags.size());
			Bag.Value = Value < 0 ? 0 : Value;
			Bags.push_back(Bag);
			return Bag.Id;
		}

		const FLootBag* Find(EntityId Id) const
		{
			return (Id >= 0 && Id < static_cast<EntityId>(Bags.size())) ? &Bags[static_cast<size_t>(Id)] : nullptr;
		}

		int32_t CountCarriedBy(PlayerId Player) const
		{
			int32_t N = 0;
			for (const FLootBag& B : Bags)
			{
				if (B.State == ELootState::Carried && B.Holder == Player) { ++N; }
			}
			return N;
		}

		// Robber picks up from vault/ground/trunk, police can pick up dropped bags to recover them.
		ELootResult PickUp(EntityId Id, PlayerId Player, ETeam Team)
		{
			FLootBag* Bag = Mutable(Id);
			if (!Bag) { return ELootResult::NoSuchBag; }
			if (Team == ETeam::Police)
			{
				if (Bag->State != ELootState::Dropped && Bag->State != ELootState::InVehicle) { return ELootResult::InvalidTransition; }
				Bag->State = ELootState::Recovered;
				Bag->Holder = InvalidPlayer;
				return ELootResult::Ok;
			}
			if (Team != ETeam::Robbers) { return ELootResult::WrongTeam; }
			if (Bag->State != ELootState::InVault && Bag->State != ELootState::Dropped && Bag->State != ELootState::InVehicle)
			{
				return ELootResult::InvalidTransition;
			}
			if (CountCarriedBy(Player) >= MaxBagsPerPlayer) { return ELootResult::CarryLimitReached; }
			Bag->State = ELootState::Carried;
			Bag->Holder = Player;
			return ELootResult::Ok;
		}

		ELootResult Drop(EntityId Id, PlayerId Player)
		{
			FLootBag* Bag = Mutable(Id);
			if (!Bag) { return ELootResult::NoSuchBag; }
			if (Bag->State != ELootState::Carried) { return ELootResult::InvalidTransition; }
			if (Bag->Holder != Player) { return ELootResult::NotHolder; }
			Bag->State = ELootState::Dropped;
			Bag->Holder = InvalidPlayer;
			return ELootResult::Ok;
		}

		// Direct hand-off between two robbers (both must be validated as nearby by the caller).
		ELootResult Transfer(EntityId Id, PlayerId From, PlayerId To)
		{
			FLootBag* Bag = Mutable(Id);
			if (!Bag) { return ELootResult::NoSuchBag; }
			if (Bag->State != ELootState::Carried) { return ELootResult::InvalidTransition; }
			if (Bag->Holder != From) { return ELootResult::NotHolder; }
			if (From == To) { return ELootResult::InvalidTransition; }
			if (CountCarriedBy(To) >= MaxBagsPerPlayer) { return ELootResult::CarryLimitReached; }
			Bag->Holder = To;
			return ELootResult::Ok;
		}

		ELootResult StoreInVehicle(EntityId Id, PlayerId Player, EntityId Vehicle)
		{
			FLootBag* Bag = Mutable(Id);
			if (!Bag) { return ELootResult::NoSuchBag; }
			if (Bag->State != ELootState::Carried) { return ELootResult::InvalidTransition; }
			if (Bag->Holder != Player) { return ELootResult::NotHolder; }
			Bag->State = ELootState::InVehicle;
			Bag->Holder = Vehicle;
			return ELootResult::Ok;
		}

		// Robber carrying the bag reached an extraction zone.
		ELootResult SecureCarried(EntityId Id, PlayerId Player)
		{
			FLootBag* Bag = Mutable(Id);
			if (!Bag) { return ELootResult::NoSuchBag; }
			if (Bag->State != ELootState::Carried) { return ELootResult::InvalidTransition; }
			if (Bag->Holder != Player) { return ELootResult::NotHolder; }
			Bag->State = ELootState::Secured;
			Bag->Holder = InvalidPlayer;
			return ELootResult::Ok;
		}

		// A vehicle reached an extraction zone: every bag in its trunk is secured.
		int32_t SecureVehicle(EntityId Vehicle)
		{
			int32_t N = 0;
			for (FLootBag& B : Bags)
			{
				if (B.State == ELootState::InVehicle && B.Holder == Vehicle)
				{
					B.State = ELootState::Secured;
					B.Holder = InvalidPlayer;
					++N;
				}
			}
			return N;
		}

		// Arrested / downed / disconnected robber: carried bags fall to the ground.
		int32_t DropAllCarriedBy(PlayerId Player)
		{
			int32_t N = 0;
			for (FLootBag& B : Bags)
			{
				if (B.State == ELootState::Carried && B.Holder == Player)
				{
					B.State = ELootState::Dropped;
					B.Holder = InvalidPlayer;
					++N;
				}
			}
			return N;
		}

		// Vehicle destroyed: trunk contents spill as dropped bags.
		int32_t SpillVehicle(EntityId Vehicle)
		{
			int32_t N = 0;
			for (FLootBag& B : Bags)
			{
				if (B.State == ELootState::InVehicle && B.Holder == Vehicle)
				{
					B.State = ELootState::Dropped;
					B.Holder = InvalidPlayer;
					++N;
				}
			}
			return N;
		}

		FLootTotals Totals() const
		{
			FLootTotals T;
			for (const FLootBag& B : Bags)
			{
				T.Total += B.Value;
				switch (B.State)
				{
				case ELootState::InVault:   T.InVault += B.Value; break;
				case ELootState::Carried:   T.Carried += B.Value; break;
				case ELootState::Dropped:   T.Dropped += B.Value; break;
				case ELootState::InVehicle: T.InVehicle += B.Value; break;
				case ELootState::Secured:   T.Secured += B.Value; break;
				case ELootState::Recovered: T.Recovered += B.Value; break;
				}
			}
			return T;
		}

		bool CheckInvariants() const
		{
			const FLootTotals T = Totals();
			if (T.InVault + T.Carried + T.Dropped + T.InVehicle + T.Secured + T.Recovered != T.Total) { return false; }
			for (const FLootBag& B : Bags)
			{
				const bool bNeedsHolder = (B.State == ELootState::Carried || B.State == ELootState::InVehicle);
				if (bNeedsHolder != (B.Holder != InvalidPlayer)) { return false; }
				if (B.State == ELootState::Carried && CountCarriedBy(B.Holder) > MaxBagsPerPlayer) { return false; }
			}
			return true;
		}

		size_t Num() const { return Bags.size(); }

	private:
		FLootBag* Mutable(EntityId Id)
		{
			return (Id >= 0 && Id < static_cast<EntityId>(Bags.size())) ? &Bags[static_cast<size_t>(Id)] : nullptr;
		}

		std::vector<FLootBag> Bags;
	};
}
