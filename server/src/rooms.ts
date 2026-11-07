import type { WebSocket } from 'ws';
import { applyAction, warpMinutes, type Action, type GameEvent, type GameState } from '@fls/shared';
import type { Store, UserRow } from './store';

export interface Presence { x: number; z: number; tx: number; tz: number; anim: string; work: { taskId: string; pct: number } | null; online: boolean; at: number }

interface Conn { ws: WebSocket; user: UserRow }

const CLIENT_ACTIONS = new Set<Action['type']>([
  'setSpeed', 'accept', 'decline', 'negotiate', 'assign', 'submitTask', 'review', 'deliver', 'buy', 'equip', 'place', 'movePlaced', 'storePlaced',
  'activity', 'cancelActivity', 'minigame', 'learn', 'advanceStage', 'hireContractor', 'hire', 'fire', 'train', 'raise', 'recruit',
  'openDepartment', 'setPolicy', 'setCompanyName', 'setSplit', 'setRole', 'markRead', 'devGrant',
]);

const send = (ws: WebSocket, msg: any) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

export class Room {
  conns = new Set<Conn>();
  presence: Record<string, Presence> = {};
  acks = new Map<string, { ok: boolean; error?: any; at: number }>();
  timer: NodeJS.Timeout | null = null;
  dirty = false;
  lastSave = Date.now();
  emptySince: number | null = null;
  presenceTimer: NodeJS.Timeout | null = null;

  constructor(public id: string, public ownerId: string, public state: GameState, private store: Store, private opts: { allowCheats: boolean; tickMs: number }, private onEmpty: (r: Room) => void) {
    this.timer = setInterval(() => this.loop(), opts.tickMs);
  }

  memberIds() { return [...new Set([...this.conns].map((c) => c.user.id))]; }

  async join(ws: WebSocket, user: UserRow) {
    const conn: Conn = { ws, user };
    this.conns.add(conn);
    this.emptySince = null;
    if (!this.state.players[user.id]) {
      this.apply({ type: 'addPlayer', id: user.id, name: user.displayName, appearance: user.appearance }, { actorId: 'system', system: true });
    }
    const prev = this.presence[user.id];
    this.presence[user.id] = { x: prev?.x ?? 3, z: prev?.z ?? 3, tx: prev?.tx ?? 3, tz: prev?.tz ?? 3, anim: 'idle', work: null, online: true, at: Date.now() };
    send(ws, { t: 'joined', worldId: this.id, you: user.id, state: this.state, presence: this.presence, bank: user.bank });
    this.broadcastPresence();
    this.broadcast({ t: 'ev', events: [{ kind: 'toast', tone: 'good', sound: 'notify', text: { ar: `${user.displayName} دخل المساحة`, en: `${user.displayName} entered the workspace` } }] }, ws);
    return conn;
  }

  leave(conn: Conn) {
    this.conns.delete(conn);
    const stillHere = [...this.conns].some((c) => c.user.id === conn.user.id);
    if (!stillHere && this.presence[conn.user.id]) {
      this.presence[conn.user.id].online = false;
      // a player who leaves mid-task keeps the assignment; their character simply stops working
      if (this.state.players[conn.user.id]?.activity?.kind === 'work') {
        this.apply({ type: 'cancelActivity' }, { actorId: conn.user.id });
      }
      this.broadcastPresence();
      this.broadcast({ t: 'ev', events: [{ kind: 'toast', tone: 'info', text: { ar: `${conn.user.displayName} غادر المساحة`, en: `${conn.user.displayName} left the workspace` } }] });
    }
    if (this.conns.size === 0) { this.emptySince = Date.now(); void this.save(); }
  }

  /** Handle one client message. Actions are applied strictly in arrival order (Node is single-threaded). */
  async handle(conn: Conn, msg: any) {
    switch (msg?.t) {
      case 'act': {
        const id = String(msg.id ?? '');
        if (!id) return;
        const seen = this.acks.get(id) ?? (this.state.processedActions.includes(id) ? { ok: true, at: Date.now() } : undefined);
        if (seen) { send(conn.ws, { t: 'ack', id, ok: seen.ok, error: seen.error, dup: true }); return; }
        const action = msg.action as Action;
        if (!action || !CLIENT_ACTIONS.has(action.type)) { send(conn.ws, { t: 'ack', id, ok: false, error: { ar: 'إجراء غير مسموح', en: 'Action not allowed' } }); return; }
        const r = this.apply(action, { actorId: conn.user.id, allowCheats: this.opts.allowCheats }, id);
        this.acks.set(id, { ok: !r.error, error: r.error, at: Date.now() });
        send(conn.ws, { t: 'ack', id, ok: !r.error, error: r.error });
        return;
      }
      case 'pos': {
        const p = this.presence[conn.user.id];
        if (!p) return;
        const n = (v: any, d: number) => (Number.isFinite(Number(v)) ? Math.max(-2, Math.min(40, Number(v))) : d);
        p.x = n(msg.x, p.x); p.z = n(msg.z, p.z); p.tx = n(msg.tx, p.tx); p.tz = n(msg.tz, p.tz);
        p.anim = String(msg.anim ?? 'idle').slice(0, 12);
        p.at = Date.now();
        this.schedulePresence();
        return;
      }
      case 'work': {
        const p = this.presence[conn.user.id];
        if (!p) return;
        p.work = msg.taskId ? { taskId: String(msg.taskId).slice(0, 20), pct: Math.max(0, Math.min(100, Number(msg.pct) || 0)) } : null;
        this.schedulePresence();
        return;
      }
      case 'withdraw': {
        // move co-op earnings from the player's account bank into a world they own
        const id = String(msg.id ?? '');
        const amount = Math.floor(Number(msg.amount));
        if (conn.user.id !== this.ownerId || !(amount > 0)) { send(conn.ws, { t: 'ack', id, ok: false, error: { ar: 'غير مسموح', en: 'Not allowed' } }); return; }
        const ok = await this.store.debitBank(`withdraw:${id}`, conn.user.id, amount, 'withdraw');
        if (ok) {
          this.apply({ type: 'bankDeposit', amount, ref: id }, { actorId: 'system', system: true });
        }
        const u = await this.store.userById(conn.user.id);
        conn.user.bank = u?.bank ?? 0;
        send(conn.ws, { t: 'bank', balance: conn.user.bank });
        send(conn.ws, { t: 'ack', id, ok, error: ok ? undefined : { ar: 'الرصيد غير كافٍ', en: 'Insufficient bank balance' } });
        return;
      }
      case 'ping': send(conn.ws, { t: 'pong', at: msg.at }); return;
    }
  }

