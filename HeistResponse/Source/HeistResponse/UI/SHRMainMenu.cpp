#include "UI/SHRMainMenu.h"
#include "UI/HRWidgetHelpers.h"
#include "UI/SHRSettingsPanel.h"
#include "Session/HRSessionSubsystem.h"
#include "Session/HRGameInstance.h"
#include "Core/HRGameUserSettings.h"
#include "Core/HRLocalization.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Images/SImage.h"
#include "Kismet/GameplayStatics.h"
#include "Kismet/KismetSystemLibrary.h"
#include "Engine/World.h"

UHRSessionSubsystem* SHRMainMenu::Sessions() const
{
	UGameInstance* GI = World.IsValid() ? World->GetGameInstance() : nullptr;
	return GI ? GI->GetSubsystem<UHRSessionSubsystem>() : nullptr;
}

SHRMainMenu::~SHRMainMenu()
{
	if (UHRSessionSubsystem* S = Sessions())
	{
		S->OnSessionsUpdated.Remove(UpdatedHandle);
		S->OnSessionError.Remove(ErrorHandle);
	}
}

void SHRMainMenu::SetStatus(const FText& Text, bool bError)
{
	Status = Text;
	bStatusIsError = bError;
}

void SHRMainMenu::StartTraining()
{
	if (!World.IsValid()) { return; }
	const UHRSessionSubsystem* S = Sessions();
	const FString Map = S ? S->MatchMap : TEXT("/Game/HeistResponse/Maps/L_District");
	UGameplayStatics::OpenLevel(World.Get(), FName(*Map), true, FString(TEXT("listen?Solo?ShortMatch")) + UHRSessionSubsystem::GetTravelOptions());
}

void SHRMainMenu::Construct(const FArguments& InArgs)
{
	World = InArgs._OwningWorld;
	if (UHRSessionSubsystem* S = Sessions())
	{
		UpdatedHandle = S->OnSessionsUpdated.AddSP(this, &SHRMainMenu::RebuildBrowser);
		ErrorHandle = S->OnSessionError.AddLambda([this](const FText& Msg) { SetStatus(Msg, true); });
	}
	if (World.IsValid())
	{
		if (UHRGameInstance* GI = Cast<UHRGameInstance>(World->GetGameInstance()))
		{
			const FText Err = GI->ConsumePendingError();
			if (!Err.IsEmpty()) { SetStatus(Err, true); }
		}
	}

	auto PageVis = [this](EPage P) { return TAttribute<EVisibility>::CreateLambda([this, P]() { return Page == P ? EVisibility::Visible : EVisibility::Collapsed; }); };
	auto Busy = [this]() { const UHRSessionSubsystem* S = Sessions(); return !S || S->GetCurrentOp() == EHRSessionOp::None; };
	const FString SavedName = UHRGameUserSettings::Get() ? UHRGameUserSettings::Get()->PlayerDisplayName : FString();

	ChildSlot
	[
		SNew(SOverlay)
		.FlowDirectionPreference(FHRUIStyle::Flow())
		+ SOverlay::Slot()
		[
			// Dark cinematic gradient backdrop (the menu level's camera shows the city behind it).
			SNew(SImage).Image(FHRUIStyle::WhiteBrush()).ColorAndOpacity(FLinearColor(0.f, 0.f, 0.f, 0.55f))
		]
		+ SOverlay::Slot().HAlign(HAlign_Left).VAlign(VAlign_Center).Padding(FMargin(90.f, 0.f))
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight()
			[ HRWidgets::Label(HRText("Game.Title"), 64, FHRUIStyle::Ink(), true) ]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 34.f)
			[ HRWidgets::Label(HRText("Game.Subtitle"), 20, FHRUIStyle::Muted()) ]

			// ---------------------------------------------------------------- Home
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SVerticalBox).Visibility(PageVis(EPage::Home))
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 0.f, 0.f, 14.f)
				[
					SNew(SBox).WidthOverride(380.f)
					[
						SAssignNew(NameBox, SEditableTextBox)
						.Text(FText::FromString(SavedName))
						.HintText(HRText("Menu.NameHint"))
						.Font(FHRUIStyle::Font(16))
						.OnTextCommitted_Lambda([](const FText& T, ETextCommit::Type)
						{
							if (UHRGameUserSettings* S = UHRGameUserSettings::Get()) { S->PlayerDisplayName = T.ToString().Left(20); S->SaveSettings(); }
						})
					]
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.QuickPlay"), [this]() { if (UHRSessionSubsystem* S = Sessions()) { SetStatus(HRText("Menu.Searching"), false); S->QuickPlay(); } }, FHRUIStyle::Success(), 380.f, TAttribute<bool>::CreateLambda(Busy)) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.HostPublic"), [this]() { if (UHRSessionSubsystem* S = Sessions()) { SetStatus(HRText("Menu.Creating"), false); S->HostSession(false); } }, FHRUIStyle::Ink(), 380.f, TAttribute<bool>::CreateLambda(Busy)) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.HostPrivate"), [this]() { if (UHRSessionSubsystem* S = Sessions()) { SetStatus(HRText("Menu.Creating"), false); S->HostSession(true); } }, FHRUIStyle::Ink(), 380.f, TAttribute<bool>::CreateLambda(Busy)) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[
					SNew(SHorizontalBox)
					+ SHorizontalBox::Slot().AutoWidth()
					[
						SNew(SBox).WidthOverride(200.f)
						[ SAssignNew(CodeBox, SEditableTextBox).HintText(HRText("Menu.CodeHint")).Font(FHRUIStyle::Font(16, true)) ]
					]
					+ SHorizontalBox::Slot().AutoWidth().Padding(10.f, 0.f, 0.f, 0.f)
					[
						HRWidgets::Button(HRText("Menu.JoinCode"), [this]()
						{
							if (UHRSessionSubsystem* S = Sessions()) { SetStatus(HRText("Menu.Searching"), false); S->JoinByCode(CodeBox->GetText().ToString()); }
						}, FHRUIStyle::Ink(), 170.f, TAttribute<bool>::CreateLambda(Busy))
					]
				]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.Browse"), [this]() { Page = EPage::Browser; if (UHRSessionSubsystem* S = Sessions()) { S->RefreshBrowser(); } }, FHRUIStyle::Ink(), 380.f) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.Training"), [this]() { StartTraining(); }, FHRUIStyle::Warning(), 380.f) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.Settings"), [this]() { Page = EPage::Settings; }, FHRUIStyle::Ink(), 380.f) ]
				+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 5.f)
				[ HRWidgets::Button(HRText("Menu.Quit"), [this]() { if (World.IsValid()) { UKismetSystemLibrary::QuitGame(World.Get(), nullptr, EQuitPreference::Quit, false); } }, FHRUIStyle::Muted(), 380.f) ]
			]

			// ---------------------------------------------------------------- Browser
			+ SVerticalBox::Slot().AutoHeight()
			[
				SNew(SBox).Visibility(PageVis(EPage::Browser)).WidthOverride(760.f)
				[
					HRWidgets::Panel(
						SNew(SVerticalBox)
						+ SVerticalBox::Slot().AutoHeight()[ HRWidgets::Label(HRText("Menu.Browse"), 24, FHRUIStyle::Ink(), true) ]
						+ SVerticalBox::Slot().AutoHeight().MaxHeight(420.f).Padding(0.f, 10.f)
						[ SNew(SScrollBox) + SScrollBox::Slot()[ SAssignNew(BrowserRows, SVerticalBox) ] ]
						+ SVerticalBox::Slot().AutoHeight()
						[
							SNew(SHorizontalBox)
							+ SHorizontalBox::Slot().AutoWidth().Padding(0.f, 0.f, 10.f, 0.f)
							[ HRWidgets::Button(HRText("Menu.Refresh"), [this]() { if (UHRSessionSubsystem* S = Sessions()) { S->RefreshBrowser(); } }, FHRUIStyle::Ink(), 180.f, TAttribute<bool>::CreateLambda(Busy)) ]
							+ SHorizontalBox::Slot().AutoWidth()
							[ HRWidgets::Button(HRText("Menu.Back"), [this]() { Page = EPage::Home; if (UHRSessionSubsystem* S = Sessions()) { S->CancelOperation(); } }, FHRUIStyle::Muted(), 180.f) ]
						],
						true)
				]
			]

			// ---------------------------------------------------------------- Status line
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 20.f, 0.f, 0.f)
			[
				SNew(STextBlock)
				.Font(FHRUIStyle::Font(15, true))
				.Text_Lambda([this]() { return Status; })
				.ColorAndOpacity_Lambda([this]() { return FSlateColor(bStatusIsError ? FHRUIStyle::Alarm() : FHRUIStyle::Muted()); })
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0.f, 6.f, 0.f, 0.f)
			[
				HRWidgets::Label(TAttribute<FText>::CreateLambda([this]()
				{
					const UHRSessionSubsystem* S = Sessions();
					return FText::Format(HRText("Menu.OnlineService"), FText::FromString(S ? S->GetSubsystemName() : TEXT("-")));
				}), 12, FHRUIStyle::Muted())
			]
		]

		// ---------------------------------------------------------------- Settings
		+ SOverlay::Slot().HAlign(HAlign_Center).VAlign(VAlign_Center)
		[
			SNew(SBox).Visibility(PageVis(EPage::Settings))
			[ SNew(SHRSettingsPanel).OnClose_Lambda([this]() { Page = EPage::Home; }) ]
		]
	];
	RebuildBrowser();
}

