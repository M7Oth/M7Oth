import { create } from 'zustand';
import type { Action, GameEvent, GameState, L10n, Lang } from '@fls/shared';
import type { Connection, PresenceEntry } from './net/connection';
import { setMuted, sfx } from './audio';

export interface Toast { id: number; text: L10n; tone: string; at: number }
export type Panel = null | 'projects' | 'shop' | 'decor' | 'team' | 'company' | 'career' | 'online' | 'settings' | 'phone' | 'finance';
export type CamMode = 'room' | 'computer';
export type Screen = 'menu' | 'create' | 'game';

export interface Settings { lang: Lang; help: boolean; sound: boolean; quality: 'high' | 'low' }

export interface User { id: string; username: string; displayName: string; appearance: any; bank: number }

interface GameStore {
  screen: Screen;
  user: User | null;
  conn: Connection | null;
  state: GameState | null;
  presence: Record<string, PresenceEntry>;
  status: 'online' | 'connecting' | 'offline' | 'local';
  bank: number;
  toasts: Toast[];
  panel: Panel;
  cam: CamMode;
  computerApp: null | 'desktop' | { taskId: string };
  placing: null | { itemId: string; rot: number; uid?: string };
  settings: Settings;
  myPos: { x: number; z: number; tx: number; tz: number; anim: string };
  pendingInteract: string | null;
  set(p: Partial<GameStore>): void;
  act(a: Action): Promise<boolean>;
  toast(text: L10n, tone?: string, sound?: string): void;
  handleEvents(ev: GameEvent[]): void;
}

const loadSettings = (): Settings => {
  try { return { lang: 'ar', help: true, sound: true, quality: 'high', ...JSON.parse(localStorage.getItem('fls.settings') ?? '{}') }; }
  catch { return { lang: 'ar', help: true, sound: true, quality: 'high' }; }
};

let toastId = 0;

export const useGame = create<GameStore>((set, get) => ({
  screen: 'menu',
  user: null,
  conn: null,
  state: null,
  presence: {},
  status: 'offline',
  bank: 0,
  toasts: [],
  panel: null,
  cam: 'room',
  computerApp: null,
  placing: null,
  settings: loadSettings(),
  myPos: { x: 3.5, z: 3.5, tx: 3.5, tz: 3.5, anim: 'idle' },
  pendingInteract: null,
  set: (p) => {
    if (p.settings) {
      try { localStorage.setItem('fls.settings', JSON.stringify(p.settings)); } catch { /* */ }
      setMuted(!p.settings.sound);
    }
    set(p);
  },
  async act(a) {
    const c = get().conn;
    if (!c) return false;
    const r = await c.dispatch(a);
    if (!r.ok && r.error) { get().toast(r.error, 'bad', 'error'); return false; }
    return r.ok;
  },
  toast(text, tone = 'info', sound) {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, tone, at: Date.now() }] }));
    sfx(sound);
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'bad' ? 7000 : 5000);
  },
  handleEvents(ev) {
    for (const e of ev) if (e.kind === 'toast' && e.text) get().toast(e.text, e.tone, e.sound);
  },
}));

setMuted(!useGame.getState().settings.sound);

export const me = () => { const s = useGame.getState(); return s.state && s.conn ? s.state.players[s.conn.you] : null; };
