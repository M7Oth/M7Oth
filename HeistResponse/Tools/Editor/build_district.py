"""
HEIST RESPONSE - district builder (Unreal Editor Python).

Builds /Game/HeistResponse/Maps/L_District from Tools/CityLayout/district.json and places every
gameplay actor the C++ systems need (team PlayerStarts, bank with vault/doors/loot/NPCs/CCTV,
police station with holding cell + CCTV console, crew garage with equipment crate, extraction
zones, nav mesh, lighting). Also creates L_MainMenu and L_Transition.

THIS IS A BLOCKOUT (TEMPORARY CONTENT): geometry is engine basic shapes with flat materials so the
full match loop can be played and tested. Every placeholder is tagged "HR_Placeholder" so the art
pass can find and replace them (see Docs/ASSET_PIPELINE.md). It is not final art.

Run inside the editor:  Tools > Execute Python Script... > Tools/Editor/build_district.py
or from the command line:
  UnrealEditor-Cmd.exe HeistResponse.uproject -run=pythonscript -script="Tools/Editor/build_district.py"
"""
import json
import os
import unreal

PROJECT_DIR = unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_dir())
LAYOUT = os.path.join(PROJECT_DIR, "Tools", "CityLayout", "district.json")
MAP_DIR = "/Game/HeistResponse/Maps"
MAT_DIR = "/Game/HeistResponse/Materials/Blockout"
M = 100.0  # meters -> cm

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assets = unreal.AssetToolsHelpers.get_asset_tools()
CUBE = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube.Cube")
PLANE = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Plane.Plane")
BASE_MAT = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial")


def hr_class(name):
    cls = unreal.load_class(None, f"/Script/HeistResponse.{name}")
    if cls is None:
        raise RuntimeError(f"C++ class {name} not found - compile the HeistResponse module first")
    return cls


_mats = {}
def mat(name, rgb):
    """Flat-colour blockout material instance (placeholder)."""
    if name in _mats:
        return _mats[name]
    path = f"{MAT_DIR}/MI_Block_{name}"
    mi = unreal.EditorAssetLibrary.load_asset(path) if unreal.EditorAssetLibrary.does_asset_exist(path) else None
    if mi is None:
        mi = assets.create_asset(f"MI_Block_{name}", MAT_DIR, unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
        unreal.MaterialEditingLibrary.set_material_instance_parent(mi, BASE_MAT)
    unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(mi, "Color", unreal.LinearColor(rgb[0], rgb[1], rgb[2], 1.0))
    unreal.EditorAssetLibrary.save_loaded_asset(mi)
    _mats[name] = mi
    return mi


def box(label, x0, y0, x1, y1, z0, z1, material, folder="Blockout", collision=True):
    """Axis-aligned box from meter coords (cube mesh is 100 cm, pivot at center)."""
    cx, cy, cz = (x0 + x1) / 2 * M, (y0 + y1) / 2 * M, (z0 + z1) / 2 * M
    a = actors.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(cx, cy, cz))
    a.set_actor_label(label)
    a.set_folder_path(f"HR/{folder}")
    a.tags = [unreal.Name("HR_Placeholder")]
    smc = a.static_mesh_component
    smc.set_static_mesh(CUBE)
    smc.set_material(0, material)
    a.set_actor_scale3d(unreal.Vector(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)))
    if not collision:
        smc.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
    return a


def spawn(cls_name, label, x, y, z=0.0, yaw=0.0, folder="Gameplay", props=None, tags=None):
    cls = hr_class(cls_name) if isinstance(cls_name, str) else cls_name
    a = actors.spawn_actor_from_class(cls, unreal.Vector(x * M, y * M, z * M), unreal.Rotator(0.0, 0.0, yaw))
    a.set_actor_label(label)
    a.set_folder_path(f"HR/{folder}")
    for k, v in (props or {}).items():
        a.set_editor_property(k, v)
    if tags:
        a.tags = [unreal.Name(t) for t in tags]
    return a


def player_start(tag, x, y, yaw=0.0):
    a = actors.spawn_actor_from_class(unreal.PlayerStart, unreal.Vector(x * M, y * M, 100.0), unreal.Rotator(0.0, 0.0, yaw))
    a.set_editor_property("player_start_tag", unreal.Name(tag))
    a.set_actor_label(f"Start_{tag}")
    a.set_folder_path("HR/Spawns")
    return a


