export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR';
export type Faction = 'Fire' | 'Water' | 'Nature' | 'Light' | 'Dark';
export type ClassType = 'Warrior' | 'Archer' | 'Mage';

export type BossAffix = 'NONE' | 'REGEN' | 'ARMORED' | 'BERSERK' | 'EVASIVE';
export const BOSS_AFFIX_JA: Record<BossAffix, string> = { NONE: 'なし', REGEN: '再生', ARMORED: '装甲', BERSERK: '狂化', EVASIVE: '回避' };

export const FACTION_JA: Record<Faction, string> = { Fire: '炎', Water: '水', Nature: '木', Light: '光', Dark: '闇' };
export const CLASS_JA: Record<ClassType, string> = { Warrior: '戦士', Archer: '弓使', Mage: '魔法' };

export interface HeroPassive {
  name: string;
  type: 'ADJACENT_BUFF' | 'SELF_CRIT' | 'FACTION_BUFF' | 'CLASS_BUFF';
  value: number; // multiplier or percentage
  description: string;
}

export interface HeroDef {
  id: string;
  name: string;
  rarity: Rarity;
  faction: Faction;
  classType: ClassType;
  baseDps: number;
  emoji: string;
  passive?: HeroPassive;
}

export const RARITY_COLORS: Record<Rarity, { bg: string, border: string, text: string }> = {
  N: { bg: 'bg-gray-800', border: 'border-gray-500', text: 'text-gray-300' },
  R: { bg: 'bg-blue-900', border: 'border-blue-500', text: 'text-blue-300' },
  SR: { bg: 'bg-purple-900', border: 'border-purple-500', text: 'text-purple-300' },
  SSR: { bg: 'bg-yellow-900', border: 'border-yellow-400', text: 'text-yellow-300' },
  UR: { bg: 'bg-red-900', border: 'border-red-500', text: 'text-red-400' },
};

export const FACTION_COLORS: Record<Faction, string> = {
  Fire: 'text-red-400',
  Water: 'text-blue-400',
  Nature: 'text-green-400',
  Light: 'text-yellow-400',
  Dark: 'text-purple-400',
};

export const HEROES: HeroDef[] = [
  { id: 'h1', name: 'Ignis', rarity: 'N', faction: 'Fire', classType: 'Warrior', baseDps: 10, emoji: '🤺', passive: { name: '熱血', type: 'SELF_CRIT', value: 0.1, description: '自身のクリティカル率+10%' } },
  { id: 'h2', name: 'Aqua', rarity: 'N', faction: 'Water', classType: 'Mage', baseDps: 10, emoji: '💧', passive: { name: '水の加護', type: 'FACTION_BUFF', value: 1.05, description: '味方の水属性DPS+5%' } },
  { id: 'h3', name: 'Flora', rarity: 'N', faction: 'Nature', classType: 'Archer', baseDps: 10, emoji: '🏹', passive: { name: '自然の息吹', type: 'ADJACENT_BUFF', value: 1.05, description: '隣接する味方のDPS+5%' } },
  { id: 'h4', name: 'Ember', rarity: 'R', faction: 'Fire', classType: 'Archer', baseDps: 25, emoji: '🔥', passive: { name: '炎の矢', type: 'CLASS_BUFF', value: 1.1, description: '味方のアーチャーDPS+10%' } },
  { id: 'h5', name: 'Tide', rarity: 'R', faction: 'Water', classType: 'Warrior', baseDps: 25, emoji: '🌊', passive: { name: '荒波', type: 'SELF_CRIT', value: 0.2, description: '自身のクリティカル率+20%' } },
  { id: 'h6', name: 'Thorn', rarity: 'R', faction: 'Nature', classType: 'Mage', baseDps: 25, emoji: '🌿', passive: { name: '茨の盾', type: 'ADJACENT_BUFF', value: 1.1, description: '隣接する味方のDPS+10%' } },
  { id: 'h7', name: 'Lumina', rarity: 'SR', faction: 'Light', classType: 'Warrior', baseDps: 80, emoji: '✨', passive: { name: '光の導き', type: 'FACTION_BUFF', value: 1.15, description: '味方の光属性DPS+15%' } },
  { id: 'h8', name: 'Umbra', rarity: 'SR', faction: 'Dark', classType: 'Mage', baseDps: 80, emoji: '🌑', passive: { name: '闇の知識', type: 'CLASS_BUFF', value: 1.15, description: '味方のメイジDPS+15%' } },
  { id: 'h9', name: 'Blaze', rarity: 'SSR', faction: 'Fire', classType: 'Mage', baseDps: 300, emoji: '🌋', passive: { name: '爆炎', type: 'ADJACENT_BUFF', value: 1.2, description: '隣接する味方のDPS+20%' } },
  { id: 'h10', name: 'Frost', rarity: 'SSR', faction: 'Water', classType: 'Archer', baseDps: 300, emoji: '❄️', passive: { name: '絶対零度', type: 'SELF_CRIT', value: 0.3, description: '自身のクリティカル率+30%' } },
  { id: 'h11', name: 'Solaris', rarity: 'UR', faction: 'Light', classType: 'Mage', baseDps: 1500, emoji: '☀️', passive: { name: '太陽の恵み', type: 'FACTION_BUFF', value: 1.3, description: '味方の光属性DPS+30%' } },
  { id: 'h12', name: 'Void', rarity: 'UR', faction: 'Dark', classType: 'Warrior', baseDps: 1500, emoji: '🌌', passive: { name: '虚無の力', type: 'CLASS_BUFF', value: 1.3, description: '味方のウォリアーDPS+30%' } },
];

