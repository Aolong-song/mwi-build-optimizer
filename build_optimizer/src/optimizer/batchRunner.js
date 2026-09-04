// Batch combat simulation runner.
// Builds (user1_build, user2_build, user3_build, zone) tuples and dispatches them
// across a pool of Web Workers, each running worker.js from the simulator.

import { parseBuildJson } from './playerFactory.js';
import actionDetailMap from '../../simulator/combatsimulator/data/actionDetailMap.json';

const ONE_HOUR = 3600 * 1e9;

// Resolve a build id -> parsed Player object via the simulator's parsePlayerJson.
function resolveBuildPlayer(library, userId, buildId, hrid) {
  const build = library.users[userId].builds[buildId];
  if (!build) throw new Error('Build missing for ' + userId + ': ' + buildId);
  return parseBuildJson(JSON.parse(build.json), hrid);
}

function abortError() {
  const error = new Error('批量模拟已取消');
  error.name = 'AbortError';
  return error;
}

function simulateOne(combo, library, opts) {
  return new Promise((resolve, reject) => {
    if (opts.signal && opts.signal.aborted) {
      reject(abortError());
      return;
    }
    const player1 = resolveBuildPlayer(library, 'userA', combo.users.userA, 'player1');
    const player2 = resolveBuildPlayer(library, 'userB', combo.users.userB, 'player2');
    const player3 = resolveBuildPlayer(library, 'userC', combo.users.userC, 'player3');
    const worker = new Worker(new URL('../../simulator/worker.js', import.meta.url));
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      worker.terminate();
      callback(value);
    };
    const onAbort = () => finish(reject, abortError());
    if (opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = (event) => {
      if (event.data.type === 'simulation_result') {
        finish(resolve, event.data.simResult);
      } else if (event.data.type === 'simulation_error') {
        finish(reject, new Error(event.data.error));
      }
    };
    worker.onerror = (e) => finish(reject, e);
    const simHours = opts.simulationHours || 24;
    const zoneDef = actionDetailMap[combo.zoneHrid];
    const zoneBuffs = (zoneDef && zoneDef.buffs) || [];
    player1.zoneBuffs = zoneBuffs;
    player2.zoneBuffs = zoneBuffs;
    player3.zoneBuffs = zoneBuffs;
    const players = [player1, player2, player3];
    const message = {
      simulationName: combo.label,
      type: 'start_simulation',
      workerId: String(combo.caseId),
      players,
      zone: { zoneHrid: combo.zoneHrid, difficultyTier: combo.difficultyTier || 0 },
      simulationTimeLimit: simHours * ONE_HOUR,
      // comDrop=20 is the upstream community-buff level that yields
      // 0.2 + (20 - 1) * 0.005 = 0.295 combat_drop_quantity.
      extra: { mooPass: false, comExp: 0, comDrop: opts.combatDropQuantityBuff ? 20 : 0 },
    };
    worker.postMessage(message);
  });
}

// Run a queue of combos with bounded concurrency.
// onProgress(completed, total, lastResult) is called after each completion.
export async function runBatch(combos, library, opts, onProgress) {
  const concurrency = Math.max(1, Math.min(opts.concurrency || navigator.hardwareConcurrency || 4, combos.length || 1));
  const results = new Array(combos.length);
  let cursor = 0;
  let completed = 0;
  let cancelled = false;

  async function worker() {
    while (true) {
      if (opts.signal && opts.signal.aborted) {
        cancelled = true;
        return;
      }
      const idx = cursor++;
      if (idx >= combos.length) return;
      try {
        const simResult = await simulateOne(combos[idx], library, opts);
        results[idx] = { combo: combos[idx], ok: true, simResult };
      } catch (e) {
        if ((opts.signal && opts.signal.aborted) || e.name === 'AbortError') {
          cancelled = true;
          return;
        }
        results[idx] = { combo: combos[idx], ok: false, error: e.message || String(e) };
      }
      completed++;
      if (onProgress) onProgress(completed, combos.length, results[idx]);
    }
  }

  const pool = [];
  for (let i = 0; i < concurrency; i++) pool.push(worker());
  await Promise.all(pool);
  return {
    results: results.filter(Boolean),
    cancelled,
    completed,
    total: combos.length,
  };
}