def target_point(tag, x, y, z=0.0):
    a = actors.spawn_actor_from_class(unreal.TargetPoint, unreal.Vector(x * M, y * M, z * M + 50.0))
    a.tags = [unreal.Name(tag)]
    a.set_actor_label(f"TP_{tag}")
    a.set_folder_path("HR/Markers")
    return a


def mesh_components(actor):
    return {c.get_name(): c for c in actor.get_components_by_class(unreal.StaticMeshComponent)}


def dress_door(door, width=1.2, height=2.3, mat_leaf=None):
    comps = mesh_components(door)
    leaf = comps.get("Leaf")
    if leaf:
        leaf.set_static_mesh(CUBE)
        leaf.set_relative_scale3d(unreal.Vector(0.08, width, height))
        leaf.set_relative_location(unreal.Vector(0.0, width * 50.0, height * 50.0))
        if mat_leaf:
            leaf.set_material(0, mat_leaf)


def build_lighting():
    sun = actors.spawn_actor_from_class(unreal.DirectionalLight, unreal.Vector(0, 0, 5000), unreal.Rotator(0.0, -38.0, 135.0))
    sun.set_actor_label("Sun")
    lc = sun.get_component_by_class(unreal.DirectionalLightComponent)
    lc.set_editor_property("atmosphere_sun_light", True)
    lc.set_editor_property("intensity", 9.0)
    sky = actors.spawn_actor_from_class(unreal.SkyLight, unreal.Vector(0, 0, 4000))
    sky.get_component_by_class(unreal.SkyLightComponent).set_editor_property("real_time_capture", True)
    actors.spawn_actor_from_class(unreal.SkyAtmosphere, unreal.Vector(0, 0, 0))
    actors.spawn_actor_from_class(unreal.VolumetricCloud, unreal.Vector(0, 0, 0))
    fog = actors.spawn_actor_from_class(unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0))
    fog.get_component_by_class(unreal.ExponentialHeightFogComponent).set_editor_property("fog_density", 0.012)
    ppv = actors.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
    ppv.set_editor_property("unbound", True)
    for a in (sun, sky, fog, ppv):
        a.set_folder_path("HR/Lighting")