export const ENEMIES = ['🦇', '🐺', '🐗', '🐍', '🕷️', '🦂', '🧟', '🧛', '👹', '👺', '👻', '👽', '👾', '🤖'];
export const BOSSES = ['🐉', '🦖', '🦑', '🌋', '👁️'];

// Enemy Elements
export const ENEMY_ELEMENTS: Faction[] = ['Dark', 'Nature', 'Nature', 'Nature', 'Dark', 'Fire', 'Dark', 'Dark', 'Fire', 'Fire', 'Dark', 'Light', 'Dark', 'Light'];
export const BOSS_ELEMENTS: Faction[] = ['Fire', 'Nature', 'Water', 'Fire', 'Dark'];

export function getEnemyElement(stage: number): Faction {
  if (stage % 10 === 0) {
    return BOSS_ELEMENTS[(stage / 10 - 1) % BOSS_ELEMENTS.length];
  }
  return ENEMY_ELEMENTS[(stage - 1) % ENEMIES.length];
}

export function getBossAffix(stage: number): BossAffix {
  if (stage % 10 !== 0) return 'NONE';
  const affixes: BossAffix[] = ['REGEN', 'ARMORED', 'BERSERK', 'EVASIVE'];
  // Random but deterministic based on stage
  return affixes[(stage / 10) % affixes.length];
}

export function getElementalMultiplier(attacker: Faction, defender: Faction): number {
  if (attacker === 'Fire' && defender === 'Nature') return 1.5;
  if (attacker === 'Nature' && defender === 'Water') return 1.5;
  if (attacker === 'Water' && defender === 'Fire') return 1.5;
  
  if (attacker === 'Light' && defender === 'Dark') return 1.5;
  if (attacker === 'Dark' && defender === 'Light') return 1.5;

  if (attacker === 'Fire' && defender === 'Water') return 0.75;
  if (attacker === 'Water' && defender === 'Nature') return 0.75;
  if (attacker === 'Nature' && defender === 'Fire') return 0.75;

  return 1.0;
}

export type EquipmentType = 'weapon' | 'armor' | 'accessory';
export type EquipmentRarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR';

export interface Equipment {
  id: string; // Unique instance ID
  type: EquipmentType;
  rarity: EquipmentRarity;
  name: string;
  dpsBonus: number; // Flat DPS addition
  dpsMultiplier: number; // Percentage DPS multiplier (e.g., 1.1 for +10%)
}

export interface HeroInstance {
  uid: string;
  heroId: string;
  star: number; // 1, 2, 3
  level?: number; // Optional for backward compatibility
  equipment?: {
    weapon?: Equipment;
    armor?: Equipment;
    accessory?: Equipment;
  };
}

export interface Mission {
  id: string;
  title: string;
  type: 'kill' | 'gacha' | 'stage';
  target: number;
  rewardGems: number;
  progress: number;
  claimed: boolean;
  isDaily?: boolean;
}

export type ArtifactId = 'fire_pen' | 'water_cha' | 'nature_shi' | 'light_swo' | 'dark_rob' | 'warrior_bad' | 'archer_bow' | 'mage_sta' | 'boss_sla' | 'gold_rin';

export interface ArtifactDef {
  id: ArtifactId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  effect: (level: number) => { type: 'GLOBAL_DPS' | 'FACTION_DPS' | 'CLASS_DPS' | 'BOSS_HP' | 'GOLD_DROP'; target?: string; value: number };
}

