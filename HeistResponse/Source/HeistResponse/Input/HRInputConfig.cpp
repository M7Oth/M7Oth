#include "Input/HRInputConfig.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"

UInputAction* UHRInputConfig::MakeAction(FName Name, bool bAxis2D, bool bAxis1D)
{
	UInputAction* A = NewObject<UInputAction>(this, Name);
	A->ValueType = bAxis2D ? EInputActionValueType::Axis2D : (bAxis1D ? EInputActionValueType::Axis1D : EInputActionValueType::Boolean);
	return A;
}

void UHRInputConfig::AddSlot(FName Id, FName LocKey, FKey Key, UInputAction* Action, UInputMappingContext* Context, EHRAxisMod Mod, bool bRebindable)
{
	FHRBindingSlot S;
	S.Id = Id;
	S.LocKey = LocKey;
	S.DefaultKey = Key;
	S.Action = Action;
	S.Context = Context;
	S.Mod = Mod;
	S.bRebindable = bRebindable;
	Slots.Add(S);
}

UHRInputConfig* UHRInputConfig::Create(UObject* Outer)
{
	UHRInputConfig* C = NewObject<UHRInputConfig>(Outer);

	C->OnFootContext = NewObject<UInputMappingContext>(C, TEXT("IMC_OnFoot"));
	C->VehicleContext = NewObject<UInputMappingContext>(C, TEXT("IMC_Vehicle"));
	C->GlobalContext = NewObject<UInputMappingContext>(C, TEXT("IMC_Global"));

	C->Move = C->MakeAction(TEXT("IA_Move"), true);
	C->Look = C->MakeAction(TEXT("IA_Look"), true);
	C->Jump = C->MakeAction(TEXT("IA_Jump"), false);
	C->Sprint = C->MakeAction(TEXT("IA_Sprint"), false);
	C->Crouch = C->MakeAction(TEXT("IA_Crouch"), false);
	C->Interact = C->MakeAction(TEXT("IA_Interact"), false);
	C->Fire = C->MakeAction(TEXT("IA_Fire"), false);
	C->Aim = C->MakeAction(TEXT("IA_Aim"), false);
	C->Reload = C->MakeAction(TEXT("IA_Reload"), false);
	C->ToggleCamera = C->MakeAction(TEXT("IA_ToggleCamera"), false);
	C->SwapShoulder = C->MakeAction(TEXT("IA_SwapShoulder"), false);
	C->Surrender = C->MakeAction(TEXT("IA_Surrender"), false);
	C->ToggleMask = C->MakeAction(TEXT("IA_ToggleMask"), false);
	C->DropBag = C->MakeAction(TEXT("IA_DropBag"), false);
	C->Shout = C->MakeAction(TEXT("IA_Shout"), false);
	C->Trunk = C->MakeAction(TEXT("IA_Trunk"), false);
	C->Gadget = C->MakeAction(TEXT("IA_Gadget"), false);

	C->Throttle = C->MakeAction(TEXT("IA_Throttle"), false, true);
	C->Steer = C->MakeAction(TEXT("IA_Steer"), false, true);
	C->Handbrake = C->MakeAction(TEXT("IA_Handbrake"), false);
	C->VehicleExit = C->MakeAction(TEXT("IA_VehicleExit"), false);
	C->Siren = C->MakeAction(TEXT("IA_Siren"), false);
	C->VehicleLook = C->MakeAction(TEXT("IA_VehicleLook"), true);
	C->VehicleCamera = C->MakeAction(TEXT("IA_VehicleCamera"), false);

	C->Menu = C->MakeAction(TEXT("IA_Menu"), false);
	C->Scoreboard = C->MakeAction(TEXT("IA_Scoreboard"), false);
	C->Negotiate = C->MakeAction(TEXT("IA_Negotiate"), false);
	C->Ping = C->MakeAction(TEXT("IA_Ping"), false);
	C->SpectateNext = C->MakeAction(TEXT("IA_SpectateNext"), false);
	C->SpectatePrev = C->MakeAction(TEXT("IA_SpectatePrev"), false);

	UInputMappingContext* F = C->OnFootContext;
	UInputMappingContext* V = C->VehicleContext;
	UInputMappingContext* G = C->GlobalContext;

	C->AddSlot(TEXT("MoveForward"), TEXT("Key.MoveForward"), EKeys::W, C->Move, F, EHRAxisMod::Swizzle);
	C->AddSlot(TEXT("MoveBack"), TEXT("Key.MoveBack"), EKeys::S, C->Move, F, EHRAxisMod::SwizzleNegate);
	C->AddSlot(TEXT("MoveLeft"), TEXT("Key.MoveLeft"), EKeys::A, C->Move, F, EHRAxisMod::Negate);
	C->AddSlot(TEXT("MoveRight"), TEXT("Key.MoveRight"), EKeys::D, C->Move, F);
	C->AddSlot(TEXT("Look"), TEXT("Key.Look"), EKeys::Mouse2D, C->Look, F, EHRAxisMod::None, false);
	C->AddSlot(TEXT("Jump"), TEXT("Key.Jump"), EKeys::SpaceBar, C->Jump, F);
	C->AddSlot(TEXT("Sprint"), TEXT("Key.Sprint"), EKeys::LeftShift, C->Sprint, F);
	C->AddSlot(TEXT("Crouch"), TEXT("Key.Crouch"), EKeys::LeftControl, C->Crouch, F);
	C->AddSlot(TEXT("Interact"), TEXT("Key.Interact"), EKeys::E, C->Interact, F);
	C->AddSlot(TEXT("Fire"), TEXT("Key.Fire"), EKeys::LeftMouseButton, C->Fire, F);
	C->AddSlot(TEXT("Aim"), TEXT("Key.Aim"), EKeys::RightMouseButton, C->Aim, F);
	C->AddSlot(TEXT("Reload"), TEXT("Key.Reload"), EKeys::R, C->Reload, F);
	C->AddSlot(TEXT("ToggleCamera"), TEXT("Key.ToggleCamera"), EKeys::V, C->ToggleCamera, F);
	C->AddSlot(TEXT("SwapShoulder"), TEXT("Key.SwapShoulder"), EKeys::Q, C->SwapShoulder, F);
	C->AddSlot(TEXT("Surrender"), TEXT("Key.Surrender"), EKeys::H, C->Surrender, F);
	C->AddSlot(TEXT("ToggleMask"), TEXT("Key.ToggleMask"), EKeys::X, C->ToggleMask, F);
	C->AddSlot(TEXT("DropBag"), TEXT("Key.DropBag"), EKeys::G, C->DropBag, F);
	C->AddSlot(TEXT("Shout"), TEXT("Key.Shout"), EKeys::F, C->Shout, F);
	C->AddSlot(TEXT("Trunk"), TEXT("Key.Trunk"), EKeys::T, C->Trunk, F);
	C->AddSlot(TEXT("Gadget"), TEXT("Key.Gadget"), EKeys::Z, C->Gadget, F);

	C->AddSlot(TEXT("Throttle"), TEXT("Key.Throttle"), EKeys::W, C->Throttle, V);
	C->AddSlot(TEXT("Brake"), TEXT("Key.Brake"), EKeys::S, C->Throttle, V, EHRAxisMod::Negate);
	C->AddSlot(TEXT("SteerLeft"), TEXT("Key.SteerLeft"), EKeys::A, C->Steer, V, EHRAxisMod::Negate);
	C->AddSlot(TEXT("SteerRight"), TEXT("Key.SteerRight"), EKeys::D, C->Steer, V);
	C->AddSlot(TEXT("Handbrake"), TEXT("Key.Handbrake"), EKeys::SpaceBar, C->Handbrake, V);
	C->AddSlot(TEXT("VehicleExit"), TEXT("Key.VehicleExit"), EKeys::E, C->VehicleExit, V);
	C->AddSlot(TEXT("Siren"), TEXT("Key.Siren"), EKeys::Q, C->Siren, V);
	C->AddSlot(TEXT("VehicleLook"), TEXT("Key.Look"), EKeys::Mouse2D, C->VehicleLook, V, EHRAxisMod::None, false);
	C->AddSlot(TEXT("VehicleCamera"), TEXT("Key.ToggleCamera"), EKeys::V, C->VehicleCamera, V);

	C->AddSlot(TEXT("Menu"), TEXT("Key.Menu"), EKeys::Escape, C->Menu, G, EHRAxisMod::None, false);
	C->AddSlot(TEXT("Scoreboard"), TEXT("Key.Scoreboard"), EKeys::Tab, C->Scoreboard, G);
	C->AddSlot(TEXT("Negotiate"), TEXT("Key.Negotiate"), EKeys::N, C->Negotiate, G);
	C->AddSlot(TEXT("Ping"), TEXT("Key.Ping"), EKeys::MiddleMouseButton, C->Ping, G);
	C->AddSlot(TEXT("SpectateNext"), TEXT("Key.SpectateNext"), EKeys::LeftMouseButton, C->SpectateNext, G, EHRAxisMod::None, false);
	C->AddSlot(TEXT("SpectatePrev"), TEXT("Key.SpectatePrev"), EKeys::RightMouseButton, C->SpectatePrev, G, EHRAxisMod::None, false);

	C->RebuildMappings(TMap<FName, FKey>());
	return C;
}

