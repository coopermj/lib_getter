require('dotenv').config();
const app  = require('./app');
const { scanAllActiveBooks } = require('./scanner');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`lib_getter running on http://localhost:${PORT}`));

// ── Background scans ──────────────────────────────────────────────────────────
// SCAN_INTERVAL_MINUTES=180 scans every active book every 3 hours and notifies on
// newly-available titles (see notify.js). Unset or 0 disables it.
const intervalMinutes = Number(process.env.SCAN_INTERVAL_MINUTES) || 0;

if (intervalMinutes > 0) {
  let running = false;
  const run = async () => {
    if (running) return; // don't overlap if a scan outlasts the interval
    running = true;
    try {
      const { scanned, newlyAvailable } = await scanAllActiveBooks();
      console.log(`[scheduler] scanned ${scanned} book(s), ${newlyAvailable} newly available`);
    } catch (err) {
      console.error(`[scheduler] ${err.message}`);
    } finally {
      running = false;
    }
  };
  console.log(`[scheduler] scanning every ${intervalMinutes} minute(s)`);
  setInterval(run, intervalMinutes * 60 * 1000).unref();
  setTimeout(run, 30 * 1000).unref(); // first pass shortly after boot
}
