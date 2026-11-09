#include "Menu/HRMenuGameMode.h"
#include "UI/SHRMainMenu.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Widgets/SWeakWidget.h"

AHRMenuGameMode::AHRMenuGameMode()
{
	DefaultPawnClass = nullptr;
	PlayerControllerClass = AHRMenuPlayerController::StaticClass();
	HUDClass = nullptr;
}

void AHRMenuPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (!IsLocalController() || !GEngine || !GEngine->GameViewport) { return; }
	SAssignNew(Menu, SHRMainMenu).OwningWorld(GetWorld());
	Container = SNew(SWeakWidget).PossiblyNullContent(Menu);
	GEngine->GameViewport->AddViewportWidgetContent(Container.ToSharedRef(), 20);
	FInputModeUIOnly Mode;
	Mode.SetWidgetToFocus(Menu);
	Mode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	SetInputMode(Mode);
	bShowMouseCursor = true;
}

void AHRMenuPlayerController::EndPlay(const EEndPlayReason::Type Reason)
{
	if (Container.IsValid() && GEngine && GEngine->GameViewport) { GEngine->GameViewport->RemoveViewportWidgetContent(Container.ToSharedRef()); }
	Container.Reset();
	Menu.Reset();
	Super::EndPlay(Reason);
}
