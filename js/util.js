// Small helpers: formatting, escaping, files, calendar, CSV, photos.
import { parseDate, isoDate } from './schedule.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const today = () => isoDate(new Date());
export const fmtNum = n => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString('en-US'));
export const fmtMi = n => `${fmtNum(n)} mi`;
export const fmtMoney = (n, cents = true) => (n == null || isNaN(n) ? '–' :
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }));
export const fmtDate = (s, opts = { month: 'short', day: 'numeric', year: 'numeric' }) => s ? parseDate(s).toLocaleDateString('en-US', opts) : '–';
export const fmtShort = s => fmtDate(s, { month: 'short', day: 'numeric' });
export const fmtMonth = s => fmtDate(s, { month: 'short', year: 'numeric' });
export function fmtDays(n) {
  if (n == null) return '';
  const a = Math.abs(n);
  const unit = a >= 60 ? `${Math.round(a / 30.4)} months` : a >= 14 ? `${Math.round(a / 7)} weeks` : `${a} day${a === 1 ? '' : 's'}`;
  if (n === 0) return 'today';
  return n > 0 ? `in ${unit}` : `${unit} ago`;
}
export function fmtMonths(m) {
  if (m == null) return '';
  if (m % 12 === 0) return `${m / 12} year${m === 12 ? '' : 's'}`;
  return `${m} months`;
}

export function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Share sheet when the phone supports sharing files (Drive, email, etc.), otherwise download. */
export async function shareOrDownload(filename, blob, title) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  download(filename, blob);
  return 'downloaded';
}

/** Shrink a photo to max 1600px on the long side, JPEG ~0.72 quality (usually 150-350 KB). */
export async function compressImage(file, maxSide = 1600, quality = 0.72) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
}

// ---------- Calendar (.ics) ----------
const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
const icsDate = s => isoDate(s).replace(/-/g, '');
function fold(line) {
  const out = [];
  while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
  out.push(line);
  return out.join('\r\n');
}
/** events: [{uid, date, title, description}] → all-day events with reminders 7 days and 1 day before. */
export function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mazda3 Care//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    const start = icsDate(e.date);
    const end = icsDate(new Date(parseDate(e.date).getTime() + 86400000));
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@mazda3care`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${icsEsc(e.title)}`, `DESCRIPTION:${icsEsc(e.description || '')}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, 'TRIGGER:-P7D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(e.title)}`, 'TRIGGER:-PT15H', 'END:VALARM',
      'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
/** Google Calendar "add event" link (needs internet once; the reminder then works offline). */
export function googleCalLink(e) {
  const d = icsDate(e.date), d2 = icsDate(new Date(parseDate(e.date).getTime() + 86400000));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.title)}&dates=${d}/${d2}&details=${encodeURIComponent(e.description || '')}`;
}

// ---------- CSV ----------
export function toCsv(rows) {
  return rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\r\n') + '\r\n';
}

// ---------- icons ----------
export const icon = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  gauge: '<svg viewBox="0 0 24 24"><path d="M4 17a8 8 0 1 1 16 0M12 17l4-5"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5M5 20h14"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 20V8M7 13l5-5 5 5M5 4h14"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  light: '<svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3zM9.5 20h5"/></svg>',
  wrench: '<svg viewBox="0 0 24 24"><path d="M14.5 6.5a4 4 0 0 0 5 5L12 19l-3 1 1-3 7.5-7.5zM14.5 6.5L17 4l3 3-2.5 2.5"/></svg>',
  spec: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M3 14l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4h-3M6 18H3v-4h18M7 18a2 2 0 1 0 0 .1M17 18a2 2 0 1 0 0 .1"/></svg>',
  alert: '<svg viewBox="0 0 24 24"><path d="M12 3l9 16H3zM12 10v4M12 17v.5"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8zM7.5 7.5v.1"/></svg>',
};
