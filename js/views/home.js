import { S, setKv } from '../state.js';
import { esc, fmtNum, fmtDate, fmtDays, icon, today } from '../util.js';
import { statusPill, leftText, dueText, gauge, srcLink } from '../ui.js';
import { daysBetween, warrantyStatus } from '../schedule.js';
import { render } from '../app.js';

function banners() {
  const out = [];
  if (S.updateReady) out.push(`<div class="banner info"><div><b>Update ready</b><span class="small">A new version of the app is downloaded.</span></div><button class="btn primary small" data-act="applyUpdate">Reload</button></div>`);
  const hasData = S.services.length + S.odometer.length + S.fuel.length > 0;
  const lastB = S.kv.lastBackupAt;
  if (hasData && (!lastB || daysBetween(lastB, today()) > 30)) {
    out.push(`<div class="banner warn"><div><b>Back up your data</b><span class="small">${lastB ? `Last backup ${fmtDays(daysBetween(today(), lastB))}.` : 'You haven’t made a backup yet.'} It only lives on this phone.</span></div><a class="btn small" href="#/more/backup">Back up</a></div>`);
  }
  if (S.latest && daysBetween(S.latest.date, today()) > 30) {
    out.push(`<div class="banner info"><div><b>Mileage is ${fmtDays(daysBetween(today(), S.latest.date)).replace(' ago', '')} old</b><span class="small">Update it so the due dates stay accurate.</span></div><button class="btn small" data-act="updateMiles">Update</button></div>`);
  }
  return out.join('');
}

function startHere() {
  if (S.kv.baselineHidden) return '';
  const base = S.statuses.filter(s => s.status === 'baseline');
  const checks = S.kv.baselineChecks || {};
  const extras = S.data.baselineExtras;
  const open = extras.filter(x => !checks[x.id]).length;
  if (!base.length && !open) return '';
  return `<h2 class="section-title">Start here: your baseline <a href="#" data-act="hideBaseline">Hide</a></h2>
  <div class="card">
    <p class="small sub" style="margin-bottom:6px">Your service history is unknown, so do these once. After that, the schedule counts from what you log.</p>
    ${base.map(s => `<div class="check"><input type="checkbox" disabled aria-label="${esc(s.name)} not logged yet"><div style="flex:1"><b>${esc(s.name)}</b><span>Log it when it’s done and this clears.</span></div><button class="btn small secondary" data-act="logService" data-items="${s.id}">Log</button></div>`).join('')}
    ${extras.map(x => `<label class="check ${checks[x.id] ? 'done' : ''}"><input type="checkbox" data-change="baselineCheck" value="${x.id}" ${checks[x.id] ? 'checked' : ''}><div><b>${esc(x.title)}</b><span>${esc(x.detail)} ${x.src ? srcLink(x.src) : ''}</span></div></label>`).join('')}
  </div>`;
}

function warrantyLine() {
  if (!S.car.inServiceDate) return '';
  const w = S.data.warranty.items.filter(w => w.months && w.miles).map(w => warrantyStatus(w, { inServiceDate: S.car.inServiceDate, today: today(), latest: S.latest, rate: S.rate }));
  const active = w.filter(x => x.active);
  if (!active.length) return '';
  const x = active[0];
  return `<a class="card row" href="#/more/warranty" style="margin-top:12px;padding:12px 16px">
    <div class="main"><b>${esc(x.name.split('(')[0].trim())}</b><span>Ends ${fmtDate(x.ends.date)} (${x.ends.by === 'miles' ? `at ${fmtNum(x.endMiles)} mi` : 'by date'})</span></div>${icon.chev}</a>`;
}

export default {
  render() {
    const st = S.statuses;
    const oil = st.find(s => s.id === 'oil');
    const doNow = st.filter(s => s.status === 'overdue' || s.status === 'baseline').length;
    const soon = st.filter(s => s.status === 'soon').length;
    const ok = st.filter(s => s.status === 'ok').length;
    const next = st.slice(0, 3);
    const upd = S.latest ? (S.latest.date === today() ? 'Updated today' : `Updated ${fmtDays(daysBetween(today(), S.latest.date))}`) : 'No reading yet';
    const pace = `${S.rateSource === 'measured' ? '' : '~'}${fmtNum(S.rate * 30.4375)} mi/mo`;
    return `
    ${banners() ? `<div class="stack" style="margin-bottom:12px">${banners()}</div>` : ''}
    <div class="card cluster">
      ${gauge(oil)}
      <div style="min-width:0">
        <div class="lbl">${esc(S.car.nickname || 'My Mazda3')}</div>
        <div class="odo tnum">${fmtNum(S.latest?.miles ?? 0)} <small>mi</small></div>
        <div class="small sub">${upd} · ${pace}</div>
      </div>
    </div>
    <div class="counts">
      <a class="count ${doNow ? 'r' : 'g'}" href="#/schedule"><b class="tnum">${doNow}</b><span>Do now</span></a>
      <a class="count ${soon ? 'a' : 'g'}" href="#/schedule"><b class="tnum">${soon}</b><span>Soon</span></a>
      <a class="count g" href="#/schedule"><b class="tnum">${ok}</b><span>OK</span></a>
    </div>
    <div class="btns">
      <button class="btn primary big" data-act="logService">${icon.plus}Log service</button>
      <button class="btn secondary big" data-act="updateMiles">${icon.gauge}Update miles</button>
    </div>
    ${startHere()}
    <h2 class="section-title">Next up <a href="#/schedule">See all</a></h2>
    <div class="card next">
      ${next.map(s => `<a class="item" href="#/schedule/${s.id}">
        <div class="top"><b>${esc(s.name)}</b>${s.status === 'ok' ? `<span class="small sub">${esc(leftText(s))}</span>` : statusPill(s)}</div>
        <div class="bar"><i class="${s.status}" style="width:${Math.min(100, Math.round((s.status === 'baseline' ? 1 : s.used) * 100))}%"></i></div>
        <small>${esc(dueText(s))}</small></a>`).join('')}
    </div>
    ${warrantyLine()}
    <p class="small sub" style="margin:16px 4px 0">Due dates use Mazda’s ${S.ctx.mode === 'severe' ? 'severe' : 'normal'} schedule. Your car’s wrench light can ask for oil sooner: always follow it.</p>`;
  },
  actions: {
    hideBaseline: async () => { await setKv('baselineHidden', true); render(); },
  },
  changes: {
    baselineCheck: async el => {
      const c = { ...(S.kv.baselineChecks || {}) };
      if (el.checked) c[el.value] = today(); else delete c[el.value];
      await setKv('baselineChecks', c);
      render();
    },
  },
};
