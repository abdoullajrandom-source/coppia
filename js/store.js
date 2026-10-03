// Livello dati: Firebase (Auth + Firestore + Cloud Messaging) oppure, se la
// configurazione non è ancora inserita, una "modalità anteprima" con dati finti.
import { firebaseConfig, vapidKey } from './config.js';
import { guessTz, emptyDay, hhmm, formatDateTime } from './tz.js';

export const DEFAULT_COLORS = { pink: '#f48fb1', yellow: '#f6c445' };

const listeners = new Set();
export const state = {
  ready: false, demo: false, user: null, coupleId: null, couple: null,
  me: null, partner: null, calls: [], notifs: [], error: null,
};
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

const isPlaceholder = firebaseConfig.apiKey.startsWith('INSERISCI');
const forceDemo = new URLSearchParams(location.search).has('anteprima');
state.demo = isPlaceholder || forceDemo;

const SWEET = [
  'Un pensiero piccolo piccolo, solo per te.',
  'Nessuna risposta richiesta: è solo un abbraccio a distanza.',
  'Ti ho pensato proprio adesso.',
  'Ovunque tu sia, ti penso.',
  'Un battito in più, da lontano.',
];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function defaultProfile(name, tz) {
  const busy = {};
  for (let d = 0; d < 7; d++) busy[d] = emptyDay();
  return {
    name: name || 'Io', tz,
    color: tz === 'Asia/Tokyo' ? DEFAULT_COLORS.yellow : DEFAULT_COLORS.pink,
    busy, pause: { active: false }, tokens: [],
  };
}

export function pauseActive(p) {
  return !!(p && p.pause && p.pause.active && p.pause.until > Date.now());
}

