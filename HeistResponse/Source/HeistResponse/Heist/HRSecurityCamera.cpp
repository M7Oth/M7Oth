#include "Heist/HRSecurityCamera.h"
#include "Character/HRCharacter.h"
#include "Game/HRGameMode.h"
#include "Game/HRPlayerController.h"
#include "Core/HRLocalization.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "EngineUtils.h"
#include "Net/UnrealNetwork.h"

AHRSecurityCamera::AHRSecurityCamera()
{
	PrimaryActorTick.bCanEverTick = true;
	bReplicates = true;
	bAlwaysRelevant = true; // CCTV viewers may be far away
	SetNetUpdateFrequency(2.f);

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Head = CreateDefaultSubobject<USceneComponent>(TEXT("Head"));
	Head->SetupAttachment(Root);
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Head);
	Mesh->SetCollisionResponseToChannel(ECC_GameTraceChannel2, ECR_Block);
	FeedCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FeedCamera"));
	FeedCamera->SetupAttachment(Head);
	FeedCamera->SetFieldOfView(85.f);
	FeedCamera->PostProcessSettings.bOverride_FilmGrainIntensity = true;
	FeedCamera->PostProcessSettings.FilmGrainIntensity = 0.6f;
	FeedCamera->PostProcessSettings.bOverride_ColorSaturation = true;
	FeedCamera->PostProcessSettings.ColorSaturation = FVector4(0.35f, 0.35f, 0.35f, 1.f);
	FeedCamera->PostProcessSettings.bOverride_VignetteIntensity = true;
	FeedCamera->PostProcessSettings.VignetteIntensity = 0.8f;
}

void AHRSecurityCamera::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(AHRSecurityCamera, bDisabled);
}

float AHRSecurityCamera::TakeDamage(float DamageAmount, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
{
	if (HasAuthority() && !bDisabled && DamageAmount > 0.f)
	{
		bDisabled = true;
		if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyCameraDestroyed(this, EventInstigator); }
	}
	return DamageAmount;
}

void AHRSecurityCamera::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bDisabled) { return; }

	// Deterministic sweep from server time -> identical on every machine without replication.
	const float T = GetWorld()->GetTimeSeconds();
	const float Yaw = FMath::Sin(T * 2.f * PI / FMath::Max(1.f, SweepPeriod)) * SweepDegrees * 0.5f;
	Head->SetRelativeRotation(FRotator(-15.f, Yaw, 0.f));

	if (!HasAuthority()) { return; }
	ScanAccumulator += DeltaSeconds;
	if (ScanAccumulator < 0.2f) { return; }
	const float Dt = ScanAccumulator;
	ScanAccumulator = 0.f;

	AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>();
	if (!GM || GM->IsAlarmRaised()) { return; }

	const FVector Eye = FeedCamera->GetComponentLocation();
	const FVector Fwd = FeedCamera->GetForwardVector();
	const float CosHalf = FMath::Cos(FMath::DegreesToRadians(HalfFOVDegrees));
	for (TActorIterator<AHRCharacter> It(GetWorld()); It; ++It)
	{
		AHRCharacter* Ch = *It;
		if (!Ch->IsRobber() || !Ch->IsVisiblyHostile() || Ch->IsInVehicle()) { continue; }
		const FVector To = Ch->GetEyeLocation() - Eye;
		const float Dist = To.Size();
		if (Dist > ViewDistance || FVector::DotProduct(To / FMath::Max(Dist, 1.f), Fwd) < CosHalf) { continue; }
		FHitResult Hit;
		FCollisionQueryParams Params(SCENE_QUERY_STAT(HRCCTV), false, this);
		if (GetWorld()->LineTraceSingleByChannel(Hit, Eye, Ch->GetEyeLocation(), ECC_Visibility, Params) && Hit.GetActor() != Ch) { continue; }
		// Closer = more suspicious.
		const float Proximity = 1.f - 0.6f * (Dist / ViewDistance);
		GM->AddSuspicion(SuspicionPerSecond * Proximity * Dt, Ch, this);
	}
}

// ---------------------------------------------------------------- Console

AHRCCTVConsole::AHRCCTVConsole()
{
	bReplicates = true;
	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	SetRootComponent(Mesh);
	Mesh->SetCollisionResponseToChannel(ECC_GameTraceChannel1, ECR_Block);
}

bool AHRCCTVConsole::CanInteract(const AHRCharacter* By, FText& OutBlockedReason) const
{
	if (!By) { return false; }
	if (By->IsPolice()) { return true; }
	return By->IsRobber() && bRobbersCanLoop && !bLooped;
}

FText AHRCCTVConsole::GetInteractPrompt(const AHRCharacter* By) const
{
	return (By && By->IsPolice()) ? HRText("Interact.WatchCCTV") : HRText("Interact.LoopCCTV");
}

float AHRCCTVConsole::GetInteractDuration(const AHRCharacter* By) const
{
	return (By && By->IsRobber()) ? 5.f : 0.f;
}

void AHRCCTVConsole::OnInteractCompleted(AHRCharacter* By)
{
	FText Reason;
	if (!HasAuthority() || !CanInteract(By, Reason)) { return; }
	if (By->IsPolice())
	{
		if (AHRPlayerController* PC = Cast<AHRPlayerController>(By->GetController())) { PC->ServerEnterCCTV(); }
		return;
	}
	bLooped = true;
	for (TActorIterator<AHRSecurityCamera> It(GetWorld()); It; ++It) { It->ServerSetDisabled(true); }
	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>()) { GM->NotifyCamerasLooped(By); }
}
