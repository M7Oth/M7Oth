#include "UI/SHRLockpickWidget.h"
#include "UI/HRUIStyle.h"
#include "UI/HRHUD.h"
#include "Game/HRPlayerController.h"
#include "Character/HRCharacter.h"
#include "Heist/HRLockpickComponent.h"
#include "Core/HRLocalization.h"
#include "Rules/LockpickModel.h"
#include "Rendering/DrawElements.h"
#include "Fonts/FontMeasure.h"
#include "Framework/Application/SlateApplication.h"

void SHRLockpickWidget::Construct(const FArguments& InArgs)
{
	PC = InArgs._PlayerController;
	SetVisibility(TAttribute<EVisibility>::CreateLambda([this]()
	{
		const UHRLockpickComponent* L = GetLockpick();
		return L && L->IsActive() ? EVisibility::HitTestInvisible : EVisibility::Collapsed;
	}));
}

UHRLockpickComponent* SHRLockpickWidget::GetLockpick() const
{
	const AHRCharacter* Ch = PC.IsValid() ? Cast<AHRCharacter>(PC->GetPawn()) : nullptr;
	return Ch ? Ch->GetLockpick() : nullptr;
}

void SHRLockpickWidget::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	Time += InDeltaTime;
	SnapFlash = FMath::Max(0.f, SnapFlash - InDeltaTime * 2.f);
	SetFlash = FMath::Max(0.f, SetFlash - InDeltaTime * 2.f);
	const UHRLockpickComponent* L = GetLockpick();
	if (!L) { return; }
	const FHRLockpickView& V = L->GetView();
	if (V.EventSerial != LastSerial)
	{
		LastSerial = V.EventSerial;
		AHRHUD* HUD = PC.IsValid() ? PC->GetHRHUD() : nullptr;
		if (V.LastEvent == static_cast<uint8>(HeistRules::ELockpickEvent::PickBroken)) { SnapFlash = 1.f; if (HUD) { HUD->PlayUISound(TEXT("PickSnap")); } }
		else { SetFlash = 1.f; if (HUD) { HUD->PlayUISound(TEXT("PinSet")); } }
	}
}

