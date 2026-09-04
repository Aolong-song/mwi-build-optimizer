// MWI Build Optimizer - main entry.
// Layers the build library, team picker, zone selector, batch simulator and ranker
// on top of the forked MWI combat simulator.

import {
  loadLibrary, saveLibrary, addBuild, updateBuild, deleteBuild, renameUser,
  validateBuildJson, exportLibraryAsJson, importLibraryFromJson,
  USER_IDS, USER_LABELS, MAX_BUILDS_PER_USER,
} from './buildStore.js';
import { expandCombos, countCombos } from './teamCombos.js';
import { runBatch } from './batchRunner.js';
import { enrichResults, rankByKeysPerHour, groupByZoneForDisplay, toCsv, toExportJson } from './ranker.js';
import actionDetailMap from '../../simulator/combatsimulator/data/actionDetailMap.json';
import abilityDetailMap from '../../simulator/combatsimulator/data/abilityDetailMap.json';
import itemDetailMap from '../../simulator/combatsimulator/data/itemDetailMap.json';
import { keyFragmentsForZone, primaryKeyFragmentForZone } from './keyShardMetric.js';
import { zoneNameZh, itemNameZh } from './gameNames.js';
import { FOOD_OPTIONS, LUCKY_COFFEE, ATTRIBUTE_COFFEE_OPTIONS, normalizeCombatConsumables, isValidCombatConsumables, consumableLabels, applyCombatConsumables } from './combatConsumables.js';

// These actions may expose key fragments in raw game data, but are not valid
// fragment-farming targets: the first five are Smelly Planet's normal monsters
// and Chimerical Den consumes a completed key on entry.
const EXCLUDED_KEY_FRAGMENT_ZONE_HRIDS = new Set([
  '/actions/combat/fly',
  '/actions/combat/rat',
  '/actions/combat/skunk',
  '/actions/combat/porcupine',
  '/actions/combat/slimy',
  '/actions/combat/chimerical_den',
]);

let library = loadLibrary();
let picks = { userA: [], userB: [], userC: [] };
let selectedZones = []; // [{ hrid, difficultyTier, shortName }]
let lastResults = null;
let lastRunOptions = null;
let chineseGameNameMap = {};
const FAVORITES_STORAGE_KEY = 'mwiResultFavorites';
let resultFavorites = loadResultFavorites();
let resultSort = { field: 'keysPerHour', direction: 'desc' };

function loadResultFavorites() { try { return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY)) || []; } catch (_) { return []; } }
function favoriteKey(row) { return JSON.stringify({ users: row.combo.users, zone: row.combo.zoneHrid, tier: row.combo.difficultyTier }); }
function applyResultFilters(rows) {
  const tier = document.getElementById('resultsTierFilter')?.value || '';
  const maxDeaths = Number(document.getElementById('resultsDeathsFilter')?.value || Infinity);
  let filtered = rows.filter(row => (!tier || String(row.combo.difficultyTier) === tier) && (row.deathsPerHour || 0) <= maxDeaths);
  if (document.getElementById('resultsBestOnly')?.checked) {
    const seen = new Set();
    filtered = rankByKeysPerHour(filtered).filter(row => !seen.has(row.combo.zoneHrid) && seen.add(row.combo.zoneHrid));
  }
  return filtered;
}

function resetResultFilters() {
  document.getElementById('resultsTierFilter').value = '';
  document.getElementById('resultsDeathsFilter').value = '';
  document.getElementById('resultsBestOnly').checked = false;
}

// ----- Build Library UI -----

function renderLibrary() {
  const root = document.getElementById('libraryRoot');
  root.innerHTML = '';
  for (const [userIndex, uid] of USER_IDS.entries()) {
    const user = library.users[uid];
    const userCol = document.createElement('div');
    userCol.className = `col-md-4 mb-3 user-slot user-slot-${userIndex + 1}`;
    userCol.innerHTML = `
      <div class="card h-100 user-card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <input class="form-control form-control-sm user-name-input" value="${escapeHtml(user.name)}" data-uid="${uid}" />
          <span class="badge bg-secondary">${Object.keys(user.builds).length}/${MAX_BUILDS_PER_USER}</span>
        </div>
        <div class="card-body build-list" data-uid="${uid}"></div>
        <div class="card-footer">
          <button class="btn btn-sm btn-primary add-build-btn" data-uid="${uid}">+ 添加配装</button>
        </div>
      </div>`;
    root.appendChild(userCol);
  }
  for (const uid of USER_IDS) renderUserBuilds(uid);
  wireLibraryEvents();
}

function renderUserBuilds(uid) {
  const user = library.users[uid];
  const listEl = document.querySelector(`.build-list[data-uid="${uid}"]`);
  listEl.innerHTML = '';
  const ids = Object.keys(user.builds);
  if (ids.length === 0) {
    listEl.innerHTML = '<div class="text-muted small">尚未添加配装</div>';
    return;
  }
  for (const bid of ids) {
    const b = user.builds[bid];
    const item = document.createElement('div');
    item.className = 'build-item border-bottom py-2';
    item.innerHTML = `
      <div class="d-flex justify-content-between align-items-center gap-2">
        <div class="flex-grow-1">
          <input class="form-control form-control-sm build-name" value="${escapeHtml(b.name)}" data-uid="${uid}" data-bid="${bid}" />
        </div>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary view-btn" data-uid="${uid}" data-bid="${bid}">详情</button>
          <button class="btn btn-outline-primary edit-btn" data-uid="${uid}" data-bid="${bid}">修改</button>
          <button class="btn btn-outline-success supplies-btn" data-uid="${uid}" data-bid="${bid}">吃喝</button>
          <button class="btn btn-outline-danger delete-btn" data-uid="${uid}" data-bid="${bid}">删</button>
        </div>
      </div>
      ${buildSummaryMarkup(b.json, true)}`;
    listEl.appendChild(item);
  }
}

