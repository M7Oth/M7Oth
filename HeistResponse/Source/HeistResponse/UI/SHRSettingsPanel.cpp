#include "UI/SHRSettingsPanel.h"
#include "UI/HRWidgetHelpers.h"
#include "Core/HRGameUserSettings.h"
#include "Core/HRLocalization.h"
#include "Input/HRInputConfig.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/Input/SSlider.h"
#include "Widgets/Input/SCheckBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Framework/Application/SlateApplication.h"
#include "Engine/Engine.h"
#include "UObject/StrongObjectPtr.h"

namespace { UHRGameUserSettings* S() { return UHRGameUserSettings::Get(); } }

void SHRSettingsPanel::Construct(const FArguments& InArgs)
{
	OnClose = InArgs._OnClose;
	OnApplied = InArgs._OnApplied;
	KeyCatalog.Reset(UHRInputConfig::Create(GetTransientPackage()));

	auto TabButton = [this](ETab Tab, FName Key)
	{
		return HRWidgets::Button(FHRLocalization::Get().Text(Key), [this, Tab]() { SelectTab(Tab); },
			FHRUIStyle::Ink(), 150.f);
	};

	ChildSlot
	[
		SNew(SBox).WidthOverride(980.f).HeightOverride(680.f)
		[
			HRWidgets::Panel(
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 12.f)
				[ HRWidgets::Label(HRText("Settings.Title"), 28, FHRUIStyle::Ink(), true) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 12.f)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)[ TabButton(ETab::Gameplay, TEXT("Settings.TabGameplay")) ]
					+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)[ TabButton(ETab::Controls, TEXT("Settings.TabControls")) ]
					+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)[ TabButton(ETab::Graphics, TEXT("Settings.TabGraphics")) ]
					+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)[ TabButton(ETab::Audio, TEXT("Settings.TabAudio")) ]
					+ SHorizontalBox::Slot().AutoWidth()[ TabButton(ETab::Interface, TEXT("Settings.TabInterface")) ]
				]
				+ SVerticalBox::Slot().FillHeight(1.f)
				[ SNew(SScrollBox) + SScrollBox::Slot()[ SAssignNew(Content, SVerticalBox) ] ]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Right).Padding(0.f, 12.f, 0.f, 0.f)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth().Padding(6.f, 0.f)
					[ HRWidgets::Button(HRText("Settings.Defaults"), [this]() { if (S()) { S()->SetToDefaults(); BuildTab(); } }, FHRUIStyle::Muted(), 160.f) ]
					+ SHorizontalBox::Slot().AutoWidth().Padding(6.f, 0.f)
					[ HRWidgets::Button(HRText("Settings.Apply"), [this]() { Apply(); }, FHRUIStyle::Success(), 160.f) ]
					+ SHorizontalBox::Slot().AutoWidth().Padding(6.f, 0.f)
					[ HRWidgets::Button(HRText("Menu.Close"), [this]() { Apply(); OnClose.ExecuteIfBound(); }, FHRUIStyle::Ink(), 160.f) ]
				],
				true)
		]
	];
	BuildTab();
}

void SHRSettingsPanel::Apply()
{
	if (UHRGameUserSettings* Settings = S())
	{
		Settings->ApplySettings(false);
		Settings->SaveSettings();
	}
	OnApplied.ExecuteIfBound();
}

void SHRSettingsPanel::SelectTab(ETab Tab)
{
	Current = Tab;
	RebindingSlot = NAME_None;
	BuildTab();
}

TSharedRef<SWidget> SHRSettingsPanel::Row(const FText& Label, const TSharedRef<SWidget>& Control)
{
	return SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().FillWidth(0.45f).VAlign(VAlign_Center)[ HRWidgets::Label(Label, 16) ]
		+ SHorizontalBox::Slot().FillWidth(0.55f).VAlign(VAlign_Center)[ Control ];
}

TSharedRef<SWidget> SHRSettingsPanel::Slider(TFunction<float()> Get, TFunction<void(float)> Set, float Min, float Max, TFunction<FText(float)> Format)
{
	return SNew(SHorizontalBox)
		+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
		[
			SNew(SSlider)
			.MinValue(Min).MaxValue(Max)
			.Value_Lambda([Get]() { return Get(); })
			.OnValueChanged_Lambda([Set](float V) { Set(V); })
		]
		+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(12.f, 0.f, 0.f, 0.f)
		[
			SNew(SBox).MinDesiredWidth(70.f)
			[ HRWidgets::Label(TAttribute<FText>::CreateLambda([Get, Format]() { return Format(Get()); }), 15, FHRUIStyle::Muted()) ]
		];
}

TSharedRef<SWidget> SHRSettingsPanel::Toggle(TFunction<bool()> Get, TFunction<void(bool)> Set)
{
	return SNew(SCheckBox)
		.IsChecked_Lambda([Get]() { return Get() ? ECheckBoxState::Checked : ECheckBoxState::Unchecked; })
		.OnCheckStateChanged_Lambda([Set](ECheckBoxState State) { Set(State == ECheckBoxState::Checked); });
}

