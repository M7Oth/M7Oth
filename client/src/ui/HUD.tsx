import { useEffect } from 'react';
import { clockOf, dayOf, formatSAR, levelFromXp, stageDef, xpForLevel, type GameState, type Needs } from '@fls/shared';
import { useGame, type Panel } from '../store';
import { useL, useT } from '../i18n';
import { sfx } from '../audio';
import { Panels } from './Panels';
import { ComputerScreen } from './Computer';

export function HUD() {
  const state = useGame((s) => s.state);
  const you = useGame((s) => s.conn?.you ?? '');
  const cam = useGame((s) => s.cam);
  const status = useGame((s) => s.status);
  const T = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        const g = useGame.getState();
        if (g.placing) useGame.setState({ placing: null });
        else if (g.panel) useGame.setState({ panel: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (!state) return <div className="loading">{status === 'connecting' ? T('جاري الاتصال بالخادم…', 'Connecting to server…') : T('جاري التحميل…', 'Loading…')}</div>;
  const me = state.players[you];
  return (
    <div className="hud">
      {cam === 'room' && <TopBar state={state} />}
      {cam === 'room' && me && <NeedsPanel needs={me.needs} burnout={me.burnout} />}
      {cam === 'room' && <Dock state={state} />}
      {cam === 'room' && <Panels />}
      {cam === 'room' && <Hints state={state} />}
      <ComputerScreen />
      <Toasts />
      {status === 'connecting' && <div className="conn-banner">⏳ {T('انقطع الاتصال — جاري إعادة الاتصال…', 'Connection lost — reconnecting…')}</div>}
    </div>
  );
}

function TopBar({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useGame((s) => s.settings.lang);
  const act = useGame((s) => s.act);
  const lv = levelFromXp(state.xp);
  const xp0 = xpForLevel(lv), xp1 = xpForLevel(lv + 1);
  const hour = (state.time % 1440) / 60;
  const icon = hour >= 6 && hour < 18 ? '☀️' : '🌙';
  const stars = Math.round(state.reputation / 20);
  return (
    <div className="topbar">
      <div className="tb-group money" title={T('الرصيد', 'Balance')}><span className={state.money < 0 ? 'neg' : ''}>💰 {formatSAR(state.money, lang)}</span></div>
      <div className="tb-group">
        <span>{icon} {T('اليوم', 'Day')} {dayOf(state.time)} · {clockOf(state.time)}</span>
        <div className="speed">
          {[0, 1, 2, 4].map((sp) => <button key={sp} className={state.speed === sp ? 'on' : ''} onClick={() => void act({ type: 'setSpeed', speed: sp })} title={sp ? `${sp}x` : T('إيقاف', 'Pause')}>{sp === 0 ? '⏸' : sp === 1 ? '▶' : sp === 2 ? '⏩' : '⏭'}</button>)}
        </div>
      </div>
      <div className="tb-group">
        <span className="stage-chip">{L(stageDef(state.stage).name)}{state.companyName ? ` · ${state.companyName}` : ''}</span>
      </div>
      <div className="tb-group lvl" title={`${state.xp - xp0}/${xp1 - xp0} XP`}>
        <span>⭐ {T('المستوى', 'Lv')} {lv}</span>
        <div className="bar"><i style={{ width: `${Math.min(100, ((state.xp - xp0) / (xp1 - xp0)) * 100)}%` }} /></div>
      </div>
      <div className="tb-group" title={`${T('السمعة', 'Reputation')} ${Math.round(state.reputation)}/100`}>
        <span>{T('السمعة', 'Rep')} {'★'.repeat(stars)}{'☆'.repeat(5 - stars)} <small>{Math.round(state.reputation)}</small></span>
      </div>
    </div>
  );
}

function NeedsPanel({ needs, burnout }: { needs: Needs; burnout: boolean }) {
  const T = useT();
  const rows: [string, string, number, boolean][] = [
    ['⚡', T('الطاقة', 'Energy'), needs.energy, false],
    ['🎯', T('التركيز', 'Focus'), needs.focus, false],
    ['🪑', T('الراحة', 'Comfort'), needs.comfort, false],
    ['❤️', T('الشغف', 'Passion'), needs.passion, false],
    ['😣', T('التوتر', 'Stress'), needs.stress, true],
    ['🍔', T('الجوع', 'Hunger'), needs.hunger, true],
  ];
  return (
    <div className={`needs ${burnout ? 'burnout' : ''}`}>
      {burnout && <div className="burn">🔥 {T('احتراق وظيفي! ارتح أو خذ إجازة', 'Burnout! Rest or take a vacation')}</div>}
      {rows.map(([ic, name, v, inv]) => {
        const bad = inv ? v > 70 : v < 25;
        return (
          <div className={`need ${bad ? 'bad' : ''}`} key={name} title={`${name}: ${Math.round(v)}`}>
            <span className="ic">{ic}</span>
            <span className="nm">{name}</span>
            <div className="bar"><i style={{ width: `${v}%`, background: inv ? (v > 70 ? '#ff6b5b' : '#f2b134') : v < 25 ? '#ff6b5b' : '#53d18b' }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function Dock({ state }: { state: GameState }) {
  const T = useT();
  const panel = useGame((s) => s.panel);
  const offers = state.projects.filter((p) => p.status === 'offer').length;
  const unread = state.inbox.filter((m) => !m.read).length;
  const raise = state.employees.some((e) => e.raiseRequest);
  const items: [Panel, string, string, number | boolean, boolean][] = [
    ['projects', '📋', T('المشاريع', 'Projects'), offers, true],
    ['phone', '📱', T('الجوال', 'Phone'), unread, true],
    ['shop', '🛒', T('المتجر', 'Shop'), 0, true],
    ['decor', '🛋️', T('الديكور', 'Decor'), 0, true],
    ['career', '🎓', T('المسيرة', 'Career'), 0, true],
    ['team', '👥', T('الفريق', 'Team'), raise, state.stage >= 2],
    ['company', '🏢', T('الشركة', 'Company'), 0, state.stage >= 4],
    ['finance', '📊', T('المالية', 'Finance'), 0, true],
    ['online', '🌐', T('الأصدقاء', 'Friends'), 0, true],
    ['settings', '⚙️', T('الإعدادات', 'Settings'), 0, true],
  ];
  return (
    <div className="dock">
      {items.filter((i) => i[4]).map(([id, ic, label, badge]) => (
        <button key={id} className={panel === id ? 'on' : ''} data-panel={id} onClick={() => { sfx('click'); useGame.setState({ panel: panel === id ? null : id, placing: null }); }}>
          <span className="ic">{ic}</span><span className="lb">{label}</span>
          {!!badge && <span className="badge">{typeof badge === 'number' ? badge : '!'}</span>}
        </button>
      ))}
    </div>
  );
}

function Hints({ state }: { state: GameState }) {
  const T = useT();
  const help = useGame((s) => s.settings.help);
  const you = useGame((s) => s.conn?.you ?? '');
  if (!help) return null;
  const me = state.players[you];
  let hint = '';
  const active = state.projects.filter((p) => p.status === 'active');
  const mine = active.flatMap((p) => p.tasks).filter((t) => t.status !== 'done' && (!t.assignee || (t.assignee.type === 'player' && t.assignee.id === you)));
  if (me?.burnout) hint = T('أنت مُنهك: استرخِ على الكنبة أو خذ إجازة من الجوال.', 'You are burned out: relax on the sofa or book a vacation from the phone.');
  else if (me && me.needs.energy < 20) hint = T('طاقتك منخفضة — اضغط على السرير للنوم.', 'Low energy — click the bed to sleep.');
  else if (me && me.needs.hunger > 70) hint = T('أنت جائع — اضغط على المطبخ أو اطلب من الجوال.', 'You are hungry — click the kitchen or order from the phone.');
  else if (!active.length && state.projects.some((p) => p.status === 'offer')) hint = T('لديك طلبات عمل! افتح «المشاريع» أو اضغط على الكمبيوتر.', 'You have job offers! Open "Projects" or click the computer.');
  else if (mine.length) hint = T('اضغط على الكمبيوتر لتنفيذ المهام المطلوبة.', 'Click the computer to work on your tasks.');
  else if (active.some((p) => p.tasks.every((t) => t.status === 'done'))) hint = T('اكتملت المهام — سلّم المشروع من «المشاريع».', 'Tasks finished — deliver the project from "Projects".');
  if (!hint) return null;
  return <div className="hint-bubble">💡 {hint}</div>;
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const L = useL();
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`} onClick={() => useGame.setState({ toasts: toasts.filter((x) => x.id !== t.id) })}>{L(t.text)}</div>)}
    </div>
  );
}
