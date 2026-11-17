import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  itemStatus, scheduleStatus, forecast, milesPerDay, allReadings, latestReading,
  addMonths, isoDate, warrantyStatus, costSummary, mpgLog, estimateMiles,
} from '../js/schedule.js';

const car = JSON.parse(readFileSync(new URL('../data/car.json', import.meta.url)));
const items = car.schedule.items;
const item = id => items.find(i => i.id === id);

// A car like the owner's: in service March 2025, bought Nov 2026 around 11,000 miles.
function ctx(over = {}) {
  const base = {
    today: '2026-11-17',
    mode: 'normal',
    car: { inServiceDate: '2025-03-25', historyKnown: false },
    services: [],
    latest: { date: '2026-11-17', miles: 11000 },
    rate: 400 / 30.4375,
  };
  return { ...base, ...over, car: { ...base.car, ...(over.car || {}) } };
}

test('date math: adding months clamps to the end of the month', () => {
  assert.equal(isoDate(addMonths('2025-01-31', 1)), '2025-02-28');
  assert.equal(isoDate(addMonths('2024-01-31', 1)), '2024-02-29');
  assert.equal(isoDate(addMonths('2025-03-25', 12)), '2026-03-25');
});

test('whichever comes first: time limit wins for a low-mileage driver', () => {
  const services = [{ date: '2026-11-17', miles: 11000, itemIds: ['oil'] }];
  const s = itemStatus(item('oil'), ctx({ services }));
  assert.equal(s.dueMiles, 21000);
  assert.equal(s.dueDate, '2027-11-17');
  assert.equal(s.trigger, 'time');            // 10,000 mi at 400/mo takes ~25 months
  assert.equal(s.effectiveDate, '2027-11-17');
  assert.equal(s.status, 'ok');
});

test('whichever comes first: mileage wins for a high-mileage driver', () => {
  const services = [{ date: '2026-11-17', miles: 11000, itemIds: ['oil'] }];
  const s = itemStatus(item('oil'), ctx({ services, rate: 2000 / 30.4375 }));
  assert.equal(s.trigger, 'miles');
  assert.ok(s.effectiveDays > 140 && s.effectiveDays < 160, `~152 days, got ${s.effectiveDays}`);
});

test('due soon by miles, by date, and overdue', () => {
  const services = [{ date: '2026-06-01', miles: 11000, itemIds: ['oil'] }];
  // 600 miles left -> soon
  let s = itemStatus(item('oil'), ctx({ services, latest: { date: '2026-11-17', miles: 20400 } }));
  assert.equal(s.status, 'soon');
  assert.equal(s.milesLeft, 600);
  // date-based: done 2025-12-01, 12-month limit is 2026-12-01 (14 days away)
  s = itemStatus(item('oil'), ctx({ services: [{ date: '2025-12-01', miles: 9000, itemIds: ['oil'] }] }));
  assert.equal(s.status, 'soon');
  assert.equal(s.daysLeft, 14);
  // past the 12 months -> overdue
  s = itemStatus(item('oil'), ctx({ services: [{ date: '2025-10-01', miles: 9000, itemIds: ['oil'] }] }));
  assert.equal(s.status, 'overdue');
  assert.ok(s.daysLeft < 0);
  // past the miles -> overdue even though the date is fine
  s = itemStatus(item('oil'), ctx({ services: [{ date: '2026-09-01', miles: 500, itemIds: ['oil'] }] }));
  assert.equal(s.status, 'overdue');
});

test('logging a service resets the item', () => {
  const before = itemStatus(item('rotate'), ctx());
  assert.equal(before.status, 'baseline');
  const after = itemStatus(item('rotate'), ctx({ services: [{ date: '2026-11-17', miles: 11000, itemIds: ['rotate', 'oil'] }] }));
  assert.equal(after.status, 'ok');
  assert.equal(after.dueMiles, 21000);
  assert.equal(after.last.miles, 11000);
  // the newest record wins, even if entered out of order
  const two = itemStatus(item('rotate'), ctx({ services: [
    { date: '2026-11-17', miles: 11000, itemIds: ['rotate'] },
    { date: '2025-09-01', miles: 2000, itemIds: ['rotate'] },
  ] }));
  assert.equal(two.dueMiles, 21000);
});

