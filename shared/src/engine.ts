// The authoritative game simulation. Pure (state, action, ctx) -> new state + events.
// Runs in the browser for offline saves and on the server for online worlds.
import type {
  ActivityKind, Appearance, Assignee, Employee, GameEvent, GameState, L10n, Needs, PlayerProfile, PlayerRole, Project,
  SlotId, SpecialtyId, StaffRole, Task,
} from './types';
import { HARDWARE_SLOTS, SPECIALTIES } from './types';
import { CATALOG_BY_ID, getItem, HOME_SIZES, OFFICE_TIERS, type ItemStats } from './data/catalog';
import { SPECIALTY_DEFS } from './data/specialties';
import { levelFromXp, skillXpForLevel, stageDef, STAGES } from './data/stages';
import { makeRng, stateRng, hashString } from './rng';
import { generateCandidate, generateContractor, generateOffer, makeClients, nid, personName, availableSpecialties } from './generate';
import { checkAll, WORK_MODULES } from './work';
import { clamp, l, MIN_PER_DAY, MIN_PER_HOUR, DAYS_PER_WEEK, dayOf } from './util';

export const STATE_VERSION = 1;

export type Action =
  | { type: 'tick'; minutes: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'accept'; projectId: string }
  | { type: 'decline'; projectId: string }
  | { type: 'negotiate'; projectId: string; ask: 'price' | 'time' }
  | { type: 'assign'; taskId: string; assignee: Assignee | null }
  | { type: 'submitTask'; taskId: string; doc: any }
  | { type: 'review'; projectId: string }
  | { type: 'deliver'; projectId: string }
  | { type: 'buy'; itemId: string }
  | { type: 'equip'; itemId: string }
  | { type: 'place'; itemId: string; x: number; z: number; rot: number }
  | { type: 'movePlaced'; uid: string; x: number; z: number; rot: number }
  | { type: 'storePlaced'; uid: string }
  | { type: 'activity'; kind: ActivityKind }
  | { type: 'cancelActivity' }
  | { type: 'minigame'; score: number }
  | { type: 'learn'; specialty: SpecialtyId }
  | { type: 'advanceStage'; companyName?: string }
  | { type: 'hireContractor'; taskId: string; contractorId: string }
  | { type: 'hire'; candidateId: string }
  | { type: 'fire'; employeeId: string }
  | { type: 'train'; employeeId: string }
  | { type: 'raise'; employeeId: string; accept: boolean }
  | { type: 'recruit'; role: StaffRole; specialty?: SpecialtyId }
  | { type: 'openDepartment'; specialty: SpecialtyId }
  | { type: 'setPolicy'; key: keyof GameState['policies']; value: boolean }
  | { type: 'setCompanyName'; name: string }
  | { type: 'setSplit'; projectId: string; split: Record<string, number> | null }
  | { type: 'setRole'; playerId: string; role: PlayerRole }
  | { type: 'addPlayer'; id: string; name: string; appearance: Appearance }
  | { type: 'bankDeposit'; amount: number; ref: string }
  | { type: 'markRead' }
  | { type: 'devGrant'; money?: number; xp?: number; reputation?: number; completed?: number };

export interface Ctx { actorId: string; system?: boolean; allowCheats?: boolean }
export interface ApplyResult { state: GameState; events: GameEvent[]; error?: L10n }

class GameError extends Error { constructor(public msg: L10n) { super(msg.en); } }
const fail = (ar: string, en: string): never => { throw new GameError(l(ar, en)); };

// ---------------------------------------------------------------- creation

export const DEFAULT_NEEDS: Needs = { energy: 90, focus: 85, comfort: 80, passion: 80, stress: 10, hunger: 15 };

export function createWorld(opts: {
  id: string; ownerId: string; saveName: string; name: string; appearance: Appearance; specialty: SpecialtyId; seed?: number; now?: number;
}): GameState {
  const seed = opts.seed ?? hashString(opts.id);
  const skills = Object.fromEntries(SPECIALTIES.map((s) => [s, { level: 1, xp: 0 }])) as GameState['skills'];
  const equipment = Object.fromEntries(HARDWARE_SLOTS.map((s) => [s, `${s}_1`])) as Record<SlotId, string>;
  const s: GameState = {
    version: STATE_VERSION, id: opts.id, ownerId: opts.ownerId, saveName: opts.saveName, companyName: '',
    createdAt: opts.now ?? 0, time: 8 * MIN_PER_HOUR, speed: 1, rng: seed, idCounter: 0,
    money: 1500, xp: 0, level: 1, reputation: 5, stage: 1, location: 'home', officeTier: 0,
    specialties: [opts.specialty], primarySpecialty: opts.specialty, skills, learning: null,
    players: {}, equipment, owned: [...Object.values(equipment), 'wall_cream', 'floor_wood'],
    room: { wall: 'wall_cream', floor: 'floor_wood', sizeTier: 0, placed: [], storage: [] },
    projects: [], clients: makeClients(seed), employees: [], candidates: [], contractors: [], departments: [],
    policies: { autoScreen: false, autoAccept: false, autoAssign: false, autoReview: false },
    ledger: [], inbox: [],
    stats: { projectsCompleted: 0, projectsFailed: 0, totalEarned: 0, totalSpent: 0, bestRating: 0, daysWorkedStreak: 0 },
    lastDailyAt: 1, lastWeeklyAt: 0, nextOfferAt: 8 * MIN_PER_HOUR + 2, processedActions: [],
  };
  s.players[opts.ownerId] = newPlayer(opts.ownerId, opts.name, opts.appearance, 'owner', s.time);
  // a welcome plant and the first offer so the player can start right away
  s.room.placed.push({ uid: 'u0', itemId: 'd_plant', x: 0, z: 0, rot: 0 });
  s.owned.push('d_plant');
  const first = generateOffer(s, stateRng(s), { forceSpecialty: opts.specialty });
  first.offerExpiresAt = s.time + 2 * MIN_PER_DAY;
  s.projects.push(first);
  inbox(s, l('مرحبًا بك! وصلك أول طلب عمل، افتح الكمبيوتر أو الجوال لقراءته.', 'Welcome! Your first job request has arrived — check your computer or phone.'), 'offer');
  s.nextOfferAt = s.time + 3 * MIN_PER_HOUR;
  return s;
}

export function newPlayer(id: string, name: string, appearance: Appearance, role: PlayerRole, time: number): PlayerProfile {
  return { id, name: String(name).slice(0, 24), appearance, role, needs: { ...DEFAULT_NEEDS }, activity: null, burnout: false, earnings: 0, tasksDone: 0, lastMinigameAt: -9999, joinedAt: time };
}

// ---------------------------------------------------------------- derived values

export function equipmentStats(state: GameState) {
  const acc = { cpu: 1, gpu: 1, ram: 8, disk: 1, zoom: 1, guides: false, screens: 1, focusDecay: 1, comfortDecay: 1, passion: 0, stressRelief: 0, coffee: false, fun: 1 };
  const apply = (st: ItemStats) => {
    if (st.cpu) acc.cpu = st.cpu;
    if (st.gpu) acc.gpu = st.gpu;
    if (st.ram) acc.ram = st.ram;
    if (st.disk) acc.disk = st.disk;
    if (st.zoom) acc.zoom = st.zoom;
    if (st.guides) acc.guides = true;
    if (st.screens) acc.screens = st.screens;
    if (st.focusDecay) acc.focusDecay *= st.focusDecay;
    if (st.comfortDecay) acc.comfortDecay *= st.comfortDecay;
    if (st.passion) acc.passion += st.passion;
    if (st.stressRelief) acc.stressRelief += st.stressRelief;
    if (st.coffee) acc.coffee = true;
    if (st.fun) acc.fun = Math.max(acc.fun, st.fun);
  };
  for (const slot of HARDWARE_SLOTS) apply(CATALOG_BY_ID[state.equipment[slot]]?.stats ?? {});
  apply(CATALOG_BY_ID[state.room.floor]?.stats ?? {});
  let decorPassion = 0, decorRelief = 0;
  for (const p of state.room.placed) {
    const st = CATALOG_BY_ID[p.itemId]?.stats ?? {};
    decorPassion += st.passion ?? 0; decorRelief += st.stressRelief ?? 0;
    if (st.focusDecay) acc.focusDecay *= st.focusDecay;
    if (st.comfortDecay) acc.comfortDecay *= st.comfortDecay;
    if (st.coffee) acc.coffee = true;
    if (st.fun) acc.fun = Math.max(acc.fun, st.fun);
  }
  acc.passion += Math.min(2, decorPassion);
  acc.stressRelief += Math.min(3, decorRelief);
  acc.focusDecay = Math.max(0.55, acc.focusDecay);
  acc.comfortDecay = Math.max(0.35, acc.comfortDecay);
  if (state.stage >= 3) { acc.cpu *= 1.15; acc.gpu *= 1.15; } // office workstations / render node
  return acc;
}

export function roomSize(state: GameState) {
  if (state.location === 'office') { const o = OFFICE_TIERS[state.officeTier]; return { w: o.w, d: o.d }; }
  return HOME_SIZES[state.room.sizeTier];
}