let api;

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
async function firebaseApi() {
  const fb = await import('../vendor/firebase.js');
  const app = fb.initializeApp(firebaseConfig);
  const auth = fb.getAuth(app);
  await fb.setPersistence(auth, fb.browserLocalPersistence);
  const db = fb.getFirestore(app);
  let unsubs = [];
  const clearSubs = () => { unsubs.forEach((u) => u()); unsubs = []; };

  const uid = () => state.user.uid;
  const profileRef = (id = uid()) => fb.doc(db, 'couples', state.coupleId, 'profiles', id);

  function watchCouple(cid) {
    clearSubs();
    state.coupleId = cid;
    unsubs.push(fb.onSnapshot(fb.doc(db, 'couples', cid), (s) => { state.couple = s.data() || null; emit(); }, onErr));
    unsubs.push(fb.onSnapshot(fb.collection(db, 'couples', cid, 'profiles'), (qs) => {
      state.me = null; state.partner = null;
      qs.forEach((d) => {
        const p = { id: d.id, ...d.data() };
        if (d.id === uid()) state.me = p; else state.partner = p;
      });
      state.ready = true; emit();
    }, onErr));
    const since = Date.now() - 3 * 3600e3;
    unsubs.push(fb.onSnapshot(
      fb.query(fb.collection(db, 'couples', cid, 'calls'), fb.where('start', '>=', since), fb.orderBy('start')),
      (qs) => { state.calls = qs.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onErr));
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    unsubs.push(fb.onSnapshot(
      fb.query(fb.collection(db, 'couples', cid, 'notifs'), fb.where('createdAt', '>=', fb.Timestamp.fromDate(midnight))),
      (qs) => { state.notifs = qs.docs.map((d) => ({ id: d.id, ...d.data() })); emit(); }, onErr));
  }
  function onErr(e) { console.error(e); state.error = e.message; emit(); }

  let userUnsub = null;
  fb.onAuthStateChanged(auth, (user) => {
    state.user = user ? { uid: user.uid, email: user.email } : null;
    if (userUnsub) { userUnsub(); userUnsub = null; }
    clearSubs();
    Object.assign(state, { coupleId: null, couple: null, me: null, partner: null, calls: [], notifs: [] });
    if (!user) { state.ready = true; emit(); return; }
    state.ready = false; emit();
    userUnsub = fb.onSnapshot(fb.doc(db, 'users', user.uid), (s) => {
      const data = s.data() || {};
      state.userName = data.name || '';
      if (data.coupleId && data.coupleId !== state.coupleId) watchCouple(data.coupleId);
      else if (!data.coupleId) { state.ready = true; emit(); }
    }, onErr);
  });

  async function ensureProfile(cid) {
    const ref = fb.doc(db, 'couples', cid, 'profiles', uid());
    const snap = await fb.getDoc(ref);
    if (!snap.exists()) await fb.setDoc(ref, defaultProfile(state.userName, guessTz()));
  }

  async function notify(kind, title, body) {
    if (!state.partner) return;
    await fb.addDoc(fb.collection(db, 'couples', state.coupleId, 'notifs'), {
      from: uid(), to: state.partner.id, kind, title, body, createdAt: fb.serverTimestamp(),
    });
  }

  return {
    async login(email, pass) { await fb.signInWithEmailAndPassword(auth, email, pass); },
    async register(name, email, pass) {
      const cred = await fb.createUserWithEmailAndPassword(auth, email, pass);
      state.userName = name;
      await fb.setDoc(fb.doc(db, 'users', cred.user.uid), { name }, { merge: true });
    },
    async resetPassword(email) { await fb.sendPasswordResetEmail(auth, email); },
    async logout() { await fb.signOut(auth); },

    async createCouple() {
      const ref = await fb.addDoc(fb.collection(db, 'couples'), { members: [uid()], createdAt: fb.serverTimestamp(), meeting: null });
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b % alphabet.length]).join('');
      await fb.setDoc(fb.doc(db, 'codes', code), { coupleId: ref.id, by: uid() });
      await fb.updateDoc(ref, { code });
      await fb.setDoc(fb.doc(db, 'couples', ref.id, 'profiles', uid()), defaultProfile(state.userName, guessTz()));
      await fb.setDoc(fb.doc(db, 'users', uid()), { coupleId: ref.id }, { merge: true });
    },
    async joinCouple(code) {
      const snap = await fb.getDoc(fb.doc(db, 'codes', code.trim().toUpperCase()));
      if (!snap.exists()) throw new Error('Codice non trovato. Controlla di averlo scritto bene.');
      const cid = snap.data().coupleId;
      try {
        await fb.updateDoc(fb.doc(db, 'couples', cid), { members: fb.arrayUnion(uid()) });
      } catch (e) {
        throw new Error('Non riesco a entrare: forse la coppia è già completa.');
      }
      await ensureProfile(cid);
      await fb.setDoc(fb.doc(db, 'users', uid()), { coupleId: cid }, { merge: true });
    },

    async updateProfile(patch) { await fb.updateDoc(profileRef(), patch); },

    async sendPing() {
      await notify('ping', `${state.me.name} ti sta pensando 💗`, pick(SWEET));
    },
    async setPause(until, message) {
      await fb.updateDoc(profileRef(), { pause: { active: true, until, message: message || '', since: Date.now() } });
      const when = state.partner ? hhmm(new Date(until), state.partner.tz) : '';
      await notify('pause', `${state.me.name} si prende un momento per sé 🌙`,
        `Ti scrive alle ${when} (tua ora).${message ? ' ' + message : ''}`);
    },
    async endPause() {
      await fb.updateDoc(profileRef(), { pause: { active: false } });
      await notify('pause-end', `${state.me.name} è di nuovo qui 🌷`, 'La pausa è finita.');
    },
    async addCall(start, duration, note) {
      await fb.addDoc(fb.collection(db, 'couples', state.coupleId, 'calls'), {
        start, duration, note: note || '', by: uid(), createdAt: fb.serverTimestamp(),
      });
      const when = state.partner ? formatDateTime(new Date(start), state.partner.tz) : '';
      await notify('call', 'Nuova videochiamata in programma 📅', `${state.me.name} ha fissato: ${when} (tua ora).`);
    },
    async deleteCall(call, message) {
      await fb.deleteDoc(fb.doc(db, 'couples', state.coupleId, 'calls', call.id));
      const when = state.partner ? formatDateTime(new Date(call.start), state.partner.tz) : '';
      await notify('call-cancel', 'Videochiamata spostata', `${state.me.name}: la chiamata di ${when} salta.${message ? ' ' + message : ''}`);
    },
    async setMeeting(date, note) {
      await fb.updateDoc(fb.doc(db, 'couples', state.coupleId), { meeting: date ? { date, note: note || '' } : null });
      if (date) await notify('meeting', 'Il prossimo incontro ✈️', `${state.me.name} ha aggiornato la data: ${date.split('-').reverse().join('/')}.`);
    },

    async enableNotifications() {
      if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('unsupported');
      if (!(await fb.isSupported())) throw new Error('unsupported');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('denied');
      const reg = await navigator.serviceWorker.ready;
      const token = await fb.getToken(fb.getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
      await fb.updateDoc(profileRef(), { tokens: fb.arrayUnion(token) });
      localStorage.setItem('coppia-push', token);
    },
  };
}

