import { useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { COLORS, LIGHT_NAMES, MAT_NAMES, MATS, PRIM_NAMES, PRIMS, sceneOps, type Mat, type Prim, type SceneDoc, type SObject } from '@fls/shared';
import { useL, useT } from '../i18n';
import { sfx } from '../audio';
import type { EditorProps } from '../ui/Computer';

const TONE = { neutral: '#ffffff', warm: '#ffc78a', cool: '#9cc8ff' };

function MatFor({ m, color }: { m: Mat; color: string }) {
  switch (m) {
    case 'metal': return <meshStandardMaterial color={color} metalness={0.95} roughness={0.22} />;
    case 'wood': return <meshStandardMaterial color={color === '#e0e0e0' || color === '#cccccc' ? '#a0703f' : color} roughness={0.85} />;
    case 'glass': return <meshPhysicalMaterial color={color} transmission={0.85} roughness={0.05} thickness={0.5} transparent opacity={0.6} />;
    case 'glow': return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.3} />;
    case 'marble': return <meshStandardMaterial color={color === '#cccccc' ? '#f1efe9' : color} roughness={0.25} metalness={0.05} />;
    default: return <meshStandardMaterial color={color} roughness={0.5} />;
  }
}

function Obj({ o, sel, onSelect }: { o: SObject; sel: boolean; onSelect: () => void }) {
  const y = o.kind === 'torus' ? 0.3 * o.scale : 0.5 * o.scale;
  return (
    <group position={[o.x, y, o.z]} rotation-y={(o.rotY * Math.PI) / 180} scale={o.scale} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <mesh castShadow receiveShadow rotation-x={o.kind === 'torus' ? Math.PI / 2 : 0}>
        {o.kind === 'cube' && <boxGeometry args={[0.9, 0.9, 0.9]} />}
        {o.kind === 'sphere' && <sphereGeometry args={[0.5, 32, 24]} />}
        {o.kind === 'cylinder' && <cylinderGeometry args={[0.35, 0.45, 1, 32]} />}
        {o.kind === 'cone' && <coneGeometry args={[0.5, 1, 32]} />}
        {o.kind === 'torus' && <torusGeometry args={[0.45, 0.18, 16, 40]} />}
        <MatFor m={o.material} color={o.color} />
      </mesh>
      {sel && <mesh rotation-x={-Math.PI / 2} position-y={-y / o.scale + 0.01}><ringGeometry args={[0.62, 0.7, 40]} /><meshBasicMaterial color="#ffd36b" /></mesh>}
    </group>
  );
}