export function deskCapacity(state: GameState) { return OFFICE_TIERS[state.officeTier].desks - 1; }

export function maxEmployees(state: GameState) { return Math.min(stageDef(state.stage).maxEmployees, deskCapacity(state)); }

export function exportMinutes(state: GameState, p: Project) {
  const eq = equipmentStats(state);
  const base = 25 + p.tasks.length * 20 + p.difficulty * 12;
  const gpuBound = p.specialties.some((s) => SPECIALTY_DEFS[s].renderBound === 'gpu');
  const speed = gpuBound ? eq.gpu * (0.6 + 0.4 * eq.disk) : eq.cpu * eq.disk;
  return Math.max(5, Math.round(base / speed));
}

export function stageProgress(state: GameState) {
  const next = STAGES.find((s) => s.id === state.stage + 1);
  if (!next) return null;
  const creatives = state.employees.length;
  const checks = [
    { key: 'level', have: state.level, need: next.req.level },
    { key: 'reputation', have: Math.floor(state.reputation), need: next.req.reputation },
    { key: 'completed', have: state.stats.projectsCompleted, need: next.req.completed },
    { key: 'employees', have: creatives, need: next.req.employees },
    { key: 'money', have: Math.floor(state.money), need: next.req.money },
  ].filter((c) => c.need > 0);
  return { next, checks, ready: checks.every((c) => c.have >= c.need) };
}

export function playerTier(state: GameState, sp: SpecialtyId) { return state.skills[sp]?.level ?? 1; }

// ---------------------------------------------------------------- helpers

function inbox(s: GameState, text: L10n, tone: 'info' | 'good' | 'bad' | 'offer' = 'info') {
  s.inbox.unshift({ id: nid(s, 'm'), time: s.time, text, tone, read: false });
  if (s.inbox.length > 40) s.inbox.length = 40;
}

function toast(ev: GameEvent[], text: L10n, tone: GameEvent['tone'] = 'info', sound?: string) {
  ev.push({ kind: 'toast', text, tone, sound });
}

function ledger(s: GameState, amount: number, kind: string, label: L10n) {
  s.ledger.unshift({ id: nid(s, 'tx'), time: s.time, amount: Math.round(amount), kind, label });
  if (s.ledger.length > 120) s.ledger.length = 120;
}

function spend(s: GameState, amount: number, kind: string, label: L10n) {
  amount = Math.round(amount);
  if (amount < 0) fail('مبلغ غير صالح', 'Invalid amount');
  if (s.money < amount) fail('الرصيد غير كافٍ', 'Not enough money');
  s.money -= amount;
  s.stats.totalSpent += amount;
  ledger(s, -amount, kind, label);
}

/** recurring costs may push the balance negative (debt) */
function charge(s: GameState, amount: number, kind: string, label: L10n) {
  amount = Math.round(amount);
  s.money -= amount;
  s.stats.totalSpent += amount;
  ledger(s, -amount, kind, label);
}

function earn(s: GameState, amount: number, kind: string, label: L10n) {
  amount = Math.round(amount);
  s.money += amount;
  s.stats.totalEarned += amount;
  ledger(s, amount, kind, label);
}

function findProject(s: GameState, id: string) {
  const p = s.projects.find((x) => x.id === id);
  if (!p) fail('المشروع غير موجود', 'Project not found');
  return p!;
}
function findTask(s: GameState, id: string) {
  for (const p of s.projects) for (const t of p.tasks) if (t.id === id) return { p, t };
  return fail('المهمة غير موجودة', 'Task not found');
}

function log(p: Project, s: GameState, text: L10n) { p.log.push({ time: s.time, text }); if (p.log.length > 30) p.log.shift(); }

function addXp(s: GameState, amount: number, ev: GameEvent[]) {
  s.xp += Math.round(amount);
  const lv = levelFromXp(s.xp);
  if (lv > s.level) {
    s.level = lv;
    toast(ev, l(`ارتفع مستواك إلى ${lv}!`, `Level up! You are now level ${lv}.`), 'good', 'level');
    ev.push({ kind: 'level', amount: lv });
  }
}

function addSkillXp(s: GameState, sp: SpecialtyId, amount: number, ev: GameEvent[]) {
  const sk = s.skills[sp];
  sk.xp += Math.round(amount);
  while (sk.xp >= skillXpForLevel(sk.level)) {
    sk.xp -= skillXpForLevel(sk.level);
    sk.level++;
    toast(ev, l(`تطورت مهارتك في ${SPECIALTY_DEFS[sp].short.ar} إلى المستوى ${sk.level}`, `${SPECIALTY_DEFS[sp].short.en} skill reached level ${sk.level}`), 'good', 'level');
  }
}

const ROLE_RANK: Record<PlayerRole, number> = { assistant: 1, partner: 2, owner: 3 };
function requireRole(s: GameState, ctx: Ctx, min: PlayerRole) {
  if (ctx.system) return;
  const p = s.players[ctx.actorId];
  if (!p) fail('أنت لست عضوًا في هذه المساحة', 'You are not a member of this workspace');
  if (ROLE_RANK[p.role] < ROLE_RANK[min]) fail('ليست لديك صلاحية لهذا الإجراء', 'You do not have permission for this action');
}

function actor(s: GameState, ctx: Ctx) {
  const p = s.players[ctx.actorId];
  if (!p) fail('اللاعب غير موجود', 'Player not found');
  return p;
}

function activeProjects(s: GameState) { return s.projects.filter((p) => p.status === 'active' || p.status === 'revision' || p.status === 'exporting'); }

function workingHours(time: number) { const h = (time % MIN_PER_DAY) / 60; return h >= 8 && h < 20; }

// ---------------------------------------------------------------- main entry

export function applyAction(prev: GameState, action: Action, ctx: Ctx): ApplyResult {
  const s: GameState = structuredClone(prev);
  const ev: GameEvent[] = [];
  try {
    reduce(s, action, ctx, ev);
    return { state: s, events: ev };
  } catch (e) {
    if (e instanceof GameError) return { state: prev, events: [], error: e.msg };
    throw e;
  }
}

