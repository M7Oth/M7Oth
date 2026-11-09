#include "UI/SHRGameHUD.h"
#include "UI/HRHUD.h"
#include "UI/HRWidgetHelpers.h"
#include "UI/SHRLockpickWidget.h"
#include "UI/SHRPanels.h"
#include "UI/SHRSettingsPanel.h"
#include "Game/HRPlayerController.h"
#include "Game/HRGameState.h"
#include "Game/HRPlayerState.h"
#include "Character/HRCharacter.h"
#include "Combat/HRHealthComponent.h"
#include "Combat/HRWeaponComponent.h"
#include "Interaction/HRInteractionComponent.h"
#include "Inventory/HRInventoryComponent.h"
#include "CameraSystem/HRCameraRigComponent.h"
#include "Input/HRInputConfig.h"
#include "Core/HRGameUserSettings.h"
#include "Core/HRLocalization.h"

#include "Widgets/SOverlay.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Notifications/SProgressBar.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SSpacer.h"
#include "Widgets/Layout/SDPIScaler.h"

#define HRSLOT_PAD FMargin(28.f, 22.f)

void SHRGameHUD::Construct(const FArguments& InArgs)
{
	PC = InArgs._PlayerController;
	HUD = InArgs._HUD;
	TWeakObjectPtr<AHRPlayerController> WeakPC = PC;
	TWeakObjectPtr<AHRHUD> WeakHUD = HUD;

	ChildSlot
	[
		SNew(SDPIScaler)
		.DPIScale_Lambda([]() { const UHRGameUserSettings* S = UHRGameUserSettings::Get(); return S ? S->HUDScale : 1.f; })
		[
			SNew(SOverlay)
			.FlowDirectionPreference(FHRUIStyle::Flow())

			// ---------------------------------------------------------------- HUD layer
			+ SOverlay::Slot()
			[
				SNew(SOverlay)
				.Visibility(this, &SHRGameHUD::HUDLayerVisibility)

				// Top center: phase, clock, objective, alarm
				+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(HRSLOT_PAD)
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						HRWidgets::Panel(
							SNew(SHorizontalBox)
							+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 14.f, 0.f)
							[ HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::PhaseText), 15, FHRUIStyle::Muted(), true) ]
							+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
							[
								SNew(STextBlock)
								.Text(this, &SHRGameHUD::ClockText)
								.Font(FHRUIStyle::Font(26, true))
								.ColorAndOpacity(this, &SHRGameHUD::ClockColor)
							])
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 8.f, 0.f, 0.f)
					[ HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::ObjectiveText), 16, FHRUIStyle::Ink(), false) ]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 10.f, 0.f, 0.f)
					[
						SNew(SBorder)
						.Visibility(this, &SHRGameHUD::AlarmVisibility)
						.BorderImage(FHRUIStyle::PillBrush())
						.BorderBackgroundColor_Lambda([]() { const float A = 0.65f + 0.35f * FMath::Sin(static_cast<float>(FPlatformTime::Seconds() * 6.0)); return FSlateColor(FHRUIStyle::Alarm().CopyWithNewOpacity(A)); })
						.Padding(FMargin(18.f, 6.f))
						[ HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::AlarmText), 15, FLinearColor::White, true) ]
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 8.f, 0.f, 0.f)
					[
						SNew(SBorder)
						.Visibility(this, &SHRGameHUD::DispatchVisibility)
						.BorderImage(FHRUIStyle::PillBrush())
						.BorderBackgroundColor(FSlateColor(FHRUIStyle::Police()))
						.Padding(FMargin(18.f, 6.f))
						[ HRWidgets::Label(HRText("HUD.DispatchBanner"), 15, FLinearColor::White, true) ]
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 8.f, 0.f, 0.f)
					[
						SNew(SBox).Visibility(this, &SHRGameHUD::TruceVisibility)
						[ HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::TruceText), 15, FLinearColor::FromSRGBColor(FColor(167, 139, 250)), true) ]
					]
				]

				// Top start corner: loot, hostages, suspicion
				+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Top).Padding(HRSLOT_PAD)
				[
					SNew(SBox).WidthOverride(300.f)
					[
						HRWidgets::Panel(
							SNew(SVerticalBox)
							+ SVerticalBox::Slot().AutoHeight()
							[ HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::LootText), 14) ]
							+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 6.f)
							[
								SNew(SBox).HeightOverride(6.f)
								[ SNew(SProgressBar).Percent(this, &SHRGameHUD::LootPercent).FillColorAndOpacity(FHRUIStyle::Success()) ]
							]
							+ SVerticalBox::Slot().AutoHeight()
							[ HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::HostageText), 13, FHRUIStyle::Muted()) ]
							+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 8.f, 0.f, 0.f)
							[
								SNew(SVerticalBox).Visibility(this, &SHRGameHUD::SuspicionVisibility)
								+ SVerticalBox::Slot().AutoHeight()[ HRWidgets::Label(HRText("HUD.Suspicion"), 13, FHRUIStyle::Muted()) ]
								+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 4.f, 0.f, 0.f)
								[
									SNew(SBox).HeightOverride(6.f)
									[ SNew(SProgressBar).Percent(this, &SHRGameHUD::SuspicionPercent).FillColorAndOpacity(FHRUIStyle::Warning()) ]
								]
							])
					]
				]

				// Top end corner: notifications
				+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Top).Padding(HRSLOT_PAD)
				[ BuildNotificationFeed() ]

				// Crosshair
				+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
				[
					SNew(SBox).WidthOverride(6.f).HeightOverride(6.f).Visibility(this, &SHRGameHUD::CrosshairVisibility)
					[ SNew(SImage).Image(FHRUIStyle::PillBrush()).ColorAndOpacity(FLinearColor(1.f, 1.f, 1.f, 0.85f)) ]
				]

				// Interaction prompt
				+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Bottom).Padding(FMargin(0.f, 0.f, 0.f, 190.f))
				[
					SNew(SVerticalBox).Visibility(this, &SHRGameHUD::PromptVisibility)
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						HRWidgets::Panel(
							SNew(STextBlock).Text(this, &SHRGameHUD::PromptText).Font(FHRUIStyle::Font(17, true)).ColorAndOpacity(this, &SHRGameHUD::PromptColor))
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 6.f, 0.f, 0.f)
					[
						SNew(SBox).WidthOverride(260.f).HeightOverride(6.f).Visibility(this, &SHRGameHUD::InteractProgressVisibility)
						[ SNew(SProgressBar).Percent(this, &SHRGameHUD::InteractProgress).FillColorAndOpacity(FHRUIStyle::Ink()) ]
					]
				]

				// Bottom start: health + inventory
				+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Bottom).Padding(HRSLOT_PAD)
				[
					SNew(SBox).WidthOverride(320.f)
					[
						HRWidgets::Panel(
							SNew(SVerticalBox)
							+ SVerticalBox::Slot().AutoHeight()
							[
								SNew(SBox).HeightOverride(10.f)
								[ SNew(SProgressBar).Percent(this, &SHRGameHUD::HealthPercent).FillColorAndOpacity(this, &SHRGameHUD::HealthColor) ]
							]
							+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 8.f, 0.f, 0.f)
							[ HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::InventoryText), 13, FHRUIStyle::Muted()) ]
							+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 4.f, 0.f, 0.f)
							[ HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::CameraHintText), 12, FHRUIStyle::Muted()) ])
					]
				]

				// Bottom end: ammo
				+ SOverlay::Slot().HAlign(HAlign_Right).VAlign(VAlign_Bottom).Padding(HRSLOT_PAD)
				[
					HRWidgets::Panel(
						SNew(STextBlock).Text(this, &SHRGameHUD::AmmoText).Font(FHRUIStyle::Font(28, true)).ColorAndOpacity(FHRUIStyle::Ink()))
				]

				// Downed / arrested / spectating overlays
				+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center).Padding(FMargin(0.f, 260.f, 0.f, 0.f))
				[
					SNew(SVerticalBox)
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						SNew(SBox).Visibility(this, &SHRGameHUD::DownedVisibility)
						[ HRWidgets::Panel(HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::DownedText), 20, FHRUIStyle::Alarm(), true)) ]
					]
					+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
					[
						SNew(SBox).Visibility(this, &SHRGameHUD::ArrestedVisibility)
						[ HRWidgets::Panel(HRWidgets::Label(HRText("HUD.Arrested"), 20, FHRUIStyle::Warning(), true)) ]
					]
				]
				+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Bottom).Padding(FMargin(0.f, 0.f, 0.f, 60.f))
				[
					SNew(SBox).Visibility(this, &SHRGameHUD::SpectatorVisibility)
					[ HRWidgets::Panel(HRWidgets::Label(TAttribute<FText>::CreateSP(this, &SHRGameHUD::SpectatorText), 16)) ]
				]
			]

			// ---------------------------------------------------------------- Lockpick minigame
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
			[
				SNew(SHRLockpickWidget).PlayerController(WeakPC)
			]

			// ---------------------------------------------------------------- CCTV overlay
			+ SOverlay::Slot()
			[
				SNew(SBox)
				.Visibility_Lambda([WeakHUD]() { return WeakHUD.IsValid() && WeakHUD->IsCCTV() ? EVisibility::HitTestInvisible : EVisibility::Collapsed; })
				.HAlign(HAlign_Center).VAlign(VAlign_Top).Padding(FMargin(0.f, 30.f))
				[ HRWidgets::Panel(HRWidgets::Label(HRText("HUD.CCTVHint"), 16, FHRUIStyle::Ink(), true)) ]
			]

			// ---------------------------------------------------------------- Panels
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
			[
				SNew(SBox)
				.Visibility_Lambda([WeakHUD]() { return WeakHUD.IsValid() && WeakHUD->IsNegotiationOpen() ? EVisibility::Visible : EVisibility::Collapsed; })
				[ SNew(SHRNegotiationPanel).PlayerController(WeakPC) ]
			]
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
			[
				SNew(SBox)
				.Visibility_Lambda([this]() { const AHRGameState* GS = GetGS(); return GS && !GS->HasMatchStarted() ? EVisibility::Visible : EVisibility::Collapsed; })
				[ SNew(SHRLobbyPanel).PlayerController(WeakPC) ]
			]
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
			[
				SNew(SBox)
				.Visibility_Lambda([this, WeakHUD]()
				{
					const AHRGameState* GS = GetGS();
					const bool bEnded = GS && GS->Phase == EHRMatchPhase::Ended;
					const bool bTab = WeakHUD.IsValid() && WeakHUD->IsScoreboardVisible();
					return (bEnded || bTab) ? EVisibility::Visible : EVisibility::Collapsed;
				})
				[ SNew(SHRScoreboard).PlayerController(WeakPC) ]
			]
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
			[
				SNew(SBox)
				.Visibility_Lambda([WeakHUD]() { return WeakHUD.IsValid() && WeakHUD->IsMenuOpen() && !WeakHUD->IsSettingsOpen() ? EVisibility::Visible : EVisibility::Collapsed; })
				[ SNew(SHRPauseMenu).PlayerController(WeakPC) ]
			]
			+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
			[
				SNew(SBox)
				.Visibility_Lambda([WeakHUD]() { return WeakHUD.IsValid() && WeakHUD->IsSettingsOpen() ? EVisibility::Visible : EVisibility::Collapsed; })
				[
					SNew(SHRSettingsPanel)
					.OnClose_Lambda([WeakHUD]() { if (WeakHUD.IsValid()) { WeakHUD->OpenSettings(false); } })
					.OnApplied_Lambda([WeakPC]() { if (WeakPC.IsValid()) { WeakPC->ApplyUserSettings(); } })
				]
			]
		]
	];
}

