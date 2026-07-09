import { db } from '../db/index.js';
import { pollStats, checkExpiredPorts, reconcile } from '../manager/managerService.js';

let pollTimer = null;
let reconcileTimer = null;

function getConfig() {
  return db.prepare('SELECT poll_interval_ms, reconcile_interval_ms FROM manager_config WHERE id = 1').get();
}

function scheduleNext(fn, delayMs, timerRef) {
  return setTimeout(async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[scheduler] ${fn.name} failed:`, err.message);
    } finally {
      timerRef.current = scheduleNext(fn, getConfig()[timerRef.key], timerRef);
    }
  }, delayMs);
}

// Traffic stats and time-limit expiry are both cheap, DB-driven checks that
// fit naturally on the same cadence; run them together so a failure in one
// (e.g. manager unreachable) doesn't skip the other for this tick.
async function pollAndCheckExpiry() {
  const results = await Promise.allSettled([pollStats(), checkExpiredPorts()]);
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
}

export function startScheduler() {
  const cfg = getConfig();

  const pollRef = { current: null, key: 'poll_interval_ms' };
  pollRef.current = scheduleNext(pollAndCheckExpiry, cfg.poll_interval_ms, pollRef);
  pollTimer = pollRef;

  const reconcileRef = { current: null, key: 'reconcile_interval_ms' };
  reconcileRef.current = scheduleNext(reconcile, cfg.reconcile_interval_ms, reconcileRef);
  reconcileTimer = reconcileRef;
}

export function stopScheduler() {
  if (pollTimer) clearTimeout(pollTimer.current);
  if (reconcileTimer) clearTimeout(reconcileTimer.current);
}
