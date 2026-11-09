# HEIST RESPONSE — instructions for Claude Code sessions

Online multiplayer Police vs. Robbers game, Unreal Engine 5 (C++ first), Windows PC.
Working title "HEIST RESPONSE — Police vs. Robbers" (provisional; title lives in `Content/Localization/Raw/HRStrings.csv` key `Game.Title` and `Config/DefaultGame.ini`).
Project owner communicates in **Saudi Arabic** — reply in clear Saudi Arabic. Code, comments and docs are in English.

## Read first
0. On Windows for the first time: `Docs/LOCAL_SETUP_WINDOWS.md`.
1. `Docs/PROJECT_STATUS.md` — what exists, what is verified, what is placeholder, known risks, next tasks.
2. `Docs/DEVELOPMENT_ROADMAP.md` — milestones and tracks.
3. The design doc relevant to your task (`Docs/*.md`).

## Repository layout
```
HeistResponse/                 Unreal project root (HeistResponse.uproject)
  Config/                      Default*.ini (maps, net, online subsystem, input, packaging)
  Content/Fonts/Raw/           Noto Kufi Arabic (OFL) loaded at runtime by FHRUIStyle
  Content/Localization/Raw/    HRStrings.csv — GENERATED from Tools/strings_source.py
  Source/HeistResponse/
    Rules/        Engine-independent C++17 rule models (loot ledger, alarm, lockpick, negotiation, match). NO Unreal includes.
    Core/         Reflected enums/types, localization, user settings
    Game/         GameMode (authority), GameState, PlayerState, PlayerController (RPC gateway)
    Character/    AHRCharacter, predicted movement (sprint/aim flags), anim instance base
    CameraSystem/ Shared FP/TP camera rig
    Interaction/  IHRInteractable + server-validated hold interactions
    Inventory/    Replicated server-authoritative inventory
    Combat/       Health (downed/incapacitated), hitscan weapon with anti-peek validation, gadgets
    Heist/        Doors, lockpick session, vault, loot piles/bags, extraction, crates, CCTV
    AI/           NPC guards/employees/civilians/hostages (server state machine)
    Vehicles/     Chaos wheeled vehicle with seats, sirens, damage, trunk
    Session/      Online session subsystem (Quick Play, private rooms, browser), GameInstance
    UI/           Slate HUD + panels + design system; Menu/ main-menu game mode
  Tests/CoreRules/             Standalone tests for Rules/ (CMake, runs on Linux CI)
  Tools/CityLayout/            district.json (city plan) + validate_layout.py (pacing checks, SVG map)
  Tools/Editor/build_district.py   In-editor Python: builds blockout L_District/L_MainMenu from the plan
Docs/                          Design + production documents
```

## Golden rules (do not break)
- **Server authority.** Gameplay state changes only on the server, through `AHRGameMode` or a component's `HasAuthority()` path. Clients send intent via validated Server RPCs. Never trust client values beyond intent (angles, directions) and always sanity-check them.
- **Rules live in `Rules/`.** Any new match/loot/alarm/negotiation logic goes into the pure C++ models first, with tests in `Tests/CoreRules/CoreRulesTests.cpp`, then gets wired into Unreal. Keep `Rules/` free of Unreal headers.
- **Mandatory alarm rule:** opening the vault ALWAYS raises the alarm (`AHRVault::BeginOpening` → `AHRGameMode::OnVaultOpened`). There is a unit test for the model; don't add bypasses.
- **Loot is ledger-first.** `FLootLedger` decides; `AHRLootBag` actors only mirror it. Never move/destroy a bag actor without a successful ledger call.
- **Shots/interactions originate from the pawn's eyes**, not the camera (third-person peek fairness).
- **No fabricated assets.** `.uasset/.umap` files are created only by the Unreal Editor (or its Python API). Placeholders are tagged `HR_Placeholder` and listed in PROJECT_STATUS.
- **All UI text goes through `HRText("Key")`** and `Tools/strings_source.py` (Arabic + English). Regenerate the CSV and run `Tools/validate_strings.py`. Source files must stay ASCII.
- Never claim something was compiled, played, profiled or deployed unless it actually was in this session. Record evidence in PROJECT_STATUS.

## Build / test
- Rules tests (any OS): `cmake -S HeistResponse/Tests/CoreRules -B build/core && cmake --build build/core && ctest --test-dir build/core`
- Data checks: `python3 HeistResponse/Tools/validate_strings.py` and `python3 HeistResponse/Tools/CityLayout/validate_layout.py --svg /tmp/map.svg`
- Unreal (Windows, UE 5.6+, VS 2022 with "Game development with C++"): right-click `HeistResponse.uproject` → Generate VS project files → build `HeistResponseEditor Win64 Development`. Then run `Tools/Editor/build_district.py` once in the editor.
- Multiplayer PIE: Play → Net Mode "Play As Listen Server", 2–8 players; or `UnrealEditor.exe HeistResponse.uproject /Game/HeistResponse/Maps/L_District?listen?Solo -game -log` and clients with `127.0.0.1 -game`.
- Useful URL options: `?Solo` (start with one team, no forfeits), `?ShortMatch` (short timers), `?Team=Police|Robbers`, `?Name=...`.

## Git
Develop on the branch named in the session instructions; commit with clear messages; never commit Binaries/Intermediate/Saved.