def build_bank(L, mats):
    bank = next(l for l in L["locations"] if l["id"] == "bank")
    x0, y0, x1, y1 = bank["rect"]
    wall, h = 0.3, 4.5
    # Shell with openings: main (east), rear service (west), employee (north).
    box("Bank_Floor", x0, y0, x1, y1, -0.2, 0.0, mats["floor"], "Bank")
    box("Bank_Roof", x0, y0, x1, y1, h * 4, h * 4 + 0.5, mats["bank"], "Bank")
    box("Bank_WallS", x0, y0, x1, y0 + wall, 0, h * 4, mats["bank"], "Bank")
    box("Bank_WallN_a", x0, y1 - wall, 520, y1, 0, h * 4, mats["bank"], "Bank")
    box("Bank_WallN_b", 526, y1 - wall, x1, y1, 0, h * 4, mats["bank"], "Bank")
    box("Bank_WallE_a", x1 - wall, y0, x1, 605, 0, h * 4, mats["glass"], "Bank")
    box("Bank_WallE_b", x1 - wall, 615, x1, y1, 0, h * 4, mats["glass"], "Bank")
    box("Bank_WallW_a", x0, y0, x0 + wall, 648, 0, h * 4, mats["bank"], "Bank")
    box("Bank_WallW_b", x0, 652, x0 + wall, y1, 0, h * 4, mats["bank"], "Bank")
    # Interior: lobby (east), counters, offices (north), security room, vault (south-west).
    box("Bank_Counter", 555, 575, 557, 645, 0, 1.1, mats["wood"], "Bank")
    box("Bank_StaffWall", 540, y0, 540.3, 600, 0, h, mats["interior"], "Bank")
    box("Bank_StaffWall_b", 540, 606, 540.3, y1, 0, h, mats["interior"], "Bank")
    box("Bank_VaultWall_N", x0, 580, 515, 580.6, 0, h, mats["vault"], "Bank")
    box("Bank_VaultWall_E_a", 514.4, y0, 515, 556, 0, h, mats["vault"], "Bank")
    box("Bank_VaultWall_E_b", 514.4, 560, 515, 580, 0, h, mats["vault"], "Bank")
    box("Bank_SecurityRoom", 520, 660, 535, 660.3, 0, h, mats["interior"], "Bank")

    # Doors
    dmat = mats["door"]
    staff = spawn("HRDoor", "Door_StaffCorridor", 540.15, 600, 0, 90, "Bank", {"restricted": True, "starts_locked": True, "key_item": unreal.Name("VaultKeycard"), "lock_pin_count": 5})
    rear = spawn("HRDoor", "Door_RearService (lockpick)", x0 + 0.15, 648, 0, 0, "Bank", {"starts_locked": True, "lock_pin_count": 4})
    emp = spawn("HRDoor", "Door_Employee", 520, y1 - 0.15, 0, 90, "Bank", {"starts_locked": True, "restricted": True, "lock_pin_count": 3})
    for d in (staff, rear, emp):
        dress_door(d, mat_leaf=dmat)

    vault = spawn("HRVault", "Vault", 514.7, 556, 0, 90, "Bank")
    for name, comp in mesh_components(vault).items():
        if name == "Door":
            comp.set_static_mesh(CUBE)
            comp.set_relative_scale3d(unreal.Vector(0.5, 4.0, 2.8))
            comp.set_relative_location(unreal.Vector(0.0, 200.0, 140.0))
            comp.set_material(0, mats["vault"])
    for i, (lx, ly) in enumerate([(480, 545), (490, 545), (500, 545), (480, 570), (500, 570)]):
        pile = spawn("HRLootPile", f"LootPile_{i}", lx, ly, 0, 0, "Bank", {"bag_count": 2, "value_per_bag": 25000})
        pile.set_editor_property("required_vault", vault)
        smc = mesh_components(pile).get("Mesh")
        if smc:
            smc.set_static_mesh(CUBE)
            smc.set_relative_scale3d(unreal.Vector(1.2, 0.8, 0.9))
            smc.set_material(0, mats["money"])

    # CCTV
    for i, (cx, cy, yaw) in enumerate([(583, 535, 135), (583, 685, -135), (545, 595, 180), (516, 585, -90)]):
        cam = spawn("HRSecurityCamera", f"CCTV_{i}", cx, cy, 3.6, yaw, "Bank")
        smc = mesh_components(cam).get("Mesh")
        if smc:
            smc.set_static_mesh(CUBE)
            smc.set_relative_scale3d(unreal.Vector(0.3, 0.15, 0.15))
    console = spawn("HRCCTVConsole", "SecurityRoom_Console", 528, 670, 0, 0, "Bank")
    smc = mesh_components(console).get("Mesh")
    if smc:
        smc.set_static_mesh(CUBE)
        smc.set_relative_scale3d(unreal.Vector(1.0, 0.6, 1.0))

    # NPCs: guards patrol, employees at counters, manager in office (vault keycard), customers.
    npc = hr_class("HRNPCCharacter")
    roles = unreal.HRNPCRole
    for i, (nx, ny, role) in enumerate([
        (575, 600, roles.GUARD), (545, 660, roles.GUARD), (550, 590, roles.EMPLOYEE), (550, 625, roles.EMPLOYEE),
        (528, 640, roles.MANAGER), (570, 560, roles.CIVILIAN), (565, 640, roles.CIVILIAN), (575, 670, roles.CIVILIAN),
    ]):
        spawn(npc, f"NPC_{i}_{str(role).split('.')[-1]}", nx, ny, 1.0, 180, "Bank/NPC", {"role": role})

    target_point("BankIncident", 600, 610)
    target_point("HostageSafePoint", 640, 600)
    target_point("HostageSafePoint", 600, 520)
    target_point("GetawayDelivery", 455, 700)

    nav = actors.spawn_actor_from_class(unreal.NavMeshBoundsVolume, unreal.Vector(540 * M, 610 * M, 200))
    nav.set_actor_scale3d(unreal.Vector(160.0, 150.0, 10.0))
    nav.set_folder_path("HR/Bank")


