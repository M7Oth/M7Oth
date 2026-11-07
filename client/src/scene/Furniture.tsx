import { useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { CATALOG_BY_ID, type GameState } from '@fls/shared';

const W = (c: string, r = 0.7, m = 0) => <meshStandardMaterial color={c} roughness={r} metalness={m} />;

/** Player desk with computer; visuals reflect the equipped hardware. */
export function Desk({ eq, glow }: { eq: GameState['equipment']; glow?: boolean }) {
  const deskTier = CATALOG_BY_ID[eq.desk]?.tier ?? 1;
  const chairTier = CATALOG_BY_ID[eq.chair]?.tier ?? 1;
  const monTier = CATALOG_BY_ID[eq.monitor]?.tier ?? 1;
  const screens = CATALOG_BY_ID[eq.monitor]?.stats.screens ?? 1;
  const gpuTier = CATALOG_BY_ID[eq.gpu]?.tier ?? 1;
  const cpuTier = CATALOG_BY_ID[eq.cpu]?.tier ?? 1;
  const lampTier = CATALOG_BY_ID[eq.lamp]?.tier ?? 1;
  const top = deskTier === 1 ? '#c9a27a' : deskTier === 2 ? '#8a5a3b' : '#3b3f4a';
  const deskH = 0.74;
  const monW = monTier >= 4 ? 1.25 : monTier >= 2 ? 0.62 : 0.5;
  const rgb = lampTier >= 3;
  return (
    <group>
      {/* desk surface (2x1 tiles) */}
      <RoundedBox args={[1.9, 0.06, 0.8]} radius={0.02} position={[1, deskH, 0.42]} castShadow receiveShadow>{W(top, 0.6)}</RoundedBox>
      {deskTier === 3
        ? [[0.15], [1.85]].map(([x]) => <mesh key={x} position={[x, deskH / 2, 0.42]} castShadow><boxGeometry args={[0.08, deskH, 0.6]} />{W('#cfd3da', 0.3, 0.6)}</mesh>)
        : [[0.1, 0.1], [1.9, 0.1], [0.1, 0.75], [1.9, 0.75]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x, deskH / 2, z]} castShadow><boxGeometry args={[0.06, deskH, 0.06]} />{W(deskTier === 2 ? '#5d3c27' : '#9a7a5a')}</mesh>)}
      {deskTier >= 2 && <mesh position={[1, deskH - 0.25, 0.1]} castShadow><boxGeometry args={[1.8, 0.4, 0.04]} />{W(top, 0.7)}</mesh>}
      {/* monitors */}
      {Array.from({ length: screens >= 3 ? 1 : screens }).map((_, i) => {
        const x = screens === 2 ? 0.68 + i * 0.66 : 1;
        return (
          <group key={i} position={[x, deskH + 0.03, 0.22]} rotation-y={screens === 2 ? (i === 0 ? 0.18 : -0.18) : 0}>
            <mesh position={[0, 0.12, 0]} castShadow><boxGeometry args={[0.06, 0.24, 0.05]} />{W('#2a2d35', 0.4, 0.4)}</mesh>
            <mesh position={[0, 0.02, 0.02]}><boxGeometry args={[0.24, 0.02, 0.16]} />{W('#2a2d35', 0.4, 0.4)}</mesh>
            <RoundedBox args={[monW, monW * 0.58, 0.04]} radius={0.015} position={[0, 0.32 + monW * 0.1, 0.03]} castShadow>{W('#16181e', 0.3, 0.3)}</RoundedBox>
            <mesh position={[0, 0.32 + monW * 0.1, 0.052]}>
              <planeGeometry args={[monW * 0.93, monW * 0.52]} />
              <meshStandardMaterial color={glow ? '#7fb3ff' : '#2a4a7a'} emissive={glow ? '#5a8dff' : '#20385e'} emissiveIntensity={glow ? 1.1 : 0.6} />
            </mesh>
          </group>
        );
      })}
      {/* keyboard + mouse */}
      <RoundedBox args={[0.46, 0.025, 0.15]} radius={0.01} position={[1, deskH + 0.045, 0.6]} castShadow>{W(eq.keyboard === 'keyboard_2' ? '#2b2b33' : '#d9d9de', 0.5)}</RoundedBox>
      {eq.keyboard === 'keyboard_2' && <mesh position={[1, deskH + 0.06, 0.6]}><boxGeometry args={[0.42, 0.006, 0.11]} /><meshStandardMaterial color="#222" emissive="#ff4fa3" emissiveIntensity={0.5} /></mesh>}
      <mesh position={[1.38, deskH + 0.05, 0.62]} castShadow><sphereGeometry args={[0.04, 12, 8]} />{W(eq.mouse === 'mouse_2' ? '#3a3a48' : '#e2e2e2')}</mesh>
      {eq.headset === 'headset_2' && <mesh position={[0.35, deskH + 0.12, 0.5]} rotation-x={Math.PI / 2}><torusGeometry args={[0.09, 0.02, 8, 18, Math.PI]} />{W('#1c1c1c')}</mesh>}
      {/* PC tower: grows and glows with CPU/GPU tier */}
      <group position={[1.75, 0, 0.45]}>
        <RoundedBox args={[0.22, 0.42 + cpuTier * 0.04, 0.45]} radius={0.02} position={[0, 0.23 + cpuTier * 0.02, 0]} castShadow>{W(gpuTier >= 3 ? '#1b1d26' : '#d8d9dd', 0.4, 0.2)}</RoundedBox>
        {gpuTier >= 2 && <mesh position={[-0.112, 0.25 + cpuTier * 0.02, 0]} rotation-y={-Math.PI / 2}><planeGeometry args={[0.38, 0.3 + cpuTier * 0.03]} /><meshStandardMaterial color="#111" emissive={gpuTier >= 3 ? '#9b5cff' : '#3fd1ff'} emissiveIntensity={0.8} transparent opacity={0.9} /></mesh>}
      </group>
      {/* lamp */}
      {lampTier >= 2 && (
        <group position={[0.2, deskH + 0.03, 0.25]}>
          <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.07, 0.08, 0.03, 16]} />{W('#222')}</mesh>
          <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.012, 0.012, 0.38, 8]} />{W('#222')}</mesh>
          <mesh position={[0.05, 0.38, 0.03]} rotation-z={-0.6}><coneGeometry args={[0.08, 0.12, 16, 1, true]} /><meshStandardMaterial color={rgb ? '#ff7ad9' : '#f6d38a'} emissive={rgb ? '#ff4fd8' : '#ffc66b'} emissiveIntensity={0.8} side={THREE.DoubleSide} /></mesh>
          <pointLight position={[0.06, 0.32, 0.06]} intensity={rgb ? 2.5 : 1.6} distance={2.6} color={rgb ? '#ff7ae1' : '#ffcf86'} />
        </group>
      )}
      {rgb && <mesh position={[1, deskH - 0.01, 0.06]}><boxGeometry args={[1.8, 0.015, 0.015]} /><meshStandardMaterial color="#000" emissive="#40e0ff" emissiveIntensity={2} /></mesh>}
      {/* mug */}
      <mesh position={[0.45, deskH + 0.08, 0.62]} castShadow><cylinderGeometry args={[0.045, 0.04, 0.1, 14]} />{W('#f2efe8')}</mesh>
      {/* chair */}
      <group position={[1, 0, 1.25]}>
        <Chair tier={chairTier} />
      </group>
    </group>
  );
}

