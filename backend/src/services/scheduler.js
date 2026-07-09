import { db } from '../db/index.js';
import { pollStats, reconcile } from '../manager/managerService.js';

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

export function startScheduler() {
  const cfg = getConfig();

  const pollRef = { current: null, key: 'poll_interval_ms' };
  pollRef.current = scheduleNext(pollStats, cfg.poll_interval_ms, pollRef);
  pollTimer = pollRef;

  const reconcileRef = { current: null, key: 'reconcile_interval_ms' };
  reconcileRef.current = scheduleNext(reconcile, cfg.reconcile_interval_ms, reconcileRef);
  reconcileTimer = reconcileRef;
}

export function stopScheduler() {
  if (pollTimer) clearTimeout(pollTimer.current);
  if (reconcileTimer) clearTimeout(reconcileTimer.current);
}
