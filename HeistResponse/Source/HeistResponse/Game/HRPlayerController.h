#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "Core/HRTypes.h"
#include "HRPlayerController.generated.h"

class UHRInputConfig;
class AHRHUD;
class AHRSecurityCamera;

USTRUCT()
struct FHRPing
{
	GENERATED_BODY()
	UPROPERTY() FVector Location = FVector::ZeroVector;
	UPROPERTY() FString From;
	UPROPERTY() float ExpireTime = 0.f;
};

/**
 * Owns local input setup (runtime-built Enhanced Input contexts), and is the single RPC gateway for
 * lobby, negotiation, pings, CCTV and spectating. All Server RPCs validate and forward to the
 * GameMode, which is the only authority that changes match state.
 */
UCLASS()
class HEISTRESPONSE_API AHRPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AHRPlayerController();

	virtual void BeginPlay() override;
	virtual void SetupInputComponent() override;
	virtual void OnPossess(APawn* InPawn) override;
	virtual void AcknowledgePossession(APawn* P) override;
	virtual void PlayerTick(float DeltaTime) override;

	UHRInputConfig* GetInputConfig();
	void ApplyInputContextsFor(APawn* InPawn);
	void ApplyUserSettings();

	// Lobby / match --------------------------------------------------------------
	UFUNCTION(Server, Reliable) void ServerSelectTeam(EHRTeam Team);
	UFUNCTION(Server, Reliable) void ServerSetReady(bool bReady);
	UFUNCTION(Server, Reliable) void ServerVoteRematch();

	// Negotiation ----------------------------------------------------------------
	UFUNCTION(Server, Reliable) void ServerProposeDeal(EHRDealType Deal);
	UFUNCTION(Server, Reliable) void ServerRespondDeal(bool bAccept);

	// Communication -------------------------------------------------------------
	UFUNCTION(Server, Unreliable) void ServerPing(FVector_NetQuantize Location);
	UFUNCTION(Client, Reliable) void ClientReceivePing(FVector_NetQuantize Location, const FString& From);
	UFUNCTION(Client, Reliable) void ClientNotify(FName LocKey, const FString& Arg, EHRNotifyType Type);
	UFUNCTION(Client, Reliable) void ClientOnDispatch(FVector_NetQuantize IncidentLocation);
	UFUNCTION(Client, Reliable) void ClientMatchEnded();

	// CCTV -----------------------------------------------------------------------
	void ServerEnterCCTV();
	UFUNCTION(Server, Reliable) void ServerCCTVCycle(int32 Direction);
	UFUNCTION(Server, Reliable) void ServerExitCCTV();
	bool IsViewingCCTV() const { return bViewingCCTV; }

	const TArray<FHRPing>& GetPings() const { return Pings; }
	bool HasDispatchMarker() const { return bHasDispatch; }
	FVector GetDispatchLocation() const { return DispatchLocation; }

	AHRHUD* GetHRHUD() const;

private:
	void InputMenu();
	void InputScoreboardStart();
	void InputScoreboardStop();
	void InputNegotiate();
	void InputPing();
	void InputSpectateNext();
	void InputSpectatePrev();
	void ApplyLobbyCamera();

	UFUNCTION(Client, Reliable) void ClientSetCCTV(bool bOn);

	UPROPERTY(Transient) TObjectPtr<UHRInputConfig> InputConfig;
	UPROPERTY() TArray<TObjectPtr<AHRSecurityCamera>> CCTVCameras;

	TArray<FHRPing> Pings;
	bool bHasDispatch = false;
	FVector DispatchLocation = FVector::ZeroVector;
	bool bViewingCCTV = false;
	int32 CCTVIndex = 0;
	float LastPingTime = -10.f;
	float ServerLastPingTime = -10.f;
	bool bLobbyCameraApplied = false;
};
