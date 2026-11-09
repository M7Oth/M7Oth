#include "Core/HRGameUserSettings.h"
#include "Core/HRLocalization.h"
#include "Engine/Engine.h"

UHRGameUserSettings::UHRGameUserSettings()
{
}

UHRGameUserSettings* UHRGameUserSettings::Get()
{
	return GEngine ? Cast<UHRGameUserSettings>(GEngine->GetGameUserSettings()) : nullptr;
}

void UHRGameUserSettings::ApplySettings(bool bCheckForCommandLineOverrides)
{
	ThirdPersonDistance = FMath::Clamp(ThirdPersonDistance, 150.f, 400.f);
	ThirdPersonFOV = FMath::Clamp(ThirdPersonFOV, 70.f, 100.f);
	FirstPersonFOV = FMath::Clamp(FirstPersonFOV, 75.f, 110.f);
	MouseSensitivity = FMath::Clamp(MouseSensitivity, 0.1f, 5.f);
	AimSensitivityMultiplier = FMath::Clamp(AimSensitivityMultiplier, 0.2f, 1.5f);
	HUDScale = FMath::Clamp(HUDScale, 0.75f, 1.5f);
	MasterVolume = FMath::Clamp(MasterVolume, 0.f, 1.f);
	EffectsVolume = FMath::Clamp(EffectsVolume, 0.f, 1.f);
	VoiceVolume = FMath::Clamp(VoiceVolume, 0.f, 1.f);

	FHRLocalization::Get().SetLanguage(Language);

	Super::ApplySettings(bCheckForCommandLineOverrides);
	OnSettingsApplied.Broadcast();
}

void UHRGameUserSettings::SetToDefaults()
{
	Super::SetToDefaults();
	PreferredCameraMode = EHRCameraMode::ThirdPerson;
	bRightShoulder = true;
	ThirdPersonDistance = 260.f;
	ThirdPersonFOV = 80.f;
	FirstPersonFOV = 90.f;
	bCameraShake = true;
	MouseSensitivity = 1.f;
	AimSensitivityMultiplier = 0.7f;
	bInvertY = false;
	bToggleAim = false;
	KeyOverrides.Reset();
	MasterVolume = EffectsVolume = VoiceVolume = 1.f;
	Language = TEXT("ar");
	HUDScale = 1.f;
	bColorblindTeamColors = false;
}
