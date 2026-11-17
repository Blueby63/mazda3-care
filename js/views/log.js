import { S, saveRecord, deleteRecord, sorted } from '../state.js';
import { esc, fmtNum, fmtMoney, fmtDate, icon, today, compressImage } from '../util.js';
import { openSheet, closeSheet, sheetHead, toast, head, hydrateFiles } from '../ui.js';
import { render } from '../app.js';
import * as db from '../db.js';

export const CATEGORIES = ['Oil & filter', 'Tires', 'Brakes', 'Filters', 'Inspection', 'Battery', 'Fluids', 'Wipers & lights', 'Repair', 'Recall (free)', 'Cleaning & care', 'Registration & fees', 'Other'];
const KINDS = { maintenance: 'Maintenance', repair: 'Repair', inspection: 'Inspection', recall: 'Recall', other: 'Other' };
const WHERE = { dealer: 'Mazda dealer', shop: 'Other shop', diy: 'DIY' };

function autoCategory(itemIds, kind) {
  if (kind === 'recall') return 'Recall (free)';
  if (kind === 'repair') return 'Repair';
  if (itemIds.includes('oil')) return 'Oil & filter';
  if (itemIds.some(i => ['rotate', 'tireKit'].includes(i))) return 'Tires';
  if (itemIds.some(i => ['airFilter', 'cabinFilter'].includes(i))) return 'Filters';
  if (itemIds.includes('coolant')) return 'Fluids';
  if (itemIds.some(i => i.startsWith('inspect'))) return 'Inspection';
  return 'Other';
}

let pendingReceipt = null, dropReceipt = false;

function partRow(p = {}) {
  return `<div class="part-row"><input name="pName" placeholder="Part or fluid" value="${esc(p.name)}" aria-label="Part name"><input name="pNo" placeholder="Part #" value="${esc(p.partNo)}" aria-label="Part number"><input name="pCost" inputmode="decimal" placeholder="$" value="${esc(p.cost ?? '')}" aria-label="Part cost"><button type="button" data-act="removePart" aria-label="Remove part">×</button></div>`;
}

