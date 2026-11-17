# Mazda3 Care

A personal, offline maintenance tracker and car guide for a 2025 Mazda3 Hatchback 2.5 S. It's an installable web app (PWA). Your records stay on your phone: no account, no server, no tracking.

Car facts come from Mazda's 2025 Mazda3 owner's manual, Mazda's warranty pages, and NHTSA, with a source link on every fact (`data/car.json`). Not affiliated with Mazda.

## Install on your Android phone
1. Open the site in **Chrome** on the phone.
2. Tap **⋮ → Add to Home screen → Install**.
3. Open it from the home screen icon and fill in the setup screen: in-service date, miles, and optionally your VIN.
4. Test it once: turn on **airplane mode**, close the app fully (swipe it away), and reopen it. Everything should still work.

Tip: installing it is what lets Chrome protect the app's storage. You can check this under More → Backup & restore → Storage.

## Back up your data (do this monthly)
- **Save:** More → Backup & restore → **Save backup file**. Pick Google Drive, or email it to yourself.
- **Restore:** same screen → **Restore from backup file**. This also works on a new phone, from the setup screen.
- **Spreadsheet for a buyer:** **Export service history (CSV)**.
- The Home screen reminds you when your last backup is over 30 days old.

## Update the app
Phones pick up a new version automatically the next time the app opens with internet. An **Update ready → Reload** banner appears; your data is untouched.

To publish a change:
1. Edit the files.
2. Bump `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js`. If you add a file, also add it to `FILES` in `sw.js`.
3. Run the tests: `node --test`
4. Commit and push:
   ```
   git add -A
   git commit -m "Describe the change"
   git push
   ```
5. GitHub Pages republishes within a minute or two.

## Deploy your own copy (free, GitHub Pages)
1. Create a **public** repository on GitHub and push this folder to the `main` branch.
2. Open the repository's **Settings → Pages**.
3. Under Source choose **Deploy from a branch**, then branch `main`, folder `/ (root)`, and **Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

Cloudflare Pages and Netlify also work: connect the repository, leave the build command empty, and set the output folder to `/`.

## Develop and test
- Tests (Node 18+): `node --test`. They cover the schedule logic, warranty, costs, MPG, and a check that every fact has a source or a "Verify" label.
- Local preview: `python -m http.server 8765`, then open http://localhost:8765.
- While editing locally, the offline cache serves old files. In Chrome DevTools, go to Application → Service workers and tick "Update on reload".
- Data structure changes go in `js/db.js`: bump `DATA_VERSION` and add a migration. Never delete stores, so updates never wipe data.

## Privacy
- Nothing personal is in this code. Your VIN, dates, records, and photos are stored only in your phone's browser storage (IndexedDB).
- The app only goes online when you tap a button that says it needs internet:
  - recall check (NHTSA)
  - VIN check (sends your VIN to NHTSA)
  - Google Calendar links
