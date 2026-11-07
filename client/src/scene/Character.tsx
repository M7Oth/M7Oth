import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox, Text } from '@react-three/drei';
import type { Group } from 'three';
import type { Appearance } from '@fls/shared';

export type Anim = 'idle' | 'walk' | 'sit' | 'type' | 'sleep' | 'eat' | 'phone' | 'coffee' | 'rest' | 'off';

interface Props { appearance: Appearance; anim: Anim; name?: string; seed?: number; highlight?: boolean; bubble?: string | null }

/** A small stylised procedural character with simple procedural animation. Original model built from primitives. */
export function Character({ appearance: a, anim, name, seed = 0, highlight, bubble }: Props) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const lArm = useRef<Group>(null), rArm = useRef<Group>(null);
  const lLeg = useRef<Group>(null), rLeg = useRef<Group>(null);
  const phone = useRef<Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const set = (g: Group | null, x: number, z = 0) => { if (g) { g.rotation.x = x; g.rotation.z = z; } };
    const seated = anim === 'sit' || anim === 'type' || anim === 'rest' || anim === 'eat';
    if (body.current) {
      body.current.position.y = seated ? -0.2 : anim === 'walk' ? Math.abs(Math.sin(t * 9)) * 0.03 : Math.sin(t * 2) * 0.006;
      body.current.rotation.x = anim === 'rest' ? -0.25 : 0;
    }
    if (root.current) {
      root.current.rotation.z = anim === 'sleep' ? Math.PI / 2 : 0;
      root.current.position.y = anim === 'sleep' ? 0.55 : 0;
      root.current.position.x = anim === 'sleep' ? 0.3 : 0;
    }
    if (head.current) {
      head.current.rotation.x = anim === 'phone' ? 0.35 : anim === 'type' ? 0.08 + Math.sin(t * 1.3) * 0.03 : Math.sin(t * 0.7) * 0.03;
      head.current.rotation.y = anim === 'idle' ? Math.sin(t * 0.4) * 0.25 : 0;
    }
    switch (anim) {
      case 'walk': {
        const s = Math.sin(t * 9) * 0.6;
        set(lLeg.current, s); set(rLeg.current, -s); set(lArm.current, -s * 0.8); set(rArm.current, s * 0.8);
        break;
      }
      case 'type':
        set(lLeg.current, -1.5); set(rLeg.current, -1.5);
        set(lArm.current, -1.15 + Math.sin(t * 14) * 0.08); set(rArm.current, -1.15 + Math.sin(t * 14 + 1.7) * 0.08);
        break;
      case 'sit': case 'rest':
        set(lLeg.current, -1.5); set(rLeg.current, -1.5); set(lArm.current, -0.2, 0.1); set(rArm.current, -0.2, -0.1);
        break;
      case 'eat':
        set(lLeg.current, -1.5); set(rLeg.current, -1.5); set(lArm.current, -0.6); set(rArm.current, -1.6 - Math.max(0, Math.sin(t * 3)) * 0.6);
        break;
      case 'phone': case 'coffee':
        set(lLeg.current, 0); set(rLeg.current, 0); set(lArm.current, 0.05); set(rArm.current, -1.5);
        break;
      case 'sleep':
        set(lLeg.current, 0); set(rLeg.current, 0); set(lArm.current, 0, 0.15); set(rArm.current, 0, -0.15);
        break;
      default:
        set(lLeg.current, 0); set(rLeg.current, 0); set(lArm.current, Math.sin(t * 2) * 0.04, 0.05); set(rArm.current, -Math.sin(t * 2) * 0.04, -0.05);
    }
    if (phone.current) phone.current.visible = anim === 'phone' || anim === 'coffee';
  });

  const skin = a.skin, shirt = a.shirt, pants = a.pants, hair = a.hair;
  return (
    <group ref={root}>
      {highlight && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <ringGeometry args={[0.28, 0.34, 32]} />
          <meshBasicMaterial color="#ffd36b" transparent opacity={0.8} />
        </mesh>
      )}
      <group ref={body}>
        {/* legs pivot at the hips */}
        <group ref={lLeg} position={[-0.085, 0.42, 0]}>
          <RoundedBox args={[0.13, 0.42, 0.14]} radius={0.04} position={[0, -0.21, 0]} castShadow><meshStandardMaterial color={pants} /></RoundedBox>
          <RoundedBox args={[0.14, 0.07, 0.2]} radius={0.03} position={[0, -0.41, 0.03]} castShadow><meshStandardMaterial color="#2a2522" /></RoundedBox>
        </group>
        <group ref={rLeg} position={[0.085, 0.42, 0]}>
          <RoundedBox args={[0.13, 0.42, 0.14]} radius={0.04} position={[0, -0.21, 0]} castShadow><meshStandardMaterial color={pants} /></RoundedBox>
          <RoundedBox args={[0.14, 0.07, 0.2]} radius={0.03} position={[0, -0.41, 0.03]} castShadow><meshStandardMaterial color="#2a2522" /></RoundedBox>
        </group>
        {/* torso */}
        <RoundedBox args={[0.34, 0.4, 0.2]} radius={0.07} position={[0, 0.62, 0]} castShadow><meshStandardMaterial color={shirt} roughness={0.8} /></RoundedBox>
        {/* arms pivot at shoulders */}
        <group ref={lArm} position={[-0.215, 0.79, 0]}>
          <RoundedBox args={[0.1, 0.36, 0.11]} radius={0.04} position={[0, -0.17, 0]} castShadow><meshStandardMaterial color={shirt} roughness={0.8} /></RoundedBox>
          <mesh position={[0, -0.37, 0]} castShadow><sphereGeometry args={[0.055, 12, 12]} /><meshStandardMaterial color={skin} /></mesh>
        </group>
        <group ref={rArm} position={[0.215, 0.79, 0]}>
          <RoundedBox args={[0.1, 0.36, 0.11]} radius={0.04} position={[0, -0.17, 0]} castShadow><meshStandardMaterial color={shirt} roughness={0.8} /></RoundedBox>
          <mesh position={[0, -0.37, 0]} castShadow><sphereGeometry args={[0.055, 12, 12]} /><meshStandardMaterial color={skin} /></mesh>
          <group ref={phone} position={[0, -0.42, 0.04]}>
            <RoundedBox args={[0.07, 0.12, 0.015]} radius={0.007}><meshStandardMaterial color="#15171f" emissive="#3a6bff" emissiveIntensity={0.4} /></RoundedBox>
          </group>
        </group>
        {/* head */}
        <group ref={head} position={[0, 0.98, 0]}>
          <RoundedBox args={[0.3, 0.3, 0.28]} radius={0.1} castShadow><meshStandardMaterial color={skin} roughness={0.7} /></RoundedBox>
          <mesh position={[-0.065, 0.02, 0.141]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
          <mesh position={[0.065, 0.02, 0.141]}><sphereGeometry args={[0.022, 8, 8]} /><meshStandardMaterial color="#1b1b1b" /></mesh>
          <mesh position={[0, -0.07, 0.142]} rotation-z={Math.PI}><torusGeometry args={[0.035, 0.008, 6, 12, Math.PI]} /><meshStandardMaterial color="#7a3b2e" /></mesh>
          <Hair style={a.hairStyle} color={hair} />
          {a.accessory === 1 && (
            <group position={[0, 0.02, 0.15]}>
              <mesh position={[-0.065, 0, 0]}><torusGeometry args={[0.045, 0.009, 6, 16]} /><meshStandardMaterial color="#222" /></mesh>
              <mesh position={[0.065, 0, 0]}><torusGeometry args={[0.045, 0.009, 6, 16]} /><meshStandardMaterial color="#222" /></mesh>
            </group>
          )}
          {a.accessory === 2 && (
            <group position={[0, 0.15, 0.02]}>
              <mesh><cylinderGeometry args={[0.16, 0.16, 0.06, 20]} /><meshStandardMaterial color={shirt} /></mesh>
              <mesh position={[0, -0.02, 0.15]} rotation-x={0.2}><boxGeometry args={[0.24, 0.015, 0.14]} /><meshStandardMaterial color={shirt} /></mesh>
            </group>
          )}
          {a.accessory === 3 && (
            <group>
              <mesh position={[0, 0.05, 0]} rotation-z={Math.PI / 2}><torusGeometry args={[0.165, 0.018, 8, 20, Math.PI]} /><meshStandardMaterial color="#202020" /></mesh>
              <mesh position={[-0.165, -0.02, 0]}><cylinderGeometry args={[0.06, 0.06, 0.05, 14]} /><meshStandardMaterial color="#e25b45" /></mesh>
              <mesh position={[0.165, -0.02, 0]}><cylinderGeometry args={[0.06, 0.06, 0.05, 14]} /><meshStandardMaterial color="#e25b45" /></mesh>
            </group>
          )}
        </group>
      </group>
      {name && (
        <Text position={[0, 1.38, 0]} fontSize={0.12} color="#ffffff" outlineWidth={0.012} outlineColor="#1a1a1a" anchorX="center" anchorY="middle">{name}</Text>
      )}
      {bubble && (
        <Text position={[0, 1.55, 0]} fontSize={0.16} anchorX="center" anchorY="middle">{bubble}</Text>
      )}
    </group>
  );
}