function wireLibraryEvents() {
  document.querySelectorAll('.user-name-input').forEach(el => {
    el.onchange = (e) => {
      renameUser(library, e.target.dataset.uid, e.target.value.trim());
      renderTeamPicker();
    };
  });
  document.querySelectorAll('.add-build-btn').forEach(el => {
    el.onclick = (e) => openAddBuildModal(e.target.dataset.uid);
  });
  document.querySelectorAll('.build-name').forEach(el => {
    el.onchange = (e) => {
      updateBuild(library, e.target.dataset.uid, e.target.dataset.bid, { name: e.target.value.trim() || '未命名' });
      renderTeamPicker();
    };
  });
  document.querySelectorAll('.view-btn').forEach(el => {
    el.onclick = (e) => {
      const b = library.users[e.target.dataset.uid].builds[e.target.dataset.bid];
      openBuildDetails(b.name, b.json);
    };
  });
  document.querySelectorAll('.edit-btn').forEach(el => {
    el.onclick = (e) => openEditBuildModal(e.target.dataset.uid, e.target.dataset.bid);
  });
  document.querySelectorAll('.supplies-btn').forEach(el => {
    el.onclick = (e) => openBuildSuppliesModal(e.target.dataset.uid, e.target.dataset.bid);
  });
  document.querySelectorAll('.delete-btn').forEach(el => {
    el.onclick = (e) => {
      if (!confirm('删除该配装？')) return;
      deleteBuild(library, e.target.dataset.uid, e.target.dataset.bid);
      renderLibrary();
      renderTeamPicker();
    };
  });
}

let pendingAddUid = null;
let pendingEditBuild = null;
let pendingSuppliesBuild = null;
function openAddBuildModal(uid) {
  pendingAddUid = uid;
  document.getElementById('addBuildJson').value = '';
  document.getElementById('addBuildName').value = '';
  document.getElementById('addBuildError').textContent = '';
  document.getElementById('addBuildModalTitle').textContent = '为 ' + library.users[uid].name + ' 添加配装';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('addBuildModal')).show();
}

function openBuildDetails(title, json) {
  document.getElementById('jsonModalTitle').textContent = title;
  document.getElementById('jsonModalBody').innerHTML = buildSummaryMarkup(json, false);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('jsonModal')).show();
}

function openEditBuildModal(uid, bid) {
  const build = library.users[uid]?.builds[bid];
  if (!build) return;
  pendingEditBuild = { uid, bid };
  document.getElementById('editBuildModalTitle').textContent = '修改配装：' + build.name;
  document.getElementById('editBuildName').value = build.name;
  // Preserve the exact stored source as the editable value. Formatting it here
  // would make an unchanged save look like a content change to the user.
  document.getElementById('editBuildJson').value = build.json;
  document.getElementById('editBuildError').textContent = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('editBuildModal')).show();
}

function suppliesForBuild(uid, bid) {
  try {
    const data = JSON.parse(library.users[uid].builds[bid].json);
    const foods = (data.food?.['/action_types/combat'] || []).map(x => x.itemHrid);
    const drinks = (data.drinks?.['/action_types/combat'] || []).map(x => x.itemHrid);
    return normalizeCombatConsumables({ foods, attributeCoffees: drinks.filter(x => x !== LUCKY_COFFEE.hrid) });
  } catch (_) { return normalizeCombatConsumables(null); }
}

function exportBuildSnapshot(uid, bid) {
  const build = library.users[uid].builds[bid];
  try {
    const data = JSON.parse(build.json);
    const equipment = (data.player?.equipment || []).filter(entry => entry?.itemHrid).map(entry => displayName(entry.itemHrid, itemDetailMap)).join(' + ');
    const skills = (data.abilities || []).filter(entry => entry?.abilityHrid && Number(entry.level) > 0).map(entry => `${displayName(entry.abilityHrid, abilityDetailMap)} Lv.${entry.level}`).join(' + ');
    return { userName: library.users[uid].name, buildName: build.name, equipment, skills };
  } catch (_) { return { userName: library.users[uid].name, buildName: build.name, equipment: '', skills: '' }; }
}

