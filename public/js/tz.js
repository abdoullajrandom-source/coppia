// Utilità per fusi orari e orari settimanali.
// Gli orari "occupato" sono salvati nell'ora locale di chi li inserisce:
// busy["0".."6"] (0 = lunedì) è una stringa di 48 caratteri, uno per mezz'ora ("1" = occupato).

export const SLOTS = 48;
export const DAY_NAMES = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export const TIMEZONES = [
  { id: 'Asia/Tokyo', label: 'Giappone (Tokyo)' },
  { id: 'Europe/Rome', label: 'Italia (Roma)' },
];

const fmtCache = new Map();
function partsFormatter(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    }));
  }
  return fmtCache.get(tz);
}
const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Ora "da muro" di un istante in un fuso: {y, m (1-12), d, h, min, wd (0 = lunedì)}
export function wall(date, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(date)) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, wd: WD[p.weekday] };
}

function offsetMs(date, tz) {
  const w = wall(date, tz);
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min);
  return asUtc - Math.floor(date.getTime() / 60000) * 60000;
}

// Istante corrispondente a un'ora "da muro" in un fuso.
export function zoned(y, m, d, h, min, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

export const emptyDay = () => '0'.repeat(SLOTS);

export function busyAt(profile, date) {
  if (!profile) return false;
  const w = wall(date, profile.tz || 'Europe/Rome');
  const day = (profile.busy && profile.busy[w.wd]) || emptyDay();
  return day[Math.floor((w.h * 60 + w.min) / 30)] === '1';
}

export const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (date, tz) => { const w = wall(date, tz); return `${pad(w.h)}:${pad(w.min)}`; };
export const slotLabel = (i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`;

// Prossimi n giorni (a partire da oggi) nel fuso indicato.
export function nextDays(tz, n = 7) {
  const now = wall(new Date(), tz);
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = new Date(Date.UTC(now.y, now.m - 1, now.d + i));
    out.push({ y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), wd: (base.getUTCDay() + 6) % 7, offset: i });
  }
  return out;
}

// Per un giorno (nel fuso di chi guarda), lo stato di ogni mezz'ora.
export function daySlots(day, viewer, partner) {
  const tz = viewer.tz;
  const now = Date.now();
  const slots = [];
  for (let i = 0; i < SLOTS; i++) {
    const at = zoned(day.y, day.m, day.d, Math.floor(i / 2), (i % 2) * 30, tz);
    const meBusy = busyAt(viewer, at);
    const partnerBusy = partner ? busyAt(partner, at) : false;
    slots.push({ i, at, meBusy, partnerBusy, free: !meBusy && !partnerBusy, past: at.getTime() + 30 * 60000 <= now });
  }
  return slots;
}

// Raggruppa le mezz'ore libere per entrambi in intervalli continui.
export function freeRanges(slots) {
  const ranges = [];
  let cur = null;
  for (const s of slots) {
    if (s.free && !s.past) {
      if (!cur) cur = { from: s.i, to: s.i + 1, at: s.at };
      else cur.to = s.i + 1;
    } else if (cur) { ranges.push(cur); cur = null; }
  }
  if (cur) ranges.push(cur);
  return ranges;
}

export function formatDayLong(day) {
  return `${DAY_NAMES[day.wd]} ${day.d} ${MONTHS[day.m - 1]}`;
}

export function formatDateTime(date, tz) {
  const w = wall(date, tz);
  return `${DAY_SHORT[w.wd]} ${w.d} ${MONTHS[w.m - 1].slice(0, 3)} · ${pad(w.h)}:${pad(w.min)}`;
}

export function relative(ms) {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  let s;
  if (min < 1) s = 'adesso';
  else if (min < 60) s = `${min} min`;
  else if (min < 60 * 24) { const h = Math.floor(min / 60), m = min % 60; s = m ? `${h} h ${m} min` : `${h} h`; }
  else { const d = Math.round(min / 1440); s = d === 1 ? '1 giorno' : `${d} giorni`; }
  if (s === 'adesso') return s;
  return diff > 0 ? `tra ${s}` : `${s} fa`;
}

// Giorni che mancano a una data "AAAA-MM-GG" nel fuso indicato.
export function daysUntil(isoDate, tz) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const now = wall(new Date(), tz);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.y, now.m - 1, now.d)) / 86400000);
}

export function guessTz() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONES.some((t) => t.id === tz) ? tz : (tz || 'Europe/Rome');
}