function reduce(s: GameState, a: Action, ctx: Ctx, ev: GameEvent[]) {
  switch (a.type) {
    case 'tick': {
      if (!ctx.system) fail('غير مسموح', 'Not allowed');
      let left = Math.max(0, Math.min(MIN_PER_DAY, Number(a.minutes) || 0));
      while (left > 0) { const m = Math.min(10, left); stepTime(s, m, ev); left -= m; }
      return;
    }
    case 'setSpeed': requireRole(s, ctx, 'partner'); s.speed = clamp(Math.round(a.speed), 0, 4); return;

    case 'accept': {
      requireRole(s, ctx, 'partner');
      const p = findProject(s, a.projectId);
      if (p.status !== 'offer') fail('العرض لم يعد متاحًا', 'This offer is no longer available');
      acceptProject(s, p, ev);
      return;
    }
    case 'decline': {
      requireRole(s, ctx, 'partner');
      const p = findProject(s, a.projectId);
      if (p.status !== 'offer') fail('العرض لم يعد متاحًا', 'This offer is no longer available');
      p.status = 'declined';
      const c = s.clients.find((x) => x.id === p.clientId)!;
      c.relationship = clamp(c.relationship - 2);
      return;
    }
    case 'negotiate': {
      requireRole(s, ctx, 'partner');
      const p = findProject(s, a.projectId);
      if (p.status !== 'offer') fail('العرض لم يعد متاحًا', 'This offer is no longer available');
      if (p.negotiated) fail('تفاوضت على هذا العرض مسبقًا', 'You already negotiated this offer');
      p.negotiated = true;
      const c = s.clients.find((x) => x.id === p.clientId)!;
      const chance = clamp(0.25 + s.reputation / 200 + c.relationship / 250, 0, 0.9);
      const roll = makeRng(hashString(p.id + a.ask)).next();
      if (roll < chance) {
        if (a.ask === 'price') { p.budget = Math.round(p.budget * 1.2 / 50) * 50; toast(ev, l('وافق العميل على رفع السعر 20%', 'The client agreed to +20% budget'), 'good', 'cash'); }
        else { p.durationDays += 1; toast(ev, l('وافق العميل على يوم إضافي', 'The client agreed to one extra day'), 'good'); }
        log(p, s, l('تفاوض ناجح', 'Successful negotiation'));
      } else if (roll > 0.85 + chance * 0.1) {
        p.status = 'declined';
        c.relationship = clamp(c.relationship - 6);
        toast(ev, l('انزعج العميل وسحب العرض', 'The client was annoyed and withdrew the offer'), 'bad');
      } else {
        toast(ev, l('رفض العميل التعديل، العرض باقٍ بشروطه الأصلية', 'The client declined; the original offer stands'), 'info');
      }
      return;
    }

    case 'assign': {
      const { p, t } = findTask(s, a.taskId);
      if (p.status !== 'active') fail('المشروع ليس قيد التنفيذ', 'The project is not in production');
      if (t.status === 'done') fail('المهمة منجزة بالفعل', 'This task is already done');
      const me = actor(s, ctx);
      const selfAssign = a.assignee?.type === 'player' && a.assignee.id === ctx.actorId && (!t.assignee || (t.assignee.type === 'player' && t.assignee.id === ctx.actorId));
      if (!selfAssign) requireRole(s, ctx, 'partner');
      releaseAssignee(s, t);
      if (a.assignee) assignTask(s, p, t, a.assignee);
      log(p, s, l(`${me.name} وزّع «${t.title.ar}»`, `${me.name} assigned "${t.title.en}"`));
      return;
    }

    case 'submitTask': {
      const { p, t } = findTask(s, a.taskId);
      const me = actor(s, ctx);
      if (p.status !== 'active') fail('المشروع ليس قيد التنفيذ', 'The project is not in production');
      if (t.status === 'done') fail('تم تسليم هذه المهمة بالفعل', 'This task was already submitted');
      if (t.assignee && !(t.assignee.type === 'player' && t.assignee.id === me.id)) fail('هذه المهمة مسندة لشخص آخر', 'This task is assigned to someone else');
      if (me.burnout) fail('أنت مُنهك ولا تستطيع العمل الآن. خذ استراحة أو إجازة.', 'You are burned out. Take a break or a vacation.');
      if (s.stage < 3 && equipmentStats(s).ram < p.minRam) fail(`يحتاج هذا المشروع ذاكرة ${p.minRam} جيجا`, `This project needs ${p.minRam} GB RAM`);
      const doc = WORK_MODULES[t.specialty].sanitize(a.doc);
      const { results, correctness } = checkAll(t.specialty, doc, t.requirements);
      const n = me.needs;
      const condition = 0.7 + 0.3 * ((n.focus + n.energy) / 200);
      const skill = s.skills[t.specialty]?.level ?? 1;
      const quality = clamp(condition + skill * 0.01, 0, 1);
      const score = correctness * (0.9 + 0.1 * quality);
      t.doc = doc;
      t.status = 'done';
      t.progress = 1;
      t.assignee = { type: 'player', id: me.id };
      t.result = { score, correctness, results, by: { type: 'player', id: me.id }, at: s.time };
      me.tasksDone++;
      me.needs.passion = clamp(me.needs.passion + 2);
      addSkillXp(s, t.specialty, 20 + t.tier * 15 * correctness, ev);
      log(p, s, l(`${me.name} أنجز «${t.title.ar}» (${Math.round(correctness * 100)}%)`, `${me.name} finished "${t.title.en}" (${Math.round(correctness * 100)}%)`));
      toast(ev, l(`تم حفظ العمل: ${Math.round(correctness * 100)}% من المتطلبات`, `Work saved: ${Math.round(correctness * 100)}% of requirements met`), correctness >= 0.85 ? 'good' : 'info', 'success');
      onTaskDone(s, p, ev);
      return;
    }

    case 'review': {
      requireRole(s, ctx, 'partner');
      const p = findProject(s, a.projectId);
      if (p.status !== 'active' || !p.tasks.every((t) => t.status === 'done')) fail('لم تكتمل المهام بعد', 'Tasks are not finished yet');
      p.reviewed = true;
      p.pipeline = 'delivery';
      log(p, s, l('تمت المراجعة الداخلية', 'Internal review done'));
      return;
    }
    case 'deliver': {
      requireRole(s, ctx, 'partner');
      const p = findProject(s, a.projectId);
      deliverProject(s, p, ev);
      return;
    }

    case 'buy': {
      requireRole(s, ctx, 'owner');
      const it = CATALOG_BY_ID[a.itemId];
      if (!it) fail('عنصر غير معروف', 'Unknown item');
      if (it.unlockStage && s.stage < it.unlockStage) fail('هذا العنصر مقفل في مرحلتك الحالية', 'Locked at your current stage');
      if (it.unlockLevel && s.level < it.unlockLevel) fail(`يتطلب المستوى ${it.unlockLevel}`, `Requires level ${it.unlockLevel}`);
      const isDecor = it.category === 'decor';
      if (!isDecor && s.owned.includes(it.id)) fail('تملك هذا العنصر بالفعل', 'You already own this');
      if (it.category === 'roomSize') {
        if (s.location !== 'home') fail('التوسعة للغرفة المنزلية فقط', 'Expansion applies to the home room only');
        if (it.tier !== s.room.sizeTier + 1) fail('اشترِ التوسعة السابقة أولًا', 'Buy the previous expansion first');
      }
      spend(s, it.price, 'purchase', it.name);
      if (isDecor) s.room.storage.push(it.id);
      else s.owned.push(it.id);
      if (it.category === 'roomSize') s.room.sizeTier = it.tier;
      else if (it.category === 'wall') s.room.wall = it.id;
      else if (it.category === 'floor') s.room.floor = it.id;
      else if (!isDecor) s.equipment[it.category as SlotId] = it.id;
      toast(ev, l(`تم شراء ${it.name.ar}`, `Bought ${it.name.en}`), 'good', 'cash');
      return;
    }
    case 'equip': {
      requireRole(s, ctx, 'owner');
      const it = getItem(a.itemId);
      if (!s.owned.includes(it.id)) fail('لا تملك هذا العنصر', 'You do not own this item');
      if (it.category === 'wall') s.room.wall = it.id;
      else if (it.category === 'floor') s.room.floor = it.id;
      else if ((HARDWARE_SLOTS as string[]).includes(it.category)) s.equipment[it.category as SlotId] = it.id;
      else fail('لا يمكن تركيب هذا العنصر', 'Cannot equip this item');
      return;
    }
    case 'place': {
      requireRole(s, ctx, 'partner');
      const idx = s.room.storage.indexOf(a.itemId);
      if (idx < 0) fail('العنصر غير موجود في المخزن', 'Item is not in storage');
      const it = getItem(a.itemId);
      const rot = ((Math.round(a.rot) % 4) + 4) % 4;
      checkPlacement(s, it.id, Math.round(a.x), Math.round(a.z), rot, null);
      s.room.storage.splice(idx, 1);
      s.room.placed.push({ uid: nid(s, 'u'), itemId: it.id, x: Math.round(a.x), z: Math.round(a.z), rot });
      return;
    }
    case 'movePlaced': {
      requireRole(s, ctx, 'partner');
      const pl = s.room.placed.find((x) => x.uid === a.uid);
      if (!pl) fail('العنصر غير موجود', 'Item not found');
      const rot = ((Math.round(a.rot) % 4) + 4) % 4;
      checkPlacement(s, pl!.itemId, Math.round(a.x), Math.round(a.z), rot, pl!.uid);
      pl!.x = Math.round(a.x); pl!.z = Math.round(a.z); pl!.rot = rot;
      return;
    }
    case 'storePlaced': {
      requireRole(s, ctx, 'partner');
      const i = s.room.placed.findIndex((x) => x.uid === a.uid);
      if (i < 0) fail('العنصر غير موجود', 'Item not found');
      s.room.storage.push(s.room.placed[i].itemId);
      s.room.placed.splice(i, 1);
      return;
    }

    case 'activity': { startActivity(s, actor(s, ctx), a.kind, ev); return; }
    case 'cancelActivity': { const me = actor(s, ctx); me.activity = null; return; }
    case 'minigame': {
      const me = actor(s, ctx);
      if (!me.activity || !['phone', 'rest'].includes(me.activity.kind)) fail('العب أثناء الاستراحة', 'Play during a break');
      if (s.time - me.lastMinigameAt < 90) { toast(ev, l('استمتعت! (المكافأة متاحة كل ساعة ونصف)', 'Fun! (Bonus available every 90 minutes)'), 'info'); return; }
      me.lastMinigameAt = s.time;
      const fun = equipmentStats(s).fun;
      const gain = Math.round(clamp(Number(a.score) || 0, 0, 30) * 0.5 * fun);
      me.needs.passion = clamp(me.needs.passion + gain);
      me.needs.stress = clamp(me.needs.stress - gain * 0.8);
      toast(ev, l(`استراحة ممتعة! +${gain} شغف`, `Fun break! +${gain} passion`), 'good', 'success');
      return;
    }

    case 'learn': {
      requireRole(s, ctx, 'owner');
      if (s.stage < 2) fail('تعلّم تخصص جديد يُفتح في مرحلة الفريلانسر المحترف', 'Learning unlocks at the Pro Freelancer stage');
      if (s.specialties.includes(a.specialty)) fail('تجيد هذا التخصص بالفعل', 'You already know this specialty');
      if (s.learning) fail('أنت تتعلم تخصصًا آخر الآن', 'You are already learning');
      const d = SPECIALTY_DEFS[a.specialty];
      spend(s, d.learnCost, 'course', l(`دورة ${d.name.ar}`, `${d.name.en} course`));
      s.learning = { specialty: a.specialty, until: s.time + d.learnDays * MIN_PER_DAY };
      toast(ev, l(`بدأت دورة ${d.name.ar} (${d.learnDays} أيام)`, `Started the ${d.name.en} course (${d.learnDays} days)`), 'good');
      return;
    }
    case 'advanceStage': {
      requireRole(s, ctx, 'owner');
      const prog = stageProgress(s);
      if (!prog) fail('وصلت لأعلى مرحلة', 'You reached the final stage');
      if (!prog!.ready) fail('لم تحقق متطلبات المرحلة التالية بعد', 'Requirements for the next stage are not met');
      const next = prog!.next;
      if (next.id === 5) {
        const name = String(a.companyName ?? '').trim().slice(0, 40);
        if (name.length < 2) fail('اكتب اسم الشركة', 'Enter a company name');
        s.companyName = name;
      }
      if (next.cost) spend(s, next.cost, 'stage', next.name);
      s.stage = next.id;
      if (next.id >= 3) {
        // furniture goes into storage when moving; it can be placed again in the new office
        for (const pl of s.room.placed) s.room.storage.push(pl.itemId);
        s.room.placed = [];
        s.location = 'office';
        s.officeTier = next.id - 2;
      }
      if (next.id === 4) {
        for (const e of s.employees) if (e.role === 'creative' && !s.departments.includes(e.specialty)) s.departments.push(e.specialty);
        for (const sp of s.specialties) if (!s.departments.includes(sp)) s.departments.push(sp);
      }
      if (next.id === 3) refreshCandidates(s, 'creative');
      if (next.id === 4) { refreshCandidates(s, 'coordinator'); }
      if (next.id === 2) refreshContractors(s);
      inbox(s, l(`أصبحت الآن: ${next.name.ar}!`, `You are now a ${next.name.en}!`), 'good');
      toast(ev, l(`مرحلة جديدة: ${next.name.ar}`, `New stage: ${next.name.en}`), 'good', 'level');
      ev.push({ kind: 'stage', amount: next.id });
      return;
    }

    case 'hireContractor': {
      requireRole(s, ctx, 'partner');
      if (s.stage < 2) fail('التعاقد مع المستقلين يُفتح في المرحلة الثانية', 'Contractors unlock at stage 2');
      const { p, t } = findTask(s, a.taskId);
      if (p.status !== 'active' || t.status === 'done') fail('لا يمكن إسناد هذه المهمة', 'This task cannot be assigned');
      const c = s.contractors.find((x) => x.id === a.contractorId);
      if (!c) fail('المستقل غير موجود', 'Contractor not found');
      if (c!.taskId) fail('المستقل مشغول', 'Contractor is busy');
      if (c!.specialty !== t.specialty) fail('تخصص المستقل لا يناسب المهمة', 'Specialty mismatch');
      const fee = Math.round(taskValue(p, t) * c!.feeRate);
      spend(s, fee, 'contractor', l(`أتعاب ${personName(c!.name, 'ar')}`, `Fee for ${personName(c!.name, 'en')}`));
      releaseAssignee(s, t);
      assignTask(s, p, t, { type: 'contractor', id: c!.id });
      return;
    }
    case 'recruit': {
      requireRole(s, ctx, 'owner');
      if (s.stage < 3) fail('التوظيف يُفتح في مرحلة الاستوديو', 'Hiring unlocks at the studio stage');
      if (a.role !== 'creative' && s.stage < 4) fail('الوظائف الإدارية تُفتح في مرحلة الوكالة', 'Management roles unlock at the agency stage');
      spend(s, 300, 'recruit', l('إعلان توظيف', 'Job posting'));
      refreshCandidates(s, a.role, a.specialty);
      return;
    }
    case 'hire': {
      requireRole(s, ctx, 'owner');
      const c = s.candidates.find((x) => x.id === a.candidateId);
      if (!c) fail('المرشح غير متاح', 'Candidate not available');
      if (s.stage < 3) fail('التوظيف يُفتح في مرحلة الاستوديو', 'Hiring unlocks at the studio stage');
      if (c!.role !== 'creative' && s.stage < 4) fail('الوظائف الإدارية تُفتح في مرحلة الوكالة', 'Management roles unlock at the agency stage');
      if (c!.role !== 'creative' && s.employees.some((e) => e.role === c!.role)) fail('لديك شخص في هذا المنصب', 'This role is already filled');
      if (s.employees.length >= maxEmployees(s)) fail('لا توجد مكاتب شاغرة. انتقل لمكتب أكبر.', 'No free desks. Move to a bigger office.');
      if (c!.role === 'creative' && s.stage >= 4 && !s.departments.includes(c!.specialty)) fail('افتح قسم هذا التخصص أولًا', 'Open this department first');
      spend(s, c!.askSalary, 'hire', l(`مكافأة توقيع ${personName(c!.name, 'ar')}`, `Signing bonus for ${personName(c!.name, 'en')}`));
      const e: Employee = {
        id: nid(s, 'e'), name: c!.name, appearance: c!.appearance, role: c!.role, specialty: c!.specialty, level: c!.level, xp: 0,
        speed: c!.speed, quality: c!.quality, stressTolerance: c!.stressTolerance, salary: c!.askSalary, energy: 100, satisfaction: 75,
        taskId: null, hiredAt: s.time, lowSatisfactionDays: 0, raiseRequest: null, tasksDone: 0, trainingUntil: 0,
      };
      s.employees.push(e);
      s.candidates = s.candidates.filter((x) => x.id !== c!.id);
      if (e.role === 'coordinator') { s.policies.autoScreen = true; }
      if (e.role === 'pm') { s.policies.autoAssign = true; s.policies.autoReview = true; }
      toast(ev, l(`انضم ${personName(e.name, 'ar')} إلى الفريق`, `${personName(e.name, 'en')} joined the team`), 'good', 'success');
      return;
    }
    case 'fire': {
      requireRole(s, ctx, 'owner');
      const i = s.employees.findIndex((x) => x.id === a.employeeId);
      if (i < 0) fail('الموظف غير موجود', 'Employee not found');
      const e = s.employees[i];
      if (e.taskId) { const r = findTaskOpt(s, e.taskId); if (r) { r.t.assignee = null; r.t.status = 'todo'; } }
      charge(s, e.salary, 'severance', l(`تعويض نهاية خدمة ${personName(e.name, 'ar')}`, `Severance for ${personName(e.name, 'en')}`));
      s.employees.splice(i, 1);
      for (const o of s.employees) o.satisfaction = clamp(o.satisfaction - 4);
      if (e.role === 'coordinator') { s.policies.autoScreen = false; s.policies.autoAccept = false; }
      if (e.role === 'pm') { s.policies.autoAssign = false; s.policies.autoReview = false; }
      return;
    }
    case 'train': {
      requireRole(s, ctx, 'owner');
      const e = s.employees.find((x) => x.id === a.employeeId);
      if (!e) fail('الموظف غير موجود', 'Employee not found');
      if (e!.trainingUntil > s.time) fail('الموظف في دورة حاليًا', 'Already training');
      const cost = 600 + e!.level * 300;
      spend(s, cost, 'training', l(`تدريب ${personName(e!.name, 'ar')}`, `Training ${personName(e!.name, 'en')}`));
      e!.trainingUntil = s.time + MIN_PER_DAY;
      e!.quality = clamp(e!.quality + 0.04, 0, 0.98);
      e!.speed = clamp(e!.speed + 0.05, 0, 1.9);
      e!.satisfaction = clamp(e!.satisfaction + 8);
      return;
    }
    case 'raise': {
      requireRole(s, ctx, 'owner');
      const e = s.employees.find((x) => x.id === a.employeeId);
      if (!e || !e.raiseRequest) fail('لا يوجد طلب زيادة', 'No raise request');
      if (a.accept) { e!.salary = e!.raiseRequest!; e!.satisfaction = clamp(e!.satisfaction + 20); }
      else e!.satisfaction = clamp(e!.satisfaction - 15);
      e!.raiseRequest = null;
      return;
    }
    case 'openDepartment': {
      requireRole(s, ctx, 'owner');
      if (s.stage < 4) fail('الأقسام تُفتح في مرحلة الوكالة', 'Departments unlock at the agency stage');
      if (s.departments.includes(a.specialty)) fail('القسم مفتوح بالفعل', 'Department already open');
      spend(s, 3000, 'department', l(`افتتاح قسم ${SPECIALTY_DEFS[a.specialty].short.ar}`, `Open ${SPECIALTY_DEFS[a.specialty].short.en} department`));
      s.departments.push(a.specialty);
      refreshCandidates(s, 'creative', a.specialty);
      return;
    }
    case 'setPolicy': {
      requireRole(s, ctx, 'owner');
      const need: Record<string, StaffRole> = { autoScreen: 'coordinator', autoAccept: 'coordinator', autoAssign: 'pm', autoReview: 'pm' };
      if (a.value && !s.employees.some((e) => e.role === need[a.key])) fail('تحتاج لتوظيف الشخص المناسب أولًا', 'Hire the right person first');
      if (!(a.key in s.policies)) fail('سياسة غير معروفة', 'Unknown policy');
      s.policies[a.key] = !!a.value;
      return;
    }
    case 'setCompanyName': {
      requireRole(s, ctx, 'owner');
      if (s.stage < 5) fail('تسمية الشركة في المرحلة الخامسة', 'Naming unlocks at stage 5');
      s.companyName = String(a.name).trim().slice(0, 40);
      return;
    }
    case 'setSplit': {
      requireRole(s, ctx, 'owner');
      const p = findProject(s, a.projectId);
      if (p.status === 'completed') fail('المشروع مكتمل', 'Project already completed');
      if (a.split) {
        const entries = Object.entries(a.split).filter(([id]) => s.players[id]);
        const sum = entries.reduce((x, [, v]) => x + Math.max(0, Number(v) || 0), 0);
        if (sum <= 0) fail('توزيع غير صالح', 'Invalid split');
        p.split = Object.fromEntries(entries.map(([id, v]) => [id, Math.max(0, Number(v) || 0) / sum]));
      } else p.split = null;
      log(p, s, l('تم تحديث اتفاق توزيع الأرباح', 'Profit split updated'));
      return;
    }
    case 'setRole': {
      requireRole(s, ctx, 'owner');
      const p = s.players[a.playerId];
      if (!p || p.role === 'owner') fail('لا يمكن تغيير هذا الدور', 'Cannot change this role');
      if (!['partner', 'assistant'].includes(a.role)) fail('دور غير صالح', 'Invalid role');
      p!.role = a.role;
      return;
    }
    case 'addPlayer': {
      if (!ctx.system) fail('غير مسموح', 'Not allowed');
      if (!s.players[a.id]) {
        s.players[a.id] = newPlayer(a.id, a.name, a.appearance, 'assistant', s.time);
        inbox(s, l(`انضم ${a.name} إلى مساحة العمل`, `${a.name} joined the workspace`), 'good');
      } else {
        s.players[a.id].name = String(a.name).slice(0, 24);
        s.players[a.id].appearance = a.appearance;
      }
      return;
    }
    case 'bankDeposit': {
      if (!ctx.system) fail('غير مسموح', 'Not allowed');
      earn(s, a.amount, 'bank', l('تحويل من أرباح التعاون', 'Transfer from co-op earnings'));
      return;
    }
    case 'markRead': for (const m of s.inbox) m.read = true; return;
    case 'devGrant': {
      if (!ctx.allowCheats) fail('غير مسموح', 'Not allowed');
      if (a.money) earn(s, a.money, 'dev', l('منحة اختبار', 'Test grant'));
      if (a.xp) addXp(s, a.xp, ev);
      if (a.reputation) s.reputation = clamp(s.reputation + a.reputation);
      if (a.completed) s.stats.projectsCompleted += a.completed;
      return;
    }
  }
  fail('إجراء غير معروف', 'Unknown action');
}

