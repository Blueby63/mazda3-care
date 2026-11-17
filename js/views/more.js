import { S, saveCar, setKv, saveRecord, deleteRecord, loadAll, sorted } from '../state.js';
import { esc, fmtNum, fmtMoney, fmtDate, fmtDays, icon, today, download, shareOrDownload, buildIcs, googleCalLink, toCsv, compressImage } from '../util.js';
import { head, openSheet, closeSheet, sheetHead, toast, srcLink, verifyPill } from '../ui.js';
import { costSummary, mpgLog, warrantyStatus, daysBetween, addDays, isoDate } from '../schedule.js';
import * as db from '../db.js';
import { render, APP_VERSION } from '../app.js';

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const DOC_KINDS = ['Owner’s manual', 'Insurance card', 'Purchase paperwork', 'Registration', 'Warranty', 'Other'];

// ---------- menu ----------
function menu() {
  const r = (href, title, sub) => `<a class="row" href="#/more/${href}"><div class="main"><b>${title}</b><span>${sub}</span></div>${icon.chev}</a>`;
  const c = costSummary(S.services, { purchaseMiles: +S.car.purchaseMiles || 0, currentMiles: S.latest?.miles || 0, fuel: S.fuel });
  const lastB = S.kv.lastBackupAt;
  return `${head('More')}
  <div class="card flush">
    ${r('costs', 'Costs', `${fmtMoney(c.total, false)} on maintenance and repairs${c.perMile != null ? ` · ${fmtMoney(c.perMile)}/mi` : ''}`)}
    ${r('fuel', 'Fuel & MPG', S.fuel.length ? `${S.fuel.length} fill-ups` : 'Track fill-ups and real mpg')}
    ${r('warranty', 'Warranty', 'Factory coverage and any extended plan')}
    ${r('reminders', 'Reminders & calendar', 'Add due dates to your phone’s calendar')}
    ${r('docs', 'Documents', 'Insurance card, paperwork, manual')}
  </div>
  <div class="card flush" style="margin-top:12px">
    ${r('car', 'Car details', `${esc(S.car.nickname || 'My Mazda3')}${S.car.vin ? ' · VIN saved' : ''}`)}
    ${r('backup', 'Backup & restore', lastB ? `Last backup ${fmtDays(daysBetween(today(), lastB))}` : 'No backup yet')}
    ${r('mileage', 'Mileage history', `${S.odometer.length} readings`)}
    ${r('about', 'About, privacy & sources', `Version ${APP_VERSION}`)}
  </div>`;
}

// ---------- car details / first-run setup ----------
function carForm(isSetup) {
  const c = S.car;
  return `${isSetup ? `<div class="topbar"><h1>Welcome</h1></div>
    <div class="card"><b>Set up your Mazda3</b><p class="small sub" style="margin-top:4px">This takes a minute. Everything you enter stays on this phone: no account, no server, no tracking. Back it up from More → Backup.</p></div>`
    : head('Car details', '#/more')}
  <form data-form="car" class="card" style="margin-top:12px">
    <input type="hidden" name="isSetup" value="${isSetup ? 1 : ''}">
    <label class="field" style="margin-top:0"><span>Nickname</span><input name="nickname" value="${esc(c.nickname || 'My Mazda3')}"></label>
    <label class="field"><span>VIN (optional)</span><input name="vin" value="${esc(c.vin || '')}" maxlength="17" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="17 characters">
      <span class="hint">On your registration, insurance card, or the lower corner of the windshield. Only stored on this phone.</span></label>
    <label class="field"><span>Original in-service date</span><input type="date" name="inServiceDate" value="${esc(c.inServiceDate || '')}" required max="${today()}">
      <span class="hint">When the car was first sold or put in use. Your history report calls it “Estimated In Service”. A Mazda dealer can give the exact warranty start date. Warranty and age-based items count from this date.</span></label>
    <div class="grid2">
      <label class="field"><span>Purchase date</span><input type="date" name="purchaseDate" value="${esc(c.purchaseDate || today())}" required max="${today()}"></label>
      <label class="field"><span>Miles at purchase</span><input type="number" name="purchaseMiles" inputmode="numeric" min="0" value="${esc(c.purchaseMiles ?? '')}" required></label>
    </div>
    ${isSetup ? `<label class="field"><span>Odometer today (if different)</span><input type="number" name="milesNow" inputmode="numeric" min="0" placeholder="Leave blank if you just bought it"></label>` : ''}
    <label class="field"><span>Miles you drive per month (estimate)</span><input type="number" name="milesPerMonth" inputmode="numeric" min="50" max="5000" value="${esc(c.milesPerMonth || 400)}">
      <span class="hint">Used until you’ve logged a month or more of mileage. After that the app uses your real driving.</span></label>
    <div class="field"><span>Maintenance schedule</span><div class="seg">
      <label><input type="radio" name="scheduleMode" value="normal" ${c.scheduleMode !== 'severe' ? 'checked' : ''}>Normal (recommended)</label>
      <label><input type="radio" name="scheduleMode" value="severe" ${c.scheduleMode === 'severe' ? 'checked' : ''}>Severe</label></div>
      <span class="hint">Short trips and highway driving around town count as Normal under Mazda’s US schedule. You can change this anytime on the Schedule tab.</span></div>
    <div class="field"><span>Service history before you</span><div class="seg">
      <label><input type="radio" name="historyKnown" value="" ${!c.historyKnown ? 'checked' : ''}>Unknown</label>
      <label><input type="radio" name="historyKnown" value="1" ${c.historyKnown ? 'checked' : ''}>I have all records</label></div>
      <span class="hint">Unknown: the app lists baseline jobs to do now. Have some receipts? Add them as past records in the Log.</span></div>
    <button class="btn primary big block" type="submit" style="margin-top:18px">${isSetup ? 'Start' : 'Save'}</button>
    ${!isSetup && c.vin ? `<button type="button" class="btn secondary block" style="margin-top:10px" data-act="decodeVin">Check VIN with NHTSA (needs internet)</button>` : ''}
  </form>
  ${isSetup ? `<p class="small sub" style="margin:14px 4px">Moving from another phone? <a href="#" data-act="importPick">Restore a backup file</a> instead.</p><input type="file" accept="application/json,.json" class="sr" id="importFile" data-change="importFile">` : ''}`;
}

