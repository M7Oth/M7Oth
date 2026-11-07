import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { CATALOG_BY_ID, fixedFurniture, occupiedTiles, personName, roomSize, type GameState, type PlayerProfile } from '@fls/shared';
import { useGame } from '../store';
import { useT } from '../i18n';
import { sfx } from '../audio';
import { Character, type Anim } from './Character';
import { Bed, Desk, DecorModel, Door, Kitchen, MeetingTable, Sofa, StaffDesk, useWallTexture } from './Furniture';
import { findPath, nearestFree } from './path';

// ------------------------------------------------------------------ local player controller (outside React state for perf)
export const local = {
  x: 3.5, z: 3.5, rotY: 0, path: [] as [number, number][], anim: 'idle' as Anim,
  pose: null as null | { x: number; z: number; y: number; rotY: number; anim: Anim },
  onArrive: null as null | (() => void),
};

export interface Interactable {
  id: string; kind: 'computer' | 'bed' | 'kitchen' | 'sofa' | 'coffee' | 'fun' | 'beanbag';
  stand: [number, number];
  pose: { x: number; z: number; y: number; rotY: number };
}

export function interactables(s: GameState): Interactable[] {
  const size = roomSize(s);
  const out: Interactable[] = [];
  for (const f of fixedFurniture(s)) {
    if (f.kind === 'desk') out.push({ id: 'computer', kind: 'computer', stand: [2, 1], pose: { x: 2.0, z: 1.22, y: 0, rotY: Math.PI } });
    if (f.kind === 'bed') out.push({ id: 'bed', kind: 'bed', stand: [f.x - 1, 1], pose: { x: f.x + 0.95, z: 1.35, y: 0.08, rotY: Math.PI / 2 } });
    if (f.kind === 'kitchen' || f.kind === 'coffeeBar') out.push({ id: 'kitchen', kind: 'kitchen', stand: [1, f.z + 1], pose: { x: 1.25, z: f.z + 1.4, y: 0, rotY: -Math.PI / 2 } });
    if (f.kind === 'sofa') out.push({ id: 'sofa', kind: 'sofa', stand: [f.x, f.z - 1], pose: { x: f.x + 0.75, z: f.z + 0.42, y: 0.02, rotY: Math.PI } });
  }
  for (const p of s.room.placed) {
    const it = CATALOG_BY_ID[p.itemId];
    if (!it?.model) continue;
    const kind = it.model === 'coffee' ? 'coffee' : (it.model === 'console' || it.model === 'guitar') ? 'fun' : it.model === 'beanbag' ? 'beanbag' : null;
    if (!kind) continue;
    const stand = nearestFree(size.w, size.d, occupiedTiles(s), p.x, p.z + 1);
    out.push({ id: p.uid, kind, stand, pose: { x: stand[0] + 0.5, z: stand[1] + 0.5, y: 0, rotY: Math.atan2(p.x + 0.5 - (stand[0] + 0.5), p.z + 0.5 - (stand[1] + 0.5)) } });
  }
  return out;
}

export function walkTo(s: GameState, tile: [number, number], onArrive: (() => void) | null) {
  const size = roomSize(s);
  const blocked = occupiedTiles(s);
  const from: [number, number] = [Math.max(0, Math.min(size.w - 1, Math.floor(local.x))), Math.max(0, Math.min(size.d - 1, Math.floor(local.z)))];
  let target = tile;
  if (blocked.has(`${tile[0]},${tile[1]}`)) target = nearestFree(size.w, size.d, blocked, tile[0], tile[1]);
  blocked.delete(`${from[0]},${from[1]}`);
  const path = findPath(size.w, size.d, blocked, from, target) ?? [target];
  local.pose = null;
  local.path = path.slice(1).length ? path.slice(1) : [target];
  local.onArrive = onArrive;
}

const ACT_ANIM: Record<string, Anim> = { work: 'type', sleep: 'sleep', rest: 'rest', eat: 'coffee', orderFood: 'rest', coffee: 'coffee', phone: 'phone', vacation: 'off' };

