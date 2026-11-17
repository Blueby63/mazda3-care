// App state: everything loaded from IndexedDB plus computed schedule status.
import * as db from './db.js';
import { allReadings, latestReading, milesPerDay, scheduleStatus, estimateMiles, isoDate } from './schedule.js';

export const KV_KEYS = ['car', 'setupDone', 'baselineChecks', 'baselineHidden', 'lastBackupAt', 'cpoConfirmed', 'lastAlertDay', 'lastRecallCheck'];

export const S = {
  data: null,            // data/car.json (bundled, read-only)
  car: {}, kv: {},
  services: [], odometer: [], fuel: [], warranties: [], docs: [],
  readings: [], latest: null, rate: 0, rateSource: 'estimate',
  statuses: [], ctx: null, currentMiles: 0,
  updateReady: null,
};

export async function loadCarData() {
  const r = await fetch('data/car.json');
  S.data = await r.json();
}

export async function loadAll() {
  for (const k of KV_KEYS) S.kv[k] = await db.get('kv', k);
  S.car = S.kv.car || {};
  for (const s of ['services', 'odometer', 'fuel', 'warranties', 'docs']) S[s] = await db.getAll(s);
  recompute();
}

export function recompute() {
  const today = isoDate(new Date());
  S.readings = allReadings({ odometer: S.odometer, services: S.services, fuel: S.fuel, car: S.car });
  S.latest = latestReading(S.readings);
  const r = milesPerDay(S.readings, { milesPerMonth: +S.car.milesPerMonth || undefined });
  S.rate = r.rate; S.rateSource = r.source;
  S.ctx = {
    today, mode: S.car.scheduleMode || 'normal',
    car: { inServiceDate: S.car.inServiceDate, historyKnown: !!S.car.historyKnown },
    services: S.services, latest: S.latest, rate: S.rate,
  };
  S.statuses = S.data ? scheduleStatus(S.data.schedule.items, S.ctx) : [];
  S.currentMiles = S.latest ? estimateMiles(today, S.latest, S.rate) : 0;
}

export async function setKv(key, value) {
  S.kv[key] = value;
  await db.put('kv', value, key);
  if (key === 'car') { S.car = value; recompute(); }
}

export async function saveCar(patch) {
  await setKv('car', { ...S.car, ...patch });
}

export async function saveRecord(store, rec) {
  if (!rec.createdAt) rec.createdAt = new Date().toISOString();
  rec.updatedAt = new Date().toISOString();
  await db.put(store, rec);
  S[store] = await db.getAll(store);
  recompute();
  return rec;
}

export async function deleteRecord(store, id) {
  await db.del(store, id);
  if (store !== 'files') { S[store] = await db.getAll(store); recompute(); }
}

export const sorted = (list, key = 'date') => [...list].sort((a, b) => String(b[key]).localeCompare(String(a[key])) || (b.miles || 0) - (a.miles || 0));
