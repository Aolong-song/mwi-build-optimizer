// Key fragment efficiency computation from a combat simulation result.
//
// Verified against data: 9 *_key_fragment items exist; each drops DIRECTLY from a
// specific monster in a specific dungeon; chest_keys inside dungeon chests are a
// separate ladder (chimerical/enchanted/pirate/sinister) and unrelated here.
// Every fragment entry uses dropRate + dropRatePerDifficultyTier to delay the first
// drop until tier >= 1 (baseRate is often negative; combined with perTier it
// crosses zero around tier 1). T0 drops always 0 fragments.
//
// Path 1: per-monster kills (simResult.deaths) × fragment dropRate formula.
//         This covers both regular spawns and dungeon waves.
// Path 2: dungeon reward chests are intentionally ignored — fragments never come
//         out of chimerical/enchanted/pirate/sinister chests.

import combatMonsterDetailMap from '../../simulator/combatsimulator/data/combatMonsterDetailMap.json';
import actionDetailMap from '../../simulator/combatsimulator/data/actionDetailMap.json';
import itemDetailMap from '../../simulator/combatsimulator/data/itemDetailMap.json';

const ONE_HOUR = 3600 * 1e9;

// Fragments are categorized by their hrid suffix and name ("Foo Key Fragment").
function isKeyFragment(itemHrid) {
  return typeof itemHrid === 'string' && itemHrid.endsWith('_key_fragment');
}

function fragmentName(itemHrid) {
  const it = itemDetailMap[itemHrid];
  return (it && it.name) || itemHrid;
}

// Shared walker used by both the zone selector and the metric function.
function monstersInZone(zoneHrid) {
  const zone = actionDetailMap[zoneHrid];
  if (!zone || !zone.combatZoneInfo) return new Map();
  const czi = zone.combatZoneInfo;
  const out = new Map(); // monsterHrid -> { isBoss: bool, via: [...] }

  function add(mhrid, via) {
    if (!mhrid) return;
    const existing = out.get(mhrid);
    if (existing) { existing.via.push(via); return; }
    out.set(mhrid, { isBoss: false, via: [via] });
  }

  const fight = czi.fightInfo;
  if (fight) {
    const spawns = (fight.randomSpawnInfo && fight.randomSpawnInfo.spawns) || [];
    spawns.forEach(s => add(s.combatMonsterHrid, 'randomSpawn'));
    (fight.bossSpawns || []).forEach(s => {
      add(s.combatMonsterHrid, 'bossSpawn');
      const e = out.get(s.combatMonsterHrid);
      if (e) e.isBoss = true;
    });
  }

  const dungeon = czi.dungeonInfo;
  if (dungeon) {
    if (dungeon.fixedSpawnsMap) {
      for (const wave of Object.values(dungeon.fixedSpawnsMap)) wave.forEach(m => add(m.combatMonsterHrid, 'dungeonFixedWave'));
    }
    if (dungeon.randomSpawnInfoMap) {
      for (const wave of Object.values(dungeon.randomSpawnInfoMap)) (wave.spawns || []).forEach(s => add(s.combatMonsterHrid, 'dungeonRandomWave'));
    }
  }
  return out;
}

// All key fragments that can be obtained from monsters in this zone.
// Returns one row per (monsterHrid, fragmentHrid) pair with raw drop data so the UI
// can show fragment + source monster + boss/regular tag.
export function keyFragmentsForZone(zoneHrid) {
  const zone = actionDetailMap[zoneHrid];
  const monsters = monstersInZone(zoneHrid);
  if (monsters.size === 0) return [];
  const out = [];
  for (const [mhrid, info] of monsters) {
    const mon = combatMonsterDetailMap[mhrid];
    if (!mon) continue;
    for (const tbl of [mon.dropTable, mon.rareDropTable]) {
      if (!tbl) continue;
      for (const drop of tbl) {
        if (!isKeyFragment(drop.itemHrid)) continue;
        out.push({
          monsterHrid: mhrid,
          monsterName: mon.name || mhrid,
          fragmentHrid: drop.itemHrid,
          fragmentName: fragmentName(drop.itemHrid),
          dropRate: drop.dropRate,
          dropRatePerDifficultyTier: drop.dropRatePerDifficultyTier || 0,
          minCount: drop.minCount,
          maxCount: drop.maxCount,
          minDifficultyTier: drop.minDifficultyTier,
          isBoss: info.isBoss,
          via: info.via,
        });
      }
    }
  }
  return out;
}

