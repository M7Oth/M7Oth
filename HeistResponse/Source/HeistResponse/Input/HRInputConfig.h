#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "InputCoreTypes.h"
#include "HRInputConfig.generated.h"

class UInputAction;
class UInputMappingContext;

UENUM()
enum class EHRAxisMod : uint8
{
	None,
	Negate,
	Swizzle,         // X -> Y (for forward/back on a 2D action)
	SwizzleNegate,
};

/** One rebindable key slot. Several slots can drive one action (WASD -> Move). */
USTRUCT()
struct FHRBindingSlot
{
	GENERATED_BODY()

	UPROPERTY() FName Id;
	UPROPERTY() FName LocKey;       // HRStrings.csv key shown in the key-binding menu.
	UPROPERTY() FKey DefaultKey;
	UPROPERTY() TObjectPtr<UInputAction> Action = nullptr;
	UPROPERTY() TObjectPtr<UInputMappingContext> Context = nullptr;
	UPROPERTY() EHRAxisMod Mod = EHRAxisMod::None;
	UPROPERTY() bool bRebindable = true;
};

/**
 * All gameplay input actions and mapping contexts, created at runtime in C++ so the project
 * needs no hand-authored input assets. Key overrides come from UHRGameUserSettings::KeyOverrides.
 */
UCLASS(Transient)
class HEISTRESPONSE_API UHRInputConfig : public UObject
{
	GENERATED_BODY()

public:
	static UHRInputConfig* Create(UObject* Outer);

	/** Rebuilds mapping contexts from defaults + user overrides. */
	void RebuildMappings(const TMap<FName, FKey>& Overrides);

	FKey GetBoundKey(FName SlotId, const TMap<FName, FKey>& Overrides) const;

	// Contexts
	UPROPERTY() TObjectPtr<UInputMappingContext> OnFootContext;
	UPROPERTY() TObjectPtr<UInputMappingContext> VehicleContext;
	UPROPERTY() TObjectPtr<UInputMappingContext> GlobalContext;   // menu, scoreboard, negotiation, ping

	// On foot
	UPROPERTY() TObjectPtr<UInputAction> Move;
	UPROPERTY() TObjectPtr<UInputAction> Look;
	UPROPERTY() TObjectPtr<UInputAction> Jump;
	UPROPERTY() TObjectPtr<UInputAction> Sprint;
	UPROPERTY() TObjectPtr<UInputAction> Crouch;
	UPROPERTY() TObjectPtr<UInputAction> Interact;
	UPROPERTY() TObjectPtr<UInputAction> Fire;
	UPROPERTY() TObjectPtr<UInputAction> Aim;
	UPROPERTY() TObjectPtr<UInputAction> Reload;
	UPROPERTY() TObjectPtr<UInputAction> ToggleCamera;
	UPROPERTY() TObjectPtr<UInputAction> SwapShoulder;
	UPROPERTY() TObjectPtr<UInputAction> Surrender;
	UPROPERTY() TObjectPtr<UInputAction> ToggleMask;
	UPROPERTY() TObjectPtr<UInputAction> DropBag;
	UPROPERTY() TObjectPtr<UInputAction> Shout;
	UPROPERTY() TObjectPtr<UInputAction> Trunk;
	UPROPERTY() TObjectPtr<UInputAction> Gadget;

	// Vehicle
	UPROPERTY() TObjectPtr<UInputAction> Throttle;
	UPROPERTY() TObjectPtr<UInputAction> Steer;
	UPROPERTY() TObjectPtr<UInputAction> Handbrake;
	UPROPERTY() TObjectPtr<UInputAction> VehicleExit;
	UPROPERTY() TObjectPtr<UInputAction> Siren;
	UPROPERTY() TObjectPtr<UInputAction> VehicleLook;
	UPROPERTY() TObjectPtr<UInputAction> VehicleCamera;

	// Global
	UPROPERTY() TObjectPtr<UInputAction> Menu;
	UPROPERTY() TObjectPtr<UInputAction> Scoreboard;
	UPROPERTY() TObjectPtr<UInputAction> Negotiate;
	UPROPERTY() TObjectPtr<UInputAction> Ping;
	UPROPERTY() TObjectPtr<UInputAction> SpectateNext;
	UPROPERTY() TObjectPtr<UInputAction> SpectatePrev;

	UPROPERTY() TArray<FHRBindingSlot> Slots;

private:
	UInputAction* MakeAction(FName Name, bool bAxis2D, bool bAxis1D = false);
	void AddSlot(FName Id, FName LocKey, FKey Key, UInputAction* Action, UInputMappingContext* Context, EHRAxisMod Mod = EHRAxisMod::None, bool bRebindable = true);
};
