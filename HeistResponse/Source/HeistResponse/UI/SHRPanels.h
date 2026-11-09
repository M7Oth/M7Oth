#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Core/HRTypes.h"

class AHRPlayerController;
class AHRGameState;
class AHRPlayerState;
class SVerticalBox;

/** Pre-match lobby: two team columns, switch-team buttons, ready toggle, countdown, room code. */
class HEISTRESPONSE_API SHRLobbyPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SHRLobbyPanel) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AHRPlayerController>, PlayerController)
	SLATE_END_ARGS()
	void Construct(const FArguments& InArgs);
	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	void RebuildColumns();
	TSharedRef<SWidget> BuildColumn(EHRTeam Team);
	AHRGameState* GetGS() const;

	TWeakObjectPtr<AHRPlayerController> PC;
	TSharedPtr<SVerticalBox> PoliceList;
	TSharedPtr<SVerticalBox> RobberList;
	uint32 LastHash = 0;
};

/** Hostage negotiation phone: deal catalogue for my team + pending proposal with accept/reject. */
class HEISTRESPONSE_API SHRNegotiationPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SHRNegotiationPanel) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AHRPlayerController>, PlayerController)
	SLATE_END_ARGS()
	void Construct(const FArguments& InArgs);

private:
	AHRGameState* GetGS() const;
	EHRTeam MyTeam() const;
	TSharedRef<SWidget> DealButton(EHRDealType Deal);

	TWeakObjectPtr<AHRPlayerController> PC;
};

/** Scoreboard (Tab) and post-match summary with rematch vote. */
class HEISTRESPONSE_API SHRScoreboard : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SHRScoreboard) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AHRPlayerController>, PlayerController)
	SLATE_END_ARGS()
	void Construct(const FArguments& InArgs);
	virtual void Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime) override;

private:
	void Rebuild();
	AHRGameState* GetGS() const;

	TWeakObjectPtr<AHRPlayerController> PC;
	TSharedPtr<SVerticalBox> Rows;
	float RebuildTimer = 0.f;
};

/** In-match menu (no pause in multiplayer). */
class HEISTRESPONSE_API SHRPauseMenu : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SHRPauseMenu) {}
		SLATE_ARGUMENT(TWeakObjectPtr<AHRPlayerController>, PlayerController)
	SLATE_END_ARGS()
	void Construct(const FArguments& InArgs);

private:
	TWeakObjectPtr<AHRPlayerController> PC;
};
