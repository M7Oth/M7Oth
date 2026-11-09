# QA Test Plan

## Automated (CI on every push — `.github/workflows/ci.yml`)
| Suite | Command | Covers |
|---|---|---|
| Core rules (22 tests, ~230 checks, ASan+UBSan, -Werror) | `ctest --test-dir build/core` | loot ledger transitions, carry limit, transfer, trunk, spill, disconnect drop, **20 000-step randomized invariant fuzz**; alarm threshold/decay/never-reset/dispatch timing/**vault always alarms**; lockpick solve/break/determinism/recovery; negotiation flow, cooldowns, expiry, anti-stall budgets, hostage re-check; match outcome (extraction, unreachable loot, time-out, arrests, forfeits, surrender), alarm clock clamp, team balancing |
| Localization | `python3 HeistResponse/Tools/validate_strings.py` | every referenced key exists, Arabic filled, placeholder parity |
| Layout pacing | `python3 HeistResponse/Tools/CityLayout/validate_layout.py` | response/escape times, ≥2 disjoint escape routes, overlaps |

## Planned in-engine automation
- Unreal Automation (Functional Tests) map `FT_Heist`: spawn 2 bots (server-driven controllers), run lockpick success/cancel, vault open → alarm, bag pickup/drop/secure, arrest, vehicle extraction.
- Gauntlet multi-process test: 1 dedicated server + 4 clients, scripted match, assert result & no ensure.

## Manual multiplayer checklist (PIE listen server + 3 clients, then 8)
**Lobby/session:** team balance on join; switch team blocked when unbalanced; ready countdown; late join; join full match → spectator; private code join; Quick Play hosts when none; browser refresh; leave → menu; error text after kicked/connection lost.
**Interaction/inventory:** prompt only with LOS; hold cancel on move/damage/release; crate gives kit once; two robbers can't pick same lock; lockpick with 0 picks blocked; pick break consumes exactly one pick on server and UI; cancel with Esc/move/damage/downed; door opens away from user and is consistent for late joiner.
**Vault/alarm:** keycard path opens → alarm (even with 0 suspicion); drill jams/fix; police disable drill; suspicion from CCTV/guards; guard intimidated before panic; looping cameras stops CCTV suspicion; dispatch countdown matches HUD.
**Loot:** pick/drop/throw; carrier downed drops; disconnect drops; trunk store/take; police recover from ground and stopped trunk; secured totals equal across clients; spam-interacting never duplicates.
**Combat/arrest:** friendly fire off; no damage in prep; downed → revive; bleed-out → police respawn 15 s / robber custody; arrest needs restraints; surrender arrest; jailbreak once; spectator only sees teammates.
**Negotiation:** line opens only with hostages after alarm; offers/answers/timeouts; cooldown; truce perimeter violation; vehicle delivered at marker; surrender ends match.
**Vehicles:** enter/exit (driver/passenger), exit blocked at high speed, siren replicated, disable at 0 HP, spike strip, extraction with loot in trunk, driver disconnect.
**Camera:** V toggle smooth both ways; shoulder swap; setting persists after restart; FP head hidden locally only; camera never clips walls; TP corner-peek cannot hit target behind wall; aiming/recoil identical FP/TP; spectator/CCTV/vehicle cameras; possession changes (vehicle, death, arrest) keep the correct camera.
**Resolution:** each win/lose path; time-out; forfeit; rematch vote; summary values.
**Network conditions:** 120 ms / 2 % loss, 250 ms / 5 % loss: lockpick responsiveness, sprint no rubber-banding, shots register, vehicles stable.
**UI/localization:** Arabic shaping & RTL mirroring; English fallback; HUD scale 75/150 %; 1280×720 → 4K; rebinding conflicts swap.
**Performance:** target 60 fps on RTX 3060 / Ryzen 5 5600 @1080p High; capture `stat unit`, `stat gpu`, Insights traces per milestone.

## Bug reporting
Log in `Docs/PROJECT_STATUS.md` → Known bugs with: build/commit, steps, expected vs actual, net mode, logs.
