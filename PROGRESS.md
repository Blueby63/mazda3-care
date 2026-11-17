# Mazda3 Care: progress and decisions

Personal offline PWA for a 2025 Mazda3 Hatchback 2.5 S. Car facts and sources live in `data/car.json`. **Don't research them again.** Add to that file instead.

## Status
- **Phase 1 (research + plan): DONE 2026-11-17.**
- **Phase 2 (build): DONE 2026-11-17.** All must-haves plus fuel/MPG, cost charts, and the documents vault. The owner picked **Direction B (Cluster)**. Waiting for the go-ahead on Phase 3.
- **Phase 3 (deploy + hand-off): DONE 2026-11-17.**
  - Live at https://blueby63.github.io/mazda3-care/
  - Repo: https://github.com/Blueby63/mazda3-care (public, GitHub Pages from `main` / root, `.nojekyll`)
  - Commits use the owner's GitHub noreply address (set in this repo's local git config).
  - Pushing from Claude's shell fails because Git Credential Manager needs an interactive sign-in. Push from the Terminal panel; after the first sign-in the credential is cached.
  - Install, update, and backup steps for the owner are in README.md.
  - Remaining owner checks on the phone: install, the airplane-mode test, the first backup, and confirming the "Verify" items.

## Phase 2 decisions
- The owner's history report was reviewed: no service records, "Estimated In Service" date shown, one owner, no open recalls listed. **Personal details (VIN, dates) are NOT stored in the repo.** The owner enters them in the app.
- The VIN decode (NHTSA vPIC) matched: 2025 Mazda3 hatchback, 2.5 L, 191 hp, cylinder deactivation, FWD. Source is in car.json as `nhtsa-vpic`, with no VIN in the URL.
- The car was once listed as Mazda CPO. Coverage is unconfirmed, so the Warranty screen has a "dealer confirmed CPO" checkbox that shows the CPO coverage (7 yr/100k powertrain, 12 mo/12k after the basic warranty).
- The flat tire kit item was removed from the schedule because the 2.5 S has a temporary spare (see `_tireKitNote` in car.json).
- Check engine light set to "pull over now" to match the manual's wording.
- Google Calendar on Android can't import .ics files, so Reminders offers both an .ics download (Samsung Calendar, Outlook) and per-item Google Calendar links.
- Date math uses calendar days. Millisecond math shifted dates across DST; a test caught it.

## How to run and test
- Tests: `node --test` from the project root (Node 18+). 18 tests cover:
  - whichever-first logic
  - due-soon and overdue
  - projections
  - resets after a service
  - the baseline
  - severe mode and coolant
  - forecast, warranty, costs, MPG
  - a data check that every fact has a source or a Verify label
  - a no-VIN check
- Local preview: `python -m http.server 8765` (or the `.claude/launch.json` entry), then open http://localhost:8765.
  - The service worker caches files. While developing, unregister it in DevTools (Application tab), or bump `VERSION` in `sw.js`.
- Manual checks done in Phase 2:
  - All 21 screens render with no console errors.
  - Logging a service with a photo works (a 4000×3000 photo was compressed to 91 KB).
  - Mileage, fuel, and warranty forms save correctly.
  - Export, erase, and import restores identical data, including photos.
  - Data survives a reload.
  - With the server stopped, the app loads fully from the cache.
  - Bumping the version shows "Update ready", and Reload swaps caches while keeping the data.
  - NHTSA recall and VIN calls work from the app's origin (CORS OK).

## Shipping an update
1. Edit the files.
2. Bump `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js`.
3. If you add a file, add it to `FILES` in `sw.js`.
4. If the record shape changes, bump `DATA_VERSION` in `db.js` and add a `dataMigrations[n]` function. Never drop stores.

## Budget used (Phase 1)
- Car searches: 7 of 15. Design searches: 2 of 5.
- Page fetches: 5 page loads (manual maintenance pages, NHTSA recalls API, Mazda warranty page). About 50 short sections of the owner's manual (specs, warning lights, how-tos) were pulled with one in-page script that kept only the needed text. The full manual PDF was never downloaded.

