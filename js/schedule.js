// Pure schedule logic. No DOM, no storage: everything comes in as arguments.
// Dates are 'YYYY-MM-DD' strings in storage and Date objects (local noon) inside.

export const DAY = 86400000;
export const AVG_MONTH_DAYS = 30.4375;
export const DEFAULT_MILES_PER_MONTH = 400;
export const SOON_MILES = 1000;
export const SOON_DAYS = 30;

export function parseDate(s) {
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate(), 12);
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function isoDate(d) {
  const x = parseDate(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function addMonths(date, months) {
  const d = parseDate(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}
export function addDays(date, days) {
  // calendar days (not milliseconds) so daylight-saving changes never shift the date
  const d = parseDate(date);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

/** All odometer readings, including those implied by service and fuel records. */
export function allReadings({ odometer = [], services = [], fuel = [], car = {} }) {
  const r = [];
  for (const o of odometer) if (o.miles > 0 && o.date) r.push({ date: o.date, miles: +o.miles });
  for (const s of services) if (s.miles > 0 && s.date) r.push({ date: s.date, miles: +s.miles });
  for (const f of fuel) if (f.miles > 0 && f.date) r.push({ date: f.date, miles: +f.miles });
  if (car.purchaseMiles > 0 && car.purchaseDate) r.push({ date: car.purchaseDate, miles: +car.purchaseMiles });
  return r.sort((a, b) => parseDate(a.date) - parseDate(b.date) || a.miles - b.miles);
}

/** Highest odometer value seen (odometers only go up). */
export function latestReading(readings) {
  if (!readings.length) return null;
  return readings.reduce((best, r) => (r.miles > best.miles || (r.miles === best.miles && parseDate(r.date) > parseDate(best.date)) ? r : best));
}

/**
 * Average miles per day from real readings over (up to) the last 180 days.
 * Needs at least 30 days between readings; otherwise uses the owner's estimate.
 */
export function milesPerDay(readings, { milesPerMonth } = {}) {
  const fallback = (milesPerMonth > 0 ? milesPerMonth : DEFAULT_MILES_PER_MONTH) / AVG_MONTH_DAYS;
  const latest = latestReading(readings);
  if (!latest) return { rate: fallback, source: 'estimate' };
  const windowStart = addDays(latest.date, -180);
  const older = readings.filter(r => parseDate(r.date) < parseDate(latest.date) && r.miles < latest.miles);
  let start = older.find(r => parseDate(r.date) >= windowStart) || older[older.length - 1];
  if (start && daysBetween(start.date, latest.date) < 30) {
    // too short inside the window: try the newest reading that is at least 30 days old
    start = [...older].reverse().find(r => daysBetween(r.date, latest.date) >= 30);
  }
  if (!start) return { rate: fallback, source: 'estimate' };
  const days = daysBetween(start.date, latest.date);
  const rate = (latest.miles - start.miles) / days;
  if (!(rate > 0) || rate > 300) return { rate: fallback, source: 'estimate' };
  return { rate, source: 'measured', days };
}

/** Best guess of the odometer on a given date. */
export function estimateMiles(date, latest, rate) {
  if (!latest) return 0;
  const d = daysBetween(latest.date, date);
  return Math.round(latest.miles + Math.max(0, d) * rate);
}

function intervalsFor(item, mode) {
  const severe = mode === 'severe';
  return {
    miles: severe && item.severeMiles ? item.severeMiles : item.miles ?? null,
    months: severe && item.severeMonths ? item.severeMonths : item.months ?? null,
  };
}

/** Newest service record that included this schedule item. */
export function lastDone(itemId, services) {
  let best = null;
  for (const s of services) {
    if (!s.itemIds || !s.itemIds.includes(itemId)) continue;
    if (!best || parseDate(s.date) > parseDate(best.date) || (s.date === best.date && (s.miles || 0) > (best.miles || 0))) best = s;
  }
  return best;
}

/**
 * Status of one schedule item, "whichever comes first".
 * ctx: { today, mode, car:{inServiceDate, historyKnown}, services, latest:{date,miles}, rate }
 * status: 'baseline' (history unknown and already past first due point), 'overdue', 'soon', 'ok'
 */
export function itemStatus(item, ctx) {
  const today = parseDate(ctx.today);
  const iv = intervalsFor(item, ctx.mode);
  const current = ctx.latest ? estimateMiles(today, ctx.latest, ctx.rate) : 0;
  const last = lastDone(item.id, ctx.services || []);
  let baseMiles, baseDate, fromNew = false, dueMilesInt = iv.miles, dueMonthsInt = iv.months;

  if (last) {
    baseMiles = +last.miles || estimateMiles(last.date, ctx.latest, ctx.rate);
    baseDate = parseDate(last.date);
  } else {
    fromNew = true;
    baseMiles = 0;
    baseDate = parseDate(ctx.car?.inServiceDate || ctx.today);
    if (item.firstMiles) dueMilesInt = item.firstMiles;
    if (item.firstMonths) dueMonthsInt = item.firstMonths;
  }

  const dueMiles = dueMilesInt ? baseMiles + dueMilesInt : null;
  const dueDate = dueMonthsInt ? addMonths(baseDate, dueMonthsInt) : null;
  const milesLeft = dueMiles != null ? dueMiles - current : null;
  const daysLeft = dueDate ? daysBetween(today, dueDate) : null;
  const milesDate = milesLeft != null ? addDays(today, Math.max(milesLeft, 0) / ctx.rate) : null;

  let effectiveDate = null, trigger = null;
  if (dueDate && milesDate) {
    if (milesDate < dueDate) { effectiveDate = milesDate; trigger = 'miles'; } else { effectiveDate = dueDate; trigger = 'time'; }
  } else if (dueDate) { effectiveDate = dueDate; trigger = 'time'; }
  else if (milesDate) { effectiveDate = milesDate; trigger = 'miles'; }
  const effDays = effectiveDate ? daysBetween(today, effectiveDate) : null;

  const pastDue = (milesLeft != null && milesLeft <= 0) || (daysLeft != null && daysLeft <= 0);
  let status;
  if (pastDue && fromNew && !ctx.car?.historyKnown) status = 'baseline';
  else if (pastDue) status = 'overdue';
  else if ((milesLeft != null && milesLeft <= SOON_MILES) || (effDays != null && effDays <= SOON_DAYS)) status = 'soon';
  else status = 'ok';

  // share of the interval used (0..1+), whichever is further along
  const usedMiles = dueMilesInt ? (current - baseMiles) / dueMilesInt : 0;
  const usedTime = dueMonthsInt ? daysBetween(baseDate, today) / (dueMonthsInt * AVG_MONTH_DAYS) : 0;
  const used = Math.max(usedMiles, usedTime, 0);

  return {
    id: item.id, name: item.name, item, status, fromNew, last,
    intervalMiles: iv.miles, intervalMonths: iv.months,
    dueMiles, dueDate: dueDate && isoDate(dueDate), milesLeft, daysLeft,
    effectiveDate: effectiveDate && isoDate(effectiveDate), effectiveDays: effDays, trigger,
    used, currentMiles: current,
  };
}

const ORDER = { overdue: 0, baseline: 1, soon: 2, ok: 3 };

/** Every item, sorted most urgent first. */
export function scheduleStatus(items, ctx) {
  // baseline items keep Mazda's order (oil first); everything else sorts by soonest
  return items.map((i, n) => ({ ...itemStatus(i, ctx), order: n })).sort((a, b) =>
    ORDER[a.status] - ORDER[b.status] ||
    (a.status === 'baseline' ? a.order - b.order : (a.effectiveDays ?? 1e9) - (b.effectiveDays ?? 1e9)));
}

/**
 * Projected future services for the timeline, grouped by month.
 * Baseline/overdue items are assumed done today, then repeat on their regular intervals.
 */
export function forecast(items, ctx, { years = 5 } = {}) {
  const today = parseDate(ctx.today);
  const horizon = addMonths(today, years * 12);
  const events = [];
  for (const item of items) {
    const st = itemStatus(item, ctx);
    const iv = intervalsFor(item, ctx.mode);
    let date = st.status === 'baseline' || st.status === 'overdue' ? today : parseDate(st.effectiveDate);
    if (!st.effectiveDate && st.status !== 'baseline' && st.status !== 'overdue') continue;
    let guard = 0;
    while (date <= horizon && guard++ < 60) {
      const miles = estimateMiles(date, ctx.latest, ctx.rate);
      events.push({ id: item.id, name: item.name, date: isoDate(date), miles, now: date <= today });
      // next occurrence: whichever comes first from this one
      const byTime = iv.months ? addMonths(date, iv.months) : null;
      const byMiles = iv.miles ? addDays(date, iv.miles / ctx.rate) : null;
      const next = byTime && byMiles ? (byTime < byMiles ? byTime : byMiles) : byTime || byMiles;
      if (!next) break;
      date = next;
    }
  }
  events.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  const groups = [];
  for (const e of events) {
    const key = e.now ? 'now' : e.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, date: e.date, miles: e.miles, items: [] }; groups.push(g); }
    if (!g.items.some(x => x.id === e.id)) g.items.push(e);
    g.miles = Math.max(g.miles, e.miles);
  }
  return groups;
}

/** Warranty coverage left, counted from the original in-service date. */
export function warrantyStatus(w, { inServiceDate, today, latest, rate, startOffset }) {
  const start = startOffset?.date ? parseDate(startOffset.date) : parseDate(inServiceDate);
  const startMiles = startOffset?.miles || 0;
  const endDate = addMonths(start, w.months);
  const endMiles = startMiles + w.miles;
  const current = latest ? estimateMiles(today, latest, rate) : 0;
  const milesLeft = endMiles - current;
  const daysLeft = daysBetween(today, endDate);
  const milesEndDate = addDays(today, Math.max(milesLeft, 0) / rate);
  const ends = milesEndDate < endDate ? { date: isoDate(milesEndDate), by: 'miles' } : { date: isoDate(endDate), by: 'time' };
  const notStarted = parseDate(today) < start && current < startMiles;
  const active = !notStarted && milesLeft > 0 && daysLeft > 0;
  const used = Math.min(1, Math.max(0, (current - startMiles) / w.miles, daysBetween(start, today) / (w.months * AVG_MONTH_DAYS)));
  return { ...w, startDate: isoDate(start), startMiles, endDate: isoDate(endDate), endMiles, milesLeft, daysLeft, ends, active, notStarted, used };
}

/** Costs grouped by category and year, plus cost per mile since purchase. */
export function costSummary(services, { purchaseMiles = 0, currentMiles = 0, fuel = [] } = {}) {
  const byCategory = {}, byYear = {};
  let total = 0;
  for (const s of services) {
    if (s.isPastRecord && s.excludeFromCosts) continue;
    const c = +s.cost || 0;
    if (!c) continue;
    total += c;
    const cat = s.category || 'Other';
    byCategory[cat] = (byCategory[cat] || 0) + c;
    const y = String(s.date).slice(0, 4);
    byYear[y] = (byYear[y] || 0) + c;
  }
  let fuelTotal = 0;
  for (const f of fuel) {
    const c = +f.total || 0;
    fuelTotal += c;
    const y = String(f.date).slice(0, 4);
    if (c) byYear[y] = (byYear[y] || 0) + c;
  }
  const driven = Math.max(0, currentMiles - purchaseMiles);
  return {
    total, fuelTotal, byCategory, byYear, driven,
    perMile: driven > 0 ? total / driven : null,
    perMileWithFuel: driven > 0 ? (total + fuelTotal) / driven : null,
  };
}

/** MPG between full fill-ups. */
export function mpgLog(fuel) {
  const sorted = [...fuel].sort((a, b) => a.miles - b.miles);
  const out = [];
  let lastFull = null, gallonsSince = 0;
  for (const f of sorted) {
    gallonsSince += +f.gallons || 0;
    if (f.full) {
      if (lastFull && f.miles > lastFull.miles && gallonsSince > 0) {
        const dist = f.miles - lastFull.miles;
        out.push({ id: f.id, date: f.date, miles: f.miles, dist, gallons: gallonsSince, mpg: dist / gallonsSince });
      }
      lastFull = f; gallonsSince = 0;
    }
  }
  const dist = out.reduce((a, x) => a + x.dist, 0), gal = out.reduce((a, x) => a + x.gallons, 0);
  return { entries: out, average: gal ? dist / gal : null };
}
