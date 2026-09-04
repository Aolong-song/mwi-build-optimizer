// Player factory: convert an MWI Combat Simulator-format JSON snapshot into a Player object.
// Adapted from shykai/MWICombatSimulatorTest#parsePlayerJson, extracted here so we
// don't have to import the simulator's main.js (which has DOM side effects).

import Player from '../../simulator/combatsimulator/player.js';
import Equipment from '../../simulator/combatsimulator/equipment.js';
import Consumable from '../../simulator/combatsimulator/consumable.js';
import Ability from '../../simulator/combatsimulator/ability.js';
import itemDetailMap from '../../simulator/combatsimulator/data/itemDetailMap.json';

const EQUIP_SLOTS = ['head', 'body', 'legs', 'feet', 'hands', 'off_hand', 'pouch',
                     'neck', 'earrings', 'ring', 'back', 'main_hand', 'two_hand', 'charm'];

export function parseBuildJson(playerJson, hrid) {
  const playerData = {
    hrid: hrid,
    food: [],
    drinks: [],
    abilities: [],
    ...playerJson.player,
    houseRooms: playerJson.houseRooms || {},
    achievements: playerJson.achievements || {},
    debuffOnLevelGap: 0,
  };
  playerData.equipment = {};
  const triggerMap = playerJson.triggerMap || {};
  for (const type of EQUIP_SLOTS) {
    const slot = playerJson.player.equipment.find(item => item.itemLocationHrid === '/item_locations/' + type);
    // Tool items can occupy normal-looking slots (for example, a gathering cape).
    // They have no equipmentDetail and do not affect combat, so omit them before
    // constructing the combat simulator Equipment object.
    if (slot && itemDetailMap[slot.itemHrid]?.equipmentDetail) {
      playerData.equipment['/equipment_types/' + type] = new Equipment(slot.itemHrid, slot.enhancementLevel);
    }
  }
  for (const foodHrid of (playerJson.food['/action_types/combat'] || [])) {
    if (foodHrid.itemHrid === '') continue;
    playerData.food.push(new Consumable(foodHrid.itemHrid, triggerMap[foodHrid.itemHrid]));
  }
  for (const drinkHrid of (playerJson.drinks['/action_types/combat'] || [])) {
    if (drinkHrid.itemHrid === '') continue;
    playerData.drinks.push(new Consumable(drinkHrid.itemHrid, triggerMap[drinkHrid.itemHrid]));
  }
  for (const ability of (playerJson.abilities || [])) {
    if (ability.abilityHrid === '') continue;
    const level = Number(ability.level);
    if (level > 0) {
      playerData.abilities.push(new Ability(ability.abilityHrid, level, triggerMap[ability.abilityHrid]));
    }
  }
  const player = Player.createFromDTO(playerData);
  player.updateCombatDetails();
  player.houseRooms = playerJson.houseRooms || {};
  player.achievements = playerJson.achievements || {};
  return player;
}