TSharedRef<SWidget> SHRSettingsPanel::Choice(TArray<FText> Options, TFunction<int32()> Get, TFunction<void(int32)> Set)
{
	TSharedRef<SHorizontalBox> Box = SNew(SHorizontalBox);
	for (int32 i = 0; i < Options.Num(); ++i)
	{
		Box->AddSlot().AutoWidth().Padding(0.f, 0.f, 6.f, 0.f)
		[
			SNew(SButton)
			.ButtonStyle(&HRWidgets::ButtonStyle())
			.ContentPadding(FMargin(14.f, 7.f))
			.OnClicked_Lambda([Set, i]() { Set(i); return FReply::Handled(); })
			[
				SNew(STextBlock)
				.Text(Options[i])
				.Font(FHRUIStyle::Font(14, true))
				.ColorAndOpacity_Lambda([Get, i]() { return FSlateColor(Get() == i ? FHRUIStyle::Success() : FHRUIStyle::Muted()); })
			]
		];
	}
	return Box;
}

void SHRSettingsPanel::BuildTab()
{
	if (!Content.IsValid() || !S()) { return; }
	Content->ClearChildren();
	auto Add = [this](const TSharedRef<SWidget>& W) { Content->AddSlot().AutoHeight().Padding(0.f, 6.f)[ W ]; };
	auto Num = [](float V) { return FText::AsNumber(FMath::RoundToInt(V)); };
	auto Pct = [](float V) { return FText::FromString(FString::Printf(TEXT("%d%%"), FMath::RoundToInt(V * 100.f))); };

	switch (Current)
	{
	case ETab::Gameplay:
		Add(Row(HRText("Settings.Perspective"), Choice({ HRText("Camera.ThirdPerson"), HRText("Camera.FirstPerson") },
			[]() { return S()->PreferredCameraMode == EHRCameraMode::FirstPerson ? 1 : 0; },
			[](int32 I) { S()->PreferredCameraMode = I == 1 ? EHRCameraMode::FirstPerson : EHRCameraMode::ThirdPerson; })));
		Add(Row(HRText("Settings.Shoulder"), Choice({ HRText("Settings.Right"), HRText("Settings.Left") },
			[]() { return S()->bRightShoulder ? 0 : 1; }, [](int32 I) { S()->bRightShoulder = I == 0; })));
		Add(Row(HRText("Settings.CameraDistance"), Slider([]() { return S()->ThirdPersonDistance; }, [](float V) { S()->ThirdPersonDistance = V; }, 150.f, 400.f, Num)));
		Add(Row(HRText("Settings.FOVThird"), Slider([]() { return S()->ThirdPersonFOV; }, [](float V) { S()->ThirdPersonFOV = V; }, 70.f, 100.f, Num)));
		Add(Row(HRText("Settings.FOVFirst"), Slider([]() { return S()->FirstPersonFOV; }, [](float V) { S()->FirstPersonFOV = V; }, 75.f, 110.f, Num)));
		Add(Row(HRText("Settings.CameraShake"), Toggle([]() { return S()->bCameraShake; }, [](bool B) { S()->bCameraShake = B; })));
		break;

	case ETab::Controls:
	{
		auto Mul = [](float V) { return FText::FromString(FString::Printf(TEXT("%.2fx"), V)); };
		Add(Row(HRText("Settings.Sensitivity"), Slider([]() { return S()->MouseSensitivity; }, [](float V) { S()->MouseSensitivity = V; }, 0.1f, 5.f, Mul)));
		Add(Row(HRText("Settings.AimSensitivity"), Slider([]() { return S()->AimSensitivityMultiplier; }, [](float V) { S()->AimSensitivityMultiplier = V; }, 0.2f, 1.5f, Mul)));
		Add(Row(HRText("Settings.InvertY"), Toggle([]() { return S()->bInvertY; }, [](bool B) { S()->bInvertY = B; })));
		Add(Row(HRText("Settings.ToggleAim"), Toggle([]() { return S()->bToggleAim; }, [](bool B) { S()->bToggleAim = B; })));
		Add(HRWidgets::Label(HRText("Settings.KeyBindings"), 18, FHRUIStyle::Ink(), true));
		for (const FHRBindingSlot& Slot : KeyCatalog->Slots)
		{
			if (!Slot.bRebindable) { continue; }
			const FName Id = Slot.Id;
			Add(Row(FHRLocalization::Get().Text(Slot.LocKey),
				SNew(SButton)
				.ButtonStyle(&HRWidgets::ButtonStyle())
				.ContentPadding(FMargin(14.f, 7.f))
				.OnClicked_Lambda([this, Id]() { RebindingSlot = Id; FSlateApplication::Get().SetKeyboardFocus(SharedThis(this)); return FReply::Handled(); })
				[
					SNew(STextBlock)
					.Font(FHRUIStyle::Font(14, true))
					.Text_Lambda([this, Id]()
					{
						if (RebindingSlot == Id) { return HRText("Settings.PressKey"); }
						return KeyCatalog->GetBoundKey(Id, S()->KeyOverrides).GetDisplayName();
					})
					.ColorAndOpacity_Lambda([this, Id]() { return FSlateColor(RebindingSlot == Id ? FHRUIStyle::Warning() : FHRUIStyle::Ink()); })
				]));
		}
		break;
	}

	case ETab::Graphics:
		Add(Row(HRText("Settings.Quality"), Choice({ HRText("Settings.Low"), HRText("Settings.Medium"), HRText("Settings.High"), HRText("Settings.Epic") },
			[]() { return FMath::Clamp(S()->GetOverallScalabilityLevel(), 0, 3); }, [](int32 I) { S()->SetOverallScalabilityLevel(I); })));
		Add(Row(HRText("Settings.ResolutionScale"), Slider([]() { return S()->GetResolutionScaleNormalized(); }, [](float V) { S()->SetResolutionScaleNormalized(V); }, 0.f, 1.f, Pct)));
		Add(Row(HRText("Settings.WindowMode"), Choice({ HRText("Settings.Fullscreen"), HRText("Settings.Borderless"), HRText("Settings.Windowed") },
			[]() { return static_cast<int32>(S()->GetFullscreenMode()); }, [](int32 I) { S()->SetFullscreenMode(static_cast<EWindowMode::Type>(I)); })));
		Add(Row(HRText("Settings.VSync"), Toggle([]() { return S()->IsVSyncEnabled(); }, [](bool B) { S()->SetVSyncEnabled(B); })));
		Add(Row(HRText("Settings.FrameCap"), Choice({ FText::FromString(TEXT("60")), FText::FromString(TEXT("120")), FText::FromString(TEXT("144")), HRText("Settings.Unlimited") },
			[]() { const float L = S()->GetFrameRateLimit(); return L <= 0.f ? 3 : (L <= 60.f ? 0 : (L <= 120.f ? 1 : 2)); },
			[](int32 I) { const float V[] = { 60.f, 120.f, 144.f, 0.f }; S()->SetFrameRateLimit(V[FMath::Clamp(I, 0, 3)]); })));
		Add(HRWidgets::Label(HRText("Settings.GraphicsNote"), 13, FHRUIStyle::Muted()));
		break;

	case ETab::Audio:
		Add(Row(HRText("Settings.Master"), Slider([]() { return S()->MasterVolume; }, [](float V) { S()->MasterVolume = V; }, 0.f, 1.f, Pct)));
		Add(Row(HRText("Settings.Effects"), Slider([]() { return S()->EffectsVolume; }, [](float V) { S()->EffectsVolume = V; }, 0.f, 1.f, Pct)));
		Add(Row(HRText("Settings.Voice"), Slider([]() { return S()->VoiceVolume; }, [](float V) { S()->VoiceVolume = V; }, 0.f, 1.f, Pct)));
		break;

	case ETab::Interface:
		Add(Row(HRText("Settings.Language"), Choice({ HRText("Lang.Arabic"), HRText("Lang.English") },
			[]() { return S()->Language == TEXT("en") ? 1 : 0; }, [](int32 I) { S()->Language = I == 1 ? TEXT("en") : TEXT("ar"); })));
		Add(Row(HRText("Settings.HUDScale"), Slider([]() { return S()->HUDScale; }, [](float V) { S()->HUDScale = V; }, 0.75f, 1.5f, Pct)));
		Add(Row(HRText("Settings.Colorblind"), Toggle([]() { return S()->bColorblindTeamColors; }, [](bool B) { S()->bColorblindTeamColors = B; })));
		Add(HRWidgets::Label(HRText("Settings.LanguageNote"), 13, FHRUIStyle::Muted()));
		break;
	}
}