export const ARTIFACTS: ArtifactDef[] = [
  { id: 'fire_pen', name: '炎のペンダント', description: '炎属性のDPSを増加', maxLevel: 10, baseCost: 1, costMultiplier: 1.5, effect: (lvl) => ({ type: 'FACTION_DPS', target: 'Fire', value: 1 + lvl * 0.1 }) },
  { id: 'water_cha', name: '水の聖杯', description: '水属性のDPSを増加', maxLevel: 10, baseCost: 1, costMultiplier: 1.5, effect: (lvl) => ({ type: 'FACTION_DPS', target: 'Water', value: 1 + lvl * 0.1 }) },
  { id: 'nature_shi', name: '大地の盾', description: '自然属性のDPSを増加', maxLevel: 10, baseCost: 1, costMultiplier: 1.5, effect: (lvl) => ({ type: 'FACTION_DPS', target: 'Nature', value: 1 + lvl * 0.1 }) },
  { id: 'light_swo', name: '光の剣', description: '光属性のDPSを増加', maxLevel: 10, baseCost: 1, costMultiplier: 1.5, effect: (lvl) => ({ type: 'FACTION_DPS', target: 'Light', value: 1 + lvl * 0.1 }) },
  { id: 'dark_rob', name: '闇のローブ', description: '闇属性のDPSを増加', maxLevel: 10, baseCost: 1, costMultiplier: 1.5, effect: (lvl) => ({ type: 'FACTION_DPS', target: 'Dark', value: 1 + lvl * 0.1 }) },
  { id: 'warrior_bad', name: '戦士の証', description: 'ウォリアーのDPSを増加', maxLevel: 10, baseCost: 1, costMultiplier: 1.5, effect: (lvl) => ({ type: 'CLASS_DPS', target: 'Warrior', value: 1 + lvl * 0.1 }) },
  { id: 'archer_bow', name: '狩人の弓', description: 'アーチャーのDPSを増加', maxLevel: 10, baseCost: 1, costMultiplier: 1.5, effect: (lvl) => ({ type: 'CLASS_DPS', target: 'Archer', value: 1 + lvl * 0.1 }) },
  { id: 'mage_sta', name: '魔術師の杖', description: 'メイジのDPSを増加', maxLevel: 10, baseCost: 1, costMultiplier: 1.5, effect: (lvl) => ({ type: 'CLASS_DPS', target: 'Mage', value: 1 + lvl * 0.1 }) },
  { id: 'boss_sla', name: 'ボススレイヤー', description: 'ボスの最大HPを減少', maxLevel: 5, baseCost: 3, costMultiplier: 2.0, effect: (lvl) => ({ type: 'BOSS_HP', value: 1 - lvl * 0.05 }) },
  { id: 'gold_rin', name: '黄金の指輪', description: '獲得ゴールドを増加', maxLevel: 10, baseCost: 2, costMultiplier: 1.8, effect: (lvl) => ({ type: 'GOLD_DROP', value: 1 + lvl * 0.2 }) },
];

export type PlayerSkillId = 'meteor' | 'freeze' | 'gold_rush';

export interface PlayerSkill {
  id: PlayerSkillId;
  name: string;
  description: string;
  cooldown: number; // seconds
  baseCost: number; // gems to unlock/upgrade
  costMultiplier: number;
  maxLevel: number;
}

export const PLAYER_SKILLS: PlayerSkill[] = [
  { id: 'meteor', name: 'メテオストライク', description: '敵の最大HPの(10% * Lv)のダメージを与える', cooldown: 60, baseCost: 100, costMultiplier: 1.5, maxLevel: 5 },
  { id: 'freeze', name: 'タイムフリーズ', description: 'ボス制限時間を(3秒 * Lv)延長し、その間DPSが1.5倍', cooldown: 120, baseCost: 200, costMultiplier: 1.5, maxLevel: 5 },
  { id: 'gold_rush', name: 'ゴールドラッシュ', description: '(5秒 * Lv)の間、獲得ゴールドが3倍になる', cooldown: 180, baseCost: 300, costMultiplier: 1.5, maxLevel: 5 },
];

export interface Formation {
  id: string;
  name: string;
  description: string;
  positions: number[]; // required indices (0-8)
  bonus: {
    type: 'global_dps' | 'front_dps' | 'back_dps' | 'mid_dps' | 'elemental';
    value: number; // multiplier or flat add
  };
}

export const FORMATIONS: Formation[] = [
  { id: 'cross', name: 'クロス陣形', description: '十字に配置: 全員のDPS +20%', positions: [1, 3, 4, 5, 7], bonus: { type: 'global_dps', value: 1.2 } },
  { id: 'x_shape', name: 'X字陣形', description: 'X字に配置: 後衛(最後列)のDPS +40%', positions: [0, 2, 4, 6, 8], bonus: { type: 'back_dps', value: 1.4 } },
  { id: 'v_shape', name: 'V字陣形', description: 'V字に配置: 前衛(最前列)のDPS +40%', positions: [0, 2, 4, 7], bonus: { type: 'front_dps', value: 1.4 } },
  { id: 'line', name: '一文字陣形', description: '中衛一列に配置: 中衛(中央列)のDPS +50%', positions: [3, 4, 5], bonus: { type: 'mid_dps', value: 1.5 } },
];

export type TalentId = 'base_dps' | 'gold_gain' | 'offline_efficiency' | 'gacha_discount' | 'sr_rate_up' | 'boss_damage' | 'hero_level_discount' | 'equipment_drop_rate' | 'starting_stage';

export interface Talent {
  id: TalentId;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
  effectPerLevel: number;
}

