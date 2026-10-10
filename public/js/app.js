import { state, subscribe, init, actions, pauseActive, symbolOf, DEFAULT_COLORS } from './store.js';
import {
  SLOTS, DAY_NAMES, DAY_SHORT, MONTHS, TIMEZONES, wall, zoned, hhmm, pad, slotLabel, nextDays, daySlots,
  freeRanges, formatDayLong, formatDateTime, relative, daysUntil, emptyDay,
} from './tz.js';

const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const ui = { tab: 'home', sched: 'together', dayIdx: 0, editDay: null, authMode: 'login', authError: '', busyOp: false };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-10-9.4C.3 8.3 2.2 4 6.3 4c2.2 0 3.7 1.3 4.7 2.8C12 5.3 13.5 4 15.7 4 19.8 4 21.7 8.3 20 11.6 17.5 16.4 12 21 12 21z"/></svg>';
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ---------------------------------------------------------------------------
// Colori
// ---------------------------------------------------------------------------
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function applyColors() {
  const root = document.documentElement.style;
  const c = state.me?.color || DEFAULT_COLORS.pink;
  const p = state.partner?.color || (c === DEFAULT_COLORS.yellow ? DEFAULT_COLORS.pink : DEFAULT_COLORS.yellow);
  root.setProperty('--c', c);
  root.setProperty('--p', p);
  root.setProperty('--on-c', luminance(c) > 0.45 ? '#45343a' : '#ffffff');
}

// ---------------------------------------------------------------------------
// Utilità UI
// ---------------------------------------------------------------------------
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function hearts(x, y) {
  const set = ['💗', symbolOf(state.me) || '💕', '💖', '💞', '🩷', '💛'];
  for (let i = 0; i < 9; i++) {
    const h = document.createElement('div');
    h.className = 'float-heart';
    h.textContent = set[i % set.length];
    h.style.left = `${x - 12 + (Math.random() * 60 - 30)}px`;
    h.style.top = `${y - 12}px`;
    h.style.setProperty('--dx', `${Math.random() * 120 - 60}px`);
    h.style.animationDelay = `${i * 60}ms`;
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 2400);
  }
}
async function run(fn, okMsg) {
  if (ui.busyOp) return;
  ui.busyOp = true;
  try { await fn(); if (okMsg) toast(okMsg); return true; }
  catch (e) { console.error(e); toast(e.message && e.message.length < 120 ? e.message : 'Qualcosa non ha funzionato, riprova.'); return false; }
  finally { ui.busyOp = false; }
}
function openModal(html, onMount) {
  $modal.innerHTML = `<div class="overlay" data-close><div class="sheet" role="dialog"><div class="grab"></div>${html}</div></div>`;
  $modal.querySelector('.overlay').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeModal(); });
  $modal.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', closeModal));
  onMount?.($modal.querySelector('.sheet'));
}
function closeModal() { $modal.innerHTML = ''; }
const partnerName = () => state.partner?.name || 'l\'altra persona';
const greeting = (h) => (h < 5 ? 'Buonanotte' : h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : h < 22 ? 'Buonasera' : 'Buonanotte');
const dayIcon = (h) => (h >= 7 && h < 19 ? '☀️' : '🌙');

// ---------------------------------------------------------------------------
// Render principale
// ---------------------------------------------------------------------------
function render() {
  applyColors();
  if (!state.ready) { $app.innerHTML = '<div class="loading">💞</div>'; return; }
  if (state.error && !state.user) { $app.innerHTML = `<div class="card center"><p>Errore di configurazione: ${esc(state.error)}</p></div>`; return; }
  if (!state.user) { $app.innerHTML = renderAuth(); bindAuth(); return; }
  if (!state.coupleId) { $app.innerHTML = renderPairing(); bindPairing(); return; }
  if (!state.me) { $app.innerHTML = '<div class="loading">💞</div>'; return; }
  if (ui.editDay === null) ui.editDay = wall(new Date(), state.me.tz).wd;

  const body = ui.tab === 'home' ? renderHome() : ui.tab === 'orari' ? renderOrari() : renderIo();
  $app.innerHTML = `${state.demo ? '<div class="demo-tag">ANTEPRIMA</div>' : ''}${body}${renderTabbar()}`;
  bindMain();
}

function renderTabbar() {
  const t = (id, ico, label) => `<button data-tab="${id}" class="${ui.tab === id ? 'on' : ''}"><span class="ico">${ico}</span>${label}</button>`;
  return `<nav class="tabbar">${t('home', '🏡', 'Noi')}${t('orari', '🗓️', 'Orari')}${t('io', '🎀', 'Io')}</nav>`;
}