function openBuildSuppliesModal(uid, bid) {
  pendingSuppliesBuild = { uid, bid };
  const settings = suppliesForBuild(uid, bid);
  document.getElementById('suppliesModalTitle').textContent = '修改吃喝：' + library.users[uid].builds[bid].name;
  document.getElementById('buildFoodOptions').innerHTML = FOOD_OPTIONS.map(option => `<label class="form-check form-check-inline"><input class="form-check-input build-food-check" type="checkbox" value="${option.hrid}" ${settings.foods.includes(option.hrid) ? 'checked' : ''}>${option.label}</label>`).join('');
  document.getElementById('buildCoffeeOptions').innerHTML = `<label class="form-check form-check-inline"><input class="form-check-input" type="checkbox" checked disabled>${LUCKY_COFFEE.label}</label>` + ATTRIBUTE_COFFEE_OPTIONS.map(option => `<label class="form-check form-check-inline"><input class="form-check-input build-coffee-check" type="checkbox" value="${option.hrid}" ${settings.attributeCoffees.includes(option.hrid) ? 'checked' : ''}>${option.label}</label>`).join('');
  const siblings = Object.entries(library.users[uid].builds).filter(([otherBid]) => otherBid !== bid);
  document.getElementById('copySuppliesTargets').innerHTML = siblings.length
    ? siblings.map(([otherBid, build]) => `<label class="form-check form-check-inline"><input class="form-check-input copy-supplies-target" type="checkbox" value="${otherBid}">${escapeHtml(build.name)}</label>`).join('')
    : '<span class="text-muted small">此用户没有其他配装</span>';
  document.getElementById('buildSuppliesError').textContent = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('suppliesModal')).show();
}

const STAT_FIELDS = [
  ['attackLevel', '攻击'], ['magicLevel', '魔法'], ['meleeLevel', '近战'], ['rangedLevel', '远程'],
  ['defenseLevel', '防御'], ['staminaLevel', '耐力'], ['intelligenceLevel', '智力'],
];

const SLOT_NAMES = {
  head: '头部', body: '身体', legs: '腿部', feet: '脚部', hands: '手部', off_hand: '副手',
  pouch: '袋子', neck: '项链', earrings: '耳环', ring: '戒指', back: '披风',
  main_hand: '主手', two_hand: '双手', charm: '护符',
  alchemy_tool: '炼金工具', brewing_tool: '酿造工具', cheesesmithing_tool: '奶酪锻造工具',
  cooking_tool: '烹饪工具', crafting_tool: '制作工具', enhancing_tool: '强化工具',
  farming_tool: '种植工具', fishing_tool: '钓鱼工具', foraging_tool: '采集工具',
  milking_tool: '挤奶工具', mining_tool: '采矿工具', tailoring_tool: '缝纫工具',
  trinket: '饰品', woodcutting_tool: '伐木工具',
};

const COMBAT_EQUIPMENT_SLOTS = new Set([
  'head', 'body', 'legs', 'feet', 'hands', 'off_hand', 'pouch', 'neck', 'earrings',
  'ring', 'back', 'main_hand', 'two_hand', 'charm',
]);

const COMBAT_EQUIPMENT_DISPLAY_ORDER = [
  'back', 'main_hand', 'two_hand', 'off_hand', 'head', 'body', 'legs', 'feet',
  'hands', 'pouch', 'neck', 'earrings', 'ring', 'charm',
];
const COMBAT_EQUIPMENT_DISPLAY_INDEX = new Map(COMBAT_EQUIPMENT_DISPLAY_ORDER.map((slot, index) => [slot, index]));

const ITEM_NAMES_ZH_FALLBACK = {
  '/items/gatherer_cape': '采集者披风',
};

function displayName(hrid, detailMap) {
  if (!hrid) return '未配置';
  if (chineseGameNameMap[hrid]) return chineseGameNameMap[hrid];
  if (ITEM_NAMES_ZH_FALLBACK[hrid]) return ITEM_NAMES_ZH_FALLBACK[hrid];
  const detail = detailMap[hrid];
  if (detail && detail.name) return detail.name;
  return hrid.split('/').pop().replaceAll('_', ' ');
}

async function loadChineseGameNames() {
  try {
    const source = await fetch('js/i18n.js').then((response) => {
      if (!response.ok) throw new Error('无法读取中文词库');
      return response.text();
    });
    const names = {};
    const entryPattern = /"((?:\/items|\/abilities)\/[^"\\]+)":\s*("(?:\\.|[^"\\])*")/g;
    for (const match of source.matchAll(entryPattern)) {
      try {
        const translated = JSON.parse(match[2]);
        // The source includes both a name and a longer description for many
        // abilities. The shortest Chinese entry is the display name.
        if (/[\u3400-\u9fff]/.test(translated) && (!names[match[1]] || translated.length < names[match[1]].length)) {
          names[match[1]] = translated;
        }
      } catch (_) {
        // Ignore a malformed translation entry and keep the English fallback.
      }
    }
    chineseGameNameMap = names;
    renderLibrary();
  } catch (error) {
    console.warn('[optimizer] Chinese item-name dictionary unavailable', error);
  }
}

