import { useEffect, useState } from 'react';
import {
  CATALOG, CATALOG_BY_ID, clockOf, dayOf, equipmentStats, exportMinutes, formatSAR, HARDWARE_SLOTS, maxEmployees, OFFICE_TIERS, personName,
  SPECIALTIES, SPECIALTY_DEFS, stageDef, stageProgress, STAGES, type Assignee, type GameState, type ItemCategory, type Project, type SpecialtyId,
} from '@fls/shared';
import { useGame } from '../store';
import { useL, useLang, useT, applyDir } from '../i18n';
import { api, ApiError, serverBase } from '../net/api';
import { sfx } from '../audio';
import { CatchGame } from '../minigame/CatchGame';
import { walkTo, interactables } from '../scene/World';

export function Panels() {
  const panel = useGame((s) => s.panel);
  const state = useGame((s) => s.state);
  const T = useT();
  if (!panel || !state) return null;
  const titles: Record<string, string> = {
    projects: T('المشاريع', 'Projects'), shop: T('المتجر', 'Shop'), decor: T('تخصيص المكان', 'Customize space'), career: T('المسيرة المهنية', 'Career'),
    team: T('الفريق والمستقلون', 'Team & contractors'), company: T('إدارة الشركة', 'Company management'), finance: T('المالية', 'Finance'),
    online: T('الأصدقاء واللعب الجماعي', 'Friends & co-op'), settings: T('الإعدادات', 'Settings'), phone: T('الجوال', 'Phone'),
  };
  return (
    <div className={`panel panel-${panel}`}>
      <div className="panel-head">
        <h2>{titles[panel]}</h2>
        <button className="x" onClick={() => useGame.setState({ panel: null, placing: null })}>✕</button>
      </div>
      <div className="panel-body">
        {panel === 'projects' && <ProjectsPanel state={state} />}
        {panel === 'shop' && <ShopPanel state={state} />}
        {panel === 'decor' && <DecorPanel state={state} />}
        {panel === 'career' && <CareerPanel state={state} />}
        {panel === 'team' && <TeamPanel state={state} />}
        {panel === 'company' && <CompanyPanel state={state} />}
        {panel === 'finance' && <FinancePanel state={state} />}
        {panel === 'online' && <OnlinePanel state={state} />}
        {panel === 'settings' && <SettingsPanel />}
        {panel === 'phone' && <PhonePanel state={state} />}
      </div>
    </div>
  );
}

