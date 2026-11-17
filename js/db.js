// IndexedDB storage with versioned migrations. Nothing ever leaves the phone.

export const DB_NAME = 'mazda3care';
export const DB_VERSION = 1;          // IndexedDB structure version
export const DATA_VERSION = 1;        // shape of the records inside (used for imports too)
export const STORES = ['kv', 'odometer', 'services', 'files', 'warranties', 'fuel', 'docs'];

// Structure migrations: index = version being upgraded TO. Never delete stores with data.
const structure = {
  1(db) {
    db.createObjectStore('kv');
    for (const s of STORES.slice(1)) db.createObjectStore(s, { keyPath: 'id' });
  },
};

// Data migrations for records (run on open and on import). Example for later:
// 2(data) { data.services.forEach(s => s.kind ??= 'maintenance'); }
const dataMigrations = {};

export function migrateData(data, fromVersion) {
  let v = fromVersion || 1;
  while (v < DATA_VERSION) { v++; dataMigrations[v]?.(data); }
  return data;
}

let dbp;
export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = req.result;
      for (let v = e.oldVersion + 1; v <= DB_VERSION; v++) structure[v]?.(db, req.transaction);
    };
    req.onsuccess = async () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other tabs of this app and try again.'));
  }).then(async db => { await runDataMigrations(db); return db; });
  return dbp;
}

async function runDataMigrations(db) {
  const stored = await reqP(db.transaction('kv').objectStore('kv').get('dataVersion'));
  if (stored === DATA_VERSION) return;
  if (stored && stored < DATA_VERSION) {
    const data = await readAll(db);
    migrateData(data, stored);
    await writeAll(db, data, false);
  }
  await reqP(db.transaction('kv', 'readwrite').objectStore('kv').put(DATA_VERSION, 'dataVersion'));
}

function reqP(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
function txDone(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export async function get(store, key) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).get(key));
}
export async function getAll(store) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).getAll());
}
export async function put(store, value, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  if (store === 'kv') tx.objectStore(store).put(value, key);
  else { if (!value.id) value.id = uid(); tx.objectStore(store).put(value); }
  await txDone(tx);
  return value;
}
export async function del(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

async function readAll(db) {
  const data = {};
  for (const s of STORES) {
    const os = db.transaction(s).objectStore(s);
    if (s === 'kv') {
      const keys = await reqP(os.getAllKeys());
      const vals = await reqP(db.transaction(s).objectStore(s).getAll());
      data.kv = Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
    } else data[s] = await reqP(os.getAll());
  }
  return data;
}

async function writeAll(db, data, clearFirst = true) {
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = tx.objectStore(s);
    if (clearFirst) os.clear();
    if (s === 'kv') for (const [k, v] of Object.entries(data.kv || {})) os.put(v, k);
    else for (const rec of data[s] || []) os.put(rec);
  }
  await txDone(tx);
}

// ---------- Backup ----------
const blobToB64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
const b64ToBlob = (b64, type) => {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
};

export async function exportAll() {
  const db = await open();
  const data = await readAll(db);
  data.files = await Promise.all(data.files.map(async f => ({ ...f, blob: undefined, data: await blobToB64(f.blob) })));
  return { app: 'mazda3care', dataVersion: DATA_VERSION, exportedAt: new Date().toISOString(), data };
}

export async function importAll(json) {
  if (!json || json.app !== 'mazda3care' || !json.data) throw new Error("This file isn't a Mazda3 Care backup.");
  if (json.dataVersion > DATA_VERSION) throw new Error('This backup is from a newer version of the app. Update the app first.');
  const data = structuredClone(json.data);
  for (const s of STORES) data[s] ??= s === 'kv' ? {} : [];
  data.files = data.files.map(f => { const { data: b64, ...rest } = f; return { ...rest, blob: b64ToBlob(b64, f.mime) }; });
  migrateData(data, json.dataVersion);
  data.kv.dataVersion = DATA_VERSION;
  const db = await open();
  await writeAll(db, data, true);
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  await txDone(tx);
  await put('kv', DATA_VERSION, 'dataVersion');
}