function findTaskOpt(s: GameState, id: string) {
  for (const p of s.projects) for (const t of p.tasks) if (t.id === id) return { p, t };
  return null;
}

function taskValue(p: Project, t: Task) {
  const total = p.tasks.reduce((x, y) => x + y.valueWeight, 0);
  return p.budget * t.valueWeight / total;
}

function acceptProject(s: GameState, p: Project, ev: GameEvent[]) {
  if (s.stage < 3 && equipmentStats(s).ram < p.minRam) fail(`يحتاج هذا المشروع ذاكرة ${p.minRam} جيجا على الأقل`, `This project needs at least ${p.minRam} GB RAM`);
  const maxActive = s.stage >= 3 ? 2 + s.employees.length : s.stage === 2 ? 3 : 2;
  if (activeProjects(s).length >= maxActive) fail(`لا يمكنك العمل على أكثر من ${maxActive} مشاريع في نفس الوقت`, `You cannot run more than ${maxActive} projects at once`);
  p.status = 'active';
  p.acceptedAt = s.time;
  p.deadline = s.time + p.durationDays * MIN_PER_DAY;
  p.pipeline = s.employees.some((e) => e.role === 'pm') ? 'planning' : 'production';
  log(p, s, l('تم قبول المشروع', 'Project accepted'));
  toast(ev, l(`قبلت مشروع «${p.title.ar}»`, `Accepted "${p.title.en}"`), 'good', 'notify');
  // solo freelancer: tasks of a single-player world default to the owner
  if (Object.keys(s.players).length === 1 && s.stage < 3) {
    for (const t of p.tasks) t.assignee = { type: 'player', id: s.ownerId };
  }
}

