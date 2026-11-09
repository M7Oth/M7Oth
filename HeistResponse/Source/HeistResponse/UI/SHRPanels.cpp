#include "UI/SHRPanels.h"
#include "UI/HRWidgetHelpers.h"
#include "UI/HRHUD.h"
#include "Game/HRPlayerController.h"
#include "Game/HRGameState.h"
#include "Game/HRPlayerState.h"
#include "Session/HRSessionSubsystem.h"
#include "Core/HRLocalization.h"
#include "Rules/NegotiationModel.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/Layout/SSpacer.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Engine/GameInstance.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"

namespace
{
	AHRGameState* GSFrom(const TWeakObjectPtr<AHRPlayerController>& PC)
	{
		return PC.IsValid() && PC->GetWorld() ? PC->GetWorld()->GetGameState<AHRGameState>() : nullptr;
	}
}

// ============================================================================ Lobby

AHRGameState* SHRLobbyPanel::GetGS() const { return GSFrom(PC); }

void SHRLobbyPanel::Construct(const FArguments& InArgs)
{
	PC = InArgs._PlayerController;
	TWeakObjectPtr<AHRPlayerController> WeakPC = PC;

	ChildSlot
	[
		SNew(SBox).WidthOverride(980.f)
		[
			HRWidgets::Panel(
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
				[ HRWidgets::Label(HRText("Lobby.Title"), 30, FHRUIStyle::Ink(), true) ]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 6.f, 0.f, 18.f)
				[
					HRWidgets::Label(TAttribute<FText>::CreateLambda([WeakPC]()
					{
						const UGameInstance* GI = WeakPC.IsValid() ? WeakPC->GetGameInstance() : nullptr;
						const UHRSessionSubsystem* S = GI ? GI->GetSubsystem<UHRSessionSubsystem>() : nullptr;
						return S && !S->GetRoomCode().IsEmpty() ? FText::Format(HRText("Lobby.RoomCode"), FText::FromString(S->GetRoomCode())) : HRText("Lobby.PublicMatch");
					}), 16, FHRUIStyle::Muted())
				]
				+ SVerticalBox::Slot().AutoHeight()
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().FillWidth(1.f).Padding(0.f, 0.f, 10.f, 0.f)[ BuildColumn(EHRTeam::Police) ]
					+ SHorizontalBox::Slot().FillWidth(1.f).Padding(10.f, 0.f, 0.f, 0.f)[ BuildColumn(EHRTeam::Robbers) ]
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 22.f, 0.f, 0.f)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth().Padding(8.f, 0.f)
					[
						HRWidgets::Button(TAttribute<FText>::CreateLambda([WeakPC]()
						{
							const AHRPlayerState* PS = WeakPC.IsValid() ? WeakPC->GetPlayerState<AHRPlayerState>() : nullptr;
							return PS && PS->IsReady() ? HRText("Lobby.NotReady") : HRText("Lobby.Ready");
						}), [WeakPC]()
						{
							if (!WeakPC.IsValid()) { return; }
							const AHRPlayerState* PS = WeakPC->GetPlayerState<AHRPlayerState>();
							WeakPC->ServerSetReady(!(PS && PS->IsReady()));
						}, FHRUIStyle::Success(), 260.f)
					]
					+ SHorizontalBox::Slot().AutoWidth().Padding(8.f, 0.f)
					[
						HRWidgets::Button(HRText("Menu.Settings"), [WeakPC]() { if (WeakPC.IsValid() && WeakPC->GetHRHUD()) { WeakPC->GetHRHUD()->OpenSettings(true); } })
					]
					+ SHorizontalBox::Slot().AutoWidth().Padding(8.f, 0.f)
					[
						HRWidgets::Button(HRText("Menu.Leave"), [WeakPC]()
						{
							if (!WeakPC.IsValid()) { return; }
							if (UHRSessionSubsystem* S = WeakPC->GetGameInstance()->GetSubsystem<UHRSessionSubsystem>()) { S->LeaveSession(); }
							WeakPC->ClientReturnToMainMenuWithTextReason(FText::GetEmpty());
						}, FHRUIStyle::Alarm())
					]
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 14.f, 0.f, 0.f)
				[
					HRWidgets::Label(TAttribute<FText>::CreateLambda([this]()
					{
						const AHRGameState* GS = GetGS();
						if (GS && GS->LobbyCountdownEnd > 0.f)
						{
							return FText::Format(HRText("Lobby.Starting"), FText::AsNumber(FMath::Max(0, FMath::CeilToInt(GS->LobbyCountdownEnd - GS->GetServerNow()))));
						}
						return HRText("Lobby.WaitingReady");
					}), 18, FHRUIStyle::Warning(), true)
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 10.f, 0.f, 0.f)
				[ HRWidgets::Label(HRText("Lobby.Tip"), 13, FHRUIStyle::Muted()) ],
				true)
		]
	];
	RebuildColumns();
}