function buildSummaryMarkup(json, compact) {
  let data;
  try { data = JSON.parse(json); }
  catch (_) { return '<div class="build-summary text-danger small">配装 JSON 无法解析</div>'; }
  const player = data.player || {};
  const stats = STAT_FIELDS
    .filter(([field]) => Number.isFinite(Number(player[field])))
    .map(([field, label]) => `<span class="stat-pill"><small>${label}</small><strong>${Number(player[field])}</strong></span>`)
    .join('');
  const equipment = (player.equipment || []).filter((entry) => {
    const slot = entry?.itemLocationHrid?.split('/').pop();
    return entry?.itemHrid && COMBAT_EQUIPMENT_SLOTS.has(slot);
  }).sort((a, b) => {
    const aSlot = a.itemLocationHrid?.split('/').pop();
    const bSlot = b.itemLocationHrid?.split('/').pop();
    return (COMBAT_EQUIPMENT_DISPLAY_INDEX.get(aSlot) ?? 99) - (COMBAT_EQUIPMENT_DISPLAY_INDEX.get(bSlot) ?? 99);
  }).map((entry) => {
    const slot = entry.itemLocationHrid ? entry.itemLocationHrid.split('/').pop() : '';
    const enhancement = Number(entry.enhancementLevel) > 0 ? ` +${Number(entry.enhancementLevel)}` : '';
    return `<span class="detail-badge" title="${escapeHtml(entry.itemHrid)}">${escapeHtml(SLOT_NAMES[slot] || slot)}：${escapeHtml(displayName(entry.itemHrid, itemDetailMap))}${enhancement}</span>`;
  });
  const abilities = (data.abilities || []).filter(x => x && x.abilityHrid && Number(x.level) > 0).map((entry) =>
    `<span class="detail-badge" title="${escapeHtml(entry.abilityHrid)}">${escapeHtml(displayName(entry.abilityHrid, abilityDetailMap))} Lv.${Number(entry.level)}</span>`);
  const combatConsumables = [
    ...(data.food?.['/action_types/combat'] || []),
    ...(data.drinks?.['/action_types/combat'] || []),
  ].filter(x => x && x.itemHrid).map(x => displayName(x.itemHrid, itemDetailMap));
  const houseCount = Object.values(data.houseRooms || {}).filter(value => Number(value) > 0).length;
  const limit = compact ? 4 : Number.MAX_SAFE_INTEGER;
  const abbreviated = (items) => items.slice(0, limit).join('') + (items.length > limit ? `<span class="text-muted small"> +${items.length - limit} 项</span>` : '');
  return `
    <div class="build-summary">
      <div class="build-stats">${stats || '<span class="text-muted small">未找到等级数据</span>'}</div>
      <div class="build-detail-row"><span class="summary-label">装备</span><div>${abbreviated(equipment) || '<span class="text-muted small">未配置</span>'}</div></div>
      ${compact ? '' : `<div class="build-detail-row"><span class="summary-label">技能</span><div>${abbreviated(abilities) || '<span class="text-muted small">未配置</span>'}</div></div>
      <div class="build-detail-row"><span class="summary-label">补给</span><div>${combatConsumables.map(x => `<span class="detail-badge">${escapeHtml(x)}</span>`).join('') || '<span class="text-muted small">未配置</span>'}</div></div>`}
      <div class="build-meta">技能 ${abilities.length} 个 · 战斗补给 ${combatConsumables.length} 格 · 房屋 ${houseCount} 间</div>
    </div>`;
}

document.getElementById('addBuildSave').onclick = () => {
  const name = document.getElementById('addBuildName').value.trim();
  const json = document.getElementById('addBuildJson').value.trim();
  const errEl = document.getElementById('addBuildError');
  const v = validateBuildJson(json);
  if (!v.ok) { errEl.textContent = v.error; return; }
  try {
    addBuild(library, pendingAddUid, name, json);
    bootstrap.Modal.getInstance(document.getElementById('addBuildModal')).hide();
    renderLibrary();
    renderTeamPicker();
  } catch (e) {
    errEl.textContent = e.message;
  }
};

document.getElementById('editBuildSave').onclick = () => {
  if (!pendingEditBuild) return;
  const name = document.getElementById('editBuildName').value.trim() || '未命名';
  const json = document.getElementById('editBuildJson').value.trim();
  const errEl = document.getElementById('editBuildError');
  const validation = validateBuildJson(json);
  if (!validation.ok) { errEl.textContent = validation.error; return; }
  try {
    updateBuild(library, pendingEditBuild.uid, pendingEditBuild.bid, { name, json });
    bootstrap.Modal.getInstance(document.getElementById('editBuildModal')).hide();
    renderLibrary();
    renderTeamPicker();
    pendingEditBuild = null;
  } catch (error) {
    errEl.textContent = error.message;
  }
};

document.getElementById('buildSuppliesSave').onclick = () => {
  if (!pendingSuppliesBuild) return;
  const settings = {
    foods: [...document.querySelectorAll('.build-food-check:checked')].map(x => x.value),
    attributeCoffees: [...document.querySelectorAll('.build-coffee-check:checked')].map(x => x.value),
  };
  const error = document.getElementById('buildSuppliesError');
  if (!isValidCombatConsumables(settings)) { error.textContent = '请选择恰好 3 种食物和 2 种属性咖啡。'; return; }
  try {
    const { uid, bid } = pendingSuppliesBuild;
    const raw = JSON.parse(library.users[uid].builds[bid].json);
    const updatedJson = JSON.stringify(applyCombatConsumables(raw, settings));
    updateBuild(library, uid, bid, { json: updatedJson });
    document.querySelectorAll('.copy-supplies-target:checked').forEach(target => {
      const targetRaw = JSON.parse(library.users[uid].builds[target.value].json);
      updateBuild(library, uid, target.value, { json: JSON.stringify(applyCombatConsumables(targetRaw, settings)) });
    });
    bootstrap.Modal.getInstance(document.getElementById('suppliesModal')).hide();
    renderLibrary();
  } catch (e) { error.textContent = e.message; }
};