// ------------------------------------------------------------------ main scene
export function World() {
  const state = useGame((s) => s.state)!;
  const quality = useGame((s) => s.settings.quality);
  return (
    <Canvas shadows={quality === 'high'} dpr={quality === 'high' ? [1, 2] : 1} gl={{ antialias: true, preserveDrawingBuffer: true }} className="world-canvas">
      <SceneContent state={state} />
    </Canvas>
  );
}

function SceneContent({ state }: { state: GameState }) {
  const size = roomSize(state);
  const cam = useGame((s) => s.cam);
  return (
    <>
      <CameraRig w={size.w} d={size.d} mode={cam} />
      <Lighting time={state.time} w={size.w} d={size.d} />
      <RoomShell state={state} />
      <FixedFurnitureView state={state} />
      <DecorView state={state} />
      <LocalPlayer state={state} />
      <RemotePlayers state={state} />
      <Staff state={state} />
      <Placement state={state} />
      <InteractionMenu state={state} />
    </>
  );
}

function CameraRig({ w, d, mode }: { w: number; d: number; mode: 'room' | 'computer' }) {
  const ref = useRef<THREE.OrthographicCamera>(null);
  const { size } = useThree();
  const look = useRef(new THREE.Vector3(w / 2, 0.6, d / 2));
  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    const center = new THREE.Vector3(w / 2, 0.5, d / 2);
    const fit = Math.min(size.width / ((w + d) * 0.92), size.height / ((w + d) * 0.62));
    const targetLook = mode === 'computer' ? new THREE.Vector3(2, 1.15, 0.3) : center;
    const targetZoom = mode === 'computer' ? fit * 4.2 : fit;
    const k = 1 - Math.pow(0.0015, dt);
    look.current.lerp(targetLook, k);
    const dir = new THREE.Vector3(1, mode === 'computer' ? 0.75 : 1.05, 1).normalize().multiplyScalar(30);
    c.position.lerp(look.current.clone().add(dir), k);
    c.zoom += (targetZoom - c.zoom) * k;
    c.lookAt(look.current);
    c.updateProjectionMatrix();
  });
  return <OrthographicCamera ref={ref} makeDefault position={[w / 2 + 17, 18, d / 2 + 17]} zoom={60} near={0.1} far={200} />;
}

function Lighting({ time, w, d }: { time: number; w: number; d: number }) {
  const h = (time % 1440) / 60;
  const day = h >= 6.5 && h < 18.5;
  const dusk = (h >= 17 && h < 19.5) || (h >= 5.5 && h < 7.5);
  const sunI = day ? (dusk ? 1.3 : 2.1) : 0.15;
  const sunColor = dusk ? '#ffb071' : day ? '#fff2dc' : '#7d8cff';
  const amb = day ? 0.55 : 0.28;
  return (
    <>
      <color attach="background" args={[day ? '#e9dccb' : '#1b1d2b']} />
      <hemisphereLight args={[day ? '#fff6e8' : '#4b5590', '#3b2e26', amb]} />
      <directionalLight position={[w + 6, 12, d + 4]} intensity={sunI} color={sunColor} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-bias={-0.0005} />
      <pointLight position={[w / 2, 2.4, d / 2]} intensity={day ? 0.4 : 7} distance={Math.max(w, d) * 1.4} color="#ffd29a" />
    </>
  );
}

