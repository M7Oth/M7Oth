import { useEffect, useMemo, useRef, useState } from 'react';
import { checkAll, clockOf, dayOf, equipmentStats, formatSAR, SPECIALTY_DEFS, type GameState, type Project, type Task } from '@fls/shared';
import { useGame } from '../store';
import { useL, useT } from '../i18n';
import { sfx } from '../audio';
import { VideoEditor } from '../editors/VideoEditor';
import { MotionEditor } from '../editors/MotionEditor';
import { GraphicEditor } from '../editors/GraphicEditor';
import { SceneEditor } from '../editors/SceneEditor';
import { OfferCard } from './Panels';

export function leaveComputer() {
  const g = useGame.getState();
  useGame.setState({ computerApp: null, cam: 'room' });
  g.conn?.sendWork(null, 0);
  if (g.state?.players[g.conn!.you]?.activity?.kind === 'work') void g.act({ type: 'cancelActivity' });
}

export function ComputerScreen() {
  const app = useGame((s) => s.computerApp);
  const state = useGame((s) => s.state);
  if (!app || !state) return null;
  return (
    <div className="monitor">
      <div className="monitor-bezel">
        {app === 'desktop' ? <Desktop state={state} /> : <TaskWorkspace state={state} taskId={app.taskId} />}
      </div>
    </div>
  );
}