export const TALENTS: Talent[] = [
  { id: 'base_dps', name: '力の探求', description: '全ヒーローの基礎DPSが +5% 増加', maxLevel: 50, baseCost: 1, costMultiplier: 1.2, effectPerLevel: 0.05 },
  { id: 'gold_gain', name: '富の蓄積', description: '敵討伐時の獲得ゴールドが +10% 増加', maxLevel: 50, baseCost: 1, costMultiplier: 1.3, effectPerLevel: 0.1 },
  { id: 'offline_efficiency', name: '時の支配', description: 'オフライン進行時の効率が +5% 増加 (初期20%)', maxLevel: 16, baseCost: 2, costMultiplier: 1.5, effectPerLevel: 0.05 },
  { id: 'gacha_discount', name: '交渉術', description: 'ノーマルガチャの費用が -2% 減少', maxLevel: 25, baseCost: 3, costMultiplier: 1.4, effectPerLevel: 0.02 },
  { id: 'sr_rate_up', name: '幸運の星', description: 'ノーマルガチャのSR排出率が +0.1% 増加', maxLevel: 20, baseCost: 5, costMultiplier: 1.6, effectPerLevel: 0.001 },
  { id: 'boss_damage', name: '巨獣狩り', description: 'ボスへのダメージが +10% 増加', maxLevel: 30, baseCost: 2, costMultiplier: 1.3, effectPerLevel: 0.1 },
  { id: 'hero_level_discount', name: '教育係', description: 'ヒーローのレベルアップ費用が -2% 減少', maxLevel: 25, baseCost: 3, costMultiplier: 1.4, effectPerLevel: 0.02 },
  { id: 'equipment_drop_rate', name: 'トレジャーハンター', description: '装備のドロップ率が +1% 増加', maxLevel: 20, baseCost: 5, costMultiplier: 1.5, effectPerLevel: 0.01 },
  { id: 'starting_stage', name: '強者の余裕', description: '転生時の開始ステージが +1 増加', maxLevel: 50, baseCost: 10, costMultiplier: 1.8, effectPerLevel: 1 },
];

export interface GameState {
  gold: number;
  gems: number;
  stage: number;
  enemyHp: number;
  enemyMaxHp: number;
  board: (HeroInstance | null)[]; // length 9
  bench: (HeroInstance | null)[]; // length 5
  bossTimeLeft: number | null;
  prestigePoints?: number;
  prestigeMultiplier?: number;
  prestigeCount?: number;
  talents?: Record<TalentId, number>; // level of each talent
  autoSellN?: boolean; // Nレア自動売却フラグ
  upgrades?: {
    tapDamage: number; // level
    heroDps: number;   // level
  };
  artifacts: Record<ArtifactId, number>; // level of each artifact
  lastSaveTime?: number;
  lastLoginDate?: string;
  achievements?: Record<string, boolean>;
  // New features
  pityCounter: number;
  totalKills: number;
  totalGachaPulls: number;
  missions: Mission[];
  unlockedHeroes: string[];
  // Phase 4 features
  heroSouls?: Record<string, number>; // heroId -> soul count
  heroAwakenings?: Record<string, number>; // heroId -> awakening level (0-5)
  premiumGachaCount?: number;
  activeSkills?: Record<PlayerSkillId, number>; // skillId -> level
  skillCooldowns?: Record<PlayerSkillId, number>; // skillId -> timestamp when available
  activeFormationId?: string | null;
  formations?: Record<string, number>; // formationId -> level (0 means locked, 1+ means unlocked/upgraded)
  artifactShards?: number;
  currentBossAffix?: BossAffix;
  activeSkillBuffs?: Record<PlayerSkillId, number>; // skillId -> timestamp when buff ends
  activeExpeditions?: ActiveExpedition[];
  inventory?: Equipment[];
}

export interface SynergyCount {
  faction: Record<Faction, number>;
  class: Record<ClassType, number>;
}

export function getSynergies(board: (HeroInstance | null)[]): SynergyCount {
  const uniqueHeroes = new Set<string>();
  const counts: SynergyCount = {
    faction: { Fire: 0, Water: 0, Nature: 0, Light: 0, Dark: 0 },
    class: { Warrior: 0, Archer: 0, Mage: 0 }
  };

  board.forEach(inst => {
    if (inst && !uniqueHeroes.has(inst.heroId)) {
      uniqueHeroes.add(inst.heroId);
      const def = HEROES.find(h => h.id === inst.heroId)!;
      counts.faction[def.faction]++;
      counts.class[def.classType]++;
    }
  });
  return counts;
}