// ---------- costs ----------
function hbars(entries, total) {
  const max = Math.max(...entries.map(e => e[1]), 1);
  return entries.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div class="track"><i style="width:${Math.max(2, (v / max) * 100)}%"></i></div><b class="tnum">${fmtMoney(v, false)}</b></div>`).join('');
}
function costs() {
  const c = costSummary(S.services, { purchaseMiles: +S.car.purchaseMiles || 0, currentMiles: S.latest?.miles || 0, fuel: S.fuel });
  const fuelByYear = {}; for (const f of S.fuel) fuelByYear[f.date.slice(0, 4)] = (fuelByYear[f.date.slice(0, 4)] || 0) + (+f.total || 0);
  const years = Object.keys(c.byYear).sort().reverse();
  const tile = (label, val, sub) => `<div class="count" style="text-align:left;padding:12px 14px"><span>${label}</span><b class="tnum" style="font-size:22px">${val}</b><span style="font-weight:400">${sub}</span></div>`;
  return `${head('Costs', '#/more')}
  <div class="counts" style="grid-template-columns:1fr 1fr;margin-top:0">
    ${tile('Maintenance & repairs', fmtMoney(c.total, false), 'all records')}
    ${tile('Cost per mile', c.perMile != null ? fmtMoney(c.perMile) : '–', `over ${fmtNum(c.driven)} mi since purchase`)}
    ${tile('Fuel', fmtMoney(c.fuelTotal, false), `${S.fuel.length} fill-ups`)}
    ${tile('All-in per mile', c.perMileWithFuel != null ? fmtMoney(c.perMileWithFuel) : '–', 'incl. fuel')}
  </div>
  <h2 class="section-title">By category</h2>
  <div class="card">${Object.keys(c.byCategory).length ? hbars(Object.entries(c.byCategory).sort((a, b) => b[1] - a[1])) : '<p class="sub small">Costs show up here once you log services with a price.</p>'}</div>
  <h2 class="section-title">By year</h2>
  <div class="card">${years.length ? years.map(y => {
    const fuel = fuelByYear[y] || 0, svc = c.byYear[y] - fuel;
    return `<div class="kv"><span><b style="color:var(--ink)">${y}</b></span><span class="tnum">${fmtMoney(c.byYear[y], false)}<br><span class="small sub" style="font-weight:400">${fmtMoney(svc, false)} service · ${fmtMoney(fuel, false)} fuel</span></span></div>`;
  }).join('') : '<p class="sub small">Nothing yet.</p>'}</div>
  <p class="small sub" style="margin-top:12px">Cost per mile = maintenance and repair costs ÷ miles driven since you bought the car. Past records from before you owned it are included in totals.</p>`;
}

// ---------- fuel ----------
function fuel() {
  const m = mpgLog(S.fuel);
  const mpgById = Object.fromEntries(m.entries.map(e => [e.id, e.mpg]));
  const list = sorted(S.fuel);
  const gal = S.fuel.reduce((a, f) => a + (+f.gallons || 0), 0), spent = S.fuel.reduce((a, f) => a + (+f.total || 0), 0);
  return `${head('Fuel & MPG', '#/more')}
  <div class="counts" style="margin-top:0">
    <div class="count"><b class="tnum">${m.average ? m.average.toFixed(1) : '–'}</b><span>avg mpg</span></div>
    <div class="count"><b class="tnum">${m.entries.length ? m.entries[m.entries.length - 1].mpg.toFixed(1) : '–'}</b><span>last mpg</span></div>
    <div class="count"><b class="tnum">${gal ? '$' + (spent / gal).toFixed(2) : '–'}</b><span>avg $/gal</span></div>
  </div>
  <button class="btn primary big block" style="margin:14px 0" data-act="addFuel">${icon.plus}Add fill-up</button>
  ${list.length ? `<div class="card flush">${list.map(f => `<button class="row" data-act="addFuel" data-id="${f.id}">
    <div class="main"><b>${fmtDate(f.date)} · ${fmtNum(f.miles)} mi</b><span>${(+f.gallons).toFixed(3)} gal · ${fmtMoney(f.total)}${f.gallons ? ` · $${(f.total / f.gallons).toFixed(2)}/gal` : ''}${f.full ? '' : ' · partial'}</span></div>
    <div class="end"><b class="tnum">${mpgById[f.id] ? mpgById[f.id].toFixed(1) : ''}</b>${mpgById[f.id] ? 'mpg' : ''}</div></button>`).join('')}</div>`
    : '<p class="sub small">Fill the tank all the way, log it, and from the next full fill-up you’ll see real mpg. EPA rating: 30 combined (verify on your window sticker).</p>'}
  <p class="small sub" style="margin-top:12px">MPG is worked out between full fill-ups. Fill-ups also update your mileage.</p>`;
}
function fuelForm(id) {
  const f = id ? S.fuel.find(x => x.id === id) : { date: today(), miles: S.latest?.miles || '', full: true };
  openSheet(`<form data-form="fuel">${sheetHead(id ? 'Edit fill-up' : 'Add fill-up')}
    <input type="hidden" name="id" value="${esc(id || '')}">
    <div class="grid2">
      <label class="field"><span>Date</span><input type="date" name="date" value="${esc(f.date)}" max="${today()}" required></label>
      <label class="field"><span>Odometer</span><input type="number" name="miles" inputmode="numeric" value="${esc(f.miles)}" required></label>
      <label class="field"><span>Gallons</span><input name="gallons" inputmode="decimal" value="${esc(f.gallons ?? '')}" required placeholder="e.g. 11.204"></label>
      <label class="field"><span>Total paid</span><div class="money"><input name="total" inputmode="decimal" value="${esc(f.total ?? '')}" placeholder="0.00"></div></label>
    </div>
    <label class="check" style="border:0;margin-top:8px"><input type="checkbox" name="full" ${f.full ? 'checked' : ''}><div><b>Filled the tank all the way</b><span>Needed for accurate mpg.</span></div></label>
    <div class="sheet-actions">${id ? `<button type="button" class="btn danger" data-act="delFuel" data-id="${id}">Delete</button>` : ''}<button class="btn primary big" type="submit">Save</button></div></form>`);
}

// ---------- warranty ----------
function wCard(w, note) {
  const pct = Math.round(w.used * 100);
  const state = w.notStarted ? '<span class="pill neutral">Not started</span>' : w.active ? (w.daysLeft < 90 || w.milesLeft < 3000 ? '<span class="pill soon">Ending soon</span>' : '<span class="pill ok">Active</span>') : '<span class="pill neutral">Expired</span>';
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><b>${esc(w.name)}</b>${state}</div>
    <div class="bar"><i class="${w.active ? (pct > 85 ? 'soon' : '') : 'overdue'}" style="width:${pct}%"></i></div>
    <div class="kv"><span>Ends</span><span>${fmtDate(w.endDate)} or ${fmtNum(w.endMiles)} mi</span></div>
    ${w.active ? `<div class="kv"><span>Left</span><span class="tnum">${fmtNum(w.milesLeft)} mi · ${fmtDays(w.daysLeft).replace('in ', '')}</span></div>
    <div class="kv"><span>At your pace, ends</span><span>${fmtDate(w.ends.date)} (${w.ends.by === 'miles' ? 'miles run out first' : 'time runs out first'})</span></div>` : ''}
    ${note ? `<p class="small sub" style="margin-top:6px">${note}</p>` : ''}</div>`;
}
function warranty() {
  const W = S.data.warranty;
  if (!S.car.inServiceDate) return `${head('Warranty', '#/more')}<div class="card">Add the original in-service date in <a href="#/more/car">Car details</a> first.</div>`;
  const base = { inServiceDate: S.car.inServiceDate, today: today(), latest: S.latest, rate: S.rate };
  const fac = W.items.filter(w => w.months).map(w => warrantyStatus(w, base));
  const basic = fac.find(w => w.id === 'basic');
  const cpo = S.kv.cpoConfirmed ? W.cpo.items.map(w => w.startsAfter ? warrantyStatus(w, { ...base, startOffset: { date: basic.endDate, miles: basic.endMiles } }) : warrantyStatus(w, base)) : [];
  const ext = S.warranties.map(w => ({ rec: w, st: warrantyStatus({ ...w, months: +w.months, miles: +w.miles }, { ...base, startOffset: { date: w.startDate, miles: +w.startMiles || 0 } }) }));
  return `${head('Warranty', '#/more')}
  <p class="small sub" style="margin:-4px 2px 12px">Factory coverage counts from the original in-service date (${fmtDate(S.car.inServiceDate)}), not your purchase date. Whichever limit comes first ends it.</p>
  <div class="stack">${fac.map(w => wCard(w, `${esc(w.note || '')} ${srcLink(w.src)}`)).join('')}
    ${W.items.filter(w => !w.months).map(w => `<div class="card"><b>${esc(w.name)}</b><p class="small sub" style="margin-top:4px">${esc(w.note)}</p><p class="small" style="margin-top:6px">${verifyPill()} ${srcLink(w.src, 'Warranty booklet')}</p></div>`).join('')}
  </div>
  <p class="small sub" style="margin:10px 4px">${esc(W.keepInMind)}</p>
  <h2 class="section-title">Mazda Certified Pre-Owned</h2>
  <div class="card"><p class="small">${esc(W.cpo._note)} ${srcLink(W.cpo.src)}</p>
    <label class="check" style="border:0;margin-top:6px"><input type="checkbox" data-change="cpo" ${S.kv.cpoConfirmed ? 'checked' : ''}><div><b>A Mazda dealer confirmed my car has CPO coverage</b><span>Shows the 7-year/100,000-mile powertrain and 12-month/12,000-mile coverage.</span></div></label></div>
  ${cpo.length ? `<div class="stack" style="margin-top:12px">${cpo.map(w => wCard(w, esc(w.note))).join('')}</div>` : ''}
  <h2 class="section-title">Extended warranties <a href="#" data-act="addWarranty">Add</a></h2>
  ${ext.length ? `<div class="stack">${ext.map(({ rec, st }) => wCard(st, `${esc(rec.provider || '')}${rec.phone ? ` · <a href="tel:${esc(rec.phone)}">${esc(rec.phone)}</a>` : ''}${rec.notes ? `<br>${esc(rec.notes)}` : ''}<br><a href="#" data-act="addWarranty" data-id="${rec.id}">Edit</a>`)).join('')}</div>` : '<p class="sub small">None added. If you bought a service contract (CarMax MaxCare or similar), add it here.</p>'}`;
}
function warrantyForm(id) {
  const w = id ? S.warranties.find(x => x.id === id) : { startDate: S.car.purchaseDate || today(), startMiles: S.car.purchaseMiles || '' };
  openSheet(`<form data-form="warranty">${sheetHead(id ? 'Edit warranty' : 'Add extended warranty')}
    <input type="hidden" name="id" value="${esc(id || '')}">
    <label class="field"><span>Name</span><input name="name" value="${esc(w.name || '')}" required placeholder="e.g. MaxCare"></label>
    <div class="grid2">
      <label class="field"><span>Provider</span><input name="provider" value="${esc(w.provider || '')}"></label>
      <label class="field"><span>Claims phone</span><input name="phone" type="tel" value="${esc(w.phone || '')}"></label>
      <label class="field"><span>Starts</span><input type="date" name="startDate" value="${esc(w.startDate)}" required></label>
      <label class="field"><span>Miles at start</span><input type="number" name="startMiles" inputmode="numeric" value="${esc(w.startMiles)}"></label>
      <label class="field"><span>Length (months)</span><input type="number" name="months" inputmode="numeric" value="${esc(w.months || '')}" required></label>
      <label class="field"><span>Miles covered</span><input type="number" name="miles" inputmode="numeric" value="${esc(w.miles || '')}" required></label>
    </div>
    <label class="field"><span>Notes (deductible, what’s covered)</span><textarea name="notes">${esc(w.notes || '')}</textarea></label>
    <div class="sheet-actions">${id ? `<button type="button" class="btn danger" data-act="delWarranty" data-id="${id}">Delete</button>` : ''}<button class="btn primary big" type="submit">Save</button></div></form>`);
}

