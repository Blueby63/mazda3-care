// Boot, routing, and event wiring.
import * as db from './db.js';
import { S, loadCarData, loadAll, setKv } from './state.js';
import { closeSheet, toast, hydrateFiles } from './ui.js';
import { today } from './util.js';
import home from './views/home.js';
import schedule from './views/schedule.js';
import log from './views/log.js';
import guide from './views/guide.js';
import more from './views/more.js';

export const APP_VERSION = '1.0.1';
const views = { home, schedule, log, guide, more };
const actions = {}, forms = {}, changes = {}, inputs = {};
for (const v of Object.values(views)) {
  Object.assign(actions, v.actions); Object.assign(forms, v.forms);
  Object.assign(changes, v.changes); Object.assign(inputs, v.inputs);
}

const app = document.getElementById('app');
let lastRoute = '';

export function route() {
  const [name = 'home', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name, param: rest.join('/') };
}

export async function render() {
  const r = route();
  let name = views[r.name] ? r.name : 'home';
  let param = r.param;
  if (!S.kv.setupDone && !(name === 'more' && param === 'setup')) { name = 'more'; param = 'setup'; }
  try {
    app.innerHTML = views[name].render(param);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><b>Something went wrong showing this screen.</b><p class="sub small">${String(e.message)}</p><p><a href="#/home">Go home</a></p></div>`;
  }
  document.querySelectorAll('nav.tabs a').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === name) && a.setAttribute('aria-current', 'page'));
  document.querySelector('nav.tabs').classList.toggle('hidden', !S.kv.setupDone);
  const key = name + '/' + param;
  if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
  views[name].after?.(app, param);
  hydrateFiles(app);
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  try { await fn(el, e); } catch (err) { console.error(err); toast(err.message || 'That didn’t work.'); }
});
document.addEventListener('submit', async e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (!fn) return;
  const btn = form.querySelector('[type=submit]');
  if (btn) btn.disabled = true;
  try { await fn(new FormData(form), form); } catch (err) { console.error(err); toast(err.message || 'Couldn’t save.'); }
  finally { if (btn) btn.disabled = false; }
});
document.addEventListener('change', async e => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) {
    try { await changes[el.dataset.change](el, e); } catch (err) { console.error(err); toast(err.message || 'That didn’t work.'); }
  }
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if (el && inputs[el.dataset.input]) inputs[el.dataset.input](el, e);
});
// tap outside the sheet closes it
document.getElementById('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
actions.closeSheet = () => closeSheet();
actions.toastLink = el => { document.getElementById('toast').classList.remove('show'); location.hash = el.getAttribute('href'); };
window.addEventListener('hashchange', () => { closeSheet(); render(); });

// ---------- service worker (offline + updates) ----------
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // On the very first visit the worker takes control without an update; don't reload then
  // (it would wipe a half-filled setup form). Only reload when replacing an older version.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const notify = w => { S.updateReady = w; render(); };
    if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w);
      });
    });
    // check for a new version when the app comes back to the foreground
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(err => console.warn('Service worker failed', err));
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
}
actions.applyUpdate = () => { S.updateReady?.postMessage('skipWaiting'); };

// ---------- in-app reminder, once a day ----------
async function dailyAlert() {
  if (!S.kv.setupDone || S.kv.lastAlertDay === today()) return;
  const due = S.statuses.filter(s => s.status === 'overdue' || s.status === 'soon');
  if (!due.length) return;
  await setKv('lastAlertDay', today());
  const over = due.filter(s => s.status === 'overdue').length;
  toast(over ? `${over} item${over > 1 ? 's are' : ' is'} overdue.` : `${due.length} item${due.length > 1 ? 's are' : ' is'} due soon.`, { label: 'See', href: '#/schedule' });
}

// ---------- boot ----------
(async function boot() {
  try {
    await Promise.all([loadCarData(), db.open()]);
    await loadAll();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><b>The app couldn’t open its storage.</b><p class="sub small">${String(e.message || e)}</p><p class="small">Private/incognito mode can block storage. Open the app normally and try again.</p></div>`;
    return;
  }
  await render();
  setupServiceWorker();
  setTimeout(dailyAlert, 1200);
})();
