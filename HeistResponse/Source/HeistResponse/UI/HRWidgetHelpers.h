#pragma once

#include "CoreMinimal.h"
#include "Widgets/SWidget.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Styling/SlateTypes.h"
#include "UI/HRUIStyle.h"

/** Small Slate building blocks so every screen shares one look. */
namespace HRWidgets
{
	inline const FButtonStyle& ButtonStyle()
	{
		static FButtonStyle Style = FButtonStyle()
			.SetNormal(*FHRUIStyle::ButtonBrush(false))
			.SetHovered(*FHRUIStyle::ButtonBrush(true))
			.SetPressed(*FHRUIStyle::ButtonBrush(true))
			.SetDisabled(*FHRUIStyle::ButtonBrush(false))
			.SetNormalPadding(FMargin(0.f))
			.SetPressedPadding(FMargin(0.f));
		return Style;
	}

	inline TSharedRef<STextBlock> Label(const TAttribute<FText>& Text, int32 Size = 16, const FLinearColor& Color = FHRUIStyle::Ink(), bool bBold = false)
	{
		return SNew(STextBlock)
			.Text(Text)
			.Font(FHRUIStyle::Font(Size, bBold))
			.ColorAndOpacity(FSlateColor(Color))
			.ShadowOffset(FVector2D(0.f, 1.f))
			.ShadowColorAndOpacity(FLinearColor(0.f, 0.f, 0.f, 0.6f));
	}

	inline TSharedRef<SWidget> Button(const TAttribute<FText>& Text, TFunction<void()> OnClick, const FLinearColor& Accent = FHRUIStyle::Ink(), float MinWidth = 220.f, const TAttribute<bool>& Enabled = true)
	{
		return SNew(SBox)
			.MinDesiredWidth(MinWidth)
			[
				SNew(SButton)
				.ButtonStyle(&ButtonStyle())
				.IsEnabled(Enabled)
				.HAlign(HAlign_Center)
				.VAlign(VAlign_Center)
				.ContentPadding(FMargin(18.f, 10.f))
				.OnClicked(FOnClicked::CreateLambda([OnClick]() { if (OnClick) { OnClick(); } return FReply::Handled(); }))
				[
					Label(Text, 16, Accent, true)
				]
			];
	}

	inline TSharedRef<SWidget> Panel(const TSharedRef<SWidget>& Content, bool bSolid = false)
	{
		return SNew(SBorder)
			.BorderImage(bSolid ? FHRUIStyle::PanelSolidBrush() : FHRUIStyle::PanelBrush())
			.Padding(FHRUIStyle::PanelPadding())
			[
				Content
			];
	}
}
