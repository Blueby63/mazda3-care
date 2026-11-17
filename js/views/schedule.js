import { S, saveCar } from '../state.js';
import { esc, fmtNum, fmtDate, fmtMonth, icon } from '../util.js';
import { head, statusPill, leftText, dueText, intervalText, srcLink } from '../ui.js';
import { forecast } from '../schedule.js';
import { render } from '../app.js';

let tab = 'status';

function modeCard() {
  const sch = S.data.schedule, mode = S.ctx.mode;
  return `<div class="card">
    <div class="seg" role="radiogroup" aria-label="Schedule type">
      <label><input type="radio" name="mode" value="normal" data-change="mode" ${mode === 'normal' ? 'checked' : ''}>Normal</label>
      <label><input type="radio" name="mode" value="severe" data-change="mode" ${mode === 'severe' ? 'checked' : ''}>Severe</label>
    </div>
    <p class="small" style="margin-top:10px">${esc(sch.modes[mode].label)}</p>
    <details class="more" style="margin-top:10px"><summary>Which one fits me?</summary>
      <p class="small"><b>Recommended for you: Normal.</b> ${esc(sch.recommendation)}</p>
      <p class="small" style="margin-top:8px">Mazda says use Severe if your car is mainly:</p>
      <ul class="small steps">${sch.severeConditions.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <p class="small" style="margin-top:6px">If you pick Severe, also switch the car’s own reminder to manual (the manual explains how). ${srcLink(sch.src)}</p>
    </details>
  </div>`;
}

function statusList() {
  return `<div class="card flush">${S.statuses.map(s => `<a class="row" href="#/schedule/${s.id}">
    <div class="main"><b>${esc(s.name)}</b><span>${esc(dueText(s))}</span></div>
    <div class="end">${s.status === 'ok' ? `<b class="tnum" style="font-size:14px;color:var(--sub)">${esc(leftText(s))}</b>` : statusPill(s)}</div>${icon.chev}</a>`).join('')}</div>
    <p class="small sub" style="margin:10px 4px">Source: ${srcLink(S.data.schedule.src, "Mazda’s 2025 Mazda3 maintenance schedule")}. Mazda counts “maintenance visits” that come when the wrench light comes on, at most every 10,000 miles or 12 months. Miles and dates here are those limits.</p>`;
}

function timeline() {
  const groups = forecast(S.data.schedule.items, S.ctx, { years: 6 });
  const pace = `${fmtNum(S.rate * 30.4375)} miles a month (${S.rateSource === 'measured' ? 'from your readings' : 'your estimate, until you log more mileage'})`;
  return `<p class="small sub" style="margin:0 4px 12px">Projected from ${pace}. Each date is whichever comes first, miles or time.</p>
  <div class="card"><div class="tl">${groups.map(g => `<div class="ev ${g.key === 'now' ? 'now' : ''}">
    <b>${g.key === 'now' ? 'Now: baseline / overdue' : `${fmtMonth(g.date)} · about ${fmtNum(Math.round(g.miles / 100) * 100)} mi`}</b>
    <span>${g.items.map(i => esc(i.name)).join(' · ')}</span></div>`).join('')}</div></div>`;
}

function detail(id) {
  const s = S.statuses.find(x => x.id === id);
  if (!s) return `${head('Not found', '#/schedule')}`;
  const it = s.item;
  const history = S.services.filter(r => r.itemIds?.includes(id)).sort((a, b) => b.date.localeCompare(a.date));
  return `${head(s.name, '#/schedule')}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">${statusPill(s)}<span class="small sub">${esc(it.action)}</span></div>
    <p style="margin-top:10px;font-weight:600">${esc(dueText(s))}</p>
    ${s.status !== 'baseline' && s.dueMiles ? `<div class="bar"><i class="${s.status}" style="width:${Math.min(100, Math.round(s.used * 100))}%"></i></div>` : ''}
    <div class="kv" style="margin-top:6px"><span>How often</span><span>${esc(intervalText(s))}</span></div>
    <div class="kv"><span>Last done</span><span>${s.last ? `${fmtDate(s.last.date)} · ${fmtNum(s.last.miles)} mi` : s.fromNew && !S.car.historyKnown ? 'Unknown' : 'Counting from new'}</span></div>
    ${s.dueMiles ? `<div class="kv"><span>Miles left</span><span class="tnum">${fmtNum(s.milesLeft)}</span></div>` : ''}
    ${it.note ? `<p class="small sub" style="margin-top:8px">${esc(it.note)}</p>` : ''}
    ${it.includes ? `<p class="small" style="margin-top:10px"><b>What’s included:</b></p><ul class="steps small">${it.includes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <p class="small" style="margin-top:8px">${srcLink(S.data.schedule.src, "Mazda schedule")}</p>
  </div>
  <button class="btn primary big block" style="margin-top:12px" data-act="logService" data-items="${id}">${icon.plus}Log this</button>
  <h2 class="section-title">History</h2>
  ${history.length ? `<div class="card flush">${history.map(r => `<a class="row" href="#/log/${r.id}"><div class="main"><b>${esc(r.title)}</b><span>${fmtDate(r.date)} · ${fmtNum(r.miles)} mi</span></div>${icon.chev}</a>`).join('')}</div>` : '<p class="sub small">Nothing logged yet.</p>'}`;
}

export default {
  render(param) {
    if (param) return detail(param);
    return `${head('Schedule')}
      ${modeCard()}
      <div class="seg" style="margin:14px 0" role="tablist">
        <button data-act="schedTab" data-tab="status" aria-pressed="${tab === 'status'}">Status</button>
        <button data-act="schedTab" data-tab="timeline" aria-pressed="${tab === 'timeline'}">Timeline</button>
      </div>
      ${tab === 'status' ? statusList() : timeline()}`;
  },
  actions: { schedTab: el => { tab = el.dataset.tab; render(); } },
  changes: { mode: async el => { await saveCar({ scheduleMode: el.value }); render(); } },
};