TSharedRef<SWidget> SHRLobbyPanel::BuildColumn(EHRTeam Team)
{
	TWeakObjectPtr<AHRPlayerController> WeakPC = PC;
	TSharedPtr<SVerticalBox>& List = (Team == EHRTeam::Police) ? PoliceList : RobberList;
	return SNew(SBorder)
		.BorderImage(FHRUIStyle::ButtonBrush(false))
		.Padding(16.f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()
			[ HRWidgets::Label(Team == EHRTeam::Police ? HRText("Team.Police") : HRText("Team.Robbers"), 22, FHRUIStyle::TeamColor(Team), true) ]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 4.f, 0.f, 12.f)
			[ HRWidgets::Label(Team == EHRTeam::Police ? HRText("Team.PoliceDesc") : HRText("Team.RobbersDesc"), 13, FHRUIStyle::Muted()) ]
			+ SVerticalBox::Slot().AutoHeight().MinHeight(190.f)
			[ SAssignNew(List, SVerticalBox) ]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 12.f, 0.f, 0.f)
			[
				HRWidgets::Button(HRText("Lobby.JoinTeam"), [WeakPC, Team]() { if (WeakPC.IsValid()) { WeakPC->ServerSelectTeam(Team); } }, FHRUIStyle::TeamColor(Team), 200.f)
			]
		];
}

void SHRLobbyPanel::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	const AHRGameState* GS = GetGS();
	if (!GS) { return; }
	uint32 Hash = 0;
	for (APlayerState* Raw : GS->PlayerArray)
	{
		const AHRPlayerState* PS = Cast<AHRPlayerState>(Raw);
		if (!PS) { continue; }
		Hash = HashCombine(Hash, GetTypeHash(PS->GetPlayerName()));
		Hash = HashCombine(Hash, static_cast<uint32>(PS->GetTeam()) * 7u + (PS->IsReady() ? 1u : 0u));
	}
	if (Hash != LastHash) { LastHash = Hash; RebuildColumns(); }
}

void SHRLobbyPanel::RebuildColumns()
{
	if (!PoliceList.IsValid() || !RobberList.IsValid()) { return; }
	PoliceList->ClearChildren();
	RobberList->ClearChildren();
	const AHRGameState* GS = GetGS();
	if (!GS) { return; }
	for (APlayerState* Raw : GS->PlayerArray)
	{
		const AHRPlayerState* PS = Cast<AHRPlayerState>(Raw);
		if (!PS || PS->GetTeam() == EHRTeam::None) { continue; }
		TSharedPtr<SVerticalBox> List = PS->GetTeam() == EHRTeam::Police ? PoliceList : RobberList;
		List->AddSlot().AutoHeight().Padding(0.f, 3.f)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f)[ HRWidgets::Label(FText::FromString(PS->GetPlayerName()), 16) ]
			+ SHorizontalBox::Slot().AutoWidth()[ HRWidgets::Label(PS->IsReady() ? HRText("Lobby.ReadyTag") : FText::GetEmpty(), 14, FHRUIStyle::Success(), true) ]
		];
	}
}

