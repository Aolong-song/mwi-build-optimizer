// Rank batch results by key shards / hour and produce a display table.

import { computeKeyShardsPerHour, primaryKeyFragmentForZone } from './keyShardMetric.js';
import actionDetailMap from '../../simulator/combatsimulator/data/actionDetailMap.json';
import { zoneNameZh, itemNameZh } from './gameNames.js';

const ONE_HOUR = 3600 * 1e9;

function manaMetrics(simResult, hours) {
  const out = {};
  for (const player of ['player1', 'player2', 'player3']) {
    const spent = Object.values(simResult.manaUsed?.[player] || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const oomTime = Number(simResult.playerRanOutOfManaTime?.[player]?.totalTimeForOutOfMana) || 0;
    out[player] = {
      spent,
      spentPerHour: spent / (hours || 1),
      ranOut: !!simResult.playerRanOutOfMana?.[player],
      oomPercent: Math.min(100, 100 * oomTime / (simResult.simulatedTime || 1)),
    };
  }
  return out;
}

export function enrichResults(batchResults) {
  return batchResults.map(r => {
    if (!r.ok) {
      return { ...r, keysPerHour: 0, totalKeysExpected: 0, encountersPerHour: 0, deathsPerHour: 0, keyName: '-' };
    }
    const metric = computeKeyShardsPerHour(r.simResult, 'player1');
    const hours = r.simResult.simulatedTime / ONE_HOUR;
    const encountersPerHour = (r.simResult.encounters || 0) / (hours || 1);
    const deaths = r.simResult.deaths && r.simResult.deaths.player1 || 0;
    const keyInfo = primaryKeyFragmentForZone(r.combo.zoneHrid);
    return {
      ...r,
      keysPerHour: metric.keysPerHour,
      totalKeysExpected: metric.totalKeysExpected,
      fragmentCounts: metric.fragmentCounts,
      encountersPerHour,
      deathsPerHour: deaths / (hours || 1),
      keyName: keyInfo ? itemNameZh(keyInfo.fragmentHrid, keyInfo.fragmentName) : '?',
      hours,
      mana: manaMetrics(r.simResult, hours),
    };
  });
}

export function rankByKeysPerHour(enriched) {
  return enriched.slice().sort((a, b) => (b.keysPerHour || 0) - (a.keysPerHour || 0));
}

// Keep each map together for side-by-side comparison. Within a map, the best
// build / consumable arrangement is first; tiers remain adjacent to their map.
export function groupByZoneForDisplay(enriched, sortField = 'keysPerHour', sortDirection = 'desc') {
  const direction = sortDirection === 'asc' ? 1 : -1;
  return enriched.slice().sort((a, b) => {
    const zone = zoneNameZh(a.combo.zoneHrid).localeCompare(zoneNameZh(b.combo.zoneHrid), 'zh-CN');
    if (zone !== 0) return zone;
    const aValue = Number(a[sortField]) || 0;
    const bValue = Number(b[sortField]) || 0;
    const metric = direction * (aValue - bValue);
    if (metric !== 0) return metric;
    return (a.combo.difficultyTier || 0) - (b.combo.difficultyTier || 0);
  });
}

export function toCsv(rows, runOptions = {}) {
  const header = ['rank', 'userA', 'userB', 'userC', 'zone', 'zoneNameZh', 'difficultyTier', 'key', 'totalKeysExpected', 'keysPerHour', 'combatDropQuantityBuff', 'userAFoods', 'userADrinks', 'userAEquipment', 'userASkills', 'userAManaPerHour', 'userARanOutOfMana', 'userAOomPercent', 'userBFoods', 'userBDrinks', 'userBEquipment', 'userBSkills', 'userBManaPerHour', 'userBRanOutOfMana', 'userBOomPercent', 'userCFoods', 'userCDrinks', 'userCEquipment', 'userCSkills', 'userCManaPerHour', 'userCRanOutOfMana', 'userCOomPercent', 'encountersPerHour', 'deathsPerHour', 'hours', 'ok', 'error'];
  const lines = [header.join(',')];
  rows.forEach((r, i) => {
    const cells = [
      i + 1,
      r.combo.users.userA,
      r.combo.users.userB,
      r.combo.users.userC,
      r.combo.zoneHrid,
      zoneNameZh(r.combo.zoneHrid),
      r.combo.difficultyTier,
      r.keyName,
      (r.totalKeysExpected || 0).toFixed(6),
      (r.keysPerHour || 0).toFixed(6),
      runOptions.combatDropQuantityBuff ? '1' : '0',
      ...['userA', 'userB', 'userC'].flatMap((uid, index) => [
        '"' + ((r.combo.combatConsumables?.[uid]?.labels?.foods || []).join(' + ')).replace(/"/g, '""') + '"',
        '"' + ((r.combo.combatConsumables?.[uid]?.labels?.drinks || []).join(' + ')).replace(/"/g, '""') + '"',
        '"' + (r.combo.exportBuilds?.[uid]?.equipment || '').replace(/"/g, '""') + '"',
        '"' + (r.combo.exportBuilds?.[uid]?.skills || '').replace(/"/g, '""') + '"',
        (r.mana?.['player' + (index + 1)]?.spentPerHour || 0).toFixed(4),
        r.mana?.['player' + (index + 1)]?.ranOut ? '1' : '0',
        (r.mana?.['player' + (index + 1)]?.oomPercent || 0).toFixed(4),
      ]),
      (r.encountersPerHour || 0).toFixed(2),
      (r.deathsPerHour || 0).toFixed(2),
      (r.hours || 0).toFixed(2),
      r.ok ? '1' : '0',
      r.error ? '"' + (r.error + '').replace(/"/g, '""') + '"' : '',
    ];
    lines.push(cells.join(','));
  });
  return lines.join('\n');
}

export function toExportJson(library, picks, zones, ranked, runOptions = {}) {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    runOptions: {
      simulationHours: runOptions.simulationHours || null,
      combatDropQuantityBuff: !!runOptions.combatDropQuantityBuff,
      combatDropQuantityBonus: runOptions.combatDropQuantityBuff ? 0.295 : 0,
      combatConsumables: runOptions.combatConsumables || null,
    },
    picks,
    zones: zones.map(z => ({ hrid: z.hrid, difficultyTier: z.difficultyTier || 0 })),
    rankings: ranked.map((r, i) => ({
      rank: i + 1,
      combo: r.combo,
      zoneNameZh: zoneNameZh(r.combo.zoneHrid),
      keysPerHour: r.keysPerHour,
      totalKeysExpected: r.totalKeysExpected,
      encountersPerHour: r.encountersPerHour,
      deathsPerHour: r.deathsPerHour,
      mana: r.mana,
      keyName: r.keyName,
      ok: r.ok,
      error: r.error,
    })),
    library: library,
  }, null, 2);
}