// ---------- reminders ----------
function reminderEvents() {
  const ev = [];
  for (const s of S.statuses) {
    if (s.status === 'ok' && s.effectiveDays > 548) continue;
    const date = s.status === 'baseline' || s.status === 'overdue' ? isoDate(addDays(today(), 2)) : s.effectiveDate;
    if (!date) continue;
    ev.push({ uid: `${s.id}-${date}`, date, title: `Mazda3: ${s.name}${s.status === 'baseline' ? ' (baseline)' : ''}`,
      description: s.status === 'baseline' ? 'Service history unknown, so do it now to set a starting point.' : `Due ${s.dueDate ? fmtDate(s.dueDate) : ''}${s.dueMiles ? ` or ${fmtNum(s.dueMiles)} mi` : ''}, whichever comes first. Check the odometer before going.` });
  }
  if (S.car.inServiceDate) {
    for (const w of S.data.warranty.items.filter(w => w.months && w.id !== 'roadside')) {
      const st = warrantyStatus(w, { inServiceDate: S.car.inServiceDate, today: today(), latest: S.latest, rate: S.rate });
      if (!st.active) continue;
      const d = isoDate(addDays(st.ends.date, -45));
      if (d > today()) ev.push({ uid: `warranty-${w.id}`, date: d, title: `Mazda3: ${w.name.split('(')[0].trim()} ends in about 6 weeks`, description: 'Get any problems looked at under warranty before it ends.' });
    }
  }
  return ev.sort((a, b) => a.date.localeCompare(b.date));
}
function reminders() {
  const ev = reminderEvents();
  return `${head('Reminders & calendar', '#/more')}
  <div class="card"><p class="small">The app shows due items whenever you open it. To get reminders even when it’s closed or you’re offline, add them to your phone’s calendar. Each event alerts you a week before and the evening before.</p>
    <button class="btn primary big block" style="margin-top:12px" data-act="icsAll">${icon.cal}Add all ${ev.length} to calendar (.ics)</button>
    <p class="small sub" style="margin-top:8px">Opens in Samsung Calendar, Outlook, and most calendar apps. Google Calendar on Android can’t open .ics files, so use the “Google” links below (needs internet once).</p></div>
  <h2 class="section-title">Upcoming</h2>
  <div class="card flush">${ev.map((e, i) => `<div class="row"><div class="main"><b>${esc(e.title.replace('Mazda3: ', ''))}</b><span>${fmtDate(e.date)}</span></div>
    <button class="btn small ghost" data-act="icsOne" data-i="${i}">.ics</button><a class="btn small ghost" href="${esc(googleCalLink(e))}" target="_blank" rel="noopener">Google</a></div>`).join('')}</div>
  <p class="small sub" style="margin-top:12px">Dates move as you drive more or less. Re-add reminders after big changes (for example, after each service).</p>`;
}

