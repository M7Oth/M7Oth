import { describe, expect, it } from 'vitest';
import { applyAction, createWorld, exportMinutes, equipmentStats, stageProgress, type Action, type Ctx, type GameState } from '../src';
import { solveTask } from './solvers';

const APP = { skin: '#f1c9a5', hair: '#1d1612', hairStyle: 0, shirt: '#2f6fdf', pants: '#2b3442', accessory: 0 };
const OWNER = 'u_owner';
const SYS: Ctx = { actorId: 'system', system: true };
const ME: Ctx = { actorId: OWNER };

function world(spec: any = 'video') {
  return createWorld({ id: 'w1', ownerId: OWNER, saveName: 'test', name: 'Mohammed', appearance: APP, specialty: spec, seed: 42 });
}
function act(s: GameState, a: Action, ctx: Ctx = ME) {
  const r = applyAction(s, a, ctx);
  if (r.error) throw new Error(r.error.en);
  return r;
}
function tick(s: GameState, minutes: number) {
  let st = s;
  while (minutes > 0) { const m = Math.min(600, minutes); st = act(st, { type: 'tick', minutes: m }, SYS).state; minutes -= m; }
  return st;
}
/** accept the first offer, solve every task as a player and deliver */
function playProject(s: GameState, who: Ctx = ME) {
  const offer = s.projects.find((p) => p.status === 'offer')!;
  s = act(s, { type: 'accept', projectId: offer.id }).state;
  let p = s.projects.find((x) => x.id === offer.id)!;
  for (const t of p.tasks) s = act(s, { type: 'submitTask', taskId: t.id, doc: solveTask(t) }, who).state;
  s = act(s, { type: 'deliver', projectId: offer.id }).state;
  for (let i = 0; i < 6; i++) {
    s = tick(s, exportMinutes(s, s.projects.find((x) => x.id === offer.id)!) + 1);
    p = s.projects.find((x) => x.id === offer.id)!;
    if (p.status !== 'active') break;
    for (const t of p.tasks) if (t.status !== 'done') s = act(s, { type: 'submitTask', taskId: t.id, doc: solveTask(t) }, who).state; // revision round
    s = act(s, { type: 'deliver', projectId: offer.id }).state;
  }
  return { s, p: s.projects.find((x) => x.id === offer.id)! };
}

