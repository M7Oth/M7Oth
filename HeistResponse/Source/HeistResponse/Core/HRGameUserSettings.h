#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameUserSettings.h"
#include "InputCoreTypes.h"
#include "Core/HRTypes.h"
#include "HRGameUserSettings.generated.h"

/**
 * Persistent per-user settings (GameUserSettings.ini). Graphics come from the base class;
 * this adds camera, controls, audio, language and key bindings.
 */
UCLASS(config = GameUserSettings, configdonotcheckdefaults)
class HEISTRESPONSE_API UHRGameUserSettings : public UGameUserSettings
{
	GENERATED_BODY()

public:
	UHRGameUserSettings();

	static UHRGameUserSettings* Get();

	// Camera ----------------------------------------------------------------
	UPROPERTY(config, BlueprintReadWrite, Category = "Camera")
	EHRCameraMode PreferredCameraMode = EHRCameraMode::ThirdPerson;

	UPROPERTY(config, BlueprintReadWrite, Category = "Camera")
	bool bRightShoulder = true;

	/** Third-person boom length in cm. Clamped to [150, 400]. */
	UPROPERTY(config, BlueprintReadWrite, Category = "Camera")
	float ThirdPersonDistance = 260.f;

	UPROPERTY(config, BlueprintReadWrite, Category = "Camera")
	float ThirdPersonFOV = 80.f;

	UPROPERTY(config, BlueprintReadWrite, Category = "Camera")
	float FirstPersonFOV = 90.f;

	UPROPERTY(config, BlueprintReadWrite, Category = "Camera")
	bool bCameraShake = true;

	// Controls --------------------------------------------------------------
	UPROPERTY(config, BlueprintReadWrite, Category = "Controls")
	float MouseSensitivity = 1.f;

	UPROPERTY(config, BlueprintReadWrite, Category = "Controls")
	float AimSensitivityMultiplier = 0.7f;

	UPROPERTY(config, BlueprintReadWrite, Category = "Controls")
	bool bInvertY = false;

	UPROPERTY(config, BlueprintReadWrite, Category = "Controls")
	bool bToggleAim = false;

	/** Action name -> key overrides. Empty = default binding from UHRInputConfig. */
	UPROPERTY(config)
	TMap<FName, FKey> KeyOverrides;

	// Audio -----------------------------------------------------------------
	UPROPERTY(config, BlueprintReadWrite, Category = "Audio")
	float MasterVolume = 1.f;

	UPROPERTY(config, BlueprintReadWrite, Category = "Audio")
	float EffectsVolume = 1.f;

	UPROPERTY(config, BlueprintReadWrite, Category = "Audio")
	float VoiceVolume = 1.f;

	// Interface -------------------------------------------------------------
	UPROPERTY(config, BlueprintReadWrite, Category = "Interface")
	FString Language = TEXT("ar");

	UPROPERTY(config, BlueprintReadWrite, Category = "Interface")
	float HUDScale = 1.f;

	UPROPERTY(config, BlueprintReadWrite, Category = "Interface")
	bool bColorblindTeamColors = false;

	UPROPERTY(config)
	FString PlayerDisplayName;

	virtual void ApplySettings(bool bCheckForCommandLineOverrides) override;
	virtual void SetToDefaults() override;

	/** Broadcast after ApplySettings so live systems (camera, input, HUD) can refresh. */
	DECLARE_MULTICAST_DELEGATE(FOnHRSettingsApplied);
	FOnHRSettingsApplied OnSettingsApplied;
};