TSharedRef<SWidget> SHRGameHUD::BuildNotificationFeed()
{
	TSharedRef<SVerticalBox> Box = SNew(SVerticalBox);
	for (int32 i = 0; i < 6; ++i)
	{
		Box->AddSlot().AutoHeight().HAlign(HAlign_Right).Padding(0.f, 0.f, 0.f, 6.f)
		[
			SNew(SBox)
			.MaxDesiredWidth(420.f)
			.Visibility_Lambda([this, i]() { return HUD.IsValid() && HUD->GetNotifications().IsValidIndex(i) ? EVisibility::HitTestInvisible : EVisibility::Collapsed; })
			[
				SNew(SBorder)
				.BorderImage(FHRUIStyle::PanelBrush())
				.Padding(FMargin(14.f, 8.f))
				[
					SNew(STextBlock)
					.AutoWrapText(true)
					.Font(FHRUIStyle::Font(14, i == 0))
					.Text_Lambda([this, i]() { return HUD.IsValid() && HUD->GetNotifications().IsValidIndex(i) ? HUD->GetNotifications()[i].Text : FText::GetEmpty(); })
					.ColorAndOpacity_Lambda([this, i]() { return FSlateColor(HUD.IsValid() && HUD->GetNotifications().IsValidIndex(i) ? FHRUIStyle::NotifyColor(HUD->GetNotifications()[i].Type) : FHRUIStyle::Ink()); })
				]
			]
		];
	}
	return Box;
}