const hoursLeft = (state: GameState, t: number) => { const m = t - state.time; return m <= 0 ? '—' : m > 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h ${Math.floor(m % 60)}m`; };

export function OfferCard({ p, state }: { p: Project; state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useLang();
  const act = useGame((s) => s.act);
  const client = state.clients.find((c) => c.id === p.clientId)!;
  const ram = equipmentStats(state).ram;
  const ramLow = state.stage < 3 && ram < p.minRam;
  return (
    <div className="card offer" data-testid="offer-card">
      <div className="card-head">
        <div><b>{L(client.name)}</b> <span className="muted tiny">{L(client.industry)}</span></div>
        <span className="price">{formatSAR(p.budget, lang)}</span>
      </div>
      <div className="title">{L(p.title)} {p.recurring && <span className="pill good">{T('عقد متكرر', 'Retainer')}</span>} {p.big && <span className="pill">{T('عقد كبير', 'Major contract')}</span>}</div>
      <div className="muted">{L(p.brief)}</div>
      <div className="facts">
        <span>⏱ {T('المدة', 'Duration')}: {p.durationDays} {T('يوم', 'day(s)')}</span>
        <span>📈 {T('الصعوبة', 'Difficulty')}: {'●'.repeat(p.difficulty)}{'○'.repeat(5 - p.difficulty)}</span>
        <span>🔁 {T('تعديلات', 'Revisions')}: {p.revisionsAllowed}</span>
        <span className={ramLow ? 'bad' : ''}>💾 RAM {p.minRam}GB</span>
        <span>⌛ {T('ينتهي العرض بعد', 'Offer expires in')} {hoursLeft(state, p.offerExpiresAt)}</span>
        <span>🤝 {T('العلاقة', 'Relationship')}: {Math.round(client.relationship)}</span>
      </div>
      <ul className="task-list">{p.tasks.map((t) => <li key={t.id}>{SPECIALTY_DEFS[t.specialty].icon} {L(t.title)} <small>({t.requirements.length} {T('متطلبات', 'reqs')})</small></li>)}</ul>
      <div className="row">
        <button className="btn primary small" disabled={ramLow} onClick={() => void act({ type: 'accept', projectId: p.id }).then((ok) => ok && sfx('success'))} data-testid="accept-offer">✔ {T('قبول', 'Accept')}</button>
        {!p.negotiated && <button className="btn small" onClick={() => void act({ type: 'negotiate', projectId: p.id, ask: 'price' })}>💬 {T('اطلب +20%', 'Ask +20%')}</button>}
        {!p.negotiated && <button className="btn small" onClick={() => void act({ type: 'negotiate', projectId: p.id, ask: 'time' })}>📅 {T('يوم إضافي', '+1 day')}</button>}
        <button className="btn small ghost" onClick={() => void act({ type: 'decline', projectId: p.id })}>✕ {T('رفض', 'Decline')}</button>
      </div>
      {ramLow && <div className="err tiny">{T('ذاكرة جهازك لا تكفي — اشترِ RAM من المتجر.', 'Not enough RAM — buy more in the Shop.')}</div>}
    </div>
  );
}

function assigneeLabel(state: GameState, a: Assignee | null, lang: 'ar' | 'en', T: (a: string, b: string) => string) {
  if (!a) return T('غير مسند', 'Unassigned');
  if (a.type === 'player') return `🧑 ${state.players[a.id]?.name ?? '?'}`;
  if (a.type === 'employee') { const e = state.employees.find((x) => x.id === a.id); return `👔 ${e ? personName(e.name, lang) : '?'}`; }
  const c = state.contractors.find((x) => x.id === a.id); return `🧾 ${c ? personName(c.name, lang) : '?'}`;
}

function ProjectsPanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useLang();
  const act = useGame((s) => s.act);
  const you = useGame((s) => s.conn?.you ?? '');
  const [tab, setTab] = useState<'offers' | 'active' | 'done'>(state.projects.some((p) => p.status === 'active' || p.status === 'exporting') ? 'active' : 'offers');
  const offers = state.projects.filter((p) => p.status === 'offer');
  const active = state.projects.filter((p) => ['active', 'exporting'].includes(p.status));
  const done = state.projects.filter((p) => ['completed', 'failed'].includes(p.status)).reverse();
  const players = Object.values(state.players);
  const [seenActive, setSeenActive] = useState(active.length);
  useEffect(() => { if (active.length > seenActive) setTab('active'); setSeenActive(active.length); }, [active.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const goWork = (taskId: string) => {
    useGame.setState({ panel: null });
    const comp = interactables(state).find((x) => x.kind === 'computer')!;
    walkTo(state, comp.stand, async () => {
      const ok = await act({ type: 'activity', kind: 'work' });
      if (ok) { useGame.setState({ cam: 'computer' }); setTimeout(() => useGame.setState({ computerApp: { taskId } }), 650); }
    });
  };
  return (
    <>
      <div className="tabs">
        <button className={tab === 'offers' ? 'on' : ''} onClick={() => setTab('offers')}>{T('الطلبات', 'Offers')} ({offers.length})</button>
        <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>{T('قيد التنفيذ', 'Active')} ({active.length})</button>
        <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>{T('المنتهية', 'Finished')}</button>
      </div>
      {tab === 'offers' && (offers.length ? offers.map((p) => <OfferCard key={p.id} p={p} state={state} />) : <div className="empty">{T('لا توجد طلبات حاليًا، ستصلك طلبات جديدة قريبًا.', 'No offers right now; new ones will arrive soon.')}</div>)}
      {tab === 'active' && (active.length ? active.map((p) => {
        const allDone = p.tasks.every((t) => t.status === 'done');
        const client = state.clients.find((c) => c.id === p.clientId)!;
        const multi = players.length > 1;
        return (
          <div className="card" key={p.id} data-testid="active-project">
            <div className="card-head"><b>{L(p.title)}</b><span className="price">{formatSAR(p.budget, lang)}</span></div>
            <div className="muted tiny">{L(client.name)} · {p.status === 'exporting' ? `⏳ ${T('جاري التصدير', 'Exporting')} ${hoursLeft(state, p.exportEndsAt!)}` : `⏰ ${T('التسليم بعد', 'Due in')} ${hoursLeft(state, p.deadline)}`} · 🔁 {p.revisionsUsed}/{p.revisionsAllowed}</div>
            {state.stage >= 4 && <Pipeline p={p} />}
            <ul className="task-rows">
              {p.tasks.map((t) => {
                const mine = !t.assignee || (t.assignee.type === 'player' && t.assignee.id === you);
                return (
                  <li key={t.id} className={t.status}>
                    <div className="tr-head">
                      <span>{SPECIALTY_DEFS[t.specialty].icon} {L(t.title)}</span>
                      <span className="pill">{t.status === 'done' ? `✅ ${Math.round((t.result?.correctness ?? 0) * 100)}%` : t.status === 'in_progress' ? `${Math.round(t.progress * 100)}%` : T('لم تبدأ', 'To do')}</span>
                    </div>
                    <div className="tr-assign">
                      <span className="muted tiny">{assigneeLabel(state, t.assignee, lang, T)}</span>
                      {t.status !== 'done' && p.status === 'active' && (
                        <select value={t.assignee ? `${t.assignee.type}:${t.assignee.id}` : ''} onChange={(e) => {
                          const v = e.target.value;
                          if (v.startsWith('contractor:')) void act({ type: 'hireContractor', taskId: t.id, contractorId: v.slice(11) });
                          else void act({ type: 'assign', taskId: t.id, assignee: v ? { type: v.split(':')[0] as any, id: v.split(':')[1] } : null });
                        }} data-testid="assign-select">
                          <option value="">{T('— إسناد إلى —', '— assign to —')}</option>
                          {players.map((pl) => <option key={pl.id} value={`player:${pl.id}`}>🧑 {pl.name}{pl.id === you ? T(' (أنا)', ' (me)') : ''}</option>)}
                          {state.employees.filter((e) => e.role === 'creative' && e.specialty === t.specialty && (!e.taskId || e.taskId === t.id)).map((e) => <option key={e.id} value={`employee:${e.id}`}>👔 {personName(e.name, lang)} (Lv{e.level})</option>)}
                          {state.stage >= 2 && state.contractors.filter((c) => c.specialty === t.specialty && !c.taskId).map((c) => <option key={c.id} value={`contractor:${c.id}`}>🧾 {personName(c.name, lang)} ★{c.rating} — {formatSAR(Math.round(p.budget * t.valueWeight / p.tasks.reduce((a, b) => a + b.valueWeight, 0) * c.feeRate), lang)}</option>)}
                        </select>
                      )}
                      {t.status !== 'done' && mine && p.status === 'active' && <button className="btn tiny primary" onClick={() => goWork(t.id)} data-testid="work-task">💻 {T('اعمل عليها', 'Work on it')}</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {multi && p.status === 'active' && <SplitEditor p={p} state={state} />}
            <div className="row">
              {allDone && p.status === 'active' && !p.reviewed && state.stage >= 3 && <button className="btn small" onClick={() => void act({ type: 'review', projectId: p.id })}>🔍 {T('مراجعة داخلية (+جودة)', 'Internal review (+quality)')}</button>}
              {allDone && p.status === 'active' && <button className="btn small primary" onClick={() => void act({ type: 'deliver', projectId: p.id })} data-testid="deliver">📦 {T('تصدير وتسليم', 'Export & deliver')} (~{exportMinutes(state, p)} {T('د', 'min')})</button>}
            </div>
            <details><summary className="muted tiny">{T('سجل المشروع', 'Project log')}</summary>{p.log.slice(-8).map((x, i) => <div key={i} className="tiny muted">{clockOf(x.time)} — {L(x.text)}</div>)}</details>
          </div>
        );
      }) : <div className="empty">{T('لا توجد مشاريع نشطة.', 'No active projects.')}</div>)}
      {tab === 'done' && done.map((p) => (
        <div className="card small" key={p.id}>
          <b>{L(p.title)}</b>
          <div className="muted tiny">{p.status === 'completed' ? `${'★'.repeat(p.rating ?? 0)}${'☆'.repeat(5 - (p.rating ?? 0))} · ${formatSAR(p.payout ?? 0, lang)}` : `❌ ${T('فشل', 'Failed')}`}</div>
        </div>
      ))}
    </>
  );
}

function Pipeline({ p }: { p: Project }) {
  const T = useT();
  const stages: [string, string][] = [['intake', T('العميل', 'Client')], ['planning', T('المنسّق', 'Coordinator')], ['production', T('الأقسام', 'Departments')], ['review', T('المراجعة', 'Review')], ['delivery', T('التسليم', 'Delivery')], ['done', T('تم', 'Done')]];
  const idx = stages.findIndex((s) => s[0] === p.pipeline);
  return <div className="pipeline">{stages.map(([id, n], i) => <span key={id} className={i < idx ? 'past' : i === idx ? 'now' : ''}>{n}</span>)}</div>;
}

function SplitEditor({ p, state }: { p: Project; state: GameState }) {
  const T = useT();
  const act = useGame((s) => s.act);
  const you = useGame((s) => s.conn?.you ?? '');
  const isOwner = state.ownerId === you;
  const players = Object.values(state.players);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(players.map((pl) => [pl.id, Math.round((p.split?.[pl.id] ?? 1 / players.length) * 100)])));
  return (
    <div className="split">
      <div className="muted tiny">💸 {T('اتفاق توزيع الأرباح', 'Profit split agreement')}: {p.split ? players.map((pl) => `${pl.name} ${Math.round((p.split![pl.id] ?? 0) * 100)}%`).join(' · ') : T('حسب المهام المنجزة لكل لاعب', 'By tasks each player completes')}</div>
      {isOwner && (
        <div className="row">
          {players.map((pl) => <label key={pl.id} className="mini">{pl.name}<input type="number" min={0} max={100} value={vals[pl.id] ?? 0} onChange={(e) => setVals({ ...vals, [pl.id]: Number(e.target.value) })} />%</label>)}
          <button className="btn tiny" onClick={() => void act({ type: 'setSplit', projectId: p.id, split: vals })}>{T('اعتماد', 'Set')}</button>
          {p.split && <button className="btn tiny ghost" onClick={() => void act({ type: 'setSplit', projectId: p.id, split: null })}>{T('حسب المهام', 'By tasks')}</button>}
        </div>
      )}
    </div>
  );
}

function ShopPanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useLang();
  const act = useGame((s) => s.act);
  const [cat, setCat] = useState<'hardware' | 'furniture' | 'walls' | 'decor' | 'room'>('hardware');
  const eq = equipmentStats(state);
  const cats: Record<string, ItemCategory[]> = { hardware: ['cpu', 'gpu', 'ram', 'ssd', 'monitor', 'keyboard', 'mouse', 'headset'], furniture: ['desk', 'chair', 'lamp'], walls: ['wall', 'floor'], decor: ['decor'], room: ['roomSize'] };
  const slotName: Record<string, string> = { cpu: T('المعالج', 'CPU'), gpu: T('كرت الشاشة', 'GPU'), ram: T('الذاكرة', 'RAM'), ssd: T('التخزين', 'Storage'), monitor: T('الشاشة', 'Monitor'), keyboard: T('لوحة المفاتيح', 'Keyboard'), mouse: T('الفأرة', 'Mouse'), headset: T('السماعات', 'Headset'), desk: T('المكتب', 'Desk'), chair: T('الكرسي', 'Chair'), lamp: T('الإضاءة', 'Lighting'), wall: T('الجدران', 'Walls'), floor: T('الأرضية', 'Floor'), decor: T('ديكور', 'Decor'), roomSize: T('توسعة', 'Expansion') };
  const items = CATALOG.filter((i) => cats[cat].includes(i.category) && i.price > 0 || (cats[cat].includes(i.category) && ['wall', 'floor'].includes(i.category)));
  return (
    <>
      <div className="tabs wrap">
        {(['hardware', 'furniture', 'walls', 'decor', 'room'] as const).map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{{ hardware: T('أجهزة', 'Hardware'), furniture: T('أثاث المكتب', 'Desk setup'), walls: T('جدران وأرضيات', 'Walls & floors'), decor: T('ديكور', 'Decor'), room: T('توسعة', 'Expansion') }[c]}</button>)}
      </div>
      {cat === 'hardware' && <div className="stats-box tiny">⚙️ CPU ×{eq.cpu.toFixed(2)} · GPU ×{eq.gpu.toFixed(2)} · RAM {eq.ram}GB · {T('تخزين', 'Disk')} ×{eq.disk} · {T('تكبير الشاشة', 'Zoom')} {eq.zoom}x</div>}
      {cat === 'room' && state.location === 'office' && <div className="muted">{T('أنت في المكتب. ينتقل المكتب لمقر أكبر مع تقدم المراحل.', 'You are in the office. Bigger offices come with new stages.')}</div>}
      <div className="shop-grid">
        {items.map((it) => {
          const owned = it.category !== 'decor' && state.owned.includes(it.id);
          const equipped = (HARDWARE_SLOTS as string[]).includes(it.category) ? state.equipment[it.category as keyof GameState['equipment']] === it.id : it.category === 'wall' ? state.room.wall === it.id : it.category === 'floor' ? state.room.floor === it.id : false;
          const lockedStage = it.unlockStage && state.stage < it.unlockStage;
          const lockedLevel = it.unlockLevel && state.level < it.unlockLevel;
          const sizeLocked = it.category === 'roomSize' && (it.tier !== state.room.sizeTier + 1 || state.location !== 'home');
          const inStorage = state.room.storage.filter((x) => x === it.id).length;
          return (
            <div key={it.id} className={`shop-item ${equipped ? 'eq' : ''}`} data-testid={`shop-${it.id}`}>
              <div className="si-top">{it.color && <span className="sw" style={{ background: it.color }} />}<span className="cat">{slotName[it.category]}</span></div>
              <b>{L(it.name)}</b>
              <small className="muted">{L(it.desc)}</small>
              <div className="si-foot">
                <span className="price">{it.price ? formatSAR(it.price, lang) : T('مجاني', 'Free')}</span>
                {equipped ? <span className="pill good">{T('مركّب', 'Equipped')}</span>
                  : owned ? <button className="btn tiny" onClick={() => void act({ type: 'equip', itemId: it.id })}>{T('تركيب', 'Equip')}</button>
                  : lockedStage ? <span className="pill">🔒 {L(stageDef(it.unlockStage!).name)}</span>
                  : lockedLevel ? <span className="pill">🔒 Lv {it.unlockLevel}</span>
                  : sizeLocked ? <span className="pill">🔒</span>
                  : <button className="btn tiny primary" disabled={state.money < it.price} onClick={() => void act({ type: 'buy', itemId: it.id })} data-testid={`buy-${it.id}`}>{T('شراء', 'Buy')}</button>}
              </div>
              {it.category === 'decor' && inStorage > 0 && <small className="muted">{T('في المخزن', 'In storage')}: {inStorage}</small>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function DecorPanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const act = useGame((s) => s.act);
  const placing = useGame((s) => s.placing);
  const counts = state.room.storage.reduce<Record<string, number>>((a, id) => ({ ...a, [id]: (a[id] ?? 0) + 1 }), {});
  return (
    <>
      <div className="muted">{T('اختر عنصرًا من المخزن ثم اضغط على مكان فارغ في الغرفة. اضغط على عنصر موضوع لتحريكه.', 'Pick an item from storage, then click a free spot. Click a placed item to move it.')}</div>
      {placing && (
        <div className="card">
          <b>{L(CATALOG_BY_ID[placing.itemId].name)}</b>
          <div className="row">
            <button className="btn small" onClick={() => useGame.setState({ placing: { ...placing, rot: (placing.rot + 1) % 4 } })}>⟳ {T('تدوير', 'Rotate')}</button>
            {placing.uid && <button className="btn small" onClick={() => { void act({ type: 'storePlaced', uid: placing.uid! }); useGame.setState({ placing: null }); }}>📦 {T('إلى المخزن', 'To storage')}</button>}
            <button className="btn small ghost" onClick={() => useGame.setState({ placing: null })}>{T('إلغاء', 'Cancel')}</button>
          </div>
        </div>
      )}
      <h4>📦 {T('المخزن', 'Storage')}</h4>
      {Object.keys(counts).length === 0 && <div className="empty">{T('المخزن فارغ. اشترِ ديكورًا من المتجر.', 'Storage is empty. Buy decor in the Shop.')}</div>}
      <div className="shop-grid">
        {Object.entries(counts).map(([id, n]) => (
          <button key={id} className={`shop-item pick ${placing?.itemId === id && !placing.uid ? 'eq' : ''}`} onClick={() => useGame.setState({ placing: { itemId: id, rot: 0 } })}>
            <b>{L(CATALOG_BY_ID[id].name)}</b><small>×{n} · {(CATALOG_BY_ID[id].footprint ?? [1, 1]).join('×')}</small>
          </button>
        ))}
      </div>
      <h4>🏠 {T('في الغرفة', 'In the room')}: {state.room.placed.length}</h4>
    </>
  );
}

function CareerPanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useLang();
  const act = useGame((s) => s.act);
  const prog = stageProgress(state);
  const [company, setCompany] = useState('');
  const names: Record<string, string> = { level: T('المستوى', 'Level'), reputation: T('السمعة', 'Reputation'), completed: T('مشاريع مكتملة', 'Completed projects'), employees: T('موظفون', 'Employees'), money: T('الرصيد', 'Balance') };
  return (
    <>
      <div className="stages">
        {STAGES.map((s) => <div key={s.id} className={`stage ${state.stage === s.id ? 'now' : state.stage > s.id ? 'past' : ''}`}><b>{s.id}. {L(s.name)}</b><small>{L(s.desc)}</small></div>)}
      </div>
      {prog && (
        <div className="card">
          <b>{T('المرحلة التالية', 'Next stage')}: {L(prog.next.name)}</b>
          <ul className="checks">
            {prog.checks.map((c) => <li key={c.key} className={c.have >= c.need ? 'ok' : ''}>{c.have >= c.need ? '✅' : '⬜'} {names[c.key]}: {c.key === 'money' ? formatSAR(c.have, lang) : c.have} / {c.key === 'money' ? formatSAR(c.need, lang) : c.need}</li>)}
          </ul>
          {prog.next.cost > 0 && <div className="muted tiny">{T('تكلفة الانتقال', 'Cost to advance')}: {formatSAR(prog.next.cost, lang)}</div>}
          <div className="muted tiny">{T('يفتح', 'Unlocks')}: {prog.next.unlocks.map((u) => L(u)).join(' · ')}</div>
          {prog.next.id === 5 && <input placeholder={T('اسم شركتك', 'Your company name')} value={company} onChange={(e) => setCompany(e.target.value)} />}
          <button className="btn primary" disabled={!prog.ready} onClick={() => void act({ type: 'advanceStage', companyName: company })} data-testid="advance-stage">🚀 {T('انتقل للمرحلة التالية', 'Advance')}</button>
        </div>
      )}
      <h4>🧠 {T('مهاراتك', 'Your skills')}</h4>
      {SPECIALTIES.map((s) => {
        const d = SPECIALTY_DEFS[s];
        const known = state.specialties.includes(s);
        return (
          <div className="skill-row" key={s}>
            <span>{d.icon} {L(d.name)}</span>
            {known ? <span className="pill good">Lv {state.skills[s].level}</span>
              : state.learning?.specialty === s ? <span className="pill">🎓 {T('يتعلم…', 'Learning…')} {Math.ceil((state.learning.until - state.time) / 60)}{T('س', 'h')}</span>
              : <button className="btn tiny" disabled={state.stage < 2 || !!state.learning} onClick={() => void act({ type: 'learn', specialty: s })}>{T('تعلّم', 'Learn')} ({formatSAR(d.learnCost, lang)}, {d.learnDays}{T('ي', 'd')})</button>}
          </div>
        );
      })}
      {state.stage < 2 && <div className="muted tiny">{T('تعلّم التخصصات الإضافية يفتح في مرحلة الفريلانسر المحترف.', 'Extra specialties unlock at Pro Freelancer.')}</div>}
      <h4>📈 {T('إحصائيات', 'Stats')}</h4>
      <div className="muted tiny">{T('مشاريع مكتملة', 'Completed')}: {state.stats.projectsCompleted} · {T('فاشلة', 'Failed')}: {state.stats.projectsFailed} · {T('إجمالي الدخل', 'Total earned')}: {formatSAR(state.stats.totalEarned, lang)}</div>
    </>
  );
}

function TeamPanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useLang();
  const act = useGame((s) => s.act);
  const roleName = { creative: T('مبدع', 'Creative'), coordinator: T('منسّق', 'Coordinator'), pm: T('مدير مشاريع', 'Project manager') };
  const bar = (v: number, max = 1) => <div className="bar mini"><i style={{ width: `${(v / max) * 100}%` }} /></div>;
  return (
    <>
      {state.stage >= 2 && (
        <>
          <h4>🧾 {T('مستقلون متاحون للتعاقد', 'Contractors for hire')}</h4>
          <div className="muted tiny">{T('أسند لهم مهمة من قائمة المشروع مقابل أتعاب لمرة واحدة.', 'Assign them a task from the project list for a one-off fee.')}</div>
          {state.contractors.map((c) => <div className="emp" key={c.id}><b>{personName(c.name, lang)}</b> <span className="pill">{SPECIALTY_DEFS[c.specialty].icon} {L(SPECIALTY_DEFS[c.specialty].short)}</span> <span className="muted tiny">★{c.rating} · {T('أتعاب', 'Fee')} {Math.round(c.feeRate * 100)}% {c.taskId ? T('· مشغول', '· busy') : ''}</span></div>)}
        </>
      )}
      {state.stage < 3 && <div className="card muted">{T('التوظيف يفتح عند الانتقال لمرحلة الاستوديو الصغير.', 'Hiring unlocks at the Small Studio stage.')}</div>}
      {state.stage >= 3 && (
        <>
          <h4>👥 {T('الموظفون', 'Employees')} ({state.employees.length}/{maxEmployees(state)})</h4>
          {state.employees.map((e) => (
            <div className="emp card" key={e.id}>
              <div className="card-head"><b>{personName(e.name, lang)}</b><span className="pill">{roleName[e.role]}{e.role === 'creative' ? ` · ${L(SPECIALTY_DEFS[e.specialty].short)}` : ''} · Lv{e.level}</span></div>
              <div className="emp-stats tiny">
                <span>{T('الجودة', 'Quality')} {bar(e.quality)}</span><span>{T('السرعة', 'Speed')} {bar(e.speed, 2)}</span>
                <span>{T('الطاقة', 'Energy')} {bar(e.energy, 100)}</span><span>{T('الرضا', 'Satisfaction')} {bar(e.satisfaction, 100)}</span>
              </div>
              <div className="muted tiny">{T('الراتب', 'Salary')}: {formatSAR(e.salary, lang)}/{T('أسبوع', 'week')} · {e.taskId ? T('يعمل على مهمة', 'Working on a task') : T('متاح', 'Available')} · {T('تحمّل الضغط', 'Stress tolerance')} {Math.round(e.stressTolerance * 100)}%</div>
              {e.raiseRequest && (
                <div className="row warnbox">💰 {T('يطلب زيادة إلى', 'Asks for')} {formatSAR(e.raiseRequest, lang)}
                  <button className="btn tiny primary" onClick={() => void act({ type: 'raise', employeeId: e.id, accept: true })}>{T('موافقة', 'Accept')}</button>
                  <button className="btn tiny ghost" onClick={() => void act({ type: 'raise', employeeId: e.id, accept: false })}>{T('رفض', 'Decline')}</button>
                </div>
              )}
              <div className="row">
                <button className="btn tiny" disabled={e.trainingUntil > state.time} onClick={() => void act({ type: 'train', employeeId: e.id })}>🎓 {T('تدريب', 'Train')} ({formatSAR(600 + e.level * 300, lang)})</button>
                <button className="btn tiny ghost" onClick={() => { if (confirm(T('إنهاء خدمة الموظف؟', 'Let this employee go?'))) void act({ type: 'fire', employeeId: e.id }); }}>{T('إنهاء الخدمة', 'Let go')}</button>
              </div>
            </div>
          ))}
          <h4>📨 {T('المرشحون', 'Candidates')}</h4>
          <div className="row wrap">
            <button className="btn tiny" onClick={() => void act({ type: 'recruit', role: 'creative' })}>📢 {T('إعلان وظيفة مبدع (300)', 'Post creative job (300)')}</button>
            {state.stage >= 4 && <button className="btn tiny" onClick={() => void act({ type: 'recruit', role: 'coordinator' })}>📇 {T('منسّق', 'Coordinator')}</button>}
            {state.stage >= 4 && <button className="btn tiny" onClick={() => void act({ type: 'recruit', role: 'pm' })}>📋 {T('مدير مشاريع', 'Project manager')}</button>}
          </div>
          {state.candidates.map((c) => (
            <div className="emp card" key={c.id}>
              <div className="card-head"><b>{personName(c.name, lang)}</b><span className="pill">{roleName[c.role]}{c.role === 'creative' ? ` · ${SPECIALTY_DEFS[c.specialty].icon} ${L(SPECIALTY_DEFS[c.specialty].short)}` : ''} · Lv{c.level}</span></div>
              <div className="emp-stats tiny"><span>{T('الجودة', 'Quality')} {bar(c.quality)}</span><span>{T('السرعة', 'Speed')} {bar(c.speed, 2)}</span><span>{T('تحمّل الضغط', 'Stress tol.')} {bar(c.stressTolerance)}</span></div>
              <div className="row"><span className="muted tiny">{T('الراتب المتوقع', 'Expected salary')}: {formatSAR(c.askSalary, lang)}/{T('أسبوع', 'wk')} · {T('مكافأة توقيع بنفس القيمة', 'Signing bonus equal to one week')}</span>
                <button className="btn tiny primary" onClick={() => void act({ type: 'hire', candidateId: c.id })} data-testid="hire">{T('توظيف', 'Hire')}</button></div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function CompanyPanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useLang();
  const act = useGame((s) => s.act);
  const coord = state.employees.some((e) => e.role === 'coordinator');
  const pm = state.employees.some((e) => e.role === 'pm');
  const [name, setName] = useState(state.companyName);
  const pol = (key: keyof GameState['policies'], label: string, ok: boolean) => (
    <label className="chk"><input type="checkbox" disabled={!ok} checked={state.policies[key]} onChange={(e) => void act({ type: 'setPolicy', key, value: e.target.checked })} /> {label}</label>
  );
  const stages: [string, string][] = [['intake', T('وارد', 'Intake')], ['planning', T('تخطيط', 'Planning')], ['production', T('إنتاج', 'Production')], ['review', T('مراجعة', 'Review')], ['delivery', T('تسليم', 'Delivery')]];
  const live = state.projects.filter((p) => ['offer', 'active', 'exporting'].includes(p.status));
  return (
    <>
      {state.stage >= 5 && (
        <div className="row"><input value={name} onChange={(e) => setName(e.target.value)} placeholder={T('اسم الشركة', 'Company name')} /><button className="btn small" onClick={() => void act({ type: 'setCompanyName', name })}>{T('حفظ', 'Save')}</button></div>
      )}
      <h4>🏛️ {T('الأقسام', 'Departments')}</h4>
      <div className="row wrap">
        {SPECIALTIES.map((s) => state.departments.includes(s)
          ? <span key={s} className="pill good">{SPECIALTY_DEFS[s].icon} {L(SPECIALTY_DEFS[s].short)} · {state.employees.filter((e) => e.specialty === s && e.role === 'creative').length}</span>
          : <button key={s} className="btn tiny" onClick={() => void act({ type: 'openDepartment', specialty: s })}>+ {L(SPECIALTY_DEFS[s].short)} ({formatSAR(3000, lang)})</button>)}
      </div>
      <h4>🤖 {T('سير العمل الإداري', 'Management workflow')}</h4>
      <div className="muted tiny">{T('العميل ← المنسّق ← مدير المشاريع ← القسم ← المراجعة ← العميل', 'Client → Coordinator → PM → Department → Review → Client')}</div>
      {pol('autoScreen', T('المنسّق يعتذر عن الطلبات خارج قدرات الأقسام', 'Coordinator declines out-of-scope requests'), coord)}
      {pol('autoAccept', T('المنسّق يقبل الطلبات المناسبة تلقائيًا', 'Coordinator auto-accepts fitting requests'), coord)}
      {pol('autoAssign', T('مدير المشاريع يوزع المهام على الموظفين', 'PM assigns tasks to staff'), pm)}
      {pol('autoReview', T('مدير المشاريع يراجع ويسلّم للعميل', 'PM reviews and delivers'), pm)}
      {(!coord || !pm) && <div className="muted tiny">{T('وظّف منسّقًا ومدير مشاريع من «الفريق» لتفعيل الأتمتة.', 'Hire a coordinator and a PM from Team to enable automation.')}</div>}
      <h4>🗂️ {T('لوحة المشاريع', 'Project board')}</h4>
      <div className="board">
        {stages.map(([id, n]) => (
          <div key={id} className="col"><b>{n}</b>
            {live.filter((p) => (p.status === 'offer' ? 'intake' : p.pipeline) === id).map((p) => <div key={p.id} className="mini-card">{L(p.title)}<small>{p.tasks.filter((t) => t.status === 'done').length}/{p.tasks.length}</small></div>)}
          </div>
        ))}
      </div>
    </>
  );
}

function FinancePanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useLang();
  const salaries = state.employees.reduce((a, e) => a + e.salary, 0);
  const rent = OFFICE_TIERS[state.officeTier].weeklyRent;
  const ops = state.location === 'home' ? 100 : 250 + state.employees.length * 60;
  return (
    <>
      <div className="stats-box">
        <div>💰 {T('الرصيد', 'Balance')}: <b>{formatSAR(state.money, lang)}</b></div>
        <div>📤 {T('المصاريف الأسبوعية', 'Weekly costs')}: {formatSAR(salaries + rent + ops, lang)} <small>({T('رواتب', 'salaries')} {salaries} · {T('إيجار', 'rent')} {rent} · {T('تشغيل', 'ops')} {ops})</small></div>
        <div>📈 {T('إجمالي الدخل', 'Total earned')}: {formatSAR(state.stats.totalEarned, lang)} · 📉 {T('إجمالي الصرف', 'Total spent')}: {formatSAR(state.stats.totalSpent, lang)}</div>
      </div>
      <h4>🧾 {T('آخر العمليات', 'Recent transactions')}</h4>
      <div className="ledger">
        {state.ledger.slice(0, 40).map((x) => <div key={x.id} className={`lrow ${x.amount >= 0 ? 'in' : 'out'}`}><span>{T('ي', 'D')}{dayOf(x.time)} {clockOf(x.time)}</span><span>{L(x.label)}</span><b>{x.amount >= 0 ? '+' : ''}{x.amount}</b></div>)}
      </div>
    </>
  );
}

function OnlinePanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const lang = useLang();
  const conn = useGame((s) => s.conn);
  const presence = useGame((s) => s.presence);
  const bank = useGame((s) => s.bank);
  const act = useGame((s) => s.act);
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const you = conn?.you ?? '';
  if (conn?.kind !== 'remote') {
    return <div className="card">{T('هذا حفظ محلي. لدعوة صديق أنشئ حفظًا أونلاين من القائمة الرئيسية بعد تسجيل الدخول.', 'This is a local save. To invite a friend, create an online save from the main menu after logging in.')}</div>;
  }
  const invite = async () => {
    setErr('');
    try { const r = await api(`/api/worlds/${state.id}/invite`, 'POST'); setCode(r.code); } catch (e) { setErr(e instanceof ApiError ? L(e.l10n) : String(e)); }
  };
  const link = code ? `${location.origin}${location.pathname}?join=${code}` : '';
  const isOwner = state.ownerId === you;
  return (
    <>
      <div className="card">
        <b>🤝 {T('ادعُ صديقًا إلى مساحتك', 'Invite a friend to your space')}</b>
        <div className="muted tiny">{T('يسجّل صديقك حسابًا ثم يدخل الرمز من القائمة الرئيسية، أو يفتح الرابط.', 'Your friend registers, then enters the code in the main menu or opens the link.')}</div>
        <button className="btn primary small" onClick={invite} data-testid="create-invite">{T('إنشاء رمز دعوة', 'Create invite code')}</button>
        {code && <div className="invite"><span className="code" data-testid="invite-code">{code}</span><input readOnly value={link} onFocus={(e) => e.target.select()} /><button className="btn tiny" onClick={() => navigator.clipboard?.writeText(link)}>📋</button></div>}
        {err && <div className="err">{err}</div>}
      </div>
      <h4>👥 {T('أعضاء المساحة', 'Members')}</h4>
      {Object.values(state.players).map((p) => (
        <div key={p.id} className="emp">
          <span className={`dot ${presence[p.id]?.online || p.id === you ? 'on' : ''}`} /> <b>{p.name}</b> <span className="pill">{p.role === 'owner' ? T('المالك', 'Owner') : p.role === 'partner' ? T('شريك', 'Partner') : T('مساعد', 'Assistant')}</span>
          {presence[p.id]?.work && <span className="muted tiny"> ⌨️ {Math.round(presence[p.id].work!.pct)}%</span>}
          <span className="muted tiny"> · {T('أرباحه هنا', 'earned here')}: {formatSAR(p.earnings, lang)}</span>
          {isOwner && p.role !== 'owner' && (
            <select value={p.role} onChange={(e) => void act({ type: 'setRole', playerId: p.id, role: e.target.value as any })}>
              <option value="assistant">{T('مساعد', 'Assistant')}</option><option value="partner">{T('شريك', 'Partner')}</option>
            </select>
          )}
        </div>
      ))}
      <div className="muted tiny">{T('الشريك يستطيع قبول المشاريع وتوزيعها وتسليمها. المساعد ينفذ المهام فقط. المشتريات والتوظيف للمالك.', 'Partners can accept, assign and deliver projects. Assistants work on tasks. Purchases and hiring are owner-only.')}</div>
      <h4>🏦 {T('حساب أرباح التعاون', 'Co-op earnings account')}</h4>
      <div className="card">
        <div>{T('رصيدك في الحساب', 'Your account balance')}: <b>{formatSAR(bank, lang)}</b></div>
        <div className="muted tiny">{T('حصتك من مشاريع أصدقائك تصل هنا مرة واحدة فقط لكل مشروع. يمكنك تحويلها إلى حفظك الخاص.', 'Your share of friends\' projects lands here once per project. Transfer it into your own save.')}</div>
        {isOwner && bank > 0 && <button className="btn small" onClick={async () => { const r = await conn.withdraw(bank); if (!r.ok && r.error) useGame.getState().toast(r.error, 'bad'); }}>{T('تحويل إلى هذه المساحة', 'Transfer into this save')}</button>}
      </div>
      <div className="muted tiny">🔗 {serverBase()}</div>
    </>
  );
}

function SettingsPanel() {
  const T = useT();
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.set);
  const upd = (p: Partial<typeof settings>) => { set({ settings: { ...settings, ...p } }); if (p.lang) applyDir(p.lang); };
  return (
    <>
      <label className="chk"><input type="checkbox" checked={settings.help} onChange={(e) => upd({ help: e.target.checked })} data-testid="help-toggle" /> {T('المساعدة داخل اللعبة (تلميحات وإبراز الأدوات والتحقق المباشر)', 'In-game help (hints, highlights and live checks)')}</label>
      <label className="chk"><input type="checkbox" checked={settings.sound} onChange={(e) => upd({ sound: e.target.checked })} /> {T('المؤثرات الصوتية', 'Sound effects')}</label>
      <label>{T('اللغة', 'Language')}<select value={settings.lang} onChange={(e) => upd({ lang: e.target.value as any })}><option value="ar">العربية</option><option value="en">English</option></select></label>
      <label>{T('جودة الرسوميات', 'Graphics quality')}<select value={settings.quality} onChange={(e) => upd({ quality: e.target.value as any })}><option value="high">{T('عالية (ظلال)', 'High (shadows)')}</option><option value="low">{T('منخفضة', 'Low')}</option></select></label>
      <div className="muted tiny">{T('لا توجد موسيقى افتراضيًا. التقدم يُحفظ تلقائيًا.', 'No music by default. Progress saves automatically.')}</div>
      <button className="btn" onClick={() => { useGame.getState().conn?.close(); useGame.setState({ conn: null, state: null, screen: 'menu', panel: null, cam: 'room', computerApp: null }); }}>🏠 {T('القائمة الرئيسية (حفظ وخروج)', 'Main menu (save & exit)')}</button>
    </>
  );
}

function PhonePanel({ state }: { state: GameState }) {
  const T = useT();
  const L = useL();
  const act = useGame((s) => s.act);
  const you = useGame((s) => s.conn?.you ?? '');
  const me = state.players[you];
  const [app, setApp] = useState<'home' | 'messages' | 'game'>(me?.activity && ['phone', 'rest'].includes(me.activity.kind) ? 'game' : 'home');
  useEffect(() => { void act({ type: 'markRead' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const startGame = async () => {
    if (!me?.activity || !['phone', 'rest'].includes(me.activity.kind)) { const ok = await act({ type: 'activity', kind: 'phone' }); if (!ok) return; }
    setApp('game');
  };
  return (
    <div className="phone">
      {app === 'home' && (
        <div className="apps">
          <button onClick={() => setApp('messages')}><span>💬</span>{T('الرسائل', 'Messages')}</button>
          <button onClick={() => void act({ type: 'activity', kind: 'orderFood' })}><span>🛵</span>{T('اطلب أكل (55)', 'Order food (55)')}</button>
          <button onClick={startGame} data-testid="phone-game"><span>💡</span>{T('صائد الأفكار', 'Idea Catcher')}</button>
          <button onClick={() => void act({ type: 'activity', kind: 'phone' })}><span>📱</span>{T('تصفح سريع', 'Scroll a bit')}</button>
          <button onClick={() => { if (confirm(T('إجازة يومين؟ المواعيد تستمر أثناء غيابك.', 'Take a 2-day vacation? Deadlines keep running.'))) void act({ type: 'activity', kind: 'vacation' }); }}><span>🏖️</span>{T('إجازة', 'Vacation')}</button>
          <button onClick={() => useGame.setState({ panel: 'projects' })}><span>📋</span>{T('الطلبات', 'Offers')}</button>
        </div>
      )}
      {app === 'messages' && (
        <div className="msgs">
          <button className="btn tiny" onClick={() => setApp('home')}>‹ {T('رجوع', 'Back')}</button>
          {state.inbox.map((m) => <div key={m.id} className={`msg ${m.tone}`}><small>{T('ي', 'D')}{dayOf(m.time)} {clockOf(m.time)}</small>{L(m.text)}</div>)}
        </div>
      )}
      {app === 'game' && (
        <div>
          <button className="btn tiny" onClick={() => setApp('home')}>‹ {T('رجوع', 'Back')}</button>
          <CatchGame onDone={(score) => void act({ type: 'minigame', score })} />
        </div>
      )}
    </div>
  );
}