test('unknown history: items past their first due point become baseline "do now"', () => {
  const all = scheduleStatus(items, ctx());
  const byId = Object.fromEntries(all.map(s => [s.id, s]));
  // 11,000 mi and 20 months old: oil, rotation and the basic inspection are past due from new
  for (const id of ['oil', 'rotate', 'inspectA']) assert.equal(byId[id].status, 'baseline', id);
  // not yet due from new: counted from the in-service date at 0 miles
  assert.equal(byId.cabinFilter.status, 'ok');
  assert.equal(byId.cabinFilter.dueDate, '2027-03-25');
  assert.equal(byId.sparkPlugs.dueMiles, 75000);
  assert.equal(byId.inspectB.dueDate, '2027-03-25');
  // baseline items sort to the top
  assert.ok(['baseline', 'overdue'].includes(all[0].status));
});

test('known history: the same situation shows as overdue, not baseline', () => {
  const s = itemStatus(item('oil'), ctx({ car: { historyKnown: true } }));
  assert.equal(s.status, 'overdue');
});

test('severe mode halves the oil interval, other items unchanged', () => {
  const services = [{ date: '2026-11-17', miles: 11000, itemIds: ['oil', 'rotate'] }];
  const oil = itemStatus(item('oil'), ctx({ services, mode: 'severe' }));
  assert.equal(oil.dueMiles, 16000);
  assert.equal(oil.dueDate, '2027-05-17');
  const rot = itemStatus(item('rotate'), ctx({ services, mode: 'severe' }));
  assert.equal(rot.dueMiles, 21000);
});

test('coolant: first change at 120k / 10 years, then every 60k / 5 years', () => {
  let s = itemStatus(item('coolant'), ctx());
  assert.equal(s.dueMiles, 120000);
  assert.equal(s.dueDate, '2035-03-25');
  s = itemStatus(item('coolant'), ctx({ services: [{ date: '2026-11-17', miles: 11000, itemIds: ['coolant'] }] }));
  assert.equal(s.dueMiles, 71000);
  assert.equal(s.dueDate, '2031-11-17');
});

test('projection: miles per day measured from real readings', () => {
  const readings = allReadings({
    odometer: [{ date: '2026-05-21', miles: 8000 }, { date: '2026-11-17', miles: 11000 }],
    services: [{ date: '2026-08-01', miles: 9500 }],
  });
  const { rate, source } = milesPerDay(readings);
  assert.equal(source, 'measured');
  // 3,000 miles over the 180-day window
  assert.ok(Math.abs(rate * 30.4375 - 507.3) < 1, `about 507 mi/mo, got ${rate * 30.4375}`);
  // readings older than 180 days are ignored when newer ones exist
  const old = milesPerDay(allReadings({ odometer: [{ date: '2025-01-01', miles: 100 }, { date: '2026-08-01', miles: 9500 }, { date: '2026-11-17', miles: 11000 }] }));
  assert.ok(Math.abs(old.rate - 1500 / 108) < 0.01);
  assert.equal(latestReading(readings).miles, 11000);
  assert.equal(estimateMiles('2026-12-17', latestReading(readings), rate), Math.round(11000 + 30 * rate));
  assert.equal(estimateMiles('2026-10-01', latestReading(readings), rate), 11000, 'never projects backwards');
});

test('projection: falls back to the owner estimate with too little data', () => {
  const one = milesPerDay([{ date: '2026-11-17', miles: 11000 }], { milesPerMonth: 600 });
  assert.equal(one.source, 'estimate');
  assert.ok(Math.abs(one.rate * 30.4375 - 600) < 0.01);
  const close = milesPerDay([{ date: '2026-11-10', miles: 10900 }, { date: '2026-11-17', miles: 11000 }]);
  assert.equal(close.source, 'estimate'); // only 7 days apart
});

test('projected dates follow the measured driving rate', () => {
  const services = [{ date: '2026-11-17', miles: 11000, itemIds: ['rotate'] }];
  const slow = itemStatus(item('rotate'), ctx({ services, rate: 300 / 30.4375 }));
  const fast = itemStatus(item('rotate'), ctx({ services, rate: 1000 / 30.4375 }));
  assert.ok(slow.effectiveDays > fast.effectiveDays * 3);
  assert.ok(Math.abs(fast.effectiveDays - 304) <= 1);
});

