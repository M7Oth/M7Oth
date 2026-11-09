# HEIST RESPONSE — Game Design Document

## 1. Pillars
1. **Every match tells a different story.** Robbery, negotiation, combat, arrests and pursuit interlock; player decisions — not scripts — create escalation.
2. **Both teams always have something meaningful to do.** No team waits passively for more than ~30 s.
3. **Fair, readable, server-authoritative competition** in first *and* third person.
4. **Grounded tone, non-graphic.** Takedowns are "downed/incapacitated", never gore. NPCs are never killed.

## 2. Format
- 4 police vs 4 robbers (configurable `MaxPlayersPerTeam`, 1v1 minimum to start, `?Solo` for testing).
- Session-based, ~10–15 min. Third person default, first person on `V`.
- One semi-open district (~1.65 km²) — see WORLD_DESIGN_DOCUMENT.md.

## 3. Match flow (implemented in `Rules/MatchRules.h` + `AHRGameMode`)
| Phase | Duration | Robbers | Police |
|---|---|---|---|
| Lobby (WaitingToStart) | until majority ready | pick team, ready | pick team, ready |
| Preparation | 60 s | gear up from crew van (lockpicks, shared thermal drill), plan approach | gear up at armory, patrol cars, watch CCTV |
| Infiltration | main clock 15 min | case the bank unmasked, steal manager keycard, pick back door, loop CCTV… | patrol; react to "suspicious activity" reports (sent at 50 % suspicion) |
| Response | clamp(remaining, 4–7 min) | loot, hold hostages, negotiate, escape | dispatched after 12 s (6 s if vault sensor); travel ~66 s; perimeter, negotiate, breach, pursue |
| Ended | 25 s | summary, rematch vote | summary, rematch vote |

### Alarm (`Rules/AlarmModel.h`)
- Suspicion 0–100 from NPC witnesses, CCTV, noise (lock-pick snaps, breaches, drilling), restricted doors, masking in view.
- Threshold → alarm. Guards that fully detect a threat run a 2.5 s panic-button countdown (cancelled by intimidation).
- Gunfire, any player damage, or a police officer calling in visibly armed robbers raises it immediately.
- **Vault opening always raises the alarm** (mandatory rule). Quiet approach value = more time before police are dispatched, not an alarm-free heist.
- Alarm never resets.

### Robber approaches
- **Quiet:** unmasked casing → intimidate the branch manager (mask + shout) → take Vault Keycard → keycard opens the staff corridor → 6 s code entry → vault opens (alarm).
- **Loud:** lockpick rear service door → thermal drill on vault (75 s, random jams to fix, police can disable it) → vault opens.
- **Mixed:** loop CCTV from the security room (5 s), pick the employee door, etc.

### Loot (`Rules/LootLedger.h`)
- Loot piles in the vault (default 5 × 2 bags × $25 000). Target = 50 % of total.
- One bag per robber; carrying slows to 300 cm/s, no sprint/jump. G throws the bag (hand-offs, over fences).
- Bags can be stored in vehicle trunks (T), taken back out, or recovered by police from the ground or a stopped car's trunk.
- Downed/arrested/disconnected carriers drop bags. Secured/recovered are terminal (anti-duplication; fuzz-tested).

### Hostages & negotiation (`Rules/NegotiationModel.h`)
- Masked robbers shout (F) to make NPCs cower, then tie them (2 s) → hostage. Police free hostages (3 s) or evacuate cowering civilians.
- Negotiation line opens when the alarm is up and robbers hold ≥1 hostage. Press N.
- Deals: Hostage→Truce (police withdraw from 25 m perimeter + hold fire 45 s), 2 Hostages→Getaway car delivered, Hostage→+60 s clock, Police Surrender Terms, Mutual 25 s ceasefire.
- Anti-abuse: one pending offer, 20 s response window, 25 s proposer cooldown after rejection/expiry, max 4 accepted deals, max 120 s total truce, hostages re-checked at accept time, truce violations end the truce and are announced.

### Combat (`Combat/`)
- Hitscan, server-decided spread/rate/ammo. Police carbine (24 dmg, 650 rpm, 30 rnd), robber SMG (18 dmg, 800 rpm, 32 rnd, shorter range).
- Robbers must be masked to use weapons — masking is a commitment (locks on after alarm).
- 0 HP → **Downed** (40 s bleed-out, crawl, revive by teammate 5 s). Bleed-out → **Incapacitated**: police respawn at the station after 15 s (travel time is the penalty); robbers are taken into custody.
- Arrest: police with restraints on a downed or surrendering robber (3 s / 1.5 s). Surrender: H.
- Arrested robbers sit in the station holding cell, still in control; one **jailbreak** per match if a free robber picks the cell lock during Response.
- Gadgets: robbers smoke grenade (blocks sight/CCTV, not bullets); police spike strip (blown tyres cap speed).
- No friendly fire. No damage during Preparation.

### Vehicles & pursuit (`Vehicles/`)
- Chaos vehicles; driver + 3 passengers. Police cruisers locked to robbers; getaway cars free for anyone.
- Health from bullets and collisions; disabled cars stop but keep trunk loot — robbers continue on foot (match does not end).
- Sirens/lightbar for police; chase cam + cockpit cam (V).

### Extraction
- 4 extraction zones in the district, 2 active per match (random). Robbers see them when the alarm sounds; police get intel 60 s later.
- On-foot or vehicle extraction (rail tunnel on foot only). Entering with a bag secures it; the robber escapes and spectates teammates.

### Win conditions (`EvaluateOutcome`, unit-tested)
- **Robbers:** secured ≥ target when nobody is left in play, or at time-out.
- **Police:** target becomes unreachable (enough recovered), all robbers arrested/escaped with secured < target, time-out with secured < target, or surrender deal.
- **Forfeit:** a team with nobody connected for 30 s loses. Both empty → abandoned.

## 4. Keeping both teams engaged
- Police pre-alarm: patrol, CCTV console at the station, suspicious-activity report at 50 % suspicion, can call in robbers they see armed (shout).
- Robbers pre-alarm: equipment run, manager keycard, lockpicking, camera loop — every quiet step reduces suspicion risk.
- Response: robbers juggle drill jams, bagging, hostages, negotiation and route choice; police juggle perimeter, negotiation, rescue, spike strips, pursuit.
- Police respawn keeps eliminated officers busy driving back; arrested robbers can be broken out; escaped robbers spectate teammates only.
- Planned (roadmap): police patrol side-events (traffic stops / minor calls) and robber "prep objectives" with small rewards, AI-fill bots for low-population lobbies.

## 5. Controls (defaults, rebindable)
WASD move · Mouse look · Shift sprint · Ctrl crouch · Space jump · E interact (hold) · LMB fire / lockpick tension · RMB aim · R reload · **V camera FP/TP** · Q shoulder swap · H surrender · X mask · G drop/throw bag · F shout/intimidate · T trunk · Z gadget · N negotiation · MMB tactical ping · Tab scoreboard · Esc menu.
Vehicle: W/S throttle/brake · A/D steer · Space handbrake · E exit · Q siren · V cockpit view.

## 6. Scoring
Takedown 100 · arrest 200 · revive 75 · rescue 150 · lock picked 25 · vault opened 150 · drill disabled 100 · loot secured value/200 · loot recovered value/250 · escape 250 · team win 500.

## 7. Open design questions (for the creative director)
- Exact deal list and values after playtests.
- Whether downed robbers may crawl into vehicles.
- Whether to keep AI guards non-combatant (current decision: yes — keeps PvP focus).
