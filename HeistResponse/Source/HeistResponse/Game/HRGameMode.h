#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameMode.h"
#include "Core/HRTypes.h"
#include "Combat/HRWeaponComponent.h"
#include "Rules/LootLedger.h"
#include "Rules/AlarmModel.h"
#include "Rules/NegotiationModel.h"
#include "Rules/MatchRules.h"
#include "HRGameMode.generated.h"

class AHRCharacter;
class AHRPlayerState;
class AHRPlayerController;
class AHRGameState;
class AHRLootBag;
class AHRVehicle;
class AHRVault;
class AHRDoor;
class AHRExtractionZone;
class AHRSecurityCamera;
class AHRNPCCharacter;
class AHRSpikeStrip;
class AHRSmokeCloud;

/**
 * Server-only authority for a HEIST RESPONSE match. Owns the engine-independent rule models
 * (loot ledger, alarm, negotiation, match resolution - all unit-tested in Tests/CoreRules) and
 * translates them into world actions. Clients never call into this directly; every request
 * arrives through a validated server RPC on the PlayerController or a component.
 *
 * Lobby: AGameMode's WaitingToStart state (bDelayedStart) is the pre-match lobby where players pick
 * teams and ready up. Match phases inside InProgress are tracked by EHRMatchPhase on the GameState.
 */
UCLASS(config = Game)
class HEISTRESPONSE_API AHRGameMode : public AGameMode
{
	GENERATED_BODY()

public:
	AHRGameMode();

	// AGameModeBase / AGameMode ------------------------------------------------
	virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
	virtual FString InitNewPlayer(APlayerController* NewPlayerController, const FUniqueNetIdRepl& UniqueId, const FString& Options, const FString& Portal) override;
	virtual void PostLogin(APlayerController* NewPlayer) override;
	virtual void Logout(AController* Exiting) override;
	virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
	virtual UClass* GetDefaultPawnClassForController_Implementation(AController* InController) override;
	virtual bool ReadyToStartMatch_Implementation() override;
	virtual void HandleMatchHasStarted() override;
	virtual void RestartPlayer(AController* NewPlayer) override;
	virtual bool CanSpectate_Implementation(APlayerController* Viewer, APlayerState* ViewTarget) override;
	virtual void Tick(float DeltaSeconds) override;

	// Lobby --------------------------------------------------------------------
	void RequestTeamChange(AHRPlayerController* PC, EHRTeam Desired);
	void SetPlayerReady(AHRPlayerController* PC, bool bReady);
	void VoteRematch(AHRPlayerController* PC);

	// Loot ---------------------------------------------------------------------
	int32 RegisterLootBag(int32 Value);
	int32 RegisterVehicle(AHRVehicle* Vehicle);
	bool GiveLootBagFromSource(AHRCharacter* Robber, int32 LedgerId, const FVector& SpawnLocation);
	void PickUpDroppedBag(AHRCharacter* By, AHRLootBag* Bag);
	void DropBagFrom(AHRCharacter* Carrier, bool bThrow);
	void TrunkAction(AHRCharacter* By, AHRVehicle* Vehicle);
	void OnVehicleWrecked(AHRVehicle* Vehicle);

	// Security / alarm ---------------------------------------------------------
	bool IsAlarmRaised() const { return Alarm.IsRaised(); }
	void AddSuspicion(float Amount, AHRCharacter* Robber, AActor* Source);
	void RaiseAlarm(EHRAlarmReason Reason, const FVector& Location);
	void OnVaultOpened(AHRVault* Vault, AHRCharacter* By);
	void NotifyVaultDrillStarted(AHRCharacter* By);
	void NotifyVaultDrillDisabled(AHRCharacter* By);
	void NotifyGunfire(AHRCharacter* Shooter, const FVector& Location);
	void NotifyNoise(AHRCharacter* Source, const FVector& Location, float Loudness01);
	void NotifyRestrictedAccess(AHRCharacter* Robber, const FVector& Location);
	void NotifyMaskChanged(AHRCharacter* Robber);
	void NotifyShout(AHRCharacter* Shouter);
	void NotifyDoorUnlocked(AHRDoor* Door, AHRCharacter* By);
	void NotifyCameraDestroyed(AHRSecurityCamera* Camera, AController* By);
	void NotifyCamerasLooped(AHRCharacter* By);

	// Combat / arrests --------------------------------------------------------
	bool ShouldApplyDamage(AController* Instigator, AHRCharacter* Victim) const;
	void NotifyDamage(AController* Instigator, AHRCharacter* Victim, float Amount);
	void NotifyPlayerDowned(AHRCharacter* Victim);
	void NotifyPlayerIncapacitated(AHRCharacter* Victim);
	void NotifyRevive(AHRCharacter* Reviver, AHRCharacter* Target);
	void NotifySurrenderChanged(AHRCharacter* Robber);
	void ArrestRobber(AHRCharacter* Robber, AHRCharacter* Officer);
	void UseGadget(AHRCharacter* User);
	FHRWeaponSpec GetWeaponSpecFor(EHRTeam Team) const;