describe('solo freelancer loop', () => {
  it('starts with an offer, money and needs', () => {
    const s = world();
    expect(s.money).toBe(1500);
    expect(s.projects.filter((p) => p.status === 'offer').length).toBe(1);
    expect(s.players[OWNER].needs.energy).toBeGreaterThan(80);
  });

  it('accept → work → deliver → paid exactly once', () => {
    let s = world();
    const before = s.money;
    const { s: s2, p } = playProject(s);
    expect(p.status).toBe('completed');
    expect(p.payout).toBeGreaterThan(0);
    expect(s2.money).toBe(before + p.payout!);
    expect(s2.xp).toBeGreaterThan(0);
    expect(s2.stats.projectsCompleted).toBe(1);
    // further ticks never pay again
    const s3 = tick(s2, 600);
    expect(s3.ledger.filter((l) => l.kind === 'project').length).toBe(1);
  });

  it('rejects a duplicate submission (no double reward)', () => {
    let s = world();
    const offer = s.projects[0];
    s = act(s, { type: 'accept', projectId: offer.id }).state;
    const t = s.projects[0].tasks[0];
    s = act(s, { type: 'submitTask', taskId: t.id, doc: solveTask(t) }).state;
    const again = applyAction(s, { type: 'submitTask', taskId: t.id, doc: solveTask(t) }, ME);
    expect(again.error).toBeTruthy();
    expect(again.state).toBe(s);
    s = act(s, { type: 'deliver', projectId: offer.id }).state;
    expect(applyAction(s, { type: 'deliver', projectId: offer.id }, ME).error).toBeTruthy();
  });

  it('a sloppy delivery triggers a revision with the failed requirements', () => {
    let s = world();
    const offer = s.projects[0];
    s = act(s, { type: 'accept', projectId: offer.id }).state;
    for (const t of s.projects[0].tasks) s = act(s, { type: 'submitTask', taskId: t.id, doc: t.doc }).state; // submit untouched work
    s = act(s, { type: 'deliver', projectId: offer.id }).state;
    s = tick(s, 400);
    const p = s.projects[0];
    expect(p.status).toBe('active');
    expect(p.revisionsUsed).toBe(1);
    expect(p.tasks.some((t) => t.status === 'todo')).toBe(true);
  });

  it('buying a CPU costs money and speeds up exporting', () => {
    let s = world();
    s = act(s, { type: 'devGrant', money: 5000 }, { actorId: OWNER, allowCheats: true }).state;
    const p = s.projects[0];
    const slow = exportMinutes(s, p);
    const money = s.money;
    s = act(s, { type: 'buy', itemId: 'cpu_2' }).state;
    expect(s.money).toBe(money - 1800);
    expect(s.equipment.cpu).toBe('cpu_2');
    expect(exportMinutes(s, p)).toBeLessThan(slow);
    expect(applyAction(s, { type: 'buy', itemId: 'cpu_2' }, ME).error).toBeTruthy(); // cannot buy twice
  });

  it('cannot buy without enough money', () => {
    const s = world();
    const r = applyAction(s, { type: 'buy', itemId: 'gpu_2' }, ME);
    expect(r.error?.en).toMatch(/money/);
    expect(r.state.money).toBe(1500);
  });

  it('working drains energy/focus; sleep restores and passes time', () => {
    let s = world();
    s = act(s, { type: 'activity', kind: 'work' }).state;
    s = tick(s, 6 * 60);
    const n = s.players[OWNER].needs;
    expect(n.energy).toBeLessThan(70);
    expect(n.focus).toBeLessThan(50);
    const t0 = s.time;
    s = act(s, { type: 'cancelActivity' }).state;
    s = tick(s, 4 * 60);
    s = act(s, { type: 'activity', kind: 'sleep' }).state;
    s = tick(s, 8 * 60);
    expect(s.players[OWNER].needs.energy).toBeGreaterThan(95);
    expect(s.time).toBe(t0 + 12 * 60);
    expect(s.players[OWNER].activity).toBeNull();
  });

  it('chair upgrade reduces comfort loss while working', () => {
    const run = (chair?: string) => {
      let s = world();
      s = act(s, { type: 'devGrant', money: 10000 }, { actorId: OWNER, allowCheats: true }).state;
      if (chair) s = act(s, { type: 'buy', itemId: chair }).state;
      s = act(s, { type: 'activity', kind: 'work' }).state;
      s = tick(s, 180);
      return s.players[OWNER].needs.comfort;
    };
    expect(run('chair_2')).toBeGreaterThan(run());
    expect(equipmentStats(world()).comfortDecay).toBe(1);
  });

  it('furniture placement blocks overlaps and out-of-room spots', () => {
    let s = world();
    s = act(s, { type: 'buy', itemId: 'd_bigplant' }).state;
    expect(applyAction(s, { type: 'place', itemId: 'd_bigplant', x: 1, z: 0, rot: 0 }, ME).error).toBeTruthy(); // the desk
    expect(applyAction(s, { type: 'place', itemId: 'd_bigplant', x: 9, z: 0, rot: 0 }, ME).error).toBeTruthy();
    s = act(s, { type: 'place', itemId: 'd_bigplant', x: 3, z: 3, rot: 0 }).state;
    expect(s.room.placed.some((p) => p.itemId === 'd_bigplant')).toBe(true);
    expect(s.room.storage).not.toContain('d_bigplant');
  });

  it('missed deadlines fail the project and cost reputation', () => {
    let s = world();
    s = act(s, { type: 'accept', projectId: s.projects[0].id }).state;
    const rep = s.reputation;
    s = tick(s, (s.projects[0].durationDays + 3) * 1440);
    expect(s.projects.find((p) => p.id === s.projects[0].id)!.status).toBe('failed');
    expect(s.reputation).toBeLessThan(rep);
  });

  it('weekly costs are charged', () => {
    let s = world();
    const m = s.money;
    s = tick(s, 7 * 1440 + 60);
    expect(s.money).toBeLessThan(m);
    expect(s.ledger.some((x) => x.kind === 'utilities')).toBe(true);
  });
});

