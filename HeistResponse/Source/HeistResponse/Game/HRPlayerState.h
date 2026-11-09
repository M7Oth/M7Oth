#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerState.h"
#include "Core/HRTypes.h"
#include "HRPlayerState.generated.h"

USTRUCT(BlueprintType)
struct FHRPlayerStats
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) int32 Takedowns = 0;
	UPROPERTY(BlueprintReadOnly) int32 Arrests = 0;
	UPROPERTY(BlueprintReadOnly) int32 Revives = 0;
	UPROPERTY(BlueprintReadOnly) int32 TimesDowned = 0;
	UPROPERTY(BlueprintReadOnly) int32 LootSecured = 0;
	UPROPERTY(BlueprintReadOnly) int32 LootRecovered = 0;
	UPROPERTY(BlueprintReadOnly) int32 HostagesTaken = 0;
	UPROPERTY(BlueprintReadOnly) int32 HostagesRescued = 0;
	UPROPERTY(BlueprintReadOnly) int32 LocksPicked = 0;
	UPROPERTY(BlueprintReadOnly) int32 Score = 0;
};

/**
 * Per-player match state. Survives disconnects: AGameMode keeps inactive PlayerStates and
 * CopyProperties/OverrideWith restore team, arrest/escape status and stats on reconnect.
 */
UCLASS()
class HEISTRESPONSE_API AHRPlayerState : public APlayerState
{
	GENERATED_BODY()

public:
	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;
	virtual void CopyProperties(APlayerState* PlayerState) override;
	virtual void OverrideWith(APlayerState* PlayerState) override;

	UFUNCTION(BlueprintPure) EHRTeam GetTeam() const { return Team; }
	UFUNCTION(BlueprintPure) bool IsArrested() const { return bArrested; }
	UFUNCTION(BlueprintPure) bool HasEscaped() const { return bEscaped; }
	UFUNCTION(BlueprintPure) bool IsReady() const { return bReady; }
	bool HasVotedRematch() const { return bVotedRematch; }
	const FHRPlayerStats& GetStats() const { return Stats; }

	// Server setters
	void SetTeam(EHRTeam InTeam) { Team = InTeam; }
	void SetArrested(bool b) { bArrested = b; }
	void SetEscaped(bool b) { bEscaped = b; }
	void SetReady(bool b) { bReady = b; }
	void SetVotedRematch(bool b) { bVotedRematch = b; }
	FHRPlayerStats& MutableStats() { return Stats; }
	void AddScore(int32 Points) { Stats.Score += Points; SetScore(static_cast<float>(Stats.Score)); }

	/** Team requested in the lobby / URL (?Team=Police). */
	EHRTeam PreferredTeam = EHRTeam::None;

private:
	UPROPERTY(Replicated) EHRTeam Team = EHRTeam::None;
	UPROPERTY(Replicated) bool bArrested = false;
	UPROPERTY(Replicated) bool bEscaped = false;
	UPROPERTY(Replicated) bool bReady = false;
	UPROPERTY(Replicated) bool bVotedRematch = false;
	UPROPERTY(Replicated) FHRPlayerStats Stats;
};
