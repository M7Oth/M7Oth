import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createWorld, SPECIALTIES, type Appearance, type SpecialtyId } from '@fls/shared';
import type { Store, UserRow } from './store';
import { RoomManager } from './rooms';

const here = path.dirname(fileURLToPath(import.meta.url));

export interface AppOptions { store: Store; port: number; allowCheats?: boolean; tickMs?: number; staticDir?: string; corsOrigin?: string }

const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
function hashPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function verifyPassword(pw: string, stored: string) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const rid = (p: string) => `${p}_${crypto.randomBytes(9).toString('base64url')}`;
const inviteCode = () => Array.from(crypto.randomBytes(6), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

function cleanAppearance(a: any): Appearance {
  const c = (v: any, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  const n = (v: any) => Math.max(0, Math.min(3, Math.floor(Number(v) || 0)));
  return { skin: c(a?.skin, '#e0ac85'), hair: c(a?.hair, '#1d1612'), hairStyle: n(a?.hairStyle), shirt: c(a?.shirt, '#2f6fdf'), pants: c(a?.pants, '#2b3442'), accessory: n(a?.accessory) };
}
const publicUser = (u: UserRow) => ({ id: u.id, username: u.username, displayName: u.displayName, appearance: u.appearance, bank: u.bank });

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary' };

export async function startApp(opts: AppOptions) {
  const { store } = opts;
  await store.init();
  const rooms = new RoomManager(store, { allowCheats: !!opts.allowCheats, tickMs: opts.tickMs ?? 1000 });
  const staticDir = opts.staticDir ?? path.join(here, '../../client/dist');

  async function auth(req: http.IncomingMessage): Promise<UserRow | null> {
    const h = req.headers.authorization;
    const tok = h?.startsWith('Bearer ') ? h.slice(7) : null;
    return tok ? store.userBySession(hashToken(tok)) : null;
  }
  async function body(req: http.IncomingMessage): Promise<any> {
    let data = '';
    for await (const chunk of req) { data += chunk; if (data.length > 1e6) throw new Error('too large'); }
    return data ? JSON.parse(data) : {};
  }
  function json(res: http.ServerResponse, code: number, obj: any) {
    res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': opts.corsOrigin ?? '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS' });
    res.end(JSON.stringify(obj));
  }
  const err = (res: http.ServerResponse, code: number, ar: string, en: string) => json(res, code, { error: { ar, en } });

  async function issueSession(u: UserRow) {
    const token = crypto.randomBytes(32).toString('base64url');
    await store.createSession(hashToken(token), u.id);
    return token;
  }

  async function api(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const m = req.method ?? 'GET';
    const p = url.pathname;
    if (m === 'OPTIONS') return json(res, 204, {});
    if (p === '/api/health') return json(res, 200, { ok: true, rooms: rooms.rooms.size });

    if (p === '/api/register' && m === 'POST') {
      const b = await body(req);
      const username = String(b.username ?? '').trim().toLowerCase();
      const password = String(b.password ?? '');
      if (!/^[a-z0-9_.-]{3,20}$/.test(username)) return err(res, 400, 'اسم المستخدم يجب أن يكون 3-20 حرفًا إنجليزيًا أو أرقامًا', 'Username must be 3-20 latin letters/digits');
      if (password.length < 6) return err(res, 400, 'كلمة المرور قصيرة (6 أحرف على الأقل)', 'Password too short (min 6)');
      const u: UserRow = { id: rid('u'), username, displayName: String(b.displayName ?? username).trim().slice(0, 24) || username, passHash: hashPassword(password), appearance: cleanAppearance(b.appearance), bank: 0 };
      try { await store.createUser(u); } catch (e: any) { if (e.code === '23505') return err(res, 409, 'اسم المستخدم مستخدم', 'Username taken'); throw e; }
      return json(res, 200, { token: await issueSession(u), user: publicUser(u) });
    }
    if (p === '/api/login' && m === 'POST') {
      const b = await body(req);
      const u = await store.userByName(String(b.username ?? '').trim().toLowerCase());
      if (!u || !verifyPassword(String(b.password ?? ''), u.passHash)) return err(res, 401, 'بيانات الدخول غير صحيحة', 'Wrong username or password');
      return json(res, 200, { token: await issueSession(u), user: publicUser(u) });
    }

    const user = await auth(req);
    if (!user) return err(res, 401, 'سجّل الدخول أولًا', 'Please log in');

    if (p === '/api/me' && m === 'GET') return json(res, 200, { user: publicUser(user) });
    if (p === '/api/me' && m === 'POST') {
      const b = await body(req);
      await store.updateUser(user.id, { displayName: b.displayName ? String(b.displayName).slice(0, 24) : undefined, appearance: b.appearance ? cleanAppearance(b.appearance) : undefined });
      return json(res, 200, { user: publicUser((await store.userById(user.id))!) });
    }
    if (p === '/api/worlds' && m === 'GET') return json(res, 200, { worlds: await store.listWorlds(user.id) });
    if (p === '/api/worlds' && m === 'POST') {
      const b = await body(req);
      const specialty = (SPECIALTIES.includes(b.specialty) ? b.specialty : 'video') as SpecialtyId;
      const id = rid('w');
      const appearance = cleanAppearance(b.appearance ?? user.appearance);
      const name = String(b.name ?? user.displayName).trim().slice(0, 24) || user.displayName;
      if (b.name || b.appearance) await store.updateUser(user.id, { displayName: name, appearance });
      const state = createWorld({ id, ownerId: user.id, saveName: String(b.saveName ?? 'حفظ').slice(0, 40), name, appearance, specialty, now: Date.now() });
      await store.saveWorld(id, user.id, state.saveName, state);
      return json(res, 200, { id });
    }
    const wm = p.match(/^\/api\/worlds\/([\w-]+)(\/invite)?$/);
    if (wm) {
      const worldId = wm[1];
      const w = await store.loadWorld(worldId);
      if (!w) return err(res, 404, 'الحفظ غير موجود', 'Save not found');
      if (wm[2] && m === 'POST') {
        const role = w.state.players[user.id]?.role;
        if (w.ownerId !== user.id && role !== 'partner') return err(res, 403, 'فقط المالك أو الشريك يمكنه الدعوة', 'Only the owner or a partner can invite');
        const code = inviteCode();
        await store.createInvite(code, worldId, user.id, new Date(Date.now() + 24 * 3600_000));
        return json(res, 200, { code, expiresInHours: 24 });
      }
      if (!wm[2] && m === 'DELETE') {
        if (w.ownerId !== user.id) return err(res, 403, 'فقط المالك يمكنه الحذف', 'Only the owner can delete');
        const room = rooms.rooms.get(worldId);
        if (room) { for (const c of room.conns) c.ws.close(4001, 'deleted'); rooms.rooms.delete(worldId); await room.dispose().catch(() => {}); }
        await store.deleteWorld(worldId);
        return json(res, 200, { ok: true });
      }
    }
    const im = p.match(/^\/api\/invites\/([A-Z0-9]{6})\/join$/i);
    if (im && m === 'POST') {
      const worldId = await store.resolveInvite(im[1].toUpperCase());
      if (!worldId) return err(res, 404, 'رمز الدعوة غير صالح أو منتهي', 'Invite code invalid or expired');
      await store.addMember(worldId, user.id);
      return json(res, 200, { worldId });
    }
    return err(res, 404, 'غير موجود', 'Not found');
  }

  function serveStatic(res: http.ServerResponse, url: URL) {
    if (!fs.existsSync(staticDir)) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Freelancer Life Simulator server is running. Build the client (npm run build) to serve the game here.'); return; }
    let file = path.normalize(path.join(staticDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(staticDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(staticDir, 'index.html');
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    fs.createReadStream(file).pipe(res);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else serveStatic(res, url);
    } catch (e) {
      console.error('[http]', e);
      if (!res.headersSent) err(res, 500, 'خطأ في الخادم', 'Server error');
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });
  wss.on('connection', (ws, req) => {
    // Register handlers synchronously so no early message is lost while the session is looked up.
    const url = new URL(req.url ?? '/', 'http://local');
    const tok = url.searchParams.get('token');
    const queue: any[] = [];
    let user: UserRow | null = null;
    let conn: Awaited<ReturnType<NonNullable<Awaited<ReturnType<RoomManager['get']>>>['join']>> | null = null;
    let room: Awaited<ReturnType<RoomManager['get']>> = null;
    let alive = true;
    let busy = false;
    ws.on('pong', () => { alive = true; });
    const hb = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 15000);
    const pump = async () => {
      if (busy || !user) return;
      busy = true;
      while (queue.length) {
        const msg = queue.shift();
        try {
          if (msg.t === 'join') {
            const worldId = String(msg.worldId ?? '');
            if (!(await store.isMember(worldId, user.id))) { ws.send(JSON.stringify({ t: 'error', code: 'forbidden', message: { ar: 'لست عضوًا في هذه المساحة', en: 'You are not a member of this workspace' } })); continue; }
            if (room && conn) room.leave(conn);
            room = await rooms.get(worldId);
            if (!room) { ws.send(JSON.stringify({ t: 'error', code: 'missing', message: { ar: 'الحفظ غير موجود', en: 'Save not found' } })); continue; }
            const fresh = await store.userById(user.id);
            conn = await room.join(ws, fresh ?? user);
          } else if (room && conn) await room.handle(conn, msg);
        } catch (e) { console.error('[ws]', e); }
      }
      busy = false;
    };
    ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (queue.length > 500) return;
      queue.push(msg);
      void pump();
    });
    ws.on('close', () => { clearInterval(hb); if (room && conn) room.leave(conn); });
    (tok ? store.userBySession(hashToken(tok)) : Promise.resolve(null)).then((u) => {
      if (!u) { ws.close(4401, 'unauthorized'); return; }
      user = u;
      void pump();
    }).catch(() => ws.close(1011, 'error'));
  });

  await new Promise<void>((r) => server.listen(opts.port, r));
  const port = (server.address() as any).port as number;
  return {
    port, rooms,
    async close() {
      for (const c of wss.clients) c.terminate();
      wss.close();
      await rooms.shutdown();
      await new Promise<void>((r) => server.close(() => r()));
      await store.close();
    },
  };
}
