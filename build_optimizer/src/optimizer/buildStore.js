// Per-user build library persisted in localStorage.
// Stored schema: { users: { userA: { name, builds: { [id]: { name, json } } }, ... } }

export const STORAGE_KEY = 'mwiBuildLibrary';
export const USER_IDS = ['userA', 'userB', 'userC'];
export const USER_LABELS = { userA: 'User A', userB: 'User B', userC: 'User C' };
export const MAX_BUILDS_PER_USER = 5;

function emptyLibrary() {
  const users = {};
  for (const id of USER_IDS) users[id] = { name: USER_LABELS[id], builds: {} };
  return { users };
}

export function loadLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyLibrary();
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.users) return emptyLibrary();
    for (const id of USER_IDS) {
      if (!parsed.users[id]) parsed.users[id] = { name: USER_LABELS[id], builds: {} };
      if (!parsed.users[id].builds) parsed.users[id].builds = {};
      if (!parsed.users[id].name) parsed.users[id].name = USER_LABELS[id];
    }
    return parsed;
  } catch (e) {
    console.warn('[buildStore] failed to parse library, resetting', e);
    return emptyLibrary();
  }
}

export function saveLibrary(library) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

export function newBuildId() {
  return 'b-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

export function addBuild(library, userId, name, json) {
  const user = library.users[userId];
  const count = Object.keys(user.builds).length;
  if (count >= MAX_BUILDS_PER_USER) {
    throw new Error('每个用户最多 ' + MAX_BUILDS_PER_USER + ' 套配装');
  }
  const id = newBuildId();
  user.builds[id] = { name: name || ('Build ' + (count + 1)), json };
  saveLibrary(library);
  return id;
}

export function updateBuild(library, userId, buildId, patch) {
  const user = library.users[userId];
  if (!user.builds[buildId]) throw new Error('配装不存在');
  user.builds[buildId] = Object.assign({}, user.builds[buildId], patch);
  saveLibrary(library);
}

export function deleteBuild(library, userId, buildId) {
  const user = library.users[userId];
  delete user.builds[buildId];
  saveLibrary(library);
}

export function renameUser(library, userId, newName) {
  library.users[userId].name = newName || USER_LABELS[userId];
  saveLibrary(library);
}

// Returns { ok, data, error }.
export function validateBuildJson(json) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败: ' + e.message };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'JSON 顶层必须是对象' };
  const p = parsed.player || {};
  const requiredFields = ['attackLevel', 'magicLevel', 'meleeLevel', 'rangedLevel', 'defenseLevel', 'staminaLevel', 'intelligenceLevel'];
  for (const f of requiredFields) {
    if (p[f] === undefined || p[f] === null) return { ok: false, error: '缺少 player.' + f };
  }
  if (!Array.isArray(p.equipment)) return { ok: false, error: 'player.equipment 必须是数组' };
  if (!parsed.food || !parsed.food['/action_types/combat']) return { ok: false, error: '缺少 food["/action_types/combat"]' };
  if (!parsed.drinks || !parsed.drinks['/action_types/combat']) return { ok: false, error: '缺少 drinks["/action_types/combat"]' };
  if (!Array.isArray(parsed.abilities)) return { ok: false, error: 'abilities 必须是数组' };
  return { ok: true, data: parsed };
}

export function exportLibraryAsJson(library) {
  return JSON.stringify(library, null, 2);
}

export function importLibraryFromJson(json) {
  const parsed = JSON.parse(json);
  if (!parsed || !parsed.users) throw new Error('导入文件缺少 users 字段');
  for (const id of USER_IDS) {
    if (!parsed.users[id]) parsed.users[id] = { name: USER_LABELS[id], builds: {} };
    if (!parsed.users[id].builds) parsed.users[id].builds = {};
  }
  for (const id of USER_IDS) {
    for (const bid of Object.keys(parsed.users[id].builds)) {
      const b = parsed.users[id].builds[bid];
      if (b && typeof b.json === 'string') validateBuildJson(b.json);
    }
  }
  return parsed;
}