export function generateEquipmentDrop(stage: number, dropRateBonus: number = 0): Equipment | null {
  // 20% chance to drop on boss kill + bonus
  if (Math.random() > (0.2 + dropRateBonus)) return null;

  const types: EquipmentType[] = ['weapon', 'armor', 'accessory'];
  const type = types[Math.floor(Math.random() * types.length)];
  
  // Rarity based on stage
  let rarity: EquipmentRarity = 'N';
  const rand = Math.random();
  if (stage >= 100 && rand < 0.05) rarity = 'UR';
  else if (stage >= 50 && rand < 0.15) rarity = 'SSR';
  else if (stage >= 30 && rand < 0.3) rarity = 'SR';
  else if (stage >= 10 && rand < 0.5) rarity = 'R';

  // Stats based on rarity
  let dpsBonus = 0;
  let dpsMultiplier = 1.0;

  switch (rarity) {
    case 'N': dpsBonus = 10; dpsMultiplier = 1.02; break;
    case 'R': dpsBonus = 50; dpsMultiplier = 1.05; break;
    case 'SR': dpsBonus = 200; dpsMultiplier = 1.1; break;
    case 'SSR': dpsBonus = 1000; dpsMultiplier = 1.2; break;
    case 'UR': dpsBonus = 5000; dpsMultiplier = 1.5; break;
  }

  // Scale with stage slightly
  dpsBonus = Math.floor(dpsBonus * (1 + stage / 100));

  const names = {
    weapon: { N: '木の剣', R: '鉄の剣', SR: '鋼の剣', SSR: '勇者の剣', UR: '神剣' },
    armor: { N: '布の服', R: '革の鎧', SR: '鉄の鎧', SSR: '勇者の鎧', UR: '神鎧' },
    accessory: { N: '木の指輪', R: '銅の指輪', SR: '銀の指輪', SSR: '金の指輪', UR: '神の指輪' }
  };

  return {
    id: `eq_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type,
    rarity,
    name: names[type][rarity],
    dpsBonus,
    dpsMultiplier
  };
}

export function synthesizeEquipment(eqs: Equipment[]): Equipment | null {
  if (eqs.length !== 3) return null;
  const type = eqs[0].type;
  const rarity = eqs[0].rarity;
  if (!eqs.every(e => e.type === type && e.rarity === rarity)) return null;

  const rarities: EquipmentRarity[] = ['N', 'R', 'SR', 'SSR', 'UR'];
  const idx = rarities.indexOf(rarity);
  if (idx === -1 || idx === rarities.length - 1) return null; // Cannot synthesize UR

  const nextRarity = rarities[idx + 1];

  let dpsBonus = 0;
  let dpsMultiplier = 1.0;

  switch (nextRarity) {
    case 'N': dpsBonus = 10; dpsMultiplier = 1.02; break;
    case 'R': dpsBonus = 50; dpsMultiplier = 1.05; break;
    case 'SR': dpsBonus = 200; dpsMultiplier = 1.1; break;
    case 'SSR': dpsBonus = 1000; dpsMultiplier = 1.2; break;
    case 'UR': dpsBonus = 5000; dpsMultiplier = 1.5; break;
  }

  // Slight boost based on the synthesized items
  const avgBonus = (eqs[0].dpsBonus + eqs[1].dpsBonus + eqs[2].dpsBonus) / 3;
  dpsBonus = Math.floor(dpsBonus * (1 + (avgBonus / 10000)));

  const names = {
    weapon: { N: '木の剣', R: '鉄の剣', SR: '鋼の剣', SSR: '勇者の剣', UR: '神剣' },
    armor: { N: '布の服', R: '革の鎧', SR: '鉄の鎧', SSR: '勇者の鎧', UR: '神鎧' },
    accessory: { N: '木の指輪', R: '銅の指輪', SR: '銀の指輪', SSR: '金の指輪', UR: '神の指輪' }
  };

  return {
    id: `eq_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    type,
    rarity: nextRarity,
    name: names[type][nextRarity],
    dpsBonus,
    dpsMultiplier
  };
}

export type EnemyTrait = 'NONE' | 'ARMORED' | 'RESISTANT' | 'EVASIVE';

export interface ExpeditionDef {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  rewardType: 'gold' | 'gems' | 'artifactShards';
  baseReward: number;
  requiredLevel?: number;
}

export const EXPEDITIONS: ExpeditionDef[] = [
  { id: 'exp_gold_1', name: 'ゴブリンの金鉱', description: 'ゴールドを採掘します。', durationMinutes: 1, rewardType: 'gold', baseReward: 500 },
  { id: 'exp_gem_1', name: '水晶の洞窟', description: 'ジェムを発掘します。', durationMinutes: 5, rewardType: 'gems', baseReward: 50 },
  { id: 'exp_shard_1', name: '古代の遺跡', description: '遺物の欠片を探索します。', durationMinutes: 15, rewardType: 'artifactShards', baseReward: 2 },
  { id: 'exp_gold_2', name: 'ドラゴンの巣', description: '大量のゴールドを狙います。', durationMinutes: 30, rewardType: 'gold', baseReward: 20000 },
  { id: 'exp_gem_2', name: '星降る山頂', description: '大量のジェムを祈願します。', durationMinutes: 60, rewardType: 'gems', baseReward: 500 },
];

export interface ActiveExpedition {
  id: string;
  expeditionId: string;
  heroId: string;
  startTime: number;
  completed: boolean;
}