function RoomShell({ state }: { state: GameState }) {
  const size = roomSize(state);
  const wall = CATALOG_BY_ID[state.room.wall] ?? CATALOG_BY_ID.wall_cream;
  const floor = CATALOG_BY_ID[state.room.floor] ?? CATALOG_BY_ID.floor_wood;
  const wallTex = useWallTexture(wall.model ?? 'plain', wall.color);
  const floorTex = useWallTexture(floor.model ?? 'tiles', floor.color);
  const H = 2.7;
  const office = state.location === 'office';
  useEffect(() => { wallTex?.repeat.set(size.w / 2, 1.3); floorTex?.repeat.set(size.w / 2, size.d / 2); }, [wallTex, floorTex, size.w, size.d]);
  const h = (state.time % 1440) / 60;
  const day = h >= 6.5 && h < 18.5;
  const winX = office ? size.w / 2 : Math.max(3.4, (size.w - 2 + 3) / 2);
  const onFloor = (e: ThreeEvent<MouseEvent>) => {
    const g = useGame.getState();
    if (g.cam !== 'room' || g.placing || g.state?.players[g.conn!.you]?.activity?.kind === 'vacation') return;
    e.stopPropagation();
    const x = Math.floor(e.point.x), z = Math.floor(e.point.z);
    if (g.state?.players[g.conn!.you]?.activity) void g.act({ type: 'cancelActivity' });
    useGame.setState({ pendingInteract: null });
    walkTo(state, [x, z], null);
    sfx('click');
  };
  return (
    <group>
      {/* base under the diorama */}
      <mesh position={[size.w / 2, -0.16, size.d / 2]} receiveShadow><boxGeometry args={[size.w + 0.3, 0.3, size.d + 0.3]} /><meshStandardMaterial color="#3a2f2a" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[size.w / 2, 0.001, size.d / 2]} receiveShadow onClick={onFloor} name="floor">
        <planeGeometry args={[size.w, size.d]} />
        <meshStandardMaterial map={floorTex ?? undefined} color={floorTex ? '#ffffff' : floor.color} roughness={0.85} />
      </mesh>
      {/* back wall (z=0) and left wall (x=0); front walls are cut away */}
      <mesh position={[size.w / 2, H / 2, -0.05]} receiveShadow><boxGeometry args={[size.w + 0.1, H, 0.1]} /><meshStandardMaterial map={wallTex ?? undefined} color={wallTex ? '#ffffff' : wall.color} roughness={0.95} /></mesh>
      <mesh position={[-0.05, H / 2, size.d / 2]} receiveShadow><boxGeometry args={[0.1, H, size.d]} /><meshStandardMaterial map={wallTex ?? undefined} color={wallTex ? '#ffffff' : wall.color} roughness={0.95} /></mesh>
      <mesh position={[size.w / 2, 0.06, 0.01]}><boxGeometry args={[size.w, 0.12, 0.03]} /><meshStandardMaterial color="#f4efe6" /></mesh>
      <mesh position={[0.01, 0.06, size.d / 2]}><boxGeometry args={[0.03, 0.12, size.d]} /><meshStandardMaterial color="#f4efe6" /></mesh>
      {/* window with sky that follows the in-game clock */}
      <group position={[winX, 1.55, 0.01]}>
        <mesh><boxGeometry args={[1.5, 1.1, 0.05]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
        <mesh position={[0, 0, 0.03]}><planeGeometry args={[1.36, 0.96]} /><meshStandardMaterial color={day ? '#9fd3ff' : '#1d2a55'} emissive={day ? '#bfe4ff' : '#2a3b80'} emissiveIntensity={day ? 0.9 : 0.4} /></mesh>
        {!day && <mesh position={[0.35, 0.2, 0.035]}><circleGeometry args={[0.08, 16]} /><meshStandardMaterial color="#fff" emissive="#fffbe0" emissiveIntensity={1} /></mesh>}
        <mesh position={[0, 0, 0.04]}><boxGeometry args={[0.04, 0.96, 0.02]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
        <mesh position={[0, -0.6, 0.07]}><boxGeometry args={[1.6, 0.06, 0.16]} /><meshStandardMaterial color="#f4f1ea" /></mesh>
      </group>
      {office && <OfficeSign state={state} />}
    </group>
  );
}

function OfficeSign({ state }: { state: GameState }) {
  const name = state.companyName || state.saveName;
  return (
    <Html position={[0.06, 2.1, roomSize(state).d / 2]} rotation-y={Math.PI / 2} transform distanceFactor={4} style={{ pointerEvents: 'none' }}>
      <div className="office-sign">{name}</div>
    </Html>
  );
}

function FixedFurnitureView({ state }: { state: GameState }) {
  const app = useGame((s) => s.computerApp);
  const items = interactables(state);
  const click = (id: string) => (e: ThreeEvent<MouseEvent>) => {
    const g = useGame.getState();
    if (g.cam !== 'room' || g.placing) return;
    e.stopPropagation();
    const it = items.find((x) => x.id === id);
    if (!it) return;
    sfx('click');
    useGame.setState({ pendingInteract: null });
    walkTo(state, it.stand, () => useGame.setState({ pendingInteract: id }));
  };
  return (
    <group>
      {fixedFurniture(state).map((f) => (
        <group key={f.id} position={[f.x, 0, f.z]}>
          {f.kind === 'desk' && <group onClick={click('computer')}><Desk eq={state.equipment} glow={!!app} /></group>}
          {f.kind === 'bed' && <group onClick={click('bed')}><Bed /></group>}
          {f.kind === 'kitchen' && <group onClick={click('kitchen')}><Kitchen /></group>}
          {f.kind === 'coffeeBar' && <group onClick={click('kitchen')}><Kitchen bar /></group>}
          {f.kind === 'sofa' && <group onClick={click('sofa')}><Sofa /></group>}
          {f.kind === 'door' && <Door />}
          {f.kind === 'staffDesk' && <StaffDesk color={['#d9c4a5', '#cfd6df', '#e3d0c0'][f.index! % 3]} />}
          {f.kind === 'meeting' && <MeetingTable />}
        </group>
      ))}
    </group>
  );
}

function DecorView({ state }: { state: GameState }) {
  const placing = useGame((s) => s.placing);
  const items = interactables(state);
  return (
    <group>
      {state.room.placed.map((p) => {
        const it = CATALOG_BY_ID[p.itemId];
        if (!it || placing?.uid === p.uid) return null;
        const [fw, fd] = it.footprint ?? [1, 1];
        const [w, d] = p.rot % 2 === 0 ? [fw, fd] : [fd, fw];
        const inter = items.find((x) => x.id === p.uid);
        return (
          <group key={p.uid} position={[p.x + w / 2, 0, p.z + d / 2]} rotation-y={-p.rot * Math.PI / 2}
            onClick={(e) => {
              const g = useGame.getState();
              if (g.panel === 'decor') { e.stopPropagation(); useGame.setState({ placing: { itemId: p.itemId, rot: p.rot, uid: p.uid } }); return; }
              if (!inter || g.cam !== 'room') return;
              e.stopPropagation();
              sfx('click');
              walkTo(state, inter.stand, () => useGame.setState({ pendingInteract: inter.id }));
            }}>
            <group position={[-fw / 2, 0, -fd / 2]}><DecorModel model={it.model ?? ''} color={it.color} /></group>
          </group>
        );
      })}
    </group>
  );
}

function Placement({ state }: { state: GameState }) {
  const placing = useGame((s) => s.placing);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const size = roomSize(state);
  if (!placing) return null;
  const it = CATALOG_BY_ID[placing.itemId];
  const [fw, fd] = it.footprint ?? [1, 1];
  const [w, d] = placing.rot % 2 === 0 ? [fw, fd] : [fd, fw];
  const occ = occupiedTiles(state, placing.uid ?? null);
  let valid = false;
  if (hover) {
    const [x, z] = hover;
    valid = x >= 0 && z >= 0 && x + w <= size.w && z + d <= size.d;
    if (valid && it.model !== 'rug') for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (occ.has(`${x + i},${z + j}`)) valid = false;
    if (valid && it.model === 'rug') for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (occ.has(`${x + i},${z + j}`) && fixedFurniture(state).some((f) => x + i >= f.x && x + i < f.x + f.w && z + j >= f.z && z + j < f.z + f.d)) valid = false;
  }
  const place = async () => {
    if (!hover || !valid) { sfx('error'); return; }
    const g = useGame.getState();
    const ok = placing.uid
      ? await g.act({ type: 'movePlaced', uid: placing.uid, x: hover[0], z: hover[1], rot: placing.rot })
      : await g.act({ type: 'place', itemId: placing.itemId, x: hover[0], z: hover[1], rot: placing.rot });
    if (ok) { sfx('pop'); useGame.setState({ placing: null }); }
  };
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[size.w / 2, 0.02, size.d / 2]}
        onPointerMove={(e) => { e.stopPropagation(); setHover([Math.floor(e.point.x - (w - 1) / 2), Math.floor(e.point.z - (d - 1) / 2)]); }}
        onClick={(e) => { e.stopPropagation(); void place(); }}>
        <planeGeometry args={[size.w, size.d]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <gridHelper args={[Math.max(size.w, size.d), Math.max(size.w, size.d), '#ffffff', '#ffffff']} position={[Math.max(size.w, size.d) / 2, 0.015, Math.max(size.w, size.d) / 2]} material-transparent material-opacity={0.25} />
      {hover && (
        <group position={[hover[0] + w / 2, 0, hover[1] + d / 2]} rotation-y={-placing.rot * Math.PI / 2}>
          <group position={[-fw / 2, 0, -fd / 2]}><DecorModel model={it.model ?? ''} color={it.color} /></group>
          <mesh rotation-x={-Math.PI / 2} position-y={0.03}><planeGeometry args={[w, d]} /><meshBasicMaterial color={valid ? '#3ddc84' : '#ff4d4d'} transparent opacity={0.45} /></mesh>
        </group>
      )}
    </group>
  );
}

