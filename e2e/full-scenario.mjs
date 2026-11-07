// End-to-end scenario in real browsers against a real server (see README "Testing").
// Two independent browser contexts act as two devices. Steps follow the brief's acceptance scenario.
//
//   npm run build && node e2e/full-scenario.mjs
//
// Env: DATABASE_URL (optional, otherwise JSON store), E2E_PORT (default 8899), E2E_SHOTS (screenshot dir)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(execSyncSafe('npm root -g'), 'playwright'))); }
function execSyncSafe(cmd) { return require('node:child_process').execSync(cmd).toString().trim(); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT ?? 8899);
const BASE = `http://localhost:${PORT}`;
const SHOTS = process.env.E2E_SHOTS ?? path.join(root, 'e2e/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fls-e2e-')), 'db.json');

let server;
function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn('npx', ['tsx', 'server/src/index.ts'], { cwd: root, env: { ...process.env, PORT: String(PORT), ALLOW_DEV_CHEATS: '1', DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    server.stdout.on('data', (d) => { if (String(d).includes('listening')) resolve(); });
    server.stderr.on('data', (d) => { const s = String(d); if (!s.includes('JSON file store')) process.stderr.write('[server] ' + s); });
    server.on('exit', (c) => { if (c && c !== 0 && c !== null) reject(new Error('server exited ' + c)); });
    setTimeout(() => reject(new Error('server start timeout')), 30000);
  });
}
async function stopServer() {
  if (!server) return;
  const s = server; server = null;
  const exited = new Promise((r) => s.on('exit', r));
  try { process.kill(-s.pid, 'SIGTERM'); } catch { s.kill('SIGTERM'); }
  await exited;
  await sleep(500);
}

const results = [];
function step(name, ok, detail = '') { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) throw new Error(`Step failed: ${name} ${detail}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const G = (page, fn, arg) => page.evaluate(fn, arg);
const state = (page) => G(page, () => window.__fls.useGame.getState().state);
async function waitFor(page, fn, arg, ms = 20000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn, arg)) return true; await sleep(150); }
  throw new Error('timeout waiting for ' + label);
}
const act = (page, a) => page.evaluate((x) => window.__fls.useGame.getState().act(x), a);

async function newPlayer(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${label} pageerror]`, e.message));
  await page.goto(BASE);
  await page.waitForSelector('text=لعبة جديدة');
  return page;
}

async function register(page, username, displayName) {
  await page.fill('input[name=username]', username);
  await page.fill('input[name=password]', 'secret123');
  await page.fill('input[name=displayName]', displayName);
  await page.click('button[type=submit]');
  await page.waitForSelector('text=خروج');
}