// ---------------------------------------------------------------------------
// Modalità anteprima (nessun server, dati finti in memoria)
// ---------------------------------------------------------------------------
function demoApi() {
  const meTz = guessTz() === 'Europe/Rome' ? 'Europe/Rome' : 'Asia/Tokyo';
  const partnerTz = meTz === 'Asia/Tokyo' ? 'Europe/Rome' : 'Asia/Tokyo';
  const fill = (from, to) => { let s = ''; for (let i = 0; i < 48; i++) s += i >= from && i < to ? '1' : '0'; return s; };
  const or = (a, b) => [...a].map((c, i) => (c === '1' || b[i] === '1' ? '1' : '0')).join('');
  const weekBusy = (workFrom, workTo) => {
    const b = {};
    for (let d = 0; d < 7; d++) b[d] = or(fill(0, 15), d < 5 ? fill(workFrom, workTo) : fill(46, 48));
    return b;
  };
  state.user = { uid: 'me', email: 'anteprima@coppia' };
  state.coupleId = 'demo';
  state.me = { id: 'me', ...defaultProfile(meTz === 'Asia/Tokyo' ? 'Lay' : 'Alma', meTz), busy: weekBusy(18, 38) };
  state.partner = { id: 'partner', ...defaultProfile(meTz === 'Asia/Tokyo' ? 'Alma' : 'Lay', partnerTz), busy: weekBusy(17, 36) };
  const in10 = new Date(); in10.setDate(in10.getDate() + 38);
  state.couple = { code: 'AB12CD', members: ['me', 'partner'], meeting: { date: in10.toISOString().slice(0, 10), note: 'Ci vediamo a Tokyo' } };
  state.calls = [];
  state.notifs = [{ id: 'n1', from: 'partner', to: 'me', kind: 'ping', createdAt: { toMillis: () => Date.now() - 3600e3 } }];
  state.ready = true;
  const later = () => setTimeout(emit, 0);
  const id = () => Math.random().toString(36).slice(2);

  return {
    async login() {}, async register() {}, async resetPassword() {}, async logout() { alert('In anteprima non c\'è un account da cui uscire.'); },
    async createCouple() {}, async joinCouple() {},
    async updateProfile(patch) { Object.assign(state.me, patch); later(); },
    async sendPing() {},
    async setPause(until, message) { state.me.pause = { active: true, until, message, since: Date.now() }; later(); },
    async endPause() { state.me.pause = { active: false }; later(); },
    async addCall(start, duration, note) { state.calls.push({ id: id(), start, duration, note, by: 'me' }); state.calls.sort((a, b) => a.start - b.start); later(); },
    async deleteCall(call) { state.calls = state.calls.filter((c) => c.id !== call.id); later(); },
    async setMeeting(date, note) { state.couple.meeting = date ? { date, note } : null; later(); },
    async enableNotifications() { throw new Error('demo'); },
  };
}

export async function init() {
  try {
    api = state.demo ? demoApi() : await firebaseApi();
  } catch (e) {
    console.error(e);
    state.error = e.message; state.ready = true;
  }
  emit();
}

export const actions = new Proxy({}, {
  get: (_, name) => (...args) => api[name](...args),
});