function releaseAssignee(s: GameState, t: Task) {
  if (!t.assignee) return;
  if (t.assignee.type === 'employee') { const e = s.employees.find((x) => x.id === t.assignee!.id); if (e) e.taskId = null; }
  if (t.assignee.type === 'contractor') { const c = s.contractors.find((x) => x.id === t.assignee!.id); if (c) c.taskId = null; }
  t.assignee = null;
  if (t.status === 'in_progress') t.status = 'todo';
}

function assignTask(s: GameState, p: Project, t: Task, who: Assignee) {
  if (who.type === 'player') {
    if (!s.players[who.id]) fail('اللاعب غير موجود', 'Player not found');
    t.assignee = who;
  } else if (who.type === 'employee') {
    const e = s.employees.find((x) => x.id === who.id);
    if (!e || e.role !== 'creative') fail('الموظف غير متاح', 'Employee not available');
    if (e!.specialty !== t.specialty) fail('تخصص الموظف لا يناسب المهمة', 'Specialty mismatch');
    if (e!.taskId) fail('الموظف مشغول بمهمة أخرى', 'Employee is busy with another task');
    e!.taskId = t.id;
    t.assignee = who;
    t.status = 'in_progress';
  } else {
    const c = s.contractors.find((x) => x.id === who.id)!;
    c.taskId = t.id;
    t.assignee = who;
    t.status = 'in_progress';
  }
  if (p.pipeline === 'planning' || p.pipeline === 'intake') p.pipeline = 'production';
}

function onTaskDone(s: GameState, p: Project, ev: GameEvent[]) {
  if (p.tasks.every((t) => t.status === 'done')) {
    p.pipeline = 'review';
    toast(ev, l(`اكتملت كل مهام «${p.title.ar}» — جاهز للتسليم`, `All tasks of "${p.title.en}" are done — ready to deliver`), 'good', 'notify');
  }
}

function deliverProject(s: GameState, p: Project, ev: GameEvent[]) {
  if (p.status !== 'active') fail('لا يمكن تسليم هذا المشروع الآن', 'This project cannot be delivered now');
  if (!p.tasks.every((t) => t.status === 'done')) fail('أكمل كل المهام قبل التسليم', 'Finish all tasks before delivering');
  p.status = 'exporting';
  p.deliveredAt = s.time;
  p.exportEndsAt = s.time + exportMinutes(s, p);
  p.pipeline = 'delivery';
  log(p, s, l('بدأ التصدير والتسليم', 'Export and delivery started'));
  toast(ev, l(`جاري تصدير المشروع (${exportMinutes(s, p)} دقيقة في اللعبة)`, `Exporting (${exportMinutes(s, p)} game minutes)`), 'info', 'notify');
}