test('forecast timeline: baseline work is "now", then repeats on schedule', () => {
  const groups = forecast(items, ctx(), { years: 3 });
  assert.equal(groups[0].key, 'now');
  const nowIds = groups[0].items.map(i => i.id);
  assert.ok(nowIds.includes('oil') && nowIds.includes('rotate'));
  // next oil 12 months later at 400 mi/month
  const nextOil = groups.slice(1).find(g => g.items.some(i => i.id === 'oil'));
  assert.equal(nextOil.key, '2027-11');
  assert.ok(nextOil.miles > 15000 && nextOil.miles < 16000);
});

test('warranty counts from the in-service date, whichever first', () => {
  const basic = car.warranty.items.find(w => w.id === 'basic');
  const w = warrantyStatus(basic, { inServiceDate: '2025-03-25', today: '2026-11-17', latest: { date: '2026-11-17', miles: 11000 }, rate: 400 / 30.4375 });
  assert.equal(w.endDate, '2028-03-25');
  assert.equal(w.milesLeft, 25000);
  assert.equal(w.ends.by, 'time');
  assert.ok(w.active);
  const fast = warrantyStatus(basic, { inServiceDate: '2025-03-25', today: '2026-11-17', latest: { date: '2026-11-17', miles: 30000 }, rate: 2000 / 30.4375 });
  assert.equal(fast.ends.by, 'miles');
  const expired = warrantyStatus(basic, { inServiceDate: '2022-01-01', today: '2026-11-17', latest: { date: '2026-11-17', miles: 11000 }, rate: 13 });
  assert.equal(expired.active, false);
});

test('costs: by category, by year, and cost per mile since purchase', () => {
  const services = [
    { date: '2026-11-20', cost: 80, category: 'Oil' },
    { date: '2027-03-01', cost: 40, category: 'Tires' },
    { date: '2027-11-20', cost: 90, category: 'Oil' },
  ];
  const c = costSummary(services, { purchaseMiles: 11000, currentMiles: 16000 });
  assert.equal(c.total, 210);
  assert.equal(c.byCategory.Oil, 170);
  assert.equal(c.byYear['2027'], 130);
  assert.equal(c.perMile, 210 / 5000);
});

test('MPG between full fill-ups', () => {
  const m = mpgLog([
    { id: 1, date: '2026-11-18', miles: 11000, gallons: 10, full: true },
    { id: 2, date: '2026-11-25', miles: 11150, gallons: 4, full: false },
    { id: 3, date: '2026-12-02', miles: 11300, gallons: 6, full: true },
  ]);
  assert.equal(m.entries.length, 1);
  assert.equal(m.entries[0].mpg, 30);
  assert.equal(m.average, 30);
});

test('every spec, interval and recall has a source link or a Verify label', () => {
  const srcOk = (o, ctxName) => {
    if (o.verify) return;
    assert.ok(o.src, `${ctxName} has no source or verify label`);
    assert.ok(car.sources[o.src], `${ctxName} points to unknown source "${o.src}"`);
  };
  for (const g of car.specs) for (const r of g.rows) srcOk(r, `spec "${r.k}"`);
  srcOk(car.schedule, 'schedule');
  for (const n of car.schedule.notInSchedule) srcOk(n, `upsell "${n.name}"`);
  for (const w of car.warranty.items) srcOk(w, `warranty "${w.name}"`);
  srcOk(car.warranty.cpo, 'CPO warranty');
  srcOk(car.recalls, 'recalls');
  for (const r of car.recalls.items) srcOk(r, `recall ${r.campaign}`);
  for (const b of car.recalls.bulletins) srcOk(b, `bulletin ${b.id}`);
  srcOk(car.warningLights, 'warning lights');
  for (const h of [...car.howTos, ...car.howTosExtra]) srcOk(h, `how-to "${h.title}"`);
  for (const k of car.knowYourCar) srcOk(k, `know-your-car "${k.title}"`);
  for (const [k, v] of Object.entries(car.vehicle)) if (typeof v === 'object') srcOk(v, `vehicle ${k}`);
  for (const s of Object.values(car.sources)) assert.match(s.url, /^https:\/\//);
});

test('no personal data shipped in the car data', () => {
  const text = readFileSync(new URL('../data/car.json', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /\bJM1[A-Z0-9]{14}\b/, 'a VIN is in car.json');
});
