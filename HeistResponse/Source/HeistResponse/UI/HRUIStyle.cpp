#include "UI/HRUIStyle.h"
#include "Core/HRLocalization.h"
#include "Fonts/CompositeFont.h"
#include "Brushes/SlateRoundedBoxBrush.h"
#include "Brushes/SlateColorBrush.h"
#include "Misc/Paths.h"

namespace
{
	TSharedPtr<const FCompositeFont> BuildComposite(bool bBold)
	{
		TSharedRef<FStandaloneCompositeFont> F = MakeShared<FStandaloneCompositeFont>();
		const FString Latin = FPaths::EngineContentDir() / (bBold ? TEXT("Slate/Fonts/Roboto-Bold.ttf") : TEXT("Slate/Fonts/Roboto-Regular.ttf"));
		const FString Arabic = FPaths::ProjectContentDir() / TEXT("Fonts/Raw/NotoKufiArabic-Variable.ttf");
		F->DefaultTypeface.AppendFont(TEXT("Regular"), Latin, EFontHinting::Default, EFontLoadingPolicy::LazyLoad);

		FCompositeSubFont& Sub = F->SubTypefaces.AddDefaulted_GetRef();
		Sub.CharacterRanges.Add(FInt32Range(FInt32RangeBound::Inclusive(0x0600), FInt32RangeBound::Inclusive(0x06FF)));
		Sub.CharacterRanges.Add(FInt32Range(FInt32RangeBound::Inclusive(0x0750), FInt32RangeBound::Inclusive(0x077F)));
		Sub.CharacterRanges.Add(FInt32Range(FInt32RangeBound::Inclusive(0x08A0), FInt32RangeBound::Inclusive(0x08FF)));
		Sub.CharacterRanges.Add(FInt32Range(FInt32RangeBound::Inclusive(0xFB50), FInt32RangeBound::Inclusive(0xFDFF)));
		Sub.CharacterRanges.Add(FInt32Range(FInt32RangeBound::Inclusive(0xFE70), FInt32RangeBound::Inclusive(0xFEFF)));
		Sub.Typeface.AppendFont(TEXT("Regular"), Arabic, EFontHinting::Default, EFontLoadingPolicy::LazyLoad);
		return F;
	}
}

FSlateFontInfo FHRUIStyle::Font(int32 Size, bool bBold)
{
	static TSharedPtr<const FCompositeFont> Regular = BuildComposite(false);
	static TSharedPtr<const FCompositeFont> Bold = BuildComposite(true);
	return FSlateFontInfo(bBold ? Bold : Regular, static_cast<float>(Size), TEXT("Regular"));
}

FLinearColor FHRUIStyle::Ink() { return FLinearColor::FromSRGBColor(FColor(242, 244, 247)); }
FLinearColor FHRUIStyle::Muted() { return FLinearColor::FromSRGBColor(FColor(154, 164, 178)); }
FLinearColor FHRUIStyle::Panel() { return FLinearColor(0.008f, 0.010f, 0.014f, 0.78f); }
FLinearColor FHRUIStyle::PanelSolid() { return FLinearColor::FromSRGBColor(FColor(14, 17, 22)); }
FLinearColor FHRUIStyle::Police() { return FLinearColor::FromSRGBColor(FColor(47, 123, 255)); }
FLinearColor FHRUIStyle::Robbers() { return FLinearColor::FromSRGBColor(FColor(255, 176, 32)); }
FLinearColor FHRUIStyle::Alarm() { return FLinearColor::FromSRGBColor(FColor(255, 59, 59)); }
FLinearColor FHRUIStyle::Success() { return FLinearColor::FromSRGBColor(FColor(52, 211, 153)); }
FLinearColor FHRUIStyle::Warning() { return FLinearColor::FromSRGBColor(FColor(251, 191, 36)); }

FLinearColor FHRUIStyle::TeamColor(EHRTeam Team)
{
	return Team == EHRTeam::Police ? Police() : (Team == EHRTeam::Robbers ? Robbers() : Muted());
}

FLinearColor FHRUIStyle::NotifyColor(EHRNotifyType Type)
{
	switch (Type)
	{
	case EHRNotifyType::Alarm:
	case EHRNotifyType::Error: return Alarm();
	case EHRNotifyType::Warning: return Warning();
	case EHRNotifyType::Dispatch: return Police();
	case EHRNotifyType::Objective: return Success();
	case EHRNotifyType::Negotiation: return FLinearColor::FromSRGBColor(FColor(167, 139, 250));
	default: return Ink();
	}
}

const FSlateBrush* FHRUIStyle::PanelBrush()
{
	static FSlateRoundedBoxBrush B(Panel(), 10.f);
	return &B;
}

const FSlateBrush* FHRUIStyle::PanelSolidBrush()
{
	static FSlateRoundedBoxBrush B(PanelSolid(), 14.f, FLinearColor(1.f, 1.f, 1.f, 0.06f), 1.f);
	return &B;
}

const FSlateBrush* FHRUIStyle::PillBrush()
{
	static FSlateRoundedBoxBrush B(FLinearColor::White, 999.f);
	return &B;
}

const FSlateBrush* FHRUIStyle::WhiteBrush()
{
	static FSlateColorBrush B(FLinearColor::White);
	return &B;
}

const FSlateBrush* FHRUIStyle::ButtonBrush(bool bHovered)
{
	static FSlateRoundedBoxBrush Normal(FLinearColor(1.f, 1.f, 1.f, 0.07f), 8.f, FLinearColor(1.f, 1.f, 1.f, 0.10f), 1.f);
	static FSlateRoundedBoxBrush Hover(FLinearColor(1.f, 1.f, 1.f, 0.16f), 8.f, FLinearColor(1.f, 1.f, 1.f, 0.25f), 1.f);
	return bHovered ? &Hover : &Normal;
}

EFlowDirectionPreference FHRUIStyle::Flow()
{
	return FHRLocalization::Get().IsRightToLeft() ? EFlowDirectionPreference::RightToLeft : EFlowDirectionPreference::LeftToRight;
}

FText FHRUIStyle::FormatClock(float Seconds)
{
	const int32 S = FMath::Max(0, FMath::CeilToInt(Seconds));
	return FText::FromString(FString::Printf(TEXT("%02d:%02d"), S / 60, S % 60));
}

FText FHRUIStyle::FormatMoney(int32 Value)
{
	return FText::FromString(FString::Printf(TEXT("$%s"), *FText::AsNumber(Value).ToString()));
}