function Hair({ style, color }: { style: number; color: string }) {
  const m = <meshStandardMaterial color={color} roughness={0.9} />;
  switch (style) {
    case 1: // long
      return (
        <group>
          <RoundedBox args={[0.33, 0.12, 0.31]} radius={0.05} position={[0, 0.13, 0]}>{m}</RoundedBox>
          <RoundedBox args={[0.34, 0.3, 0.1]} radius={0.04} position={[0, -0.02, -0.12]}>{m}</RoundedBox>
        </group>
      );
    case 2: // curly
      return (
        <group>
          {[-0.1, 0, 0.1].map((x) => [-0.08, 0.05].map((z) => (
            <mesh key={`${x}${z}`} position={[x, 0.15, z]}><sphereGeometry args={[0.08, 10, 10]} />{m}</mesh>
          )))}
        </group>
      );
    case 3: // shemagh-like head wrap
      return (
        <group>
          <RoundedBox args={[0.34, 0.12, 0.32]} radius={0.05} position={[0, 0.14, 0]}><meshStandardMaterial color="#f2f2f2" /></RoundedBox>
          <RoundedBox args={[0.36, 0.34, 0.08]} radius={0.03} position={[0, -0.02, -0.13]}><meshStandardMaterial color="#d23b3b" /></RoundedBox>
          <mesh position={[0, 0.2, 0]} rotation-x={Math.PI / 2}><torusGeometry args={[0.13, 0.02, 8, 24]} /><meshStandardMaterial color="#151515" /></mesh>
        </group>
      );
    default: // short
      return <RoundedBox args={[0.32, 0.1, 0.3]} radius={0.05} position={[0, 0.14, -0.01]}>{m}</RoundedBox>;
  }
}
