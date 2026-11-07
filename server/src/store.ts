import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Appearance, GameState } from '@fls/shared';

export interface UserRow { id: string; username: string; displayName: string; passHash: string; appearance: Appearance; bank: number }
export interface WorldSummary { id: string; ownerId: string; ownerName: string; saveName: string; stage: number; money: number; time: number; updatedAt: string; member: boolean }

export interface Store {
  init(): Promise<void>;
  createUser(u: UserRow): Promise<void>;
  userByName(username: string): Promise<UserRow | null>;
  userById(id: string): Promise<UserRow | null>;
  updateUser(id: string, patch: { displayName?: string; appearance?: Appearance }): Promise<void>;
  createSession(tokenHash: string, userId: string): Promise<void>;
  userBySession(tokenHash: string): Promise<UserRow | null>;
  saveWorld(id: string, ownerId: string, saveName: string, state: GameState): Promise<void>;
  loadWorld(id: string): Promise<{ state: GameState; ownerId: string } | null>;
  deleteWorld(id: string): Promise<void>;
  listWorlds(userId: string): Promise<WorldSummary[]>;
  addMember(worldId: string, userId: string): Promise<void>;
  isMember(worldId: string, userId: string): Promise<boolean>;
  createInvite(code: string, worldId: string, by: string, expiresAt: Date): Promise<void>;
  resolveInvite(code: string): Promise<string | null>;
  /** credit once per key; returns false if this key was already credited */
  creditBank(key: string, userId: string, amount: number, kind: string): Promise<boolean>;
  /** atomically debit; returns false when the balance is too low or the key was used */
  debitBank(key: string, userId: string, amount: number, kind: string): Promise<boolean>;
  close(): Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------ PostgreSQL
export class PgStore implements Store {
  pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, ssl: /sslmode=require|supabase|neon|render/.test(url) ? { rejectUnauthorized: false } : undefined, max: 10 });
  }
  async init() { await this.pool.query(fs.readFileSync(path.join(here, '../db/schema.sql'), 'utf8')); }
  private row(r: any): UserRow { return { id: r.id, username: r.username, displayName: r.display_name, passHash: r.pass_hash, appearance: r.appearance, bank: Number(r.bank_balance) }; }
  async createUser(u: UserRow) {
    await this.pool.query('insert into users(id, username, display_name, pass_hash, appearance) values ($1,$2,$3,$4,$5)', [u.id, u.username, u.displayName, u.passHash, JSON.stringify(u.appearance)]);
  }
  async userByName(n: string) { const r = await this.pool.query('select * from users where username=$1', [n]); return r.rows[0] ? this.row(r.rows[0]) : null; }
  async userById(id: string) { const r = await this.pool.query('select * from users where id=$1', [id]); return r.rows[0] ? this.row(r.rows[0]) : null; }
  async updateUser(id: string, p: { displayName?: string; appearance?: Appearance }) {
    if (p.displayName) await this.pool.query('update users set display_name=$2 where id=$1', [id, p.displayName]);
    if (p.appearance) await this.pool.query('update users set appearance=$2 where id=$1', [id, JSON.stringify(p.appearance)]);
  }
  async createSession(h: string, userId: string) { await this.pool.query('insert into sessions(token_hash, user_id) values ($1,$2)', [h, userId]); }
  async userBySession(h: string) {
    const r = await this.pool.query('select u.* from sessions s join users u on u.id=s.user_id where s.token_hash=$1', [h]);
    return r.rows[0] ? this.row(r.rows[0]) : null;
  }
  async saveWorld(id: string, ownerId: string, saveName: string, state: GameState) {
    await this.pool.query(
      `insert into worlds(id, owner_id, save_name, state) values ($1,$2,$3,$4)
       on conflict (id) do update set state=excluded.state, save_name=excluded.save_name, rev=worlds.rev+1, updated_at=now()`,
      [id, ownerId, saveName, JSON.stringify(state)]);
  }
  async loadWorld(id: string) {
    const r = await this.pool.query('select state, owner_id from worlds where id=$1', [id]);
    return r.rows[0] ? { state: r.rows[0].state as GameState, ownerId: r.rows[0].owner_id } : null;
  }
  async deleteWorld(id: string) { await this.pool.query('delete from worlds where id=$1', [id]); }
  async listWorlds(userId: string) {
    const r = await this.pool.query(
      `select w.id, w.owner_id, u.display_name as owner_name, w.save_name, (w.state->>'stage')::int as stage, (w.state->>'money')::float as money,
              (w.state->>'time')::float as time, w.updated_at, (w.owner_id <> $1) as member
         from worlds w join users u on u.id = w.owner_id
        where w.owner_id=$1 or exists (select 1 from world_members m where m.world_id=w.id and m.user_id=$1)
        order by w.updated_at desc`, [userId]);
    return r.rows.map((x: any) => ({ id: x.id, ownerId: x.owner_id, ownerName: x.owner_name, saveName: x.save_name, stage: x.stage, money: x.money, time: x.time, updatedAt: x.updated_at.toISOString(), member: x.member }));
  }
  async addMember(w: string, u: string) { await this.pool.query('insert into world_members(world_id, user_id) values ($1,$2) on conflict do nothing', [w, u]); }
  async isMember(w: string, u: string) {
    const r = await this.pool.query('select 1 from worlds where id=$1 and owner_id=$2 union select 1 from world_members where world_id=$1 and user_id=$2', [w, u]);
    return r.rowCount! > 0;
  }
  async createInvite(code: string, w: string, by: string, exp: Date) { await this.pool.query('insert into invites(code, world_id, created_by, expires_at) values ($1,$2,$3,$4)', [code, w, by, exp]); }
  async resolveInvite(code: string) { const r = await this.pool.query('select world_id from invites where code=$1 and expires_at > now()', [code]); return r.rows[0]?.world_id ?? null; }
  async creditBank(key: string, userId: string, amount: number, kind: string) {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const ins = await c.query('insert into bank_ledger(key, user_id, amount, kind) values ($1,$2,$3,$4) on conflict do nothing', [key, userId, Math.round(amount), kind]);
      if (ins.rowCount === 0) { await c.query('rollback'); return false; }
      await c.query('update users set bank_balance = bank_balance + $2 where id=$1', [userId, Math.round(amount)]);
      await c.query('commit');
      return true;
    } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
  }
  async debitBank(key: string, userId: string, amount: number, kind: string) {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const u = await c.query('select bank_balance from users where id=$1 for update', [userId]);
      if (!u.rows[0] || Number(u.rows[0].bank_balance) < amount) { await c.query('rollback'); return false; }
      const ins = await c.query('insert into bank_ledger(key, user_id, amount, kind) values ($1,$2,$3,$4) on conflict do nothing', [key, userId, -Math.round(amount), kind]);
      if (ins.rowCount === 0) { await c.query('rollback'); return false; }
      await c.query('update users set bank_balance = bank_balance - $2 where id=$1', [userId, Math.round(amount)]);
      await c.query('commit');
      return true;
    } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
  }
  async close() { await this.pool.end(); }
}