// ============================================================================ Negotiation

AHRGameState* SHRNegotiationPanel::GetGS() const { return GSFrom(PC); }

EHRTeam SHRNegotiationPanel::MyTeam() const
{
	const AHRPlayerState* PS = PC.IsValid() ? PC->GetPlayerState<AHRPlayerState>() : nullptr;
	return PS ? PS->GetTeam() : EHRTeam::None;
}

TSharedRef<SWidget> SHRNegotiationPanel::DealButton(EHRDealType Deal)
{
	TWeakObjectPtr<AHRPlayerController> WeakPC = PC;
	const FName Key(*FString::Printf(TEXT("Deal.Name.%d"), static_cast<int32>(Deal)));
	const FName DescKey(*FString::Printf(TEXT("Deal.Desc.%d"), static_cast<int32>(Deal)));
	return SNew(SBox)
		.Visibility_Lambda([this, Deal]() { return HeistRules::FNegotiationModel::TeamMayPropose(ToRules(MyTeam()), ToRules(Deal)) ? EVisibility::Visible : EVisibility::Collapsed; })
		.Padding(0.f, 4.f)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(1.f).VAlign(VAlign_Center)
			[
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()[ HRWidgets::Label(FHRLocalization::Get().Text(Key), 16, FHRUIStyle::Ink(), true) ]
				+ SVerticalBox::Slot().AutoHeight()[ SNew(STextBlock).Text(FHRLocalization::Get().Text(DescKey)).Font(FHRUIStyle::Font(13)).ColorAndOpacity(FHRUIStyle::Muted()).AutoWrapText(true) ]
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(12.f, 0.f, 0.f, 0.f)
			[
				HRWidgets::Button(HRText("Negotiation.Propose"), [WeakPC, Deal]() { if (WeakPC.IsValid()) { WeakPC->ServerProposeDeal(Deal); } }, FHRUIStyle::Ink(), 140.f,
					TAttribute<bool>::CreateLambda([this]()
					{
						const AHRGameState* GS = GetGS();
						if (!GS || GS->Negotiation.State != EHRNegotiationState::Open) { return false; }
						const float CD = MyTeam() == EHRTeam::Police ? GS->Negotiation.PoliceCooldownEnds : GS->Negotiation.RobberCooldownEnds;
						return CD <= GS->GetServerNow();
					}))
			]
		];
}

