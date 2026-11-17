import { S, setKv } from '../state.js';
import { esc, fmtNum, fmtDate, icon, today } from '../util.js';
import { head, statusPill, dueText, srcLink, srcOrVerify, verifyPill, toast } from '../ui.js';
import { render } from '../app.js';

const LEVEL = { stop: 'Pull over now', soon: 'Book service soon', info: 'Easy fix / reminder' };

function index() {
  const t = (href, ic, title, sub) => `<a class="tile" href="#/guide/${href}">${ic}<b>${title}</b><span>${sub}</span></a>`;
  return `${head('Car guide')}
  <p class="small sub" style="margin:-4px 2px 12px">Everything here works offline. Facts come from Mazda’s 2025 Mazda3 owner’s manual and NHTSA, with a source link on each.</p>
  <div class="tiles">
    ${t('shop', icon.tag, 'Before the shop', 'What’s actually due vs. upsells')}
    ${t('lights', icon.alert, 'Warning lights', 'Pull over, or just book service?')}
    ${t('specs', icon.spec, 'Specs', 'Oil, fluids, tires, battery, parts')}
    ${t('howto', icon.wrench, 'How-tos', 'Resets and easy DIY jobs')}
    ${t('know', icon.car, 'Know your car', 'Main systems in plain English')}
    ${t('recalls', icon.shield, 'Recalls & issues', 'Known recalls, check for new ones')}
  </div>`;
}

function shop() {
  const need = S.statuses.filter(s => s.status !== 'ok');
  const later = S.statuses.filter(s => s.status === 'ok');
  return `${head('Before the shop', '#/guide')}
  <p class="small sub" style="margin:-4px 2px 12px">Show this to the service advisor. Mazda doesn’t require you to use a dealer. Any shop is fine, just keep the receipts.</p>
  <h2 class="section-title">Mazda requires now</h2>
  ${need.length ? `<div class="card">${need.map(s => `<div class="kv" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(s.name)}</b>${statusPill(s)}</div>
     ${s.item.includes ? `<span class="small sub" style="display:block;font-weight:400;text-align:left">${s.item.includes.map(esc).join(', ')}</span>` : ''}</div>`).join('')}</div>`
    : '<div class="card"><b>Nothing is due right now.</b><p class="small sub">If a shop says something is due, check it against the list below first.</p></div>'}
  <h2 class="section-title">Not due yet (say “not today”)</h2>
  <div class="card">${later.map(s => `<div class="kv"><span>${esc(s.name)}</span><span class="small">${esc(dueText(s).replace(', whichever comes first', ''))}</span></div>`).join('')}</div>
  <h2 class="section-title">Common upsells that aren’t on Mazda’s schedule</h2>
  <div class="card">${S.data.schedule.notInSchedule.map(n => `<div class="kv" style="display:block"><b>${esc(n.name)}</b><span class="small sub" style="display:block;font-weight:400;text-align:left">${esc(n.fact)} ${srcLink(n.src)}</span></div>`).join('')}</div>
  <div class="card" style="margin-top:12px"><b>Good habits</b><ul class="steps small">
    <li>Ask “Is that on Mazda’s schedule for my mileage?” before saying yes.</li>
    <li>For wear items (brakes, tires, wipers, filters), ask them to show you the measurement or the old part.</li>
    <li>Get a written quote first. You can always say “I’ll think about it.”</li>
    <li>After an oil change, check they reset the oil reminder.</li>
  </ul></div>
  <button class="btn secondary big block" style="margin-top:12px" data-act="shareShop">Share or copy this list</button>`;
}

function lights() {
  const wl = S.data.warningLights;
  const groups = ['stop', 'soon', 'info'];
  return `${head('Warning lights', '#/guide')}
  <input class="search" type="search" placeholder="Search (e.g. oil, tire, brake)" data-input="lightSearch" aria-label="Search warning lights">
  <div class="legend"><span class="pill stop">Red: pull over now</span><span class="pill soon">Amber: book service</span><span class="pill info">Green: easy fix</span></div>
  ${groups.map(g => `<h2 class="section-title" data-group="${g}">${LEVEL[g]}</h2>
    <div class="card flush" data-group="${g}">${wl.items.filter(i => i.level === g).map(i => `<div class="light" data-search="${esc((i.name + ' ' + i.means).toLowerCase())}">
      <div class="lv ${g}"></div><div><b>${esc(i.name)}</b><p class="sub">${esc(i.means)}</p><p><b style="display:inline">What to do:</b> ${esc(i.do)} ${i.src ? srcLink(i.src) : ''}</p></div></div>`).join('')}</div>`).join('')}
  <p class="small sub" style="margin-top:12px">Source: ${srcLink(wl.src, 'Owner’s manual: warning lights')}. If a light flashes or the car drives strangely, stop and call for help. Roadside: 1-800-866-1998.</p>`;
}

