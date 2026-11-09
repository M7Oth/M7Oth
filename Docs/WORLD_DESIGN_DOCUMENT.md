# World Design — Al-Waha Financial District

Source of truth: `HeistResponse/Tools/CityLayout/district.json`. Validate with
`python3 HeistResponse/Tools/CityLayout/validate_layout.py --svg map.svg` (also runs in CI). The rendered plan is
`HeistResponse/Tools/CityLayout/district_map.png`.

## 1. Concept
A fictional Gulf-coast financial district at golden hour/night: glass towers and a historic bank on a central boulevard
(King Fahd Avenue), an old souq quarter, harbour warehouses, residential mid-rises, a multi-storey car park and a metro
construction site. Distinctive silhouettes per quadrant aid navigation during chases.

## 2. Scale & boundaries (measured, not arbitrary)
- Playable area 1.36 × 1.21 km (~1.65 km²), 5 avenues × 5 streets + 5 alleys, 35 road nodes.
- Natural boundaries, no invisible walls: elevated ring road (north), harbour sea wall (south), metro construction
  hoardings and cranes (east), sunken rail cutting with fences (west). Distant skyline is non-playable HLOD scenery.

## 3. Pacing numbers (from the validator)
| Check | Value | Target |
|---|---|---|
| Police response (dispatch 12 s + 1.1 km drive) | ~78 s | 35–110 s |
| Robber approach, garage → bank | ~51 s by car | short (no dead prep time) |
| Bank → harbour boat | 1.1 km (~66 s) + disjoint alternative | ≥2 disjoint routes |
| Bank → ring-road on-ramp | 1.1 km (~66 s) + alternative | ≥2 routes |
| Bank → car-park roof | 0.8 km (~48 s) + alternative | ≥2 routes |
| Bank → rail tunnel (on foot only) | 0.6 km (~97 s running) + alternative | on-foot option |
All four extractions have at least two edge-disjoint road routes, so a single roadblock never soft-locks an escape;
travel times differ enough (48–97 s) that route choice matters.

## 4. Key locations
- **Central Bank of Al-Waha** (block 462–584 × 530–690 m): public lobby with glass façade on King Fahd Ave (main entrance),
  teller counter, staff corridor (keycard, restricted), manager office (keycard NPC), security room (CCTV loop console),
  vault + strong room (5 loot piles), rear service door (lockpick) onto the bank service alley, employee door (north).
  Approaches: front (social/casing), service alley (quiet), employee door (north street), roof (planned).
- **District Police HQ** (south-east): briefing/armory crate, CCTV console, holding cell (jailbreak objective), garage with cruisers.
- **Crew garage** (north-west): robber spawn, van with lockpicks + thermal drill.
- **Tahlia Plaza**: open space in front of the bank — police perimeter, negotiation stand-offs, hostage safe points.
- **Olaya car park** (5 floors, roof extraction), harbour warehouses (boat extraction), souq alleys (on-foot escapes),
  fuel station (set-piece), hotel/towers (verticality, sightlines for police overwatch).

## 5. Gameplay layout principles
- Bank is ~1.1 km road distance from the station: police always travel, never teleport.
- Grid + alleys gives alternative routes without maze-like confusion; boulevard (24 m) favours high-speed chases,
  souq alleys favour on-foot breaks of line-of-sight.
- Extraction zones sit on different quadrants; only two are active each match (variety, no memorised routine).

## 6. Technical implementation plan
- **World Partition** for L_District (streaming grid 128 m, loading range 400 m; bank & station always-loaded data layers).
- **Nanite** for all static architecture and props; **Lumen** GI + reflections (hardware RT optional), Virtual Shadow Maps.
- **HLOD** layers for distant blocks; instanced static meshes / PCG for façade modules, street furniture, foliage.
- Data-driven placement: `build_district.py` reads district.json; production pass will replace blockout boxes with
  modular building kits placed by PCG graphs using the same rectangles.
- Collision: simple collision on façades, complex only on interiors; NavMesh covers bank, plaza, station (NPC areas).
- Ambient traffic/pedestrians: Mass AI evaluation milestone 11 (only if it holds 60 fps with 8 players).

## 7. Current state
Blockout builder written (untested in editor — see PROJECT_STATUS). No production art yet.
