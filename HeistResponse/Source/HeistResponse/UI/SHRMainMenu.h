#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"

class SVerticalBox;
class SEditableTextBox;
class UHRSessionSubsystem;

/**
 * Main menu: Quick Play, host public/private room, join by code, server browser, training
 * (solo practice on a local listen server), settings, quit. Shows live session status and any
 * network/travel error carried over from the previous match.
 */
class HEISTRESPONSE_API SHRMainMenu : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SHRMainMenu) {}
		SLATE_ARGUMENT(TWeakObjectPtr<UWorld>, OwningWorld)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);
	virtual ~SHRMainMenu() override;

private:
	enum class EPage : uint8 { Home, Browser, Settings };

	UHRSessionSubsystem* Sessions() const;
	void RebuildBrowser();
	void SetStatus(const FText& Text, bool bError);
	void StartTraining();

	TWeakObjectPtr<UWorld> World;
	EPage Page = EPage::Home;
	TSharedPtr<SVerticalBox> BrowserRows;
	TSharedPtr<SEditableTextBox> CodeBox;
	TSharedPtr<SEditableTextBox> NameBox;
	FText Status;
	bool bStatusIsError = false;
	FDelegateHandle UpdatedHandle, ErrorHandle;
};
