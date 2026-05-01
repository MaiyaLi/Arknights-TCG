export interface Operator {
  id: string;
  name: string;
  class: string;
  rarity: number;
  dp_cost: number;
  stats: {
    hp: number;
    atk: number;
    def: number;
  };
  movement: string;
  ability: {
    type: string;
    title: string;
    description: string;
    sp?: number;
    initialSp?: number;
    duration?: number; // In turns, optional
  };
}

export const OPERATORS: Operator[] = [
  /* --- VANGUARDS (8) --- */
  { id: "myrtle_001", name: "Myrtle", class: "Vanguard", rarity: 4, dp_cost: 8, stats: { hp: 8, atk: 2, def: 2 }, movement: "1:1", ability: { type: "passive", title: "DP Printing", description: "Generates +3 DP every turn." } },
  { id: "fang_001", name: "Fang", class: "Vanguard", rarity: 3, dp_cost: 9, stats: { hp: 12, atk: 4, def: 3 }, movement: "1:1", ability: { type: "passive", title: "Lightweight", description: "Redeploy wait time reduced by 1 turn." } },
  { id: "texas_001", name: "Texas", class: "Vanguard", rarity: 5, dp_cost: 13, stats: { hp: 14, atk: 6, def: 4 }, movement: "1:1", ability: { type: "on_deploy", title: "Sword Rain", description: "Stun enemy in current slot for 1 turn on deploy." } },
  { id: "courier_001", name: "Courier", class: "Vanguard", rarity: 4, dp_cost: 11, stats: { hp: 18, atk: 3, def: 5 }, movement: "1:1", ability: { type: "passive", title: "Courier Guard", description: "+3 Armor when in a Collision Lock." } },
  { id: "zima_001", name: "Zima", class: "Vanguard", rarity: 5, dp_cost: 12, stats: { hp: 16, atk: 5, def: 5 }, movement: "1:1", ability: { type: "passive", title: "General", description: "Vanguards in hand cost -2 DP." } },
  { id: "reed_001", name: "Reed", class: "Vanguard", rarity: 5, dp_cost: 12, stats: { hp: 13, atk: 7, def: 4 }, movement: "1:1", ability: { type: "passive", title: "Swift Strike", description: "Each kill generates +1 extra DP." } },
  { id: "saga_001", name: "Saga", class: "Vanguard", rarity: 6, dp_cost: 14, stats: { hp: 17, atk: 6, def: 3 }, movement: "1:1", ability: { type: "activated", title: "Cleave", description: "Hits target (100%) and unit behind (50%). Gain +2 DP on kill.", sp: 4, initialSp: 0 } },
  { id: "flametail_001", name: "Flametail", class: "Vanguard", rarity: 6, dp_cost: 13, stats: { hp: 15, atk: 6, def: 4 }, movement: "1:1", ability: { type: "passive", title: "Dodge", description: "50% chance to ignore Melee damage." } },
  
  /* --- DEFENDERS (6) --- */
  { id: "beagle_001", name: "Beagle", class: "Defender", rarity: 3, dp_cost: 18, stats: { hp: 25, atk: 3, def: 10 }, movement: "1:1", ability: { type: "passive", title: "Bulwark", description: "Standard high HP defender logic." } },
  { id: "cuora_001", name: "Cuora", class: "Defender", rarity: 4, dp_cost: 19, stats: { hp: 35, atk: 2, def: 12 }, movement: "1:1", ability: { type: "activated", title: "Shell Shield", description: "Heal 10 HP; Move speed becomes 0.", sp: 12, initialSp: 5, duration: 2 } },
  { id: "matterhorn_001", name: "Matterhorn", class: "Defender", rarity: 4, dp_cost: 20, stats: { hp: 30, atk: 3, def: 8 }, movement: "1:1", ability: { type: "passive", title: "Ice Field", description: "Takes 50% less damage from Casters." } },
  { id: "liskarm_001", name: "Liskarm", class: "Defender", rarity: 5, dp_cost: 22, stats: { hp: 24, atk: 5, def: 9 }, movement: "1:1", ability: { type: "passive", title: "Tactical Charge", description: "+1 DP every time she is hit." } },
  { id: "nearl_001", name: "Nearl", class: "Defender", rarity: 5, dp_cost: 22, stats: { hp: 22, atk: 4, def: 8 }, movement: "1:1", ability: { type: "passive", title: "Pegasus", description: "End of Turn: Restore 3 HP to self." } },
  { id: "hoshiguma_001", name: "Hoshiguma", class: "Defender", rarity: 6, dp_cost: 25, stats: { hp: 40, atk: 6, def: 11 }, movement: "1:1", ability: { type: "passive", title: "Thorns", description: "Returns 2 damage to any attacker." } },

  /* --- GUARDS (8) --- */
  { id: "melantha_001", name: "Melantha", class: "Guard", rarity: 3, dp_cost: 15, stats: { hp: 15, atk: 9, def: 3 }, movement: "1:1", ability: { type: "passive", title: "Duelist", description: "+3 ATK if only 1 enemy in slot." } },
  { id: "silverash_001", name: "SilverAsh", class: "Guard", rarity: 6, dp_cost: 26, stats: { hp: 20, atk: 8, def: 5 }, movement: "1:1", ability: { type: "activated", title: "TSS", description: "Range 2, hits 3 targets across lanes.", sp: 20, initialSp: 10, duration: 3 } },
  { id: "amiya_g_001", name: "Amiya (Guard)", "class": "Guard", rarity: 5, dp_cost: 18, stats: { hp: 18, atk: 10, def: 4 }, movement: "1:1", ability: { type: "activated", title: "Ying Xiao", description: "True Damage: Ignores Armor.", sp: 15, initialSp: 0, duration: 1 } },
  { id: "specter_001", name: "Specter", "class": "Guard", rarity: 5, dp_cost: 21, stats: { hp: 22, atk: 7, def: 4 }, movement: "1:1", ability: { type: "activated", title: "Immortality", description: "HP cannot drop below 1 for 1 turn.", sp: 18, initialSp: 10, duration: 1 } },
  { id: "lappland_001", name: "Lappland", "class": "Guard", rarity: 5, dp_cost: 19, stats: { hp: 17, atk: 7, def: 5 }, movement: "1:1", ability: { type: "passive", title: "Silence", description: "Target special ability becomes NULL." } },
  { id: "chen_001", name: "Ch'en", "class": "Guard", rarity: 6, dp_cost: 23, stats: { hp: 19, atk: 6, def: 6 }, movement: "1:1", ability: { type: "activated", title: "Chi Xiao", description: "Hits 10x instantly; then Halt for 1 turn.", sp: 10, initialSp: 0 } },
  { id: "mountain_001", name: "Mountain", "class": "Guard", rarity: 6, dp_cost: 11, stats: { hp: 24, atk: 5, def: 5 }, movement: "1:1", ability: { type: "activated", title: "Sweeper", description: "Toggle: Armor -3, ATK +4.", sp: 5, initialSp: 0 } },
  { id: "surtr_001", name: "Surtr", "class": "Guard", rarity: 6, dp_cost: 21, stats: { hp: 20, atk: 15, def: 4 }, movement: "1:1", ability: { type: "activated", title: "Twilight", description: "ATK=15; Deletes self after 3 turns.", sp: 5, initialSp: 5, duration: 3 } },

  /* --- SNIPERS (5) --- */
  { id: "kroos_001", name: "Kroos", "class": "Sniper", rarity: 3, dp_cost: 12, stats: { hp: 10, atk: 4, def: 2 }, movement: "1:2", ability: { type: "passive", title: "Double Tap", description: "Hits twice per cycle." } },
  { id: "exusiai_001", name: "Exusiai", "class": "Sniper", rarity: 6, dp_cost: 14, stats: { hp: 12, atk: 5, def: 3 }, movement: "1:2", ability: { type: "activated", title: "Overload", description: "Hits 5 times for 1 turn.", sp: 14, initialSp: 0, duration: 1 } },
  { id: "platinum_001", name: "Platinum", "class": "Sniper", rarity: 5, dp_cost: 13, stats: { hp: 11, atk: 10, def: 2 }, movement: "1:2", ability: { type: "passive", title: "Pegasus Sight", description: "Range increases to 3 slots." } },
  { id: "blue_poison_001", name: "Blue Poison", "class": "Sniper", rarity: 5, dp_cost: 13, stats: { hp: 9, atk: 6, def: 1 }, movement: "1:2", ability: { type: "passive", title: "Neurotoxin", description: "Deals 2 poison damage next turn." } },
  { id: "shirayuki_001", name: "Shirayuki", "class": "Sniper", rarity: 4, dp_cost: 22, stats: { hp: 13, atk: 5, def: 3 }, movement: "1:2", ability: { type: "passive", title: "Shuriken", description: "Hits all units in the targeted slot." } },

  /* --- CASTERS (5) --- */
  { id: "amiya_c_001", name: "Amiya (Caster)", "class": "Caster", rarity: 5, dp_cost: 19, stats: { hp: 12, atk: 8, def: 2 }, movement: "1:2", ability: { type: "activated", title: "Arts Burst", description: "Ignore 5 Armor. -2 HP/turn.", sp: 10, initialSp: 0, duration: 3 } },
  { id: "eyjafjalla_001", name: "Eyjafjalla", "class": "Caster", rarity: 6, dp_cost: 21, stats: { hp: 13, atk: 12, def: 3 }, movement: "1:2", ability: { type: "on_deploy", title: "Volcano", description: "On Deploy: 10 damage to all in lane." } },
  { id: "ifrit_001", name: "Ifrit", "class": "Caster", rarity: 6, dp_cost: 34, stats: { hp: 18, atk: 15, def: 3 }, movement: "0:0", ability: { type: "passive", title: "Line of Fire", description: "Hits all enemies in a straight line." } },
  { id: "haze_001", name: "Haze", "class": "Caster", rarity: 4, dp_cost: 18, stats: { hp: 11, atk: 7, def: 2 }, movement: "1:2", ability: { type: "passive", title: "Dark Fog", description: "Reduces target's Armor by 3." } },
  { id: "mostima_001", name: "Mostima", "class": "Caster", rarity: 6, dp_cost: 32, stats: { hp: 16, atk: 9, def: 4 }, movement: "1:2", ability: { type: "on_deploy", title: "Chronos", description: "On Deploy: Push all enemies back 1 slot." } },

  /* --- MEDICS (4) --- */
  { id: "hibiscus_001", name: "Hibiscus", "class": "Medic", rarity: 3, dp_cost: 15, stats: { hp: 12, atk: 5, def: 2 }, movement: "1:2", ability: { type: "passive", title: "Heal", description: "Restore 5 HP to unit in front." } },
  { id: "ptilopsis_001", name: "Ptilopsis", "class": "Medic", rarity: 5, dp_cost: 18, stats: { hp: 14, atk: 4, def: 3 }, movement: "1:2", ability: { type: "passive", title: "Haste", description: "All 1:2 units move at 1:1 speed." } },
  { id: "warfarin_001", name: "Warfarin", "class": "Medic", rarity: 5, dp_cost: 17, stats: { hp: 13, atk: 5, def: 2 }, movement: "1:2", ability: { type: "on_deploy", title: "Unstable", description: "Give unit in front +5 ATK for 2 turns." } },
  { id: "shining_001", name: "Shining", "class": "Medic", rarity: 6, dp_cost: 20, stats: { hp: 15, atk: 6, def: 4 }, movement: "1:2", ability: { type: "passive", title: "Creed", description: "Unit being healed gains +5 Armor." } },

  /* --- SPECIALISTS (8) --- */
  { id: "red_001", name: "Projekt Red", "class": "Specialist", rarity: 5, dp_cost: 10, stats: { hp: 12, atk: 10, def: 3 }, movement: "1:1", ability: { type: "on_deploy", title: "Executioner", description: "Deals 10 instant damage to enemy in slot." } },
  { id: "gravel_001", name: "Gravel", "class": "Specialist", rarity: 4, dp_cost: 6, stats: { hp: 15, atk: 3, def: 6 }, movement: "1:1", ability: { type: "on_deploy", title: "Shield", description: "Deploy with 25 HP shield." } },
  { id: "shaw_001", name: "Shaw", "class": "Specialist", rarity: 4, dp_cost: 11, stats: { hp: 16, atk: 4, def: 5 }, movement: "1:1", ability: { type: "on_deploy", title: "Push", description: "Push enemy back 1 slot." } },
  { id: "rope_001", name: "Rope", "class": "Specialist", rarity: 4, dp_cost: 11, stats: { hp: 14, atk: 4, def: 4 }, movement: "1:1", ability: { type: "on_deploy", title: "Pull", description: "Pull enemy forward 1 slot." } },
  { id: "jaye_001", name: "Jaye", "class": "Specialist", rarity: 4, dp_cost: 5, stats: { hp: 18, atk: 7, def: 4 }, movement: "1:1", ability: { type: "passive", title: "Merchant", description: "Pay 2 DP/turn to stay on board." } },
  { id: "ethan_001", name: "Ethan", "class": "Specialist", rarity: 4, dp_cost: 12, stats: { hp: 14, atk: 5, def: 3 }, movement: "1:1", ability: { type: "passive", title: "Ghost", description: "50% chance to bypass Collision Lock." } },
  { id: "aak_001", name: "Aak", class: "Specialist", rarity: 6, dp_cost: 15, stats: { hp: 18, atk: 8, def: 4 }, movement: "1:1", ability: { type: "on_deploy", title: "Drug", description: "Hit ally for 2 damage to give +5 ATK." } },
  { id: "manticore_001", name: "Manticore", class: "Specialist", rarity: 5, dp_cost: 19, stats: { hp: 15, atk: 9, def: 2 }, movement: "1:1", ability: { type: "passive", title: "Stalk", description: "Cannot be targeted by Ranged units." } }
];