document.getElementById('exportLibraryBtn').onclick = () => {
  const blob = new Blob([exportLibraryAsJson(library)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'mwi-build-library.json'; a.click();
  URL.revokeObjectURL(url);
};

document.getElementById('importLibraryBtn').onclick = () => document.getElementById('importLibraryInput').click();
document.getElementById('importLibraryInput').onchange = (e) => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      library = importLibraryFromJson(ev.target.result);
      renderLibrary();
      renderTeamPicker();
      alert('导入成功');
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  };
  reader.readAsText(f);
};

document.getElementById('resetLibraryBtn').onclick = () => {
  if (!confirm('确定清空所有配装？此操作不可撤销。')) return;
  localStorage.removeItem('mwiBuildLibrary');
  library = loadLibrary();
  picks = { userA: [], userB: [], userC: [] };
  renderLibrary();
  renderTeamPicker();
};

// ----- Team Picker -----

function renderTeamPicker() {
  const root = document.getElementById('teamPickerRoot');
  root.innerHTML = '';
  for (const [userIndex, uid] of USER_IDS.entries()) {
    const user = library.users[uid];
    const col = document.createElement('div');
    col.className = `col-md-4 team-slot team-slot-${userIndex + 1}`;
    const builds = Object.keys(user.builds);
    const selected = new Set(picks[uid] || []);
    const checkList = builds.length === 0
      ? '<div class="text-muted small">无配装</div>'
      : builds.map(bid => `
        <div class="form-check">
          <input class="form-check-input team-build-check" type="checkbox" value="${bid}" data-uid="${uid}" id="chk-${uid}-${bid}" ${selected.has(bid) ? 'checked' : ''} />
          <label class="form-check-label" for="chk-${uid}-${bid}">${escapeHtml(user.builds[bid].name)}</label>
        </div>`).join('');
    col.innerHTML = `
      <div class="card team-card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span>${escapeHtml(user.name)}（${builds.length}/${MAX_BUILDS_PER_USER}）</span>
          <span class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary select-user-builds-btn" data-uid="${uid}" ${builds.length ? '' : 'disabled'}>全选</button>
            <button class="btn btn-outline-secondary clear-user-builds-btn" data-uid="${uid}" ${builds.length ? '' : 'disabled'}>清空</button>
          </span>
        </div>
        <div class="card-body">${checkList}</div>
        <div class="card-footer small text-muted">
          ${builds.length === 0 ? '请先在 Build 库添加配装' : '勾选要参与对比的配装'}
        </div>
      </div>`;
    root.appendChild(col);
  }
  document.querySelectorAll('.team-build-check').forEach(el => {
    el.onchange = (e) => {
      const uid = e.target.dataset.uid;
      const bid = e.target.value;
      picks[uid] = picks[uid] || [];
      if (e.target.checked) {
        if (!picks[uid].includes(bid)) picks[uid].push(bid);
      } else {
        picks[uid] = picks[uid].filter(x => x !== bid);
      }
      updateComboEstimate();
    };
  });
  document.querySelectorAll('.select-user-builds-btn').forEach(el => {
    el.onclick = () => {
      const uid = el.dataset.uid;
      picks[uid] = Object.keys(library.users[uid].builds);
      renderTeamPicker();
    };
  });
  document.querySelectorAll('.clear-user-builds-btn').forEach(el => {
    el.onclick = () => {
      picks[el.dataset.uid] = [];
      renderTeamPicker();
    };
  });
  updateComboEstimate();
}

function updateComboEstimate() {
  const zones = collectSelectedZones();
  const n = countCombos(picks, zones);
  const missingUsers = USER_IDS.filter(uid => !(picks[uid] || []).length);
  document.getElementById('comboEstimate').textContent = missingUsers.length
    ? '请为 ' + missingUsers.map(uid => library.users[uid].name).join('、') + ' 选择配装'
    : n + ' 个组合（吃喝随各配装保存）';
  document.getElementById('startBatchBtn').disabled = n === 0;
}


// ----- Zone Selector -----