void SHRSettingsPanel::CaptureKey(const FKey& Key)
{
	if (RebindingSlot.IsNone() || !S()) { return; }
	if (Key != EKeys::Escape)
	{
		// Remove the key from any other slot in the same context to avoid silent conflicts.
		const FHRBindingSlot* Target = KeyCatalog->Slots.FindByPredicate([this](const FHRBindingSlot& Sl) { return Sl.Id == RebindingSlot; });
		for (const FHRBindingSlot& Other : KeyCatalog->Slots)
		{
			if (Target && Other.Id != RebindingSlot && Other.Context == Target->Context && KeyCatalog->GetBoundKey(Other.Id, S()->KeyOverrides) == Key)
			{
				S()->KeyOverrides.Add(Other.Id, KeyCatalog->GetBoundKey(RebindingSlot, S()->KeyOverrides)); // swap
			}
		}
		S()->KeyOverrides.Add(RebindingSlot, Key);
	}
	RebindingSlot = NAME_None;
}

FReply SHRSettingsPanel::OnKeyDown(const FGeometry& MyGeometry, const FKeyEvent& InKeyEvent)
{
	if (!RebindingSlot.IsNone()) { CaptureKey(InKeyEvent.GetKey()); return FReply::Handled(); }
	return FReply::Unhandled();
}

FReply SHRSettingsPanel::OnMouseButtonDown(const FGeometry& MyGeometry, const FPointerEvent& MouseEvent)
{
	if (!RebindingSlot.IsNone()) { CaptureKey(MouseEvent.GetEffectingButton()); return FReply::Handled(); }
	return FReply::Unhandled();
}