FKey UHRInputConfig::GetBoundKey(FName SlotId, const TMap<FName, FKey>& Overrides) const
{
	if (const FKey* K = Overrides.Find(SlotId)) { return *K; }
	for (const FHRBindingSlot& S : Slots)
	{
		if (S.Id == SlotId) { return S.DefaultKey; }
	}
	return EKeys::Invalid;
}

void UHRInputConfig::RebuildMappings(const TMap<FName, FKey>& Overrides)
{
	OnFootContext->UnmapAll();
	VehicleContext->UnmapAll();
	GlobalContext->UnmapAll();

	for (const FHRBindingSlot& S : Slots)
	{
		FKey Key = S.DefaultKey;
		if (S.bRebindable)
		{
			if (const FKey* Override = Overrides.Find(S.Id))
			{
				if (Override->IsValid()) { Key = *Override; }
			}
		}

		FEnhancedActionKeyMapping& M = S.Context->MapKey(S.Action, Key);
		if (S.Mod == EHRAxisMod::Swizzle || S.Mod == EHRAxisMod::SwizzleNegate)
		{
			UInputModifierSwizzleAxis* Swz = NewObject<UInputModifierSwizzleAxis>(S.Context);
			Swz->Order = EInputAxisSwizzle::YXZ;
			M.Modifiers.Add(Swz);
		}
		if (S.Mod == EHRAxisMod::Negate || S.Mod == EHRAxisMod::SwizzleNegate)
		{
			M.Modifiers.Add(NewObject<UInputModifierNegate>(S.Context));
		}
	}
}
