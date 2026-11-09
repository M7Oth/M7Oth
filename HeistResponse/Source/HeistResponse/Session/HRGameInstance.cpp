#include "Session/HRGameInstance.h"
#include "Core/HRGameUserSettings.h"
#include "Core/HRLocalization.h"
#include "HeistResponse.h"
#include "Engine/Engine.h"

void UHRGameInstance::Init()
{
	Super::Init();
	if (UHRGameUserSettings* S = UHRGameUserSettings::Get())
	{
		S->LoadSettings();
		FHRLocalization::Get().SetLanguage(S->Language);
		S->ApplySettings(false);
	}
	if (GEngine)
	{
		GEngine->OnNetworkFailure().AddUObject(this, &UHRGameInstance::HandleNetworkFailure);
		GEngine->OnTravelFailure().AddUObject(this, &UHRGameInstance::HandleTravelFailure);
	}
}

FText UHRGameInstance::ConsumePendingError()
{
	FText Out = PendingError;
	PendingError = FText::GetEmpty();
	return Out;
}

void UHRGameInstance::HandleNetworkFailure(UWorld* World, UNetDriver* NetDriver, ENetworkFailure::Type FailureType, const FString& ErrorString)
{
	UE_LOG(LogHeist, Warning, TEXT("Network failure %d: %s"), static_cast<int32>(FailureType), *ErrorString);
	PendingError = (FailureType == ENetworkFailure::ConnectionLost || FailureType == ENetworkFailure::ConnectionTimeout)
		? HRText("Error.ConnectionLost") : HRText("Error.NetworkGeneric");
}

void UHRGameInstance::HandleTravelFailure(UWorld* World, ETravelFailure::Type FailureType, const FString& ErrorString)
{
	UE_LOG(LogHeist, Warning, TEXT("Travel failure %d: %s"), static_cast<int32>(FailureType), *ErrorString);
	PendingError = HRText("Error.TravelFailed");
}
