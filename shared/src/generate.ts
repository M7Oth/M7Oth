import type { Appearance, Candidate, ClientCompany, Contractor, GameState, Project, SpecialtyId, StaffRole, Task } from './types';
import { makeRng, type Rng } from './rng';
import { CLIENT_NAMES, HAIR_COLORS, PANTS_COLORS, PERSON_NAMES, SHIRT_COLORS, SKIN_TONES } from './data/names';
import { SPECIALTY_DEFS } from './data/specialties';
import { WORK_MODULES } from './work';
import { l, MIN_PER_DAY, MIN_PER_HOUR, clamp } from './util';

export function nid(state: GameState, prefix: string) {
  state.idCounter += 1;
  return `${prefix}${state.idCounter.toString(36)}`;
}

export function pickName(rng: Rng) { const n = rng.pick(PERSON_NAMES); return `${n.ar}|${n.en}`; }
export function personName(name: string, lang: 'ar' | 'en') { const [ar, en] = name.split('|'); return (lang === 'ar' ? ar : en) || ar || name; }

export function randomAppearance(rng: Rng): Appearance {
  return {
    skin: rng.pick(SKIN_TONES), hair: rng.pick(HAIR_COLORS), hairStyle: rng.int(0, 3),
    shirt: rng.pick(SHIRT_COLORS), pants: rng.pick(PANTS_COLORS), accessory: rng.int(0, 3),
  };
}

export function makeClients(seed: number): ClientCompany[] {
  const rng = makeRng(seed ^ 0xc11e);
  return CLIENT_NAMES.map((c, i) => ({
    id: `cl${i + 1}`, name: c.name, industry: c.industry, relationship: 40 + rng.int(0, 15),
    pickiness: rng.range(0.15, 0.6), projectsDone: 0, retainer: false,
  }));
}

/** Specialties the business can currently take work for. */
export function availableSpecialties(state: GameState): SpecialtyId[] {
  const set = new Set<SpecialtyId>(state.specialties);
  for (const e of state.employees) if (e.role === 'creative') set.add(e.specialty);
  return [...set];
}

export function tierFor(state: GameState, sp: SpecialtyId, rng: Rng) {
  const skill = state.skills[sp]?.level ?? 1;
  const base = 1 + Math.floor((skill - 1) / 2) + Math.floor((state.stage - 1) / 2);
  const t = base + (rng.chance(0.25) ? 1 : 0) - (rng.chance(0.2) ? 1 : 0);
  return Math.max(1, Math.min(5, t));
}

const TIER_BUDGET: [number, number][] = [[0, 0], [350, 600], [700, 1100], [1200, 2000], [2200, 3500], [4000, 6000]];
const TIER_RAM = [8, 8, 8, 16, 32, 64];