// ------------------------------------------------------------------------ Accessors

AHRCharacter* SHRGameHUD::GetCharacter() const { return PC.IsValid() ? Cast<AHRCharacter>(PC->GetPawn()) : nullptr; }
AHRGameState* SHRGameHUD::GetGS() const { return PC.IsValid() && PC->GetWorld() ? PC->GetWorld()->GetGameState<AHRGameState>() : nullptr; }
AHRPlayerState* SHRGameHUD::GetPS() const { return PC.IsValid() ? PC->GetPlayerState<AHRPlayerState>() : nullptr; }

FText SHRGameHUD::KeyName(FName Slot) const
{
	if (!PC.IsValid()) { return FText::GetEmpty(); }
	const UHRInputConfig* C = PC->GetInputConfig();
	const UHRGameUserSettings* S = UHRGameUserSettings::Get();
	return C ? C->GetBoundKey(Slot, S ? S->KeyOverrides : TMap<FName, FKey>()).GetDisplayName() : FText::GetEmpty();
}

EVisibility SHRGameHUD::HUDLayerVisibility() const
{
	const AHRGameState* GS = GetGS();
	if (!GS || !GS->HasMatchStarted() || GS->Phase == EHRMatchPhase::Ended) { return EVisibility::Collapsed; }
	if (HUD.IsValid() && HUD->IsCCTV()) { return EVisibility::Collapsed; }
	return EVisibility::HitTestInvisible;
}