/** Solve the open video task using only the editor UI (playhead, split, delete, move, text, selects). */
async function solveVideoInUI(page) {
  await page.waitForSelector('[data-testid=video-editor]');
  const info = await G(page, () => { const g = window.__fls.useGame.getState(); const id = g.computerApp.taskId; for (const p of g.state.projects) for (const t of p.tasks) if (t.id === id) return t; });
  const doc = () => G(page, () => window.__flsDoc);
  const starts = (d) => { const out = []; let t = 0; for (const c of d.clips) { out.push(t); t += c.srcOut - c.srcIn; } return out; };
  const tlTime = (d, mediaId, src) => { const st = starts(d); const i = d.clips.findIndex((c) => c.mediaId === mediaId && src >= c.srcIn - 1e-6 && src <= c.srcOut + 1e-6); return st[i] + (src - d.clips[i].srcIn); };
  const setPlayhead = async (t) => { await page.fill('[data-testid=playhead-input]', String(Math.round(t * 10) / 10)); };
  const selectClip = async (pred) => { const d = await doc(); const i = d.clips.findIndex(pred); await page.click(`[data-testid=clip-${i}]`); return i; };
  const okIds = new Set(await G(page, (reqs) => window.__fls.checkAll('video', window.__flsDoc, reqs).results.filter((x) => x.ok).map((x) => x.id), info.requirements));
  info.requirements = info.requirements.filter((r) => !okIds.has(r.id));
  for (const r of info.requirements) {
    const p = r.params;
    if (r.kind === 'removeClip') {
      while ((await doc()).clips.some((c) => c.mediaId === p.mediaId)) { await selectClip((c) => c.mediaId === p.mediaId); await page.click('[data-testid=tool-delete]'); }
    }
    if (r.kind === 'removeRange' || r.kind === 'trimTo') {
      const cuts = r.kind === 'removeRange' ? [p.from, p.to] : [p.keep];
      for (const src of cuts) { await setPlayhead(tlTime(await doc(), p.mediaId, src)); await page.click('[data-testid=tool-split]'); }
      const startSrc = r.kind === 'removeRange' ? p.from : p.keep;
      await selectClip((c) => c.mediaId === p.mediaId && Math.abs(c.srcIn - startSrc) < 0.05);
      await page.click('[data-testid=tool-delete]');
    }
  }
  for (const r of info.requirements) {
    const p = r.params;
    if (r.kind === 'order') {
      for (let k = 0; k < 10; k++) {
        const d = await doc();
        const ib = d.clips.findIndex((c) => c.mediaId === p.before), ia = d.clips.findIndex((c) => c.mediaId === p.after);
        if (ib < ia) break;
        await page.click(`[data-testid=clip-${ib}]`);
        await page.click('[data-testid=tool-move-left]');
      }
    }
  }
  for (const r of info.requirements) {
    const p = r.params;
    if (r.kind === 'addText') await page.click('[data-testid=tool-text]'); // help mode pre-fills the requested text and timing
    if (r.kind === 'textColor' || r.kind === 'allTextColor') { await page.click('[data-testid=text-clip]'); await page.click(`.ve-props [data-color="${p.color}"]`); }
    if (r.kind === 'textPosition') { await page.click('[data-testid=text-clip]'); await page.selectOption('[data-testid=text-position]', p.position); }
    if (r.kind === 'transition') { const d = await doc(); let idx = -1; d.clips.forEach((c, i) => { if (c.mediaId === p.mediaId) idx = i; }); await page.click(`[data-testid=clip-${idx}]`); await page.selectOption('[data-testid=clip-trans]', p.kind); }
    if (r.kind === 'grade') { const d = await doc(); for (let i = 0; i < d.clips.length; i++) if (d.clips[i].mediaId === p.mediaId) { await page.click(`[data-testid=clip-${i}]`); await page.selectOption('[data-testid=clip-grade]', p.grade); } }
    if (r.kind === 'overlay') { await setPlayhead(p.from); await page.click('[data-testid=add-overlay]'); }
  }
  for (const r of info.requirements) {
    if (r.kind !== 'music') continue;
    await page.click(`[data-track=${r.params.trackId}]`);
    await page.click('[data-testid=audio-clip]');
    await page.focus('[data-testid=volume]');
    for (let v = 100; v > r.params.maxVolume; v -= 5) await page.keyboard.press('ArrowLeft');
  }
  const pct = await G(page, () => { const t = document.querySelector('.ws-brief .progress span'); return t ? t.textContent : ''; });
  return pct;
}

async function openTaskFromProjects(page, taskId) {
  await page.click('[data-panel=projects]');
  await page.waitForSelector('[data-testid=active-project]');
  if (taskId) {
    const ok = await page.evaluate((id) => { const g = window.__fls.useGame.getState(); return !!g.state.projects.flatMap((p) => p.tasks).find((t) => t.id === id); }, taskId);
    if (!ok) throw new Error('task missing');
  }
  // Use the panel's own "work on it" button for the requested task (walks to the desk, sits, zooms in)
  const buttons = await page.$$('[data-testid=work-task]');
  let clicked = false;
  for (const b of buttons) {
    const tid = await b.evaluate((el) => el.closest('li')?.querySelector('span')?.textContent ?? '');
    if (!taskId || tid) { await b.click(); clicked = true; break; }
  }
  if (!clicked) throw new Error('no work button');
  await page.waitForSelector('.workspace', { timeout: 20000 });
}