- Phase 2: 1 more search (Mazda CPO terms) and 1 fetch (NHTSA VIN decode). Totals: 8 of 15 car searches, 2 of 5 design searches.

## Key findings (decisions follow from these)
- **US schedule is "flexible".** The wrench light decides when oil is due, with a hard limit of 10,000 mi or 12 months. Severe = oil every 5,000 mi / 6 months. Mazda's US severe list covers only long idling/low speed, unpaved roads, and mountains. **Recommendation: Normal**, and obey the wrench light. Driving 300-500 mi a month means the 12-month limit usually arrives first.
- Visit-based items: every visit (oil, rotation, basic inspection); every 2nd (underbody inspection); every 3rd (engine air filter = 30k mi / 36 mo); every 4th (exhaust/emission hoses). Cabin filter 30k/24 mo, spark plugs 75k, coolant at 120k/120 mo and then every 60k/60 mo.
- **Not scheduled** (upsell list): ATF change ("periodic replacement unnecessary"), brake fluid flush (US schedule has none), fuel/injector cleaning, early coolant flush, 3k-mile oil changes.
- The 2.5 S has **cylinder deactivation**, which sets the specific spark plug (P5SP-18110), ATF (A7), and coolant amount (6.9 L).
- Lights are all LED (no bulbs to buy, except possibly WY5W parking/side markers).
- Recall **25V357000 / Mazda 7525E** (air bag sensor) covers Mazda3s built May 25 2023 to Jan 15 2025. A 2025 car may or may not be included, so check the VIN.
- Warranty: 3 yr/36k basic, 5 yr/60k powertrain, both counted from the **original in-service date**.
- Still unverified (labeled "Verify" in the data): oil filter part number (catalog only), air and cabin filter part numbers, wiper sizes, key fob battery type, EPA mpg.

## Design research (short)
- Touch targets: Apple 44 pt, Google 48 dp. **Use 48 px minimum, with 56 px for the main buttons.** Text contrast must be at least 4.5:1 (WCAG AA). Dark mode follows the system setting (`prefers-color-scheme`).
- Apps reviewed:
  - CARFAX Car Care: good automatic reminders and service history, but only from shops that report to CARFAX.
  - Drivvo: strong on costs, but crowded with entry types and ads.
  - Fuelio: excellent fuel log.
  - Simply Auto: clean layout.
- Takeaways: lead with "what's due", keep logging to one screen, avoid ad-style clutter and deep menus.

## Plan: screens
Bottom navigation: **Home · Schedule · Log · Guide · More**
1. **Home**: odometer, "Next up" (top 3 items with miles and days left), an overdue banner, the baseline checklist (until done), and big **Log service** and **Update mileage** buttons. It also shows a backup reminder after 30 days.
2. **Schedule**: Normal/Severe switch (with an explanation), every item with its whichever-first status, and a milestone timeline (20k, 30k, 40k…) with dates projected from real driving.
3. **Log**: the service and repair list, a fast add form, and record details.
   - Add form: date defaults to today, mileage defaults to the last reading, quick-pick checklist of schedule items, shop/DIY, cost, parts, notes, receipt photo.
   - Records can be marked "past record" to enter old paperwork.
4. **Guide** (offline):
   - Specs
   - Warning lights (red "pull over now", amber "book service", grey "easy fix")
   - How-tos
   - Know your car
   - Recalls and known issues, with a "Check for new recalls" link to NHTSA and Mazda
   - Before the shop: what's required now vs. common upsells
5. **More**:
   - Costs: totals by category and year, cost per mile
   - Warranty
   - Reminders: .ics export
   - Backup: JSON export/import, CSV export
   - Car setup: VIN, in-service date, purchase date and miles
   - Optional VIN decode via NHTSA when online
   - Nice-to-haves if approved: fuel/MPG log, cost charts, documents vault
- First launch: a setup wizard for car details, the schedule mode, and "what records do you have?". This screen also requests persistent storage.

