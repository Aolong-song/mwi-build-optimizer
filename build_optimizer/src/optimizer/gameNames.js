// Community-established Simplified Chinese names for the zones and key fragments
// used by this optimizer. Keep HRIDs as the canonical keys so upstream English
// data updates do not change the display language.

const ZONE_NAMES_ZH = {
  '/actions/combat/fly': '苍蝇',
  '/actions/combat/rat': '杰瑞',
  '/actions/combat/skunk': '臭鼬',
  '/actions/combat/porcupine': '豪猪',
  '/actions/combat/slimy': '史莱姆',
  '/actions/combat/smelly_planet': '臭臭星球',
  '/actions/combat/swamp_planet': '沼泽星球',
  '/actions/combat/aqua_planet': '海洋星球',
  '/actions/combat/jungle_planet': '丛林星球',
  '/actions/combat/gobo_planet': '哥布林星球',
  '/actions/combat/planet_of_the_eyes': '眼球星球',
  '/actions/combat/sorcerers_tower': '巫师之塔',
  '/actions/combat/bear_with_it': '熊熊星球',
  '/actions/combat/golem_cave': '魔像洞穴',
  '/actions/combat/twilight_zone': '暮光之地',
  '/actions/combat/infernal_abyss': '地狱深渊',
  '/actions/combat/chimerical_den': '奇幻洞穴',
};

const ITEM_NAMES_ZH = {
  '/items/blue_key_fragment': '蓝色钥匙碎片',
  '/items/green_key_fragment': '绿色钥匙碎片',
  '/items/purple_key_fragment': '紫色钥匙碎片',
  '/items/white_key_fragment': '白色钥匙碎片',
  '/items/orange_key_fragment': '橙色钥匙碎片',
  '/items/brown_key_fragment': '棕色钥匙碎片',
  '/items/stone_key_fragment': '石头钥匙碎片',
  '/items/dark_key_fragment': '黑暗钥匙碎片',
  '/items/burning_key_fragment': '燃烧钥匙碎片',
};

export function zoneNameZh(hrid, fallback) {
  return ZONE_NAMES_ZH[hrid] || fallback || hrid;
}

export function itemNameZh(hrid, fallback) {
  return ITEM_NAMES_ZH[hrid] || fallback || hrid;
}