function evaluateDelivery(s: GameState, p: Project, ev: GameEvent[]) {
  const rng = stateRng(s);
  const client = s.clients.find((c) => c.id === p.clientId)!;
  const wsum = p.tasks.reduce((x, t) => x + t.valueWeight, 0);
  let score = p.tasks.reduce((x, t) => x + (t.result?.score ?? 0) * t.valueWeight, 0) / wsum;
  if (p.reviewed) score = Math.min(1, score + 0.03);
  const lateHours = Math.max(0, ((p.deliveredAt ?? s.time) - p.deadline) / 60);
  const lateFactor = Math.max(0.5, 1 - lateHours * 0.02);
  const revLeft = p.revisionsAllowed - p.revisionsUsed;

  const failedTasks = p.tasks.filter((t) => t.result && t.result.results.some((r) => !r.ok));
  if (score < 0.85 && revLeft > 0 && failedTasks.length) {
    p.revisionsUsed++;
    p.status = 'active';
    p.pipeline = 'production';
    p.reviewed = false;
    const lines: string[] = [], linesEn: string[] = [];
    for (const t of failedTasks) {
      t.status = 'todo'; t.progress = 0;
      if (t.assignee?.type === 'employee' || t.assignee?.type === 'contractor') { t.status = 'in_progress'; t.progress = 0.5; }
      for (const r of t.result!.results) if (!r.ok) { const q = t.requirements.find((x) => x.id === r.id)!; lines.push(q.text.ar); linesEn.push(q.text.en); }
    }
    const msg = l(`طلب ${client.name.ar} تعديلًا (${p.revisionsUsed}/${p.revisionsAllowed}): ${lines.slice(0, 3).join(' • ')}`, `${client.name.en} requested a revision (${p.revisionsUsed}/${p.revisionsAllowed}): ${linesEn.slice(0, 3).join(' • ')}`);
    log(p, s, msg); inbox(s, msg, 'bad'); toast(ev, msg, 'bad', 'notify');
    return;
  }
  if (score >= 0.85 && revLeft > 0 && p.revisionsUsed === 0 && rng.chance(client.pickiness * 0.6)) {
    const t = rng.pick(p.tasks);
    const tw = WORK_MODULES[t.specialty].tweak(rng, t.doc, t.requirements);
    if (tw) {
      p.revisionsUsed++;
      p.status = 'active';
      p.pipeline = 'production';
      p.reviewed = false;
      t.requirements.push({ ...tw, id: `r${t.requirements.length + 1}`, revision: true });
      t.status = t.assignee?.type === 'player' || !t.assignee ? 'todo' : 'in_progress';
      t.progress = t.status === 'in_progress' ? 0.7 : 0;
      const msg = l(`${client.name.ar} أعجبه العمل ويطلب تعديلًا بسيطًا: ${tw.text.ar}`, `${client.name.en} liked it and asks for a small tweak: ${tw.text.en}`);
      log(p, s, msg); inbox(s, msg, 'info'); toast(ev, msg, 'info', 'notify');
      return;
    }
  }

  // final acceptance
  const payFactor = score >= 0.9 ? 1 + (score >= 0.98 && lateHours === 0 ? 0.1 : 0) : 0.4 + 0.6 * score;
  const payout = Math.round(p.budget * payFactor * lateFactor);
  const ratingRaw = score * lateFactor;
  const rating = ratingRaw >= 0.95 ? 5 : ratingRaw >= 0.85 ? 4 : ratingRaw >= 0.7 ? 3 : ratingRaw >= 0.5 ? 2 : 1;
  p.status = 'completed';
  p.pipeline = 'done';
  p.rating = rating;
  p.payout = payout;
  s.stats.projectsCompleted++;
  s.stats.bestRating = Math.max(s.stats.bestRating, rating);
  s.reputation = clamp(s.reputation + (rating - 2.6) * (p.big ? 4 : 2.2) * (s.reputation > 60 ? 0.7 : 1));
  client.relationship = clamp(client.relationship + (rating - 3) * 8);
  client.projectsDone++;
  if (s.stage >= 2 && client.relationship >= 70 && client.projectsDone >= 2 && !client.retainer) {
    client.retainer = true;
    inbox(s, l(`${client.name.ar} تعرض عليك عقدًا متكررًا! ستصلك منها مشاريع منتظمة.`, `${client.name.en} offers you a retainer! Expect regular projects.`), 'good');
  }
  addXp(s, (p.budget / 8) * (0.5 + score) + 20, ev);

  // distribute money: work done by players is split between players, staff/contractor work goes to the company
  const playerShare: Record<string, number> = {};
  let companyPart = 0;
  for (const t of p.tasks) {
    const v = payout * t.valueWeight / wsum;
    if (t.result?.by.type === 'player') playerShare[t.result.by.id] = (playerShare[t.result.by.id] ?? 0) + v;
    else companyPart += v;
  }
  const playerTotal = Object.values(playerShare).reduce((a, b) => a + b, 0);
  let shares: Record<string, number> = playerShare;
  if (p.split && playerTotal > 0) shares = Object.fromEntries(Object.entries(p.split).filter(([id]) => s.players[id]).map(([id, f]) => [id, playerTotal * f]));
  let toWorld = companyPart;
  for (const [pid, amt] of Object.entries(shares)) {
    const pl = s.players[pid];
    if (!pl) { toWorld += amt; continue; }
    pl.earnings += Math.round(amt);
    pl.needs.passion = clamp(pl.needs.passion + 6);
    pl.needs.stress = clamp(pl.needs.stress - 6);
    if (pid === s.ownerId) toWorld += amt;
    else ev.push({ kind: 'payout', playerId: pid, amount: Math.round(amt), key: `${s.id}:${p.id}:${pid}` });
  }
  earn(s, toWorld, 'project', l(`دفعة ${p.title.ar}`, `Payment: ${p.title.en}`));
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const msg = l(`${client.name.ar} استلمت المشروع ${stars} — الدفعة ${payout} ر.س`, `${client.name.en} accepted the project ${stars} — paid SAR ${payout}`);
  log(p, s, msg); inbox(s, msg, 'good'); toast(ev, msg, 'good', 'cash');
  for (const e of s.employees) if (p.tasks.some((t) => t.result?.by.type === 'employee' && t.result.by.id === e.id)) e.satisfaction = clamp(e.satisfaction + rating - 2);
}

function checkPlacement(s: GameState, itemId: string, x: number, z: number, rot: number, ignoreUid: string | null) {
  const it = getItem(itemId);
  const [fw, fd] = it.footprint ?? [1, 1];
  const [w, d] = rot % 2 === 0 ? [fw, fd] : [fd, fw];
  const size = roomSize(s);
  if (x < 0 || z < 0 || x + w > size.w || z + d > size.d) fail('خارج حدود الغرفة', 'Outside the room');
  const occ = occupiedTiles(s, ignoreUid);
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (occ.has(`${x + i},${z + j}`)) fail('المكان مشغول بعنصر آخر', 'That spot is occupied');
}

/** Tiles occupied by fixed furniture and placed decor (rugs do not block). */
export function occupiedTiles(s: GameState, ignoreUid: string | null = null) {
  const occ = new Set<string>();
  for (const f of fixedFurniture(s)) for (let i = 0; i < f.w; i++) for (let j = 0; j < f.d; j++) occ.add(`${f.x + i},${f.z + j}`);
  for (const p of s.room.placed) {
    if (p.uid === ignoreUid) continue;
    const it = CATALOG_BY_ID[p.itemId];
    if (!it || it.model === 'rug') continue;
    const [fw, fd] = it.footprint ?? [1, 1];
    const [w, d] = p.rot % 2 === 0 ? [fw, fd] : [fd, fw];
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) occ.add(`${p.x + i},${p.z + j}`);
  }
  return occ;
}

export interface FixedFurniture { id: string; kind: 'desk' | 'bed' | 'kitchen' | 'sofa' | 'door' | 'staffDesk' | 'meeting' | 'coffeeBar'; x: number; z: number; w: number; d: number; index?: number }

/** Layout of fixed furniture for the current location. Shared by engine (collision) and renderer. */
export function fixedFurniture(s: Pick<GameState, 'location' | 'officeTier' | 'room'>): FixedFurniture[] {
  if (s.location === 'home') {
    const size = HOME_SIZES[s.room.sizeTier];
    return [
      { id: 'desk', kind: 'desk', x: 1, z: 0, w: 2, d: 1 },
      { id: 'bed', kind: 'bed', x: size.w - 2, z: 0, w: 2, d: 3 },
      { id: 'kitchen', kind: 'kitchen', x: 0, z: size.d - 2, w: 1, d: 2 },
      { id: 'sofa', kind: 'sofa', x: Math.floor(size.w / 2) - 1, z: size.d - 1, w: 2, d: 1 },
      { id: 'door', kind: 'door', x: 0, z: 2, w: 1, d: 1 },
    ];
  }
  const o = OFFICE_TIERS[s.officeTier];
  const list: FixedFurniture[] = [
    { id: 'desk', kind: 'desk', x: 1, z: 0, w: 2, d: 1 },
    { id: 'kitchen', kind: 'coffeeBar', x: 0, z: o.d - 2, w: 1, d: 2 },
    { id: 'sofa', kind: 'sofa', x: 3, z: o.d - 1, w: 2, d: 1 },
    { id: 'door', kind: 'door', x: 0, z: 2, w: 1, d: 1 },
    { id: 'meeting', kind: 'meeting', x: o.w - 4, z: 0, w: 3, d: 2 },
  ];
  const staffDesks = o.desks - 1;
  const cols = Math.max(2, Math.floor((o.w - 2) / 3));
  for (let i = 0; i < staffDesks; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    list.push({ id: `sd${i}`, kind: 'staffDesk', x: 1 + col * 3, z: 3 + row * 2, w: 2, d: 1, index: i });
  }
  return list;
}

function startActivity(s: GameState, me: PlayerProfile, kind: ActivityKind, ev: GameEvent[]) {
  const eq = equipmentStats(s);
  const T = s.time;
  switch (kind) {
    case 'work':
      if (me.burnout) fail('أنت مُنهك. خذ استراحة أو إجازة قبل العودة للعمل.', 'You are burned out. Rest before working again.');
      me.activity = { kind, startedAt: T, until: T + 100000 };
      return;
    case 'sleep':
      if (me.needs.energy > 85) fail('لست متعبًا بما يكفي للنوم', 'You are not tired enough to sleep');
      me.activity = { kind, startedAt: T, until: T + 8 * 60 };
      toast(ev, l('تصبح على خير… يمر الوقت أسرع أثناء النوم', 'Good night… time passes faster while sleeping'), 'info');
      return;
    case 'rest': me.activity = { kind, startedAt: T, until: T + 30 }; return;
    case 'eat':
      spend(s, 25, 'food', l('وجبة من المطبخ', 'Home meal'));
      me.activity = { kind, startedAt: T, until: T + 20 }; return;
    case 'orderFood':
      spend(s, 55, 'food', l('طلب توصيل', 'Food delivery'));
      me.activity = { kind, startedAt: T, until: T + 40 };
      toast(ev, l('تم الطلب! سيصل الطعام خلال 40 دقيقة', 'Ordered! Food arrives in 40 minutes'), 'info', 'notify');
      return;
    case 'coffee':
      if (!eq.coffee) spend(s, 6, 'food', l('قهوة', 'Coffee'));
      me.activity = { kind, startedAt: T, until: T + 10 }; return;
    case 'phone': me.activity = { kind, startedAt: T, until: T + 30 }; return;
    case 'vacation': {
      const cost = 1200 + s.stage * 600;
      spend(s, cost, 'vacation', l('إجازة قصيرة', 'Short vacation'));
      me.activity = { kind, startedAt: T, until: T + 2 * MIN_PER_DAY };
      toast(ev, l('إجازة لمدة يومين — المواعيد مستمرة!', 'Two-day vacation — deadlines keep running!'), 'info');
      return;
    }
  }
  fail('نشاط غير معروف', 'Unknown activity');
}