async function main() {
  await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    // ---------------------------------------------------------------- 1. new player, video editor, enters room
    const A = await newPlayer(browser, 'A');
    await register(A, `host${Date.now() % 100000}`, 'محمد');
    await A.click('text=لعبة جديدة');
    await A.fill('.create-form input >> nth=0', 'محمد');
    await A.click('.spec >> nth=0'); // video editor
    await A.click('text=ابدأ مسيرتك');
    await A.waitForSelector('.dock', { timeout: 20000 });
    await A.waitForTimeout(1500);
    await A.screenshot({ path: path.join(SHOTS, '01-room.png') });
    let s = await state(A);
    step('New player starts as a video editor in their room', s.primarySpecialty === 'video' && s.stage === 1 && s.location === 'home', `money ${s.money}`);

    // ---------------------------------------------------------------- 2. receive & accept a project
    await A.click('[data-panel=projects]');
    await A.waitForSelector('[data-testid=offer-card]');
    await A.screenshot({ path: path.join(SHOTS, '02-offer.png') });
    await A.click('[data-testid=accept-offer]');
    await waitFor(A, () => window.__fls.useGame.getState().state.projects.some((p) => p.status === 'active'), null, 5000, 'project active');
    step('Accepting the offer adds it to active work', true);

    // ---------------------------------------------------------------- 3. execute client requests in the timeline
    await A.click('[data-testid=work-task]');
    await A.waitForSelector('.workspace', { timeout: 20000 });
    const pct = await solveVideoInUI(A);
    await A.screenshot({ path: path.join(SHOTS, '03-editor.png') });
    step('Client requests executed in the timeline UI', pct === '100%', `live check ${pct}`);
    const money0 = (await state(A)).money;
    const energy0 = (await state(A)).players[(await G(A, () => window.__fls.useGame.getState().conn.you))].needs.energy;
    await A.click('[data-testid=submit-task]');
    await waitFor(A, () => window.__fls.useGame.getState().computerApp === 'desktop', null, 8000, 'task submitted');
    // a project may have several tasks: solve the rest the same way
    for (let k = 0; k < 4; k++) {
      const open = await G(A, () => { const g = window.__fls.useGame.getState(); const p = g.state.projects.find((x) => x.status === 'active'); return p?.tasks.find((t) => t.status !== 'done')?.id ?? null; });
      if (!open) break;
      await G(A, (id) => window.__fls.useGame.setState({ computerApp: { taskId: id } }), open);
      await solveVideoInUI(A);
      await A.click('[data-testid=submit-task]');
      await sleep(500);
    }
    // ---------------------------------------------------------------- 4. deliver, get paid
    await G(A, () => { document.querySelector('.os-bar .btn')?.click(); });
    await A.waitForTimeout(800);
    await A.click('[data-panel=projects]');
    await A.click('[data-testid=deliver]');
    await act(A, { type: 'setSpeed', speed: 4 });
    const firstId = (await state(A)).projects.find((p) => p.status === 'exporting')?.id;
    for (let i = 0; i < 6; i++) {
      await waitFor(A, (id) => window.__fls.useGame.getState().state.projects.find((p) => p.id === id).status !== 'exporting', firstId, 60000, 'export');
      const p = (await state(A)).projects.find((x) => x.id === firstId);
      if (p.status === 'completed') break;
      // small revision request from the client → fix it in the editor and resend
      const open = p.tasks.find((t) => t.status !== 'done');
      await G(A, (id) => window.__fls.useGame.setState({ cam: 'computer', computerApp: { taskId: id } }), open.id);
      await solveVideoInUI(A);
      await A.click('[data-testid=submit-task]');
      await sleep(400);
      await act(A, { type: 'deliver', projectId: firstId });
    }
    s = await state(A);
    const done = s.projects.find((p) => p.id === firstId);
    await G(A, () => window.__fls.useGame.setState({ cam: 'room', computerApp: null, panel: null }));
    await A.screenshot({ path: path.join(SHOTS, '04-paid.png') });
    step('Delivered project is accepted and paid', done.status === 'completed' && s.money > money0, `+${s.money - money0} SAR, rating ${done.rating}★`);

    // ---------------------------------------------------------------- 5. buy a computer upgrade that changes performance
    if (s.money < 1800) await act(A, { type: 'devGrant', money: 1800 - s.money + 50 });
    const expMin = () => G(A, (id) => { const g = window.__fls.useGame.getState(); return window.__fls.exportMinutes(g.state, g.state.projects.find((p) => p.id === id)); }, firstId);
    const before = await expMin();
    await A.click('[data-panel=shop]');
    await A.click('[data-testid=buy-cpu_2]');
    await waitFor(A, () => window.__fls.useGame.getState().state.equipment.cpu === 'cpu_2', null, 5000, 'cpu bought');
    await A.screenshot({ path: path.join(SHOTS, '05-shop.png') });
    const after = await expMin();
    step('Bought CPU upgrade and it shortens export time', after < before, `export ${before} → ${after} game minutes`);

    // ---------------------------------------------------------------- 6. energy dropped → take a break
    const you = await G(A, () => window.__fls.useGame.getState().conn.you);
    s = await state(A);
    step('Working reduced energy', s.players[you].needs.energy < energy0, `${Math.round(energy0)} → ${Math.round(s.players[you].needs.energy)}`);
    await A.click('[data-panel=shop]');
    // click the sofa in 3D: use the interaction helper (same code path as clicking the mesh)
    await G(A, () => window.__fls.useGame.setState({ pendingInteract: 'sofa' }));
    await A.waitForSelector('.interact-menu');
    await A.screenshot({ path: path.join(SHOTS, '06-break-menu.png') });
    await A.click('.interact-menu button >> nth=0');
    await waitFor(A, (id) => window.__fls.useGame.getState().state.players[id].activity?.kind === 'rest', you, 5000, 'resting');
    step('Took a break on the sofa (rest activity)', true);

    // ---------------------------------------------------------------- 7. invite a friend from another device
    await A.click('[data-panel=online]');
    await A.click('[data-testid=create-invite]');
    const code = (await A.textContent('[data-testid=invite-code]')).trim();
    step('Invite code created', /^[A-Z0-9]{6}$/.test(code), code);
    const B = await newPlayer(browser, 'B');
    await register(B, `guest${Date.now() % 100000}`, 'سارة');
    await B.fill('.join-row input', code);
    await B.click('text=انضمام');
    await B.waitForSelector('.dock', { timeout: 20000 });
    const youB = await G(B, () => window.__fls.useGame.getState().conn.you);
    await waitFor(A, (id) => window.__fls.useGame.getState().presence[id]?.online, youB, 10000, 'friend presence');
    step('Friend joined the same room from another browser', (await state(B)).id === (await state(A)).id);
    await B.mouse.click(720, 520); // friend walks somewhere in the room
    await waitFor(A, (id) => { const p = window.__fls.useGame.getState().presence[id]; return p && (Math.abs(p.tx - 3.5) > 0.1 || Math.abs(p.tz - 3.5) > 0.1); }, youB, 10000, 'friend movement');
    await A.waitForTimeout(1200);
    await A.screenshot({ path: path.join(SHOTS, '07-coop-room.png') });
    step('Friend movement is synced to the host', true);

    // ---------------------------------------------------------------- 8. joint project with synced tasks and profit
    await act(A, { type: 'cancelActivity' });
    let joint = null;
    await act(A, { type: 'setSpeed', speed: 4 });
    for (let i = 0; i < 300 && !joint; i++) {
      s = await state(A);
      joint = s.projects.find((p) => p.status === 'offer' && p.tasks.length >= 2 && p.tasks.every((t) => t.specialty === 'video'));
      if (!joint) { for (const p of s.projects.filter((x) => x.status === 'offer')) await act(A, { type: 'decline', projectId: p.id }); await sleep(400); }
    }
    step('Found a two-task project for co-op', !!joint);
    await act(A, { type: 'accept', projectId: joint.id });
    const [t1, t2] = joint.tasks;
    await act(A, { type: 'assign', taskId: t1.id, assignee: { type: 'player', id: you } });
    // the friend takes the second task from their own Projects panel
    await B.click('[data-panel=projects]');
    await B.waitForSelector('[data-testid=active-project]');
    const selects = await B.$$('[data-testid=assign-select]');
    await selects[1].selectOption(`player:${youB}`);
    await waitFor(A, ([pid, tid, uid]) => window.__fls.useGame.getState().state.projects.find((p) => p.id === pid).tasks.find((t) => t.id === tid).assignee?.id === uid, [joint.id, t2.id, youB], 5000, 'assignment synced');
    step('Task assignment visible to both players', true);
    await G(A, (id) => window.__fls.useGame.setState({ cam: 'computer', computerApp: { taskId: id }, panel: null }), t1.id);
    await G(B, (id) => window.__fls.useGame.setState({ cam: 'computer', computerApp: { taskId: id }, panel: null }), t2.id);
    await Promise.all([solveVideoInUI(A), solveVideoInUI(B)]);
    await B.screenshot({ path: path.join(SHOTS, '08-friend-editor.png') });
    await Promise.all([A.click('[data-testid=submit-task]'), B.click('[data-testid=submit-task]')]);
    for (const t of joint.tasks.slice(2)) { await act(A, { type: 'assign', taskId: t.id, assignee: { type: 'player', id: you } }); await G(A, (id) => window.__fls.useGame.setState({ computerApp: { taskId: id } }), t.id); await solveVideoInUI(A); await A.click('[data-testid=submit-task]'); }
    await waitFor(A, (pid) => window.__fls.useGame.getState().state.projects.find((p) => p.id === pid).tasks.every((t) => t.status === 'done'), joint.id, 10000, 'both tasks done');
    // the same task cannot be submitted twice (e.g. a stale second tab)
    const dup = await G(B, (tid) => window.__fls.useGame.getState().conn.dispatch({ type: 'submitTask', taskId: tid, doc: {} }), t2.id);
    step('Duplicate submission of a finished task is rejected by the server', dup.ok === false);
    await act(A, { type: 'setSplit', projectId: joint.id, split: { [you]: 50, [youB]: 50 } });
    const hostMoney = (await state(A)).money;
    await act(A, { type: 'deliver', projectId: joint.id });
    for (let i = 0; i < 6; i++) {
      await waitFor(A, (id) => window.__fls.useGame.getState().state.projects.find((p) => p.id === id).status !== 'exporting', joint.id, 60000, 'joint export');
      const p = (await state(A)).projects.find((x) => x.id === joint.id);
      if (p.status === 'completed') break;
      for (const t of p.tasks.filter((x) => x.status !== 'done')) {
        const pg = t.assignee?.id === youB ? B : A;
        await G(pg, (id) => window.__fls.useGame.setState({ cam: 'computer', computerApp: { taskId: id } }), t.id);
        await solveVideoInUI(pg);
        await pg.click('[data-testid=submit-task]');
        await sleep(400);
      }
      await act(A, { type: 'deliver', projectId: joint.id });
    }
    const jp = (await state(A)).projects.find((x) => x.id === joint.id);
    await waitFor(B, () => window.__fls.useGame.getState().bank > 0, null, 10000, 'guest bank');
    const bankB = await G(B, () => window.__fls.useGame.getState().bank);
    step('Joint project paid and split 50/50', jp.status === 'completed' && bankB === Math.round(jp.payout / 2), `payout ${jp.payout}, friend got ${bankB}, host +${(await state(A)).money - hostMoney}`);

    // ---------------------------------------------------------------- 9. career: studio → contractor → first employee → agency with coordinator & PM
    await act(A, { type: 'devGrant', xp: 3000, reputation: 30, completed: 5 });
    await G(A, () => window.__fls.useGame.setState({ cam: 'room', computerApp: null }));
    await A.click('[data-panel=career]');
    await A.click('[data-testid=advance-stage]');
    await waitFor(A, () => window.__fls.useGame.getState().state.stage === 2, null, 5000, 'stage 2');
    step('Advanced to Pro Freelancer from the Career panel', true);
    // contractor on a task
    await act(A, { type: 'devGrant', money: 30000 });
    let offer;
    for (let i = 0; i < 400 && !offer; i++) { s = await state(A); offer = s.projects.find((p) => p.status === 'offer' && p.tasks.every((t) => t.specialty === 'video')); if (!offer) await sleep(300); }
    step('A new offer arrived for the contractor test', !!offer);
    await act(A, { type: 'accept', projectId: offer.id });
    await waitFor(A, (id) => window.__fls.useGame.getState().state.projects.find((p) => p.id === id)?.status === 'active', offer.id, 5000, 'offer accepted');
    await G(A, () => window.__fls.useGame.setState({ panel: 'projects' }));
    await A.waitForSelector('[data-testid=assign-select]');
    s = await state(A);
    const contractor = s.contractors.find((c) => c.specialty === 'video' && !c.taskId);
    const sel = await A.$$('[data-testid=assign-select]');
    await sel[sel.length - 1].selectOption(`contractor:${contractor.id}`);
    await waitFor(A, (cid) => !!window.__fls.useGame.getState().state.contractors.find((c) => c.id === cid)?.taskId, contractor.id, 5000, 'contractor hired');
    step('Hired a freelance contractor for a task', true);
    await act(A, { type: 'devGrant', xp: 9000, reputation: 20, completed: 10, money: 10000 });
    await A.click('[data-panel=career]');
    await A.click('[data-testid=advance-stage]');
    await waitFor(A, () => window.__fls.useGame.getState().state.stage === 3, null, 5000, 'stage 3');
    await A.waitForTimeout(1500);
    await A.screenshot({ path: path.join(SHOTS, '09-studio.png') });
    step('Opened a studio (moved into the office)', (await state(A)).location === 'office');
    await A.click('[data-panel=team]');
    await A.waitForSelector('[data-testid=hire]');
    await A.click('[data-testid=hire] >> nth=0');
    await waitFor(A, () => window.__fls.useGame.getState().state.employees.length === 1, null, 5000, 'employee');
    step('Hired the first employee', true);
    // grow to agency: 3 employees + requirements
    await act(A, { type: 'devGrant', xp: 30000, reputation: 30, completed: 15, money: 80000 });
    for (let i = 0; i < 2; i++) { await act(A, { type: 'recruit', role: 'creative', specialty: 'video' }); const c = (await state(A)).candidates.at(-1); await act(A, { type: 'hire', candidateId: c.id }); }
    await A.click('[data-panel=career]');
    await A.click('[data-testid=advance-stage]');
    await waitFor(A, () => window.__fls.useGame.getState().state.stage === 4, null, 5000, 'stage 4');
    // open a motion department, hire a motion designer, coordinator and PM
    await act(A, { type: 'openDepartment', specialty: 'motion' });
    s = await state(A);
    const motionCand = s.candidates.find((c) => c.specialty === 'motion' && c.role === 'creative');
    await act(A, { type: 'hire', candidateId: motionCand.id });
    await act(A, { type: 'recruit', role: 'coordinator' });
    await act(A, { type: 'hire', candidateId: (await state(A)).candidates.find((c) => c.role === 'coordinator').id });
    await act(A, { type: 'recruit', role: 'pm' });
    await act(A, { type: 'hire', candidateId: (await state(A)).candidates.find((c) => c.role === 'pm').id });
    s = await state(A);
    step('Coordinator and project manager hired', s.employees.some((e) => e.role === 'coordinator') && s.employees.some((e) => e.role === 'pm'), `${s.employees.length} staff`);
    await act(A, { type: 'setPolicy', key: 'autoAccept', value: true });
    for (const e of s.employees) await act(A, { type: 'raise', employeeId: e.id, accept: true }).catch(() => {});
    // run time forward until the PM distributes a cross-department project
    let multi = null;
    await act(A, { type: 'setSpeed', speed: 4 });
    // staff work 08:00–20:00 game time; allow enough real time to pass a night at 4x
    for (let i = 0; i < 700 && !multi; i++) {
      s = await state(A);
      multi = s.projects.find((p) => p.specialties.length > 1 && p.tasks.some((t) => t.assignee?.type === 'employee' && t.specialty === 'motion') && p.tasks.some((t) => t.assignee?.type === 'employee' && t.specialty === 'video'));
      if (!multi) await sleep(500);
    }
    await A.click('[data-panel=company]');
    await A.waitForTimeout(1000);
    await A.screenshot({ path: path.join(SHOTS, '10-agency.png') });
    step('PM distributed one project across video and motion departments', !!multi, multi ? multi.log.map((l) => l.text.en).filter((x) => /PM assigned|coordinator/i.test(x)).join(' | ') : '');

    // ---------------------------------------------------------------- 10. save, restart everything, data persists
    const snapshot = await state(A);
    await A.close(); await B.close();
    await stopServer();
    await startServer();
    // the first device reopens the game (its login token is kept in local storage) and continues the save
    const A3 = await browser.contexts()[0].newPage();
    await A3.goto(BASE);
    await A3.waitForSelector('text=متابعة', { timeout: 20000 });
    step('Server restarted and the save list loads', true);
    await A3.click('text=متابعة >> nth=0');
    await A3.waitForSelector('.dock', { timeout: 20000 });
    await waitFor(A3, () => !!window.__fls.useGame.getState().state, null, 10000, 'state');
    const restored = await state(A3);
    await A3.waitForTimeout(1500);
    await A3.screenshot({ path: path.join(SHOTS, '11-after-restart.png') });
    step('Progress persisted across a full restart', restored.stage === snapshot.stage && restored.employees.length === snapshot.employees.length && restored.equipment.cpu === 'cpu_2' && Object.keys(restored.players).length === 2,
      `stage ${restored.stage}, ${restored.employees.length} staff, ${Object.keys(restored.players).length} members`);
  } finally {
    await browser.close();
    await stopServer();
    const ok = results.every((r) => r.ok);
    fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} steps passed`);
    process.exitCode = ok ? 0 : 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; stopServer(); });