export const BATTLE_ITEMS: Operator[] = [
  { id: "item_block_01", name: "Roadblock", class: "Item", rarity: 3, dp_cost: 5, stats: { hp: 50, atk: 0, def: 20 }, movement: "0:0", ability: { type: "passive", title: "Wall", description: "Stops movement in slot." } },
  { id: "item_mine_01", name: "Originium Bomb", class: "Item", rarity: 4, dp_cost: 10, stats: { hp: 1, atk: 25, def: 0 }, movement: "0:0", ability: { type: "on_deploy", title: "Detonate", description: "25 True Damage to neighbors." } },
  { id: "item_drone_01", name: "UAV Scout", class: "Item", rarity: 4, dp_cost: 7, stats: { hp: 10, atk: 0, def: 0 }, movement: "0:0", ability: { type: "passive", title: "Scout", description: "Reduces enemy Armor by 5 in lane." } },
  { id: "item_med_01", name: "Medical Station", class: "Item", rarity: 4, dp_cost: 12, stats: { hp: 15, atk: 0, def: 5 }, movement: "0:0", ability: { type: "passive", title: "Auto-Heal", description: "Restores 2 HP/sec to slot ally." } }
];

export const SUPPORT_ROBOTS: Operator[] = [
  { id: "support_001", name: "Castle-3", class: "Robot", rarity: 2, dp_cost: 3, stats: { hp: 10, atk: 4, def: 4 }, movement: "1:1", ability: { type: "passive", title: "Tactical Support", description: "+10% ATK to all Guards." } },
  { id: "support_002", name: "Lancet-2", class: "Robot", rarity: 2, dp_cost: 3, stats: { hp: 10, atk: 0, def: 3 }, movement: "1:1", ability: { type: "on_deploy", title: "Emergency Heal", description: "Heal 5 HP to all allies." } }
];