def build_police(L, mats):
    p = next(l for l in L["locations"] if l["id"] == "police")
    x0, y0, x1, y1 = p["rect"]
    box("Police_Floor", x0, y0, x1, y1, -0.2, 0.0, mats["floor"], "Police")
    box("Police_Block", x0 + 10, y0 + 120, x1, y1, 0, 13.5, mats["police"], "Police")
    # Holding cell (open-fronted box with a lockable door)
    box("Cell_Back", 950, 200, 975, 200.3, 0, 3, mats["interior"], "Police")
    box("Cell_L", 950, 185, 950.3, 200, 0, 3, mats["interior"], "Police")
    box("Cell_R", 974.7, 185, 975, 200, 0, 3, mats["interior"], "Police")
    box("Cell_Front_a", 950, 185, 960, 185.3, 0, 3, mats["interior"], "Police")
    box("Cell_Front_b", 962, 185, 975, 185.3, 0, 3, mats["interior"], "Police")
    cell = spawn("HRDoor", "Door_HoldingCell", 960, 185.15, 0, 90, "Police", {"starts_locked": True, "is_holding_cell": True, "lock_pin_count": 6, "police_can_breach": False})
    dress_door(cell, width=2.0, mat_leaf=mats["door"])
    console = spawn("HRCCTVConsole", "Station_CCTV", 1000, 175, 0, 0, "Police", {"robbers_can_loop": False})
    smc = mesh_components(console).get("Mesh")
    if smc:
        smc.set_static_mesh(CUBE)
        smc.set_relative_scale3d(unreal.Vector(1.5, 0.6, 1.0))
    crate = spawn("HREquipmentCrate", "Police_Armory", 1030, 175, 0, 0, "Police", {"team": unreal.HRTeam.POLICE})
    smc = mesh_components(crate).get("Mesh")
    if smc:
        smc.set_static_mesh(CUBE)
        smc.set_relative_scale3d(unreal.Vector(1.2, 0.8, 1.0))
        smc.set_material(0, mats["police"])


def build_garage(L, mats):
    g = next(l for l in L["locations"] if l["id"] == "safehouse")
    x0, y0, x1, y1 = g["rect"]
    box("Garage_Floor", x0, y0, x1, y1, -0.2, 0.0, mats["floor"], "Garage")
    box("Garage_Back", x0, y1 - 0.4, x1, y1, 0, 6, mats["garage"], "Garage")
    box("Garage_Side", x0, y0, x0 + 0.4, y1, 0, 6, mats["garage"], "Garage")
    box("Garage_Roof", x0, y0, x1, y1, 6, 6.4, mats["garage"], "Garage")
    van = spawn("HREquipmentCrate", "CrewVan_Trunk", 110, 860, 0, 0, "Garage", {"team": unreal.HRTeam.ROBBERS})
    smc = mesh_components(van).get("Mesh")
    if smc:
        smc.set_static_mesh(CUBE)
        smc.set_relative_scale3d(unreal.Vector(5.0, 2.2, 2.4))
        smc.set_material(0, mats["van"])


def build_city(L, mats):
    bx, by = L["bounds"]["x"], L["bounds"]["y"]
    box("Ground", bx[0], by[0], bx[1], by[1], -1.0, -0.2, mats["ground"], "City")
    for a in L["roads"]["avenues_x"]:
        w = a["width"] / 2
        box(f"Road_{a['name']}", a["x"] - w, -20, a["x"] + w, 1060, -0.2, 0.0, mats["asphalt"], "City/Roads")
        box(f"Sidewalk_{a['name']}_W", a["x"] - w - 3, -20, a["x"] - w, 1060, -0.2, 0.15, mats["sidewalk"], "City/Roads")
        box(f"Sidewalk_{a['name']}_E", a["x"] + w, -20, a["x"] + w + 3, 1060, -0.2, 0.15, mats["sidewalk"], "City/Roads")
    for s in L["roads"]["streets_y"]:
        w = s["width"] / 2
        box(f"Road_{s['name']}", -20, s["y"] - w, 1240, s["y"] + w, -0.19, 0.01, mats["asphalt"], "City/Roads")
    for al in L["roads"]["alleys"]:
        (x0, y0), (x1, y1) = al["from"], al["to"]
        hw = al["width"] / 2
        box(f"Alley_{al['name']}", min(x0, x1) - hw, min(y0, y1) - hw, max(x0, x1) + hw, max(y0, y1) + hw, -0.2, 0.02, mats["alley"], "City/Roads")
    colours = {"office": "office", "residential": "residential", "retail": "retail", "retail_row": "retail", "warehouse": "warehouse",
               "hotel": "office", "market": "retail", "civic": "residential", "service": "warehouse", "mixed": "residential",
               "parking_structure": "concrete"}
    for l in L["locations"]:
        if l["type"] in ("bank", "police_station", "garage", "plaza"):
            continue
        x0, y0, x1, y1 = l["rect"]
        floors = l.get("floors", 3)
        box(f"Bldg_{l['id']}", x0, y0, x1, y1, 0, floors * 3.6, mats[colours.get(l["type"], "office")], "City/Buildings")
    for b in L["boundaries"]:
        r = b["rect"]
        height = {"highway_elevated": 9, "harbor_water": 0.1, "construction_wall": 4, "rail_cutting": 3}[b["type"]]
        box(f"Boundary_{b['type']}", r[0], r[1], r[2], r[3], 0 if height > 1 else -1.5, height, mats["boundary"], "City/Boundaries")

    for z in L["extraction_zones"]:
        spawn("HRExtractionZone", f"Extraction_{z['id']}", z["pos"][0], z["pos"][1], 2, 0, "Extraction",
              {"zone_loc_key": unreal.Name(f"Zone.{z['id']}"), "allows_vehicles": z["vehicles"]})

    for p in L["spawns"]["police"]:
        player_start("Police", p[0], p[1], 180)
    for p in L["spawns"]["police_respawn"]:
        player_start("PoliceRespawn", p[0], p[1], 180)
    for p in L["spawns"]["robbers"]:
        player_start("Robbers", p[0], p[1], -90)
    for p in L["spawns"]["holding_cell"]:
        player_start("HoldingCell", p[0], p[1], 0)

    cam = actors.spawn_actor_from_class(unreal.CameraActor, unreal.Vector(760 * M, 450 * M, 6000), unreal.Rotator(0.0, -22.0, 120.0))
    cam.tags = [unreal.Name("LobbyCamera")]
    cam.set_actor_label("LobbyCamera")