	// Hostages / negotiation ---------------------------------------------------
	void NotifyHostageTaken(AHRNPCCharacter* Hostage, AHRCharacter* By);
	void NotifyHostageFreed(AHRNPCCharacter* Hostage, AHRCharacter* RescuedBy);
	void ProposeDeal(AHRPlayerController* PC, EHRDealType Deal);
	void RespondToDeal(AHRPlayerController* PC, bool bAccept);

	// Extraction ---------------------------------------------------------------
	void OnRobberReachedExtraction(AHRCharacter* Robber, AHRExtractionZone* Zone);
	void OnVehicleReachedExtraction(AHRVehicle* Vehicle, AHRExtractionZone* Zone);

	// Communication ------------------------------------------------------------
	void BroadcastPing(AHRPlayerController* From, const FVector& Location);
	void NotifyTeam(EHRTeam Team, FName LocKey, EHRNotifyType Type, const FString& Arg = FString());
	void NotifyAll(FName LocKey, EHRNotifyType Type, const FString& Arg = FString());

	// Config -------------------------------------------------------------------
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") int32 MaxPlayersPerTeam = 4;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") int32 MinPlayersPerTeam = 1;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float PreparationSeconds = 60.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float MainClockSeconds = 900.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float ResponseClockSeconds = 420.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float MinResponseSeconds = 240.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float TargetLootFraction = 0.5f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float LobbyCountdownSeconds = 10.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float PostMatchSeconds = 25.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float PoliceRespawnSeconds = 15.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float PoliceIntelDelaySeconds = 60.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") int32 ActiveExtractionZones = 2;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") int32 MaxBreakouts = 1;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float TrucePerimeterRadius = 2500.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Match") float TruceWithdrawGraceSeconds = 10.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Alarm") float DispatchDelaySeconds = 12.f;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Alarm") float VaultDispatchDelaySeconds = 6.f;

	UPROPERTY(Config, EditDefaultsOnly, Category = "Classes") TSoftClassPtr<AHRCharacter> CharacterClass;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Classes") TSoftClassPtr<AHRLootBag> LootBagClass;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Classes") TSoftClassPtr<AHRSpikeStrip> SpikeStripClass;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Classes") TSoftClassPtr<AHRSmokeCloud> SmokeCloudClass;
	UPROPERTY(Config, EditDefaultsOnly, Category = "Classes") TSoftClassPtr<AHRVehicle> NegotiatedVehicleClass;

	UPROPERTY(EditDefaultsOnly, Category = "Weapons") FHRWeaponSpec PoliceWeapon;
	UPROPERTY(EditDefaultsOnly, Category = "Weapons") FHRWeaponSpec RobberWeapon;

private:
	AHRGameState* GetHRGameState() const;
	float ServerNow() const;
	void SetPhase(EHRMatchPhase Phase, float Duration);
	void BeginInfiltration();
	void OnAlarmRaisedInternal(EHRAlarmReason Reason);
	void OnPoliceDispatched();
	void RefreshLootState();
	void RefreshNegotiationView();
	void UpdateNegotiationLine();
	void ApplyDealOutcome(const HeistRules::FDealOutcome& Outcome);
	void EnforceTruce();
	void EvaluateMatch(float DeltaSeconds);
	void EndHeist(const HeistRules::FMatchOutcome& Outcome);
	void FinishPostMatch();
	void MarkRobberEscaped(AHRCharacter* Robber);
	void MoveToSpectator(AController* C);
	void ReleaseArrestedRobbers(AHRCharacter* Liberator);
	void DeliverNegotiatedVehicle();
	void TickLobby();
	void AwardScore(AController* C, int32 Points);
	EHRTeam TeamOf(const AController* C) const;
	AHRLootBag* SpawnBagActor(int32 LedgerId, const FVector& Location);
	HeistRules::FMatchSnapshot BuildSnapshot() const;

	HeistRules::FMatchConfig MatchConfig;
	HeistRules::FLootLedger Ledger;
	HeistRules::FAlarmModel Alarm;
	HeistRules::FNegotiationModel Negotiation;

	UPROPERTY() TMap<int32, TObjectPtr<AHRLootBag>> BagActors;
	UPROPERTY() TMap<int32, TObjectPtr<AHRVehicle>> Vehicles;
	UPROPERTY() TArray<TObjectPtr<AHRNPCCharacter>> Hostages;
	TMap<int32, int32> LedgerValue;

	bool bSoloTest = false;
	bool bHeistStarted = false;
	bool bSuspicionReportSent = false;
	bool bPoliceIntelSent = false;
	bool bRobbersSurrendered = false;
	bool bPostMatchDone = false;
	int32 BreakoutsUsed = 0;
	int32 NextVehicleId = 1000;
	float AlarmServerTime = 0.f;
	float PoliceAbsent = 0.f;
	float RobbersAbsent = 0.f;
	float TruceStartServerTime = 0.f;
	float LastSnapshotEval = 0.f;
	FTimerHandle PostMatchTimer;
	FTimerHandle VehicleDeliveryTimer;
	TMap<TWeakObjectPtr<AController>, FTimerHandle> RespawnTimers;
};