export const ALL_ASSETS = [...OPERATORS, ...BATTLE_ITEMS, ...SUPPORT_ROBOTS];

export const AI_ENEMIES: Operator[] = [
  { id: "dummy_slug", name: "Originium Slug", class: "Guard", rarity: 1, dp_cost: 0, stats: { hp: 12, atk: 1, def: 0 }, movement: "1:1", ability: { type: "passive", title: "None", description: "" } },
  { id: "sarkaz_merc", name: "Sarkaz Mercenary", class: "Guard", rarity: 3, dp_cost: 0, stats: { hp: 50, atk: 1, def: 1 }, movement: "1:1", ability: { type: "passive", title: "Heavy", description: "" } },
  { id: "sarkaz_merc_2", name: "Sarkaz Mercenary", class: "Guard", rarity: 3, dp_cost: 0, stats: { hp: 50, atk: 1, def: 1 }, movement: "1:1", ability: { type: "passive", title: "Heavy", description: "" } },
  { id: "ai_1", name: "Originium Slug", class: "Guard", rarity: 1, dp_cost: 0, stats: { hp: 12, atk: 1, def: 0 }, movement: "1:1", ability: { type: "passive", title: "None", description: "" } },
  { id: "ai_2", name: "Sarkaz Mercenary", class: "Guard", rarity: 3, dp_cost: 0, stats: { hp: 50, atk: 1, def: 1 }, movement: "1:1", ability: { type: "passive", title: "Heavy", description: "" } },
  { id: "ai_3", name: "Originium Slug", class: "Guard", rarity: 1, dp_cost: 0, stats: { hp: 12, atk: 1, def: 0 }, movement: "1:1", ability: { type: "passive", title: "None", description: "" } },
  { id: "ai_4", name: "Sarkaz Mercenary", class: "Guard", rarity: 3, dp_cost: 0, stats: { hp: 50, atk: 1, def: 1 }, movement: "1:1", ability: { type: "passive", title: "Heavy", description: "" } }
];