export function openServiceForm({ id, items = [], past = false } = {}) {
  const rec = id ? S.services.find(s => s.id === id) : null;
  pendingReceipt = null; dropReceipt = false;
  const r = rec || { date: today(), miles: S.latest?.miles || '', itemIds: items, where: 'shop', kind: 'maintenance', isPastRecord: past, parts: [] };
  const due = new Set(S.statuses.filter(s => s.status !== 'ok').map(s => s.id));
  const shops = [...new Set(S.services.map(s => s.shopName).filter(Boolean))];
  openSheet(`<form data-form="service" novalidate>
    ${sheetHead(rec ? 'Edit record' : r.isPastRecord ? 'Add past record' : 'Log service')}
    <input type="hidden" name="id" value="${esc(rec?.id || '')}">
    <div class="grid2">
      <label class="field"><span>Date</span><input type="date" name="date" value="${esc(r.date)}" max="${today()}" required></label>
      <label class="field"><span>Odometer (mi)</span><input type="number" name="miles" inputmode="numeric" min="0" step="1" value="${esc(r.miles)}" required></label>
    </div>
    <div class="field"><span>What was done? <span class="sub small">(red dot = due now)</span></span>
      <div class="chips">${S.data.schedule.items.map(i => `<label class="chip ${due.has(i.id) ? 'due' : ''}"><input type="checkbox" name="items" value="${i.id}" ${r.itemIds?.includes(i.id) ? 'checked' : ''}>${esc(i.name.replace(' (FL-22)', '').replace(' (if equipped)', ''))}</label>`).join('')}</div>
    </div>
    <label class="field"><span>Title <span class="sub small">(optional, filled in from the items above)</span></span><input name="title" value="${esc(rec?.title || '')}" placeholder="e.g. Oil change, new wiper blades, brake repair"></label>
    <div class="field"><span>Where</span><div class="seg">${Object.entries(WHERE).map(([k, v]) => `<label><input type="radio" name="where" value="${k}" ${r.where === k ? 'checked' : ''} data-change="whereDiy">${v}</label>`).join('')}</div></div>
    <div class="grid2">
      <label class="field"><span>Shop name</span><input name="shopName" list="shopList" value="${esc(r.shopName || '')}" placeholder="Optional"><datalist id="shopList">${shops.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <label class="field"><span>Total cost</span><div class="money"><input name="cost" inputmode="decimal" value="${esc(r.cost ?? '')}" placeholder="0.00"></div></label>
    </div>
    <div class="field"><span>Receipt photo</span>
      <label class="btn secondary block">${icon.camera}<span id="rcptLabel">${rec?.receiptFileId ? 'Replace photo' : 'Add photo'}</span><input type="file" accept="image/*" class="sr" data-change="receiptPick"></label>
      <div class="photo-prev" id="rcptPrev">${rec?.receiptFileId ? `<img data-file="${rec.receiptFileId}" alt="Receipt"><button type="button" class="btn small danger" data-act="dropReceipt">Remove</button>` : ''}</div>
    </div>
    <details class="more" ${rec && (rec.parts?.length || rec.notes) ? 'open' : ''}><summary>More details</summary>
      <div class="grid2">
        <label class="field"><span>Type</span><select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${r.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Cost category</span><select name="category"><option value="">Automatic</option>${CATEGORIES.map(c => `<option ${rec?.category === c && rec?.categoryManual ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      </div>
      <div class="field"><span>Parts and fluids</span><div id="parts">${(r.parts || []).map(partRow).join('')}</div>
        <button type="button" class="btn small ghost" data-act="addPart">${icon.plus}Add part</button></div>
      <label class="field"><span>Notes</span><textarea name="notes" placeholder="Anything worth remembering: what the shop said, warranty work, etc.">${esc(r.notes || '')}</textarea></label>
      <label class="check" style="border:0"><input type="checkbox" name="isPastRecord" ${r.isPastRecord ? 'checked' : ''}><div><b>Past record</b><span>Entered from old paperwork (before you owned the car or before using this app).</span></div></label>
    </details>
    <div class="sheet-actions"><button class="btn primary big" type="submit">Save</button></div>
  </form>`);
  hydrateFiles(document.getElementById('sheet'));
}

export function openMilesForm() {
  openSheet(`<form data-form="miles">
    ${sheetHead('Update mileage')}
    <label class="field"><span>Odometer now (mi)</span><input type="number" name="miles" inputmode="numeric" min="0" step="1" value="${S.latest?.miles || ''}" required autofocus style="font-size:28px;font-weight:700"></label>
    <span class="hint small sub">Last reading: ${S.latest ? `${fmtNum(S.latest.miles)} mi on ${fmtDate(S.latest.date)}` : 'none yet'}</span>
    <label class="field"><span>Date</span><input type="date" name="date" value="${today()}" max="${today()}" required></label>
    <div class="sheet-actions"><button class="btn primary big" type="submit">Save</button></div>
  </form>`);
  const inp = document.querySelector('#sheet input[name=miles]');
  inp?.select();
}

function listView() {
  const list = sorted(S.services);
  if (!list.length) return `${head('Service log')}
    <div class="card"><b>No records yet</b><p class="sub small" style="margin-top:4px">Log each service as it happens. Got old receipts? Add them as past records so the schedule starts from the right point.</p></div>
    <div class="btns"><button class="btn primary big" data-act="logService">${icon.plus}Log service</button><button class="btn secondary big" data-act="logService" data-past="1">Add past record</button></div>`;
  const years = {};
  for (const s of list) (years[s.date.slice(0, 4)] ||= []).push(s);
  return `${head('Service log')}
    <div class="btns" style="margin-top:0"><button class="btn primary big" data-act="logService">${icon.plus}Log service</button><button class="btn secondary big" data-act="logService" data-past="1">Add past record</button></div>
    ${Object.entries(years).sort((a, b) => b[0] - a[0]).map(([y, recs]) => `
      <h2 class="section-title"><span>${y}</span><span class="sub small tnum">${fmtMoney(recs.reduce((a, r) => a + (+r.cost || 0), 0))}</span></h2>
      <div class="card flush">${recs.map(r => `<a class="row" href="#/log/${r.id}">
        <div class="main"><b>${esc(r.title)}</b><span>${fmtDate(r.date)} · ${fmtNum(r.miles)} mi · ${esc(r.shopName || WHERE[r.where] || '')}${r.isPastRecord ? ' · past record' : ''}</span></div>
        <div class="end"><b class="tnum">${r.cost ? fmtMoney(r.cost) : ''}</b>${r.receiptFileId ? 'receipt' : ''}</div>${icon.chev}</a>`).join('')}</div>`).join('')}
    <p class="small sub" style="margin-top:16px"><a href="#/more/mileage">Mileage history</a> · <a href="#/more/backup">Export as CSV</a></p>`;
}

function detailView(id) {
  const r = S.services.find(s => s.id === id);
  if (!r) return `${head('Not found', '#/log')}<p class="sub">This record was deleted.</p>`;
  const names = (r.itemIds || []).map(i => S.data.schedule.items.find(x => x.id === i)?.name).filter(Boolean);
  return `${head(r.title, '#/log')}
  <div class="card">
    <div class="kv"><span>Date</span><span>${fmtDate(r.date)}</span></div>
    <div class="kv"><span>Odometer</span><span class="tnum">${fmtNum(r.miles)} mi</span></div>
    <div class="kv"><span>Where</span><span>${esc(r.shopName || '')} ${r.shopName ? '·' : ''} ${WHERE[r.where] || ''}</span></div>
    <div class="kv"><span>Cost</span><span class="tnum">${r.cost ? fmtMoney(r.cost) : '–'}</span></div>
    <div class="kv"><span>Type · category</span><span>${KINDS[r.kind] || ''} · ${esc(r.category || '')}</span></div>
    ${names.length ? `<div class="kv"><span>Schedule items reset</span><span>${names.map(esc).join(', ')}</span></div>` : ''}
    ${r.isPastRecord ? '<div class="kv"><span>Source</span><span>Past record (paperwork)</span></div>' : ''}
  </div>
  ${r.parts?.length ? `<h2 class="section-title">Parts and fluids</h2><div class="card">${r.parts.map(p => `<div class="kv"><span>${esc(p.name)}${p.partNo ? ` <span class="small">#${esc(p.partNo)}</span>` : ''}</span><span class="tnum">${p.cost ? fmtMoney(p.cost) : ''}</span></div>`).join('')}</div>` : ''}
  ${r.notes ? `<h2 class="section-title">Notes</h2><div class="card"><p style="white-space:pre-wrap">${esc(r.notes)}</p></div>` : ''}
  ${r.receiptFileId ? `<h2 class="section-title">Receipt</h2><a data-file="${r.receiptFileId}" target="_blank"><img class="receipt" data-file="${r.receiptFileId}" alt="Receipt photo"></a>` : ''}
  <div class="btns"><button class="btn secondary big" data-act="logService" data-id="${r.id}">Edit</button><button class="btn danger big" data-act="deleteService" data-id="${r.id}">Delete</button></div>`;
}

export default {
  render(param) { return param ? detailView(param) : listView(); },
  actions: {
    logService: el => openServiceForm({ id: el.dataset.id, items: el.dataset.items ? el.dataset.items.split(',') : [], past: !!el.dataset.past }),
    updateMiles: () => openMilesForm(),
    addPart: () => document.getElementById('parts').insertAdjacentHTML('beforeend', partRow()),
    removePart: el => el.closest('.part-row').remove(),
    dropReceipt: () => { pendingReceipt = null; dropReceipt = true; document.getElementById('rcptPrev').innerHTML = '<span class="small sub">Photo will be removed when you save.</span>'; },
    deleteService: async el => {
      const r = S.services.find(s => s.id === el.dataset.id);
      if (!r || !confirm(`Delete “${r.title}”? This can’t be undone.`)) return;
      if (r.receiptFileId) await deleteRecord('files', r.receiptFileId);
      await deleteRecord('services', r.id);
      toast('Record deleted.');
      location.hash = '#/log';
    },
  },
  changes: {
    receiptPick: async el => {
      const f = el.files?.[0];
      if (!f) return;
      document.getElementById('rcptLabel').textContent = 'Shrinking photo…';
      pendingReceipt = await compressImage(f);
      dropReceipt = false;
      const url = URL.createObjectURL(pendingReceipt);
      document.getElementById('rcptPrev').innerHTML = `<img src="${url}" alt="Receipt preview"><span class="small sub">${Math.round(pendingReceipt.size / 1024)} KB</span>`;
      document.getElementById('rcptLabel').textContent = 'Replace photo';
    },
    whereDiy: el => {
      // DIY oil change: pre-fill the usual parts so logging stays quick
      const form = el.form;
      if (el.value !== 'diy' || !form.querySelector('[name=items][value=oil]')?.checked) return;
      const parts = document.getElementById('parts');
      if (parts.children.length) return;
      const filter = S.data.specs.find(g => g.group === 'Engine oil').rows.find(r => r.k.startsWith('Oil filter')).v.split(' ')[0];
      parts.innerHTML = partRow({ name: '0W-20 engine oil, 4.8 qt' }) + partRow({ name: 'Oil filter', partNo: filter });
      form.querySelector('details.more').open = true;
    },
  },
  forms: {
    async service(fd) {
      const itemIds = fd.getAll('items');
      const names = itemIds.map(i => S.data.schedule.items.find(x => x.id === i)?.name.replace(' (FL-22)', '').replace(' (if equipped)', ''));
      const miles = Math.round(+fd.get('miles'));
      const date = fd.get('date');
      if (!date) throw new Error('Pick a date.');
      if (!(miles > 0)) throw new Error('Enter the odometer reading. It resets the schedule correctly.');
      const title = (fd.get('title') || '').trim() || (names.length ? names.join(', ') : '');
      if (!title) throw new Error('Pick what was done, or type a title.');
      const id = fd.get('id');
      const old = id ? S.services.find(s => s.id === id) : null;
      const kind = fd.get('kind') || 'maintenance';
      const pn = fd.getAll('pName'), pno = fd.getAll('pNo'), pc = fd.getAll('pCost');
      const parts = pn.map((n, i) => ({ name: n.trim(), partNo: pno[i].trim(), cost: pc[i] ? +pc[i].replace(/[^0-9.]/g, '') : null })).filter(p => p.name || p.partNo);
      const manualCat = fd.get('category');
      const rec = {
        ...(old || {}), id: id || undefined, date, miles, itemIds, title, kind,
        where: fd.get('where') || 'shop', shopName: (fd.get('shopName') || '').trim(),
        cost: fd.get('cost') ? +String(fd.get('cost')).replace(/[^0-9.]/g, '') : 0,
        category: manualCat || autoCategory(itemIds, kind), categoryManual: !!manualCat,
        parts, notes: (fd.get('notes') || '').trim(), isPastRecord: fd.get('isPastRecord') === 'on',
      };
      if (pendingReceipt) {
        if (old?.receiptFileId) await db.del('files', old.receiptFileId);
        const f = await db.put('files', { mime: 'image/jpeg', size: pendingReceipt.size, name: `receipt-${date}.jpg`, blob: pendingReceipt });
        rec.receiptFileId = f.id;
      } else if (dropReceipt && old?.receiptFileId) {
        await db.del('files', old.receiptFileId);
        rec.receiptFileId = null;
      }
      pendingReceipt = null; dropReceipt = false;
      await saveRecord('services', rec);
      closeSheet();
      if (itemIds.includes('oil') && !rec.isPastRecord) toast('Saved. Reset the oil reminder in the car too.', { label: 'How', href: '#/guide/howto/oilReset' });
      else toast(old ? 'Record updated.' : 'Saved. The schedule is updated.');
      render();
    },
    async miles(fd) {
      const miles = Math.round(+fd.get('miles'));
      if (!(miles > 0)) throw new Error('Enter the number on your odometer.');
      if (S.latest && miles < S.latest.miles && !confirm(`That’s lower than your last reading (${fmtNum(S.latest.miles)} mi). Save anyway?`)) return;
      await saveRecord('odometer', { date: fd.get('date') || today(), miles, source: 'manual' });
      closeSheet();
      toast(`Mileage saved: ${fmtNum(miles)} mi.`);
      render();
    },
  },
};