function specs() {
  const v = S.data.vehicle;
  return `${head('Specs', '#/guide')}
  <div class="card">${['engine', 'power', 'transmission', 'epaMpg'].map(k => `<div class="kv"><span>${{ engine: 'Engine', power: 'Power', transmission: 'Drive', epaMpg: 'EPA mpg' }[k]}</span><span>${esc(v[k].v)}<br>${srcOrVerify(v[k])}</span></div>`).join('')}</div>
  ${S.data.specs.map(g => `<h2 class="section-title">${esc(g.group)}</h2><div class="card">${g.rows.map(r => `<div class="kv"><span>${esc(r.k)}</span><span>${esc(r.v)}<br>${srcOrVerify(r)}</span></div>${r.note ? `<p class="small sub" style="margin:-4px 0 8px">${esc(r.note)}</p>` : ''}`).join('')}</div>`).join('')}
  <p class="small sub" style="margin-top:12px">“Verify” means the value couldn’t be confirmed from Mazda’s manual. Check your car or ask a parts counter (give them your VIN), then note it in the app.</p>`;
}

function howto(openId) {
  const all = [...S.data.howTos, ...S.data.howTosExtra];
  return `${head('How-tos', '#/guide')}
  <div class="stack">${all.map(h => `<details class="card" id="ht-${h.id}" ${openId === h.id ? 'open' : ''}>
    <summary style="min-height:40px;display:flex;align-items:center;font-weight:700;cursor:pointer">${esc(h.title)}</summary>
    <ol class="steps">${h.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    ${h.note ? `<p class="small sub" style="margin-top:6px">${esc(h.note)}</p>` : ''}
    <p class="small" style="margin-top:8px">${srcOrVerify(h)}</p></details>`).join('')}</div>`;
}

function know() {
  return `${head('Know your car', '#/guide')}
  <p class="small sub" style="margin:-4px 2px 12px">Your 2025 Mazda3 Hatchback 2.5 S, system by system.</p>
  <div class="stack">${S.data.knowYourCar.map(k => `<div class="card"><b>${esc(k.title)}</b><p style="margin-top:4px">${esc(k.body)}</p><p class="small" style="margin-top:6px">${srcOrVerify(k)}</p></div>`).join('')}</div>`;
}

function recalls() {
  const r = S.data.recalls, chk = S.kv.lastRecallCheck;
  return `${head('Recalls & issues', '#/guide')}
  <div class="card"><b>Check your exact car</b><p class="small sub" style="margin:4px 0 10px">Only a VIN lookup tells you if your car is affected and whether the fix was already done. Recall repairs are always free.</p>
    <div class="btns" style="margin:0">
      <a class="btn primary" href="${esc(S.data.sources['nhtsa-lookup'].url)}" target="_blank" rel="noopener">NHTSA lookup</a>
      <a class="btn secondary" href="${esc(S.data.sources['mazda-recall-lookup'].url)}" target="_blank" rel="noopener">Mazda lookup</a>
    </div>
    ${S.car.vin ? `<button class="btn ghost block" data-act="copyVin">Copy my VIN</button>` : ''}
    <button class="btn secondary block" style="margin-top:8px" data-act="checkRecalls">Check for new recalls now (needs internet)</button>
    ${chk ? `<p class="small sub" style="margin-top:8px">Last checked ${fmtDate(chk.date)}: ${chk.newOnes?.length ? `<b style="color:var(--red)">${chk.newOnes.length} new recall(s) since this app was built.</b>` : 'no new recalls for 2025 Mazda3s.'}</p>` : ''}
  </div>
  ${chk?.newOnes?.length ? `<h2 class="section-title">New since app was built</h2><div class="stack">${chk.newOnes.map(n => `<div class="card"><b>${esc(n.component)}</b><p class="small sub">NHTSA ${esc(n.campaign)} · ${esc(n.date)}</p><p class="small" style="margin-top:4px">${esc(n.summary)}</p><p class="small" style="margin-top:4px"><b>Fix:</b> ${esc(n.remedy)}</p></div>`).join('')}</div>` : ''}
  <h2 class="section-title">Recalls for 2025 Mazda3 (as of ${fmtDate(r.asOf)})</h2>
  <div class="stack">${r.items.map(x => `<div class="card"><b>${esc(x.component)}</b>
    <p class="small sub">NHTSA ${esc(x.campaign)} · Mazda ${esc(x.mazdaNumber)} · ${fmtDate(x.date)}</p>
    <p style="margin-top:6px">${esc(x.summary)}</p>
    <p class="small" style="margin-top:6px"><b>Risk:</b> ${esc(x.risk)}<br><b>Fix:</b> ${esc(x.fix)}</p>
    <p class="small" style="margin-top:6px">${srcLink(x.src, 'NHTSA report')}</p></div>`).join('')}</div>
  <h2 class="section-title">Service bulletins (not recalls)</h2>
  <div class="stack">${r.bulletins.map(b => `<div class="card"><b>${esc(b.id)}</b><p class="small" style="margin-top:4px">${esc(b.summary)}</p><p class="small" style="margin-top:6px">${srcOrVerify(b)}</p></div>`).join('')}</div>
  <h2 class="section-title">Owner reports</h2>
  <div class="stack">${r.ownerReports.map(o => `<div class="card"><span class="pill neutral">${esc(o.label)}</span><p class="small" style="margin-top:6px">${esc(o.summary)}</p><p class="small sub" style="margin-top:4px">Not confirmed by Mazda.</p></div>`).join('')}</div>`;
}

export default {
  render(param = '') {
    const [sec, sub] = param.split('/');
    return ({ shop, lights, specs, know, recalls }[sec]?.() ?? (sec === 'howto' ? howto(sub) : index()));
  },
  after(root, param = '') {
    const [sec, sub] = param.split('/');
    if (sec === 'howto' && sub) document.getElementById('ht-' + sub)?.scrollIntoView({ block: 'start' });
  },
  inputs: {
    lightSearch: el => {
      const q = el.value.trim().toLowerCase();
      document.querySelectorAll('.light').forEach(l => l.classList.toggle('hidden', !!q && !l.dataset.search.includes(q)));
      document.querySelectorAll('[data-group]').forEach(g => {
        const card = document.querySelector(`.card[data-group="${g.dataset.group}"]`);
        const any = [...card.querySelectorAll('.light')].some(l => !l.classList.contains('hidden'));
        g.classList.toggle('hidden', !any);
      });
    },
  },
  actions: {
    copyVin: async () => { await navigator.clipboard.writeText(S.car.vin); toast('VIN copied. Paste it into the lookup page.'); },
    checkRecalls: async () => {
      if (!navigator.onLine) throw new Error('You’re offline. Try again when you have internet.');
      toast('Checking NHTSA…');
      const res = await fetch('https://api.nhtsa.gov/recalls/recallsByVehicle?make=MAZDA&model=MAZDA3&modelYear=2025');
      if (!res.ok) throw new Error('NHTSA didn’t answer. Try again later.');
      const j = await res.json();
      const known = new Set(S.data.recalls.items.map(x => x.campaign));
      const newOnes = (j.results || []).filter(x => !known.has(x.NHTSACampaignNumber)).map(x => ({
        campaign: x.NHTSACampaignNumber, date: x.ReportReceivedDate, component: x.Component, summary: x.Summary, remedy: x.Remedy,
      }));
      await setKv('lastRecallCheck', { date: today(), newOnes });
      toast(newOnes.length ? `${newOnes.length} new recall(s) found.` : 'No new recalls.');
      render();
    },
    shareShop: async () => {
      const need = S.statuses.filter(s => s.status !== 'ok');
      const text = [`My 2025 Mazda3 at ${fmtNum(S.currentMiles)} mi.`,
        need.length ? `Due now per Mazda: ${need.map(s => s.name).join('; ')}.` : 'Nothing is due per Mazda right now.',
        `Not due yet: ${S.statuses.filter(s => s.status === 'ok').map(s => s.name).join('; ')}.`].join('\n');
      if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      await navigator.clipboard.writeText(text);
      toast('Copied. Paste it into a message.');
    },
  },
};
