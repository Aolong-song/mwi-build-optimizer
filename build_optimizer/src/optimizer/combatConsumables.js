// Combat consumable loadouts. Every valid food/coffee arrangement is tested as
// part of the build combination rather than being manually fixed by the user.

export const FOOD_OPTIONS = [
  { hrid: '/items/spaceberry_cake', label: '太空莓蛋糕' },
  { hrid: '/items/spaceberry_donut', label: '太空莓甜甜圈' },
  { hrid: '/items/star_fruit_gummy', label: '杨桃软糖' },
  { hrid: '/items/star_fruit_yogurt', label: '杨桃酸奶' },
];

export const LUCKY_COFFEE = { hrid: '/items/lucky_coffee', label: '幸运咖啡' };

export const ATTRIBUTE_COFFEE_OPTIONS = [
  { hrid: '/items/super_stamina_coffee', label: '超级耐力咖啡' },
  { hrid: '/items/super_intelligence_coffee', label: '超级智力咖啡' },
  { hrid: '/items/super_defense_coffee', label: '超级防御咖啡' },
  { hrid: '/items/super_attack_coffee', label: '超级攻击咖啡' },
  { hrid: '/items/super_melee_coffee', label: '超级近战咖啡' },
  { hrid: '/items/super_ranged_coffee', label: '超级远程咖啡' },
  { hrid: '/items/super_magic_coffee', label: '超级魔法咖啡' },
];

const STYLE_COFFEE_BY_COMBAT_STYLE = {
  '/combat_styles/ranged': '/items/super_ranged_coffee',
  '/combat_styles/magic': '/items/super_magic_coffee',
  '/combat_styles/smash': '/items/super_melee_coffee',
  '/combat_styles/stab': '/items/super_melee_coffee',
  '/combat_styles/slash': '/items/super_melee_coffee',
};

const FOOD_HRIDS = new Set(FOOD_OPTIONS.map(option => option.hrid));
const COFFEE_HRIDS = new Set(ATTRIBUTE_COFFEE_OPTIONS.map(option => option.hrid));
const DEFAULT_SETTINGS = {
  foods: FOOD_OPTIONS.slice(0, 3).map(option => option.hrid),
  attributeCoffees: [
    '/items/super_attack_coffee',
    '/items/super_ranged_coffee',
  ],
};

function uniqueKnown(values, known) {
  return [...new Set(Array.isArray(values) ? values : [])].filter(value => known.has(value));
}

export function normalizeCombatConsumables(settings) {
  const foods = uniqueKnown(settings?.foods, FOOD_HRIDS);
  const attributeCoffees = uniqueKnown(settings?.attributeCoffees, COFFEE_HRIDS);
  return {
    foods: foods.length === 3 ? foods : DEFAULT_SETTINGS.foods.slice(),
    attributeCoffees: attributeCoffees.length === 2 ? attributeCoffees : DEFAULT_SETTINGS.attributeCoffees.slice(),
  };
}

export function isValidCombatConsumables(settings) {
  return uniqueKnown(settings?.foods, FOOD_HRIDS).length === 3
    && uniqueKnown(settings?.attributeCoffees, COFFEE_HRIDS).length === 2;
}

export function enumerateCombatConsumables(combatStyles = null) {
  const styles = new Set(Array.isArray(combatStyles) ? combatStyles : []);
  // Generic attribute coffees work for every combat style. A style coffee is
  // considered only when at least one team member's equipped weapon can use it.
  // Unknown/no weapon styles retain all candidates as a safe fallback.
  const hasKnownStyle = [...styles].some(style => STYLE_COFFEE_BY_COMBAT_STYLE[style]);
  const attributeCoffeeOptions = hasKnownStyle
    ? ATTRIBUTE_COFFEE_OPTIONS.filter(option => {
      const requiredStyle = Object.entries(STYLE_COFFEE_BY_COMBAT_STYLE)
        .find(([, coffeeHrid]) => coffeeHrid === option.hrid)?.[0];
      return !requiredStyle || [...styles].some(style => STYLE_COFFEE_BY_COMBAT_STYLE[style] === option.hrid);
    })
    : ATTRIBUTE_COFFEE_OPTIONS;
  const loadouts = [];
  for (let omittedFood = 0; omittedFood < FOOD_OPTIONS.length; omittedFood++) {
    const foods = FOOD_OPTIONS.filter((_, index) => index !== omittedFood).map(option => option.hrid);
    for (let first = 0; first < attributeCoffeeOptions.length; first++) {
      for (let second = first + 1; second < attributeCoffeeOptions.length; second++) {
        const settings = {
          foods,
          attributeCoffees: [attributeCoffeeOptions[first].hrid, attributeCoffeeOptions[second].hrid],
        };
        loadouts.push({
          ...settings,
          drinks: selectedDrinkHrids(settings),
          labels: consumableLabels(settings),
        });
      }
    }
  }
  return loadouts;
}

export function selectedDrinkHrids(settings) {
  return [LUCKY_COFFEE.hrid, ...settings.attributeCoffees];
}

export function consumableLabels(settings) {
  const byHrid = new Map([...FOOD_OPTIONS, LUCKY_COFFEE, ...ATTRIBUTE_COFFEE_OPTIONS].map(option => [option.hrid, option.label]));
  return {
    foods: settings.foods.map(hrid => byHrid.get(hrid) || hrid),
    drinks: selectedDrinkHrids(settings).map(hrid => byHrid.get(hrid) || hrid),
  };
}

export function applyCombatConsumables(buildJson, settings) {
  const normalized = normalizeCombatConsumables(settings);
  const clone = JSON.parse(JSON.stringify(buildJson));
  const combatAction = '/action_types/combat';
  clone.food = { ...(clone.food || {}), [combatAction]: normalized.foods.map(itemHrid => ({ itemHrid })) };
  clone.drinks = { ...(clone.drinks || {}), [combatAction]: selectedDrinkHrids(normalized).map(itemHrid => ({ itemHrid })) };
  // Keep imported ability triggers, but let the selected consumables use their
  // upstream default combat triggers so the chosen buffs reliably activate.
  clone.triggerMap = { ...(clone.triggerMap || {}) };
  for (const hrid of [...FOOD_HRIDS, LUCKY_COFFEE.hrid, ...COFFEE_HRIDS]) delete clone.triggerMap[hrid];
  return clone;
}
