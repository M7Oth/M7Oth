#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/PlayerController.h"
#include "HRMenuGameMode.generated.h"

class SHRMainMenu;

/** Game mode for L_MainMenu: no pawn, menu controller. */
UCLASS()
class HEISTRESPONSE_API AHRMenuGameMode : public AGameModeBase
{
	GENERATED_BODY()
public:
	AHRMenuGameMode();
};

/** Hosts the main menu Slate widget and frees the cursor. */
UCLASS()
class HEISTRESPONSE_API AHRMenuPlayerController : public APlayerController
{
	GENERATED_BODY()
public:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	TSharedPtr<SHRMainMenu> Menu;
	TSharedPtr<SWidget> Container;
};