export function Chair({ tier }: { tier: number }) {
  if (tier === 1) return (
    <group>
      <RoundedBox args={[0.42, 0.05, 0.42]} radius={0.02} position={[0, 0.44, 0]} castShadow>{W('#e9e4da', 0.5)}</RoundedBox>
      <RoundedBox args={[0.42, 0.4, 0.05]} radius={0.02} position={[0, 0.66, 0.2]} castShadow>{W('#e9e4da', 0.5)}</RoundedBox>
      {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x, 0.22, z]}><cylinderGeometry args={[0.02, 0.02, 0.44, 6]} />{W('#bdb6aa')}</mesh>)}
    </group>
  );
  const col = tier === 2 ? '#30343f' : tier === 3 ? '#4a6d8c' : '#c33a3a';
  return (
    <group>
      <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.28, 0.28, 0.03, 5]} />{W('#1d1f24', 0.3, 0.6)}</mesh>
      <mesh position={[0, 0.24, 0]}><cylinderGeometry args={[0.03, 0.03, 0.38, 8]} />{W('#888', 0.3, 0.8)}</mesh>
      <RoundedBox args={[0.5, 0.09, 0.48]} radius={0.04} position={[0, 0.46, 0]} castShadow>{W(col, 0.8)}</RoundedBox>
      <RoundedBox args={[0.48, tier >= 3 ? 0.66 : 0.5, 0.08]} radius={0.04} position={[0, tier >= 3 ? 0.84 : 0.76, 0.23]} rotation-x={-0.12} castShadow>{W(col, 0.8)}</RoundedBox>
      {tier >= 3 && <RoundedBox args={[0.3, 0.12, 0.1]} radius={0.04} position={[0, 1.2, 0.27]} castShadow>{W(tier === 4 ? '#1d1d1d' : col)}</RoundedBox>}
      {tier >= 3 && [-0.27, 0.27].map((x) => <RoundedBox key={x} args={[0.06, 0.05, 0.3]} radius={0.02} position={[x, 0.64, 0.02]}>{W('#22252c')}</RoundedBox>)}
    </group>
  );
}