describe('co-op', () => {
  it('two players split tasks and profit; guest payout is emitted once', () => {
    let s = world();
    s = act(s, { type: 'addPlayer', id: 'u_friend', name: 'Friend', appearance: APP }, SYS).state;
    expect(s.players.u_friend.role).toBe('assistant');
    // find/generate a 2-task offer
    let offer = s.projects.find((p) => p.status === 'offer' && p.tasks.length >= 2);
    let guard = 0;
    while (!offer && guard++ < 200) { s = tick(s, 120); offer = s.projects.find((p) => p.status === 'offer' && p.tasks.length >= 2); }
    expect(offer).toBeTruthy();
    s = act(s, { type: 'accept', projectId: offer!.id }).state;
    const [t1, t2] = s.projects.find((p) => p.id === offer!.id)!.tasks;
    // assistant may not buy things
    expect(applyAction(s, { type: 'buy', itemId: 'd_plant' }, { actorId: 'u_friend' }).error).toBeTruthy();
    s = act(s, { type: 'assign', taskId: t1.id, assignee: { type: 'player', id: OWNER } }).state;
    s = act(s, { type: 'assign', taskId: t2.id, assignee: { type: 'player', id: 'u_friend' } }, { actorId: 'u_friend' }).state;
    // the owner cannot submit the friend's task
    expect(applyAction(s, { type: 'submitTask', taskId: t2.id, doc: solveTask(t2) }, ME).error).toBeTruthy();
    s = act(s, { type: 'submitTask', taskId: t1.id, doc: solveTask(t1) }).state;
    s = act(s, { type: 'submitTask', taskId: t2.id, doc: solveTask(t2) }, { actorId: 'u_friend' }).state;
    s = act(s, { type: 'setSplit', projectId: offer!.id, split: { [OWNER]: 50, u_friend: 50 } }).state;
    const money = s.money;
    s = act(s, { type: 'deliver', projectId: offer!.id }).state;
    let payouts: any[] = [];
    for (let i = 0; i < 5; i++) {
      const r = act(s, { type: 'tick', minutes: 200 }, SYS); s = r.state;
      payouts.push(...r.events.filter((e) => e.kind === 'payout'));
      const p = s.projects.find((x) => x.id === offer!.id)!;
      if (p.status === 'active') {
        for (const t of p.tasks) if (t.status !== 'done') s = act(s, { type: 'submitTask', taskId: t.id, doc: solveTask(t) }, { actorId: (t.assignee as any).id }).state;
        s = act(s, { type: 'deliver', projectId: offer!.id }).state;
      }
    }
    const p = s.projects.find((x) => x.id === offer!.id)!;
    expect(p.status).toBe('completed');
    expect(payouts.length).toBe(1);
    expect(payouts[0].playerId).toBe('u_friend');
    expect(payouts[0].amount).toBe(Math.round(p.payout! / 2));
    expect(s.money - money).toBe(Math.round(p.payout! / 2));
  });
});

