/**
 * Credit Reset Runner
 * Resets all users in user_tracker.csv to a fixed credit amount on a schedule.
 * Uses server time — checks every minute whether a reset boundary has been crossed
 * (midnight for day, Monday midnight for week, 1st of month for month, top of hour,
 * or top of minute). Stores last reset timestamp in credit_reset_state.json so a
 * server restart never causes a double-reset or a missed reset.
 *
 * Usage:
 *   node credit_reset.js
 *
 * Config (env vars):
 *   RESET_INTERVAL   — minute | hour | day | week | month  (default: day)
 *   RESET_CREDITS    — credits to assign on reset        
 */

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const USER_TRACKER_PATH = path.resolve(__dirname, '../user_tracker.csv');
const STATE_PATH        = path.resolve(__dirname, '../credit_reset_state.json');
function resolveResetCredits() {
  var raw = process.env.RESET_CREDITS;
  var cleaned = String(raw == null ? '' : raw).replace(/[,_\s]/g, '');
  var n = Number(cleaned);
  if (raw == null || String(raw).trim() === '' || !isFinite(n) || n < 0) {
    console.error('RESET_CREDITS is missing or invalid (got: ' + JSON.stringify(raw) + '). Set a valid non-negative number in .env, e.g. RESET_CREDITS=1000.');
    process.exit(1);
  }
  return n;
}
const RESET_CREDITS = resolveResetCredits();
const RESET_INTERVAL    = (process.env.RESET_INTERVAL || 'day').toLowerCase();

if (!['minute', 'hour', 'day', 'week', 'month'].includes(RESET_INTERVAL)) {
  console.error(`❌ Invalid RESET_INTERVAL "${RESET_INTERVAL}". Must be: minute | hour | day | week | month`);
  process.exit(1);
}

// ── State helpers ─────────────────────────────────────────────────────────────

const loadLastReset = () => {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const { lastReset } = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      return lastReset ? new Date(lastReset) : null;
    }
  } catch { /* ignore corrupt state */ }
  return null;
};

const saveLastReset = (date) => {
  fs.writeFileSync(STATE_PATH, JSON.stringify({ lastReset: date.toISOString() }), 'utf8');
};

// ── Boundary helpers ──────────────────────────────────────────────────────────
// Returns the start of the current reset period (e.g. today's midnight for "day").
// A reset is due when lastReset < currentPeriodStart.

const currentPeriodStart = (now) => {
  const d = new Date(now);
  switch (RESET_INTERVAL) {
    case 'minute':
      d.setSeconds(0, 0);
      return d;
    case 'hour':
      d.setMinutes(0, 0, 0);
      return d;
    case 'day':
      d.setHours(0, 0, 0, 0);
      return d;
    case 'week': {
      // Monday 00:00
      const day = d.getDay(); // 0=Sun … 6=Sat
      const diff = (day === 0 ? -6 : 1 - day);
      d.setDate(d.getDate() + diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month':
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
  }
};

// ── Reset logic ───────────────────────────────────────────────────────────────

const resetCredits = () => {
  try {
    if (!fs.existsSync(USER_TRACKER_PATH)) {
      console.log(`ℹ️  user_tracker.csv not found — nothing to reset`);
      return;
    }

    const lines    = fs.readFileSync(USER_TRACKER_PATH, 'utf8').trim().split('\n').filter(Boolean);
    const header   = lines[0];
    const dataLines = lines.slice(1);

    if (dataLines.length === 0) {
      console.log(`ℹ️  No users in tracker — nothing to reset`);
      return;
    }

    const updated = dataLines.map(line => `${line.split(',')[0].trim()},${RESET_CREDITS}`);
    fs.writeFileSync(USER_TRACKER_PATH, [header, ...updated].join('\n') + '\n', 'utf8');

    const now = new Date();
    saveLastReset(now);
    console.log(`✅ [${now.toISOString()}] Reset ${updated.length} users to ${RESET_CREDITS} credits (interval: ${RESET_INTERVAL})`);
  } catch (err) {
    console.error('❌ Credit reset failed:', err.message);
  }
};

// ── Scheduler ─────────────────────────────────────────────────────────────────
// Checks every minute whether the current period start is after the last reset.

const tick = () => {
  const now         = new Date();
  const periodStart = currentPeriodStart(now);
  const lastReset   = loadLastReset();

  // Reset is due if we've never reset, or the period rolled over since last reset
  const due = !lastReset || lastReset < periodStart;

  if (due) {
    console.log(`⏰ [${now.toISOString()}] Reset boundary crossed — running reset`);
    resetCredits();
  }
};

console.log(`🔄 Credit reset runner started — interval: ${RESET_INTERVAL}, credits: ${RESET_CREDITS}`);
tick(); // check immediately on startup
setInterval(tick, 60 * 1000); // re-check every minute