// ---------------------------------------------------------------- time simulation

function updateNeeds(s: GameState, p: PlayerProfile, m: number, ev: GameEvent[]) {
  const eq = equipmentStats(s);
  const n = p.needs;
  const act = p.activity?.kind ?? null;
  const urgent = activeProjects(s).some((x) => x.deadline - s.time < 12 * 60 && x.status === 'active');
  const d = { energy: -0.05, focus: 0.12, comfort: 0.1, passion: 0, stress: -0.02, hunger: 0.07 };
  switch (act) {
    case 'work': Object.assign(d, { energy: -0.09, focus: -0.15 * eq.focusDecay, comfort: -0.12 * eq.comfortDecay, passion: -0.012, stress: 0.03 + (urgent ? 0.04 : 0), hunger: 0.08 }); break;
    case 'sleep': Object.assign(d, { energy: 0.22, focus: 0.2, comfort: 0.1, passion: 0.01, stress: -0.08, hunger: 0.03 }); break;
    case 'rest': Object.assign(d, { energy: 0.06, focus: 0.35, comfort: 0.7, passion: 0.03, stress: -0.25 }); break;
    case 'eat': Object.assign(d, { energy: 0.1, hunger: -3.5, passion: 0.05, comfort: 0.2 }); break;
    case 'orderFood': Object.assign(d, { energy: 0.05, hunger: -1.9, passion: 0.12, comfort: 0.2 }); break;
    case 'coffee': Object.assign(d, { energy: 0.5, focus: eq.coffee ? 2.8 : 2, stress: 0.15 }); break;
    case 'phone': Object.assign(d, { passion: 0.15, stress: -0.15, focus: 0.15 }); break;
    case 'vacation': Object.assign(d, { energy: 0.12, focus: 0.2, comfort: 0.2, passion: 0.05, stress: -0.12, hunger: 0 }); break;
  }
  if (n.hunger > 75 && act !== 'eat' && act !== 'orderFood') { d.focus -= 0.1; d.energy -= 0.04; d.stress += 0.02; }
  d.passion += eq.passion / 60;
  d.stress -= eq.stressRelief / 60;
  if (act !== 'work' && act !== 'sleep' && n.focus > 80) d.focus = Math.min(d.focus, 0);
  n.energy = clamp(n.energy + d.energy * m);
  n.focus = clamp(n.focus + d.focus * m);
  n.comfort = clamp(n.comfort + d.comfort * m);
  n.passion = clamp(n.passion + d.passion * m);
  n.stress = clamp(n.stress + d.stress * m);
  n.hunger = clamp(n.hunger + d.hunger * m);
  if (p.activity && s.time >= p.activity.until) {
    if (p.activity.kind === 'sleep') toast(ev, l('صباح الخير! استعدت طاقتك', 'Good morning! Energy restored'), 'good');
    if (p.activity.kind === 'vacation') toast(ev, l('عدت من الإجازة بشغف متجدد', 'Back from vacation, recharged'), 'good');
    p.activity = null;
  }
  if (n.energy <= 3 && act !== 'sleep' && act !== 'vacation') {
    p.activity = { kind: 'sleep', startedAt: s.time, until: s.time + 9 * 60 };
    toast(ev, l(`${p.name} انهار من التعب ونام!`, `${p.name} collapsed from exhaustion and fell asleep!`), 'bad');
  }
  if (!p.burnout && (n.stress >= 95 || (n.passion <= 5 && n.stress >= 75))) {
    p.burnout = true;
    if (act === 'work') p.activity = null;
    toast(ev, l(`${p.name} وصل للاحتراق الوظيفي! يحتاج راحة حقيقية.`, `${p.name} burned out! Real rest is needed.`), 'bad', 'error');
  } else if (p.burnout && n.stress <= 40 && n.passion >= 30) {
    p.burnout = false;
    toast(ev, l(`${p.name} تعافى من الإرهاق`, `${p.name} recovered from burnout`), 'good');
  }
}

function stepTime(s: GameState, m: number, ev: GameEvent[]) {
  const beforeDay = dayOf(s.time);
  s.time += m;
  for (const p of Object.values(s.players)) updateNeeds(s, p, m, ev);

  // staff and contractors work
  const working = workingHours(s.time);
  for (const e of s.employees) {
    if (e.role !== 'creative') continue;
    if (!working) { e.energy = clamp(e.energy + 0.2 * m); continue; }
    if (e.trainingUntil > s.time) continue;
    if (!e.taskId) { e.energy = clamp(e.energy + 0.05 * m); continue; }
    const r = findTaskOpt(s, e.taskId);
    if (!r || r.p.status !== 'active' || r.t.status === 'done') { e.taskId = null; continue; }
    const rate = (e.speed * (0.5 + e.energy / 200)) / r.t.workMinutes;
    r.t.progress = Math.min(1, r.t.progress + rate * m);
    e.energy = clamp(e.energy - (0.06 / e.stressTolerance) * m);
    if (r.t.progress >= 1) finishByWorker(s, r.p, r.t, { type: 'employee', id: e.id }, e.quality * (0.8 + e.energy / 500) + e.level * 0.015, ev, e);
  }
  for (const c of s.contractors) {
    if (!c.taskId) continue;
    const r = findTaskOpt(s, c.taskId);
    if (!r || r.p.status !== 'active' || r.t.status === 'done') { c.taskId = null; continue; }
    r.t.progress = Math.min(1, r.t.progress + (c.speed / r.t.workMinutes) * m);
    if (r.t.progress >= 1) { finishByWorker(s, r.p, r.t, { type: 'contractor', id: c.id }, c.quality, ev); c.taskId = null; }
  }

  // projects
  for (const p of s.projects) {
    if (p.status === 'exporting' && s.time >= (p.exportEndsAt ?? 0)) evaluateDelivery(s, p, ev);
    else if (p.status === 'offer' && s.time >= p.offerExpiresAt) p.status = 'expired';
    else if (p.status === 'active' && s.time > p.deadline + 2 * MIN_PER_DAY) {
      p.status = 'failed';
      p.pipeline = 'done';
      for (const t of p.tasks) releaseAssignee(s, t);
      s.stats.projectsFailed++;
      s.reputation = clamp(s.reputation - 8);
      const c = s.clients.find((x) => x.id === p.clientId)!;
      c.relationship = clamp(c.relationship - 20);
      const msg = l(`ألغى العميل مشروع «${p.title.ar}» بسبب التأخير الكبير`, `The client cancelled "${p.title.en}" due to a long delay`);
      inbox(s, msg, 'bad'); toast(ev, msg, 'bad', 'error');
    }
  }
  // prune old finished projects
  const finished = s.projects.filter((p) => ['completed', 'declined', 'expired', 'failed'].includes(p.status));
  if (finished.length > 25) {
    const drop = new Set(finished.slice(0, finished.length - 25).map((p) => p.id));
    s.projects = s.projects.filter((p) => !drop.has(p.id));
  }

  // management automation (agency+)
  runManagement(s, ev);

  // new offers
  if (s.time >= s.nextOfferAt) {
    const offers = s.projects.filter((p) => p.status === 'offer').length;
    if (offers < 3 + s.stage) {
      const rng = stateRng(s);
      const retainers = s.clients.filter((c) => c.retainer);
      const recurring = retainers.length > 0 && rng.chance(0.3);
      const big = s.stage >= 5 && rng.chance(0.3);
      const offer = generateOffer(s, rng, recurring ? { clientId: rng.pick(retainers).id, recurring: true } : { big });
      s.projects.push(offer);
      const c = s.clients.find((x) => x.id === offer.clientId)!;
      ev.push({ kind: 'toast', tone: 'offer', sound: 'notify', text: l(`طلب جديد من ${c.name.ar}: ${offer.title.ar} — ${offer.budget} ر.س`, `New request from ${c.name.en}: ${offer.title.en} — SAR ${offer.budget}`) });
    }
    const rng = stateRng(s);
    const interval = (5 - s.reputation / 30 - s.stage * 0.4) * 60;
    s.nextOfferAt = s.time + Math.max(70, Math.round(interval * rng.range(0.7, 1.3)));
  }

  // learning
  if (s.learning && s.time >= s.learning.until) {
    const sp = s.learning.specialty;
    if (!s.specialties.includes(sp)) s.specialties.push(sp);
    s.learning = null;
    const msg = l(`أكملت دورة ${SPECIALTY_DEFS[sp].name.ar}! ستصلك مشاريع في هذا التخصص.`, `You completed the ${SPECIALTY_DEFS[sp].name.en} course! New projects will come in.`);
    inbox(s, msg, 'good'); toast(ev, msg, 'good', 'level');
  }

  const day = dayOf(s.time);
  if (day !== beforeDay && day > s.lastDailyAt) { s.lastDailyAt = day; dailyUpdate(s, ev); }
  const week = Math.floor((day - 1) / DAYS_PER_WEEK);
  if (week > s.lastWeeklyAt) { s.lastWeeklyAt = week; weeklyUpdate(s, ev); }
}