export function Bed() {
  return (
    <group>
      <RoundedBox args={[1.9, 0.3, 2.9]} radius={0.05} position={[1, 0.2, 1.5]} castShadow receiveShadow>{W('#8b5e3c')}</RoundedBox>
      <RoundedBox args={[1.8, 0.2, 2.75]} radius={0.08} position={[1, 0.44, 1.52]} castShadow>{W('#f3f0ea', 0.9)}</RoundedBox>
      <RoundedBox args={[1.82, 0.08, 1.7]} radius={0.04} position={[1, 0.56, 2.0]} castShadow>{W('#5f86b5', 0.9)}</RoundedBox>
      <RoundedBox args={[0.7, 0.14, 0.4]} radius={0.06} position={[0.55, 0.6, 0.4]} castShadow>{W('#ffffff', 0.9)}</RoundedBox>
      <RoundedBox args={[0.7, 0.14, 0.4]} radius={0.06} position={[1.45, 0.6, 0.4]} castShadow>{W('#ffffff', 0.9)}</RoundedBox>
      <RoundedBox args={[1.95, 0.8, 0.1]} radius={0.04} position={[1, 0.55, 0.05]} castShadow>{W('#6e4a2f')}</RoundedBox>
    </group>
  );
}

export function Kitchen({ bar }: { bar?: boolean }) {
  return (
    <group>
      <RoundedBox args={[0.9, 0.86, bar ? 1.9 : 1.15]} radius={0.03} position={[0.47, 0.43, bar ? 1 : 0.6]} castShadow receiveShadow>{W(bar ? '#2e3440' : '#f2efe9', 0.5)}</RoundedBox>
      <mesh position={[0.47, 0.88, bar ? 1 : 0.6]} castShadow><boxGeometry args={[0.95, 0.04, bar ? 1.95 : 1.2]} />{W(bar ? '#c7a77a' : '#5b5f66', 0.4)}</mesh>
      {!bar && (
        <>
          <RoundedBox args={[0.8, 1.9, 0.78]} radius={0.04} position={[0.45, 0.95, 1.58]} castShadow>{W('#dfe3e8', 0.3, 0.3)}</RoundedBox>
          <mesh position={[0.86, 1.2, 1.3]}><boxGeometry args={[0.02, 0.5, 0.04]} />{W('#888', 0.3, 0.8)}</mesh>
          <mesh position={[0.86, 0.5, 1.3]}><boxGeometry args={[0.02, 0.3, 0.04]} />{W('#888', 0.3, 0.8)}</mesh>
        </>
      )}
      <mesh position={[0.45, 0.96, 0.3]} castShadow><cylinderGeometry args={[0.1, 0.1, 0.12, 16]} />{W('#c0392b')}</mesh>
      <mesh position={[0.4, 0.98, 0.8]} castShadow><boxGeometry args={[0.3, 0.16, 0.24]} />{W('#222', 0.3, 0.5)}</mesh>
      {bar && [0.4, 1.0, 1.6].map((z) => <mesh key={z} position={[0.5, 0.95, z]}><cylinderGeometry args={[0.04, 0.035, 0.1, 10]} />{W('#fff')}</mesh>)}
    </group>
  );
}