describe('career progression', () => {
  const cheat: Ctx = { actorId: OWNER, allowCheats: true };
  it('stage gates: cannot skip, advance with requirements, hire, delegate, manage', () => {
    let s = world();
    expect(applyAction(s, { type: 'advanceStage' }, ME).error).toBeTruthy();
    expect(applyAction(s, { type: 'hireContractor', taskId: 'x', contractorId: 'y' }, ME).error?.en).toMatch(/stage 2|not found/i);
    // reach stage 2
    s = act(s, { type: 'devGrant', xp: 2000, reputation: 30, completed: 5 }, cheat).state;
    expect(stageProgress(s)!.ready).toBe(true);
    s = act(s, { type: 'advanceStage' }).state;
    expect(s.stage).toBe(2);
    expect(s.contractors.length).toBeGreaterThan(0);
    // contractor on a task
    s = act(s, { type: 'devGrant', money: 20000 }, cheat).state;
    const offer = s.projects.find((p) => p.status === 'offer')!;
    s = act(s, { type: 'accept', projectId: offer.id }).state;
    const task = s.projects.find((p) => p.id === offer.id)!.tasks[0];
    const contractor = s.contractors.find((c) => c.specialty === task.specialty)!;
    const m0 = s.money;
    s = act(s, { type: 'hireContractor', taskId: task.id, contractorId: contractor.id }).state;
    expect(s.money).toBeLessThan(m0);
    s = tick(s, task.workMinutes * 2);
    expect(s.projects.find((p) => p.id === offer.id)!.tasks[0].status).toBe('done');

    // stage 3: studio + first employee
    s = act(s, { type: 'devGrant', xp: 8000, reputation: 20, completed: 10, money: 10000 }, cheat).state;
    s = act(s, { type: 'advanceStage' }).state;
    expect(s.stage).toBe(3);
    expect(s.location).toBe('office');
    expect(s.candidates.length).toBeGreaterThan(0);
    const cand = s.candidates[0];
    s = act(s, { type: 'hire', candidateId: cand.id }).state;
    expect(s.employees.length).toBe(1);
    // salary is charged weekly
    const before = s.ledger.filter((x) => x.kind === 'salaries').length;
    s = tick(s, 8 * 1440);
    expect(s.ledger.filter((x) => x.kind === 'salaries').length).toBeGreaterThan(before);
    // management roles locked until stage 4
    expect(applyAction(s, { type: 'recruit', role: 'pm' }, ME).error).toBeTruthy();

    // stage 4: agency with coordinator + PM automating the pipeline
    s = act(s, { type: 'devGrant', xp: 20000, reputation: 30, completed: 15, money: 60000 }, cheat).state;
    for (let i = 0; i < 2; i++) { s = act(s, { type: 'recruit', role: 'creative', specialty: 'video' }).state; s = act(s, { type: 'hire', candidateId: s.candidates[s.candidates.length - 1].id }).state; }
    expect(applyAction(s, { type: 'recruit', role: 'creative' }, ME).state.candidates.length).toBeGreaterThan(0);
    s = act(s, { type: 'advanceStage' }).state;
    expect(s.stage).toBe(4);
    s = act(s, { type: 'recruit', role: 'coordinator' }).state;
    s = act(s, { type: 'hire', candidateId: s.candidates.find((c) => c.role === 'coordinator')!.id }).state;
    s = act(s, { type: 'recruit', role: 'pm' }).state;
    s = act(s, { type: 'hire', candidateId: s.candidates.find((c) => c.role === 'pm')!.id }).state;
    s = act(s, { type: 'setPolicy', key: 'autoAccept', value: true }).state;
    expect(s.policies.autoAssign).toBe(true);
    const completedBefore = s.stats.projectsCompleted;
    for (const e of s.employees) e.satisfaction = 100;
    s = tick(s, 4 * 1440);
    const auto = s.projects.filter((p) => p.log.some((l) => /PM assigned/.test(l.text.en)));
    expect(auto.length).toBeGreaterThan(0);
    expect(s.stats.projectsCompleted).toBeGreaterThan(completedBefore);
    // stage 5 requires a company name
    s = act(s, { type: 'devGrant', xp: 60000, reputation: 40, completed: 20, money: 100000 }, cheat).state;
    for (let i = 0; i < 2; i++) { s = act(s, { type: 'recruit', role: 'creative', specialty: 'video' }).state; s = act(s, { type: 'hire', candidateId: s.candidates[s.candidates.length - 1].id }).state; }
    expect(s.employees.length).toBeGreaterThanOrEqual(6);
    {
      expect(applyAction(s, { type: 'advanceStage' }, ME).error).toBeTruthy();
      s = act(s, { type: 'advanceStage', companyName: 'استوديو الضوء' }).state;
      expect(s.stage).toBe(5);
      expect(s.companyName).toBe('استوديو الضوء');
    }
  });
});
