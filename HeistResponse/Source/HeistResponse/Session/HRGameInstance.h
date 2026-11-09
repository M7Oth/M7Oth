#pragma once

#include "CoreMinimal.h"
#include "Engine/GameInstance.h"
#include "HRGameInstance.generated.h"

/** Applies saved user settings at startup and turns network/travel failures into UI errors. */
UCLASS()
class HEISTRESPONSE_API UHRGameInstance : public UGameInstance
{
	GENERATED_BODY()

public:
	virtual void Init() override;

	/** Last error to show on the main menu (consumed by the menu). */
	FText ConsumePendingError();

private:
	void HandleNetworkFailure(UWorld* World, UNetDriver* NetDriver, ENetworkFailure::Type FailureType, const FString& ErrorString);
	void HandleTravelFailure(UWorld* World, ETravelFailure::Type FailureType, const FString& ErrorString);

	FText PendingError;
};
