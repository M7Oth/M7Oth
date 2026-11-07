import { applyAction, createWorld, warpMinutes, type Action, type Appearance, type GameEvent, type GameState, type L10n, type SpecialtyId } from '@fls/shared';
import { wsUrl } from './api';

export interface PresenceEntry { x: number; z: number; tx: number; tz: number; anim: string; work: { taskId: string; pct: number } | null; online: boolean }

export interface ConnListener {
  onState(s: GameState): void;
  onEvents(e: GameEvent[]): void;
  onPresence(p: Record<string, PresenceEntry>): void;
  onStatus(status: 'online' | 'connecting' | 'offline' | 'local', detail?: string): void;
  onBank(balance: number): void;
  onError(msg: L10n): void;
}

export interface Connection {
  kind: 'local' | 'remote';
  you: string;
  dispatch(a: Action): Promise<{ ok: boolean; error?: L10n }>;
  sendPresence(p: Omit<PresenceEntry, 'online' | 'work'>): void;
  sendWork(taskId: string | null, pct: number): void;
  withdraw(amount: number): Promise<{ ok: boolean; error?: L10n }>;
  close(): void;
}

// ------------------------------------------------------------------ local (offline) saves
export interface LocalSaveMeta { id: string; saveName: string; name: string; stage: number; money: number; time: number; updatedAt: number }
const IDX = 'fls.localSaves';
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

export function listLocalSaves(): LocalSaveMeta[] { return read<LocalSaveMeta[]>(IDX, []).sort((a, b) => b.updatedAt - a.updatedAt); }
export function loadLocal(id: string): GameState | null { return read<GameState | null>(`fls.save.${id}`, null); }
export function saveLocal(s: GameState) {
  write(`fls.save.${s.id}`, s);
  const owner = s.players[s.ownerId];
  const idx = listLocalSaves().filter((x) => x.id !== s.id);
  idx.push({ id: s.id, saveName: s.saveName, name: owner?.name ?? '', stage: s.stage, money: s.money, time: s.time, updatedAt: Date.now() });
  write(IDX, idx);
}
export function deleteLocal(id: string) { try { localStorage.removeItem(`fls.save.${id}`); } catch { /* */ } write(IDX, listLocalSaves().filter((x) => x.id !== id)); }
export function localPlayerId() {
  let id = read<string | null>('fls.localPlayer', null);
  if (!id) { id = `local_${Math.random().toString(36).slice(2, 10)}`; write('fls.localPlayer', id); }
  return id;
}
export function newLocalWorld(opts: { saveName: string; name: string; appearance: Appearance; specialty: SpecialtyId }) {
  const id = `lw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const s = createWorld({ id, ownerId: localPlayerId(), now: Date.now(), ...opts });
  saveLocal(s);
  return s;
}

export class LocalConnection implements Connection {
  kind = 'local' as const;
  timer: number;
  saveTimer: number;
  constructor(public state: GameState, private l: ConnListener) {
    this.you = state.ownerId;
    l.onStatus('local');
    l.onState(state);
    this.timer = window.setInterval(() => this.loop(), 1000);
    this.saveTimer = window.setInterval(() => saveLocal(this.state), 5000);
    window.addEventListener('beforeunload', this.flush);
  }
  you: string;
  flush = () => saveLocal(this.state);
  private loop() {
    const minutes = warpMinutes(this.state, [this.you]) || this.state.speed;
    if (minutes <= 0) return;
    const r = applyAction(this.state, { type: 'tick', minutes }, { actorId: 'system', system: true });
    this.state = r.state;
    this.l.onState(r.state);
    if (r.events.length) this.l.onEvents(r.events);
  }
  async dispatch(a: Action) {
    const allowCheats = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');
    const r = applyAction(this.state, a, { actorId: this.you, allowCheats });
    if (r.error) return { ok: false, error: r.error };
    this.state = r.state;
    this.l.onState(r.state);
    if (r.events.length) this.l.onEvents(r.events);
    saveLocal(this.state);
    return { ok: true };
  }
  sendPresence() { /* single player */ }
  sendWork() { /* single player */ }
  async withdraw() { return { ok: false, error: { ar: 'متاح في الحفظ الأونلاين فقط', en: 'Online saves only' } }; }
  close() { clearInterval(this.timer); clearInterval(this.saveTimer); saveLocal(this.state); window.removeEventListener('beforeunload', this.flush); }
}

// ------------------------------------------------------------------ remote (server-authoritative)
export class RemoteConnection implements Connection {
  kind = 'remote' as const;
  you = '';
  ws: WebSocket | null = null;
  outbox = new Map<string, { msg: any; resolve: (r: { ok: boolean; error?: L10n }) => void }>();
  closed = false;
  retry = 0;
  seq = 0;
  lastPos = 0;
  pendingPos: any = null;
  posTimer: number | null = null;

  constructor(private token: string, public worldId: string, private l: ConnListener) { this.open(); }

  private open() {
    this.l.onStatus('connecting');
    const ws = new WebSocket(wsUrl(this.token));
    this.ws = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'join', worldId: this.worldId })); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      switch (m.t) {
        case 'joined':
          this.you = m.you; this.retry = 0;
          this.l.onState(m.state); this.l.onPresence(m.presence); this.l.onBank(m.bank); this.l.onStatus('online');
          // re-send anything that was not acknowledged before the drop; the server de-duplicates by id
          for (const { msg } of this.outbox.values()) ws.send(JSON.stringify(msg));
          break;
        case 'state': this.l.onState(m.state); break;
        case 'ev': this.l.onEvents(m.events); break;
        case 'presence': this.l.onPresence(m.presence); break;
        case 'bank': this.l.onBank(m.balance); break;
        case 'ack': { const p = this.outbox.get(m.id); if (p) { this.outbox.delete(m.id); p.resolve({ ok: m.ok, error: m.error }); } break; }
        case 'error': this.l.onError(m.message); if (m.code === 'forbidden' || m.code === 'missing') { this.closed = true; ws.close(); } break;
      }
    };
    ws.onclose = (ev) => {
      if (this.closed || ev.code === 4401 || ev.code === 4001) { this.l.onStatus('offline', ev.reason); return; }
      this.l.onStatus('connecting');
      const delay = Math.min(10000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.closed && this.open(), delay);
    };
  }

  private raw(msg: any) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }

  dispatch(action: Action) {
    const id = `${this.you || 'c'}-${Date.now().toString(36)}-${(++this.seq).toString(36)}`;
    const msg = { t: 'act', id, action };
    return new Promise<{ ok: boolean; error?: L10n }>((resolve) => {
      this.outbox.set(id, { msg, resolve });
      this.raw(msg);
    });
  }
  withdraw(amount: number) {
    const id = `wd-${Date.now().toString(36)}-${(++this.seq).toString(36)}`;
    const msg = { t: 'withdraw', id, amount };
    return new Promise<{ ok: boolean; error?: L10n }>((resolve) => { this.outbox.set(id, { msg, resolve }); this.raw(msg); });
  }
  sendPresence(p: Omit<PresenceEntry, 'online' | 'work'>) {
    // throttle to ~8 updates/sec
    this.pendingPos = { t: 'pos', ...p };
    if (this.posTimer) return;
    const wait = Math.max(0, 120 - (Date.now() - this.lastPos));
    this.posTimer = window.setTimeout(() => { this.posTimer = null; this.lastPos = Date.now(); this.raw(this.pendingPos); }, wait);
  }
  sendWork(taskId: string | null, pct: number) { this.raw({ t: 'work', taskId, pct }); }
  close() { this.closed = true; this.ws?.close(); }
}