// ---------- documents ----------
function docs() {
  return `${head('Documents', '#/more')}
  <p class="small sub" style="margin:-4px 2px 12px">Keep copies on your phone for offline access. Photos are shrunk to save space; PDFs are stored as-is. They’re included in backups.</p>
  <button class="btn primary big block" data-act="addDoc">${icon.plus}Add document</button>
  ${S.docs.length ? `<div class="card flush" style="margin-top:12px">${sorted(S.docs, 'createdAt').map(d => `<div class="row"><div class="main"><b>${esc(d.name)}</b><span>${esc(d.kind)} · ${Math.max(1, Math.round(d.size / 1024))} KB</span></div>
    <button class="btn small ghost" data-act="openDoc" data-id="${d.id}">Open</button><button class="btn small ghost" data-act="delDoc" data-id="${d.id}" aria-label="Delete ${esc(d.name)}">Delete</button></div>`).join('')}</div>` : ''}
  <p class="small sub" style="margin-top:12px"><span id="storageEst"></span> Mazda’s manual PDF is at ${srcLink('man-pdf', 'mazdausa.com')}.</p>`;
}
function docForm() {
  openSheet(`<form data-form="doc">${sheetHead('Add document')}
    <label class="field"><span>Name</span><input name="name" required placeholder="e.g. Insurance card 2026"></label>
    <label class="field"><span>Type</span><select name="kind">${DOC_KINDS.map(k => `<option>${k}</option>`).join('')}</select></label>
    <label class="field"><span>File (photo or PDF)</span><input type="file" name="file" accept="image/*,application/pdf" required></label>
    <div class="sheet-actions"><button class="btn primary big" type="submit">Save</button></div></form>`);
}

