#include "Combat/HRHealthComponent.h"
#include "Net/UnrealNetwork.h"
#include "Engine/World.h"
#include "GameFramework/GameStateBase.h"

UHRHealthComponent::UHRHealthComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.1f;
	SetIsReplicatedByDefault(true);
}

void UHRHealthComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(UHRHealthComponent, Health);
	DOREPLIFETIME(UHRHealthComponent, LifeState);
	DOREPLIFETIME(UHRHealthComponent, BleedoutEndServerTime);
}

static float HRServerNow(const UWorld* World)
{
	const AGameStateBase* GS = World ? World->GetGameState() : nullptr;
	return GS ? static_cast<float>(GS->GetServerWorldTimeSeconds()) : (World ? World->GetTimeSeconds() : 0.f);
}

float UHRHealthComponent::ApplyDamage(float Amount, AController* InstigatedBy)
{
	if (!GetOwner() || !GetOwner()->HasAuthority() || Amount <= 0.f || LifeState == EHRLifeState::Incapacitated) { return 0.f; }
	LastDamageInstigator = InstigatedBy;
	LastDamageTime = GetWorld()->GetTimeSeconds();

	if (LifeState == EHRLifeState::Downed)
	{
		// Shooting a downed player shortens bleed-out instead of instantly finishing them.
		BleedoutEndServerTime -= Amount * 0.25f;
		OnDamaged.Broadcast(Amount);
		return Amount;
	}

	const float Old = Health;
	Health = FMath::Clamp(Health - Amount, 0.f, MaxHealth);
	OnDamaged.Broadcast(Old - Health);
	if (Health <= 0.f)
	{
		BleedoutEndServerTime = HRServerNow(GetWorld()) + BleedoutSeconds;
		SetLifeState(EHRLifeState::Downed);
	}
	return Old - Health;
}

void UHRHealthComponent::Revive(float HealthFraction)
{
	if (!GetOwner() || !GetOwner()->HasAuthority() || LifeState != EHRLifeState::Downed) { return; }
	Health = MaxHealth * FMath::Clamp(HealthFraction, 0.05f, 1.f);
	SetLifeState(EHRLifeState::Alive);
}

void UHRHealthComponent::ResetToFull()
{
	if (!GetOwner() || !GetOwner()->HasAuthority()) { return; }
	Health = MaxHealth;
	SetLifeState(EHRLifeState::Alive);
}

void UHRHealthComponent::ForceIncapacitate()
{
	if (!GetOwner() || !GetOwner()->HasAuthority()) { return; }
	Health = 0.f;
	SetLifeState(EHRLifeState::Incapacitated);
}

void UHRHealthComponent::SetLifeState(EHRLifeState NewState)
{
	if (NewState == LifeState) { return; }
	const EHRLifeState Old = LifeState;
	LifeState = NewState;
	OnLifeStateChanged.Broadcast(Old, NewState);
}

void UHRHealthComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (!GetOwner() || !GetOwner()->HasAuthority()) { return; }

	if (LifeState == EHRLifeState::Downed && HRServerNow(GetWorld()) >= BleedoutEndServerTime)
	{
		SetLifeState(EHRLifeState::Incapacitated);
		return;
	}
	if (LifeState == EHRLifeState::Alive && Health < MaxHealth * RegenCapFraction && GetWorld()->GetTimeSeconds() - LastDamageTime > RegenDelay)
	{
		Health = FMath::Min(MaxHealth * RegenCapFraction, Health + RegenPerSecond * DeltaTime);
	}
}

void UHRHealthComponent::OnRep_LifeState(EHRLifeState OldState)
{
	OnLifeStateChanged.Broadcast(OldState, LifeState);
}

void UHRHealthComponent::OnRep_Health(float OldHealth)
{
	if (Health < OldHealth) { OnDamaged.Broadcast(OldHealth - Health); }
}