## Plan: data model (IndexedDB `mazda3care`, schema v1)
| Store | Key | Fields |
|---|---|---|
| `meta` | key | `schemaVersion`, `lastBackupAt`, `setupDone` |
| `car` | `"car"` | `vin`, `nickname`, `inServiceDate`, `purchaseDate`, `purchaseMiles`, `scheduleMode` (normal/severe), `milesPerMonthOverride` |
| `odometer` | id | `date`, `miles`, `source` (manual/service/fuel) |
| `services` | id | `date`, `miles`, `itemIds[]` (schedule items it resets), `title`, `kind` (maintenance/repair/inspection/recall/other), `where` (dealer/shop/diy), `shopName`, `cost`, `category`, `parts[{name, partNo, qty, cost}]`, `notes`, `receiptFileId`, `isPastRecord` |
| `files` | id | `blob` (receipt photos are JPEG-compressed to about 1600 px wide, around 200 KB each), `mime`, `size`, `name` |
| `warranties` | id | User-added extended warranties: `name`, `provider`, `startDate`, `startMiles`, `months`, `miles`, `cost`, `notes`. Factory coverage is computed from car.json and `inServiceDate`. |
| `fuel` (optional) | id | `date`, `miles`, `gallons`, `pricePerGal`, `fullTank` |

- Migrations: `db.js` holds an ordered list `migrations[n]`, run inside `onupgradeneeded`. Data is never dropped. Imports pass through the same migrations.

## Schedule logic (pure functions in `js/schedule.js`, tested with `node --test`)
- **Last done** for each item: the newest service whose `itemIds` include the item.
- **Due:**
  - dueMiles = lastMiles + interval
  - dueDate = lastDate + months
  - Whichever comes first is the earlier of dueDate and the projected date of dueMiles.
- **Projection:** average miles per day from odometer readings over the last 180 days. If there are fewer than 2 readings, use 400 mi/month or the user's override.
- **Status:**
  - Overdue: past either limit.
  - Due soon: within 1,000 mi or 30 days.
  - OK: everything else.
- **Unknown-history baseline:**
  - If an item has no record and its first interval from new (counted from the in-service date at 0 mi) has not passed, count it from new.
  - If the first interval has passed (oil, rotation, inspection at 11k mi; cabin filter after 24 mo), mark it **"Unknown, do now to set a baseline"**.
  - The baseline list also includes: check recall 7525E, test the battery, check tire tread and pressure, and check the date on the tire repair kit.
- Coolant uses `firstMiles`/`firstMonths`, then the regular interval.

## Tech decisions
- Plain HTML/CSS/JS ES modules, no build step and no libraries. Charts are hand-made SVG. System font stack only.
- `sw.js` caches the app shell and car.json under a versioned cache name. Pages load cache-first. A new version installs in the background and shows an "Update ready, tap to reload" prompt.
- `navigator.storage.persist()` is requested during setup.
- No personal data in code. The VIN and dates are entered in the app.
- Reminders: in-app alerts when the app opens, plus an .ics file with VALARM entries for the next due items. A PWA can't reliably notify while closed without a server, so the calendar file is the dependable reminder.

## Open questions for the owner
See the Phase 1 report in chat: design direction, nice-to-haves, hosting choice, and the in-service date source.

## Files
- `index.html`, `manifest.webmanifest`, `sw.js`: app shell, install info, offline cache
- `css/app.css`: Direction B styles, light and dark
- `js/schedule.js`: pure schedule, warranty, cost, and MPG logic (tested)
- `js/db.js`: IndexedDB, migrations, backup export/import
- `js/state.js`: loaded data and computed status
- `js/ui.js`: shared UI pieces
- `js/util.js`: formatting, .ics, CSV, photo compression
- `js/app.js`: router, events, service worker registration
- `js/views/`: `home`, `schedule`, `log`, `guide`, `more` (setup, costs, fuel, warranty, reminders, docs, backup, mileage, about)
- `data/car.json`: all car facts and sources
- `tests/schedule.test.js`: automated tests
- `icons/`: SVG and PNG icons (PNGs generated with System.Drawing)
- `preview/home-directions.html`: Phase 1 visual directions (not part of the app; fine to delete)
