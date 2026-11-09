#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "Core/HRTypes.h"
#include "HRHUD.generated.h"

class SHRGameHUD;
class SWidget;
class USoundBase;

struct FHRNotification
{
	FText Text;
	EHRNotifyType Type = EHRNotifyType::Info;
	float Time = 0.f;
};

/**
 * In-match HUD host. Owns the Slate widget tree (SHRGameHUD) and the world-space marker pass
 * (pings, dispatch waypoint, extraction zones, teammate tags) drawn on the canvas.
 * Also decides the input mode: any open panel (lobby, menu, negotiation, summary, settings) frees
 * the cursor; closing them returns to game-only input.
 */
UCLASS()
class HEISTRESPONSE_API AHRHUD : public AHUD
{
	GENERATED_BODY()

public:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;
	virtual void DrawHUD() override;
	virtual void Tick(float DeltaSeconds) override;

	void ToggleMenu();
	void CloseAllPanels();
	void SetScoreboardVisible(bool bVisible) { bScoreboard = bVisible; }
	void ToggleNegotiation();
	void PushNotification(const FText& Text, EHRNotifyType Type);
	void ShowDispatch(const FVector& Location);
	void ShowMatchSummary() { bSummaryRequested = true; }
	void SetCCTVOverlay(bool bOn) { bCCTV = bOn; }
	void OpenSettings(bool bOpen) { bSettingsOpen = bOpen; }
	void PlayUISound(FName Cue);

	bool IsMenuOpen() const { return bMenuOpen; }
	bool IsSettingsOpen() const { return bSettingsOpen; }
	bool IsNegotiationOpen() const { return bNegotiationOpen; }
	bool IsScoreboardVisible() const { return bScoreboard; }
	bool IsCCTV() const { return bCCTV; }
	float GetDispatchFlashUntil() const { return DispatchFlashUntil; }
	const TArray<FHRNotification>& GetNotifications() const { return Notifications; }

	/** True when a panel needs the mouse cursor. */
	bool WantsCursor() const;

	UPROPERTY(EditDefaultsOnly, Category = "Audio") TMap<FName, TObjectPtr<USoundBase>> UISounds;

private:
	void UpdateInputMode();
	void DrawWorldMarker(const FVector& World, const FLinearColor& Color, const FString& Label, bool bClampToEdge);

	TSharedPtr<SHRGameHUD> Root;
	TSharedPtr<SWidget> RootContainer;
	TArray<FHRNotification> Notifications;
	bool bMenuOpen = false;
	bool bSettingsOpen = false;
	bool bNegotiationOpen = false;
	bool bScoreboard = false;
	bool bCCTV = false;
	bool bSummaryRequested = false;
	bool bLastWantsCursor = false;
	float DispatchFlashUntil = 0.f;
};