// ------------------------------------------------------------------ JSON file fallback (single process, dev only)
interface FileDb {
  users: Record<string, UserRow>;
  sessions: Record<string, string>;
  worlds: Record<string, { ownerId: string; saveName: string; state: GameState; updatedAt: string }>;
  members: Record<string, string[]>;
  invites: Record<string, { worldId: string; expiresAt: string }>;
  bank: Record<string, { userId: string; amount: number; kind: string }>;
}

export class FileStore implements Store {
  db: FileDb = { users: {}, sessions: {}, worlds: {}, members: {}, invites: {}, bank: {} };
  timer: NodeJS.Timeout | null = null;
  constructor(public file: string) {}
  async init() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (fs.existsSync(this.file)) this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
  }
  private persist() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 200);
  }
  flush() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
  }
  async createUser(u: UserRow) {
    if (Object.values(this.db.users).some((x) => x.username === u.username)) throw Object.assign(new Error('duplicate'), { code: '23505' });
    this.db.users[u.id] = { ...u, bank: 0 }; this.persist();
  }
  async userByName(n: string) { const u = Object.values(this.db.users).find((x) => x.username === n); return u ? structuredClone(u) : null; }
  async userById(id: string) { const u = this.db.users[id]; return u ? structuredClone(u) : null; }
  async updateUser(id: string, p: { displayName?: string; appearance?: Appearance }) {
    const u = this.db.users[id]; if (!u) return;
    if (p.displayName) u.displayName = p.displayName;
    if (p.appearance) u.appearance = p.appearance;
    this.persist();
  }
  async createSession(h: string, userId: string) { this.db.sessions[h] = userId; this.persist(); }
  async userBySession(h: string) { const id = this.db.sessions[h]; return id && this.db.users[id] ? structuredClone(this.db.users[id]) : null; }
  async saveWorld(id: string, ownerId: string, saveName: string, state: GameState) {
    this.db.worlds[id] = { ownerId, saveName, state, updatedAt: new Date().toISOString() }; this.persist();
  }
  async loadWorld(id: string) { const w = this.db.worlds[id]; return w ? { state: structuredClone(w.state), ownerId: w.ownerId } : null; }
  async deleteWorld(id: string) { delete this.db.worlds[id]; delete this.db.members[id]; this.persist(); }
  async listWorlds(userId: string) {
    return Object.entries(this.db.worlds)
      .filter(([id, w]) => w.ownerId === userId || (this.db.members[id] ?? []).includes(userId))
      .map(([id, w]) => ({ id, ownerId: w.ownerId, ownerName: this.db.users[w.ownerId]?.displayName ?? '?', saveName: w.saveName, stage: w.state.stage, money: w.state.money, time: w.state.time, updatedAt: w.updatedAt, member: w.ownerId !== userId }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async addMember(w: string, u: string) { const m = (this.db.members[w] ??= []); if (!m.includes(u)) m.push(u); this.persist(); }
  async isMember(w: string, u: string) { return this.db.worlds[w]?.ownerId === u || (this.db.members[w] ?? []).includes(u); }
  async createInvite(code: string, w: string, _by: string, exp: Date) { this.db.invites[code] = { worldId: w, expiresAt: exp.toISOString() }; this.persist(); }
  async resolveInvite(code: string) { const i = this.db.invites[code]; return i && new Date(i.expiresAt) > new Date() ? i.worldId : null; }
  async creditBank(key: string, userId: string, amount: number, kind: string) {
    if (this.db.bank[key] || !this.db.users[userId]) return false;
    this.db.bank[key] = { userId, amount, kind }; this.db.users[userId].bank += Math.round(amount); this.persist(); return true;
  }
  async debitBank(key: string, userId: string, amount: number, kind: string) {
    const u = this.db.users[userId];
    if (!u || u.bank < amount || this.db.bank[key]) return false;
    this.db.bank[key] = { userId, amount: -amount, kind }; u.bank -= Math.round(amount); this.persist(); return true;
  }
  async close() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } this.flush(); }
}

export function makeStore(): Store {
  const url = process.env.DATABASE_URL;
  if (url) return new PgStore(url);
  const file = process.env.DATA_FILE ?? path.join(here, '../data/db.json');
  console.warn(`[store] DATABASE_URL not set — using JSON file store at ${file} (development only)`);
  return new FileStore(file);
}