function LocalPlayer({ state }: { state: GameState }) {
  const g = useRef<THREE.Group>(null);
  const you = useGame((s) => s.conn?.you ?? '');
  const me = state.players[you];
  const [anim, setAnim] = useState<Anim>('idle');
  const items = interactables(state);
  const activity = me?.activity?.kind ?? null;
  const T = useT();
  const lastSent = useRef(0);

  // snap into the pose for the current activity
  useEffect(() => {
    if (!activity) { if (local.pose) { local.pose = null; } return; }
    const near = (id: string) => items.find((x) => x.id === id || x.kind === id);
    let spot: Interactable | undefined;
    if (activity === 'work') spot = near('computer');
    else if (activity === 'sleep') spot = near('bed') ?? near('sofa');
    else if (activity === 'rest' || activity === 'orderFood') spot = items.find((x) => x.kind === 'beanbag' && Math.hypot(x.stand[0] - local.x, x.stand[1] - local.z) < 2) ?? near('sofa');
    else if (activity === 'eat' || activity === 'coffee') spot = items.find((x) => x.kind === 'coffee' && Math.hypot(x.stand[0] - local.x, x.stand[1] - local.z) < 2) ?? near('kitchen');
    if (spot && activity !== 'phone') {
      local.path = [];
      local.pose = { ...spot.pose, anim: ACT_ANIM[activity] };
      local.x = spot.pose.x; local.z = spot.pose.z;
    } else local.pose = { x: local.x, z: local.z, y: 0, rotY: local.rotY, anim: ACT_ANIM[activity] };
  }, [activity]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const grp = g.current;
    if (!grp) return;
    let a: Anim = 'idle';
    if (local.pose) {
      grp.position.set(local.pose.x, local.pose.y, local.pose.z);
      grp.rotation.y = local.pose.rotY;
      a = local.pose.anim;
    } else if (local.path.length) {
      const [tx, tz] = local.path[0];
      const px = tx + 0.5, pz = tz + 0.5;
      const dx = px - local.x, dz = pz - local.z;
      const dist = Math.hypot(dx, dz);
      const energy = me?.needs.energy ?? 80;
      const speed = 2.3 * (0.55 + 0.45 * Math.min(1, energy / 50));
      if (dist < 0.05) {
        local.path.shift();
        if (!local.path.length && local.onArrive) { const f = local.onArrive; local.onArrive = null; f(); }
      } else {
        const step = Math.min(dist, speed * dt);
        local.x += (dx / dist) * step; local.z += (dz / dist) * step;
        const target = Math.atan2(dx, dz);
        let diff = target - local.rotY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        local.rotY += diff * Math.min(1, dt * 12);
        a = 'walk';
      }
      grp.position.set(local.x, 0, local.z);
      grp.rotation.y = local.rotY;
    } else {
      grp.position.set(local.x, 0, local.z);
      grp.rotation.y = local.rotY;
    }
    if (a !== local.anim) { local.anim = a; setAnim(a); }
    const now = performance.now();
    if (now - lastSent.current > 150) {
      lastSent.current = now;
      const tgt = local.path[local.path.length - 1];
      useGame.getState().conn?.sendPresence({ x: local.x, z: local.z, tx: tgt ? tgt[0] + 0.5 : local.x, tz: tgt ? tgt[1] + 0.5 : local.z, anim: a });
    }
  });
  if (!me) return null;
  const bubble = me.burnout ? '😵' : me.needs.hunger > 75 ? '🍔' : me.needs.energy < 20 ? '💤' : activity === 'orderFood' ? '🛵' : null;
  return (
    <group ref={g} visible={activity !== 'vacation'}>
      <Character appearance={me.appearance} anim={anim} name={Object.keys(state.players).length > 1 ? me.name : undefined} highlight bubble={bubble} />
      {activity === 'vacation' && <Html center position={[0, 1, 0]}><div className="char-bubble">🏖️ {T('في إجازة', 'On vacation')}</div></Html>}
    </group>
  );
}

