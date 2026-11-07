import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import WebSocket from 'ws';
import pg from 'pg';
import { startApp } from '../src/app';
import { FileStore, PgStore, type Store } from '../src/store';
import { exportMinutes, type GameState } from '@fls/shared';
import { solveTask } from '../../shared/test/solvers';

const DB = process.env.TEST_DATABASE_URL;
let app: Awaited<ReturnType<typeof startApp>>;
let base = '';
let storeFactory: () => Store;

async function resetDb() {
  if (!DB) return;
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  await c.query('drop table if exists bank_ledger, invites, world_members, worlds, sessions, users cascade');
  await c.end();
}

beforeAll(async () => {
  await resetDb();
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fls-')), 'db.json');
  storeFactory = () => (DB ? new PgStore(DB) : new FileStore(file));
  app = await startApp({ store: storeFactory(), port: 0, allowCheats: true, tickMs: 40, staticDir: '/nonexistent' });
  base = `http://localhost:${app.port}`;
});
afterAll(async () => { await app?.close(); });

async function api(pathname: string, method = 'GET', body?: any, token?: string) {
  const r = await fetch(base + pathname, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() as any };
}

class Client {
  ws!: WebSocket;
  state!: GameState;
  you = '';
  presence: any = {};
  bank = 0;
  acks = new Map<string, any>();
  events: any[] = [];
  seq = 0;
  constructor(public token: string, public name: string) {}
  connect(worldId: string) {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${this.token}`);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ t: 'join', worldId })));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        if (m.t === 'joined') { this.state = m.state; this.you = m.you; this.presence = m.presence; this.bank = m.bank; resolve(); }
        if (m.t === 'state') this.state = m.state;
        if (m.t === 'presence') this.presence = m.presence;
        if (m.t === 'ack') this.acks.set(m.id, m);
        if (m.t === 'bank') this.bank = m.balance;
        if (m.t === 'ev') this.events.push(...m.events);
        if (m.t === 'error') reject(new Error(m.message.en));
      });
      this.ws.on('error', reject);
    });
  }
  send(msg: any) { this.ws.send(JSON.stringify(msg)); }
  async act(action: any, id = `${this.name}-${++this.seq}`) {
    this.send({ t: 'act', id, action });
    return this.waitAck(id);
  }
  async waitAck(id: string) {
    await until(() => this.acks.has(id));
    return this.acks.get(id);
  }
  close() { this.ws.close(); }
}

async function until(fn: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 15)); }
}

describe('online co-op (real WebSocket server)', { timeout: 60000 }, () => {
  let hostTok = '', guestTok = '', worldId = '', guestId = '';

  it('registers two accounts and creates an online save', async () => {
    const a = await api('/api/register', 'POST', { username: 'host1', password: 'secret1', displayName: 'Host', appearance: { shirt: '#e25b45' } });
    const b = await api('/api/register', 'POST', { username: 'guest1', password: 'secret2', displayName: 'Guest' });
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    hostTok = a.data.token; guestTok = b.data.token; guestId = b.data.user.id;
    expect((await api('/api/register', 'POST', { username: 'host1', password: 'xxxxxx' })).status).toBe(409);
    expect((await api('/api/login', 'POST', { username: 'host1', password: 'bad' })).status).toBe(401);
    expect((await api('/api/login', 'POST', { username: 'host1', password: 'secret1' })).status).toBe(200);
    const w = await api('/api/worlds', 'POST', { saveName: 'غرفتي', specialty: 'video' }, hostTok);
    worldId = w.data.id;
    expect(worldId).toBeTruthy();
  });

  it('a non-member cannot join until invited', async () => {
    const g = new Client(guestTok, 'g0');
    await expect(g.connect(worldId)).rejects.toThrow(/not a member/);
    g.close();
    const inv = await api(`/api/worlds/${worldId}/invite`, 'POST', {}, hostTok);
    expect(inv.data.code).toMatch(/^[A-Z0-9]{6}$/);
    expect((await api(`/api/worlds/${worldId}/invite`, 'POST', {}, guestTok)).status).toBe(403);
    const j = await api(`/api/invites/${inv.data.code}/join`, 'POST', {}, guestTok);
    expect(j.data.worldId).toBe(worldId);
    const list = await api('/api/worlds', 'GET', undefined, guestTok);
    expect(list.data.worlds.some((x: any) => x.id === worldId && x.member)).toBe(true);
  });

  it('both players see each other, move in sync, and split a project with no duplicated work or money', async () => {
    const host = new Client(hostTok, 'h');
    const guest = new Client(guestTok, 'g');
    await host.connect(worldId);
    await guest.connect(worldId);
    await until(() => !!host.state.players[guestId]);
    expect(Object.keys(guest.state.players)).toHaveLength(2);
    expect(guest.state.players[guestId].role).toBe('assistant');

    // movement sync
    guest.send({ t: 'pos', x: 2, z: 4, tx: 5, tz: 1, anim: 'walk' });
    await until(() => host.presence[guestId]?.tx === 5);
    expect(host.presence[guestId].anim).toBe('walk');

    // guest (assistant) cannot buy with the host's money
    const deny = await guest.act({ type: 'buy', itemId: 'd_plant' });
    expect(deny.ok).toBe(false);

    // grant a multi-task offer
    await until(() => host.state.projects.some((p) => p.status === 'offer'));
    let offer = host.state.projects.find((p) => p.status === 'offer' && p.tasks.length >= 2);
    await host.act({ type: 'setSpeed', speed: 4 });
    const t0 = Date.now();
    while (!offer && Date.now() - t0 < 40000) {
      // make room in the inbox so new offers keep coming
      for (const p of host.state.projects.filter((x) => x.status === 'offer' && x.tasks.length < 2)) await host.act({ type: 'decline', projectId: p.id });
      await new Promise((r) => setTimeout(r, 100));
      offer = host.state.projects.find((p) => p.status === 'offer' && p.tasks.length >= 2);
    }
    expect(offer).toBeTruthy();
    await host.act({ type: 'setSpeed', speed: 1 });

    // both accept at the same moment → exactly one succeeds
    const [a1, a2] = await Promise.all([host.act({ type: 'accept', projectId: offer!.id }), host.act({ type: 'accept', projectId: offer!.id })]);
    expect([a1.ok, a2.ok].filter(Boolean)).toHaveLength(1);
    await until(() => guest.state.projects.find((p) => p.id === offer!.id)?.status === 'active');

    const [t1, t2] = guest.state.projects.find((p) => p.id === offer!.id)!.tasks;
    expect((await host.act({ type: 'assign', taskId: t1.id, assignee: { type: 'player', id: host.you } })).ok).toBe(true);
    expect((await guest.act({ type: 'assign', taskId: t2.id, assignee: { type: 'player', id: guestId } })).ok).toBe(true);
    await until(() => host.state.projects.find((p) => p.id === offer!.id)!.tasks[1].assignee?.id === guestId);

    // live progress is visible to the partner
    guest.send({ t: 'work', taskId: t2.id, pct: 40 });
    await until(() => host.presence[guestId]?.work?.pct === 40);

    // the same submission sent twice at once (e.g. double click / resend) is applied only once
    const doc2 = solveTask(t2);
    const id = 'g-submit-1';
    guest.send({ t: 'act', id, action: { type: 'submitTask', taskId: t2.id, doc: doc2 } });
    guest.send({ t: 'act', id, action: { type: 'submitTask', taskId: t2.id, doc: doc2 } });
    const s2 = await guest.act({ type: 'submitTask', taskId: t2.id, doc: doc2 }); // different id, same task
    expect((await guest.waitAck(id)).ok).toBe(true);
    expect(s2.ok).toBe(false);
    expect((await host.act({ type: 'submitTask', taskId: t1.id, doc: solveTask(t1) })).ok).toBe(true);
    for (const t of host.state.projects.find((p) => p.id === offer!.id)!.tasks.slice(2)) await host.act({ type: 'submitTask', taskId: t.id, doc: solveTask(t) });

    // explicit 50/50 agreement, deliver, and wait for client evaluation
    expect((await host.act({ type: 'setSplit', projectId: offer!.id, split: { [host.you]: 1, [guestId]: 1 } })).ok).toBe(true);
    const moneyBefore = host.state.money;
    expect((await host.act({ type: 'deliver', projectId: offer!.id })).ok).toBe(true);
    const settle = async () => {
      for (let round = 0; round < 4; round++) {
        await until(() => host.state.projects.find((p) => p.id === offer!.id)!.status !== 'exporting', 15000);
        const p = host.state.projects.find((x) => x.id === offer!.id)!;
        if (p.status === 'completed') return p;
        for (const t of p.tasks) if (t.status !== 'done') {
          const who = (t.assignee as any)?.id === guestId ? guest : host;
          await who.act({ type: 'submitTask', taskId: t.id, doc: solveTask(t) });
        }
        await host.act({ type: 'deliver', projectId: offer!.id });
      }
      return host.state.projects.find((x) => x.id === offer!.id)!;
    };
    const done = await settle();
    expect(done.status).toBe('completed');
    const half = Math.round(done.payout! / 2);
    expect(host.state.money - moneyBefore).toBeGreaterThanOrEqual(half - 200); // weekly costs may interleave
    await until(() => guest.bank === half);
    const me = await api('/api/me', 'GET', undefined, guestTok);
    expect(me.data.user.bank).toBe(half);
    expect(guest.state.players[guestId].earnings).toBe(half);
    host.close(); guest.close();
  });

  it('reconnect: pending action re-sent after a drop is not applied twice; state persists', async () => {
    const host = new Client(hostTok, 'h2');
    await host.connect(worldId);
    await host.act({ type: 'devGrant', money: 3000 });
    const money = host.state.money;
    const id = 'buy-once-1';
    host.send({ t: 'act', id, action: { type: 'buy', itemId: 'cpu_2' } });
    await host.waitAck(id);
    host.ws.terminate(); // connection drops
    const again = new Client(hostTok, 'h3');
    await again.connect(worldId);
    again.send({ t: 'act', id, action: { type: 'buy', itemId: 'cpu_2' } }); // client resends its outbox
    const ack = await again.waitAck(id);
    expect(ack.ok).toBe(true);
    expect(ack.dup).toBe(true);
    expect(again.state.equipment.cpu).toBe('cpu_2');
    expect(again.state.money).toBeLessThanOrEqual(money - 1800);
    expect(again.state.money).toBeGreaterThan(money - 3600);
    const stamp = again.state.time;
    again.close();
    // wait for the room to save, then restart the whole server and load from storage
    await new Promise((r) => setTimeout(r, 300));
    await app.close();
    app = await startApp({ store: storeFactory(), port: 0, allowCheats: true, tickMs: 40, staticDir: '/nonexistent' });
    base = `http://localhost:${app.port}`;
    const after = new Client(hostTok, 'h4');
    await after.connect(worldId);
    expect(after.state.equipment.cpu).toBe('cpu_2');
    expect(after.state.time).toBeGreaterThanOrEqual(stamp);
    expect(Object.keys(after.state.players)).toHaveLength(2);
    after.close();
  });

  it('guest withdraws co-op earnings into their own world exactly once', async () => {
    const own = await api('/api/worlds', 'POST', { saveName: 'Guest own', specialty: 'graphic' }, guestTok);
    const g = new Client(guestTok, 'gw');
    await g.connect(own.data.id);
    const bank = g.bank;
    expect(bank).toBeGreaterThan(0);
    const m0 = g.state.money;
    g.send({ t: 'withdraw', id: 'wd-1', amount: bank });
    g.send({ t: 'withdraw', id: 'wd-1', amount: bank });
    await g.waitAck('wd-1');
    await new Promise((r) => setTimeout(r, 200));
    expect(g.state.money).toBe(m0 + bank);
    expect(g.bank).toBe(0);
    g.send({ t: 'withdraw', id: 'wd-2', amount: 10 });
    expect((await g.waitAck('wd-2')).ok).toBe(false);
    g.close();
  });

  it('export time reflects the room owner\'s hardware on the server', async () => {
    const host = new Client(hostTok, 'h5');
    await host.connect(worldId);
    const p = host.state.projects[0];
    expect(exportMinutes(host.state, p)).toBeGreaterThan(0);
    host.close();
  });
});