export function Sofa() {
  return (
    <group>
      <RoundedBox args={[1.9, 0.4, 0.85]} radius={0.08} position={[1, 0.25, 0.45]} castShadow receiveShadow>{W('#3f6f73', 0.9)}</RoundedBox>
      <RoundedBox args={[1.9, 0.55, 0.22]} radius={0.08} position={[1, 0.55, 0.82]} castShadow>{W('#3f6f73', 0.9)}</RoundedBox>
      <RoundedBox args={[0.22, 0.5, 0.85]} radius={0.08} position={[0.1, 0.45, 0.45]} castShadow>{W('#376367', 0.9)}</RoundedBox>
      <RoundedBox args={[0.22, 0.5, 0.85]} radius={0.08} position={[1.9, 0.45, 0.45]} castShadow>{W('#376367', 0.9)}</RoundedBox>
      <RoundedBox args={[0.4, 0.3, 0.12]} radius={0.06} position={[0.5, 0.6, 0.68]} rotation-x={-0.3} castShadow>{W('#e8b44a', 0.9)}</RoundedBox>
    </group>
  );
}

export function Door() {
  return (
    <group>
      <mesh position={[0.04, 1.05, 0.5]} castShadow><boxGeometry args={[0.06, 2.1, 0.9]} />{W('#7a5236')}</mesh>
      <mesh position={[0.09, 1.0, 0.82]}><sphereGeometry args={[0.035, 10, 10]} />{W('#d4af37', 0.3, 0.8)}</mesh>
    </group>
  );
}

export function StaffDesk({ color = '#d9c4a5' }: { color?: string }) {
  return (
    <group>
      <RoundedBox args={[1.8, 0.05, 0.75]} radius={0.02} position={[1, 0.74, 0.4]} castShadow receiveShadow>{W(color, 0.6)}</RoundedBox>
      {[0.15, 1.85].map((x) => <mesh key={x} position={[x, 0.37, 0.4]}><boxGeometry args={[0.06, 0.74, 0.6]} />{W('#e8e8ea', 0.4, 0.3)}</mesh>)}
      <group position={[1, 0.77, 0.2]}>
        <mesh position={[0, 0.1, 0]}><boxGeometry args={[0.05, 0.2, 0.05]} />{W('#2a2d35')}</mesh>
        <RoundedBox args={[0.62, 0.36, 0.04]} radius={0.012} position={[0, 0.33, 0.03]}>{W('#16181e')}</RoundedBox>
        <mesh position={[0, 0.33, 0.052]}><planeGeometry args={[0.58, 0.32]} /><meshStandardMaterial color="#9ec3ff" emissive="#4a7fe0" emissiveIntensity={0.7} /></mesh>
      </group>
      <RoundedBox args={[0.42, 0.02, 0.14]} radius={0.01} position={[1, 0.78, 0.58]}>{W('#2b2b33')}</RoundedBox>
      <group position={[1, 0, 1.15]}><Chair tier={2} /></group>
    </group>
  );
}