function RemotePlayers({ state }: { state: GameState }) {
  const presence = useGame((s) => s.presence);
  const you = useGame((s) => s.conn?.you ?? '');
  return (
    <>
      {Object.values(state.players).filter((p) => p.id !== you && presence[p.id]?.online).map((p) => <RemotePlayer key={p.id} p={p} state={state} />)}
    </>
  );
}

function RemotePlayer({ p, state }: { p: PlayerProfile; state: GameState }) {
  const g = useRef<THREE.Group>(null);
  const pos = useRef({ x: 3, z: 3, rot: 0 });
  const pres = useGame((s) => s.presence[p.id]);
  const items = interactables(state);
  const act = p.activity?.kind;
  useFrame((_, dt) => {
    const grp = g.current;
    if (!grp || !pres) return;
    let tx = pres.x, tz = pres.z, y = 0, rot = pos.current.rot;
    if (act === 'work') { const c = items.find((x) => x.kind === 'computer')!; tx = c.pose.x + 0.55; tz = c.pose.z + 0.2; rot = Math.PI; }
    const dx = tx - pos.current.x, dz = tz - pos.current.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 4) { pos.current.x = tx; pos.current.z = tz; }
    else if (dist > 0.01) {
      const step = Math.min(dist, 2.6 * dt);
      pos.current.x += (dx / dist) * step; pos.current.z += (dz / dist) * step;
      if (dist > 0.05 && act !== 'work') rot = Math.atan2(dx, dz);
    }
    pos.current.rot += (rot - pos.current.rot) * Math.min(1, dt * 10);
    grp.position.set(pos.current.x, y, pos.current.z);
    grp.rotation.y = pos.current.rot;
  });
  const anim: Anim = act === 'work' ? 'type' : act ? ACT_ANIM[act] ?? 'idle' : (pres?.anim as Anim) ?? 'idle';
  const bubble = pres?.work ? `⌨️ ${Math.round(pres.work.pct)}%` : null;
  return <group ref={g}><Character appearance={p.appearance} anim={anim} name={`${p.name}`} bubble={bubble} seed={p.id.length} /></group>;
}