FText SHRGameHUD::PhaseText() const
{
	const AHRGameState* GS = GetGS();
	if (!GS) { return FText::GetEmpty(); }
	switch (GS->Phase)
	{
	case EHRMatchPhase::Preparation: return HRText("Phase.Preparation");
	case EHRMatchPhase::Infiltration: return HRText("Phase.Infiltration");
	case EHRMatchPhase::Response: return HRText("Phase.Response");
	case EHRMatchPhase::Ended: return HRText("Phase.Ended");
	default: return HRText("Phase.Waiting");
	}
}

FText SHRGameHUD::ClockText() const
{
	const AHRGameState* GS = GetGS();
	return GS ? FHRUIStyle::FormatClock(GS->GetPhaseTimeRemaining()) : FText::GetEmpty();
}

FSlateColor SHRGameHUD::ClockColor() const
{
	const AHRGameState* GS = GetGS();
	return FSlateColor(GS && GS->GetPhaseTimeRemaining() < 60.f && GS->Phase != EHRMatchPhase::Preparation ? FHRUIStyle::Alarm() : FHRUIStyle::Ink());
}

FText SHRGameHUD::ObjectiveText() const
{
	const AHRGameState* GS = GetGS();
	const AHRPlayerState* PS = GetPS();
	if (!GS || !PS) { return FText::GetEmpty(); }
	const bool bPolice = PS->GetTeam() == EHRTeam::Police;
	const AHRCharacter* Ch = GetCharacter();
	switch (GS->Phase)
	{
	case EHRMatchPhase::Preparation: return bPolice ? HRText("Obj.PolicePrep") : HRText("Obj.RobberPrep");
	case EHRMatchPhase::Infiltration: return bPolice ? HRText("Obj.PolicePatrol") : (GS->bVaultOpened ? HRText("Obj.RobberLoot") : HRText("Obj.RobberVault"));
	case EHRMatchPhase::Response:
		if (bPolice) { return GS->bPoliceDispatched ? HRText("Obj.PoliceRespond") : HRText("Obj.PoliceAwaitDispatch"); }
		if (Ch && Ch->IsCarryingBag()) { return HRText("Obj.RobberExtract"); }
		return GS->bVaultOpened ? HRText("Obj.RobberLoot") : HRText("Obj.RobberVault");
	default: return FText::GetEmpty();
	}
}

