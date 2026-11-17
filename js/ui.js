// Shared UI pieces: sheet dialog, toast, status labels, source links.
import { S } from './state.js';
import { esc, fmtNum, fmtShort, fmtDate, fmtDays, fmtMonths, icon } from './util.js';
import * as db from './db.js';

const sheet = () => document.getElementById('sheet');

export function openSheet(html) {
  const d = sheet();
  d.innerHTML = `<div class="grab"></div>${html}`;
  if (!d.open) d.showModal();
  d.querySelector('[autofocus]')?.focus();
}
export function closeSheet() { const d = sheet(); if (d.open) d.close(); }

export function sheetHead(title) {
  return `<div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="btn ghost" data-act="closeSheet">Cancel</button></div>`;
}

let toastTimer;
export function toast(msg, link) {
  const t = document.getElementById('toast');
  t.innerHTML = `<span>${esc(msg)}</span>${link ? `<a href="${esc(link.href)}" data-act="toastLink">${esc(link.label)}</a>` : ''}`;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), link ? 7000 : 3500);
}

export function head(title, back) {
  return `<div class="topbar">${back ? `<a class="back" href="${back}" aria-label="Back">${icon.back}</a>` : ''}<h1>${esc(title)}</h1></div>`;
}

export const STATUS_LABEL = { baseline: 'Do now', overdue: 'Overdue', soon: 'Soon', ok: 'OK' };
export const statusPill = st => `<span class="pill ${st.status}">${STATUS_LABEL[st.status]}</span>`;

/** Short right-side text: what's left. */
export function leftText(st) {
  if (st.status === 'baseline') return 'Do now';
  const parts = [];
  if (st.status === 'overdue') {
    if (st.milesLeft != null && st.milesLeft <= 0) return `${fmtNum(-st.milesLeft)} mi over`;
    return `${fmtDays(st.daysLeft).replace(' ago', '')} late`;
  }
  if (st.trigger === 'miles' && st.milesLeft != null) parts.push(`${fmtNum(st.milesLeft)} mi`);
  else if (st.effectiveDays != null) parts.push(fmtDays(st.effectiveDays).replace('in ', ''));
  return parts.join('');
}

/** Plain-English due line, whichever comes first. */
export function dueText(st) {
  if (st.status === 'baseline') return 'History unknown. Do it now to set your starting point.';
  const bits = [];
  if (st.dueDate) bits.push(fmtDate(st.dueDate));
  if (st.dueMiles) bits.push(`${fmtNum(st.dueMiles)} mi`);
  const both = bits.length > 1 ? ', whichever comes first' : '';
  const verb = st.status === 'overdue' ? 'Was due' : 'Due';
  let proj = '';
  if (st.status !== 'overdue' && st.trigger === 'miles' && st.effectiveDate) proj = ` · at your pace, about ${fmtDate(st.effectiveDate, { month: 'short', year: 'numeric' })}`;
  return `${verb} ${bits.join(' or ')}${both}${proj}`;
}

export function intervalText(st) {
  const it = st.item, b = [];
  if (st.intervalMiles) b.push(`${fmtNum(st.intervalMiles)} miles`);
  if (st.intervalMonths) b.push(fmtMonths(st.intervalMonths));
  let t = b.length ? `Every ${b.join(' or ')}` : '';
  if (it.firstMiles) t = `First at ${fmtNum(it.firstMiles)} miles or ${fmtMonths(it.firstMonths)}, then every ${fmtNum(it.miles)} miles or ${fmtMonths(it.months)}`;
  return t + (b.length > 1 && !it.firstMiles ? ', whichever comes first' : '');
}

export function srcLink(key, label = 'Source') {
  const s = S.data?.sources?.[key];
  if (!s) return '';
  return `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.title)}">${esc(label)}</a>`;
}
export const verifyPill = note => `<span class="pill verify" ${note ? `title="${esc(note)}"` : ''}>Verify in owner's manual</span>`;
export const srcOrVerify = o => (o.verify ? verifyPill(o.verifyNote) + (o.src ? ' ' + srcLink(o.src) : '') : srcLink(o.src));

/** Fill <img data-file="id"> with stored photos after render. */
export async function hydrateFiles(root) {
  for (const el of root.querySelectorAll('[data-file]')) {
    const f = await db.get('files', el.dataset.file);
    if (!f) continue;
    const url = URL.createObjectURL(f.blob);
    if (el.tagName === 'IMG') el.src = url; else el.href = url;
  }
}

export function gauge(st) {
  if (!st) return '';
  const r = 40, c = 2 * Math.PI * r;
  if (st.status === 'baseline') {
    return `<svg class="gauge" viewBox="0 0 100 100" role="img" aria-label="Oil change: history unknown">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--track)" stroke-width="10"/>
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--red)" stroke-width="10" stroke-dasharray="6 8" transform="rotate(-90 50 50)"/>
      <text x="50" y="47" text-anchor="middle" font-size="13" font-weight="750" fill="var(--ink)">OIL</text>
      <text x="50" y="64" text-anchor="middle" font-size="12" font-weight="650" fill="var(--red)">unknown</text></svg>`;
  }
  const left = Math.max(0, Math.min(1, 1 - st.used));
  const col = st.status === 'overdue' ? 'var(--red)' : st.status === 'soon' ? 'var(--amber)' : 'var(--green)';
  return `<svg class="gauge" viewBox="0 0 100 100" role="img" aria-label="Oil life about ${Math.round(left * 100)} percent left">
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--track)" stroke-width="10"/>
    <circle cx="50" cy="50" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * left).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>
    <text x="50" y="47" text-anchor="middle" font-size="13" font-weight="750" fill="var(--ink)">OIL</text>
    <text x="50" y="64" text-anchor="middle" font-size="13" font-weight="650" fill="${col}">${Math.round(left * 100)}% left</text></svg>`;
}
