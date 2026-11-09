#pragma once

#include "CoreMinimal.h"
#include "Fonts/SlateFontInfo.h"
#include "Styling/SlateBrush.h"
#include "Layout/Margin.h"
#include "Types/SlateEnums.h"
#include "Core/HRTypes.h"

/**
 * HEIST RESPONSE design system (see Docs/UI_UX_DESIGN.md).
 * Fonts: composite of Roboto (Latin, ships with the engine) + Noto Kufi Arabic (OFL, vendored in
 * Content/Fonts/Raw) so Arabic is shaped correctly and mixed Arabic/English strings render.
 */
class HEISTRESPONSE_API FHRUIStyle
{
public:
	static FSlateFontInfo Font(int32 Size, bool bBold = false);

	// Palette
	static FLinearColor Ink();          // primary text
	static FLinearColor Muted();        // secondary text
	static FLinearColor Panel();        // translucent panel
	static FLinearColor PanelSolid();
	static FLinearColor Police();
	static FLinearColor Robbers();
	static FLinearColor Alarm();
	static FLinearColor Success();
	static FLinearColor Warning();
	static FLinearColor TeamColor(EHRTeam Team);
	static FLinearColor NotifyColor(EHRNotifyType Type);

	static const FSlateBrush* PanelBrush();
	static const FSlateBrush* PanelSolidBrush();
	static const FSlateBrush* PillBrush();
	static const FSlateBrush* WhiteBrush();
	static const FSlateBrush* ButtonBrush(bool bHovered);

	static EFlowDirectionPreference Flow();
	static float Spacing() { return 12.f; }
	static FMargin PanelPadding() { return FMargin(18.f, 14.f); }

	static FText FormatClock(float Seconds);
	static FText FormatMoney(int32 Value);
};