// The single fragment a UI label can use to describe a zone (most common one first).
export function primaryKeyFragmentForZone(zoneHrid) {
  const rows = keyFragmentsForZone(zoneHrid);
  if (rows.length === 0) return null;
  // Prefer boss drops because they're more reliable at higher tiers.
  rows.sort((a, b) => (b.isBoss - a.isBoss) || Math.abs(b.dropRatePerDifficultyTier) - Math.abs(a.dropRatePerDifficultyTier));
  const r = rows[0];
  return {
    fragmentHrid: r.fragmentHrid,
    fragmentName: r.fragmentName,
    monsterHrid: r.monsterHrid,
    monsterName: r.monsterName,
    isBoss: r.isBoss,
    dropRate: r.dropRate,
    dropRatePerDifficultyTier: r.dropRatePerDifficultyTier,
  };
}

// Compute key-fragments-per-hour from a simResult. Path 1 only — fragment drops
// are monster-driven, no chest/deepening loop needed.
export function computeKeyShardsPerHour(simResult, playerToDisplay = 'player1') {
  const empty = { keysPerHour: 0, fragmentCounts: {}, totalKeysExpected: 0, hours: 0 };
  if (!simResult || !simResult.deaths) return empty;
  const hours = simResult.simulatedTime / ONE_HOUR;
  if (hours <= 0) return empty;

  const dropRateMult = (simResult.dropRateMultiplier && simResult.dropRateMultiplier[playerToDisplay]) || 1;
  const combatDropQuantity = (simResult.combatDropQuantity && simResult.combatDropQuantity[playerToDisplay]) || 0;
  const debuffOnLevelGap = (simResult.debuffOnLevelGap && simResult.debuffOnLevelGap[playerToDisplay]) || 0;
  const numberOfPlayers = simResult.numberOfPlayers || 1;
  const difficultyTier = simResult.difficultyTier || 0;
  const tierMult = 1 + 0.1 * difficultyTier;

  let keysTotal = 0;
  const fragmentCounts = {};

  for (const monsterHrid of Object.keys(simResult.deaths)) {
    if (monsterHrid.startsWith('player')) continue;
    const mon = combatMonsterDetailMap[monsterHrid];
    if (!mon) continue;
    const deaths = simResult.deaths[monsterHrid];
    for (const tbl of [mon.dropTable, mon.rareDropTable]) {
      if (!tbl) continue;
      for (const drop of tbl) {
        if (!isKeyFragment(drop.itemHrid)) continue;
        if (drop.minDifficultyTier != null && drop.minDifficultyTier > difficultyTier) continue;
        // Same drop formula the simulator uses for everything else:
        //   baseRate + perTier*difficultyTier, scaled by tier multiplier, then
        //   multiplied by the player's drop-rate multiplier. Negative base is
        //   clamped via Math.min / Math.max.
        let dropRate = (drop.dropRate + (drop.dropRatePerDifficultyTier || 0) * difficultyTier) * tierMult;
        dropRate = Math.min(1.0, Math.max(0, dropRate) * dropRateMult);
        if (dropRate <= 0) continue;
        const expectedPerKill = dropRate * (drop.minCount + drop.maxCount) / 2
                              * (1 + debuffOnLevelGap)
                              * (1 + combatDropQuantity)
                              / numberOfPlayers;
        const fragCount = deaths * expectedPerKill;
        fragmentCounts[drop.itemHrid] = (fragmentCounts[drop.itemHrid] || 0) + fragCount;
        keysTotal += fragCount;
      }
    }
  }

  return {
    keysPerHour: keysTotal / hours,
    fragmentCounts,
    totalKeysExpected: keysTotal,
    hours,
  };
}
