# Asset Pipeline

## Rules
- `.uasset`/`.umap` are created only by the Unreal Editor (manually or via Editor Python). Never hand-write them.
- Every temporary asset is tagged/listed: actors carry tag `HR_Placeholder`; materials are `MI_Block_*`; the tracker below and PROJECT_STATUS list what replaces them.
- Verify licence + engine version before importing. No paid assets/services without the owner's approval.
- Binary assets go through Git LFS (`.gitattributes`).

## Folder layout (Content/HeistResponse/)
`Maps/ Characters/ Animations/ Vehicles/ Props/ Environment/{Modular,Bank,Police,Street}/ Materials/ VFX/ Audio/{SFX,Ambience,Vehicles,Weapons,UI}/ UI/`

## Blueprint children the C++ expects (create in editor)
| BP | Parent | Assign |
|---|---|---|
| `Characters/BP_HRCharacter` | `AHRCharacter` | `PoliceMesh`, `RobberMeshes[]`, AnimBP (`ABP_HRCharacter` parent `UHRAnimInstance`), `MaskMesh`, `WeaponMesh` (+`Muzzle` socket), montages, weapon sounds |
| `Props/BP_LootBag` | `AHRLootBag` | duffel bag mesh |
| `Vehicles/BP_PoliceCruiser` | `AHRVehicle` | car skeletal mesh + physics asset, wheel bone names, `OwnerTeam=Police`, `bHasSiren`, engine/siren sounds |
| `Vehicles/BP_GetawaySedan` | `AHRVehicle` | car mesh, engine sound |
| `Characters/BP_NPC_*` | `AHRNPCCharacter` | `MeshVariants[]`, AnimBP |
| HUD sounds | `AHRHUD` (BP child set as HUDClass) | `UISounds`: Alarm, Phone, Radio, Ping, PinSet, PickSnap |
Config paths in `DefaultGame.ini` → `[/Script/HeistResponse.HRGameMode]`.

## Legitimate sources (free / already owned) — to audit on the owner's machine
| Need | Source | Licence notes |
|---|---|---|
| Characters + animation baseline | UE5 **Third Person template** (Manny/Quinn + locomotion), **Game Animation Sample** (motion matching, 500+ anims) | Epic content, free for UE projects |
| Character variety | **MetaHuman** (Creator + Fab MetaHumans), retarget via IK Retargeter | free for UE use |
| City architecture | **City Sample** (buildings kit, vehicles, crowd) on Fab | free, UE-only licence, very large (≈100 GB) — use selectively |
| Vehicles | City Sample vehicles; UE **Vehicle template** sedan (fallback) | free |
| Surfaces / props | **Quixel Megascans on Fab** (free tier & monthly free assets), Fab free packs | Fab Standard licence; check each pack |
| Sound | Epic **Sound/MetaSound** samples, freesound.org (CC0 only), Sonniss GDC bundles (royalty-free) | check per file |
| Arabic font | Noto Kufi Arabic (vendored) | SIL OFL 1.1 (`Content/Fonts/Raw/OFL.txt`) |

## Procedural / tool-assisted production
- `Tools/Editor/build_district.py` — data-driven blockout from the city plan (current).
- Next: PCG graphs that consume the same rectangles to place modular façade kits, street furniture, trees and parked cars; Geometry Script for custom bank interior pieces (counters, vault door frame) where no kit fits.

## Placeholder tracker
| Placeholder | Where | Replace with | Milestone |
|---|---|---|---|
| Box buildings, flat materials | L_District (`HR_Placeholder`) | modular kits + PCG, Megascans materials | M11 |
| Bank shell boxes | L_District/Bank | detailed bank interior (marble lobby, vault room) | M5/M11 |
| No character meshes (C++ fallback is invisible capsule) | BP_HRCharacter missing | Manny/Quinn → MetaHuman police/robber outfits | M4 |
| Loot bag = engine cube | `AHRLootBag` default | duffel bag mesh | M5 |
| Door/vault leaves = scaled cubes | builder | modelled doors, vault door with bolts animation | M5 |
| No vehicles placed | needs BP_PoliceCruiser/BP_GetawaySedan | City Sample vehicles | M8 |
| No audio assigned | all `USoundBase` slots empty | SFX library | M12 |
| Canvas markers (squares) | `AHRHUD::DrawHUD` | icon textures | M12 |