// ---------- backup ----------
function backup() {
  const lastB = S.kv.lastBackupAt;
  return `${head('Backup & restore', '#/more')}
  <div class="card"><b>${lastB ? `Last backup: ${fmtDate(lastB)}` : 'No backup yet'}</b>
    <p class="small sub" style="margin-top:4px">Your records only live on this phone. Save a backup file to Google Drive or email it to yourself every month or so, and after big changes.</p>
    <button class="btn primary big block" style="margin-top:12px" data-act="exportJson">${icon.down}Save backup file</button>
    <button class="btn secondary block" style="margin-top:10px" data-act="importPick">${icon.up}Restore from backup file</button>
    <input type="file" accept="application/json,.json" class="sr" id="importFile" data-change="importFile">
  </div>
  <div class="card" style="margin-top:12px"><b>Service history spreadsheet</b>
    <p class="small sub" style="margin-top:4px">A CSV file (opens in Sheets or Excel). Handy to show a buyer when you sell the car.</p>
    <button class="btn secondary block" style="margin-top:10px" data-act="exportCsv">Export service history (CSV)</button></div>
  <div class="card" style="margin-top:12px"><b>Storage</b><p class="small sub" style="margin-top:4px" id="persistInfo">Checking…</p>
    <button class="btn ghost" data-act="askPersist">Ask the phone to keep my data</button></div>
  <div class="card" style="margin-top:12px"><b>Erase everything</b><p class="small sub" style="margin-top:4px">Deletes all records, photos, and settings from this phone. Save a backup first.</p>
    <button class="btn danger block" style="margin-top:10px" data-act="eraseAll">Erase all data</button></div>`;
}

