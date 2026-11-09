#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"

class AHRPlayerController;
class AHRHUD;
class AHRCharacter;
class AHRGameState;
class AHRPlayerState;

/** Root of the in-match UI: HUD layer + every in-match panel, each gated by a visibility rule. */
class HEISTRESPONSE_API SHRGameHUD : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SHRGameHUD) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AHRPlayerController>, PlayerController)
		SLATE_ARGUMENT(TWeakObjectPtr<AHRHUD>, HUD)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

private:
	AHRCharacter* GetCharacter() const;
	AHRGameState* GetGS() const;
	AHRPlayerState* GetPS() const;
	FText KeyName(FName Slot) const;

	EVisibility HUDLayerVisibility() const;
	FText PhaseText() const;
	FText ClockText() const;
	FSlateColor ClockColor() const;
	FText ObjectiveText() const;
	EVisibility AlarmVisibility() const;
	FText AlarmText() const;
	FText LootText() const;
	TOptional<float> LootPercent() const;
	EVisibility SuspicionVisibility() const;
	TOptional<float> SuspicionPercent() const;
	FText HostageText() const;
	FText TruceText() const;
	EVisibility TruceVisibility() const;
	FText PromptText() const;
	FSlateColor PromptColor() const;
	EVisibility PromptVisibility() const;
	TOptional<float> InteractProgress() const;
	EVisibility InteractProgressVisibility() const;
	TOptional<float> HealthPercent() const;
	FSlateColor HealthColor() const;
	FText AmmoText() const;
	FText InventoryText() const;
	EVisibility CrosshairVisibility() const;
	EVisibility DownedVisibility() const;
	FText DownedText() const;
	EVisibility ArrestedVisibility() const;
	EVisibility SpectatorVisibility() const;
	FText SpectatorText() const;
	EVisibility DispatchVisibility() const;
	FText CameraHintText() const;

	TSharedRef<SWidget> BuildNotificationFeed();

	TWeakObjectPtr<AHRPlayerController> PC;
	TWeakObjectPtr<AHRHUD> HUD;
};