void SHRMainMenu::RebuildBrowser()
{
	if (!BrowserRows.IsValid()) { return; }
	BrowserRows->ClearChildren();
	const UHRSessionSubsystem* S = Sessions();
	if (!S || S->GetRows().Num() == 0)
	{
		BrowserRows->AddSlot().AutoHeight()[ HRWidgets::Label(HRText("Menu.NoServers"), 15, FHRUIStyle::Muted()) ];
		return;
	}
	for (int32 i = 0; i < S->GetRows().Num(); ++i)
	{
		const FHRSessionRow& R = S->GetRows()[i];
		BrowserRows->AddSlot().AutoHeight().Padding(0.f, 3.f)
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().FillWidth(0.5f).VAlign(VAlign_Center)[ HRWidgets::Label(FText::FromString(R.HostName), 16, FHRUIStyle::Ink(), true) ]
			+ SHorizontalBox::Slot().FillWidth(0.2f).VAlign(VAlign_Center)[ HRWidgets::Label(FText::FromString(FString::Printf(TEXT("%d / %d"), R.Players, R.MaxPlayers)), 15) ]
			+ SHorizontalBox::Slot().FillWidth(0.15f).VAlign(VAlign_Center)[ HRWidgets::Label(FText::FromString(FString::Printf(TEXT("%d ms"), R.PingMs)), 15, FHRUIStyle::Muted()) ]
			+ SHorizontalBox::Slot().AutoWidth()
			[ HRWidgets::Button(HRText("Menu.Join"), [this, i]() { if (UHRSessionSubsystem* Sub = Sessions()) { SetStatus(HRText("Menu.Joining"), false); Sub->JoinBrowserRow(i); } }, FHRUIStyle::Success(), 120.f) ]
		];
	}
}
