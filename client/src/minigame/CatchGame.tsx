import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { sfx } from '../audio';

/** "Idea Catcher": catch falling light-bulbs (ideas), avoid bugs. A short fun break that restores passion. */
export function CatchGame({ onDone }: { onDone: (score: number) => void }) {
  const T = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [score, setScore] = useState(0);
  const W = 300, H = 380;
  useEffect(() => {
    if (phase !== 'play') return;
    const c = ref.current!;
    const g = c.getContext('2d')!;
    let px = W / 2, raf = 0, sc = 0;
    const start = performance.now();
    let last = start, spawn = 0;
    const items: { x: number; y: number; v: number; good: boolean }[] = [];
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => keys.add(e.key), ku = (e: KeyboardEvent) => keys.delete(e.key);
    const mv = (e: PointerEvent) => { const r = c.getBoundingClientRect(); px = ((e.clientX - r.left) / r.width) * W; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); c.addEventListener('pointermove', mv);
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const elapsed = (now - start) / 1000;
      if (keys.has('ArrowLeft')) px -= 320 * dt;
      if (keys.has('ArrowRight')) px += 320 * dt;
      px = Math.max(30, Math.min(W - 30, px));
      spawn -= dt;
      if (spawn <= 0) { items.push({ x: 20 + Math.random() * (W - 40), y: -20, v: 120 + elapsed * 6 + Math.random() * 60, good: Math.random() > 0.25 }); spawn = 0.45 - Math.min(0.25, elapsed * 0.008); }
      for (const it of items) it.y += it.v * dt;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.y > H - 46 && it.y < H - 20 && Math.abs(it.x - px) < 38) { sc += it.good ? 1 : -2; sfx(it.good ? 'pop' : 'error'); items.splice(i, 1); }
        else if (it.y > H + 20) items.splice(i, 1);
      }
      const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#2b2350'); grd.addColorStop(1, '#5a3d7a');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      g.font = '26px serif'; g.textAlign = 'center';
      for (const it of items) g.fillText(it.good ? '💡' : '🐞', it.x, it.y);
      g.fillStyle = '#ffd36b'; g.beginPath(); g.roundRect(px - 36, H - 30, 72, 14, 7); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 16px sans-serif'; g.textAlign = 'left';
      g.fillText(`★ ${sc}`, 10, 22);
      g.textAlign = 'right'; g.fillText(`${Math.max(0, Math.ceil(20 - elapsed))}s`, W - 10, 22);
      setScore(sc);
      if (elapsed >= 20) { setPhase('over'); onDone(Math.max(0, sc)); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); c.removeEventListener('pointermove', mv); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="catch">
      <canvas ref={ref} width={W} height={H} />
      {phase !== 'play' && (
        <div className="catch-ov">
          {phase === 'over' && <b>{T('النتيجة', 'Score')}: {score}</b>}
          <p>{T('التقط الأفكار 💡 وتجنب الأخطاء 🐞. حرّك الفأرة أو الأسهم.', 'Catch ideas 💡, avoid bugs 🐞. Move the mouse or arrow keys.')}</p>
          <button className="btn primary" onClick={() => { setScore(0); setPhase('play'); }}>{phase === 'over' ? T('العب مجددًا', 'Play again') : T('ابدأ', 'Start')}</button>
        </div>
      )}
    </div>
  );
}