// ---------- mileage ----------
function mileage() {
  const list = sorted(S.odometer);
  return `${head('Mileage history', '#/more')}
  <p class="small sub" style="margin:-4px 2px 12px">Your pace: ${fmtNum(S.rate * 30.4375)} mi/month (${S.rateSource === 'measured' ? 'measured from the last 6 months' : 'your estimate'}). Service and fuel records count as readings too.</p>
  <button class="btn primary big block" data-act="updateMiles">${icon.gauge}Update miles</button>
  ${list.length ? `<div class="card flush" style="margin-top:12px">${list.map(o => `<div class="row"><div class="main"><b class="tnum">${fmtNum(o.miles)} mi</b><span>${fmtDate(o.date)}</span></div><button class="btn small ghost" data-act="delReading" data-id="${o.id}">Delete</button></div>`).join('')}</div>` : ''}`;
}

// ---------- about ----------
function about() {
  const theme = (() => { try { return localStorage.getItem('theme') || 'auto'; } catch (e) { return 'auto'; } })();
  return `${head('About', '#/more')}
  <div class="card"><b>Mazda3 Care ${APP_VERSION}</b><p class="small" style="margin-top:4px">A personal maintenance tracker and offline guide for a 2025 Mazda3 Hatchback 2.5 S. Not made by or affiliated with Mazda.</p></div>
  <h2 class="section-title">Appearance</h2>
  <div class="seg">${['auto', 'light', 'dark'].map(t => `<button data-act="theme" data-t="${t}" aria-pressed="${theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
  <h2 class="section-title">Privacy</h2>
  <div class="card small">No account, no server, no analytics, no ads. Records, photos, and your VIN are stored only in this browser on this phone. The app only goes online when you tap a button that says it needs internet (recall check, VIN check, Google Calendar), and those send nothing about you except the VIN check, which sends your VIN to NHTSA.</div>
  <h2 class="section-title">Where the facts come from</h2>
  <div class="card flush">${Object.entries(S.data.sources).map(([k, s]) => `<a class="row" href="${esc(s.url)}" target="_blank" rel="noopener"><div class="main"><b style="font-weight:600;font-size:15px">${esc(s.title)}</b></div></a>`).join('')}</div>
  <p class="small sub" style="margin-top:12px">Car data researched ${fmtDate(S.data.researchedOn)}. Items marked “Verify in owner’s manual” couldn’t be confirmed from Mazda’s documents.</p>`;
}

export default {
  render(param = '') {
    const views = { costs, fuel, warranty, reminders, docs, backup, mileage, about };
    if (param === 'setup') return carForm(true);
    if (param === 'car') return carForm(false);
    return views[param]?.() ?? menu();
  },
  async after(root, param) {
    if (param === 'backup') {
      const el = document.getElementById('persistInfo');
      const p = await navigator.storage?.persisted?.();
      const est = await navigator.storage?.estimate?.();
      if (el) el.textContent = `${p ? 'Protected: the phone won’t clear this data to free space.' : 'Not protected yet. The phone may clear it if storage runs very low (rare). Installing the app to your home screen usually fixes this.'}${est ? ` Using ${(est.usage / 1048576).toFixed(1)} MB.` : ''}`;
    }
    if (param === 'docs') {
      const est = await navigator.storage?.estimate?.();
      const el = document.getElementById('storageEst');
      if (el && est) el.textContent = `Using ${(est.usage / 1048576).toFixed(1)} MB of storage.`;
    }
  },
  actions: {
    addFuel: el => fuelForm(el.dataset.id),
    delFuel: async el => { if (!confirm('Delete this fill-up?')) return; await deleteRecord('fuel', el.dataset.id); closeSheet(); render(); },
    addWarranty: el => warrantyForm(el.dataset.id),
    delWarranty: async el => { if (!confirm('Delete this warranty?')) return; await deleteRecord('warranties', el.dataset.id); closeSheet(); render(); },
    addDoc: () => docForm(),
    openDoc: async el => {
      const d = S.docs.find(x => x.id === el.dataset.id);
      const f = d && await db.get('files', d.fileId);
      if (!f) throw new Error('File not found.');
      const r = await shareOrDownload(f.name, f.blob, d.name);
      if (r === 'downloaded') toast('Saved to Downloads.');
    },
    delDoc: async el => {
      const d = S.docs.find(x => x.id === el.dataset.id);
      if (!d || !confirm(`Delete “${d.name}”?`)) return;
      await deleteRecord('files', d.fileId); await deleteRecord('docs', d.id); render();
    },
    delReading: async el => { if (!confirm('Delete this reading?')) return; await deleteRecord('odometer', el.dataset.id); render(); },
    icsAll: () => { download('mazda3-reminders.ics', new Blob([buildIcs(reminderEvents())], { type: 'text/calendar' })); toast('Calendar file saved. Open it to add the events.'); },
    icsOne: el => { const e = reminderEvents()[+el.dataset.i]; download('mazda3-reminder.ics', new Blob([buildIcs([e])], { type: 'text/calendar' })); },
    exportJson: async () => {
      const data = await db.exportAll();
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const r = await shareOrDownload(`mazda3-care-backup-${today()}.json`, blob, 'Mazda3 Care backup');
      if (r === 'cancelled') return;
      await setKv('lastBackupAt', today());
      toast(r === 'shared' ? 'Backup shared.' : 'Backup saved to Downloads.');
      render();
    },
    exportCsv: () => {
      const rows = [['Date', 'Odometer (mi)', 'Work done', 'Schedule items', 'Type', 'Where', 'Shop', 'Cost (USD)', 'Category', 'Parts', 'Notes', 'Past record']];
      for (const s of [...S.services].sort((a, b) => a.date.localeCompare(b.date))) {
        rows.push([s.date, s.miles, s.title, (s.itemIds || []).map(i => S.data.schedule.items.find(x => x.id === i)?.name).join('; '), s.kind, s.where, s.shopName, s.cost || '', s.category,
          (s.parts || []).map(p => [p.name, p.partNo && `#${p.partNo}`, p.cost && `$${p.cost}`].filter(Boolean).join(' ')).join('; '), s.notes, s.isPastRecord ? 'yes' : '']);
      }
      download(`mazda3-service-history-${today()}.csv`, new Blob([toCsv(rows)], { type: 'text/csv' }));
      toast('Service history saved to Downloads.');
    },
    importPick: () => document.getElementById('importFile').click(),
    askPersist: async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Done: your data is protected.' : 'The phone said no for now. Install the app to the home screen, then try again.'); render(); },
    eraseAll: async () => {
      if (!confirm('Erase ALL data from this phone? Records, photos, and settings will be gone.')) return;
      if (!confirm('Last check: did you save a backup? Erase now?')) return;
      await db.clearAll(); await loadAll(); location.hash = '#/more/setup'; render(); toast('All data erased.');
    },
    decodeVin: async () => {
      if (!navigator.onLine) throw new Error('You’re offline.');
      toast('Asking NHTSA…');
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(S.car.vin)}?format=json`);
      const r = (await res.json()).Results?.[0] || {};
      const ok = r.ModelYear === '2025' && /mazda3/i.test(r.Model || '');
      openSheet(`<div class="sheet-body">${sheetHead('VIN check (NHTSA)')}
        <div class="banner ${ok ? 'info' : 'bad'}"><div><b>${ok ? 'Matches a 2025 Mazda3' : 'Doesn’t look like a 2025 Mazda3'}</b><span class="small">${ok ? 'The app’s data fits your car.' : 'Check the VIN you typed.'}</span></div></div>
        <div class="card" style="margin-top:12px">${[['Year', r.ModelYear], ['Make / model', `${r.Make || ''} ${r.Model || ''}`], ['Body', r.BodyClass], ['Engine', `${r.DisplacementL || ''} L, ${r.EngineHP || '?'} hp ${r.EngineModel || ''}`], ['Drive', r.DriveType], ['Built in', [r.PlantCity, r.PlantCountry].filter(Boolean).join(', ')]]
          .map(([k, v]) => `<div class="kv"><span>${k}</span><span>${esc(v || '–')}</span></div>`).join('')}</div></div>`);
    },
    theme: el => {
      const t = el.dataset.t;
      try { t === 'auto' ? localStorage.removeItem('theme') : localStorage.setItem('theme', t); } catch (e) {}
      if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
      render();
    },
  },
  changes: {
    cpo: async el => { await setKv('cpoConfirmed', el.checked); render(); },
    importFile: async el => {
      const f = el.files?.[0];
      if (!f) return;
      let json;
      try { json = JSON.parse(await f.text()); } catch (e) { throw new Error('That file isn’t a valid backup.'); }
      const n = json?.data?.services?.length ?? 0;
      if (!confirm(`Restore this backup from ${json.exportedAt ? fmtDate(json.exportedAt.slice(0, 10)) : 'an unknown date'} (${n} service records)? It replaces everything currently in the app.`)) { el.value = ''; return; }
      await db.importAll(json);
      await loadAll();
      el.value = '';
      toast('Backup restored.');
      location.hash = '#/home';
      render();
    },
  },
  forms: {
    async car(fd) {
      const vin = (fd.get('vin') || '').trim().toUpperCase();
      if (vin && !VIN_RE.test(vin)) throw new Error('A VIN has 17 letters and numbers (no I, O or Q). Check it, or leave it blank.');
      const isSetup = !!fd.get('isSetup');
      const purchaseMiles = Math.round(+fd.get('purchaseMiles'));
      if (!fd.get('inServiceDate')) throw new Error('Add the in-service date (from your history report).');
      if (!(purchaseMiles >= 0) || fd.get('purchaseMiles') === '') throw new Error('Add the miles at purchase.');
      await saveCar({
        nickname: (fd.get('nickname') || '').trim() || 'My Mazda3', vin,
        inServiceDate: fd.get('inServiceDate'), purchaseDate: fd.get('purchaseDate'), purchaseMiles,
        milesPerMonth: Math.round(+fd.get('milesPerMonth')) || 400,
        scheduleMode: fd.get('scheduleMode') || 'normal', historyKnown: fd.get('historyKnown') === '1',
      });
      const now = Math.round(+fd.get('milesNow'));
      if (isSetup && now > purchaseMiles) await saveRecord('odometer', { date: today(), miles: now, source: 'manual' });
      if (isSetup) {
        await setKv('setupDone', true);
        navigator.storage?.persist?.().catch(() => {});
        location.hash = '#/home';
        toast('All set. Start with the baseline list.');
      } else toast('Saved.');
      render();
    },
    async fuel(fd) {
      const miles = Math.round(+fd.get('miles')), gallons = +String(fd.get('gallons')).replace(/[^0-9.]/g, '');
      if (!(miles > 0) || !(gallons > 0)) throw new Error('Enter the odometer and gallons.');
      const id = fd.get('id');
      await saveRecord('fuel', { ...(id ? S.fuel.find(f => f.id === id) : {}), id: id || undefined, date: fd.get('date'), miles, gallons,
        total: +String(fd.get('total') || 0).replace(/[^0-9.]/g, ''), full: fd.get('full') === 'on' });
      closeSheet(); toast('Fill-up saved.'); render();
    },
    async warranty(fd) {
      const id = fd.get('id');
      await saveRecord('warranties', { ...(id ? S.warranties.find(w => w.id === id) : {}), id: id || undefined,
        name: fd.get('name').trim(), provider: fd.get('provider').trim(), phone: fd.get('phone').trim(), startDate: fd.get('startDate'),
        startMiles: Math.round(+fd.get('startMiles')) || 0, months: Math.round(+fd.get('months')), miles: Math.round(+fd.get('miles')), notes: fd.get('notes').trim() });
      closeSheet(); toast('Warranty saved.'); render();
    },
    async doc(fd) {
      const file = fd.get('file');
      if (!file || !file.size) throw new Error('Pick a file.');
      let blob = file, mime = file.type || 'application/octet-stream', name = file.name;
      if (mime.startsWith('image/')) { blob = await compressImage(file, 2000, 0.8); mime = 'image/jpeg'; name = name.replace(/\.\w+$/, '') + '.jpg'; }
      const f = await db.put('files', { mime, size: blob.size, name, blob });
      await saveRecord('docs', { name: fd.get('name').trim(), kind: fd.get('kind'), fileId: f.id, size: blob.size });
      closeSheet(); toast('Document saved.'); render();
    },
  },
};