def main():
    L = json.load(open(LAYOUT, encoding="utf-8"))
    mats = {
        "ground": mat("Ground", (0.05, 0.06, 0.05)), "asphalt": mat("Asphalt", (0.025, 0.027, 0.03)),
        "sidewalk": mat("Sidewalk", (0.25, 0.24, 0.22)), "alley": mat("Alley", (0.08, 0.08, 0.085)),
        "office": mat("Office", (0.18, 0.21, 0.26)), "residential": mat("Residential", (0.42, 0.36, 0.28)),
        "retail": mat("Retail", (0.35, 0.25, 0.32)), "warehouse": mat("Warehouse", (0.30, 0.26, 0.20)),
        "concrete": mat("Concrete", (0.32, 0.32, 0.33)), "boundary": mat("Boundary", (0.12, 0.12, 0.13)),
        "bank": mat("Bank", (0.62, 0.55, 0.42)), "glass": mat("Glass", (0.20, 0.32, 0.40)), "floor": mat("Floor", (0.55, 0.53, 0.50)),
        "interior": mat("Interior", (0.70, 0.68, 0.64)), "wood": mat("Wood", (0.30, 0.18, 0.10)), "vault": mat("Vault", (0.30, 0.32, 0.34)),
        "door": mat("Door", (0.22, 0.16, 0.10)), "money": mat("Money", (0.20, 0.45, 0.22)), "police": mat("Police", (0.10, 0.20, 0.45)),
        "garage": mat("Garage", (0.35, 0.30, 0.25)), "van": mat("Van", (0.80, 0.80, 0.82)),
    }

    for name in ("L_District", "L_MainMenu", "L_Transition"):
        path = f"{MAP_DIR}/{name}"
        if unreal.EditorAssetLibrary.does_asset_exist(path):
            unreal.log_warning(f"{path} exists - delete it first to rebuild (not overwriting).")
    if not unreal.EditorAssetLibrary.does_asset_exist(f"{MAP_DIR}/L_District"):
        levels.new_level(f"{MAP_DIR}/L_District")
        build_lighting()
        build_city(L, mats)
        build_bank(L, mats)
        build_police(L, mats)
        build_garage(L, mats)
        levels.save_current_level()
        unreal.log("L_District built (blockout).")

    if not unreal.EditorAssetLibrary.does_asset_exist(f"{MAP_DIR}/L_Transition"):
        levels.new_level(f"{MAP_DIR}/L_Transition")
        levels.save_current_level()

    if not unreal.EditorAssetLibrary.does_asset_exist(f"{MAP_DIR}/L_MainMenu"):
        levels.new_level(f"{MAP_DIR}/L_MainMenu")
        build_lighting()
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        world.get_world_settings().set_editor_property("default_game_mode", hr_class("HRMenuGameMode"))
        levels.save_current_level()
        unreal.log("L_MainMenu built.")


main()