export function getEnemyTrait(stage: number): EnemyTrait {
  const isBoss = stage % 10 === 0;
  if (isBoss) {
    if (stage % 30 === 0) return 'EVASIVE';
    if (stage % 20 === 0) return 'RESISTANT';
    return 'ARMORED';
  }
  if (stage % 5 === 0) {
    return 'ARMORED';
  }
  return 'NONE';
}

export const TRAIT_JA: Record<EnemyTrait, string> = {
  NONE: 'なし',
  ARMORED: '硬い甲殻 (タップダメージ激減)',
  RESISTANT: '属性耐性 (弱点以外のDPS激減)',
  EVASIVE: '回避 (ヒーローDPS低下)'
};

export function calculateDps(gameState: GameState, enemyElement?: Faction, enemyTrait: EnemyTrait = 'NONE'): number {
  const { board, artifacts, heroAwakenings, activeFormationId, formations, currentBossAffix } = gameState;
  const syn = getSynergies(board);
  
  let globalMult = 1;
  if (syn.faction.Fire >= 4) globalMult += 0.5;
  else if (syn.faction.Fire >= 2) globalMult += 0.2;
  
  if (syn.faction.Water >= 4) globalMult += 0.5;
  else if (syn.faction.Water >= 2) globalMult += 0.2;
  
  if (syn.faction.Nature >= 4) globalMult += 0.5;
  else if (syn.faction.Nature >= 2) globalMult += 0.2;
  
  if (syn.faction.Light >= 2) globalMult += 0.5;
  if (syn.faction.Dark >= 2) globalMult += 0.5;

  if (syn.class.Warrior >= 4) globalMult += 0.4;
  else if (syn.class.Warrior >= 2) globalMult += 0.15;
  
  if (syn.class.Archer >= 4) globalMult += 0.4;
  else if (syn.class.Archer >= 2) globalMult += 0.15;
  
  if (syn.class.Mage >= 4) globalMult += 0.4;
  else if (syn.class.Mage >= 2) globalMult += 0.15;

  // Artifact Global Bonuses
  let factionArtifactMult: Record<string, number> = {};
  let classArtifactMult: Record<string, number> = {};
  
  ARTIFACTS.forEach(art => {
    const level = artifacts?.[art.id] || 0;
    if (level > 0) {
      const effect = art.effect(level);
      if (effect.type === 'GLOBAL_DPS') globalMult *= effect.value;
      if (effect.type === 'FACTION_DPS' && effect.target) factionArtifactMult[effect.target] = effect.value;
      if (effect.type === 'CLASS_DPS' && effect.target) classArtifactMult[effect.target] = effect.value;
    }
  });

  // Collection Bonus
  const unlockedCount = gameState.unlockedHeroes?.length || 0;
  const totalAwakenings = Object.values(gameState.heroAwakenings || {}).reduce((sum, level) => sum + level, 0);
  const collectionMult = 1 + (unlockedCount * 0.01) + (totalAwakenings * 0.02);
  globalMult *= collectionMult;

  // Formation Bonus
  let activeFormation: Formation | undefined;
  let formationLevel = 0;
  if (activeFormationId && formations?.[activeFormationId]) {
    activeFormation = FORMATIONS.find(f => f.id === activeFormationId);
    formationLevel = formations[activeFormationId];
    
    // Check if formation requirements are met
    if (activeFormation) {
      const isFormationActive = activeFormation.positions.every(pos => board[pos] !== null);
      if (isFormationActive) {
        if (activeFormation.bonus.type === 'global_dps') {
          globalMult *= (activeFormation.bonus.value + (formationLevel - 1) * 0.05);
        }
      } else {
        activeFormation = undefined; // Requirements not met
      }
    }
  }

  // Leader Skill (Center Slot - Index 4)
  const leaderInst = board[4];
  let leaderFaction: Faction | null = null;
  let leaderClass: ClassType | null = null;
  if (leaderInst) {
    const leaderDef = HEROES.find(h => h.id === leaderInst.heroId)!;
    leaderFaction = leaderDef.faction;
    leaderClass = leaderDef.classType;
  }

  // Pre-calculate Hero Passives
  const passiveBuffs = new Array(9).fill(1); // Multipliers for each slot
  board.forEach((inst, index) => {
    if (inst) {
      const def = HEROES.find(h => h.id === inst.heroId)!;
      if (def.passive) {
        if (def.passive.type === 'ADJACENT_BUFF') {
          // Apply to adjacent slots (up, down, left, right)
          const row = Math.floor(index / 3);
          const col = index % 3;
          const adjacents = [
            [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]
          ];
          adjacents.forEach(([r, c]) => {
            if (r >= 0 && r < 3 && c >= 0 && c < 3) {
              const adjIndex = r * 3 + c;
              passiveBuffs[adjIndex] *= def.passive!.value;
            }
          });
        }
      }
    }
  });

  let totalDps = 0;
  board.forEach((inst, index) => {
    if (inst) {
      const def = HEROES.find(h => h.id === inst.heroId)!;
      const starMult = Math.pow(3, inst.star - 1); // 1, 3, 9
      const levelMult = 1 + ((inst.level || 1) - 1) * 0.1; // +10% base DPS per level
      
      // Awakening Bonus
      const awakeningLevel = heroAwakenings?.[def.id] || 0;
      const awakeningMult = 1 + (awakeningLevel * 0.5); // +50% per awakening level
      
      let positionMult = 1;
      // Row 1 (Front): index 0, 1, 2
      if (index < 3 && def.classType === 'Warrior') positionMult = 1.3;
      // Row 2 (Middle): index 3, 4, 5
      else if (index >= 3 && index <= 5) positionMult = 1.1;
      // Row 3 (Back): index 6, 7, 8
      else if (index > 5 && (def.classType === 'Archer' || def.classType === 'Mage')) positionMult = 1.3;

      // Formation specific positional bonus
      if (activeFormation) {
        if (activeFormation.bonus.type === 'front_dps' && index < 3) {
          positionMult *= (activeFormation.bonus.value + (formationLevel - 1) * 0.05);
        } else if (activeFormation.bonus.type === 'mid_dps' && index >= 3 && index <= 5) {
          positionMult *= (activeFormation.bonus.value + (formationLevel - 1) * 0.05);
        } else if (activeFormation.bonus.type === 'back_dps' && index > 5) {
          positionMult *= (activeFormation.bonus.value + (formationLevel - 1) * 0.05);
        }
      }

      // Apply Leader Buff
      let leaderBuffMult = 1;
      if (leaderFaction && def.faction === leaderFaction) leaderBuffMult += 0.2; // +20% for same faction as leader
      if (leaderClass && def.classType === leaderClass) leaderBuffMult += 0.2; // +20% for same class as leader

      // Apply Hero Passives
      let heroPassiveMult = 1;
      if (def.passive && def.passive.type === 'SELF_CRIT') {
        heroPassiveMult += def.passive.value;
      }
      
      board.forEach((otherInst, otherIndex) => {
        if (otherInst) {
          const otherDef = HEROES.find(h => h.id === otherInst.heroId)!;
          if (otherDef.passive) {
            if (otherDef.passive.type === 'FACTION_BUFF' && def.faction === otherDef.faction) {
              heroPassiveMult += otherDef.passive.value - 1; // value is multiplier like 1.05, so add 0.05
            }
            if (otherDef.passive.type === 'CLASS_BUFF' && def.classType === otherDef.classType) {
              heroPassiveMult += otherDef.passive.value - 1;
            }
            if (otherDef.passive.type === 'ADJACENT_BUFF') {
              const row = Math.floor(index / 3);
              const col = index % 3;
              const otherRow = Math.floor(otherIndex / 3);
              const otherCol = otherIndex % 3;
              const isAdjacent = Math.abs(row - otherRow) + Math.abs(col - otherCol) === 1;
              if (isAdjacent) {
                heroPassiveMult += otherDef.passive.value - 1;
              }
            }
          }
        }
      });

      let elementalMult = 1;
      if (enemyElement) {
        elementalMult = getElementalMultiplier(def.faction, enemyElement);
      }

      if (enemyTrait === 'RESISTANT' && elementalMult <= 1) {
        elementalMult *= 0.2; // 弱点以外はダメージ1/5
      }

      let artifactMult = 1;
      if (artifacts) {
        if (def.faction === 'Fire' && artifacts.fire_pen) artifactMult += artifacts.fire_pen * 0.1; // +10% per level
        if (def.faction === 'Water' && artifacts.water_cha) artifactMult += artifacts.water_cha * 0.1;
        if (def.faction === 'Nature' && artifacts.nature_shi) artifactMult += artifacts.nature_shi * 0.1;
        if (def.faction === 'Light' && artifacts.light_swo) artifactMult += artifacts.light_swo * 0.1;
        if (def.faction === 'Dark' && artifacts.dark_rob) artifactMult += artifacts.dark_rob * 0.1;
        
        if (def.classType === 'Warrior' && artifacts.warrior_bad) artifactMult += artifacts.warrior_bad * 0.1;
        if (def.classType === 'Archer' && artifacts.archer_bow) artifactMult += artifacts.archer_bow * 0.1;
        if (def.classType === 'Mage' && artifacts.mage_sta) artifactMult += artifacts.mage_sta * 0.1;
      }

      // Equipment Bonuses
      let eqDpsBonus = 0;
      let eqDpsMult = 1;
      let setBonusMult = 1;

      if (inst.equipment) {
        if (inst.equipment.weapon) {
          eqDpsBonus += inst.equipment.weapon.dpsBonus;
          eqDpsMult *= inst.equipment.weapon.dpsMultiplier;
        }
        if (inst.equipment.armor) {
          eqDpsBonus += inst.equipment.armor.dpsBonus;
          eqDpsMult *= inst.equipment.armor.dpsMultiplier;
        }
        if (inst.equipment.accessory) {
          eqDpsBonus += inst.equipment.accessory.dpsBonus;
          eqDpsMult *= inst.equipment.accessory.dpsMultiplier;
        }

        // Set Bonus Logic
        if (inst.equipment.weapon && inst.equipment.armor && inst.equipment.accessory) {
          const rarities = [inst.equipment.weapon.rarity, inst.equipment.armor.rarity, inst.equipment.accessory.rarity];
          const rarityLevels = { 'N': 1, 'R': 2, 'SR': 3, 'SSR': 4, 'UR': 5 };
          const minRarityLevel = Math.min(...rarities.map(r => rarityLevels[r as keyof typeof rarityLevels]));
          
          if (minRarityLevel >= 5) setBonusMult = 4.0; // UR Set: +300%
          else if (minRarityLevel >= 4) setBonusMult = 2.0; // SSR Set: +100%
          else if (minRarityLevel >= 3) setBonusMult = 1.3; // SR Set: +30%
          else if (minRarityLevel >= 2) setBonusMult = 1.15; // R Set: +15%
          else if (minRarityLevel >= 1) setBonusMult = 1.05; // N Set: +5%
        }
      }

      const baseDpsWithEq = (def.baseDps + eqDpsBonus) * eqDpsMult * setBonusMult;

      totalDps += baseDpsWithEq * levelMult * starMult * globalMult * positionMult * leaderBuffMult * elementalMult * artifactMult * awakeningMult * heroPassiveMult;
    }
  });

  if (enemyTrait === 'EVASIVE' || gameState.currentBossAffix === 'EVASIVE') {
    totalDps *= 0.7; // 全体DPS 30%低下
  }

  // Upgrades Multiplier
  if (gameState.upgrades?.heroDps) {
    totalDps *= gameState.upgrades.heroDps;
  }

  // Prestige Multiplier
  if (gameState.prestigeMultiplier) {
    totalDps *= gameState.prestigeMultiplier;
  }

  // Talent Multiplier
  if (gameState.talents?.base_dps) {
    const talent = TALENTS.find(t => t.id === 'base_dps')!;
    totalDps *= (1 + (gameState.talents.base_dps * talent.effectPerLevel));
  }
  
  const isBoss = gameState.stage % 10 === 0;
  if (isBoss && gameState.talents?.boss_damage) {
    const talent = TALENTS.find(t => t.id === 'boss_damage')!;
    totalDps *= (1 + (gameState.talents.boss_damage * talent.effectPerLevel));
  }

  // Active Skill Buffs
  if (gameState.activeSkillBuffs?.freeze && Date.now() < gameState.activeSkillBuffs.freeze) {
    totalDps *= 1.5;
  }

  return totalDps;
}