function populateZoneList() {
  const sel = document.getElementById('zoneList');
  sel.innerHTML = '';
  // Only show valid farming maps that drop at least one *_key_fragment.
  // Exclude Smelly Planet's individual normal-monster actions and key-consuming
  // Chimerical Den; raw game data has 17 fragment sources, 11 are selectable.
  // ChestKeys inside dungeon chests are a separate ladder and intentionally hidden.
  const zones = [];
  const errors = [];
  for (const a of Object.values(actionDetailMap)) {
    if (a.type !== '/action_types/combat') continue;
    if (!a.combatZoneInfo) continue;
    let info = null;
    try { info = primaryKeyFragmentForZone(a.hrid); }
    catch (e) { errors.push({ hrid: a.hrid, error: e.message }); }
    if (info && !EXCLUDED_KEY_FRAGMENT_ZONE_HRIDS.has(a.hrid)) zones.push(a);
  }
  // Stash any unexpected errors in a dev hook rather than spamming the console.
  if (typeof window !== 'undefined') window.__lastZoneFilterErrors = errors;
  zones.sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));
  for (const z of zones) {
    const keyInfo = primaryKeyFragmentForZone(z.hrid);
    const frags = keyFragmentsForZone(z.hrid);
    const tiers = [];
    for (let t = 0; t <= z.maxDifficulty; t++) {
      tiers.push(`<label class="form-check form-check-inline mb-0"><input class="form-check-input zone-tier-check" type="checkbox" value="${t}" data-hrid="${z.hrid}" />T${t}</label>`);
    }
    const item = document.createElement('div');
    item.className = 'zone-item d-flex align-items-center border-bottom py-1';
    item.innerHTML = `
      <input class="form-check-input zone-check me-2" type="checkbox" value="${z.hrid}" id="zone-${z.hrid}" />
      <label class="form-check-label flex-grow-1" for="zone-${z.hrid}">
        ${escapeHtml(zoneNameZh(z.hrid, z.name))}
        <span class="text-muted small">${z.hrid}</span>
        <span class="badge bg-info ms-1" title="来自 ${escapeHtml(keyInfo.monsterName)}${keyInfo.isBoss ? ' (boss)' : ''}">${escapeHtml(itemNameZh(keyInfo.fragmentHrid, keyInfo.fragmentName))}</span>
        ${frags.length > 1 ? `<span class="badge bg-light text-dark ms-1" title="${frags.map(f => itemNameZh(f.fragmentHrid, f.fragmentName) + ' (' + (f.isBoss?'boss':'regular') + ')').join(', ')}">+${frags.length - 1}</span>` : ''}
      </label>
      <div class="zone-tiers text-nowrap ms-2">${tiers.join('')}</div>`;
    sel.appendChild(item);
  }
  if (zones.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-muted small py-2';
    empty.textContent = '当前数据中没有任何地图掉落钥匙碎片。';
    sel.appendChild(empty);
  }
  document.querySelectorAll('.zone-check').forEach(el => {
    el.onchange = () => {
      const tierChecks = document.querySelectorAll(`.zone-tier-check[data-hrid="${el.value}"]`);
      if (el.checked && !Array.from(tierChecks).some(t => t.checked)) {
        const defaultTier = document.querySelector(`.zone-tier-check[data-hrid="${el.value}"][value="1"]`) || tierChecks[0];
        if (defaultTier) defaultTier.checked = true;
      }
      // Keep tier choices while this map is temporarily unselected. Rechecking
      // the map restores precisely the same tiers instead of discarding them.
      selectedZones = collectSelectedZones(); updateComboEstimate();
    };
  });
  document.querySelectorAll('.zone-tier-check').forEach(el => {
    el.onchange = () => {
      const mapCheck = document.querySelector(`.zone-check[value="${el.dataset.hrid}"]`);
      const anyTier = Array.from(document.querySelectorAll(`.zone-tier-check[data-hrid="${el.dataset.hrid}"]`)).some(t => t.checked);
      if (mapCheck) mapCheck.checked = anyTier;
      selectedZones = collectSelectedZones(); updateComboEstimate();
    };
  });
  selectedZones = collectSelectedZones();
  updateComboEstimate();
}

function collectSelectedZones() {
  const out = [];
  document.querySelectorAll('.zone-check').forEach(el => {
    if (!el.checked) return;
    const def = actionDetailMap[el.value];
    document.querySelectorAll(`.zone-tier-check[data-hrid="${el.value}"]:checked`).forEach(tier => {
      const t = parseInt(tier.value, 10) || 0;
      out.push({ hrid: el.value, difficultyTier: t, shortName: zoneNameZh(el.value, def ? def.name : el.value) });
    });
  });
  return out;
}

document.getElementById('zoneFilter').oninput = (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.zone-item').forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = text.includes(q) ? '' : 'none';
  });
};

// ----- Batch run -----

let activeBatchController = null;

