# Multiplayer Architecture

## 1. Model
- **Server-authoritative**, Unreal replication (actor/property replication + RPCs). Listen server for friends/private rooms and Quick Play fallback; **dedicated server target** (`HeistResponseServer.Target.cs`, needs a source-built engine) for public hosting.
- Tick/net rates: server 60 Hz, client net 60 Hz, 100 KB/s per client cap (`DefaultEngine.ini`).
- Engine-independent rule models (`Source/HeistResponse/Rules`) run **only on the server** inside `AHRGameMode`; clients see their results through `AHRGameState`, `AHRPlayerState` and actor properties.

## 2. Authority map
| System | Authority | Client sees | Client → server |
|---|---|---|---|
| Match phase/clock/result | GameMode (`FMatchConfig`, `EvaluateOutcome`) | GameState `Phase`, `PhaseEndServerTime`, `Winner`, `EndReason` | — |
| Lobby team/ready | GameMode `RequestTeamChange`/`SetPlayerReady` (balance rules) | PlayerState `Team`, `bReady`, GameState countdown | `ServerSelectTeam`, `ServerSetReady` |
| Alarm/suspicion/dispatch | GameMode `FAlarmModel` | GameState `bAlarmRaised`, `Suspicion01`, `DispatchServerTime` | — |
| Interactions | `UHRInteractionComponent` server: range, eye-LOS, `CanInteract` at start & every tick, move/damage cancel | owner-only `Active` (progress) | `ServerBeginInteract(Actor)`, `ServerCancelInteract` |
| Inventory | `UHRInventoryComponent` (mutations require authority) | owner-only `Items` | none (only via interactions) |
| Lockpicking | `UHRLockpickComponent` server `FLockpickModel` (solution never replicated) | owner-only `FHRLockpickView` | `ServerLockpickInput(angle,tension)` unreliable 20 Hz, `ServerCancel` |
| Doors/vault | actor state replicated; visuals interpolate locally | `DoorState`, `VaultState`, `DrillProgress` | via interactions |
| Loot | GameMode `FLootLedger` (ledger first, then actor) | bag actor `Carrier`, replicated movement; GameState totals | via interactions / `ServerDropBag` / `ServerTrunkAction` |
| Combat | `UHRWeaponComponent::ServerFire` (rate limit, ammo, server spread, eye-origin trace), `UHRHealthComponent` | `Health`, `LifeState`, `AmmoInMag`; multicast cosmetic FX (unreliable) | `ServerFire(camLoc, dir)` unreliable, `ServerReload` |
| Movement | CharacterMovement with prediction; sprint/aim as compressed flags (`FSavedMove_HR`) | standard | standard moves |
| Vehicles | Chaos vehicle replication (server physics, client prediction for driver); seats/health/siren/trunk on server | `Driver`, `Passengers`, `Health`, `bSirenOn`, `TrunkCount` | possession inputs, `ServerExitVehicle`, `ServerToggleSiren` |
| NPCs | server state machine at 5 Hz | `NPCState`, `Detection` | via interactions / shouts |
| Negotiation | GameMode `FNegotiationModel` | GameState `FHRNegotiationView` | `ServerProposeDeal`, `ServerRespondDeal` |
| Pings | GameMode → teammates only (anti-spam 0.8 s) | `ClientReceivePing` | `ServerPing` |
| CCTV | server sets view target on PC (relevancy follows) | overlay | via console interaction, `ServerCCTVCycle/Exit` |

## 3. Anti-cheat / fairness measures in code
- Every Server RPC re-validates state (team, alive, arrested, distance, LOS, cooldowns, enum ranges, finite floats).
- Shots: camera origin must be within 5.2 m of the eyes; aim point resolved along the camera ray **from the eye's projection** (nothing behind the player); bullet traced from muzzle/eyes → third-person corner-peek cannot hit what the body cannot see. Fire rate limited at 80 % of spec interval to absorb jitter.
- Interactions validated from the eyes with LOS each tick (no using objects through walls).
- Lockpick solution never leaves the server; client only gets closeness/progress/stress.
- Loot ledger invariants checked after every change (`ensure`), fuzz-tested in CI.
- Movement: engine correction + `bMovementTimeDiscrepancyDetection`.
- Team-only spectating (`CanSpectate`), team-only pings and zone intel.
- **Known gap / planned:** third-person *visual* peek (seeing around corners) is mitigated (shoulder swap, camera collision), not eliminated. Planned: Iris/relevancy filter that withholds enemy pawn positions when there is no line of sight from the viewer's eyes and they are > 15 m apart (fog-of-war replication). Evaluate after first playtests for cost.

