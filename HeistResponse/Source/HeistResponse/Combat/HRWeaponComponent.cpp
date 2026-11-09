#include "Combat/HRWeaponComponent.h"
#include "Character/HRCharacter.h"
#include "CameraSystem/HRCameraRigComponent.h"
#include "Game/HRGameMode.h"
#include "HeistResponse.h"
#include "Net/UnrealNetwork.h"
#include "Engine/World.h"
#include "TimerManager.h"
#include "Kismet/GameplayStatics.h"
#include "CollisionQueryParams.h"

UHRWeaponComponent::UHRWeaponComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	SetIsReplicatedByDefault(true);
}

void UHRWeaponComponent::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);
	DOREPLIFETIME(UHRWeaponComponent, AmmoInMag);
	DOREPLIFETIME_CONDITION(UHRWeaponComponent, ReserveAmmo, COND_OwnerOnly);
	DOREPLIFETIME(UHRWeaponComponent, bReloading);
}

void UHRWeaponComponent::BeginPlay()
{
	Super::BeginPlay();
	ServerSpreadStream.GenerateNewSeed();
	if (GetOwner() && GetOwner()->HasAuthority())
	{
		AmmoInMag = Spec.MagazineSize;
		ReserveAmmo = Spec.StartingReserve;
	}
}

AHRCharacter* UHRWeaponComponent::GetCharacter() const
{
	return Cast<AHRCharacter>(GetOwner());
}

void UHRWeaponComponent::SetWeaponSpec(const FHRWeaponSpec& InSpec)
{
	if (!GetOwner() || !GetOwner()->HasAuthority()) { return; }
	Spec = InSpec;
	AmmoInMag = Spec.MagazineSize;
	ReserveAmmo = Spec.StartingReserve;
	bReloading = false;
}

bool UHRWeaponComponent::CanFireNow() const
{
	const AHRCharacter* Ch = GetCharacter();
	return Ch && Ch->CanUseWeapon() && !bReloading && AmmoInMag > 0;
}

void UHRWeaponComponent::StartFire()
{
	bWantsFire = true;
	if (GetWorld()->GetTimeSeconds() >= LocalNextShotTime) { FireOnceLocal(); }
}

void UHRWeaponComponent::StopFire()
{
	bWantsFire = false;
}

void UHRWeaponComponent::RequestReload()
{
	if (!bReloading && AmmoInMag < Spec.MagazineSize && ReserveAmmo > 0) { ServerReload(); }
}

void UHRWeaponComponent::FireOnceLocal()
{
	AHRCharacter* Ch = GetCharacter();
	if (!Ch) { return; }
	const float Now = GetWorld()->GetTimeSeconds();
	LocalNextShotTime = Now + ShotInterval();

	if (!CanFireNow())
	{
		if (AmmoInMag <= 0 && DryFireSound) { UGameplayStatics::PlaySound2D(this, DryFireSound); }
		if (AmmoInMag <= 0) { RequestReload(); }
		bWantsFire = false;
		return;
	}

	FVector ViewLoc;
	FRotator ViewRot;
	if (AController* C = Ch->GetController()) { C->GetPlayerViewPoint(ViewLoc, ViewRot); }
	else { Ch->GetActorEyesViewPoint(ViewLoc, ViewRot); }

	ServerFire(ViewLoc, ViewRot.Vector());

	// Local feedback (predicted): recoil + sound. Hit results come from the server.
	if (UHRCameraRigComponent* Rig = Ch->GetCameraRig())
	{
		Rig->AddRecoilKick(Spec.RecoilPitch, FMath::FRandRange(-Spec.RecoilYaw, Spec.RecoilYaw));
	}
	if (FireSound) { UGameplayStatics::PlaySoundAtLocation(this, FireSound, Ch->GetMuzzleLocation()); }
	Ch->PlayFireMontageLocal();

	if (!Spec.bAutomatic) { bWantsFire = false; }
}

