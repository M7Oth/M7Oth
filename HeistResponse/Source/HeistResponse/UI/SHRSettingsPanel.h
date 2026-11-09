#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "InputCoreTypes.h"
#include "UObject/StrongObjectPtr.h"

class SVerticalBox;
class UHRInputConfig;

/**
 * Settings: Gameplay (camera perspective, shoulder, distance, FOV), Controls (sensitivity, invert,
 * toggle-aim, key bindings with live rebinding), Graphics (quality preset, resolution scale,
 * window mode, vsync, frame cap), Audio (master/effects/voice) and Interface (language, HUD scale,
 * colour-blind team colours). Every control writes to UHRGameUserSettings; Apply saves.
 */
class HEISTRESPONSE_API SHRSettingsPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SHRSettingsPanel) {}
		SLATE_EVENT(FSimpleDelegate, OnClose)
		SLATE_EVENT(FSimpleDelegate, OnApplied)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual bool SupportsKeyboardFocus() const override { return true; }
	virtual FReply OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent) override;
	virtual FReply OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent) override;

private:
	enum class ETab : uint8 { Gameplay, Controls, Graphics, Audio, Interface };

	void SelectTab(ETab Tab);
	void BuildTab();
	TSharedRef<SWidget> Row(const FText& Label, const TSharedRef<SWidget>& Control);
	TSharedRef<SWidget> Slider(TFunction<float()> Get, TFunction<void(float)> Set, float Min, float Max, TFunction<FText(float)> Format);
	TSharedRef<SWidget> Toggle(TFunction<bool()> Get, TFunction<void(bool)> Set);
	TSharedRef<SWidget> Choice(TArray<FText> Options, TFunction<int32()> Get, TFunction<void(int32)> Set);
	void CaptureKey(const FKey& Key);
	void Apply();

	TSharedPtr<SVerticalBox> Content;
	ETab Current = ETab::Gameplay;
	FName RebindingSlot;
	FSimpleDelegate OnClose;
	FSimpleDelegate OnApplied;
	TStrongObjectPtr<UHRInputConfig> KeyCatalog;
};