## 4. Disconnects & reconnection
- `AGameMode` inactive PlayerStates (300 s): reconnecting players with the same unique net id regain team, arrest/escape status and stats (`CopyProperties`/`OverrideWith`).
- Logout drops carried bags (ledger + actor), releases driven vehicles.
- Team absent for 30 s → forfeit; both teams absent → abandoned.
- Network/travel failures are captured in `UHRGameInstance` and shown on the main menu.

## 5. Sessions (`UHRSessionSubsystem`)
- **Quick Play:** find public sessions with matching `HR_BUILD`, free slots, sorted by ping → join best; none → host a public listen session.
- **Private room:** advertised with `HR_PRIVATE=1` + 6-char `HR_ROOMCODE` (no 0/O/1/I). Friends use *Join by code*; platform invites work when the subsystem supports them (`bAllowInvites`).
- **Browser:** public sessions list (host, players, ping), join.
- Version gate: `HR_BUILD` query + client-side filter (Null subsystem ignores some filters).
- Lobby = `WaitingToStart` in the match map; majority ready starts a 10 s countdown (3 s if everyone ready). Rematch: majority vote at the summary → `RestartGame()`; otherwise host returns to menu (dedicated servers always restart).

## 6. Public internet multiplayer — real requirements
| Need | Option | Cost | Status |
|---|---|---|---|
| Matchmaking/session discovery over internet | **Epic Online Services** (Sessions/Lobbies, P2P NAT relay) via `OnlineSubsystemEOS` | Free | Config scaffolded (`DefaultEngine.ini`), **needs owner to create product in Epic Developer Portal** and fill ProductId/SandboxId/DeploymentId/ClientId/Secret (private credentials → owner action) |
| Player identity | EOS Connect (device id / Epic account) | Free | pending credentials |
| Listen-server play through NAT | EOS P2P (`NetDriverEOS`, `bIsUsingP2PSockets=true`) | Free | add NetDriverEOS definitions when switching `DefaultPlatformService=EOS` |
| Dedicated servers | Source-built UE + Linux server build; host on e.g. Hetzner/OVH VPS (~€5–20/month for a few 8-player instances) or AWS GameLift / Edgegap for autoscaling (pay per use) | owner approval needed | target exists; not built |
| Distribution | Steam (US$100 app fee) or Epic Games Store / itch.io | owner decision | — |
Local LAN/PIE testing (Null subsystem) **does not prove** internet matchmaking; that requires the EOS setup above plus a test with two machines on different networks.

### Switching to EOS (when credentials exist)
```ini
[OnlineSubsystem]
DefaultPlatformService=EOS
[OnlineSubsystemEOS]
bEnabled=true
[/Script/OnlineSubsystemEOS.EOSSettings]
; filled from the Epic Developer Portal - never commit secrets to a public repo
[/Script/Engine.Engine]
!NetDriverDefinitions=ClearArray
+NetDriverDefinitions=(DefName="GameNetDriver",DriverClassName="/Script/OnlineSubsystemEOS.NetDriverEOS",DriverClassNameFallback="/Script/OnlineSubsystemUtils.IpNetDriver")
```

## 7. Testing multiplayer during development
- PIE: Net Mode *Play As Listen Server*, Number of Players 2–8, "Run Under One Process" off for realistic timing.
- Network emulation: Editor Preferences → Level Editor → Play → Network Emulation (e.g. 120 ms, 2 % loss), or console `NetEmulation.PktLag 120`, `NetEmulation.PktLoss 2`.
- Standalone: `UnrealEditor.exe HeistResponse.uproject /Game/HeistResponse/Maps/L_District?listen?ShortMatch -game -log -windowed -ResX=1280 -ResY=720` then `UnrealEditor.exe HeistResponse.uproject 127.0.0.1 -game -log -windowed`.
- Net profiling: `netprofile` + Network Profiler; Unreal Insights with `-trace=net,cpu,frame`.
