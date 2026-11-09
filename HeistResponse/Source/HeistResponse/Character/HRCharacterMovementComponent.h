#pragma once

#include "CoreMinimal.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "HRCharacterMovementComponent.generated.h"

/**
 * Network-predicted sprint and aim. Both are sent as compressed move flags so changing speed never
 * causes server corrections. Other speed modifiers (money bag, surrender, downed) are server-driven
 * replicated states read in GetMaxSpeed.
 */
UCLASS()
class HEISTRESPONSE_API UHRCharacterMovementComponent : public UCharacterMovementComponent
{
	GENERATED_BODY()

public:
	UHRCharacterMovementComponent();

	virtual float GetMaxSpeed() const override;
	virtual void UpdateFromCompressedFlags(uint8 Flags) override;
	virtual FNetworkPredictionData_Client* GetPredictionData_Client() const override;

	UPROPERTY(EditDefaultsOnly, Category = "Speeds") float WalkSpeed = 380.f;
	UPROPERTY(EditDefaultsOnly, Category = "Speeds") float SprintSpeed = 620.f;
	UPROPERTY(EditDefaultsOnly, Category = "Speeds") float AimSpeed = 260.f;
	UPROPERTY(EditDefaultsOnly, Category = "Speeds") float BagCarrySpeed = 300.f;
	UPROPERTY(EditDefaultsOnly, Category = "Speeds") float SurrenderSpeed = 140.f;
	UPROPERTY(EditDefaultsOnly, Category = "Speeds") float DownedSpeed = 90.f;

	bool bWantsToSprint = false;
	bool bWantsToAim = false;

	bool IsSprinting() const;
};

class FSavedMove_HR : public FSavedMove_Character
{
public:
	typedef FSavedMove_Character Super;

	uint8 bSavedWantsToSprint : 1;
	uint8 bSavedWantsToAim : 1;

	FSavedMove_HR() : bSavedWantsToSprint(0), bSavedWantsToAim(0) {}

	virtual void Clear() override;
	virtual uint8 GetCompressedFlags() const override;
	virtual bool CanCombineWith(const FSavedMovePtr& NewMove, ACharacter* InCharacter, float MaxDelta) const override;
	virtual void SetMoveFor(ACharacter* C, float InDeltaTime, FVector const& NewAccel, FNetworkPredictionData_Client_Character& ClientData) override;
	virtual void PrepMoveFor(ACharacter* C) override;
};

class FNetworkPredictionData_Client_HR : public FNetworkPredictionData_Client_Character
{
public:
	typedef FNetworkPredictionData_Client_Character Super;
	explicit FNetworkPredictionData_Client_HR(const UCharacterMovementComponent& ClientMovement) : Super(ClientMovement) {}
	virtual FSavedMovePtr AllocateNewMove() override { return FSavedMovePtr(new FSavedMove_HR()); }
};
