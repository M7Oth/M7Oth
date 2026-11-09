#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Interfaces/OnlineSessionInterface.h"
#include "OnlineSessionSettings.h"
#include "HRSessionSubsystem.generated.h"

USTRUCT(BlueprintType)
struct FHRSessionRow
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly) FString HostName;
	UPROPERTY(BlueprintReadOnly) int32 Players = 0;
	UPROPERTY(BlueprintReadOnly) int32 MaxPlayers = 0;
	UPROPERTY(BlueprintReadOnly) int32 PingMs = 0;
	UPROPERTY(BlueprintReadOnly) bool bInProgress = false;
	int32 SearchIndex = INDEX_NONE;
};

UENUM(BlueprintType)
enum class EHRSessionOp : uint8
{
	None,
	Creating,
	Searching,
	Joining,
	QuickPlaySearching,
};

DECLARE_MULTICAST_DELEGATE(FOnHRSessionsUpdated);
DECLARE_MULTICAST_DELEGATE_OneParam(FOnHRSessionError, const FText& /*Message*/);

/**
 * Online session flow on top of the Online Subsystem (Null for LAN/dev, EOS for production):
 *   QuickPlay       - search public sessions with free slots and matching build; join the best
 *                     one, otherwise host a new public session.
 *   HostPrivate     - advertised but filtered by a 6-character room code (friends type the code;
 *                     platform invites also work where the subsystem supports them).
 *   JoinByCode      - search filtered by HR_ROOMCODE.
 *   Browse          - list public sessions.
 * Version mismatch is prevented with the HR_BUILD setting.
 */
UCLASS()
class HEISTRESPONSE_API UHRSessionSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	void QuickPlay();
	void HostSession(bool bPrivate, int32 MaxPlayers = 8);
	void JoinByCode(const FString& Code);
	void RefreshBrowser();
	void JoinBrowserRow(int32 RowIndex);
	void LeaveSession();
	void CancelOperation();

	const TArray<FHRSessionRow>& GetRows() const { return Rows; }
	EHRSessionOp GetCurrentOp() const { return CurrentOp; }
	const FString& GetRoomCode() const { return RoomCode; }
	FString GetSubsystemName() const;

	/** URL options carried on travel (?Name=...). */
	static FString GetTravelOptions();

	FOnHRSessionsUpdated OnSessionsUpdated;
	FOnHRSessionError OnSessionError;

	/** Map used for matches. */
	UPROPERTY(Config) FString MatchMap = TEXT("/Game/HeistResponse/Maps/L_District");

	static const FName SettingBuild;
	static const FName SettingRoomCode;
	static const FName SettingPrivate;
	static int32 BuildId();

private:
	IOnlineSessionPtr GetSessions() const;
	void StartSearch(int32 MaxResults, const FString& Code, bool bPublicOnly);
	void JoinResult(const FOnlineSessionSearchResult& Result);
	void Fail(const FName LocKey);
	FString MakeRoomCode() const;

	void OnCreateComplete(FName SessionName, bool bOk);
	void OnFindComplete(bool bOk);
	void OnJoinComplete(FName SessionName, EOnJoinSessionCompleteResult::Type Result);
	void OnDestroyComplete(FName SessionName, bool bOk);

	TSharedPtr<FOnlineSessionSearch> Search;
	TArray<FHRSessionRow> Rows;
	EHRSessionOp CurrentOp = EHRSessionOp::None;
	FString RoomCode;
	FString PendingCode;
	bool bPendingPrivate = false;
	int32 PendingMaxPlayers = 8;
	bool bHostAfterDestroy = false;

	FDelegateHandle CreateHandle, FindHandle, JoinHandle, DestroyHandle;
};
