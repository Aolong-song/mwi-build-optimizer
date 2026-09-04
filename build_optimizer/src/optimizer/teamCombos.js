// Generate the Cartesian product of team build selections and zone selections.
// Each combo is one combat simulation case.
//
//   { users: { userA: buildId, userB: buildId, userC: buildId }, zoneHrid, difficultyTier }

export function expandCombos(library, picks, zones) {
  const userIds = ['userA', 'userB', 'userC'];
  // Per user: list of selected build ids. Allow empty => skip that user.
  const perUser = userIds.map(uid => (picks[uid] && picks[uid].length ? picks[uid].slice() : []));
  const zoneList = zones.slice();

  if (perUser.some(arr => arr.length === 0)) return [];
  if (zoneList.length === 0) return [];

  const combos = [];
  for (const a of perUser[0]) {
    for (const b of perUser[1]) {
      for (const c of perUser[2]) {
        const users = { userA: a, userB: b, userC: c };
        for (const z of zoneList) {
          combos.push({
            users,
            zoneHrid: z.hrid,
            difficultyTier: z.difficultyTier || 0,
            caseId: combos.length,
            label: `${a.slice(0,4)}/${b.slice(0,4)}/${c.slice(0,4)}@${z.shortName || z.hrid} t${z.difficultyTier || 0}`,
          });
        }
      }
    }
  }
  return combos;
}

// Quick count without materializing all combos.
export function countCombos(picks, zones) {
  const perUser = ['userA', 'userB', 'userC'].map(uid => picks[uid]?.length || 0);
  if (perUser.some(count => count === 0)) return 0;
  return perUser.reduce((product, count) => product * count, 1) * zones.length;
}