void SHRNegotiationPanel::Construct(const FArguments& InArgs)
{
	PC = InArgs._PlayerController;
	TWeakObjectPtr<AHRPlayerController> WeakPC = PC;

	TSharedRef<SVerticalBox> Deals = SNew(SVerticalBox);
	for (uint8 D = 1; D < static_cast<uint8>(EHRDealType::Count); ++D) { Deals->AddSlot().AutoHeight()[ DealButton(static_cast<EHRDealType>(D)) ]; }

	ChildSlot
	[
		SNew(SBox).WidthOverride(640.f)
		[
			HRWidgets::Panel(
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight()
				[ HRWidgets::Label(HRText("Negotiation.Title"), 26, FLinearColor::FromSRGBColor(FColor(167, 139, 250)), true) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 4.f, 0.f, 12.f)
				[
					HRWidgets::Label(TAttribute<FText>::CreateLambda([this]()
					{
						const AHRGameState* GS = GetGS();
						if (!GS) { return FText::GetEmpty(); }
						return FText::Format(HRText("Negotiation.Status"), FText::AsNumber(GS->HostagesHeld), FText::AsNumber(GS->Negotiation.AcceptedDeals), FText::AsNumber(GS->Negotiation.MaxDeals));
					}), 14, FHRUIStyle::Muted())
				]
				// Pending proposal
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 14.f)
				[
					SNew(SBorder)
					.BorderImage(FHRUIStyle::ButtonBrush(true))
					.Padding(14.f)
					.Visibility_Lambda([this]() { const AHRGameState* GS = GetGS(); return GS && GS->Negotiation.State == EHRNegotiationState::ProposalPending ? EVisibility::Visible : EVisibility::Collapsed; })
					[
						SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight()
						[
							HRWidgets::Label(TAttribute<FText>::CreateLambda([this]()
							{
								const AHRGameState* GS = GetGS();
								if (!GS) { return FText::GetEmpty(); }
								const FText DealName = FHRLocalization::Get().Text(FName(*FString::Printf(TEXT("Deal.Name.%d"), static_cast<int32>(GS->Negotiation.PendingDeal))));
								const FText From = GS->Negotiation.Proposer == EHRTeam::Police ? HRText("Team.Police") : HRText("Team.Robbers");
								return FText::Format(HRText("Negotiation.Pending"), From, DealName, FHRUIStyle::FormatClock(GS->Negotiation.ExpiresServerTime - GS->GetServerNow()));
							}), 16, FHRUIStyle::Ink(), true)
						]
						+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 10.f, 0.f, 0.f)
						[
							SNew(SHorizontalBox)
							.Visibility_Lambda([this]() { const AHRGameState* GS = GetGS(); return GS && GS->Negotiation.Proposer != MyTeam() ? EVisibility::Visible : EVisibility::Collapsed; })
							+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 10.f, 0.f)
							[ HRWidgets::Button(HRText("Negotiation.Accept"), [WeakPC]() { if (WeakPC.IsValid()) { WeakPC->ServerRespondDeal(true); } }, FHRUIStyle::Success(), 160.f) ]
							+ SHorizontalBox::Slot().AutoWidth()
							[ HRWidgets::Button(HRText("Negotiation.Reject"), [WeakPC]() { if (WeakPC.IsValid()) { WeakPC->ServerRespondDeal(false); } }, FHRUIStyle::Alarm(), 160.f) ]
						]
					]
				]
				+ SVerticalBox::Slot().AutoHeight()[ Deals ]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 16.f, 0.f, 0.f)
				[ HRWidgets::Button(HRText("Menu.Close"), [WeakPC]() { if (WeakPC.IsValid() && WeakPC->GetHRHUD()) { WeakPC->GetHRHUD()->ToggleNegotiation(); } }) ],
				true)
		]
	];
}

// ============================================================================ Scoreboard / summary

AHRGameState* SHRScoreboard::GetGS() const { return GSFrom(PC); }

