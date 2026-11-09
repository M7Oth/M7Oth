# Project Status

_Last updated: 2026-11-09 (session 1)._

## 1. Environment audit (session 1)
| Item | Finding |
|---|---|
| Machine | Cloud Linux container (Ubuntu 24.04, 4 cores, 15 GB RAM, ~31 GB free). **Not the owner's Windows PC.** |
| Unreal Engine | **Not installed / not installable here** (Epic downloads require an Epic-linked account; unrealengine.com blocked). |
| Visual Studio / MSVC | Not available (Linux). gcc 13.3, clang, CMake 3.28, Python 3, Node, Playwright/Chromium available. |
| Remote access to owner's PC | None connected (no Remote Control folders). |
| Consequence | Unreal C++ **was written but not compiled**. Only the engine-independent rules, data tools and docs were built/run here. |

Target engine: **UE 5.6** (`EngineAssociation` in the .uproject; switch to the installed 5.x via right-click → Switch Unreal Engine version). APIs used are those stable across 5.5–5.7 (e.g. `SetNetUpdateFrequency` requires ≥5.5).

## 2. Verified (with evidence)
| What | Evidence |
|---|---|
| Rule models: loot ledger, alarm, lockpick, negotiation, match outcome, team balancing | `Tests/CoreRules` — 22 tests / 229 checks pass under `-Wall -Wextra -Wconversion -Wshadow -Werror` + ASan/UBSan (gcc 13.3) |
| Mandatory "vault opening raises alarm" rule (model) | `Alarm_VaultOpeningAlwaysRaisesAlarm` |
| Loot anti-duplication | `Loot_RandomizedInvariantFuzz` (20 000 random ops, invariants hold) |
| Localization table complete (303 keys, Arabic + English, placeholders consistent) | `Tools/validate_strings.py` |
| City plan pacing (police ~78 s, escapes 48–97 s, ≥2 disjoint routes each, no overlaps) | `Tools/CityLayout/validate_layout.py`; map `Tools/CityLayout/district_map.png` |
| CI pipeline definition | `.github/workflows/ci.yml` (runs the three checks above) |

## 3. Implemented, NOT yet verified in Unreal (needs first compile + PIE)
- Module, targets (Game/Editor/Server), configs (maps, net rates, Null/EOS subsystem, collision channels `HRInteraction`/`HRWeapon`, packaging, staging of fonts/strings).
- GameMode (lobby, phases, alarm/dispatch, loot, arrests, jailbreak, respawn, negotiation, truce enforcement, extraction, scoring, rematch, forfeits, reconnection), GameState, PlayerState, PlayerController (RPC gateway, input contexts, pings, CCTV, spectating).
- Character with predicted sprint/aim, FP/TP camera rig (V toggle, shoulder swap, smooth blend, persisted), interaction, inventory, health/downed, hitscan weapon with anti-peek validation, gadgets (smoke, spike strip), anim instance base.
- Heist actors: door (lockpick/keycard/breach/holding cell), lockpick session, vault (keycard/drill/jams), loot pile & bag, extraction zone, equipment crate, security camera + CCTV console.
- NPC AI (guards, employees, manager keycard, civilians, hostages) — server state machine with sight checks.
- Chaos vehicle (seats, possession, siren lights, health, blown tyres, trunk).
- Session subsystem (Quick Play, private room codes, browser, join by code, version gate), GameInstance error capture.
- Slate UI: main menu, lobby, HUD, world markers, lockpick minigame, negotiation, scoreboard/summary, pause, settings (incl. key rebinding).
- Editor builder `Tools/Editor/build_district.py` (blockout L_District, L_MainMenu, L_Transition).

**Expect compile errors on first build** — written carefully against UE 5.5–5.7 APIs but without a compiler. Report the first error log and they will be fixed quickly.

## 4. Temporary / placeholder content (must be replaced before "done")
See `Docs/ASSET_PIPELINE.md` → Placeholder tracker. Summary: blockout city boxes, bank/station shells, cube loot bags/doors/vault door, **no character meshes or animations yet**, no vehicles placed, no audio, square world markers.

## 5. Known issues / gaps
1. Language switch updates fully only after returning to the main menu (static strings in constructed widgets).
2. Audio volume settings are stored but not yet applied (needs SoundClass/SoundMix assets).
3. `bCameraShake` and colour-blind settings are stored but not yet consumed.
4. Third-person visual corner-peek is mitigated, not eliminated (shots are validated; visibility filtering planned — MULTIPLAYER_ARCHITECTURE §3).
5. NPCs cannot open doors themselves (doors don't affect nav; nav links needed in the bank).
6. Passengers cannot shoot from vehicles yet (design decision pending).
7. Hit/muzzle VFX hooks (`AHRCharacter::OnShotFX`) are empty until Niagara assets exist.
8. Canvas world-marker labels use the engine Latin font (distances only — no Arabic text there).
9. EOS internet matchmaking not configured — requires the owner's Epic Developer Portal product (private credentials).
10. Dedicated server target needs a source-built engine.

## 6. Required external services / owner actions
| Action | Why | Cost |
|---|---|---|
| Install UE 5.6+ via Epic Launcher and VS 2022 (C++ game workload) on the Windows PC | compile & run | free |
| Connect the PC to Claude (Remote Control) **or** run Claude Code on that PC | lets Claude compile, read logs and iterate directly | free |
| Create EOS product (Epic Developer Portal) and share credentials via environment/secret (never chat) | internet matchmaking | free |
| Decide hosting (listen-server only vs. dedicated VPS / GameLift / Edgegap) | public servers | € per month — needs approval |
| Add Fab/Quixel free assets to the Epic account (City Sample, Game Animation Sample, MetaHuman) | production art | free |

## 7. Pending creative decisions
- Final title (working: HEIST RESPONSE).
- Day vs. night as the default time of day (proposal: golden hour default, night variant later).
- Whether AI guards ever fight (current: no, they detect/alarm only).
- Deal list and values after first playtests.

## 8. Next tasks
1. Owner: install UE + VS, open the project, build, send the build log (or connect the PC).
2. Fix compile errors → run builder script → BP_HRCharacter with Manny/Quinn → 2–4 player PIE full loop.
3. Vehicles from template/City Sample; first chase test.
4. In-engine functional tests (FT_Heist map) + Gauntlet.
5. Art track kickoff: World Partition, modular kits, bank interior.