export function generateOffer(state: GameState, rng: Rng, opts: { clientId?: string; recurring?: boolean; big?: boolean; forceSpecialty?: SpecialtyId } = {}): Project {
  const specs = availableSpecialties(state);
  const primary = opts.forceSpecialty ?? (rng.chance(0.55) ? state.primarySpecialty : rng.pick(specs));
  const sp: SpecialtyId = specs.includes(primary) ? primary : specs[0];
  const tier = tierFor(state, sp, rng);
  const client = opts.clientId ? state.clients.find((c) => c.id === opts.clientId)! : rng.pick(state.clients);
  const big = !!opts.big;

  let taskCount = 1;
  const coop = Object.keys(state.players ?? {}).length > 1;
  if (state.stage === 1) taskCount = rng.chance(coop ? 0.65 : 0.35) ? 2 : 1;
  else if (state.stage === 2 && coop) taskCount = rng.int(2, 3);
  else if (state.stage === 2 && !coop) taskCount = rng.int(1, 3);
  else taskCount = rng.int(2, 4);
  if (big) taskCount = rng.int(4, 6);

  const specsForTasks: SpecialtyId[] = [];
  for (let i = 0; i < taskCount; i++) {
    if (i > 0 && specs.length > 1 && state.stage >= 3 && rng.chance(0.55)) specsForTasks.push(rng.pick(specs));
    else specsForTasks.push(sp);
  }

  const projectId = nid(state, 'p');
  const tasks: Task[] = specsForTasks.map((tsp, i) => {
    const tt = i === 0 ? tier : Math.max(1, Math.min(5, tier + rng.int(-1, 0)));
    const g = WORK_MODULES[tsp].generate(makeRng(rng.int(1, 2 ** 31)), { brand: client.name, tier: tt, index: i });
    const reqs = g.requirements.map((r, k) => ({ ...r, id: `r${k + 1}` }));
    return {
      id: nid(state, 't'), projectId, specialty: tsp, title: g.title, requirements: reqs, doc: g.doc,
      assignee: null, status: 'todo', progress: 0,
      workMinutes: Math.round((tt * 80 + reqs.length * 25) * (0.85 + rng.next() * 0.3)),
      valueWeight: 1 + tt * 0.25, tier: tt,
    } as Task;
  });

  const [lo, hi] = TIER_BUDGET[tier];
  const repFactor = 0.8 + state.reputation / 250;
  const relFactor = 0.9 + client.relationship / 500;
  let budget = tasks.reduce((s, t) => s + rng.range(lo, hi) * (0.7 + 0.3 * t.tier / tier), 0) * repFactor * relFactor;
  if (opts.recurring) budget *= 1.15;
  if (big) budget *= 1.8;
  budget = Math.round(budget / 50) * 50;

  const durationDays = Math.max(1, Math.ceil(taskCount * 0.6 + tier * 0.35 + (big ? 2 : 0)));
  const categories = [...new Set(specsForTasks)].map((s) => SPECIALTY_DEFS[s].short);
  const titleTask = tasks[0].title;
  const title = taskCount > 1 ? l(`${titleTask.ar} + ${taskCount - 1} مهام`, `${titleTask.en} + ${taskCount - 1} more`) : titleTask;
  const brief = l(
    `${client.name.ar} (${client.industry.ar}) تحتاج ${taskCount > 1 ? `${taskCount} مهام` : 'مهمة'} في ${categories.map((c) => c.ar).join(' و')}. المستوى ${tier}/5.`,
    `${client.name.en} (${client.industry.en}) needs ${taskCount > 1 ? `${taskCount} tasks` : 'one task'} in ${categories.map((c) => c.en).join(' & ')}. Level ${tier}/5.`,
  );
  return {
    id: projectId, clientId: client.id, title, brief, category: categories[0], specialties: [...new Set(specsForTasks)],
    budget, durationDays, deadline: 0, offerExpiresAt: state.time + rng.int(8, 20) * MIN_PER_HOUR,
    difficulty: tier, revisionsAllowed: tier >= 3 ? 2 : 1, revisionsUsed: 0,
    minRam: TIER_RAM[tier], status: 'offer', tasks, createdAt: state.time, negotiated: false,
    recurring: !!opts.recurring, big, split: null, pipeline: 'intake', reviewed: false, log: [],
  };
}

export function generateCandidate(state: GameState, rng: Rng, role: StaffRole, specialty?: SpecialtyId): Candidate {
  const sp = specialty ?? rng.pick(state.departments.length ? state.departments : (['video', 'motion', 'graphic', 'model3d'] as SpecialtyId[]));
  const level = clamp(rng.int(1, 3) + Math.floor(state.stage / 2), 1, 8);
  const quality = clamp(0.45 + level * 0.06 + rng.range(-0.08, 0.1), 0.4, 0.97);
  const speed = clamp(0.7 + rng.range(0, 0.6) + level * 0.04, 0.6, 1.8);
  const base = role === 'creative' ? 900 : role === 'coordinator' ? 1100 : 1500;
  const askSalary = Math.round((base + level * 220 + quality * 600 + speed * 200) * rng.range(0.9, 1.15) / 10) * 10;
  return {
    id: nid(state, 'cand'), name: pickName(rng), appearance: randomAppearance(rng),
    role, specialty: sp, level, speed, quality, stressTolerance: rng.range(0.35, 1), askSalary,
    expiresAt: state.time + 3 * MIN_PER_DAY,
  };
}

export function generateContractor(state: GameState, rng: Rng, specialty: SpecialtyId): Contractor {
  const quality = rng.range(0.55, 0.95);
  return {
    id: nid(state, 'fr'), name: pickName(rng), specialty, quality, speed: rng.range(0.8, 1.5),
    feeRate: Math.round((0.35 + quality * 0.35) * 100) / 100, rating: Math.round((3 + quality * 2) * 10) / 10, taskId: null,
  };
}