export function MeetingTable() {
  return (
    <group>
      <RoundedBox args={[2.8, 0.07, 1.5]} radius={0.04} position={[1.5, 0.74, 1]} castShadow receiveShadow>{W('#f5f2ec', 0.3)}</RoundedBox>
      <mesh position={[1.5, 0.37, 1]}><cylinderGeometry args={[0.12, 0.3, 0.74, 16]} />{W('#2b2d33', 0.3, 0.6)}</mesh>
      {[0.6, 1.5, 2.4].flatMap((x) => [0.05, 1.95].map((z) => (
        <group key={`${x}${z}`} position={[x, 0, z]} rotation-y={z < 1 ? Math.PI : 0}><Chair tier={2} /></group>
      )))}
      <mesh position={[1.5, 1.5, 0.04]}><boxGeometry args={[2.0, 1.1, 0.04]} />{W('#1c1f27', 0.4)}</mesh>
      <mesh position={[1.5, 1.5, 0.065]}><planeGeometry args={[1.9, 1.0]} /><meshStandardMaterial color="#2c3e66" emissive="#3b5fae" emissiveIntensity={0.5} /></mesh>
    </group>
  );
}

/** Decor models, all original primitives. Origin is the tile corner; footprint w×d. */
export function DecorModel({ model, color }: { model: string; color?: string }) {
  switch (model) {
    case 'plant': return (<group position={[0.5, 0, 0.5]}><mesh position={[0, 0.15, 0]} castShadow><cylinderGeometry args={[0.16, 0.12, 0.3, 14]} />{W('#c96f4a')}</mesh>{[0, 1, 2, 3, 4].map((i) => <mesh key={i} position={[Math.cos(i * 1.3) * 0.08, 0.42 + (i % 2) * 0.08, Math.sin(i * 1.3) * 0.08]} castShadow><sphereGeometry args={[0.13, 10, 10]} />{W(i % 2 ? '#3f9a57' : '#2f7e47', 0.9)}</mesh>)}</group>);
    case 'bigplant': return (<group position={[0.5, 0, 0.5]}><mesh position={[0, 0.22, 0]} castShadow><cylinderGeometry args={[0.22, 0.18, 0.44, 16]} />{W('#efe9df')}</mesh><mesh position={[0, 0.75, 0]}><cylinderGeometry args={[0.025, 0.03, 0.7, 6]} />{W('#5b4330')}</mesh>{Array.from({ length: 8 }).map((_, i) => <mesh key={i} position={[Math.cos(i) * 0.22, 1.05 + Math.sin(i * 2) * 0.12, Math.sin(i) * 0.22]} rotation={[Math.sin(i) * 0.6, i, Math.cos(i) * 0.6]} castShadow><sphereGeometry args={[0.2, 8, 6]} />{W('#2f8a4e', 0.9)}</mesh>)}</group>);
    case 'cactus': return (<group position={[0.5, 0, 0.5]}><mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.12, 0.1, 0.2, 12]} />{W('#d98a4f')}</mesh><mesh position={[0, 0.38, 0]} castShadow><capsuleGeometry args={[0.08, 0.3, 6, 10]} />{W('#4f9a5a')}</mesh><mesh position={[0.1, 0.42, 0]} rotation-z={-0.8}><capsuleGeometry args={[0.045, 0.12, 4, 8]} />{W('#4f9a5a')}</mesh></group>);
    case 'shelf': return (<group position={[0.5, 0, 0.15]}>{[0.4, 0.9, 1.4].map((y) => <mesh key={y} position={[0, y, 0]} castShadow><boxGeometry args={[0.9, 0.04, 0.28]} />{W('#a87b54')}</mesh>)}{[-0.43, 0.43].map((x) => <mesh key={x} position={[x, 0.75, 0]}><boxGeometry args={[0.04, 1.5, 0.28]} />{W('#a87b54')}</mesh>)}{[0, 1, 2, 3].map((i) => <mesh key={i} position={[-0.3 + i * 0.12, 0.53, 0]} castShadow><boxGeometry args={[0.08, 0.22, 0.2]} />{W(['#d35d47', '#4b7bd8', '#e8b44a', '#41a36b'][i])}</mesh>)}<mesh position={[0.2, 1.02, 0]}><sphereGeometry args={[0.08, 10, 10]} />{W('#7b6cff')}</mesh></group>);
    case 'bookcase': return (<group position={[1, 0, 0.2]}><RoundedBox args={[1.9, 1.9, 0.38]} radius={0.02} position={[0, 0.95, 0]} castShadow>{W('#6e4a2f')}</RoundedBox>{[0.35, 0.8, 1.25, 1.7].map((y) => Array.from({ length: 11 }).map((_, i) => <mesh key={`${y}${i}`} position={[-0.8 + i * 0.15 + (y * 7 % 3) * 0.01, y - 0.05, 0.05]}><boxGeometry args={[0.1, 0.3 - (i % 3) * 0.04, 0.26]} />{W(['#c0504d', '#4f81bd', '#9bbb59', '#f79646', '#8064a2', '#e8e0d0'][(i + Math.round(y * 10)) % 6])}</mesh>))}</group>);
    case 'rug': return (<mesh position={[1, 0.012, 1]} rotation-x={-Math.PI / 2} receiveShadow><circleGeometry args={[0.95, 40]} /><meshStandardMaterial color={color ?? '#b4553f'} roughness={1} /></mesh>);
    case 'floorlamp': return (<group position={[0.5, 0, 0.5]}><mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.16, 0.18, 0.04, 16]} />{W('#222')}</mesh><mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.015, 0.015, 1.55, 8]} />{W('#222')}</mesh><mesh position={[0, 1.6, 0]}><cylinderGeometry args={[0.16, 0.24, 0.3, 20, 1, true]} /><meshStandardMaterial color="#f5e6c8" emissive="#ffcf86" emissiveIntensity={0.6} side={THREE.DoubleSide} /></mesh><pointLight position={[0, 1.5, 0]} intensity={2} distance={3.5} color="#ffcf86" /></group>);
    case 'beanbag': return (<group position={[0.5, 0, 0.5]}><mesh position={[0, 0.24, 0]} scale={[1, 0.7, 1]} castShadow><sphereGeometry args={[0.38, 20, 16]} />{W(color ?? '#e0a040', 1)}</mesh></group>);
    case 'coffee': return (<group position={[0.5, 0, 0.5]}><RoundedBox args={[0.6, 0.8, 0.5]} radius={0.03} position={[0, 0.4, 0]} castShadow>{W('#e7e2da')}</RoundedBox><RoundedBox args={[0.42, 0.42, 0.34]} radius={0.04} position={[0, 1.02, 0]} castShadow>{W('#2c2c30', 0.3, 0.6)}</RoundedBox><mesh position={[0, 0.93, 0.18]}><cylinderGeometry args={[0.04, 0.035, 0.08, 10]} />{W('#ffffff')}</mesh><mesh position={[0.12, 1.1, 0.171]}><circleGeometry args={[0.03, 10]} /><meshStandardMaterial color="#000" emissive="#ff3b3b" emissiveIntensity={1.5} /></mesh></group>);
    case 'guitar': return (<group position={[0.5, 0, 0.3]} rotation-z={0.12}><mesh position={[0, 0.35, 0]} scale={[1, 1.2, 0.35]} castShadow><sphereGeometry args={[0.2, 16, 12]} />{W('#c47a2c')}</mesh><mesh position={[0, 0.85, 0]}><boxGeometry args={[0.05, 0.6, 0.03]} />{W('#3a2516')}</mesh><mesh position={[0, 0.38, 0.072]}><circleGeometry args={[0.06, 14]} />{W('#2a1a10')}</mesh></group>);
    case 'console': return (<group position={[1, 0, 0.3]}><RoundedBox args={[1.6, 0.4, 0.45]} radius={0.03} position={[0, 0.2, 0]} castShadow>{W('#2f2a26')}</RoundedBox><RoundedBox args={[1.4, 0.8, 0.05]} radius={0.02} position={[0, 0.88, -0.05]} castShadow>{W('#111')}</RoundedBox><mesh position={[0, 0.88, -0.022]}><planeGeometry args={[1.34, 0.74]} /><meshStandardMaterial color="#6fd3ff" emissive="#3a7cff" emissiveIntensity={0.7} /></mesh><RoundedBox args={[0.3, 0.06, 0.22]} radius={0.02} position={[0.45, 0.43, 0.05]}>{W('#f2f2f2')}</RoundedBox></group>);
    case 'whiteboard': return (<group position={[1, 0, 0.1]}><mesh position={[0, 1.3, 0]} castShadow><boxGeometry args={[1.6, 0.95, 0.04]} />{W('#f7f7f5', 0.2)}</mesh><mesh position={[-0.3, 1.4, 0.025]}><planeGeometry args={[0.5, 0.04]} />{W('#2f6fdf')}</mesh><mesh position={[0.3, 1.2, 0.025]}><planeGeometry args={[0.6, 0.04]} />{W('#e25b45')}</mesh>{[-0.7, 0.7].map((x) => <mesh key={x} position={[x, 0.42, 0]}><boxGeometry args={[0.04, 0.85, 0.04]} />{W('#999', 0.3, 0.7)}</mesh>)}</group>);
    case 'aquarium': return (<group position={[1, 0, 0.35]}><RoundedBox args={[1.6, 0.6, 0.55]} radius={0.02} position={[0, 0.3, 0]} castShadow>{W('#2b2b2b')}</RoundedBox><mesh position={[0, 0.9, 0]}><boxGeometry args={[1.5, 0.6, 0.5]} /><meshPhysicalMaterial color="#6fc8ff" transmission={0.6} transparent opacity={0.55} roughness={0.05} /></mesh>{[0, 1, 2].map((i) => <mesh key={i} position={[-0.4 + i * 0.4, 0.85 + (i % 2) * 0.12, 0.05]}><sphereGeometry args={[0.05, 8, 8]} />{W(['#ff8c3a', '#ffd23a', '#ff4f7a'][i])}</mesh>)}<pointLight position={[0, 1.1, 0.3]} intensity={0.8} distance={2.2} color="#5ec8ff" /></group>);
    case 'awards': return (<group position={[0.5, 0, 0.2]}><mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[0.8, 0.9, 0.3]} />{W('#3c2f2a')}</mesh>{[-0.22, 0, 0.22].map((x, i) => <mesh key={x} position={[x, 1.03, 0]} castShadow><coneGeometry args={[0.07, 0.25, 12]} />{W(['#d4af37', '#c0c0c0', '#cd7f32'][i], 0.25, 0.9)}</mesh>)}</group>);
    case 'poster': return (<group position={[0.5, 0, 0.05]}><mesh position={[0, 0.5, 0]}><boxGeometry args={[0.06, 1, 0.06]} />{W('#5a4636')}</mesh><mesh position={[0, 1.25, 0]} castShadow><boxGeometry args={[0.7, 0.9, 0.04]} />{W('#f4ead8')}</mesh><mesh position={[0, 1.25, 0.022]}><circleGeometry args={[0.2, 20]} />{W('#e76f51')}</mesh><mesh position={[0.1, 1.15, 0.023]}><circleGeometry args={[0.12, 3]} />{W('#2a9d8f')}</mesh></group>);
  }
  return <mesh position={[0.5, 0.25, 0.5]}><boxGeometry args={[0.5, 0.5, 0.5]} />{W('#999')}</mesh>;
}

export function useWallTexture(model?: string, color = '#efe3cf') {
  return useMemo(() => {
    if (!model) return null;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = color; g.fillRect(0, 0, 256, 256);
    if (model === 'stripes') { g.fillStyle = 'rgba(255,255,255,0.35)'; for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 12, 256); }
    if (model === 'geo') { g.strokeStyle = '#d4a017'; g.lineWidth = 3; for (let x = -256; x < 512; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 128, 128); g.lineTo(x, 256); g.stroke(); } }
    if (model === 'brick') { g.fillStyle = 'rgba(255,255,255,0.18)'; for (let y = 0; y < 256; y += 32) { g.fillRect(0, y, 256, 3); for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) g.fillRect(x, y, 3, 32); } }
    if (model === 'tiles') { g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 3; for (let x = 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(256, x); g.stroke(); } }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [model, color]);
}