document.getElementById('startBatchBtn').onclick = async () => {
  const zones = collectSelectedZones();
  const combos = expandCombos(library, picks, zones);
  if (combos.length === 0) return;
  // A new run must begin by showing its full result set. Otherwise a filter
  // left from the previous run can make successful cases appear to be missing.
  resetResultFilters();
  combos.forEach(combo => {
    combo.combatConsumables = Object.fromEntries(['userA', 'userB', 'userC'].map(uid => {
      const settings = suppliesForBuild(uid, combo.users[uid]);
      return [uid, { ...settings, labels: consumableLabels(settings) }];
    }));
    combo.exportBuilds = Object.fromEntries(['userA', 'userB', 'userC'].map(uid => [uid, exportBuildSnapshot(uid, combo.users[uid])]));
  });
  const simHours = parseInt(document.getElementById('simHoursInput').value, 10) || 24;
  const concurrency = Math.max(1, parseInt(document.getElementById('concurrencyInput').value, 10) || navigator.hardwareConcurrency || 4);
  const combatDropQuantityBuff = document.getElementById('combatDropQuantityBuffToggle').checked;

  document.getElementById('startBatchBtn').disabled = true;
  document.getElementById('cancelBatchBtn').disabled = false;
  lastResults = [];
  lastRunOptions = {
    simulationHours: simHours,
    concurrency,
    combatDropQuantityBuff,
  };
  renderResultsTable(lastResults, { running: true, completed: 0, total: combos.length });
  bootstrap.Tab.getOrCreateInstance(document.querySelector('[data-bs-target="#pane-results"]')).show();
  const prog = document.getElementById('progressBar');
  prog.style.width = '0%';
  prog.textContent = '0%';

  const startedAt = Date.now();
  activeBatchController = new AbortController();
  try {
    const batch = await runBatch(combos, library, {
      simulationHours: simHours,
      concurrency,
      combatDropQuantityBuff,
      signal: activeBatchController.signal,
    }, (completed, total, result) => {
      const pct = Math.floor(100 * completed / total);
      prog.style.width = pct + '%';
      prog.textContent = pct + '% (' + completed + '/' + total + ')';
      lastResults.push(...enrichResults([result]));
      renderResultsTable(lastResults, { running: true, completed, total });
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    const enriched = enrichResults(batch.results);
    const ranked = rankByKeysPerHour(enriched);
    lastResults = ranked;
    window.__lastResults = ranked;
    window.__lastSimResults = ranked.map(r => r.simResult);
    renderResultsTable(ranked);
    if (batch.cancelled) {
      prog.style.width = Math.floor(100 * batch.completed / batch.total) + '%';
      prog.textContent = '已取消 (' + batch.completed + '/' + batch.total + ', ' + elapsed + 's)';
    } else {
      prog.textContent = '100% (' + elapsed + 's)';
    }
  } finally {
    activeBatchController = null;
    document.getElementById('cancelBatchBtn').disabled = true;
    updateComboEstimate();
  }
};

document.getElementById('cancelBatchBtn').onclick = () => {
  if (activeBatchController) activeBatchController.abort();
};

function renderResultsTable(rows, progress = null) {
  const tbody = document.getElementById('resultsTable');
  const summary = document.getElementById('resultsSummary');
  const favoritesCount = document.getElementById('favoritesCount');
  if (favoritesCount) favoritesCount.textContent = '收藏 ' + resultFavorites.length;
  tbody.innerHTML = '';
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted">${progress?.running ? '运行中，等待第一个组合完成…' : '无结果'}</td></tr>`;
    summary.textContent = progress?.running
      ? `正在计算：0/${progress.total}，完成后会立即显示该组合结果`
      : '总计 0 个组合（成功 0），最佳：无';
    return;
  }
  // Do not let a saved T/death/best filter make an active run look empty.
  // During simulation every completed case is visible immediately; filters are
  // applied to the stable final result set after the batch finishes.
  const visibleRows = progress?.running ? rows : applyResultFilters(rows);
  const displayRows = groupByZoneForDisplay(visibleRows, resultSort.field, resultSort.direction);
  let previousZone = null;
  let displayIndex = 0;
  const bestByZoneTier = new Map();
  displayRows.forEach(r => {
    const key = `${r.combo.zoneHrid}:${r.combo.difficultyTier || 0}`;
    if (!bestByZoneTier.has(key) && r.ok) bestByZoneTier.set(key, r);
  });
  displayRows.forEach((r) => {
    if (r.combo.zoneHrid !== previousZone) {
      previousZone = r.combo.zoneHrid;
      const header = document.createElement('tr');
      header.className = 'zone-result-header';
      header.innerHTML = `<td colspan="11">${escapeHtml(zoneNameZh(r.combo.zoneHrid, r.combo.zoneHrid))} · ${escapeHtml(r.keyName)}</td>`;
      tbody.appendChild(header);
    }
    displayIndex++;
    const tr = document.createElement('tr');
    const bestKey = `${r.combo.zoneHrid}:${r.combo.difficultyTier || 0}`;
    const isBest = bestByZoneTier.get(bestKey) === r && r.keysPerHour > 0;
    if (isBest) tr.classList.add('best-row');
    if (!r.ok) tr.classList.add('error-row');
    const userName = (uid) => library.users[uid].builds[r.combo.users[uid]] ? library.users[uid].builds[r.combo.users[uid]].name : '?';
    const supplies = ['userA', 'userB', 'userC'].map(uid => {
      const labels = r.combo.combatConsumables?.[uid]?.labels || consumableLabels(suppliesForBuild(uid, r.combo.users[uid]));
      return `<div><strong>${escapeHtml(library.users[uid].name)}</strong>：食 ${escapeHtml(labels.foods.join('、'))}<br><span class="text-muted">咖啡 ${escapeHtml(labels.drinks.join('、'))}</span></div>`;
    }).join('') || '-';
    const mana = ['player1', 'player2', 'player3'].map((player, index) => {
      const info = r.mana?.[player] || { spentPerHour: 0, ranOut: false, oomPercent: 0 };
      const name = library.users[USER_IDS[index]].name;
      return `<div><strong>${escapeHtml(name)}</strong>：${info.spentPerHour.toFixed(1)} MP/h ${info.ranOut ? `<span class="text-danger">耗尽 ${info.oomPercent.toFixed(1)}%</span>` : '<span class="text-success">未耗尽</span>'}</div>`;
    }).join('');
    const saved = resultFavorites.some(favorite => favorite.key === favoriteKey(r));
    tr.innerHTML = `
      <td>${displayIndex}</td>
      <td>${escapeHtml(userName('userA'))} × ${escapeHtml(userName('userB'))} × ${escapeHtml(userName('userC'))}</td>
      <td title="${escapeHtml(r.combo.zoneHrid)}">${escapeHtml(zoneNameZh(r.combo.zoneHrid, r.combo.zoneHrid))} <span class="badge bg-light text-dark">T${r.combo.difficultyTier}</span></td>
      <td>${escapeHtml(r.keyName)}</td>
      <td class="supplies-cell">${supplies}</td>
      <td class="text-end">${(r.totalKeysExpected || 0).toFixed(3)}</td>
      <td class="text-end fw-bold">${(r.keysPerHour || 0).toFixed(4)}</td>
      <td class="text-end">${(r.encountersPerHour || 0).toFixed(1)}</td>
      <td class="text-end">${(r.deathsPerHour || 0).toFixed(2)}</td>
      <td class="mp-cell">${mana}</td>
      <td>${r.ok ? '<span class="text-success">OK</span>' : '<span class="text-danger" title="' + escapeHtml(r.error || '') + '">失败</span>'} <button class="btn btn-link btn-sm p-0 favorite-result-btn" data-key="${escapeHtml(favoriteKey(r))}" title="收藏此结果">${saved ? '★' : '☆'}</button></td>`;
    tbody.appendChild(tr);
  });
  document.querySelectorAll('.favorite-result-btn').forEach(button => {
    button.onclick = () => {
      const key = button.dataset.key;
      if (resultFavorites.some(favorite => favorite.key === key)) resultFavorites = resultFavorites.filter(favorite => favorite.key !== key);
      else {
        const row = rows.find(candidate => favoriteKey(candidate) === key);
        if (row) resultFavorites.push({ key, savedAt: new Date().toISOString(), row: { combo: row.combo, keysPerHour: row.keysPerHour, deathsPerHour: row.deathsPerHour, keyName: row.keyName } });
      }
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(resultFavorites));
      renderResultsTable(rows, progress);
    };
  });
  const okCount = rows.filter(r => r.ok).length;
  const best = rankByKeysPerHour(rows)[0];
  summary.textContent = progress?.running
    ? `正在计算：${progress.completed}/${progress.total}；已完成 ${rows.length} 个组合（成功 ${okCount}）`
    : '显示 ' + displayRows.length + '/' + rows.length + ' 个组合（成功 ' + okCount + '），全局最佳：' +
      (best && best.ok ? best.keysPerHour.toFixed(4) + ' 钥匙/h' : '无');
}

