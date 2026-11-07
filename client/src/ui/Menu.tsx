import { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { SPECIALTY_DEFS, SPECIALTIES, SKIN_TONES, HAIR_COLORS, SHIRT_COLORS, PANTS_COLORS, dayOf, formatSAR, stageDef, type Appearance, type SpecialtyId } from '@fls/shared';
import { useGame } from '../store';
import { useT, useL, applyDir } from '../i18n';
import { api, ApiError, getToken, serverAvailable, setToken } from '../net/api';
import { deleteLocal, listLocalSaves, loadLocal, LocalConnection, newLocalWorld, RemoteConnection, type ConnListener } from '../net/connection';
import { Character } from '../scene/Character';
import { local } from '../scene/World';
import { sfx } from '../audio';

export function listener(): ConnListener {
  const g = useGame.getState;
  return {
    onState: (s) => useGame.setState({ state: s }),
    onEvents: (e) => g().handleEvents(e),
    onPresence: (p) => useGame.setState({ presence: p }),
    onStatus: (status) => useGame.setState({ status }),
    onBank: (b) => useGame.setState({ bank: b }),
    onError: (m) => g().toast(m, 'bad', 'error'),
  };
}

function resetLocalPlayer() { Object.assign(local, { x: 3.5, z: 3.5, rotY: 0, path: [], pose: null, onArrive: null }); }

export function openLocal(id: string) {
  const s = loadLocal(id);
  if (!s) return;
  useGame.getState().conn?.close();
  resetLocalPlayer();
  const conn = new LocalConnection(s, listener());
  useGame.setState({ conn, screen: 'game', panel: null, cam: 'room', computerApp: null, presence: {} });
}

export function openRemote(worldId: string) {
  const tok = getToken();
  if (!tok) return;
  useGame.getState().conn?.close();
  resetLocalPlayer();
  const conn = new RemoteConnection(tok, worldId, listener());
  useGame.setState({ conn, state: null, screen: 'game', panel: null, cam: 'room', computerApp: null, presence: {} });
  try { localStorage.setItem('fls.lastWorld', worldId); } catch { /* */ }
}

export function MainMenu() {
  const T = useT();
  const L = useL();
  const lang = useGame((s) => s.settings.lang);
  const settings = useGame((s) => s.settings);
  const user = useGame((s) => s.user);
  const [online, setOnline] = useState<boolean | null>(null);
  const [worlds, setWorlds] = useState<any[]>([]);
  const [locals, setLocals] = useState(listLocalSaves());
  const [code, setCode] = useState(new URLSearchParams(location.search).get('join') ?? '');
  const [msg, setMsg] = useState('');

  useEffect(() => { applyDir(lang); }, [lang]);
  useEffect(() => {
    void serverAvailable().then(async (ok) => {
      setOnline(ok);
      if (ok && getToken()) {
        try { const r = await api('/api/me'); useGame.setState({ user: r.user, bank: r.user.bank }); } catch { setToken(null); }
      }
    });
  }, []);
  useEffect(() => { if (user) void api('/api/worlds').then((r) => setWorlds(r.worlds)).catch(() => {}); }, [user]);

  const join = async () => {
    setMsg('');
    try {
      const r = await api(`/api/invites/${code.trim().toUpperCase()}/join`, 'POST');
      history.replaceState(null, '', location.pathname);
      openRemote(r.worldId);
    } catch (e) { setMsg(e instanceof ApiError ? L(e.l10n) : String(e)); }
  };

  return (
    <div className="menu-screen">
      <div className="menu-bg" />
      <div className="menu-card">
        <div className="menu-head">
          <div className="logo">🖥️</div>
          <div>
            <h1>{T('حياة فريلانسر', 'Freelancer Life')}</h1>
            <div className="sub">Freelancer Life Simulator</div>
          </div>
          <button className="lang-btn" onClick={() => useGame.getState().set({ settings: { ...settings, lang: lang === 'ar' ? 'en' : 'ar' } })}>{lang === 'ar' ? 'English' : 'العربية'}</button>
        </div>
        <p className="tagline">{T('ابدأ من غرفتك، اشتغل بيدك، طوّر أجهزتك، تعاون مع أصدقائك، وأسس شركتك الإبداعية.', 'Start in your room, work with your own hands, upgrade your gear, team up with friends and build your creative company.')}</p>

        <button className="btn primary big" onClick={() => { sfx('click'); useGame.setState({ screen: 'create' }); }}>✨ {T('لعبة جديدة', 'New game')}</button>

        <section>
          <h3>{T('الحساب والأونلاين', 'Account & online')} {online === false && <span className="pill bad">{T('الخادم غير متاح', 'Server offline')}</span>}{online && <span className="pill good">{T('متصل', 'Online')}</span>}</h3>
          {online && !user && <AuthForm />}
          {user && (
            <div className="account-row">
              <span>👤 {user.displayName} <small>@{user.username}</small></span>
              <span className="pill">{T('رصيد التعاون', 'Co-op bank')}: {formatSAR(useGame.getState().bank, lang)}</span>
              <button className="btn small ghost" onClick={() => { setToken(null); useGame.setState({ user: null }); setWorlds([]); }}>{T('خروج', 'Log out')}</button>
            </div>
          )}
          {user && (
            <div className="join-row">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={T('رمز دعوة صديق', 'Friend invite code')} maxLength={6} />
              <button className="btn" disabled={code.length !== 6} onClick={join}>🤝 {T('انضمام', 'Join')}</button>
            </div>
          )}
          {msg && <div className="err">{msg}</div>}
        </section>

        {(worlds.length > 0 || locals.length > 0) && (
          <section>
            <h3>{T('ملفات الحفظ', 'Saves')}</h3>
            <div className="save-list">
              {worlds.map((w) => (
                <div key={w.id} className="save-item">
                  <div>
                    <b>{w.saveName}</b> <span className="pill">{w.member ? T(`مساحة ${w.ownerName}`, `${w.ownerName}'s space`) : T('أونلاين', 'Online')}</span>
                    <div className="muted">{L(stageDef(w.stage).name)} · {T('اليوم', 'Day')} {dayOf(w.time)} · {formatSAR(w.money, lang)}</div>
                  </div>
                  <div className="row">
                    <button className="btn small primary" onClick={() => openRemote(w.id)}>{T('متابعة', 'Play')}</button>
                    {!w.member && <button className="btn small ghost" onClick={async () => { if (confirm(T('حذف هذا الحفظ نهائيًا؟', 'Delete this save permanently?'))) { await api(`/api/worlds/${w.id}`, 'DELETE'); setWorlds(worlds.filter((x) => x.id !== w.id)); } }}>🗑</button>}
                  </div>
                </div>
              ))}
              {locals.map((w) => (
                <div key={w.id} className="save-item">
                  <div>
                    <b>{w.saveName}</b> <span className="pill">{T('محلي', 'Local')}</span>
                    <div className="muted">{w.name} · {L(stageDef(w.stage).name)} · {T('اليوم', 'Day')} {dayOf(w.time)} · {formatSAR(w.money, lang)}</div>
                  </div>
                  <div className="row">
                    <button className="btn small primary" onClick={() => openLocal(w.id)}>{T('متابعة', 'Play')}</button>
                    <button className="btn small ghost" onClick={() => { if (confirm(T('حذف هذا الحفظ نهائيًا؟', 'Delete this save permanently?'))) { deleteLocal(w.id); setLocals(listLocalSaves()); } }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="muted tiny">{T('الحفظ المحلي يعمل بدون إنترنت. اللعب الجماعي يحتاج حفظًا أونلاين على الخادم.', 'Local saves work offline. Co-op requires an online save on the server.')}</div>
      </div>
    </div>
  );
}

function AuthForm() {
  const T = useT();
  const L = useL();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [displayName, setD] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const r = await api(mode === 'login' ? '/api/login' : '/api/register', 'POST', { username, password, displayName: displayName || username });
      setToken(r.token);
      useGame.setState({ user: r.user, bank: r.user.bank });
    } catch (e2) { setErr(e2 instanceof ApiError ? L(e2.l10n) : String(e2)); }
  };
  return (
    <form className="auth" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>{T('حساب جديد', 'Register')}</button>
        <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>{T('دخول', 'Log in')}</button>
      </div>
      <input name="username" value={username} onChange={(e) => setU(e.target.value)} placeholder={T('اسم المستخدم (إنجليزي)', 'Username')} autoComplete="username" dir="ltr" />
      <input name="password" type="password" value={password} onChange={(e) => setP(e.target.value)} placeholder={T('كلمة المرور', 'Password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} dir="ltr" />
      {mode === 'register' && <input name="displayName" value={displayName} onChange={(e) => setD(e.target.value)} placeholder={T('الاسم الظاهر', 'Display name')} />}
      <button className="btn primary" type="submit">{mode === 'login' ? T('دخول', 'Log in') : T('إنشاء الحساب', 'Create account')}</button>
      {err && <div className="err">{err}</div>}
    </form>
  );
}

export function CreateCharacter() {
  const T = useT();
  const L = useL();
  const user = useGame((s) => s.user);
  const [name, setName] = useState(user?.displayName ?? '');
  const [saveName, setSave] = useState(T('مسيرتي', 'My career'));
  const [spec, setSpec] = useState<SpecialtyId>('video');
  const [a, setA] = useState<Appearance>(user?.appearance ?? { skin: SKIN_TONES[1], hair: HAIR_COLORS[0], hairStyle: 0, shirt: SHIRT_COLORS[0], pants: PANTS_COLORS[0], accessory: 0 });
  const [where, setWhere] = useState<'online' | 'local'>(user ? 'online' : 'local');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const swatch = (list: string[], key: keyof Appearance) => (
    <div className="swatches">{list.map((c) => <button key={c} className={a[key] === c ? 'on' : ''} style={{ background: c }} onClick={() => setA({ ...a, [key]: c })} aria-label={c} />)}</div>
  );
  const start = async () => {
    if (!name.trim()) { setErr(T('اكتب اسم الشخصية', 'Enter a character name')); return; }
    setBusy(true); setErr('');
    try {
      if (where === 'online') {
        const r = await api('/api/worlds', 'POST', { saveName, specialty: spec, name, appearance: a });
        openRemote(r.id);
      } else {
        const s = newLocalWorld({ saveName, name, appearance: a, specialty: spec });
        openLocal(s.id);
      }
    } catch (e) { setErr(e instanceof ApiError ? L(e.l10n) : String(e)); setBusy(false); }
  };
  return (
    <div className="menu-screen">
      <div className="menu-bg" />
      <div className="create-card">
        <div className="create-preview">
          <Canvas camera={{ position: [1.4, 1.3, 2.4], fov: 35 }} shadows>
            <ambientLight intensity={0.8} />
            <directionalLight position={[3, 4, 3]} intensity={1.6} castShadow />
            <group position={[0, -0.7, 0]} rotation-y={-0.5}><Character appearance={a} anim="idle" /></group>
            <mesh rotation-x={-Math.PI / 2} position-y={-0.7} receiveShadow><circleGeometry args={[0.8, 32]} /><meshStandardMaterial color="#e8dccb" /></mesh>
          </Canvas>
        </div>
        <div className="create-form">
          <h2>{T('أنشئ شخصيتك', 'Create your character')}</h2>
          <label>{T('اسم الشخصية', 'Character name')}<input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} /></label>
          <label>{T('اسم ملف الحفظ', 'Save name')}<input value={saveName} onChange={(e) => setSave(e.target.value)} maxLength={40} /></label>
          <div className="grid2">
            <div><span className="lbl">{T('البشرة', 'Skin')}</span>{swatch(SKIN_TONES, 'skin')}</div>
            <div><span className="lbl">{T('لون الشعر', 'Hair color')}</span>{swatch(HAIR_COLORS, 'hair')}</div>
            <div><span className="lbl">{T('القميص', 'Shirt')}</span>{swatch(SHIRT_COLORS, 'shirt')}</div>
            <div><span className="lbl">{T('البنطال', 'Pants')}</span>{swatch(PANTS_COLORS, 'pants')}</div>
          </div>
          <div className="grid2">
            <div><span className="lbl">{T('تسريحة', 'Hair style')}</span>
              <div className="seg">{[T('قصير', 'Short'), T('طويل', 'Long'), T('مجعد', 'Curly'), T('شماغ', 'Shemagh')].map((x, i) => <button key={i} className={a.hairStyle === i ? 'on' : ''} onClick={() => setA({ ...a, hairStyle: i })}>{x}</button>)}</div></div>
            <div><span className="lbl">{T('إكسسوار', 'Accessory')}</span>
              <div className="seg">{[T('بدون', 'None'), T('نظارة', 'Glasses'), T('كاب', 'Cap'), T('سماعة', 'Headphones')].map((x, i) => <button key={i} className={a.accessory === i ? 'on' : ''} onClick={() => setA({ ...a, accessory: i })}>{x}</button>)}</div></div>
          </div>
          <span className="lbl">{T('تخصصك الأساسي', 'Your main specialty')}</span>
          <div className="spec-grid">
            {SPECIALTIES.map((s) => {
              const d = SPECIALTY_DEFS[s];
              return (
                <button key={s} className={`spec ${spec === s ? 'on' : ''}`} style={{ ['--c' as any]: d.color }} onClick={() => setSpec(s)}>
                  <span className="ic">{d.icon}</span><b>{L(d.name)}</b><small>{T('أداة', 'Tool')}: {L(d.tool)}</small>
                </button>
              );
            })}
          </div>
          <span className="lbl">{T('مكان الحفظ', 'Save location')}</span>
          <div className="seg">
            <button className={where === 'online' ? 'on' : ''} disabled={!user} onClick={() => setWhere('online')}>🌐 {T('أونلاين (يدعم الأصدقاء)', 'Online (co-op)')}</button>
            <button className={where === 'local' ? 'on' : ''} onClick={() => setWhere('local')}>💾 {T('محلي على هذا الجهاز', 'Local on this device')}</button>
          </div>
          {!user && <div className="muted tiny">{T('سجّل الدخول من القائمة الرئيسية لإنشاء حفظ أونلاين ودعوة الأصدقاء.', 'Log in from the main menu to create an online save and invite friends.')}</div>}
          {err && <div className="err">{err}</div>}
          <div className="row end">
            <button className="btn ghost" onClick={() => useGame.setState({ screen: 'menu' })}>{T('رجوع', 'Back')}</button>
            <button className="btn primary" disabled={busy} onClick={start}>🚀 {T('ابدأ مسيرتك', 'Start your career')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