function finishByWorker(s: GameState, p: Project, t: Task, by: Assignee, quality: number, ev: GameEvent[], e?: Employee) {
  const rng = makeRng(hashString(t.id + ':' + s.time + ':' + p.revisionsUsed));
  const prev = t.result?.results ?? [];
  const results = t.requirements.map((r) => {
    const was = prev.find((x) => x.id === r.id);
    const ok = was?.ok ? true : rng.chance(Math.min(0.98, quality + 0.05));
    return { id: r.id, ok };
  });
  const tw = t.requirements.reduce((a, r) => a + r.weight, 0);
  const correctness = t.requirements.reduce((a, r, i) => a + (results[i].ok ? r.weight : 0), 0) / tw;
  t.status = 'done';
  t.progress = 1;
  t.result = { score: correctness * (0.9 + 0.1 * quality), correctness, results, by, at: s.time };
  if (e) {
    e.taskId = null;
    e.tasksDone++;
    e.xp += 20 + t.tier * 10;
    if (e.xp >= 100 * e.level) { e.xp -= 100 * e.level; e.level++; e.quality = clamp(e.quality + 0.03, 0, 0.98); e.speed = clamp(e.speed + 0.04, 0, 1.9); }
  }
  log(p, s, l(`اكتملت «${t.title.ar}» (${Math.round(correctness * 100)}%)`, `"${t.title.en}" completed (${Math.round(correctness * 100)}%)`));
  onTaskDone(s, p, ev);
}

function runManagement(s: GameState, ev: GameEvent[]) {
  const coord = s.employees.find((e) => e.role === 'coordinator');
  const pm = s.employees.find((e) => e.role === 'pm');
  const working = workingHours(s.time);
  if (coord && working) {
    const specs = availableSpecialties(s);
    for (const p of s.projects) {
      if (p.status !== 'offer' || p.pipeline !== 'intake') continue;
      p.pipeline = 'planning';
      if (s.policies.autoScreen && !p.specialties.every((x) => specs.includes(x) && s.employees.some((e) => e.role === 'creative' && e.specialty === x))) {
        p.status = 'declined';
        log(p, s, l('اعتذر المنسق عن المشروع لعدم توفر القسم المناسب', 'The coordinator declined: no matching department'));
        continue;
      }
      if (s.policies.autoAccept) {
        try { acceptProject(s, p, ev); log(p, s, l('قبل المنسق المشروع وأحاله لمدير المشاريع', 'The coordinator accepted and forwarded to the PM')); } catch { p.pipeline = 'intake'; }
      }
    }
  }
  if (pm && working) {
    for (const p of s.projects) {
      if (p.status !== 'active') continue;
      if (s.policies.autoAssign) {
        for (const t of p.tasks) {
          if (t.status === 'done' || t.assignee) continue;
          const cands = s.employees.filter((e) => e.role === 'creative' && e.specialty === t.specialty && !e.taskId && e.trainingUntil <= s.time).sort((a, b) => b.quality * b.speed - a.quality * a.speed);
          if (cands.length) {
            assignTask(s, p, t, { type: 'employee', id: cands[0].id });
            log(p, s, l(`مدير المشاريع أسند «${t.title.ar}» إلى ${personName(cands[0].name, 'ar')}`, `The PM assigned "${t.title.en}" to ${personName(cands[0].name, 'en')}`));
          }
        }
      }
      if (s.policies.autoReview && p.tasks.every((t) => t.status === 'done')) {
        if (!p.reviewed) { p.reviewed = true; log(p, s, l('راجع مدير المشاريع العمل', 'The PM reviewed the work')); }
        deliverProject(s, p, ev);
      }
    }
  }
}

function dailyUpdate(s: GameState, ev: GameEvent[]) {
  const rng = stateRng(s);
  s.candidates = s.candidates.filter((c) => c.expiresAt > s.time);
  if (s.stage >= 3 && s.candidates.length < 3) refreshCandidates(s, 'creative');
  if (s.stage >= 4 && !s.candidates.some((c) => c.role !== 'creative') && rng.chance(0.5)) refreshCandidates(s, rng.chance(0.5) ? 'coordinator' : 'pm');
  if (s.stage >= 2 && rng.chance(0.3)) refreshContractors(s);
  const active = activeProjects(s).length;
  for (const e of s.employees) {
    const fairPay = 900 + e.level * 250 + e.quality * 600;
    const payRatio = e.salary / fairPay;
    const overload = e.role === 'creative' ? (e.energy < 30 ? -6 : 0) : (active > s.employees.length ? -3 : 0);
    const delta = (payRatio - 1) * 10 + overload + (s.money < 0 ? -10 : 0) + (equipmentStats(s).stressRelief > 1 ? 1 : 0) + (rng.next() - 0.5) * 4;
    e.satisfaction = clamp(e.satisfaction + delta);
    e.lowSatisfactionDays = e.satisfaction < 25 ? e.lowSatisfactionDays + 1 : 0;
    if (!e.raiseRequest && (s.time - e.hiredAt) > 6 * MIN_PER_DAY && (payRatio < 0.95 || rng.chance(0.06))) {
      e.raiseRequest = Math.round(Math.max(e.salary * 1.12, fairPay) / 10) * 10;
      inbox(s, l(`${personName(e.name, 'ar')} يطلب زيادة راتب إلى ${e.raiseRequest} ر.س أسبوعيًا`, `${personName(e.name, 'en')} asks for a raise to SAR ${e.raiseRequest}/week`), 'info');
    }
  }
  const quitting = s.employees.filter((e) => e.lowSatisfactionDays >= 3);
  for (const e of quitting) {
    if (e.taskId) { const r = findTaskOpt(s, e.taskId); if (r) { r.t.assignee = null; r.t.status = 'todo'; } }
    s.employees = s.employees.filter((x) => x.id !== e.id);
    if (e.role === 'coordinator') { s.policies.autoScreen = false; s.policies.autoAccept = false; }
    if (e.role === 'pm') { s.policies.autoAssign = false; s.policies.autoReview = false; }
    const msg = l(`استقال ${personName(e.name, 'ar')} بسبب عدم الرضا`, `${personName(e.name, 'en')} resigned due to low satisfaction`);
    inbox(s, msg, 'bad'); toast(ev, msg, 'bad', 'error');
  }
}

function weeklyUpdate(s: GameState, ev: GameEvent[]) {
  const salaries = s.employees.reduce((a, e) => a + e.salary, 0);
  if (salaries > 0) charge(s, salaries, 'salaries', l('رواتب الموظفين', 'Staff salaries'));
  const rent = OFFICE_TIERS[s.officeTier].weeklyRent;
  if (rent > 0) charge(s, rent, 'rent', l(`إيجار ${OFFICE_TIERS[s.officeTier].name.ar}`, `Rent: ${OFFICE_TIERS[s.officeTier].name.en}`));
  const ops = s.location === 'home' ? 100 : 250 + s.employees.length * 60;
  charge(s, ops, 'utilities', l('إنترنت وكهرباء واشتراكات', 'Internet, power & subscriptions'));
  const msg = l(`المصاريف الأسبوعية: ${salaries + rent + ops} ر.س`, `Weekly costs: SAR ${salaries + rent + ops}`);
  inbox(s, msg, s.money < 0 ? 'bad' : 'info');
  if (s.money < 0) toast(ev, l('رصيدك بالسالب! الموظفون غير راضين', 'Your balance is negative! Staff are unhappy'), 'bad', 'error');
}

function refreshCandidates(s: GameState, role: StaffRole, specialty?: SpecialtyId) {
  const rng = stateRng(s);
  const n = role === 'creative' ? 3 : 2;
  const specs = s.stage >= 4 ? (s.departments.length ? s.departments : s.specialties) : SPECIALTIES;
  for (let i = 0; i < n; i++) s.candidates.push(generateCandidate(s, rng, role, specialty ?? rng.pick(specs)));
  if (s.candidates.length > 9) s.candidates = s.candidates.slice(-9);
}

function refreshContractors(s: GameState) {
  const rng = stateRng(s);
  const busy = s.contractors.filter((c) => c.taskId);
  const fresh = SPECIALTIES.map((sp) => generateContractor(s, rng, sp));
  s.contractors = [...busy, ...fresh].slice(0, 8);
}

export function warpMinutes(s: GameState, presentIds: string[]) {
  const ps = presentIds.map((id) => s.players[id]).filter(Boolean);
  if (ps.length && ps.every((p) => p.activity && (p.activity.kind === 'sleep' || p.activity.kind === 'vacation'))) return 30;
  return 0;
}