// ---------------------------------------------------------------------------
// Accesso
// ---------------------------------------------------------------------------
function renderAuth() {
  const reg = ui.authMode === 'register';
  return `<div class="auth">
    <div class="brand"><span class="hearts">💞</span><h1>Coppia</h1><p class="muted">Il nostro piccolo spazio, anche a 10.000 km</p></div>
    <form class="card" id="auth-form" autocomplete="on">
      <div class="segmented" style="box-shadow:none;background:var(--c-soft)">
        <button type="button" data-mode="login" class="${reg ? '' : 'on'}">Accedi</button>
        <button type="button" data-mode="register" class="${reg ? 'on' : ''}">Registrati</button>
      </div>
      ${reg ? '<label class="field"><span>Il tuo nome</span><input class="input" name="name" required maxlength="30" autocomplete="given-name"></label>' : ''}
      <label class="field"><span>Email</span><input class="input" name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>Password</span><input class="input" name="pass" type="password" required minlength="6" autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
      <button class="btn block" type="submit">${reg ? 'Crea il mio account' : 'Entra'}</button>
      ${ui.authError ? `<p class="error">${esc(ui.authError)}</p>` : ''}
      ${reg ? '' : '<p class="center small" style="margin-top:12px"><button type="button" class="link" id="forgot">Ho dimenticato la password</button></p>'}
    </form>
  </div>`;
}
function authMessage(e) {
  const code = e.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Email o password non corrette.';
  if (code.includes('email-already-in-use')) return 'Esiste già un account con questa email: prova ad accedere.';
  if (code.includes('weak-password')) return 'La password deve avere almeno 6 caratteri.';
  if (code.includes('invalid-email')) return 'L\'email non sembra corretta.';
  if (code.includes('network')) return 'Sembra che manchi la connessione.';
  return 'Qualcosa non ha funzionato, riprova.';
}
function bindAuth() {
  $app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { ui.authMode = b.dataset.mode; ui.authError = ''; render(); }));
  $app.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (ui.authMode === 'register') await actions.register(f.get('name').trim(), f.get('email').trim(), f.get('pass'));
      else await actions.login(f.get('email').trim(), f.get('pass'));
      ui.authError = '';
    } catch (err) { ui.authError = authMessage(err); render(); }
  });
  $app.querySelector('#forgot')?.addEventListener('click', async () => {
    const email = $app.querySelector('[name=email]').value.trim();
    if (!email) { ui.authError = 'Scrivi prima la tua email qui sopra.'; render(); return; }
    await run(() => actions.resetPassword(email), 'Ti ho mandato un\'email per reimpostare la password.');
  });
}

// ---------------------------------------------------------------------------
// Abbinamento della coppia
// ---------------------------------------------------------------------------
function renderPairing() {
  return `<div class="auth">
    <div class="brand"><span class="hearts">💌</span><h1>Ciao ${esc(state.userName || '')}!</h1><p class="muted">Ultimo passo: uniamo i vostri due telefoni.</p></div>
    <div class="card stack">
      <h2>Sei il primo dei due?</h2>
      <p class="muted small">Crea lo spazio della coppia: riceverai un codice da mandare all'altra persona.</p>
      <button class="btn block" id="create">Crea il nostro spazio</button>
    </div>
    <form class="card stack" id="join">
      <h2>Hai ricevuto un codice?</h2>
      <input class="input" name="code" placeholder="Es. K7MQ2P" maxlength="6" style="text-transform:uppercase;letter-spacing:.2em;text-align:center;font-weight:800" required>
      <button class="btn soft block" type="submit">Unisciti</button>
    </form>
    <p class="center"><button class="link small" id="logout">Esci</button></p>
  </div>`;
}
function bindPairing() {
  $app.querySelector('#create').addEventListener('click', () => run(() => actions.createCouple()));
  $app.querySelector('#join').addEventListener('submit', (e) => {
    e.preventDefault();
    run(() => actions.joinCouple(new FormData(e.target).get('code')), 'Siete insieme 💞');
  });
  $app.querySelector('#logout').addEventListener('click', () => actions.logout());
}

// ---------------------------------------------------------------------------
// Home ("Noi")
// ---------------------------------------------------------------------------
function upcomingCalls() {
  const now = Date.now();
  return state.calls.filter((c) => c.start + c.duration * 60000 > now).sort((a, b) => a.start - b.start);
}

function renderHome() {
  const me = state.me, partner = state.partner;
  const now = new Date();
  const wm = wall(now, me.tz);
  let html = `<header class="hello"><div><p class="eyebrow">Ciao ${esc(me.name)}</p><h1>${greeting(wm.h)}</h1></div><span class="logo-hearts">${symbolOf(me)}${partner ? symbolOf(partner) : ''}</span></header>`;

  html += renderInstallBanner();

  if (!partner) {
    html += `<div class="card stack">
      <div class="card-head"><h2><span class="emoji">💌</span> Manca qualcuno…</h2></div>
      <p>Manda questo codice all'altra persona. Dopo essersi registrata, lo inserirà nell'app.</p>
      <div class="code">${esc(state.couple?.code || '······')}</div>
      <button class="btn soft block" id="share-code">Condividi il codice</button>
    </div>`;
    return html;
  }

  const wp = wall(now, partner.tz);
  html += `<section class="card clocks">
    <div class="clock me"><div class="who">Da te ${symbolOf(me)}</div><div class="time">${pad(wm.h)}:${pad(wm.min)}</div><div class="day">${dayIcon(wm.h)} ${DAY_SHORT[wm.wd]} ${wm.d}</div></div>
    <div class="between">🤍</div>
    <div class="clock partner"><div class="who">Da ${esc(partner.name)} ${symbolOf(partner)}</div><div class="time">${pad(wp.h)}:${pad(wp.min)}</div><div class="day">${dayIcon(wp.h)} ${DAY_SHORT[wp.wd]} ${wp.d}</div></div>
  </section>`;

  if (pauseActive(partner)) {
    html += `<div class="banner partner"><span class="emoji">🌙</span><div>
      <p><b>${esc(partner.name)}</b> si sta prendendo un momento per sé.</p>
      <p>Ti scrive verso le <b>${hhmm(new Date(partner.pause.until), me.tz)}</b> (tua ora).</p>
      ${partner.pause.message ? `<p class="small" style="margin-top:4px">“${esc(partner.pause.message)}”</p>` : ''}
    </div></div>`;
  }

  const received = state.notifs.filter((n) => n.kind === 'ping' && n.to === me.id).length;
  html += `<section class="card ping">
    <button class="ping-btn" id="ping" aria-label="Ti penso">${HEART}</button>
    <div class="label">Ti penso</div>
    <p class="muted small">Il telefono di ${esc(partner.name)} vibrerà. Non serve rispondere 🤍</p>
    ${received ? `<div class="received">${esc(partner.name)} ti ha pensato ${received === 1 ? 'una volta' : received + ' volte'} oggi 💗</div>` : ''}
  </section>`;

  const next = upcomingCalls()[0];
  html += `<section class="card next-call">
    <div class="card-head"><h2><span class="emoji">📹</span> Prossima videochiamata</h2></div>
    ${next ? `
      <p class="when">${formatDateTime(new Date(next.start), me.tz)}</p>
      <p class="muted small">Per ${esc(partner.name)}: ${formatDateTime(new Date(next.start), partner.tz)}</p>
      <p style="margin-top:8px"><span class="pill">${next.start <= Date.now() ? 'in corso adesso 💕' : relative(next.start)}</span>${next.note ? ` <span class="small muted">· ${esc(next.note)}</span>` : ''}</p>`
    : `<p class="muted">Nessuna chiamata in programma.</p>`}
    <button class="btn soft block" style="margin-top:12px" data-goto="orari">${next ? 'Vedi gli orari' : 'Troviamo un momento'}</button>
  </section>`;

  const m = state.couple?.meeting;
  const days = m ? daysUntil(m.date, me.tz) : null;
  html += `<section class="card"><span class="plane">✈️</span>
    <div class="card-head"><h2><span class="emoji">🗓️</span> Il prossimo incontro</h2></div>
    ${m && days >= 0 ? `
      <div class="countdown">
        <div class="big-num">${days}</div>
        <div><p class="title" style="font-size:18px">${days === 0 ? 'È oggi! 🎉' : days === 1 ? 'Manca un giorno!' : 'giorni e poi vi abbracciate'}</p>
        <p class="muted small">${formatIsoDate(m.date)}${m.note ? ` · ${esc(m.note)}` : ''}</p></div>
      </div>
      <button class="btn ghost small" id="meeting" style="margin-top:8px">Modifica</button>`
    : `<p class="muted">Quando vi rivedrete? Segnate la data e contate i giorni insieme.</p>
       <button class="btn soft block" id="meeting" style="margin-top:12px">Imposta la data</button>`}
  </section>`;

  html += pauseActive(me)
    ? `<section class="card" style="background:var(--c-soft)">
        <div class="card-head"><h2><span class="emoji">🌙</span> Sei in pausa</h2></div>
        <p>${esc(partner.name)} sa che tornerai verso le <b>${hhmm(new Date(me.pause.until), me.tz)}</b>. Prenditi il tuo tempo 🤍</p>
        <button class="btn block" id="end-pause" style="margin-top:12px">Sono di nuovo qui</button>
      </section>`
    : `<section class="card">
        <div class="card-head"><h2><span class="emoji">🌿</span> Pausa gentile</h2></div>
        <p class="muted small">Hai bisogno di un po' di spazio? Fallo sapere con dolcezza e di' quando tornerai.</p>
        <button class="btn line block" id="pause" style="margin-top:12px">Mi prendo un momento</button>
      </section>`;
  html += `<p class="center" style="margin-top:4px"><button class="link small" data-ideas>💡 Proposte e suggerimenti</button></p>`;
  return html;
}

function formatIsoDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${DAY_NAMES[wd]} ${d} ${MONTHS[m - 1]}`;
}

function renderInstallBanner() {
  if (standalone || localStorage.getItem('coppia-hide-install')) return '';
  if (isIOS) {
    return `<div class="banner info"><span class="emoji">📲</span><div class="small">
      <p><b>Mettimi nella schermata Home</b> per ricevere i “ti penso”: in Safari tocca <b>Condividi</b> (il quadrato con la freccia) e poi <b>Aggiungi alla schermata Home</b>.</p>
      <button class="link tiny" data-hide-install>Ho capito</button></div></div>`;
  }
  if (deferredInstall) {
    return `<div class="banner info"><span class="emoji">📲</span><div class="small">
      <p><b>Installa l'app</b> sul telefono per averla sempre a portata di dito.</p>
      <button class="btn small" id="install" style="margin-top:8px">Installa</button></div></div>`;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Orari
// ---------------------------------------------------------------------------
function renderOrari() {
  const seg = `<div class="segmented">
    <button data-sched="together" class="${ui.sched === 'together' ? 'on' : ''}">💞 Insieme</button>
    <button data-sched="mine" class="${ui.sched === 'mine' ? 'on' : ''}">✏️ I miei orari</button>
  </div>`;
  return `<header class="hello"><div><p class="eyebrow">Quando ci sentiamo?</p><h1>Orari</h1></div></header>${seg}${ui.sched === 'together' ? renderTogether() : renderEditor()}`;
}

function renderTogether() {
  const me = state.me, partner = state.partner;
  if (!partner) return '<div class="card"><p class="muted">Quando l\'altra persona si sarà unita, qui vedrete i momenti liberi in comune.</p></div>';
  const days = nextDays(me.tz, 7);
  const all = days.map((d) => daySlots(d, me, partner));
  const day = days[ui.dayIdx];
  const slots = all[ui.dayIdx];
  const calls = upcomingCalls();

  let week = '<div class="week">';
  days.forEach((d, i) => {
    const free = all[i].filter((s) => s.free && !s.past).length / 2;
    week += `<button class="col ${i === ui.dayIdx ? 'on' : ''}" data-day="${i}">
      <span class="dname">${i === 0 ? 'Oggi' : DAY_SHORT[d.wd]}</span><span class="dnum">${d.d}</span>
      <span class="bar">${all[i].map((s) => `<i class="${s.free ? 'f' : ''} ${s.past ? 'past' : ''}"></i>`).join('')}</span>
      <span class="hrs">${free ? `${free}h` : '—'}</span>
    </button>`;
  });
  week += '</div>';

  const ranges = freeRanges(slots);
  const rangesHtml = ranges.length
    ? ranges.map((r) => {
      const end = new Date(r.at.getTime() + (r.to - r.from) * 30 * 60000);
      return `<div class="range"><div><div class="t">${slotLabel(r.from)} – ${r.to === SLOTS ? '24:00' : slotLabel(r.to)}</div>
        <div class="t2">per ${esc(partner.name)}: ${hhmm(r.at, partner.tz)} – ${hhmm(end, partner.tz)}</div></div>
        <button class="btn small" data-plan="${r.at.getTime()}" data-max="${(r.to - r.from) * 30}">Fissa</button></div>`;
    }).join('')
    : '<p class="muted small">Nessun momento libero in comune in questo giorno 🥲</p>';

  let rows = '';
  slots.forEach((s, idx) => {
    const cls = s.free ? 'free' : s.meBusy && s.partnerBusy ? 'both' : s.meBusy ? 'me' : 'partner';
    const prev = slots[idx - 1], nxt = slots[idx + 1];
    const start = s.free && !(prev && prev.free), end = s.free && !(nxt && nxt.free);
    const call = calls.find((c) => c.start >= s.at.getTime() && c.start < s.at.getTime() + 30 * 60000);
    const text = s.free ? (start ? 'liberi insieme 💞' : '') : (prev && prevCls(prev) === cls) ? '' : cls === 'me' ? 'tu' : cls === 'partner' ? esc(partner.name) : '';
    const half = s.i % 2 === 1;
    rows += `<div class="trow ${half ? 'half' : ''}">
      <span class="lab">${half ? '' : slotLabel(s.i)}</span>
      <div class="cell ${cls} ${start ? 'start' : ''} ${end ? 'end' : ''} ${s.past ? 'past' : ''}" ${s.free && !s.past ? `data-plan="${s.at.getTime()}"` : ''}>${text}${call ? `<span class="call-mark">📹 ${hhmm(new Date(call.start), me.tz)}</span>` : ''}</div>
      <span class="lab r">${half ? '' : hhmm(s.at, partner.tz)}</span>
    </div>`;
  });

  const callsHtml = calls.length
    ? calls.map((c) => `<div class="call-item"><div class="ic">📹</div><div class="grow">
        <div style="font-weight:800">${formatDateTime(new Date(c.start), me.tz)}</div>
        <div class="small muted">per ${esc(partner.name)}: ${formatDateTime(new Date(c.start), partner.tz)} · ${c.duration} min${c.note ? ' · ' + esc(c.note) : ''}</div>
      </div><button class="btn ghost small" data-cancel="${c.id}">Sposta</button></div>`).join('')
    : '<p class="muted small">Ancora nessuna. Tocca un momento colorato qui sopra per fissarne una.</p>';

  return `
    <section class="card">${week}</section>
    <section class="card">
      <div class="card-head"><h2>${day.offset === 0 ? 'Oggi' : day.offset === 1 ? 'Domani' : DAY_NAMES[day.wd]}</h2><span class="muted small">${formatDayLong(day)}</span></div>
      <div class="ranges">${rangesHtml}</div>
    </section>
    <section class="card">
      <div class="card-head"><h3>La giornata, ora per ora</h3></div>
      <div class="legend" style="margin-bottom:10px">
        <span><i style="background:color-mix(in srgb,var(--c) 30%,#fff)"></i>Liberi insieme</span>
        <span><i style="background:#f5ebe8"></i>Tu occupato/a</span>
        <span><i style="background:color-mix(in srgb,var(--p) 18%,#fff)"></i>${esc(partner.name)} occupato/a</span>
      </div>
      <div class="legend tiny" style="justify-content:space-between;margin-bottom:12px"><span>Tua ora</span><span style="color:var(--p-ink)">Ora di ${esc(partner.name)}</span></div>
      <div class="timeline">${rows}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2><span class="emoji">📹</span> Videochiamate in programma</h2></div>
      ${callsHtml}
    </section>`;
}
function prevCls(s) { return s.free ? 'free' : s.meBusy && s.partnerBusy ? 'both' : s.meBusy ? 'me' : 'partner'; }

// Bozza locale degli orari, salvata con un attimo di ritardo.
let draft = null;
let saveTimer = null;
function busyDraft() {
  if (!draft) { draft = {}; for (let d = 0; d < 7; d++) draft[d] = (state.me.busy && state.me.busy[d]) || emptyDay(); }
  return draft;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  const el = document.querySelector('.saved');
  if (el) el.textContent = 'Salvo…';
  saveTimer = setTimeout(async () => {
    const busy = { ...draft };
    const ok = await run(() => actions.updateProfile({ busy }));
    const s = document.querySelector('.saved');
    if (s) s.textContent = ok ? 'Salvato ✓' : 'Non salvato';
  }, 700);
}

function renderEditor() {
  const d = busyDraft();
  const day = d[ui.editDay];
  const chips = DAY_SHORT.map((n, i) => `<button class="chip ${i === ui.editDay ? 'on' : ''}" data-edit-day="${i}">${n}</button>`).join('');
  // Due colonne (00–12 e 12–24) così la giornata intera sta nello schermo.
  const cols = ['', ''];
  for (let i = 0; i < SLOTS; i++) {
    const busy = day[i] === '1';
    const start = busy && (day[i - 1] !== '1' || i === 24), end = busy && (day[i + 1] !== '1' || i === 23);
    cols[i < 24 ? 0 : 1] += `<div class="trow ${i % 2 ? 'half' : ''}"><span class="lab">${i % 2 ? '' : slotLabel(i)}</span>
      <div class="cell ${busy ? 'busy' : ''} ${start ? 'start' : ''} ${end ? 'end' : ''}" data-slot="${i}"></div></div>`;
  }
  const rows = `<div>${cols[0]}</div><div>${cols[1]}</div>`;
  const tzLabel = TIMEZONES.find((t) => t.id === state.me.tz)?.label || state.me.tz;
  return `
    <section class="card stack">
      <p class="small">Segna le ore in cui <b>non</b> puoi sentirti: lavoro, sonno, tempo per te. Tocca le caselle o trascina il dito sopra. Non serve spiegare il perché 🤍</p>
      <p class="tiny muted">Orari nel tuo fuso: ${esc(tzLabel)}. Valgono ogni settimana.</p>
      <div class="chips">${chips}</div>
    </section>
    <section class="card editor">
      <div class="card-head"><h2>${DAY_NAMES[ui.editDay]}</h2><span class="saved"></span></div>
      <div class="chips" style="margin-bottom:14px">
        <button class="chip" data-tool="night">🌙 Notte 00–07:30</button>
        <button class="chip" data-tool="clear">Svuota</button>
      </div>
      <div class="timeline editor-grid" id="editor">${rows}</div>
      <div class="chips" style="margin-top:16px">
        <span class="small muted" style="width:100%">Copia questo giorno su:</span>
        <button class="chip" data-copy="all">Tutti i giorni</button>
        <button class="chip" data-copy="week">Lun–Ven</button>
        <button class="chip" data-copy="weekend">Sab–Dom</button>
      </div>
    </section>`;
}

function bindEditor() {
  const grid = document.getElementById('editor');
  if (!grid) return;
  let painting = null; // '1' o '0'
  const setSlot = (cell) => {
    const i = +cell.dataset.slot;
    const d = busyDraft();
    const arr = d[ui.editDay].split('');
    if (arr[i] === painting) return;
    arr[i] = painting;
    d[ui.editDay] = arr.join('');
    cell.classList.toggle('busy', painting === '1');
  };
  const refreshShapes = () => {
    const day = busyDraft()[ui.editDay];
    grid.querySelectorAll('.cell').forEach((c) => {
      const i = +c.dataset.slot; const busy = day[i] === '1';
      c.classList.toggle('busy', busy);
      c.classList.toggle('start', busy && (day[i - 1] !== '1' || i === 24));
      c.classList.toggle('end', busy && (day[i + 1] !== '1' || i === 23));
    });
  };
  const cellAt = (x, y) => document.elementFromPoint(x, y)?.closest?.('[data-slot]');
  grid.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('[data-slot]');
    if (!cell) return;
    painting = cell.classList.contains('busy') ? '0' : '1';
    setSlot(cell);
    // Su touch: tocco breve = alterna; il trascinamento verticale dipinge.
    grid.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  grid.addEventListener('pointermove', (e) => {
    if (painting === null) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell && grid.contains(cell)) setSlot(cell);
  });
  const stop = () => { if (painting !== null) { painting = null; refreshShapes(); scheduleSave(); } };
  grid.addEventListener('pointerup', stop);
  grid.addEventListener('pointercancel', stop);
  grid.style.touchAction = 'none';

  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    const d = busyDraft();
    if (b.dataset.tool === 'clear') d[ui.editDay] = emptyDay();
    else d[ui.editDay] = d[ui.editDay].split('').map((c, i) => (i < 15 ? '1' : c)).join('');
    refreshShapes(); scheduleSave();
  }));
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const d = busyDraft();
    const targets = b.dataset.copy === 'all' ? [0, 1, 2, 3, 4, 5, 6] : b.dataset.copy === 'week' ? [0, 1, 2, 3, 4] : [5, 6];
    targets.forEach((t) => { d[t] = d[ui.editDay]; });
    scheduleSave();
    toast('Copiato 👍');
  }));
}

// ---------------------------------------------------------------------------
// Io (impostazioni)
// ---------------------------------------------------------------------------
const SYMBOLS = ['☯️', '🌀', '🌙', '⭐', '🌸', '🦋', '🍀', '🌊'];
const PRESETS = ['#f48fb1', '#f6c445', '#ff9e80', '#c39bf0', '#8fd3b6', '#8fb8f4', '#e57373', '#b08968'];

function renderIo() {
  const me = state.me;
  const pushOn = !!localStorage.getItem('coppia-push') && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const custom = !PRESETS.includes(me.color);
  let notif;
  if (state.demo) notif = '<p class="muted small">Le notifiche funzioneranno dopo aver collegato Firebase.</p>';
  else if (isIOS && !standalone) notif = '<p class="small">Su iPhone le notifiche funzionano solo dall\'app nella schermata Home: apri il sito in <b>Safari</b>, tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>. Poi apri Coppia da lì e torna qui.</p>';
  else if (pushOn) notif = '<p class="small">Attive ✓ Riceverai i “ti penso” anche ad app chiusa.</p><button class="btn ghost small" id="push" style="margin-top:6px">Riattiva su questo telefono</button>';
  else notif = '<p class="small muted">Servono per sentire vibrare il telefono quando arriva un “ti penso”.</p><button class="btn block" id="push" style="margin-top:10px">Attiva le notifiche</button>';

  return `<header class="hello"><div><p class="eyebrow">Le tue preferenze</p><h1>Io</h1></div><span class="logo-hearts">${symbolOf(me)}</span></header>
    <section class="card">
      <label class="field"><span>Il tuo nome</span><input class="input" id="name" value="${esc(me.name)}" maxlength="30"></label>
      <label class="field" style="margin-bottom:0"><span>Dove ti trovi</span>
        <select class="input" id="tz">${TIMEZONES.map((t) => `<option value="${t.id}" ${t.id === me.tz ? 'selected' : ''}>${t.label}</option>`).join('')}
        ${TIMEZONES.some((t) => t.id === me.tz) ? '' : `<option value="${esc(me.tz)}" selected>${esc(me.tz)}</option>`}</select></label>
    </section>
    <section class="card">
      <div class="card-head"><h2><span class="emoji">🎨</span> Il tuo colore</h2></div>
      <div class="swatches">
        ${PRESETS.map((c) => `<button class="swatch ${c === me.color ? 'on' : ''}" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join('')}
        <label class="swatch custom ${custom ? 'on' : ''}" aria-label="Scegli un colore"><input type="color" id="color" value="${esc(me.color)}"></label>
      </div>
      <p class="tiny muted" style="margin-top:10px">L'app si colora con il tuo colore; quello di ${esc(partnerName())} compare dove ci sono i suoi orari.</p>
    </section>
    <section class="card">
      <div class="card-head"><h2><span class="emoji">${symbolOf(me)}</span> Il tuo simbolo</h2></div>
      <div class="chips">${SYMBOLS.map((x) => `<button class="chip symbol ${x === symbolOf(me) ? 'on' : ''}" data-symbol="${x}">${x}</button>`).join('')}</div>
      <label class="field" style="margin:12px 0 0"><span>Oppure scrivi un'emoji</span><input class="input" id="symbol" maxlength="8" value="${SYMBOLS.includes(symbolOf(me)) ? '' : esc(symbolOf(me))}" placeholder="Es. 🌻"></label>
      <p class="tiny muted" style="margin-top:10px">Compare accanto al tuo nome e nei tuoi “ti penso”.</p>
    </section>
    <section class="card">
      <div class="card-head"><h2><span class="emoji">💡</span> Proposte e suggerimenti</h2></div>
      <p class="small muted">Un'idea per migliorare l'app? Scrivila qui, la vedete entrambi.</p>
      <button class="btn soft block" data-ideas style="margin-top:12px">Apri le proposte${(state.couple?.ideas || []).length ? ` (${state.couple.ideas.length})` : ''}</button>
    </section>
    <section class="card">
      <div class="card-head"><h2><span class="emoji">🔔</span> Notifiche</h2></div>
      ${notif}
    </section>
    <section class="card">
      <div class="card-head"><h2><span class="emoji">🤝</span> I nostri patti</h2></div>
      <ul class="rules small">
        <li>Il “ti penso” è un regalo, non una domanda: <b>non serve rispondere</b>.</li>
        <li>Qui nessuno vede quando l'altro è online o se ha letto qualcosa.</li>
        <li>Le ore occupate non hanno bisogno di spiegazioni.</li>
        <li>Se una chiamata salta: una riga per avvisare e una nuova data, appena possibile.</li>
        <li>Una pausa dice sempre quando si torna.</li>
      </ul>
    </section>
    <section class="card">
      <div class="card-head"><h2><span class="emoji">💌</span> Codice della coppia</h2></div>
      <div class="code">${esc(state.couple?.code || '—')}</div>
      <p class="tiny muted" style="margin-top:8px">Serve solo per collegare il secondo telefono.</p>
    </section>
    <p class="center"><button class="link small" id="logout">Esci dall'account</button></p>`;
}

// ---------------------------------------------------------------------------
// Fogli (modali)
// ---------------------------------------------------------------------------
function openPlan(startMs, maxMin = 120) {
  const me = state.me, partner = state.partner;
  const start = new Date(+startMs);
  const durations = [30, 60, 90, 120].filter((d) => d <= Math.max(30, maxMin));
  const def = durations.includes(60) ? 60 : durations[durations.length - 1];
  openModal(`<h2>Fissiamo una videochiamata 📹</h2>
    <p class="muted small" style="margin-bottom:14px">Riceverà un avviso con l'orario nel suo fuso.</p>
    <div class="card" style="box-shadow:none;background:var(--c-soft)">
      <p class="title" style="font-size:20px">${formatDateTime(start, me.tz)}</p>
      <p class="small muted">per ${esc(partner.name)}: ${formatDateTime(start, partner.tz)}</p>
    </div>
    <label class="field"><span>Inizio</span><select class="input" id="p-start">${[0, 30, 60, 90].filter((o) => o < maxMin).map((o) => `<option value="${o}">${hhmm(new Date(start.getTime() + o * 60000), me.tz)}</option>`).join('')}</select></label>
    <label class="field"><span>Durata</span><div class="chips" id="p-dur">${durations.map((d) => `<button type="button" class="chip ${d === def ? 'on' : ''}" data-d="${d}">${d < 60 ? d + ' min' : d / 60 + (d === 60 ? ' ora' : ' ore')}</button>`).join('')}</div></label>
    <label class="field"><span>Una nota (facoltativa)</span><input class="input" id="p-note" maxlength="60" placeholder="Es. film insieme 🍿"></label>
    <div class="actions"><button class="btn line" data-dismiss>Annulla</button><button class="btn" id="p-ok">Fissa 💞</button></div>`,
  (sheet) => {
    let dur = def;
    sheet.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      dur = +b.dataset.d; sheet.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    sheet.querySelector('#p-ok').addEventListener('click', async () => {
      const s = start.getTime() + +sheet.querySelector('#p-start').value * 60000;
      if (await run(() => actions.addCall(s, dur, sheet.querySelector('#p-note').value.trim()), 'Chiamata fissata 📅')) closeModal();
    });
  });
}

function openCancel(call) {
  openModal(`<h2>Spostare la chiamata?</h2>
    <p class="muted small" style="margin-bottom:12px">${formatDateTime(new Date(call.start), state.me.tz)}. Scrivi una riga per ${esc(partnerName())} e proponi un nuovo momento: aiuta tanto 🤍</p>
    <div class="chips" style="margin-bottom:10px">
      ${['Scusa, oggi non riesco 🥺', 'Spostiamo a domani?', 'Ti scrivo appena posso'].map((t) => `<button type="button" class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>
    <textarea class="input" id="c-msg" maxlength="140" placeholder="Il tuo messaggio"></textarea>
    <div class="actions"><button class="btn line" data-dismiss>Tienila</button><button class="btn" id="c-ok">Sposta</button></div>`,
  (sheet) => {
    const ta = sheet.querySelector('#c-msg');
    sheet.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { ta.value = b.dataset.t; }));
    sheet.querySelector('#c-ok').addEventListener('click', async () => {
      if (await run(() => actions.deleteCall(call, ta.value.trim()), 'Fatto. Ora scegliete un nuovo momento 💞')) closeModal();
    });
  });
}

function openPause() {
  const me = state.me, partner = state.partner;
  const now = wall(new Date(), me.tz);
  const at = (h, m) => zoned(now.y, now.m, now.d, h, m, me.tz).getTime();
  const roundUp = (ms) => Math.ceil(ms / (15 * 60000)) * 15 * 60000;
  const options = [
    { label: 'Tra 1 ora', v: roundUp(Date.now() + 3600e3) },
    { label: 'Tra 2 ore', v: roundUp(Date.now() + 7200e3) },
    { label: 'Stasera alle 21', v: at(21, 0) },
    { label: 'Domattina alle 9', v: at(9, 0) + 86400e3 },
  ].filter((o) => o.v > Date.now() + 10 * 60000);
  openModal(`<h2>Mi prendo un momento 🌿</h2>
    <p class="muted small" style="margin-bottom:14px">${esc(partner?.name || '')} riceverà un avviso gentile con l'ora in cui tornerai. Prendersi spazio va bene, dire quando si torna fa sentire al sicuro.</p>
    <label class="field"><span>Ti scrivo…</span><div class="chips" id="u-opts">${options.map((o, i) => `<button type="button" class="chip ${i === 1 ? 'on' : ''}" data-v="${o.v}">${o.label}</button>`).join('')}
      <input type="time" class="chip" id="u-time" style="padding:5px 10px"></div></label>
    <label class="field"><span>Un pensiero (facoltativo)</span>
      <div class="chips" style="margin-bottom:8px">${['Sto bene, ho solo bisogno di ricaricarmi 🔋', 'Giornata pesante, ti racconto dopo', 'Ti voglio bene 🤍'].map((t) => `<button type="button" class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <input class="input" id="u-msg" maxlength="100"></label>
    <div class="actions"><button class="btn line" data-dismiss>Annulla</button><button class="btn" id="u-ok">Avvisa con dolcezza</button></div>`,
  (sheet) => {
    let until = options[1]?.v || options[0]?.v;
    const time = sheet.querySelector('#u-time');
    sheet.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
      until = +b.dataset.v; time.value = '';
      sheet.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    time.addEventListener('change', () => {
      if (!time.value) return;
      const [h, m] = time.value.split(':').map(Number);
      let v = at(h, m); if (v < Date.now()) v += 86400e3;
      until = v; sheet.querySelectorAll('[data-v]').forEach((x) => x.classList.remove('on'));
    });
    const msg = sheet.querySelector('#u-msg');
    sheet.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { msg.value = b.dataset.t; }));
    sheet.querySelector('#u-ok').addEventListener('click', async () => {
      if (!until) { toast('Scegli quando tornerai'); return; }
      if (await run(() => actions.setPause(until, msg.value.trim()), 'Avvisato con dolcezza 🌙')) closeModal();
    });
  });
}

function openMeeting() {
  const m = state.couple?.meeting;
  openModal(`<h2>Il prossimo incontro ✈️</h2>
    <p class="muted small" style="margin-bottom:14px">Il conto alla rovescia lo vedrete entrambi.</p>
    <label class="field"><span>Data</span><input class="input" type="date" id="m-date" value="${esc(m?.date || '')}"></label>
    <label class="field"><span>Dove / cosa (facoltativo)</span><input class="input" id="m-note" maxlength="50" value="${esc(m?.note || '')}" placeholder="Es. Ci vediamo a Roma 🍝"></label>
    <div class="actions">${m ? '<button class="btn line" id="m-del">Togli</button>' : '<button class="btn line" data-dismiss>Annulla</button>'}<button class="btn" id="m-ok">Salva</button></div>`,
  (sheet) => {
    sheet.querySelector('#m-ok').addEventListener('click', async () => {
      const date = sheet.querySelector('#m-date').value;
      if (!date) { toast('Scegli una data'); return; }
      if (await run(() => actions.setMeeting(date, sheet.querySelector('#m-note').value.trim()), 'Salvato ✈️')) closeModal();
    });
    sheet.querySelector('#m-del')?.addEventListener('click', async () => { if (await run(() => actions.setMeeting(null))) closeModal(); });
  });
}

function ideaList() {
  const ideas = [...(state.couple?.ideas || [])].sort((a, b) => b.at - a.at);
  if (!ideas.length) return '<p class="muted small center">Ancora nessuna proposta.</p>';
  const who = (uid) => (uid === state.me.id ? state.me : state.partner);
  return ideas.map((i) => {
    const p = who(i.by);
    const d = new Date(i.at);
    return `<div class="idea"><div class="idea-head"><span>${symbolOf(p)} <b>${esc(p?.name || '')}</b> · <span class="muted">${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}</span></span>
      ${i.by === state.me.id ? `<button class="btn ghost small" data-del-idea="${esc(i.id)}">Elimina</button>` : ''}</div>
      <p class="small">${esc(i.text).replace(/\n/g, '<br>')}</p></div>`;
  }).join('');
}

function openIdeas() {
  openModal(`<h2>Proposte e suggerimenti 💡</h2>
    <p class="muted small" style="margin-bottom:12px">Cosa vorreste aggiungere o cambiare nell'app? Le leggerete insieme.</p>
    <textarea class="input" id="i-text" maxlength="600" placeholder="Es. vorrei poter mandare anche un “buonanotte” 🌙"></textarea>
    <div class="actions" style="margin-top:10px"><button class="btn" id="i-add">Aggiungi</button></div>
    <div id="i-list" style="margin-top:18px">${ideaList()}</div>
    <div class="actions"><button class="btn line small" id="i-copy">Copia tutte</button><button class="btn line small" data-dismiss>Chiudi</button></div>`,
  (sheet) => {
    const refresh = () => {
      sheet.querySelector('#i-list').innerHTML = ideaList();
      sheet.querySelectorAll('[data-del-idea]').forEach((b) => b.addEventListener('click', async () => {
        const idea = (state.couple.ideas || []).find((i) => i.id === b.dataset.delIdea);
        if (idea && await run(() => actions.deleteIdea(idea))) setTimeout(refresh, 300);
      }));
    };
    refresh();
    sheet.querySelector('#i-add').addEventListener('click', async () => {
      const ta = sheet.querySelector('#i-text');
      const text = ta.value.trim();
      if (!text) { toast('Scrivi prima la tua proposta'); return; }
      if (await run(() => actions.addIdea(text), 'Proposta aggiunta 💡')) { ta.value = ''; setTimeout(refresh, 300); }
    });
    sheet.querySelector('#i-copy').addEventListener('click', async () => {
      const ideas = [...(state.couple?.ideas || [])].sort((a, b) => a.at - b.at);
      const text = ideas.map((i) => `- ${(i.by === state.me.id ? state.me : state.partner)?.name}: ${i.text}`).join('\n');
      try { await navigator.clipboard.writeText(text || 'Nessuna proposta'); toast('Copiate! Incollale pure a Claude'); }
      catch { toast('Non riesco a copiare su questo telefono'); }
    });
  });
}

// ---------------------------------------------------------------------------
// Eventi
// ---------------------------------------------------------------------------
let lastPing = 0;
function bindMain() {
  $app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    ui.tab = b.dataset.tab; if (ui.tab !== 'orari') draft = null; render(); scrollTo(0, 0);
  }));
  $app.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { ui.tab = b.dataset.goto; ui.sched = 'together'; render(); scrollTo(0, 0); }));

  $app.querySelector('#ping')?.addEventListener('click', async (e) => {
    if (Date.now() - lastPing < 2500) return;
    lastPing = Date.now();
    const btn = e.currentTarget; const r = btn.getBoundingClientRect();
    btn.classList.remove('sent'); void btn.offsetWidth; btn.classList.add('sent');
    hearts(r.left + r.width / 2, r.top + r.height / 3);
    navigator.vibrate?.(40);
    await run(() => actions.sendPing(), 'Pensiero inviato 💗');
  });
  $app.querySelector('#pause')?.addEventListener('click', openPause);
  $app.querySelector('#end-pause')?.addEventListener('click', () => run(() => actions.endPause(), 'Bentornato/a 🌷'));
  $app.querySelector('#meeting')?.addEventListener('click', openMeeting);
  $app.querySelector('#share-code')?.addEventListener('click', async () => {
    const text = `Scarica Coppia 💞 ${location.origin}${location.pathname} e usa il codice ${state.couple?.code}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else { await navigator.clipboard?.writeText(text); toast('Copiato!'); }
  });
  $app.querySelector('[data-hide-install]')?.addEventListener('click', () => { localStorage.setItem('coppia-hide-install', '1'); render(); });
  $app.querySelector('#install')?.addEventListener('click', async () => { deferredInstall.prompt(); deferredInstall = null; render(); });

  // Orari
  $app.querySelectorAll('[data-sched]').forEach((b) => b.addEventListener('click', () => { ui.sched = b.dataset.sched; draft = null; render(); }));
  $app.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { ui.dayIdx = +b.dataset.day; render(); }));
  $app.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => openPlan(b.dataset.plan, +(b.dataset.max || 120))));
  $app.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => openCancel(state.calls.find((c) => c.id === b.dataset.cancel))));
  $app.querySelectorAll('[data-edit-day]').forEach((b) => b.addEventListener('click', () => { ui.editDay = +b.dataset.editDay; render(); }));
  bindEditor();

  // Io
  $app.querySelector('#name')?.addEventListener('change', (e) => { const v = e.target.value.trim(); if (v) run(() => actions.updateProfile({ name: v }), 'Salvato ✓'); });
  $app.querySelector('#tz')?.addEventListener('change', (e) => run(() => actions.updateProfile({ tz: e.target.value }), 'Fuso aggiornato 🌍'));
  $app.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => run(() => actions.updateProfile({ color: b.dataset.color }))));
  const colorInput = $app.querySelector('#color');
  colorInput?.addEventListener('input', (e) => { document.documentElement.style.setProperty('--c', e.target.value); });
  colorInput?.addEventListener('change', (e) => run(() => actions.updateProfile({ color: e.target.value })));
  $app.querySelector('#push')?.addEventListener('click', async () => {
    try { await actions.enableNotifications(); toast('Notifiche attive 🔔'); render(); }
    catch (e) {
      console.error(e);
      toast(e.message === 'denied' ? 'Permesso negato: abilitale dalle impostazioni del telefono.' : e.message === 'unsupported' ? 'Questo browser non supporta le notifiche.' : 'Non sono riuscito ad attivarle, riprova.');
    }
  });
  $app.querySelectorAll('[data-ideas]').forEach((b) => b.addEventListener('click', openIdeas));
  $app.querySelectorAll('[data-symbol]').forEach((b) => b.addEventListener('click', () => run(() => actions.updateProfile({ symbol: b.dataset.symbol }))));
  $app.querySelector('#symbol')?.addEventListener('change', (e) => { const v = e.target.value.trim(); if (v) run(() => actions.updateProfile({ symbol: v }), 'Simbolo aggiornato'); });
  $app.querySelector('#logout')?.addEventListener('click', () => actions.logout());
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
let deferredInstall = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (ui.tab === 'home') render(); });

let pendingRender = false;
subscribe(() => {
  // Non ridisegnare mentre si sta modificando un campo o il foglio orari.
  const active = document.activeElement;
  if (ui.tab === 'orari' && ui.sched === 'mine' && draft) return;
  if (active && $app.contains(active) && /INPUT|SELECT|TEXTAREA/.test(active.tagName)) { pendingRender = true; return; }
  render();
});
document.addEventListener('focusout', () => { if (pendingRender) { pendingRender = false; setTimeout(render, 50); } });
setInterval(() => { if (ui.tab === 'home' && !$modal.innerHTML) render(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

if ('serviceWorker' in navigator && !state.demo) navigator.serviceWorker.register('sw.js').catch(console.error);
init();
