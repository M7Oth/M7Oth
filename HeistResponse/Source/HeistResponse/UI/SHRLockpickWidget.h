#pragma once

#include "CoreMinimal.h"
#include "Widgets/SLeafWidget.h"

class AHRPlayerController;
class UHRLockpickComponent;

/**
 * Lockpicking minigame (successor of WBP_LockpickUI), fully code-drawn:
 *   * Lock face with pin indicators (set pins glow green).
 *   * Pick rotates with the mouse (local, immediate) - server receives the angle stream.
 *   * Tension wrench visual follows LMB; the lock cylinder trembles with server "closeness".
 *   * Stress bar warns before the pick snaps; snaps and pin sets play UI sounds.
 */
class HEISTRESPONSE_API SHRLockpickWidget : public SLeafWidget
{
public:
	SLATE_BEGIN_ARGS(SHRLockpickWidget) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AHRPlayerController>, PlayerController)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	virtual int32 OnPaint(const FPaintArgs& Args, const FGeometry& AllottedGeometry, const FSlateRect& MyCullingRect, FSlateWindowElementList& OutDrawElements, int32 LayerId, const FWidgetStyle& InWidgetStyle, bool bParentEnabled) const override;
	virtual FVector2D ComputeDesiredSize(float) const override { return FVector2D(520.0, 560.0); }
	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	UHRLockpickComponent* GetLockpick() const;

	TWeakObjectPtr<AHRPlayerController> PC;
	uint8 LastSerial = 0;
	float SnapFlash = 0.f;
	float SetFlash = 0.f;
	float Time = 0.f;
};