int32 SHRLockpickWidget::OnPaint(const FPaintArgs& Args, const FGeometry& G, const FSlateRect& MyCullingRect, FSlateWindowElementList& Out, int32 LayerId, const FWidgetStyle& InWidgetStyle, bool bParentEnabled) const
{
	const UHRLockpickComponent* L = GetLockpick();
	if (!L || !L->IsActive()) { return LayerId; }
	const FHRLockpickView& V = L->GetView();

	const FVector2f Size = FVector2f(G.GetLocalSize());
	const FVector2f Center(Size.X * 0.5f, Size.Y * 0.45f);
	const float Radius = 170.f;

	auto Box = [&](const FVector2f& Pos, const FVector2f& BoxSize, const FSlateBrush* Brush, const FLinearColor& Tint, int32 Layer)
	{
		FSlateDrawElement::MakeBox(Out, Layer, G.ToPaintGeometry(BoxSize, FSlateLayoutTransform(Pos)), Brush, ESlateDrawEffect::None, Tint);
	};
	auto Line = [&](const FVector2f& A, const FVector2f& B, const FLinearColor& Col, float Thickness, int32 Layer)
	{
		TArray<FVector2f> Pts = { A, B };
		FSlateDrawElement::MakeLines(Out, Layer, G.ToPaintGeometry(), Pts, ESlateDrawEffect::None, Col, true, Thickness);
	};
	auto Text = [&](const FText& T, const FVector2f& Pos, int32 FontSize, const FLinearColor& Col, int32 Layer)
	{
		const FSlateFontInfo Font = FHRUIStyle::Font(FontSize, true);
		const FVector2f Measure = FVector2f(FSlateApplication::Get().GetRenderer()->GetFontMeasureService()->Measure(T, Font));
		FSlateDrawElement::MakeText(Out, Layer, G.ToPaintGeometry(Measure, FSlateLayoutTransform(Pos - Measure * 0.5f)), T, Font, ESlateDrawEffect::None, Col);
	};

	// Backdrop panel.
	Box(FVector2f(0.f, 0.f), Size, FHRUIStyle::PanelSolidBrush(), FLinearColor(1.f, 1.f, 1.f, 0.92f), LayerId);

	// Lock body: closeness makes it tremble and glow.
	const float Tremble = L->IsLocalTension() ? V.Closeness * 3.f * FMath::Sin(Time * 60.f) : 0.f;
	const FLinearColor RingCol = FMath::Lerp(FLinearColor(0.35f, 0.38f, 0.42f), FHRUIStyle::Warning(), V.Closeness * 0.8f);
	Box(Center - FVector2f(Radius + Tremble, Radius), FVector2f(Radius * 2.f, Radius * 2.f), FHRUIStyle::PillBrush(), RingCol, LayerId + 1);
	Box(Center - FVector2f(Radius - 14.f + Tremble, Radius - 14.f), FVector2f((Radius - 14.f) * 2.f, (Radius - 14.f) * 2.f), FHRUIStyle::PillBrush(), FLinearColor(0.07f, 0.08f, 0.10f), LayerId + 2);
	// Keyway.
	Box(Center - FVector2f(8.f, 46.f), FVector2f(16.f, 92.f), FHRUIStyle::PillBrush(), FLinearColor(0.02f, 0.02f, 0.03f), LayerId + 3);

	// Pins along the top.
	const int32 Count = FMath::Max(1, V.PinCount);
	const float PinW = 26.f, Gap = 12.f;
	const float TotalW = Count * PinW + (Count - 1) * Gap;
	for (int32 i = 0; i < Count; ++i)
	{
		const FVector2f P(Center.X - TotalW * 0.5f + i * (PinW + Gap), Center.Y - Radius - 70.f);
		const bool bSet = i < V.PinsSet;
		const bool bCurrent = i == V.PinsSet;
		const float Lift = bSet ? 1.f : (bCurrent ? V.PinProgress : 0.f);
		const FLinearColor C = bSet ? FHRUIStyle::Success() : (bCurrent ? FMath::Lerp(FHRUIStyle::Ink(), FHRUIStyle::Success(), V.PinProgress) : FHRUIStyle::Muted());
		Box(P + FVector2f(0.f, 18.f * (1.f - Lift)), FVector2f(PinW, 40.f), FHRUIStyle::ButtonBrush(false), C, LayerId + 3);
	}
	if (SetFlash > 0.f)
	{
		Box(Center - FVector2f(Radius, Radius), FVector2f(Radius * 2.f, Radius * 2.f), FHRUIStyle::PillBrush(), FHRUIStyle::Success().CopyWithNewOpacity(SetFlash * 0.25f), LayerId + 4);
	}

	// Pick: rotates around the keyway from the bottom, angle from local input.
	const float AngleRad = FMath::DegreesToRadians(L->GetLocalAngle());
	const FVector2f Dir(FMath::Sin(AngleRad), -FMath::Cos(AngleRad));
	const FVector2f PickBase = Center + FVector2f(0.f, 20.f);
	const FLinearColor PickCol = SnapFlash > 0.f ? FHRUIStyle::Alarm() : FLinearColor(0.85f, 0.86f, 0.88f);
	Line(PickBase - Dir * 210.f, PickBase + Dir * (Radius - 30.f), PickCol, 5.f, LayerId + 5);
	Line(PickBase + Dir * (Radius - 30.f), PickBase + Dir * (Radius - 30.f) + FVector2f(Dir.Y, -Dir.X) * 14.f, PickCol, 5.f, LayerId + 5);

	// Tension wrench.
	const FLinearColor WrenchCol = L->IsLocalTension() ? FHRUIStyle::Warning() : FHRUIStyle::Muted();
	Line(Center + FVector2f(0.f, 60.f), Center + FVector2f(-150.f, 120.f), WrenchCol, 7.f, LayerId + 5);

	// Stress bar.
	const FVector2f BarPos(Center.X - 160.f, Center.Y + Radius + 40.f);
	Box(BarPos, FVector2f(320.f, 10.f), FHRUIStyle::PillBrush(), FLinearColor(1.f, 1.f, 1.f, 0.08f), LayerId + 3);
	Box(BarPos, FVector2f(320.f * V.Stress, 10.f), FHRUIStyle::PillBrush(), FMath::Lerp(FHRUIStyle::Warning(), FHRUIStyle::Alarm(), V.Stress), LayerId + 4);

	Text(HRText("Lockpick.Title"), FVector2f(Center.X, 34.f), 20, FHRUIStyle::Ink(), LayerId + 6);
	Text(FText::Format(HRText("Lockpick.Picks"), FText::AsNumber(V.LockpicksLeft)), FVector2f(Center.X, BarPos.Y + 34.f), 14, FHRUIStyle::Muted(), LayerId + 6);
	Text(HRText("Lockpick.Hint"), FVector2f(Center.X, Size.Y - 28.f), 13, FHRUIStyle::Muted(), LayerId + 6);
	return LayerId + 7;
}