function Staff({ state }: { state: GameState }) {
  const lang = useGame((s) => s.settings.lang);
  if (state.location !== 'office') return null;
  const h = (state.time % 1440) / 60;
  if (h < 8 || h >= 20) return null;
  const desks = fixedFurniture(state).filter((f) => f.kind === 'staffDesk');
  return (
    <>
      {state.employees.map((e, i) => {
        const d = desks[i];
        if (!d) return null;
        const working = !!e.taskId && e.trainingUntil <= state.time;
        const icon = e.role === 'coordinator' ? '📇' : e.role === 'pm' ? '📋' : e.raiseRequest ? '💰' : e.satisfaction < 30 ? '😠' : e.trainingUntil > state.time ? '🎓' : null;
        return (
          <group key={e.id} position={[d.x + 1, 0, d.z + 1.12]} rotation-y={Math.PI}>
            <Character appearance={e.appearance} anim={working || e.role !== 'creative' ? 'type' : 'sit'} name={personName(e.name, lang)} seed={i * 1.7} bubble={icon} />
          </group>
        );
      })}
    </>
  );
}

function InteractionMenu({ state }: { state: GameState }) {
  const pending = useGame((s) => s.pendingInteract);
  const T = useT();
  const items = interactables(state);
  const it = items.find((x) => x.id === pending);
  const act = useGame((s) => s.act);
  if (!it) return null;
  const close = () => useGame.setState({ pendingInteract: null });
  const run = (fn: () => void) => () => { close(); fn(); };
  const opts: { label: string; fn: () => void }[] = [];
  if (it.kind === 'computer') {
    // open the computer immediately; no menu
    setTimeout(() => {
      close();
      void act({ type: 'activity', kind: 'work' }).then((ok) => { if (ok) { useGame.setState({ cam: 'computer' }); setTimeout(() => useGame.setState({ computerApp: 'desktop' }), 650); } });
    });
    return null;
  }
  if (it.kind === 'bed') opts.push({ label: T('😴 نوم (8 ساعات)', '😴 Sleep (8h)'), fn: () => void act({ type: 'activity', kind: 'sleep' }) });
  if (it.kind === 'kitchen') {
    opts.push({ label: T('🍳 وجبة سريعة (25 ر.س)', '🍳 Quick meal (SAR 25)'), fn: () => void act({ type: 'activity', kind: 'eat' }) });
    opts.push({ label: T('☕ قهوة', '☕ Coffee'), fn: () => void act({ type: 'activity', kind: 'coffee' }) });
  }
  if (it.kind === 'coffee') opts.push({ label: T('☕ إسبريسو مجاني', '☕ Free espresso'), fn: () => void act({ type: 'activity', kind: 'coffee' }) });
  if (it.kind === 'sofa' || it.kind === 'beanbag') {
    opts.push({ label: T('🛋️ استرخاء 30 دقيقة', '🛋️ Relax 30 min'), fn: () => void act({ type: 'activity', kind: 'rest' }) });
    opts.push({ label: T('🎮 لعبة الأفكار', '🎮 Idea Catcher game'), fn: () => void act({ type: 'activity', kind: 'rest' }).then((ok) => ok && useGame.setState({ panel: 'phone' })) });
    if (state.location === 'office' && it.kind === 'sofa') opts.push({ label: T('😴 قيلولة', '😴 Nap'), fn: () => void act({ type: 'activity', kind: 'sleep' }) });
  }
  if (it.kind === 'fun') opts.push({ label: T('🎸 استراحة ممتعة', '🎸 Fun break'), fn: () => void act({ type: 'activity', kind: 'phone' }).then((ok) => ok && useGame.setState({ panel: 'phone' })) });
  return (
    <Html position={[it.stand[0] + 0.5, 1.8, it.stand[1] + 0.5]} center zIndexRange={[50, 40]}>
      <div className="interact-menu">
        {opts.map((o) => <button key={o.label} onClick={run(o.fn)}>{o.label}</button>)}
        <button className="ghost" onClick={close}>✕</button>
      </div>
    </Html>
  );
}