document.getElementById('exportCsvBtn').onclick = () => {
  if (!lastResults) return;
  const blob = new Blob([toCsv(lastResults, lastRunOptions)], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, 'mwi-rankings.csv');
};
document.getElementById('exportJsonBtn').onclick = () => {
  if (!lastResults) return;
  const blob = new Blob([toExportJson(library, picks, selectedZones, lastResults, lastRunOptions)], { type: 'application/json' });
  triggerDownload(blob, 'mwi-rankings.json');
};
document.querySelectorAll('#resultsTierFilter, #resultsDeathsFilter, #resultsBestOnly').forEach(input => {
  input.oninput = () => { if (lastResults) renderResultsTable(lastResults); };
  input.onchange = () => { if (lastResults) renderResultsTable(lastResults); };
});
document.getElementById('resetResultsFiltersBtn').onclick = () => {
  resetResultFilters();
  if (lastResults) renderResultsTable(lastResults);
};
document.querySelectorAll('.result-sort-btn').forEach(button => {
  button.onclick = () => {
    const field = button.dataset.sortField;
    resultSort = resultSort.field === field
      ? { field, direction: resultSort.direction === 'desc' ? 'asc' : 'desc' }
      : { field, direction: field === 'deathsPerHour' ? 'asc' : 'desc' };
    document.querySelectorAll('.result-sort-btn').forEach(item => {
      item.textContent = item.dataset.sortLabel + (item.dataset.sortField === resultSort.field ? (resultSort.direction === 'desc' ? ' ↓' : ' ↑') : '');
    });
    if (lastResults) renderResultsTable(lastResults);
  };
});
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ----- helpers -----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ----- bootstrap -----
if (typeof window !== 'undefined') window.__actionDetailMap = actionDetailMap;
renderLibrary();
renderTeamPicker();
populateZoneList();
void loadChineseGameNames();

document.getElementById('zoneSelectAllBtn').onclick = () => {
  document.querySelectorAll('.zone-item').forEach(el => {
    if (el.style.display !== 'none') {
      const mapCheck = el.querySelector('.zone-check');
      mapCheck.checked = true;
      const t1 = el.querySelector('.zone-tier-check[value="1"]');
      if (t1) t1.checked = true;
    }
  });
  selectedZones = collectSelectedZones();
  updateComboEstimate();
};
document.getElementById('zoneClearBtn').onclick = () => {
  document.querySelectorAll('.zone-check, .zone-tier-check').forEach(el => { el.checked = false; });
  selectedZones = collectSelectedZones();
  updateComboEstimate();
};

document.querySelectorAll('.zone-tier-all-btn').forEach(btn => {
  btn.onclick = () => {
    const tier = btn.dataset.tier;
    const targets = Array.from(document.querySelectorAll(`.zone-item:not([style*="display: none"]) .zone-tier-check[value="${tier}"]`));
    const shouldSelect = targets.some(el => !el.checked);
    targets.forEach(el => {
      el.checked = shouldSelect;
      const mapCheck = el.closest('.zone-item').querySelector('.zone-check');
      if (shouldSelect && mapCheck) mapCheck.checked = true;
      if (!shouldSelect && mapCheck) {
        mapCheck.checked = Array.from(el.closest('.zone-item').querySelectorAll('.zone-tier-check')).some(t => t.checked);
      }
    });
    selectedZones = collectSelectedZones();
    updateComboEstimate();
  };
});
