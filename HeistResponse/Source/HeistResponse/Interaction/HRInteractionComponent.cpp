#include "Interaction/HRInteractionComponent.h"
#include "Interaction/HRInteractable.h"
#include "Character/HRCharacter.h"
#include "HeistResponse.h"
#include "Net/UnrealNetwork.h"
#include "Engine/World.h"
#include "GameFramework/GameStateBase.h"
#include "CollisionQueryParams.h"

UHRInteractionComponent::UHRInteractionComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickInterval = 0.f;
	SetIsReplicatedByDefault(true);
}

void UHRInteractionComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME_CONDITION(UHRInteractionComponent, Active, COND_OwnerOnly);
}

AHRCharacter* UHRInteractionComponent::GetCharacter() const
{
	return Cast<AHRCharacter>(GetOwner());
}

float UHRInteractionComponent::GetActiveProgress() const
{
	if (!Active.IsActive()) { return 0.f; }
	const AGameStateBase* GS = GetWorld() ? GetWorld()->GetGameState() : nullptr;
	const float Now = GS ? static_cast<float>(GS->GetServerWorldTimeSeconds()) : 0.f;
	return FMath::Clamp((Now - Active.StartServerTime) / Active.Duration, 0.f, 1.f);
}

bool UHRInteractionComponent::ValidateTarget(AActor* Target, FText* OutReason) const
{
	const AHRCharacter* Ch = GetCharacter();
	if (!Ch || !Target || Target == Ch || !Ch->CanPerformActions()) { return false; }
	const IHRInteractable* I = Cast<IHRInteractable>(Target);
	if (!I) { return false; }

	const FVector Eye = Ch->GetEyeLocation();
	FVector Closest;
	if (const UPrimitiveComponent* Prim = Cast<UPrimitiveComponent>(Target->GetRootComponent()))
	{
		if (Prim->GetClosestPointOnCollision(Eye, Closest) < 0.f) { Closest = Target->GetActorLocation(); }
	}
	else
	{
		Closest = Target->GetActorLocation();
	}
	if (FVector::Dist(Eye, Closest) > I->GetInteractRange() + 30.f) { return false; }

	// Line of sight from the EYES (not the camera) - prevents using things through walls/corners.
	FCollisionQueryParams Params(SCENE_QUERY_STAT(HRInteractLOS), false, Ch);
	Params.AddIgnoredActor(Target);
	FHitResult Hit;
	if (GetWorld()->LineTraceSingleByChannel(Hit, Eye, Closest, ECC_Visibility, Params))
	{
		if (Hit.GetActor() != Target) { return false; }
	}

	FText Reason;
	const bool bOk = I->CanInteract(Ch, Reason);
	if (OutReason) { *OutReason = Reason; }
	return bOk;
}

void UHRInteractionComponent::UpdateFocus()
{
	AHRCharacter* Ch = GetCharacter();
	FocusedActor.Reset();
	bFocusedUsable = false;
	FocusedPrompt = FText::GetEmpty();
	FocusedBlockedReason = FText::GetEmpty();
	if (!Ch || !Ch->CanPerformActions()) { return; }

	FVector ViewLoc;
	FRotator ViewRot;
	Ch->GetActorEyesViewPoint(ViewLoc, ViewRot);
	if (const AController* C = Ch->GetController())
	{
		C->GetPlayerViewPoint(ViewLoc, ViewRot);
	}

	// Sphere trace along the camera ray (comfortable targeting); validation re-checks from the eyes.
	FCollisionQueryParams Params(SCENE_QUERY_STAT(HRInteractFocus), false, Ch);
	const FVector End = ViewLoc + ViewRot.Vector() * FocusTraceDistance;
	FHitResult Hit;
	if (!GetWorld()->SweepSingleByChannel(Hit, ViewLoc, End, FQuat::Identity, ECC_GameTraceChannel1 /*HRInteraction*/, FCollisionShape::MakeSphere(12.f), Params))
	{
		if (!GetWorld()->SweepSingleByChannel(Hit, ViewLoc, End, FQuat::Identity, ECC_Visibility, FCollisionShape::MakeSphere(12.f), Params))
		{
			return;
		}
	}
	AActor* Target = Hit.GetActor();
	const IHRInteractable* I = Cast<IHRInteractable>(Target);
	if (!I) { return; }

	FocusedActor = Target;
	FText Reason;
	bFocusedUsable = ValidateTarget(Target, &Reason);
	FocusedPrompt = I->GetInteractPrompt(Ch);
	FocusedBlockedReason = Reason;
	if (!bFocusedUsable && Reason.IsEmpty())
	{
		// Out of range / no LOS: no prompt at all.
		FocusedActor.Reset();
	}
}

void UHRInteractionComponent::PressInteract()
{
	if (Active.IsActive()) { return; }
	if (AActor* Target = FocusedActor.Get())
	{
		if (bFocusedUsable) { ServerBeginInteract(Target); }
	}
}

void UHRInteractionComponent::ReleaseInteract()
{
	if (Active.IsActive()) { ServerCancelInteract(); }
}

void UHRInteractionComponent::ServerBeginInteract_Implementation(AActor* Target)
{
	if (Active.IsActive()) { return; }
	AHRCharacter* Ch = GetCharacter();
	if (!ValidateTarget(Target, nullptr)) { return; }
	IHRInteractable* I = Cast<IHRInteractable>(Target);
	const float Duration = I->GetInteractDuration(Ch);
	if (Duration <= 0.f)
	{
		I->OnInteractCompleted(Ch);
		return;
	}
	const AGameStateBase* GS = GetWorld()->GetGameState();
	Active.Target = Target;
	Active.Duration = Duration;
	Active.StartServerTime = GS ? static_cast<float>(GS->GetServerWorldTimeSeconds()) : 0.f;
	Active.Prompt = I->GetInteractPrompt(Ch);
	ServerStartLocation = Ch->GetActorLocation();
	I->OnInteractStarted(Ch);
}

void UHRInteractionComponent::ServerCancelInteract_Implementation()
{
	CancelInteraction();
}

void UHRInteractionComponent::CancelInteraction()
{
	if (!GetOwner() || !GetOwner()->HasAuthority() || !Active.IsActive()) { Active = FHRActiveInteraction(); return; }
	if (IHRInteractable* I = Cast<IHRInteractable>(Active.Target.Get()))
	{
		I->OnInteractCancelled(GetCharacter());
	}
	Active = FHRActiveInteraction();
}

void UHRInteractionComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	AHRCharacter* Ch = GetCharacter();
	if (!Ch) { return; }

	if (Ch->IsLocallyControlled())
	{
		UpdateFocus();
	}

	if (Ch->HasAuthority() && Active.IsActive())
	{
		AActor* Target = Active.Target.Get();
		const IHRInteractable* I = Cast<IHRInteractable>(Target);
		const bool bMoved = I && I->RequiresStandingStill() && FVector::DistSquared2D(Ch->GetActorLocation(), ServerStartLocation) > FMath::Square(MoveCancelDistance);
		if (!I || bMoved || !ValidateTarget(Target, nullptr))
		{
			CancelInteraction();
			return;
		}
		if (GetActiveProgress() >= 1.f)
		{
			IHRInteractable* Mutable = Cast<IHRInteractable>(Target);
			Active = FHRActiveInteraction();
			Mutable->OnInteractCompleted(Ch);
		}
	}
}