void UHRWeaponComponent::ServerFire_Implementation(FVector_NetQuantize ViewLocation, FVector_NetQuantizeNormal ViewDirection)
{
	AHRCharacter* Ch = GetCharacter();
	if (!Ch || !CanFireNow()) { return; }

	const float Now = GetWorld()->GetTimeSeconds();
	if (Now - ServerLastShotTime < ShotInterval() * FireRateTolerance) { return; } // rate-limit
	ServerLastShotTime = Now;

	const FVector Eye = Ch->GetEyeLocation();
	if (FVector::DistSquared(ViewLocation, Eye) > FMath::Square(MaxCameraOffset))
	{
		UE_LOG(LogHeist, Warning, TEXT("ServerFire rejected: camera too far from pawn (%s)"), *GetNameSafe(Ch));
		return;
	}

	--AmmoInMag;

	const FVector Dir = ViewDirection.GetSafeNormal();
	FCollisionQueryParams Params(SCENE_QUERY_STAT(HRWeapon), true, Ch);
	Params.bReturnPhysicalMaterial = false;

	// (2) Aim point along the camera ray, starting where the ray passes the pawn's eyes.
	const float Along = FMath::Max(0.f, FVector::DotProduct(Eye - ViewLocation, Dir));
	const FVector RayStart = ViewLocation + Dir * Along;
	const FVector RayEnd = ViewLocation + Dir * Spec.Range;
	FHitResult AimHit;
	const FVector AimPoint = GetWorld()->LineTraceSingleByChannel(AimHit, RayStart, RayEnd, ECC_GameTraceChannel2 /*HRWeapon*/, Params) ? AimHit.ImpactPoint : RayEnd;

	// (3) Spread is decided by the server.
	const float SpreadDeg = Ch->IsAiming() ? Spec.AimSpreadDegrees : Spec.HipSpreadDegrees;
	const FVector Muzzle = Ch->GetMuzzleLocation();
	FVector ShotDir = (AimPoint - Muzzle).GetSafeNormal();
	ShotDir = ServerSpreadStream.VRandCone(ShotDir, FMath::DegreesToRadians(SpreadDeg * 0.5f));

	FHitResult Hit;
	const FVector ShotEnd = Muzzle + ShotDir * Spec.Range;
	const bool bHit = GetWorld()->LineTraceSingleByChannel(Hit, Muzzle, ShotEnd, ECC_GameTraceChannel2, Params);
	const FVector Impact = bHit ? Hit.ImpactPoint : ShotEnd;

	bool bHitCharacter = false;
	if (bHit && Hit.GetActor())
	{
		float Damage = Spec.Damage;
		const float Dist = FVector::Dist(Muzzle, Impact);
		if (Dist > Spec.FalloffStart)
		{
			const float T = FMath::Clamp((Dist - Spec.FalloffStart) / FMath::Max(1.f, Spec.Range - Spec.FalloffStart), 0.f, 1.f);
			Damage *= FMath::Lerp(1.f, Spec.FalloffMinMultiplier, T);
		}
		if (Hit.BoneName == TEXT("head")) { Damage *= Spec.HeadshotMultiplier; }
		bHitCharacter = Hit.GetActor()->IsA<APawn>();
		UGameplayStatics::ApplyPointDamage(Hit.GetActor(), Damage, ShotDir, Hit, Ch->GetController(), Ch, nullptr);
	}

	if (AHRGameMode* GM = GetWorld()->GetAuthGameMode<AHRGameMode>())
	{
		GM->NotifyGunfire(Ch, Muzzle);
	}

	MulticastShotFX(Muzzle, Impact, bHitCharacter);

	if (AmmoInMag <= 0 && ReserveAmmo > 0) { ServerReload_Implementation(); }
}

void UHRWeaponComponent::MulticastShotFX_Implementation(FVector_NetQuantize Muzzle, FVector_NetQuantize Impact, bool bHitCharacter)
{
	AHRCharacter* Ch = GetCharacter();
	const bool bLocalShooter = Ch && Ch->IsLocallyControlled();
	if (!bLocalShooter && FireSound) { UGameplayStatics::PlaySoundAtLocation(this, FireSound, Muzzle); }
	if (!bLocalShooter && Ch) { Ch->PlayFireMontageLocal(); }
	if (ImpactSound) { UGameplayStatics::PlaySoundAtLocation(this, ImpactSound, Impact); }
	if (Ch) { Ch->OnShotFX(Muzzle, Impact, bHitCharacter); }
}

void UHRWeaponComponent::ServerReload_Implementation()
{
	if (bReloading || AmmoInMag >= Spec.MagazineSize || ReserveAmmo <= 0) { return; }
	const AHRCharacter* Ch = GetCharacter();
	if (!Ch || !Ch->CanUseWeapon()) { return; }
	bReloading = true;
	GetWorld()->GetTimerManager().SetTimer(ReloadTimer, this, &UHRWeaponComponent::FinishReload, Spec.ReloadSeconds, false);
}

void UHRWeaponComponent::FinishReload()
{
	const int32 Needed = Spec.MagazineSize - AmmoInMag;
	const int32 Taken = FMath::Min(Needed, ReserveAmmo);
	AmmoInMag += Taken;
	ReserveAmmo -= Taken;
	bReloading = false;
}

void UHRWeaponComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	const AHRCharacter* Ch = GetCharacter();
	if (Ch && Ch->IsLocallyControlled() && bWantsFire && Spec.bAutomatic && GetWorld()->GetTimeSeconds() >= LocalNextShotTime)
	{
		FireOnceLocal();
	}
	// Cancel reload if the owner became unable to use weapons (downed, arrested, surrendering).
	if (Ch && Ch->HasAuthority() && bReloading && !Ch->CanUseWeapon())
	{
		GetWorld()->GetTimerManager().ClearTimer(ReloadTimer);
		bReloading = false;
	}
}