EVisibility SHRGameHUD::AlarmVisibility() const
{
	const AHRGameState* GS = GetGS();
	return GS && GS->bAlarmRaised ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

FText SHRGameHUD::AlarmText() const
{
	const AHRGameState* GS = GetGS();
	if (!GS) { return FText::GetEmpty(); }
	if (!GS->bPoliceDispatched)
	{
		return FText::Format(HRText("HUD.AlarmDispatchIn"), FHRUIStyle::FormatClock(FMath::Max(0.f, GS->DispatchServerTime - GS->GetServerNow())));
	}
	return HRText("HUD.AlarmActive");
}

FText SHRGameHUD::LootText() const
{
	const AHRGameState* GS = GetGS();
	if (!GS) { return FText::GetEmpty(); }
	return FText::Format(HRText("HUD.Loot"), FHRUIStyle::FormatMoney(GS->SecuredLootValue), FHRUIStyle::FormatMoney(GS->TargetLootValue));
}

TOptional<float> SHRGameHUD::LootPercent() const
{
	const AHRGameState* GS = GetGS();
	return GS && GS->TargetLootValue > 0 ? FMath::Clamp(static_cast<float>(GS->SecuredLootValue) / GS->TargetLootValue, 0.f, 1.f) : 0.f;
}

EVisibility SHRGameHUD::SuspicionVisibility() const
{
	const AHRGameState* GS = GetGS();
	const AHRPlayerState* PS = GetPS();
	return GS && PS && PS->GetTeam() == EHRTeam::Robbers && !GS->bAlarmRaised ? EVisibility::Visible : EVisibility::Collapsed;
}

TOptional<float> SHRGameHUD::SuspicionPercent() const
{
	const AHRGameState* GS = GetGS();
	return GS ? GS->Suspicion01 : 0.f;
}

FText SHRGameHUD::HostageText() const
{
	const AHRGameState* GS = GetGS();
	return GS ? FText::Format(HRText("HUD.Hostages"), FText::AsNumber(GS->HostagesHeld), FText::AsNumber(GS->HostagesRescued)) : FText::GetEmpty();
}

EVisibility SHRGameHUD::TruceVisibility() const
{
	const AHRGameState* GS = GetGS();
	return GS && GS->IsTruceActive() ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

FText SHRGameHUD::TruceText() const
{
	const AHRGameState* GS = GetGS();
	return GS ? FText::Format(HRText("HUD.Truce"), FHRUIStyle::FormatClock(GS->Negotiation.TruceEndsServerTime - GS->GetServerNow())) : FText::GetEmpty();
}

EVisibility SHRGameHUD::PromptVisibility() const
{
	const AHRCharacter* Ch = GetCharacter();
	if (!Ch || Ch->IsLockpicking()) { return EVisibility::Collapsed; }
	const UHRInteractionComponent* I = Ch->GetInteraction();
	return I && (I->GetFocusedActor() || I->GetActive().IsActive()) ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

FText SHRGameHUD::PromptText() const
{
	const AHRCharacter* Ch = GetCharacter();
	const UHRInteractionComponent* I = Ch ? Ch->GetInteraction() : nullptr;
	if (!I) { return FText::GetEmpty(); }
	if (I->GetActive().IsActive()) { return I->GetActive().Prompt; }
	if (!I->IsFocusedUsable()) { return I->GetFocusedBlockedReason(); }
	return FText::Format(FText::FromString(TEXT("[{0}]  {1}")), KeyName(TEXT("Interact")), I->GetFocusedPrompt());
}

FSlateColor SHRGameHUD::PromptColor() const
{
	const AHRCharacter* Ch = GetCharacter();
	const UHRInteractionComponent* I = Ch ? Ch->GetInteraction() : nullptr;
	return FSlateColor(I && !I->IsFocusedUsable() && !I->GetActive().IsActive() ? FHRUIStyle::Muted() : FHRUIStyle::Ink());
}

TOptional<float> SHRGameHUD::InteractProgress() const
{
	const AHRCharacter* Ch = GetCharacter();
	return Ch && Ch->GetInteraction() ? Ch->GetInteraction()->GetActiveProgress() : 0.f;
}

EVisibility SHRGameHUD::InteractProgressVisibility() const
{
	const AHRCharacter* Ch = GetCharacter();
	return Ch && Ch->GetInteraction() && Ch->GetInteraction()->GetActive().IsActive() ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

TOptional<float> SHRGameHUD::HealthPercent() const
{
	const AHRCharacter* Ch = GetCharacter();
	return Ch && Ch->GetHealth() ? Ch->GetHealth()->GetHealth() / FMath::Max(1.f, Ch->GetHealth()->GetMaxHealth()) : 0.f;
}

FSlateColor SHRGameHUD::HealthColor() const
{
	const TOptional<float> H = HealthPercent();
	return FSlateColor(H.Get(0.f) < 0.3f ? FHRUIStyle::Alarm() : FHRUIStyle::Success());
}

FText SHRGameHUD::AmmoText() const
{
	const AHRCharacter* Ch = GetCharacter();
	const UHRWeaponComponent* W = Ch ? Ch->GetWeapon() : nullptr;
	if (!W || !Ch->CanUseWeapon()) { return Ch && Ch->IsRobber() && !Ch->IsMasked() ? HRText("HUD.MaskToArm") : FText::GetEmpty(); }
	if (W->IsReloading()) { return HRText("HUD.Reloading"); }
	return FText::FromString(FString::Printf(TEXT("%d / %d"), W->GetAmmoInMag(), W->GetReserveAmmo()));
}

FText SHRGameHUD::InventoryText() const
{
	const AHRCharacter* Ch = GetCharacter();
	const UHRInventoryComponent* Inv = Ch ? Ch->GetInventory() : nullptr;
	if (!Inv) { return FText::GetEmpty(); }
	FString Out;
	for (const FHRItemStack& S : Inv->GetItems())
	{
		if (!Out.IsEmpty()) { Out += TEXT("   "); }
		Out += FString::Printf(TEXT("%s x%d"), *FHRLocalization::Get().Text(FName(*(TEXT("Item.") + S.ItemId.ToString()))).ToString(), S.Count);
	}
	if (Ch->IsCarryingBag()) { Out = HRText("HUD.CarryingBag").ToString() + (Out.IsEmpty() ? FString() : TEXT("   ") + Out); }
	return FText::FromString(Out);
}

FText SHRGameHUD::CameraHintText() const
{
	const AHRCharacter* Ch = GetCharacter();
	if (!Ch || !Ch->GetCameraRig()) { return FText::GetEmpty(); }
	const FText Mode = Ch->GetCameraRig()->GetMode() == EHRCameraMode::FirstPerson ? HRText("Camera.FirstPerson") : HRText("Camera.ThirdPerson");
	return FText::Format(HRText("HUD.CameraHint"), KeyName(TEXT("ToggleCamera")), Mode);
}

EVisibility SHRGameHUD::CrosshairVisibility() const
{
	const AHRCharacter* Ch = GetCharacter();
	return Ch && Ch->CanUseWeapon() ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

EVisibility SHRGameHUD::DownedVisibility() const
{
	const AHRCharacter* Ch = GetCharacter();
	return Ch && Ch->GetHealth() && Ch->GetHealth()->IsDowned() ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

FText SHRGameHUD::DownedText() const
{
	const AHRCharacter* Ch = GetCharacter();
	const AHRGameState* GS = GetGS();
	if (!Ch || !GS) { return FText::GetEmpty(); }
	return FText::Format(HRText("HUD.Downed"), FHRUIStyle::FormatClock(Ch->GetHealth()->GetBleedoutEndServerTime() - GS->GetServerNow()));
}

EVisibility SHRGameHUD::ArrestedVisibility() const
{
	const AHRPlayerState* PS = GetPS();
	return PS && PS->IsArrested() ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

EVisibility SHRGameHUD::SpectatorVisibility() const
{
	return PC.IsValid() && PC->GetStateName() == NAME_Spectating ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}

FText SHRGameHUD::SpectatorText() const
{
	const AHRPlayerState* PS = GetPS();
	if (PS && PS->HasEscaped()) { return HRText("HUD.SpectatingEscaped"); }
	return HRText("HUD.Spectating");
}

EVisibility SHRGameHUD::DispatchVisibility() const
{
	return HUD.IsValid() && PC.IsValid() && PC->GetWorld()->GetTimeSeconds() < HUD->GetDispatchFlashUntil() ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
}