void SHRScoreboard::Construct(const FArguments& InArgs)
{
	PC = InArgs._PlayerController;
	TWeakObjectPtr<AHRPlayerController> WeakPC = PC;

	ChildSlot
	[
		SNew(SBox).WidthOverride(1000.f)
		[
			HRWidgets::Panel(
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center)
				[
					SNew(STextBlock)
					.Font(FHRUIStyle::Font(34, true))
					.Text_Lambda([this]()
					{
						const AHRGameState* GS = GetGS();
						if (!GS || GS->Phase != EHRMatchPhase::Ended) { return HRText("Score.Title"); }
						return GS->Winner == EHRMatchWinner::Police ? HRText("Result.PoliceWin") : (GS->Winner == EHRMatchWinner::Robbers ? HRText("Result.RobbersWin") : HRText("Result.Draw"));
					})
					.ColorAndOpacity_Lambda([this]()
					{
						const AHRGameState* GS = GetGS();
						return FSlateColor(GS && GS->Phase == EHRMatchPhase::Ended ? FHRUIStyle::TeamColor(GS->Winner == EHRMatchWinner::Police ? EHRTeam::Police : (GS->Winner == EHRMatchWinner::Robbers ? EHRTeam::Robbers : EHRTeam::None)) : FHRUIStyle::Ink());
					})
				]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 4.f, 0.f, 14.f)
				[
					HRWidgets::Label(TAttribute<FText>::CreateLambda([this]()
					{
						const AHRGameState* GS = GetGS();
						if (!GS) { return FText::GetEmpty(); }
						const FText Loot = FText::Format(HRText("Result.LootLine"), FHRUIStyle::FormatMoney(GS->SecuredLootValue), FHRUIStyle::FormatMoney(GS->TargetLootValue), FHRUIStyle::FormatMoney(GS->RecoveredLootValue));
						if (GS->Phase != EHRMatchPhase::Ended) { return Loot; }
						const FText Reason = FHRLocalization::Get().Text(FName(*FString::Printf(TEXT("Reason.%d"), static_cast<int32>(GS->EndReason))));
						return FText::Format(FText::FromString(TEXT("{0}\n{1}")), Reason, Loot);
					}), 16, FHRUIStyle::Muted())
				]
				+ SVerticalBox::Slot().AutoHeight()
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().FillWidth(0.34f)[ HRWidgets::Label(HRText("Score.Player"), 13, FHRUIStyle::Muted(), true) ]
					+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(HRText("Score.Score"), 13, FHRUIStyle::Muted(), true) ]
					+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(HRText("Score.Takedowns"), 13, FHRUIStyle::Muted(), true) ]
					+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(HRText("Score.Arrests"), 13, FHRUIStyle::Muted(), true) ]
					+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(HRText("Score.Loot"), 13, FHRUIStyle::Muted(), true) ]
					+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(HRText("Score.Hostages"), 13, FHRUIStyle::Muted(), true) ]
					+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(HRText("Score.Ping"), 13, FHRUIStyle::Muted(), true) ]
				]
				+ SVerticalBox::Slot().AutoHeight().MaxHeight(420.f).Padding(0.f, 6.f)
				[ SNew(SScrollBox) + SScrollBox::Slot()[ SAssignNew(Rows, SVerticalBox) ] ]
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 16.f, 0.f, 0.f)
				[
					SNew(SHorizontalBox)
					.Visibility_Lambda([this]() { const AHRGameState* GS = GetGS(); return GS && GS->Phase == EHRMatchPhase::Ended ? EVisibility::Visible : EVisibility::Collapsed; })
					+ SHorizontalBox::Slot().AutoWidth().Padding(8.f, 0.f)
					[
						HRWidgets::Button(TAttribute<FText>::CreateLambda([WeakPC]()
						{
							const AHRPlayerState* PS = WeakPC.IsValid() ? WeakPC->GetPlayerState<AHRPlayerState>() : nullptr;
							return PS && PS->HasVotedRematch() ? HRText("Result.Voted") : HRText("Result.Rematch");
						}), [WeakPC]() { if (WeakPC.IsValid()) { WeakPC->ServerVoteRematch(); } }, FHRUIStyle::Success(), 240.f)
					]
					+ SHorizontalBox::Slot().AutoWidth().Padding(8.f, 0.f)
					[
						HRWidgets::Button(HRText("Menu.Leave"), [WeakPC]()
						{
							if (!WeakPC.IsValid()) { return; }
							if (UHRSessionSubsystem* S = WeakPC->GetGameInstance()->GetSubsystem<UHRSessionSubsystem>()) { S->LeaveSession(); }
							WeakPC->ClientReturnToMainMenuWithTextReason(FText::GetEmpty());
						}, FHRUIStyle::Alarm(), 240.f)
					]
				],
				true)
		]
	];
	Rebuild();
}

void SHRScoreboard::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	RebuildTimer -= InDeltaTime;
	if (RebuildTimer <= 0.f) { RebuildTimer = 0.5f; Rebuild(); }
}