export function SceneEditor({ doc: d, setDoc, zoom, sloppy }: EditorProps) {
  const doc = d as SceneDoc;
  const T = useT();
  const L = useL();
  const [sel, setSel] = useState<string>('hero');
  const o = doc.objects.find((x) => x.id === sel);
  const set = (p: Partial<SObject>) => o && setDoc(sceneOps.set(doc, o.id, p));
  const onGround = (e: ThreeEvent<MouseEvent>) => {
    if (!o || !e.shiftKey) return;
    const j = sloppy && Math.random() < 0.3 ? 0.5 : 0;
    set({ x: Math.round(e.point.x * 2) / 2 + j, z: Math.round(e.point.z * 2) / 2 });
  };
  return (
    <div className="se" data-testid="scene-editor">
      <div className="se-tools">
        <h5>➕ {T('إضافة مجسم', 'Add object')}</h5>
        {PRIMS.map((p) => <button key={p} className="btn tiny wide" onClick={() => { const nd = sceneOps.add(doc, p as Prim); setDoc(nd); setSel(nd.objects[nd.objects.length - 1].id); sfx('pop'); }}>+ {L(PRIM_NAMES[p])}</button>)}
        <h5>🧱 {T('المشهد', 'Scene')}</h5>
        {doc.objects.map((x) => <button key={x.id} className={`layer-btn ${sel === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>{L(x.label)}</button>)}
      </div>
      <div className="se-view">
        <Canvas shadows camera={{ position: [5.5, 5, 7], fov: 40 / (0.85 + zoom * 0.15) }}>
          <color attach="background" args={[doc.bg]} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[4, 7, 5]} intensity={1.8 * doc.light.intensity} color={TONE[doc.light.tone]} castShadow />
          {doc.light.rim && <directionalLight position={[-4, 3, -6]} intensity={2.2} color="#9fe0ff" />}
          <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={onGround}><circleGeometry args={[6, 64]} /><meshStandardMaterial color="#3a3f4c" /></mesh>
          <gridHelper args={[10, 20, '#5a6070', '#454a58']} position-y={0.005} />
          <RoundedBox args={[0.12, 0.02, 0.12]} position={[0, 0.01, 0]}><meshBasicMaterial color="#ff5" /></RoundedBox>
          {doc.objects.map((x) => <Obj key={x.id} o={x} sel={x.id === sel} onSelect={() => setSel(x.id)} />)}
          <OrbitControls enablePan={false} minDistance={5} maxDistance={14} maxPolarAngle={1.35} />
        </Canvas>
        <div className="muted tiny overlay-tip">{T('اسحب لتدوير المشهد · Shift + نقرة على الأرض لنقل المجسم المحدد', 'Drag to orbit · Shift+click the floor to move the selected object')}</div>
      </div>
      <div className="se-props">
        {o && (
          <>
            <h5>⚙️ {L(o.label)}</h5>
            {(['x', 'z'] as const).map((k) => (
              <label key={k}>{k.toUpperCase()} = {o[k]}<input type="range" min={-5} max={5} step={0.5} value={o[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} data-testid={`obj-${k}`} /></label>
            ))}
            <label>{T('الحجم', 'Scale')} = {o.scale}<input type="range" min={0.25} max={3} step={0.25} value={o.scale} onChange={(e) => set({ scale: Number(e.target.value) })} /></label>
            <label>{T('الدوران', 'Rotation')} = {o.rotY}°<input type="range" min={0} max={360} step={15} value={o.rotY} onChange={(e) => set({ rotY: Number(e.target.value) })} /></label>
            <label>{T('الخامة', 'Material')}<select value={o.material} onChange={(e) => set({ material: e.target.value as Mat })}>{MATS.map((m) => <option key={m} value={m}>{L(MAT_NAMES[m])}</option>)}</select></label>
            <span className="lbl">{T('اللون', 'Color')}</span>
            <div className="swatches">{COLORS.map((c) => <button key={c.hex} title={L(c.name)} className={o.color === c.hex ? 'on' : ''} style={{ background: c.hex }} onClick={() => set({ color: c.hex })} />)}</div>
            {o.id !== 'hero' && <button className="btn tiny" onClick={() => { setDoc(sceneOps.remove(doc, o.id)); setSel('hero'); }}>🗑 {T('حذف', 'Delete')}</button>}
          </>
        )}
        <h5>💡 {T('الإضاءة', 'Lighting')}</h5>
        <div className="seg">{(['neutral', 'warm', 'cool'] as const).map((tn) => <button key={tn} className={doc.light.tone === tn ? 'on' : ''} onClick={() => setDoc(sceneOps.light(doc, { tone: tn }))}>{L(LIGHT_NAMES[tn])}</button>)}</div>
        <label className="chk"><input type="checkbox" checked={doc.light.rim} onChange={(e) => setDoc(sceneOps.light(doc, { rim: e.target.checked }))} /> {T('إضاءة خلفية (Rim)', 'Rim light')}</label>
        <label>{T('شدة الإضاءة', 'Intensity')}<input type="range" min={0.3} max={2} step={0.1} value={doc.light.intensity} onChange={(e) => setDoc(sceneOps.light(doc, { intensity: Number(e.target.value) }))} /></label>
      </div>
    </div>
  );
}
