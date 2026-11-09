# Development Roadmap

Tracks run in parallel: **Core** (gameplay+network) · **Environment** · **Character** · **Vehicle** · **Interface** · **Quality**.
Status: ✅ done & verified · 🟡 implemented, not yet verified in engine · ⬜ not started.

| # | Milestone | Core | Env | Char | Vehicle | UI | Quality |
|---|---|---|---|---|---|---|---|
| 1 | Project & toolchain | 🟡 uproject, modules, configs, targets | | | | | ✅ CI for rules/data |
| 2 | Multiplayer foundations | 🟡 GameMode/State/PS/PC, lobby, sessions, reconnection | | | | 🟡 menu, lobby | ✅ rules unit tests |
| 3 | City layout & initial environment | | ✅ plan + pacing validation; 🟡 blockout builder | | | | |
| 4 | Characters & animation foundation | 🟡 character, predicted movement, FP/TP camera rig | | 🟡 anim instance base; ⬜ meshes/AnimBP | | 🟡 HUD | |
| 5 | Bank, doors, guards, vault, robbery | 🟡 doors, lockpick, vault, loot, NPC AI, CCTV, alarm | 🟡 bank blockout | | | 🟡 lockpick UI | ✅ alarm/loot/lockpick tests |
| 6 | Police response & negotiation | 🟡 dispatch, intel, hostages, negotiation | 🟡 station blockout | | | 🟡 negotiation UI | ✅ negotiation tests |
| 7 | Weapons, arrests, team play | 🟡 weapon, health, arrests, surrender, jailbreak, gadgets, pings | | | | 🟡 | |
| 8 | Cars, pursuits, escapes | 🟡 vehicle class, extraction | | | ⬜ vehicle assets | | |
| 9 | Full match integration | 🟡 phases, outcome, summary, rematch | | | | 🟡 scoreboard | ✅ outcome tests |
| 10 | Public multiplayer services | 🟡 session subsystem; ⬜ EOS product (owner) | | | | | |
| 11 | Production city & characters | | ⬜ modular kits/PCG/World Partition/HLOD | ⬜ MetaHuman outfits | ⬜ | | |
| 12 | Final UI, VFX, animation, audio | | ⬜ lighting pass | ⬜ montages | ⬜ audio | ⬜ icons, polish | |
| 13 | Comprehensive MP testing | | | | | | ⬜ 8-player, lag, soak |
| 14 | Optimisation, balance, packaging | | | | | | ⬜ profiling, Shipping build, server build |

## Immediate next steps (in order)
1. **First compile on the owner's Windows machine** (UE 5.6/5.7 + VS 2022). Fix compile errors (code was written without an engine available — expect some).
2. Run `Tools/Editor/build_district.py`, add Third Person template content, create `BP_HRCharacter` with Manny/Quinn + AnimBP from `UHRAnimInstance`.
3. PIE 2–4 players listen server: walk the full loop (lobby → prep → lockpick → vault → alarm → loot → extraction → summary). Log every bug in PROJECT_STATUS.
4. Vehicles: import City Sample/Vehicle-template car, BP_PoliceCruiser / BP_GetawaySedan, place in garage/station.
5. EOS: owner creates the free product in the Epic Developer Portal; wire credentials; two-network test.
6. Art track: World Partition conversion, modular building kit selection, bank interior.