void SHRScoreboard::Rebuild()
{
	if (!Rows.IsValid()) { return; }
	Rows->ClearChildren();
	const AHRGameState* GS = GetGS();
	if (!GS) { return; }
	TArray<AHRPlayerState*> Sorted;
	for (APlayerState* Raw : GS->PlayerArray) { if (AHRPlayerState* PS = Cast<AHRPlayerState>(Raw)) { if (PS->GetTeam() != EHRTeam::None) { Sorted.Add(PS); } } }
	Sorted.Sort([](const AHRPlayerState& A, const AHRPlayerState& B)
	{
		if (A.GetTeam() != B.GetTeam()) { return A.GetTeam() < B.GetTeam(); }
		return A.GetStats().Score > B.GetStats().Score;
	});
	for (const AHRPlayerState* PS : Sorted)
	{
		const FHRPlayerStats& S = PS->GetStats();
		FString Status;
		if (PS->IsArrested()) { Status = HRText("Score.StatusArrested").ToString(); }
		else if (PS->HasEscaped()) { Status = HRText("Score.StatusEscaped").ToString(); }
		const FText Name = FText::FromString(Status.IsEmpty() ? PS->GetPlayerName() : FString::Printf(TEXT("%s  (%s)"), *PS->GetPlayerName(), *Status));
		const int32 Loot = PS->GetTeam() == EHRTeam::Police ? S.LootRecovered : S.LootSecured;
		const int32 Hostages = PS->GetTeam() == EHRTeam::Police ? S.HostagesRescued : S.HostagesTaken;
		Rows->AddSlot().AutoHeight().Padding(0.f, 3.f)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(0.34f)[ HRWidgets::Label(Name, 15, FHRUIStyle::TeamColor(PS->GetTeam()), true) ]
			+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(FText::AsNumber(S.Score), 15) ]
			+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(FText::AsNumber(S.Takedowns), 15) ]
			+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(FText::AsNumber(S.Arrests), 15) ]
			+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(FHRUIStyle::FormatMoney(Loot), 15) ]
			+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(FText::AsNumber(Hostages), 15) ]
			+ SHorizontalBox::Slot().FillWidth(0.11f)[ HRWidgets::Label(FText::AsNumber(FMath::RoundToInt(PS->GetPingInMilliseconds())), 15, FHRUIStyle::Muted()) ]
		];
	}
}

// ============================================================================ Pause menu

void SHRPauseMenu::Construct(const FArguments& InArgs)
{
	PC = InArgs._PlayerController;
	TWeakObjectPtr<AHRPlayerController> WeakPC = PC;
	ChildSlot
	[
		SNew(SBox).WidthOverride(420.f)
		[
			HRWidgets::Panel(
				SNew(SVerticalBox)
				+ SVerticalBox::Slot().AutoHeight().HAlign(HAlign_Center).Padding(0.f, 0.f, 0.f, 18.f)
				[ HRWidgets::Label(HRText("Menu.Title"), 28, FHRUIStyle::Ink(), true) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.Resume"), [WeakPC]() { if (WeakPC.IsValid() && WeakPC->GetHRHUD()) { WeakPC->GetHRHUD()->CloseAllPanels(); } }, FHRUIStyle::Ink(), 360.f) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.Settings"), [WeakPC]() { if (WeakPC.IsValid() && WeakPC->GetHRHUD()) { WeakPC->GetHRHUD()->OpenSettings(true); } }, FHRUIStyle::Ink(), 360.f) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[
					HRWidgets::Button(HRText("Menu.Leave"), [WeakPC]()
					{
						if (!WeakPC.IsValid()) { return; }
						if (UHRSessionSubsystem* S = WeakPC->GetGameInstance()->GetSubsystem<UHRSessionSubsystem>()) { S->LeaveSession(); }
						WeakPC->ClientReturnToMainMenuWithTextReason(FText::GetEmpty());
					}, FHRUIStyle::Alarm(), 360.f)
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.Quit"), [WeakPC]() { if (WeakPC.IsValid()) { UKismetSystemLibrary::QuitGame(WeakPC.Get(), WeakPC.Get(), EQuitPreference::Quit, false); } }, FHRUIStyle::Muted(), 360.f) ],
				true)
		]
	];
}