export function getEnemyMaxHp(stage: number, artifacts?: Record<ArtifactId, number>): number {
  const isBoss = stage % 10 === 0;
  let hp = Math.floor(50 * Math.pow(1.20, stage - 1) * (isBoss ? 5 : 1));
  if (isBoss && artifacts && artifacts.boss_sla) {
    hp = Math.floor(hp * (1 - artifacts.boss_sla * 0.05)); // -5% per level
  }
  return hp;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  condition: (state: GameState) => boolean;
  rewardGems: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'stage_50', title: '駆け出しの勇者', description: 'ステージ50に到達する', condition: s => s.stage >= 50, rewardGems: 500 },
  { id: 'stage_100', title: '百戦錬磨', description: 'ステージ100に到達する', condition: s => s.stage >= 100, rewardGems: 1000 },
  { id: 'stage_200', title: '伝説の始まり', description: 'ステージ200に到達する', condition: s => s.stage >= 200, rewardGems: 2000 },
  { id: 'gacha_50', title: 'ガチャ初心者', description: 'ガチャを累計50回引く', condition: s => s.totalGachaPulls >= 50, rewardGems: 300 },
  { id: 'gacha_200', title: 'ガチャ中毒', description: 'ガチャを累計200回引く', condition: s => s.totalGachaPulls >= 200, rewardGems: 1000 },
  { id: 'prestige_1', title: '新たなる始まり', description: '初めて転生する', condition: s => (s.prestigeCount || 0) >= 1, rewardGems: 1000 },
  { id: 'prestige_5', title: '輪廻の果てに', description: '5回以上転生する', condition: s => (s.prestigeCount || 0) >= 5, rewardGems: 3000 },
  { id: 'damage_50', title: '破壊神', description: 'タップダメージLvを50にする', condition: s => (s.upgrades?.tapDamage || 0) >= 50, rewardGems: 500 },
  { id: 'hero_50', title: '指導者', description: 'ヒーローDPS Lvを50にする', condition: s => (s.upgrades?.heroDps || 0) >= 50, rewardGems: 500 },
];