function Desktop({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useGame((s) => s.settings.lang);
  const you = useGame((s) => s.conn?.you ?? '');
  const [tab, setTab] = useState<'tasks' | 'mail'>('tasks');
  const active = state.projects.filter((p) => p.status === 'active');
  const offers = state.projects.filter((p) => p.status === 'offer');
  const ram = equipmentStats(state).ram;
  const myTasks = active.flatMap((p) => p.tasks.map((t) => ({ p, t }))).filter(({ t }) => t.status !== 'done' && (!t.assignee || (t.assignee.type === 'player' && t.assignee.id === you)));
  return (
    <div className="os">
      <div className="os-bar">
        <span>🖥️ FreelanceOS</span>
        <div className="os-tabs">
          <button className={tab === 'tasks' ? 'on' : ''} onClick={() => setTab('tasks')}>🗂️ {T('مهامي', 'My tasks')} ({myTasks.length})</button>
          <button className={tab === 'mail' ? 'on' : ''} onClick={() => setTab('mail')}>✉️ {T('البريد والطلبات', 'Mail & offers')} ({offers.length})</button>
        </div>
        <span className="os-clock">{T('اليوم', 'Day')} {dayOf(state.time)} · {clockOf(state.time)} · {formatSAR(state.money, lang)}</span>
        <button className="btn small" onClick={leaveComputer}>⏏ {T('ابتعد عن الكمبيوتر', 'Leave computer')}</button>
      </div>
      <div className="os-body">
        {tab === 'tasks' && (
          <div className="task-grid">
            {myTasks.length === 0 && <div className="empty">{T('لا توجد مهام مسندة لك الآن. افتح البريد لقبول طلب جديد.', 'No tasks assigned to you. Open Mail to accept a new request.')}</div>}
            {myTasks.map(({ p, t }) => {
              const d = SPECIALTY_DEFS[t.specialty];
              const left = p.deadline - state.time;
              const locked = state.stage < 3 && ram < p.minRam;
              const known = state.specialties.includes(t.specialty) || state.players[you]?.role !== 'owner';
              return (
                <button key={t.id} className="app-tile" style={{ ['--c' as any]: d.color }} disabled={locked} onClick={() => { sfx('click'); useGame.setState({ computerApp: { taskId: t.id } }); }}>
                  <span className="ic">{d.icon}</span>
                  <b>{L(t.title)}</b>
                  <small>{L(d.tool)} · {T('المستوى', 'Level')} {t.tier} · {t.requirements.length} {T('متطلبات', 'requirements')}</small>
                  <small className={left < 360 ? 'warn' : ''}>⏰ {left > 0 ? `${Math.floor(left / 60)}${T('س', 'h')} ${Math.floor(left % 60)}${T('د', 'm')}` : T('متأخر!', 'Late!')}</small>
                  {p.revisionsUsed > 0 && <small className="warn">🔁 {T('تعديل مطلوب', 'Revision requested')}</small>}
                  {locked && <small className="warn">🔒 {T(`يحتاج ${p.minRam}GB RAM`, `Needs ${p.minRam}GB RAM`)}</small>}
                  {!known && <small className="warn">{T('خارج تخصصك (جودة أقل)', 'Outside your specialty')}</small>}
                </button>
              );
            })}
            {active.filter((p) => p.tasks.every((t) => t.status === 'done')).map((p) => (
              <div key={p.id} className="app-tile done">
                <span className="ic">📦</span><b>{L(p.title)}</b><small>{T('جاهز للتسليم', 'Ready to deliver')}</small>
                <button className="btn primary small" onClick={() => void useGame.getState().act({ type: 'deliver', projectId: p.id })}>{T('تصدير وتسليم', 'Export & deliver')}</button>
              </div>
            ))}
          </div>
        )}
        {tab === 'mail' && (
          <div className="mail">
            {offers.length === 0 && <div className="empty">{T('لا توجد طلبات جديدة حاليًا. ستصلك إشعارات عند وصول طلبات.', 'No new requests. You will be notified when new ones arrive.')}</div>}
            {offers.map((p) => <OfferCard key={p.id} p={p} state={state} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskWorkspace({ state, taskId }: { state: GameState; taskId: string }) {
  const T = useT();
  const L = useL();
  const help = useGame((s) => s.settings.help);
  const you = useGame((s) => s.conn?.you ?? '');
  const found = useMemo(() => { for (const p of state.projects) for (const t of p.tasks) if (t.id === taskId) return { p, t }; return null; }, [state, taskId]);
  const draftKey = `fls.draft.${state.id}.${taskId}.${found?.p.revisionsUsed ?? 0}`;
  const [doc, setDocRaw] = useState<any>(() => { try { const d = localStorage.getItem(draftKey); if (d) return JSON.parse(d); } catch { /* */ } return found ? structuredClone(found.t.doc) : null; });
  const history = useRef<any[]>([]);
  const setDoc = (d: any) => { history.current.push(doc); if (history.current.length > 60) history.current.shift(); setDocRaw(d); try { localStorage.setItem(draftKey, JSON.stringify(d)); } catch { /* */ } };
  const undo = () => { const prev = history.current.pop(); if (prev) { setDocRaw(prev); sfx('click'); } };
  const me = state.players[you];
  const eq = equipmentStats(state);
  const check = useMemo(() => (found && doc ? checkAll(found.t.specialty, doc, found.t.requirements) : null), [doc, found]);
  useEffect(() => {
    const t = setInterval(() => { if (check) useGame.getState().conn?.sendWork(taskId, check.correctness * 100); }, 2500);
    return () => clearInterval(t);
  }, [check, taskId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!found) return <div className="os"><div className="empty">{T('المهمة لم تعد متاحة', 'This task is no longer available')} <button className="btn" onClick={() => useGame.setState({ computerApp: 'desktop' })}>{T('رجوع', 'Back')}</button></div></div>;
  const { p, t } = found;
  if (t.status === 'done') {
    return <div className="os"><div className="empty">✅ {T('تم تسليم هذه المهمة', 'This task has been submitted')} <button className="btn" onClick={() => useGame.setState({ computerApp: 'desktop' })}>{T('رجوع للمكتب', 'Back to desktop')}</button></div></div>;
  }
  const sloppy = (me?.needs.focus ?? 100) < 30;
  const submit = async () => {
    const ok = await useGame.getState().act({ type: 'submitTask', taskId: t.id, doc });
    if (ok) { try { localStorage.removeItem(draftKey); } catch { /* */ } useGame.setState({ computerApp: 'desktop' }); }
  };
  const d = SPECIALTY_DEFS[t.specialty];
  const props = { doc, setDoc, reqs: t.requirements, help, zoom: eq.zoom, guides: eq.guides, sloppy };
  const left = p.deadline - state.time;
  return (
    <div className="workspace" style={{ ['--c' as any]: d.color }}>
      <div className="ws-bar">
        <span className="ws-tool">{d.icon} {L(d.tool)}</span>
        <span className="ws-title">{L(t.title)}</span>
        <span className={`ws-time ${left < 360 ? 'warn' : ''}`}>⏰ {left > 0 ? `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}` : T('متأخر', 'Late')}</span>
        {sloppy && <span className="pill bad">🎯 {T('تركيزك منخفض: أخطاء محتملة', 'Low focus: mistakes likely')}</span>}
        <button className="btn small ghost" onClick={undo} title="Ctrl+Z">↶ {T('تراجع', 'Undo')}</button>
        <button className="btn small ghost" onClick={() => { if (confirm(T('إعادة العمل من البداية؟', 'Reset work to the start?'))) setDoc(structuredClone(t.doc)); }}>⟲ {T('إعادة', 'Reset')}</button>
        <button className="btn small ghost" onClick={() => useGame.setState({ computerApp: 'desktop' })}>🗂️ {T('المكتب', 'Desktop')}</button>
        <button className="btn small primary" onClick={submit} data-testid="submit-task">✔ {T('حفظ وتسليم المهمة', 'Save & submit task')}</button>
      </div>
      <div className="ws-main">
        <div className="ws-editor">
          {t.specialty === 'video' && <VideoEditor {...props} />}
          {t.specialty === 'motion' && <MotionEditor {...props} />}
          {t.specialty === 'graphic' && <GraphicEditor {...props} />}
          {t.specialty === 'model3d' && <SceneEditor {...props} />}
        </div>
        <aside className="ws-brief">
          <h4>📝 {T('طلبات العميل', 'Client brief')}</h4>
          <div className="muted tiny">{L(p.brief)}</div>
          <ol className="reqs">
            {t.requirements.map((r) => {
              const res = check?.results.find((x) => x.id === r.id);
              return (
                <li key={r.id} className={help ? (res?.ok ? 'ok' : 'no') : ''}>
                  {help && <span className="chk">{res?.ok ? '✅' : '⬜'}</span>}
                  <span>{r.revision && <b className="rev">{T('تعديل: ', 'Revision: ')}</b>}{L(r.text)}</span>
                  {help && !res?.ok && <div className="hint">💡 {L(r.hint)}</div>}
                </li>
              );
            })}
          </ol>
          {help && check && <div className="progress"><div className="bar"><i style={{ width: `${check.correctness * 100}%` }} /></div><span>{Math.round(check.correctness * 100)}%</span></div>}
          {!help && <div className="muted tiny">{T('المساعدة متوقفة — فعّلها من الإعدادات لإظهار التلميحات والتحقق المباشر.', 'Help is off — enable it in Settings for hints and live checks.')}</div>}
          <div className="muted tiny">{T('التعديلات المسموحة', 'Revisions allowed')}: {p.revisionsAllowed - p.revisionsUsed}/{p.revisionsAllowed}</div>
        </aside>
      </div>
    </div>
  );
}

export type EditorProps = { doc: any; setDoc: (d: any) => void; reqs: Task['requirements']; help: boolean; zoom: number; guides: boolean; sloppy: boolean };
export type { Project };
