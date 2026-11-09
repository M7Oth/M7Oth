# UI / UX Design

## Design system (`UI/HRUIStyle`, `UI/HRWidgetHelpers.h`)
- Typography: composite font — Roboto (Latin, engine) + **Noto Kufi Arabic** (OFL) for U+0600–06FF, 0750–077F, 08A0–08FF, FB50–FDFF, FE70–FEFF. Slate/HarfBuzz shapes Arabic; mixed strings render in one line.
- Palette: ink `#F2F4F7`, muted `#9AA4B2`, panels near-black 78 % alpha with 10–14 px radius, police `#2F7BFF`, robbers `#FFB020`, alarm `#FF3B3B`, success `#34D399`, negotiation violet `#A78BFA`.
- Components: `Label`, `Button` (rounded, hover state), `Panel` (translucent/solid). All screens built from these.
- **RTL:** root widgets use `FlowDirectionPreference` from the language (Arabic → RightToLeft), so boxes, alignment and corners mirror automatically.
- Scale: SDPIScaler driven by the HUD-scale setting (75–150 %).
- Strings: only via `HRText("Key")` → `HRStrings.csv` (Arabic primary, English fallback, validated in CI).

## Screens (all implemented in Slate, every button wired)
| Screen | Class | Behaviour |
|---|---|---|
| Main menu | `SHRMainMenu` (`AHRMenuGameMode`) | name field, Quick Play, host public, create private (room code), join by code, server browser (players/ping, refresh, join), solo training, settings, quit; live status + carried-over network errors; shows online service in use |
| Lobby | `SHRLobbyPanel` | two team columns with live names/ready tags, join-team buttons (balance enforced server-side), ready toggle, countdown, room code display, settings, leave |
| HUD | `SHRGameHUD` | phase + clock (red < 60 s), objective line per team/phase, pulsing alarm pill with dispatch countdown, dispatch banner (police), truce timer, loot secured/target bar, hostages, robber suspicion meter (pre-alarm), notification feed (6, colour-coded), interaction prompt with bound key + hold progress or blocked reason, health bar, inventory line, camera-mode hint, ammo/reload/"mask to arm", crosshair dot, downed (bleed-out timer), arrested, spectating |
| World markers | `AHRHUD::DrawHUD` | tactical pings, police dispatch waypoint, extraction zones (team-gated), teammate markers (downed = red "!") with edge clamping |
| Lockpicking | `SHRLockpickWidget` | code-drawn lock face, pins rising/set, pick follows mouse, tension wrench, tremble with closeness, stress bar, picks left, snap/set flashes + sounds |
| Negotiation | `SHRNegotiationPanel` | status (hostages, deals used), pending offer with countdown and accept/reject (opposing team only), team-filtered deal catalogue with descriptions, propose disabled during cooldown |
| Scoreboard / summary | `SHRScoreboard` | Tab during match; at end: winner banner (team colour), reason, loot line, per-player score/takedowns/arrests/loot/hostages/ping/status, rematch vote, leave |
| In-match menu | `SHRPauseMenu` | resume, settings, leave match, quit (no pause in multiplayer) |
| Settings | `SHRSettingsPanel` | tabs: Gameplay (perspective FP/TP, shoulder, distance, FOVs, shake), Controls (sensitivity, aim sens, invert Y, toggle aim, **live key rebinding with conflict swap**), Graphics (preset, resolution scale, window mode, VSync, frame cap), Audio (master/effects/voice), Interface (language, HUD scale, colour-blind); Defaults / Apply / Close |
| CCTV | overlay | camera feed with grain/desaturation post-process, hint bar |

## Input mode policy
Any open panel (lobby, menu, settings, negotiation, summary) → Game+UI with cursor; otherwise Game-only. Gameplay continues behind menus (multiplayer). During lockpicking the mouse drives the pick and LMB applies tension; Esc cancels.

## Accessibility
Rebindable keys, toggle-aim, sensitivity, HUD scale, colour-blind team colours, high-contrast text with shadows, no information conveyed by colour alone in prompts (text + key).

## Pending
- Language change rebuilds static strings only after returning to menu (documented in the setting note) — make live.
- Icons/textures for items and markers; animated transitions; controller support; voice-chat indicator; minimap.
- Audio volumes need SoundClass/SoundMix assets to take effect.