  apply(action: Action, ctx: { actorId: string; system?: boolean; allowCheats?: boolean }, actionId?: string) {
    const r = applyAction(this.state, action, ctx);
    if (!r.error) {
      this.state = r.state;
      if (actionId) {
        this.state.processedActions.push(actionId);
        if (this.state.processedActions.length > 300) this.state.processedActions.splice(0, this.state.processedActions.length - 300);
      }
      this.dirty = true;
      if (action.type !== 'tick') this.broadcast({ t: 'state', state: this.state });
      if (r.events.length) this.handleEvents(r.events);
    }
    return r;
  }

  private handleEvents(events: GameEvent[]) {
    const pub = events.filter((e) => e.kind !== 'payout');
    if (pub.length) this.broadcast({ t: 'ev', events: pub });
    for (const e of events) {
      if (e.kind !== 'payout' || !e.playerId || !e.amount || !e.key) continue;
      // guest share of a co-op project goes to the guest's account bank exactly once
      void this.store.creditBank(e.key, e.playerId, e.amount, 'coop').then(async (credited) => {
        if (!credited) return;
        const u = await this.store.userById(e.playerId!);
        for (const c of this.conns) if (c.user.id === e.playerId) { c.user.bank = u?.bank ?? c.user.bank; send(c.ws, { t: 'bank', balance: c.user.bank }); send(c.ws, { t: 'ev', events: [{ kind: 'toast', tone: 'good', sound: 'cash', text: { ar: `وصلتك حصتك: ${e.amount} ر.س في حسابك`, en: `Your share arrived: SAR ${e.amount} in your account` } }] }); }
      }).catch((err) => console.error('[bank] credit failed', err));
    }
  }

  private loop() {
    if (this.conns.size === 0) {
      if (this.emptySince && Date.now() - this.emptySince > 30_000) this.onEmpty(this);
      return;
    }
    const present = [...new Set([...this.conns].map((c) => c.user.id))];
    const warp = warpMinutes(this.state, present);
    const minutes = warp || this.state.speed;
    if (minutes > 0) {
      this.apply({ type: 'tick', minutes }, { actorId: 'system', system: true });
      this.broadcast({ t: 'state', state: this.state });
    }
    if (this.dirty && Date.now() - this.lastSave > 5000) void this.save();
    const now = Date.now();
    for (const [k, v] of this.acks) if (now - v.at > 10 * 60_000) this.acks.delete(k);
  }

  private schedulePresence() {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => { this.presenceTimer = null; this.broadcastPresence(); }, 80);
  }
  broadcastPresence() { this.broadcast({ t: 'presence', presence: this.presence }); }

  broadcast(msg: any, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const c of this.conns) if (c.ws !== except && c.ws.readyState === 1) c.ws.send(data);
  }

  async save() {
    if (!this.dirty) return;
    this.dirty = false;
    this.lastSave = Date.now();
    try { await this.store.saveWorld(this.id, this.ownerId, this.state.saveName, this.state); }
    catch (e) { this.dirty = true; console.error('[room] save failed', e); }
  }

  async dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.save();
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  loading = new Map<string, Promise<Room | null>>();
  constructor(private store: Store, private opts: { allowCheats: boolean; tickMs: number }) {}

  async get(worldId: string): Promise<Room | null> {
    const r = this.rooms.get(worldId);
    if (r) return r;
    if (this.loading.has(worldId)) return this.loading.get(worldId)!;
    const p = (async () => {
      const w = await this.store.loadWorld(worldId);
      if (!w) return null;
      const room = new Room(worldId, w.ownerId, w.state, this.store, this.opts, (rm) => void this.unload(rm));
      this.rooms.set(worldId, room);
      return room;
    })();
    this.loading.set(worldId, p);
    try { return await p; } finally { this.loading.delete(worldId); }
  }

  async unload(room: Room) {
    if (room.conns.size) return;
    this.rooms.delete(room.id);
    await room.dispose();
  }

  async shutdown() { for (const r of this.rooms.values()) await r.dispose(); this.rooms.clear(); }
}
