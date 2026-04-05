/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sword, Sparkles, Coins, Gem, Clock, Info, Trash2, ArrowUpCircle, TrendingUp, ScrollText, Target, Crown, BookOpen, Settings, Trophy, CloudUpload, CloudDownload, LogOut, LogIn, BarChart2, X, HelpCircle, CheckCircle2, Zap, ShieldAlert, Crosshair, Map, LayoutGrid, Combine, ChevronsUp } from 'lucide-react';
import { cn, formatNumber } from './lib/utils';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import {
  GameState,
  HEROES,
  ENEMIES,
  BOSSES,
  RARITY_COLORS,
  FACTION_COLORS,
  FACTION_JA,
  CLASS_JA,
  Rarity,
  HeroInstance,
  calculateDps,
  getEnemyMaxHp,
  getSynergies,
  getEnemyElement,
  getElementalMultiplier,
  getEnemyTrait,
  getBossAffix,
  TRAIT_JA,
  BOSS_AFFIX_JA,
  EnemyTrait,
  BossAffix,
  Faction,
  ClassType,
  Mission,
  ArtifactId,
  ARTIFACTS,
  ACHIEVEMENTS,
  PLAYER_SKILLS,
  FORMATIONS,
  PlayerSkillId,
  EXPEDITIONS,
  ActiveExpedition,
  TALENTS,
  TalentId,
  Equipment,
  generateEquipmentDrop,
  synthesizeEquipment
} from './lib/gameData';

type SelectedSlot = { type: 'board' | 'bench'; index: number } | null;

const INITIAL_MISSIONS: Mission[] = [
  { id: 'd1', title: '【デイリー】敵を10体倒す', type: 'kill', target: 10, rewardGems: 50, progress: 0, claimed: false, isDaily: true },
  { id: 'd2', title: '【デイリー】敵を100体倒す', type: 'kill', target: 100, rewardGems: 100, progress: 0, claimed: false, isDaily: true },
  { id: 'd3', title: '【デイリー】ガチャを5回引く', type: 'gacha', target: 5, rewardGems: 50, progress: 0, claimed: false, isDaily: true },
  { id: 'm1', title: '敵を10体倒す', type: 'kill', target: 10, rewardGems: 50, progress: 0, claimed: false },
  { id: 'm2', title: '敵を100体倒す', type: 'kill', target: 100, rewardGems: 300, progress: 0, claimed: false },
  { id: 'm3', title: '敵を1000体倒す', type: 'kill', target: 1000, rewardGems: 1000, progress: 0, claimed: false },
  { id: 'm4', title: 'ガチャを5回引く', type: 'gacha', target: 5, rewardGems: 100, progress: 0, claimed: false },
  { id: 'm5', title: 'ガチャを50回引く', type: 'gacha', target: 50, rewardGems: 500, progress: 0, claimed: false },
  { id: 'm6', title: 'ステージ10到達', type: 'stage', target: 10, rewardGems: 500, progress: 0, claimed: false },
  { id: 'm7', title: 'ステージ50到達', type: 'stage', target: 50, rewardGems: 2000, progress: 0, claimed: false },
  { id: 'm8', title: 'ステージ100到達', type: 'stage', target: 100, rewardGems: 5000, progress: 0, claimed: false },
  { id: 'm9', title: '敵を5000体倒す', type: 'kill', target: 5000, rewardGems: 3000, progress: 0, claimed: false },
  { id: 'm10', title: 'ガチャを100回引く', type: 'gacha', target: 100, rewardGems: 1500, progress: 0, claimed: false },
  { id: 'm11', title: 'ステージ200到達', type: 'stage', target: 200, rewardGems: 10000, progress: 0, claimed: false },
];

export default function App() {
  const [offlineReward, setOfflineReward] = useState<{ gold: number, gems: number, time: number } | null>(null);

  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = localStorage.getItem('endlessGachaSave');
    let parsed: GameState | null = null;
    if (saved) {
      try {
        parsed = JSON.parse(saved);
        // Ensure new fields exist for old saves
        if (!parsed!.missions) {
          parsed!.missions = INITIAL_MISSIONS;
        } else {
          // Merge existing missions with INITIAL_MISSIONS to ensure new missions are added
          parsed!.missions = INITIAL_MISSIONS.map(m => {
            const existing = parsed!.missions.find((em: Mission) => em.id === m.id);
            return existing ? existing : m;
          });
        }
        if (typeof parsed!.pityCounter !== 'number') parsed!.pityCounter = 0;
        if (typeof parsed!.totalKills !== 'number') parsed!.totalKills = 0;
        if (typeof parsed!.totalGachaPulls !== 'number') parsed!.totalGachaPulls = 0;
        if (!parsed!.artifacts) {
          parsed!.artifacts = {
            fire_pen: 0, water_cha: 0, nature_shi: 0, light_swo: 0, dark_rob: 0,
            warrior_bad: 0, archer_bow: 0, mage_sta: 0, boss_sla: 0, gold_rin: 0
          };
        }
        if (!parsed!.unlockedHeroes) {
          parsed!.unlockedHeroes = [];
        }
        
        // Daily reset logic
        const now = new Date();
        const lastSave = new Date(parsed!.lastSaveTime || Date.now());
        if (now.getDate() !== lastSave.getDate() || now.getMonth() !== lastSave.getMonth() || now.getFullYear() !== lastSave.getFullYear()) {
             // Reset daily missions
             parsed!.missions = parsed!.missions.map((m: Mission) => {
               if (m.isDaily) {
                 return { ...m, progress: 0, claimed: false };
               }
               return m;
             });
             parsed!.totalKills = 0;
             parsed!.totalGachaPulls = 0;
        }

      } catch (e) {
        console.error('Failed to load save', e);
      }
    }
    
    if (!parsed) {
      parsed = {
        gold: 500,
        gems: 1000,
        stage: 1,
        enemyHp: 50,
        enemyMaxHp: 50,
        board: Array(9).fill(null),
        bench: Array(5).fill(null),
        bossTimeLeft: null,
        prestigePoints: 0,
        prestigeMultiplier: 1,
        upgrades: { tapDamage: 1, heroDps: 1 },
        artifacts: {
          fire_pen: 0, water_cha: 0, nature_shi: 0, light_swo: 0, dark_rob: 0,
          warrior_bad: 0, archer_bow: 0, mage_sta: 0, boss_sla: 0, gold_rin: 0
        },
        lastSaveTime: Date.now(),
        pityCounter: 0,
        totalKills: 0,
        totalGachaPulls: 0,
        missions: INITIAL_MISSIONS,
        unlockedHeroes: [],
        autoSellN: false,
        inventory: [],
      };
    }
    if (!parsed.inventory) parsed.inventory = [];
    return parsed;
  });

  useEffect(() => {
    // Calculate offline progress once on mount
    const lastSave = gameState.lastSaveTime;
    if (lastSave) {
      const nowTime = Date.now();
      const diffMs = nowTime - lastSave;
      const diffMinutes = Math.floor(diffMs / 60000);
      
      // Only give offline rewards if away for more than 5 minutes
      if (diffMinutes >= 5) {
        // Max offline time is 24 hours (1440 minutes)
        const effectiveMinutes = Math.min(diffMinutes, 1440);
        
        // Base offline efficiency is 20%
        let offlineEfficiency = 0.2;
        if (gameState.talents?.offline_efficiency) {
          const talent = TALENTS.find(t => t.id === 'offline_efficiency')!;
          offlineEfficiency += (gameState.talents.offline_efficiency * talent.effectPerLevel);
        }

        // Calculate theoretical DPS
        const currentDps = calculateDps(gameState);
        
        // Estimate kills per minute (very rough estimate: assuming it takes 5 seconds to kill an enemy on average)
        // Adjust based on current DPS vs Enemy HP
        const avgEnemyHp = gameState.enemyMaxHp;
        const timeToKillSeconds = Math.max(1, avgEnemyHp / Math.max(1, currentDps));
        const killsPerMinute = 60 / timeToKillSeconds;
        
        // Calculate rewards
        let baseGoldPerKill = Math.floor(avgEnemyHp * 0.08) + 10;
        if (gameState.artifacts?.gold_rin) {
          baseGoldPerKill = Math.floor(baseGoldPerKill * (1 + gameState.artifacts.gold_rin * 0.2));
        }
        if (gameState.talents?.gold_gain) {
          const talent = TALENTS.find(t => t.id === 'gold_gain')!;
          baseGoldPerKill = Math.floor(baseGoldPerKill * (1 + (gameState.talents.gold_gain * talent.effectPerLevel)));
        }

        const totalEstimatedKills = Math.floor(killsPerMinute * effectiveMinutes * offlineEfficiency);
        const goldReward = totalEstimatedKills * baseGoldPerKill;
        const gemReward = Math.floor(effectiveMinutes / 60) * 10; // 10 gems per hour offline

        if (goldReward > 0 || gemReward > 0) {
          setOfflineReward({ gold: goldReward, gems: gemReward, time: effectiveMinutes });
          setGameState(prev => ({
            ...prev,
            gold: prev.gold + goldReward,
            gems: prev.gems + gemReward,
            lastSaveTime: nowTime
          }));
        }
      }
    }
  }, []); // Run only once on mount

  const [activeTab, setActiveTab] = useState<'BATTLE' | 'GACHA' | 'UPGRADES' | 'MISSIONS' | 'PRESTIGE' | 'ARTIFACTS' | 'COLLECTION' | 'LEADERBOARD' | 'TACTICS' | 'EXPEDITIONS' | 'INVENTORY'>('BATTLE');
  const [inventoryTab, setInventoryTab] = useState<'LIST' | 'SYNTHESIS'>('LIST');
  const [synthSelection, setSynthSelection] = useState<string[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [selectedEquipmentSlot, setSelectedEquipmentSlot] = useState<'weapon' | 'armor' | 'accessory' | null>(null);
  const [dropNotification, setDropNotification] = useState<Equipment | null>(null);
  const [missionTab, setMissionTab] = useState<'DAILY' | 'ACHIEVEMENT'>('DAILY');
  const [showHelp, setShowHelp] = useState(false);
  const [damageTexts, setDamageTexts] = useState<{ id: number; x: number; y: number; val: number; isCrit: boolean; hitType?: 'normal' | 'weak' | 'resist'; timestamp: number }[]>([]);
  const [selected, setSelected] = useState<SelectedSlot>(null);
  const [showSynergies, setShowSynergies] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const [showStats, setShowStats] = useState(false);
  const [showBossWarning, setShowBossWarning] = useState(false);
  const [gachaReveal, setGachaReveal] = useState<{ isOpen: boolean; hero: HeroInstance | null; is10Pull: boolean; heroes: HeroInstance[] }>({ isOpen: false, hero: null, is10Pull: false, heroes: [] });

  const [modalState, setModalState] = useState<{ isOpen: boolean; title: string; message: string; onConfirm?: () => void; isAlert?: boolean; confirmText?: string }>({ isOpen: false, title: '', message: '' });
  const [isPrestiging, setIsPrestiging] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{id: string, name: string, stage: number}[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (activeTab === 'LEADERBOARD') {
      const fetchLeaderboard = async () => {
        try {
          const q = query(collection(db, 'saves'), orderBy('stage', 'desc'), limit(10));
          const querySnapshot = await getDocs(q);
          const boardData: {id: string, name: string, stage: number}[] = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            boardData.push({
              id: doc.id,
              name: data.displayName || '名無しプレイヤー',
              stage: data.stage || 1
            });
          });
          setLeaderboard(boardData);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'saves');
        }
      };
      fetchLeaderboard();
    }
  }, [activeTab]);

  const currentEnemyElement = useMemo(() => getEnemyElement(gameState.stage), [gameState.stage]);
  const currentEnemyTrait = useMemo(() => getEnemyTrait(gameState.stage), [gameState.stage]);
  const currentBossAffix = useMemo(() => getBossAffix(gameState.stage), [gameState.stage]);
  const dps = useMemo(() => calculateDps(gameState, currentEnemyElement, currentEnemyTrait), [gameState, currentEnemyElement, currentEnemyTrait]);
  const synergies = useMemo(() => getSynergies(gameState.board), [gameState.board]);

  // Offline Progress & Auto Save
  useEffect(() => {
    setGameState(prev => {
      const now = Date.now();
      const lastTime = prev.lastSaveTime || now;
      const diffMs = now - lastTime;
      const diffSec = Math.floor(diffMs / 1000);
      
      let newState = { ...prev };
      let changed = false;

      // Daily Login Bonus
      const today = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
      if (prev.lastLoginDate !== today) {
        setTimeout(() => {
          setModalState({
            isOpen: true,
            title: '🎁 ログインボーナス！',
            message: '今日のログインボーナスとして 300 ジェム を獲得しました！\n毎日ログインして部隊を強化しましょう！',
            isAlert: true
          });
        }, 2000);
        newState.lastLoginDate = today;
        newState.gems += 300;
        changed = true;
      }

      if (diffSec > 60) {
        const currentEnemyElement = getEnemyElement(prev.stage);
        const currentEnemyTrait = getEnemyTrait(prev.stage);
        const currentBossAffix = getBossAffix(prev.stage);
        const offlineDps = calculateDps({ ...prev, currentBossAffix }, currentEnemyElement, currentEnemyTrait) * 0.5;
        
        if (offlineDps > 0) {
          const timeToKill = prev.enemyMaxHp / offlineDps;
          const kills = Math.floor(diffSec / timeToKill);
          let baseGoldDrop = Math.floor(prev.enemyMaxHp * 0.08 + 10);
          if (prev.artifacts && prev.artifacts.gold_rin) {
            baseGoldDrop = Math.floor(baseGoldDrop * (1 + prev.artifacts.gold_rin * 0.2));
          }
          const goldGained = kills * baseGoldDrop;
          
          if (goldGained > 0) {
            setTimeout(() => {
              setModalState({
                isOpen: true,
                title: 'おかえりなさい！',
                message: `オフライン時間: ${formatNumber(diffSec)}秒\nヒーローたちが ${formatNumber(goldGained)} ゴールドを稼ぎました！`,
                isAlert: true
              });
            }, 1000);
            newState.gold += goldGained;
            changed = true;
          }
        }
      }
      
      if (changed) {
        newState.lastSaveTime = now;
        return newState;
      }
      return { ...prev, lastSaveTime: now };
    });

    const saveInterval = setInterval(() => {
      setGameState(prev => {
        const newState = { ...prev, lastSaveTime: Date.now() };
        localStorage.setItem('endlessGachaSave', JSON.stringify(newState));
        return newState;
      });
    }, 5000);

    return () => clearInterval(saveInterval);
  }, []);

  // Achievement Checker
  useEffect(() => {
    const interval = setInterval(() => {
      setGameState(prev => {
        let changed = false;
        let newAchievements = { ...(prev.achievements || {}) };
        let newGems = prev.gems;
        let newlyCompleted: string[] = [];

        ACHIEVEMENTS.forEach(ach => {
          if (!newAchievements[ach.id] && ach.condition(prev)) {
            newAchievements[ach.id] = true;
            newGems += ach.rewardGems;
            newlyCompleted.push(`・${ach.title} (+${ach.rewardGems} ジェム)`);
            changed = true;
          }
        });

        if (changed) {
          setTimeout(() => {
            setModalState({
              isOpen: true,
              title: '🏆 実績解除！',
              message: `以下の実績を達成しました！\n\n${newlyCompleted.join('\n')}`,
              isAlert: true
            });
          }, 500);
          return { ...prev, achievements: newAchievements, gems: newGems };
        }
        return prev;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Game Loop
  useEffect(() => {
    if (gameState.stage % 10 === 0 && gameState.stage > 1) {
      setShowBossWarning(true);
      const timer = setTimeout(() => setShowBossWarning(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [gameState.stage]);

  useEffect(() => {
    const timer = setInterval(() => {
      setGameState(prev => {
        let newHp = prev.enemyHp;
        let newGold = prev.gold;
        let newGems = prev.gems;
        let newStage = prev.stage;
        let newMaxHp = prev.enemyMaxHp;
        let newBossTime = prev.bossTimeLeft;
        let newArtifactShards = prev.artifactShards || 0;

        const currentEnemyElement = getEnemyElement(prev.stage);
        const currentEnemyTrait = getEnemyTrait(prev.stage);
        const currentBossAffix = getBossAffix(prev.stage);
        const currentDps = calculateDps({ ...prev, currentBossAffix }, currentEnemyElement, currentEnemyTrait);
        if (currentDps > 0) {
          newHp -= currentDps * 0.1; // 10 ticks per second
          
          // Generate damage text occasionally for visual feedback
          if (Math.random() < 0.2) { // 20% chance per tick to show a number
            let hitType: 'normal' | 'weak' | 'resist' = 'normal';
            const leaderInst = prev.board[4];
            if (leaderInst) {
              const leaderDef = HEROES.find(h => h.id === leaderInst.heroId)!;
              const multiplier = getElementalMultiplier(leaderDef.faction, currentEnemyElement);
              if (multiplier > 1) hitType = 'weak';
              else if (multiplier < 1) hitType = 'resist';
            }
            
            // Add damage text to state (using a functional state update to avoid dependency issues)
            setDamageTexts(texts => {
              // Keep only recent texts to avoid memory leaks
              const now = Date.now();
              const filtered = texts.filter(t => now - t.timestamp < 1000);
              return [...filtered, { 
                id: Math.random(), 
                x: 100 + Math.random() * 100, 
                y: 100 + Math.random() * 100, 
                val: currentDps * 0.1 * 5, // Show accumulated damage roughly
                isCrit: Math.random() < 0.1, 
                hitType,
                timestamp: now 
              }];
            });
          }
        }

        if (currentBossAffix === 'REGEN' && newBossTime !== null) {
          newHp = Math.min(newMaxHp, newHp + newMaxHp * 0.01 * 0.1); // 1% max hp per second
        }

        if (newBossTime !== null) {
          newBossTime -= 0.1;
          if (newBossTime <= 0) {
            // Boss failed
            newStage = Math.max(1, newStage - 1);
            newMaxHp = getEnemyMaxHp(newStage, prev.artifacts);
            newHp = newMaxHp;
            newBossTime = newStage % 10 === 0 ? 30 : null;
          }
        }

        if (newHp <= 0) {
          const isBoss = newStage % 10 === 0;
          let goldDrop = Math.floor(newMaxHp * 0.08) + 10;
          if (prev.artifacts && prev.artifacts.gold_rin) {
            goldDrop = Math.floor(goldDrop * (1 + prev.artifacts.gold_rin * 0.2)); // +20% per level
          }
          if (prev.talents?.gold_gain) {
            const talent = TALENTS.find(t => t.id === 'gold_gain')!;
            goldDrop = Math.floor(goldDrop * (1 + (prev.talents.gold_gain * talent.effectPerLevel)));
          }
          if (prev.activeSkillBuffs?.gold_rush && Date.now() < prev.activeSkillBuffs.gold_rush) {
            goldDrop *= 3;
          }
          newGold += goldDrop;
          let newInventory = prev.inventory || [];
          if (isBoss) {
            newGems += 100 + newStage * 10;
            newArtifactShards += Math.floor(newStage / 10);
            
            let dropRateBonus = 0;
            if (prev.talents?.equipment_drop_rate) {
              const talent = TALENTS.find(t => t.id === 'equipment_drop_rate')!;
              dropRateBonus = prev.talents.equipment_drop_rate * talent.effectPerLevel;
            }
            
            const drop = generateEquipmentDrop(newStage, dropRateBonus);
            if (drop) {
              newInventory = [...newInventory, drop];
              setTimeout(() => {
                setDropNotification(drop);
                setTimeout(() => setDropNotification(null), 3000);
              }, 100);
            }
          }

          newStage += 1;
          newMaxHp = getEnemyMaxHp(newStage, prev.artifacts);
          newHp = newMaxHp;
          newBossTime = newStage % 10 === 0 ? 30 : null;
          
          // Update Missions
          const newMissions = prev.missions.map(m => {
            if (m.type === 'kill') return { ...m, progress: prev.totalKills + 1 };
            if (m.type === 'stage') return { ...m, progress: newStage };
            return m;
          });

          return {
            ...prev,
            enemyHp: newHp,
            enemyMaxHp: newMaxHp,
            gold: newGold,
            gems: newGems,
            stage: newStage,
            bossTimeLeft: newBossTime,
            totalKills: prev.totalKills + 1,
            missions: newMissions,
            artifactShards: newArtifactShards,
            currentBossAffix: getBossAffix(newStage),
            inventory: newInventory,
          };
        }

        return {
          ...prev,
          enemyHp: newHp,
          enemyMaxHp: newMaxHp,
          gold: newGold,
          gems: newGems,
          stage: newStage,
          bossTimeLeft: newBossTime,
          currentBossAffix
        };
      });
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Auto Cloud Save
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    if (!user || !isAuthReady) return;
    const cloudSaveInterval = setInterval(async () => {
      try {
        const stateToSave = { ...gameStateRef.current, lastSaveTime: Date.now() };
        await setDoc(doc(db, 'saves', user.uid), {
          ...stateToSave,
          displayName: user.displayName,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error('Auto cloud save failed:', error);
      }
    }, 60000); // 1 minute
    return () => clearInterval(cloudSaveInterval);
  }, [user, isAuthReady]);

  const getDpsBreakdown = () => {
    let baseTotal = 0;
    let afterIndividualMults = 0;

    const leaderInst = gameState.board[4];
    let leaderFaction: Faction | null = null;
    let leaderClass: ClassType | null = null;
    if (leaderInst) {
      const leaderDef = HEROES.find(h => h.id === leaderInst.heroId)!;
      leaderFaction = leaderDef.faction;
      leaderClass = leaderDef.classType;
    }

    let globalMult = 1;
    if (synergies.faction.Fire >= 4) globalMult += 0.4;
    else if (synergies.faction.Fire >= 2) globalMult += 0.15;
    if (synergies.faction.Water >= 4) globalMult += 0.4;
    else if (synergies.faction.Water >= 2) globalMult += 0.15;
    if (synergies.faction.Nature >= 4) globalMult += 0.4;
    else if (synergies.faction.Nature >= 2) globalMult += 0.15;
    if (synergies.faction.Light >= 4) globalMult += 0.4;
    else if (synergies.faction.Light >= 2) globalMult += 0.15;
    if (synergies.faction.Dark >= 4) globalMult += 0.4;
    else if (synergies.faction.Dark >= 2) globalMult += 0.15;

    if (synergies.class.Warrior >= 4) globalMult += 0.4;
    else if (synergies.class.Warrior >= 2) globalMult += 0.15;
    if (synergies.class.Archer >= 4) globalMult += 0.4;
    else if (synergies.class.Archer >= 2) globalMult += 0.15;
    if (synergies.class.Mage >= 4) globalMult += 0.4;
    else if (synergies.class.Mage >= 2) globalMult += 0.15;

    // Collection Bonus
    const unlockedCount = gameState.unlockedHeroes?.length || 0;
    const totalAwakenings = Object.values(gameState.heroAwakenings || {}).reduce((sum, level) => sum + level, 0);
    const collectionMult = 1 + (unlockedCount * 0.01) + (totalAwakenings * 0.02);
    globalMult *= collectionMult;

    let activeFormation: typeof FORMATIONS[0] | undefined;
    let formationLevel = 0;
    if (gameState.activeFormationId && gameState.formations?.[gameState.activeFormationId]) {
      activeFormation = FORMATIONS.find(f => f.id === gameState.activeFormationId);
      formationLevel = gameState.formations[gameState.activeFormationId];
      if (activeFormation) {
        const isFormationActive = activeFormation.positions.every(pos => gameState.board[pos] !== null);
        if (isFormationActive && activeFormation.bonus.type === 'global_dps') {
          globalMult *= (activeFormation.bonus.value + (formationLevel - 1) * 0.05);
        } else if (!isFormationActive) {
          activeFormation = undefined;
        }
      }
    }

    gameState.board.forEach((inst, index) => {
      if (inst) {
        const def = HEROES.find(h => h.id === inst.heroId)!;
        const starMult = Math.pow(3, inst.star - 1);
        const levelMult = 1 + ((inst.level || 1) - 1) * 0.1;
        const awakeningLevel = gameState.heroAwakenings?.[def.id] || 0;
        const awakeningMult = 1 + (awakeningLevel * 0.5);

        let heroPassiveMult = 1;
        if (def.passive && def.passive.type === 'SELF_CRIT') {
          heroPassiveMult += def.passive.value;
        }
        gameState.board.forEach((otherInst, otherIndex) => {
          if (otherInst) {
            const otherDef = HEROES.find(h => h.id === otherInst.heroId)!;
            if (otherDef.passive) {
              if (otherDef.passive.type === 'FACTION_BUFF' && def.faction === otherDef.faction) {
                heroPassiveMult += otherDef.passive.value - 1;
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

        let positionMult = 1;
        if (index < 3 && def.classType === 'Warrior') positionMult = 1.3;
        else if (index >= 3 && index <= 5) positionMult = 1.1;
        else if (index > 5 && (def.classType === 'Archer' || def.classType === 'Mage')) positionMult = 1.3;

        if (activeFormation) {
          if (activeFormation.bonus.type === 'front_dps' && index < 3) {
            positionMult *= (activeFormation.bonus.value + (formationLevel - 1) * 0.05);
          } else if (activeFormation.bonus.type === 'mid_dps' && index >= 3 && index <= 5) {
            positionMult *= (activeFormation.bonus.value + (formationLevel - 1) * 0.05);
          } else if (activeFormation.bonus.type === 'back_dps' && index > 5) {
            positionMult *= (activeFormation.bonus.value + (formationLevel - 1) * 0.05);
          }
        }

        let leaderBuffMult = 1;
        if (leaderFaction && def.faction === leaderFaction) leaderBuffMult += 0.2;
        if (leaderClass && def.classType === leaderClass) leaderBuffMult += 0.2;

        let elementalMult = getElementalMultiplier(def.faction, currentEnemyElement);
        if (currentEnemyTrait === 'RESISTANT' && elementalMult <= 1) {
          elementalMult *= 0.2;
        }

        let artifactMult = 1;
        if (gameState.artifacts) {
          if (def.faction === 'Fire' && gameState.artifacts.fire_pen) artifactMult += gameState.artifacts.fire_pen * 0.1;
          if (def.faction === 'Water' && gameState.artifacts.water_cha) artifactMult += gameState.artifacts.water_cha * 0.1;
          if (def.faction === 'Nature' && gameState.artifacts.nature_shi) artifactMult += gameState.artifacts.nature_shi * 0.1;
          if (def.faction === 'Light' && gameState.artifacts.light_swo) artifactMult += gameState.artifacts.light_swo * 0.1;
          if (def.faction === 'Dark' && gameState.artifacts.dark_rob) artifactMult += gameState.artifacts.dark_rob * 0.1;
          
          if (def.classType === 'Warrior' && gameState.artifacts.warrior_bad) artifactMult += gameState.artifacts.warrior_bad * 0.1;
          if (def.classType === 'Archer' && gameState.artifacts.archer_bow) artifactMult += gameState.artifacts.archer_bow * 0.1;
          if (def.classType === 'Mage' && gameState.artifacts.mage_sta) artifactMult += gameState.artifacts.mage_sta * 0.1;
        }

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

        const baseWithEq = (def.baseDps + eqDpsBonus) * eqDpsMult * setBonusMult * starMult * awakeningMult * levelMult;
        baseTotal += baseWithEq;

        afterIndividualMults += baseWithEq * positionMult * leaderBuffMult * elementalMult * artifactMult * heroPassiveMult;
      }
    });

    const upgradeMult = gameState.upgrades?.heroDps || 1;
    const prestigeMult = gameState.prestigeMultiplier || 1;
    
    let finalDps = afterIndividualMults * globalMult * upgradeMult * prestigeMult;
    if (currentEnemyTrait === 'EVASIVE') {
      finalDps *= 0.7;
    }

    let talentMult = 1;
    if (gameState.talents?.base_dps) {
      const talent = TALENTS.find(t => t.id === 'base_dps')!;
      talentMult *= (1 + (gameState.talents.base_dps * talent.effectPerLevel));
    }
    const isBoss = gameState.stage % 10 === 0;
    if (isBoss && gameState.talents?.boss_damage) {
      const talent = TALENTS.find(t => t.id === 'boss_damage')!;
      talentMult *= (1 + (gameState.talents.boss_damage * talent.effectPerLevel));
    }
    finalDps *= talentMult;

    let skillMult = 1;
    if (gameState.activeSkillBuffs) {
      const now = Date.now();
      if (gameState.activeSkillBuffs.meteor && now < gameState.activeSkillBuffs.meteor) {
        skillMult *= 2;
      }
      if (gameState.activeSkillBuffs.freeze && now < gameState.activeSkillBuffs.freeze) {
        skillMult *= 1.5;
      }
    }
    finalDps *= skillMult;

    return {
      baseTotal,
      afterIndividualMults,
      globalMult,
      upgradeMult,
      prestigeMult,
      talentMult,
      skillMult,
      finalDps
    };
  };

  // Cleanup Damage Texts
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setDamageTexts(prev => prev.filter(t => now - t.timestamp < 600));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const executeSkill = (skillId: PlayerSkillId) => {
    const skill = PLAYER_SKILLS.find(s => s.id === skillId);
    if (!skill) return;

    const level = gameState.activeSkills?.[skillId] || 0;
    if (level === 0) return;

    const now = Date.now();
    const cooldownEnd = gameState.skillCooldowns?.[skillId] || 0;
    if (now < cooldownEnd) return;

    setGameState(prev => {
      let newHp = prev.enemyHp;
      let newGold = prev.gold;
      let newBossTime = prev.bossTimeLeft;
      const newActiveSkillBuffs = { ...(prev.activeSkillBuffs || {}) };

      if (skillId === 'meteor') {
        // 敵の最大HPの(10% * レベル)のダメージ
        const damage = prev.enemyMaxHp * (0.1 * level);
        newHp -= damage;
        // 画面中央にダメージテキストを出す
        setDamageTexts(texts => [...texts, { id: Math.random(), x: 150, y: 150, val: damage, isCrit: true, timestamp: Date.now() }]);
      } else if (skillId === 'freeze') {
        // ボス戦の残り時間を(3秒 * レベル)延長し、その間DPSが1.5倍
        if (newBossTime !== null) {
          newBossTime += 3 * level;
        }
        newActiveSkillBuffs['freeze'] = now + (3 * level * 1000);
      } else if (skillId === 'gold_rush') {
        // (5秒 * Lv)の間、獲得ゴールドが3倍になる
        newActiveSkillBuffs['gold_rush'] = now + (5 * level * 1000);
      }

      return {
        ...prev,
        enemyHp: newHp,
        gold: newGold,
        bossTimeLeft: newBossTime,
        activeSkillBuffs: newActiveSkillBuffs,
        skillCooldowns: {
          ...(prev.skillCooldowns || {}),
          [skillId]: now + skill.cooldown * 1000
        }
      };
    });
  };

  const handleTapEnemy = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let baseTap = Math.max(1, dps * 0.1) * (gameState.upgrades?.tapDamage || 1);
    if (currentEnemyTrait === 'ARMORED') {
      baseTap *= 0.1; // 硬い甲殻: タップダメージ1/10
    }

    const isCrit = Math.random() < 0.1;
    const damage = isCrit ? baseTap * 3 : baseTap;

    // Determine hitType based on elemental advantage (if we consider tap damage to have leader's element)
    let hitType: 'normal' | 'weak' | 'resist' = 'normal';
    const leaderInst = gameState.board[4];
    if (leaderInst) {
      const leaderDef = HEROES.find(h => h.id === leaderInst.heroId)!;
      const multiplier = getElementalMultiplier(leaderDef.faction, currentEnemyElement);
      if (multiplier > 1) hitType = 'weak';
      else if (multiplier < 1) hitType = 'resist';
    }

    setDamageTexts(prev => [...prev, { id: Math.random(), x, y, val: damage, isCrit, hitType, timestamp: Date.now() }]);
    setGameState(prev => ({ ...prev, enemyHp: prev.enemyHp - damage }));
  };

  const pullGacha = (type: 'normal' | 'premium', count: number = 1) => {
    let baseCost = type === 'normal' ? 100 : 300;
    const isGems = type === 'premium';

    if (type === 'normal' && gameState.talents?.gacha_discount) {
      const talent = TALENTS.find(t => t.id === 'gacha_discount')!;
      baseCost = Math.floor(baseCost * (1 - (gameState.talents.gacha_discount * talent.effectPerLevel)));
    }

    const totalCost = baseCost * count;

    if (isGems && gameState.gems < totalCost) return;
    if (!isGems && gameState.gold < totalCost) return;

    // Check if bench has enough space for non-auto-sold heroes
    // For simplicity, we just check if there's at least one empty slot if not auto-selling Ns.
    // But since duplicates don't take bench space, it's hard to predict.
    // Let's just proceed and if bench is full, they might lose the hero (or it just converts to soul).
    // Actually, currently duplicates DO take bench space in the original code!
    // Wait, let's look at original code:
    // `const emptyBenchIndex = gameState.bench.findIndex(s => s === null);`
    // `if (emptyBenchIndex !== -1) { newBench[emptyBenchIndex] = newHeroInstance; }`
    // Yes, duplicates are added to the bench AND give a soul.
    // If bench is full, we should probably warn them before pulling.
    const emptySlots = gameState.bench.filter(s => s === null).length;
    if (emptySlots < count && !gameState.autoSellN) {
      // It might be fine if they get duplicates or Ns, but let's be safe.
      // Actually, let's just let it happen. If it's full, they don't get the instance on bench.
    }

    let newPityCounter = gameState.pityCounter;
    let newPremiumGachaCount = gameState.premiumGachaCount || 0;
    let newGold = isGems ? gameState.gold : gameState.gold - totalCost;
    let newGems = isGems ? gameState.gems - totalCost : gameState.gems;
    let newBench = [...gameState.bench];
    let newUnlockedHeroes = [...gameState.unlockedHeroes];
    let newHeroSouls = { ...(gameState.heroSouls || {}) };
    let newTotalGachaPulls = gameState.totalGachaPulls;
    
    const pulledHeroes: HeroInstance[] = [];

    for (let i = 0; i < count; i++) {
      const rand = Math.random();
      let rarity: Rarity = 'N';

      if (type === 'premium') {
        newPityCounter += 1;
        newPremiumGachaCount += 1;
        if (newPityCounter >= 30) {
          rarity = 'SSR'; // Pity system
          newPityCounter = 0;
        } else {
          if (rand < 0.05) rarity = 'UR';
          else if (rand < 0.20) { rarity = 'SSR'; newPityCounter = 0; }
          else if (rand < 0.50) rarity = 'SR';
          else rarity = 'R';
        }
      } else {
        let srRate = 0.05;
        if (gameState.talents?.sr_rate_up) {
          const talent = TALENTS.find(t => t.id === 'sr_rate_up')!;
          srRate += (gameState.talents.sr_rate_up * talent.effectPerLevel);
        }
        
        if (rand < 0.01) rarity = 'SSR';
        else if (rand < 0.01 + srRate) rarity = 'SR';
        else if (rand < 0.30) rarity = 'R';
        else rarity = 'N';
      }

      const pool = HEROES.filter(h => h.rarity === rarity);
      const hero = pool[Math.floor(Math.random() * pool.length)];
      newTotalGachaPulls += 1;

      if (gameState.autoSellN && rarity === 'N') {
        newGold += 10;
        continue;
      }

      const isDuplicate = newUnlockedHeroes.includes(hero.id);
      if (!isDuplicate) {
        newUnlockedHeroes.push(hero.id);
      } else {
        newHeroSouls[hero.id] = (newHeroSouls[hero.id] || 0) + 1;
      }

      const newHeroInstance = { uid: Math.random().toString(), heroId: hero.id, star: 1, level: 1 };
      pulledHeroes.push(newHeroInstance);

      const emptyBenchIndex = newBench.findIndex(s => s === null);
      if (emptyBenchIndex !== -1) {
        newBench[emptyBenchIndex] = newHeroInstance;
      }
    }

    const newMissions = gameState.missions.map(m => 
      m.type === 'gacha' ? { ...m, progress: newTotalGachaPulls } : m
    );

    setGameState(prev => ({
      ...prev,
      gold: newGold,
      gems: newGems,
      bench: newBench,
      pityCounter: newPityCounter,
      premiumGachaCount: newPremiumGachaCount,
      totalGachaPulls: newTotalGachaPulls,
      missions: newMissions,
      unlockedHeroes: newUnlockedHeroes,
      heroSouls: newHeroSouls
    }));

    if (pulledHeroes.length > 0) {
      setGachaReveal({ isOpen: true, hero: pulledHeroes[0], is10Pull: count > 1, heroes: pulledHeroes });
    } else if (count > 1) {
      setModalState({
        isOpen: true,
        title: '自動売却',
        message: '引いたヒーローはすべてNレアだったため、自動売却されました。',
        isAlert: true
      });
    }
  };

  const handleSlotClick = (type: 'board' | 'bench', index: number) => {
    const arr = type === 'board' ? gameState.board : gameState.bench;
    const item = arr[index];

    if (!selected) {
      if (item) setSelected({ type, index });
      return;
    }

    if (selected.type === type && selected.index === index) {
      setSelected(null);
      return;
    }

    setGameState(prev => {
      const newBoard = [...prev.board];
      const newBench = [...prev.bench];
      
      const getArr = (t: 'board' | 'bench') => t === 'board' ? newBoard : newBench;
      
      const sourceArr = getArr(selected.type);
      const targetArr = getArr(type);
      
      const sourceItem = sourceArr[selected.index];
      const targetItem = targetArr[index];

      // Merge check
      if (sourceItem && targetItem && sourceItem.heroId === targetItem.heroId && sourceItem.star === targetItem.star && sourceItem.star < 3) {
        targetArr[index] = { ...targetItem, star: targetItem.star + 1 };
        sourceArr[selected.index] = null;
      } else {
        // Swap
        sourceArr[selected.index] = targetItem;
        targetArr[index] = sourceItem;
      }

      return { ...prev, board: newBoard, bench: newBench };
    });
    setSelected(null);
  };

  const getHeroLevelUpCost = (rarity: Rarity, currentLevel: number) => {
    let baseCost = 100;
    if (rarity === 'R') baseCost = 300;
    if (rarity === 'SR') baseCost = 1000;
    if (rarity === 'SSR') baseCost = 5000;
    if (rarity === 'UR') baseCost = 20000;

    let cost = Math.floor(baseCost * Math.pow(1.15, currentLevel - 1));
    
    if (gameState.talents?.hero_level_discount) {
      const talent = TALENTS.find(t => t.id === 'hero_level_discount')!;
      cost = Math.floor(cost * (1 - (gameState.talents.hero_level_discount * talent.effectPerLevel)));
    }
    return cost;
  };

  const handleHeroLevelUp = () => {
    if (!selected) return;
    setGameState(prev => {
      const newBoard = [...prev.board];
      const newBench = [...prev.bench];
      const arr = selected.type === 'board' ? newBoard : newBench;
      const inst = arr[selected.index];
      
      if (!inst) return prev;

      const def = HEROES.find(h => h.id === inst.heroId)!;
      const currentLevel = inst.level || 1;
      const cost = getHeroLevelUpCost(def.rarity, currentLevel);

      if (prev.gold < cost) return prev;

      arr[selected.index] = { ...inst, level: currentLevel + 1 };

      return {
        ...prev,
        gold: prev.gold - cost,
        board: newBoard,
        bench: newBench
      };
    });
  };

  const handleAutoMergeHeroes = () => {
    let mergedAny = false;
    let currentBoard = [...gameState.board];
    let currentBench = [...gameState.bench];

    let hasMerges = true;
    while (hasMerges) {
      hasMerges = false;
      
      const allHeroes: { loc: 'board' | 'bench', index: number, inst: HeroInstance }[] = [];
      currentBoard.forEach((inst, i) => { if (inst) allHeroes.push({ loc: 'board', index: i, inst }); });
      currentBench.forEach((inst, i) => { if (inst) allHeroes.push({ loc: 'bench', index: i, inst }); });

      const groups: Record<string, typeof allHeroes> = {};
      allHeroes.forEach(h => {
        if (h.inst.star >= 3) return;
        const key = `${h.inst.heroId}-${h.inst.star}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(h);
      });

      for (const key in groups) {
        if (groups[key].length >= 3) {
          const toMerge = groups[key].slice(0, 3);
          const target = toMerge[0];
          const sacrifice1 = toMerge[1];
          const sacrifice2 = toMerge[2];

          if (target.loc === 'board') {
            currentBoard[target.index] = { ...target.inst, star: target.inst.star + 1 };
          } else {
            currentBench[target.index] = { ...target.inst, star: target.inst.star + 1 };
          }

          if (sacrifice1.loc === 'board') currentBoard[sacrifice1.index] = null;
          else currentBench[sacrifice1.index] = null;

          if (sacrifice2.loc === 'board') currentBoard[sacrifice2.index] = null;
          else currentBench[sacrifice2.index] = null;

          hasMerges = true;
          mergedAny = true;
          break;
        }
      }
    }

    if (mergedAny) {
      setGameState(prev => ({ ...prev, board: currentBoard, bench: currentBench }));
      setModalState({
        isOpen: true,
        title: '一括合成完了',
        message: '可能なヒーローをすべて合成しました。',
        isAlert: true
      });
    } else {
      setModalState({
        isOpen: true,
        title: '合成不可',
        message: '合成可能なヒーローがいません。（同じヒーロー、同じ星が3体必要です）',
        isAlert: true
      });
    }
  };

  const handleAutoLevelUpHeroes = () => {
    let currentGold = gameState.gold;
    let currentBoard = [...gameState.board];
    let currentBench = [...gameState.bench];
    let leveledAny = false;

    const allHeroes: { loc: 'board' | 'bench', index: number, inst: HeroInstance }[] = [];
    currentBoard.forEach((inst, i) => { if (inst) allHeroes.push({ loc: 'board', index: i, inst }); });
    currentBench.forEach((inst, i) => { if (inst) allHeroes.push({ loc: 'bench', index: i, inst }); });

    let canLevelUp = true;
    while (canLevelUp && currentGold > 0) {
      canLevelUp = false;
      
      allHeroes.sort((a, b) => (a.inst.level || 1) - (b.inst.level || 1));

      for (const h of allHeroes) {
        const def = HEROES.find(hd => hd.id === h.inst.heroId)!;
        const cost = getHeroLevelUpCost(def.rarity, h.inst.level || 1);
        
        if (currentGold >= cost) {
          currentGold -= cost;
          h.inst.level = (h.inst.level || 1) + 1;
          canLevelUp = true;
          leveledAny = true;
          break;
        }
      }
    }

    if (leveledAny) {
      allHeroes.forEach(h => {
        if (h.loc === 'board') currentBoard[h.index] = h.inst;
        else currentBench[h.index] = h.inst;
      });

      setGameState(prev => ({ ...prev, gold: currentGold, board: currentBoard, bench: currentBench }));
      setModalState({
        isOpen: true,
        title: '一括強化完了',
        message: '所持ゴールドの範囲内で可能な限りヒーローを強化しました。',
        isAlert: true
      });
    } else {
      setModalState({
        isOpen: true,
        title: '強化不可',
        message: 'ゴールドが不足しているため、強化できません。',
        isAlert: true
      });
    }
  };

  const handleAutoSynthesizeEquipment = () => {
    let currentInventory = [...(gameState.inventory || [])];
    let synthesizedAny = false;
    let hasMerges = true;

    while (hasMerges) {
      hasMerges = false;
      
      const groups: Record<string, Equipment[]> = {};
      currentInventory.forEach(eq => {
        if (eq.rarity === 'UR') return; // Cannot synthesize UR
        const key = `${eq.type}-${eq.rarity}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(eq);
      });

      for (const key in groups) {
        if (groups[key].length >= 3) {
          const toMerge = groups[key].slice(0, 3);
          const newEq = synthesizeEquipment(toMerge);
          
          if (newEq) {
            // Remove the 3 used equipments
            const idsToRemove = toMerge.map(e => e.id);
            currentInventory = currentInventory.filter(e => !idsToRemove.includes(e.id));
            // Add the new equipment
            currentInventory.push(newEq);
            
            hasMerges = true;
            synthesizedAny = true;
            break; // Restart loop to re-evaluate groups
          }
        }
      }
    }

    if (synthesizedAny) {
      setGameState(prev => ({ ...prev, inventory: currentInventory }));
      setModalState({
        isOpen: true,
        title: '一括合成完了',
        message: '可能な装備をすべて合成しました。',
        isAlert: true
      });
      setSynthSelection([]);
    } else {
      setModalState({
        isOpen: true,
        title: '合成不可',
        message: '合成可能な装備がいません。（同じ部位、同じレアリティが3つ必要です）',
        isAlert: true
      });
    }
  };

  const handleClaimAllExpeditions = () => {
    setGameState(prev => {
      let newGold = prev.gold;
      let newGems = prev.gems;
      let newArtifactShards = prev.artifactShards || 0;
      const remainingExpeditions: ActiveExpedition[] = [];
      let claimedCount = 0;

      (prev.activeExpeditions || []).forEach(activeExp => {
        const expDef = EXPEDITIONS.find(e => e.id === activeExp.expeditionId);
        if (expDef && now >= activeExp.startTime + expDef.durationMinutes * 60 * 1000) {
          if (expDef.rewardType === 'gold') newGold += expDef.baseReward;
          if (expDef.rewardType === 'gems') newGems += expDef.baseReward;
          if (expDef.rewardType === 'artifactShards') newArtifactShards += expDef.baseReward;
          claimedCount++;
        } else {
          remainingExpeditions.push(activeExp);
        }
      });

      if (claimedCount > 0) {
        setTimeout(() => {
          setModalState({
            isOpen: true,
            title: '一括受け取り完了',
            message: `${claimedCount}件の派遣報酬を受け取りました。`,
            isAlert: true
          });
        }, 100);
      }

      return {
        ...prev,
        gold: newGold,
        gems: newGems,
        artifactShards: newArtifactShards,
        activeExpeditions: remainingExpeditions
      };
    });
  };

  const handleAutoDispatchExpeditions = () => {
    setGameState(prev => {
      const activeExpIds = (prev.activeExpeditions || []).map(e => e.expeditionId);
      const dispatchedHeroIds = (prev.activeExpeditions || []).map(e => e.heroId);
      let availableHeroes = prev.unlockedHeroes.filter(id => !dispatchedHeroIds.includes(id));
      
      const newExpeditions = [...(prev.activeExpeditions || [])];
      let dispatchedCount = 0;

      for (const exp of EXPEDITIONS) {
        if (!activeExpIds.includes(exp.id) && availableHeroes.length > 0) {
          const heroId = availableHeroes.pop()!;
          newExpeditions.push({
            id: Math.random().toString(),
            expeditionId: exp.id,
            heroId,
            startTime: Date.now(),
            completed: false
          });
          dispatchedCount++;
        }
      }

      if (dispatchedCount > 0) {
        setTimeout(() => {
          setModalState({
            isOpen: true,
            title: '自動派遣完了',
            message: `${dispatchedCount}件の派遣を開始しました。`,
            isAlert: true
          });
        }, 100);
      } else {
        setTimeout(() => {
          setModalState({
            isOpen: true,
            title: '派遣できません',
            message: '派遣可能なクエストがないか、待機中のヒーローがいません。',
            isAlert: true
          });
        }, 100);
      }

      return {
        ...prev,
        activeExpeditions: newExpeditions
      };
    });
  };

  const handleSell = () => {
    if (!selected) return;
    setGameState(prev => {
      const newBoard = [...prev.board];
      const newBench = [...prev.bench];
      const arr = selected.type === 'board' ? newBoard : newBench;
      const inst = arr[selected.index];
      
      if (!inst) return prev;

      const def = HEROES.find(h => h.id === inst.heroId)!;
      // Base sell value based on rarity
      const baseValue = def.rarity === 'N' ? 50 : def.rarity === 'R' ? 150 : def.rarity === 'SR' ? 500 : def.rarity === 'SSR' ? 2000 : 10000;
      // Multiply by stars (1 star = 1x, 2 star = 3x, 3 star = 9x)
      const sellValue = baseValue * Math.pow(3, inst.star - 1);

      arr[selected.index] = null;

      return {
        ...prev,
        gold: prev.gold + sellValue,
        board: newBoard,
        bench: newBench
      };
    });
    setSelected(null);
  };

  const handlePrestige = () => {
    const pointsToGain = Math.floor(gameState.stage / 10);
    if (pointsToGain <= 0) return;

    setModalState({
      isOpen: true,
      title: '転生の確認',
      message: `本当に転生しますか？ゴールド、ジェム、ヒーロー、ステージ進行度がリセットされますが、${pointsToGain} 転生ポイントを獲得します。`,
      onConfirm: () => {
        setModalState({ isOpen: false, title: '', message: '' });
        setIsPrestiging(true);
        
        setTimeout(() => {
          setGameState(prev => {
            let startStage = 1;
            if (prev.talents?.starting_stage) {
              const talent = TALENTS.find(t => t.id === 'starting_stage')!;
              startStage += prev.talents.starting_stage * talent.effectPerLevel;
            }
            // Ensure start stage doesn't exceed current stage
            startStage = Math.min(startStage, Math.max(1, prev.stage - 10));

            const newMaxHp = getEnemyMaxHp(startStage, prev.artifacts);

            return {
            gold: 500,
            gems: 1000,
            stage: startStage,
            enemyHp: newMaxHp,
            enemyMaxHp: newMaxHp,
            board: Array(9).fill(null),
            bench: Array(5).fill(null),
            bossTimeLeft: startStage % 10 === 0 ? 30 : null,
            prestigePoints: (prev.prestigePoints || 0) + pointsToGain,
            prestigeMultiplier: (prev.prestigeMultiplier || 1) + (pointsToGain * 0.1), // Each point gives +10% global DPS
            prestigeCount: (prev.prestigeCount || 0) + 1,
            talents: prev.talents,
            upgrades: { tapDamage: 1, heroDps: 1 },
            artifacts: prev.artifacts || {
              fire_pen: 0, water_cha: 0, nature_shi: 0, light_swo: 0, dark_rob: 0,
              warrior_bad: 0, archer_bow: 0, mage_sta: 0, boss_sla: 0, gold_rin: 0
            },
            lastSaveTime: Date.now(),
            pityCounter: 0,
            totalKills: prev.totalKills,
            totalGachaPulls: prev.totalGachaPulls,
            missions: prev.missions,
            unlockedHeroes: prev.unlockedHeroes || [],
            heroSouls: prev.heroSouls,
            heroAwakenings: prev.heroAwakenings,
            premiumGachaCount: prev.premiumGachaCount,
            activeSkills: prev.activeSkills,
            skillCooldowns: prev.skillCooldowns,
            activeFormationId: prev.activeFormationId,
            formations: prev.formations,
            artifactShards: prev.artifactShards,
          };
        });
          setActiveTab('BATTLE');
          
          setTimeout(() => {
            setIsPrestiging(false);
          }, 1000);
        }, 1000);
      }
    });
  };

  const claimMission = (missionId: string) => {
    setGameState(prev => {
      const mission = prev.missions.find(m => m.id === missionId);
      if (!mission || mission.claimed || mission.progress < mission.target) return prev;

      return {
        ...prev,
        gems: prev.gems + mission.rewardGems,
        missions: prev.missions.map(m => m.id === missionId ? { ...m, claimed: true } : m)
      };
    });
  };

  const getUpgradeCost = (type: 'tapDamage' | 'heroDps', level: number) => {
    return Math.floor(100 * Math.pow(1.5, level - 1));
  };

  const handleUpgrade = (type: 'tapDamage' | 'heroDps') => {
    setGameState(prev => {
      const currentLevel = prev.upgrades?.[type] || 1;
      const cost = getUpgradeCost(type, currentLevel);
      if (prev.gold < cost) return prev;

      return {
        ...prev,
        gold: prev.gold - cost,
        upgrades: {
          ...(prev.upgrades || { tapDamage: 1, heroDps: 1 }),
          [type]: currentLevel + 1
        }
      };
    });
  };

  const isBoss = gameState.stage % 10 === 0;
  const enemyEmoji = isBoss
    ? BOSSES[gameState.stage % BOSSES.length]
    : ENEMIES[gameState.stage % ENEMIES.length];
  const hpPercent = Math.max(0, (gameState.enemyHp / gameState.enemyMaxHp) * 100);

  const renderHero = (inst: HeroInstance | null, isSelected: boolean, isLeaderSlot: boolean = false) => {
    if (!inst) return (
      <div className={cn(
        "w-full h-full rounded-xl border-2 border-dashed bg-gray-800/50 flex items-center justify-center transition-colors", 
        isSelected ? "border-yellow-400 bg-yellow-400/20" : "border-gray-700 hover:border-gray-500",
        isLeaderSlot && !isSelected && "border-yellow-500/50 bg-yellow-900/10"
      )}>
        {isLeaderSlot && <span className="text-[10px] font-bold text-yellow-500/50">LEADER</span>}
      </div>
    );
    
    const def = HEROES.find(h => h.id === inst.heroId)!;
    const awakeningLevel = gameState.heroAwakenings?.[def.id] || 0;
    
    const isHighRarity = def.rarity === 'UR' || def.rarity === 'SSR';

    return (
      <div className={cn(
        "relative w-full h-full rounded-xl border-2 flex flex-col items-center justify-center shadow-lg transition-all duration-200 overflow-hidden group",
        RARITY_COLORS[def.rarity].bg,
        isSelected ? "border-yellow-400 scale-105 z-10 shadow-[0_0_15px_rgba(250,204,21,0.5)]" : RARITY_COLORS[def.rarity].border,
        !isSelected && "hover:scale-105 hover:z-10"
      )}>
        {/* Shine effect for high rarity */}
        {isHighRarity && (
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        )}
        
        {isLeaderSlot && (
          <div className="absolute -top-3 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black text-[8px] font-black px-2 py-0.5 rounded-full shadow-md z-20 border border-yellow-200">
            LEADER
          </div>
        )}
        {awakeningLevel > 0 && (
          <div className="absolute -top-1 -left-2 bg-gradient-to-br from-blue-400 to-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border border-blue-300 shadow-md z-20">
            +{awakeningLevel}
          </div>
        )}
        {def.passive && (
          <div className="absolute top-1 left-1 text-yellow-300 drop-shadow-md z-20" title={`${def.passive.name}: ${def.passive.description}`}>
            <Sparkles size={10} className={isHighRarity ? "animate-pulse" : ""} />
          </div>
        )}
        
        <motion.span 
          className="text-3xl drop-shadow-md relative z-10"
          animate={isHighRarity ? { y: [0, -2, 0] } : {}}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        >
          {def.emoji}
        </motion.span>
        
        <div className="absolute -top-2 -right-2 flex z-20">
          {Array.from({ length: inst.star }).map((_, i) => (
            <span key={i} className="text-yellow-400 text-xs drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">★</span>
          ))}
        </div>
        
        <div className="absolute bottom-0 w-full bg-black/60 backdrop-blur-sm text-[9px] text-center font-bold tracking-wider rounded-b-lg flex justify-center gap-1 py-0.5 z-20">
          <span className={FACTION_COLORS[def.faction]}>{FACTION_JA[def.faction]}</span>
          <span className="text-gray-300">{CLASS_JA[def.classType]}</span>
        </div>
        
        {/* Level indicator */}
        <div className="absolute top-1 right-1 text-[8px] font-bold text-white bg-black/50 px-1 rounded z-20">
          Lv.{inst.level || 1}
        </div>
      </div>
    );
  };

  // Calculate elemental advantage for UI
  const leaderInst = gameState.board[4];
  let elementalAdvantage = 1;
  if (leaderInst) {
    const leaderDef = HEROES.find(h => h.id === leaderInst.heroId)!;
    elementalAdvantage = getElementalMultiplier(leaderDef.faction, currentEnemyElement);
  }

  return (
    <div className="w-full h-full bg-gray-950 flex justify-center overflow-hidden font-sans overscroll-none">
      <div className="w-full max-w-md h-full bg-gray-900 text-white flex flex-col relative shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-gray-800 p-3 shadow-md z-20">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="flex items-center text-yellow-400 font-bold text-sm">
                <Coins size={14} className="mr-1" /> {formatNumber(gameState.gold)}
              </div>
              <div className="flex items-center text-blue-400 font-bold text-sm">
                <Gem size={14} className="mr-1" /> {formatNumber(gameState.gems)}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="text-xs text-gray-300 font-bold bg-gray-900 px-2 py-1 rounded-md border border-gray-700">
                DPS: {formatNumber(dps)}
              </div>
              <button onClick={() => setIsSettingsOpen(true)} className="p-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">
                <Settings size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain relative flex flex-col">
          {activeTab === 'BATTLE' && (
            <div className="flex-1 flex flex-col">
              
              {/* Enemy Area */}
              <div className="flex-[0.4] min-h-[200px] flex flex-col items-center justify-center relative select-none bg-gradient-to-b from-gray-900 to-gray-800 border-b border-gray-700 shrink-0" onClick={handleTapEnemy}>
                <AnimatePresence>
                  {showBossWarning && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5, y: -50 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 1.5 }}
                      className="absolute inset-0 z-50 flex items-center justify-center bg-red-900/80 backdrop-blur-sm pointer-events-none"
                    >
                      <div className="text-center">
                        <motion.h1 
                          animate={{ opacity: [1, 0.5, 1] }} 
                          transition={{ repeat: Infinity, duration: 0.5 }}
                          className="text-5xl font-black text-red-500 tracking-widest drop-shadow-[0_0_15px_rgba(255,0,0,0.8)]"
                        >
                          WARNING
                        </motion.h1>
                        <p className="text-white font-bold text-xl mt-2 tracking-widest">BOSS APPROACHING</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
                  <div className="flex flex-col">
                    <h2 className={cn("text-xl font-black tracking-widest uppercase", isBoss ? "text-red-500 animate-pulse" : "text-gray-300")}>
                      {isBoss ? 'BOSS' : `STAGE ${gameState.stage}`}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-bold uppercase", FACTION_COLORS[currentEnemyElement])}>
                        {FACTION_JA[currentEnemyElement]}属性
                      </span>
                      {currentEnemyTrait !== 'NONE' && (
                        <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1 rounded border border-purple-500/50">
                          {TRAIT_JA[currentEnemyTrait]}
                        </span>
                      )}
                      {currentBossAffix !== 'NONE' && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded border border-red-500/50">
                          {BOSS_AFFIX_JA[currentBossAffix]}
                        </span>
                      )}
                      {elementalAdvantage > 1 && <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded border border-red-500/50">WEAK</span>}
                      {elementalAdvantage < 1 && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 rounded border border-blue-500/50">RESIST</span>}
                    </div>
                  </div>
                  {gameState.bossTimeLeft !== null && (
                    <div className="flex items-center text-red-400 font-bold bg-red-900/30 px-2 py-1 rounded-md border border-red-900/50">
                      <Clock size={14} className="mr-1 animate-pulse" />
                      {Math.ceil(gameState.bossTimeLeft)}s
                    </div>
                  )}
                </div>

                <motion.div
                  key={gameState.stage}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  whileTap={{ scale: 0.9 }}
                  className="text-[80px] cursor-pointer drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] mt-4"
                >
                  {enemyEmoji}
                </motion.div>

                <div className="w-2/3 max-w-xs mt-6 bg-gray-800 rounded-full h-4 border border-gray-600 overflow-hidden relative pointer-events-none">
                  <motion.div
                    className={cn("h-full", isBoss ? "bg-red-500" : "bg-green-500")}
                    initial={{ width: '100%' }}
                    animate={{ width: `${hpPercent}%` }}
                    transition={{ duration: 0.1 }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white drop-shadow-md tracking-wider">
                    {formatNumber(gameState.enemyHp)} / {formatNumber(gameState.enemyMaxHp)}
                  </div>
                </div>

                <AnimatePresence>
                  {damageTexts.map(dt => (
                    <motion.div
                      key={dt.id}
                      initial={{ opacity: 1, y: dt.y, x: dt.x, scale: dt.isCrit ? 1.5 : 1 }}
                      animate={{ opacity: 0, y: dt.y - 60 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className={cn(
                        "absolute pointer-events-none font-black drop-shadow-lg", 
                        dt.isCrit ? "text-yellow-400 text-2xl" : "text-white text-lg",
                        dt.hitType === 'weak' && "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]",
                        dt.hitType === 'resist' && "text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]"
                      )}
                      style={{ left: 0, top: 0 }}
                    >
                      -{formatNumber(dt.val)}
                      {dt.hitType === 'weak' && <span className="text-[10px] ml-1 align-top">WEAK</span>}
                      {dt.hitType === 'resist' && <span className="text-[10px] ml-1 align-top">RESIST</span>}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Player Skills Overlay */}
                <div className="absolute bottom-4 right-4 flex gap-2">
                  {PLAYER_SKILLS.map(skill => {
                    const level = gameState.activeSkills?.[skill.id] || 0;
                    if (level === 0) return null;

                    const now = Date.now();
                    const cooldownEnd = gameState.skillCooldowns?.[skill.id] || 0;
                    const isOnCooldown = now < cooldownEnd;
                    const remainingCd = Math.ceil((cooldownEnd - now) / 1000);

                    return (
                      <button
                        key={skill.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          executeSkill(skill.id);
                        }}
                        disabled={isOnCooldown}
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg border-2 transition-transform active:scale-95 relative overflow-hidden",
                          isOnCooldown ? "bg-gray-800 border-gray-600 opacity-50 cursor-not-allowed" : "bg-blue-600 border-blue-400 hover:bg-blue-500"
                        )}
                      >
                        {skill.id === 'meteor' ? '☄️' : skill.id === 'freeze' ? '❄️' : '💰'}
                        {isOnCooldown && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white font-bold text-xs">
                            {remainingCd}s
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Board Area */}
              <div className="flex-[0.6] min-h-[350px] bg-gray-950 p-4 flex flex-col relative shrink-0">
                <div className="flex flex-col mb-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-400 tracking-widest">編成 (FORMATION)</span>
                    <div className="flex space-x-2">
                      <button 
                        onClick={handleAutoMergeHeroes}
                        className="text-xs flex items-center bg-purple-900/80 px-2 py-1 rounded text-purple-200 hover:bg-purple-800 transition-colors border border-purple-700"
                        title="一括合成"
                      >
                        <Combine size={12} className="mr-1" /> 合成
                      </button>
                      <button 
                        onClick={handleAutoLevelUpHeroes}
                        className="text-xs flex items-center bg-orange-900/80 px-2 py-1 rounded text-orange-200 hover:bg-orange-800 transition-colors border border-orange-700"
                        title="一括強化"
                      >
                        <ChevronsUp size={12} className="mr-1" /> 強化
                      </button>
                      <button 
                        onClick={() => setShowStats(true)}
                        className="text-xs flex items-center bg-blue-900/80 px-2 py-1 rounded text-blue-200 hover:bg-blue-800 transition-colors border border-blue-700"
                      >
                        <BarChart2 size={12} className="mr-1" /> 詳細
                      </button>
                      <button 
                        onClick={() => setShowSynergies(!showSynergies)}
                        className="text-xs flex items-center bg-gray-800 px-2 py-1 rounded text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        <Info size={12} className="mr-1" /> シナジー
                      </button>
                    </div>
                  </div>

                  <div className="flex space-x-2 mt-2 pt-2 border-t border-gray-800 min-h-[40px]">
                    {(() => {
                      if (!selected) {
                        return (
                          <div className="flex-1 flex items-center justify-center text-xs text-gray-600 italic">
                            ヒーローを選択してアクションを実行
                          </div>
                        );
                      }
                      const inst = selected.type === 'board' ? gameState.board[selected.index] : gameState.bench[selected.index];
                      if (!inst) {
                        return (
                          <div className="flex-1 flex items-center justify-center text-xs text-gray-600 italic">
                            空きスロット
                          </div>
                        );
                      }
                      const def = HEROES.find(h => h.id === inst.heroId)!;
                      const cost = getHeroLevelUpCost(def.rarity, inst.level || 1);
                      const canUpgrade = gameState.gold >= cost;
                      return (
                        <>
                          <button 
                            onClick={handleHeroLevelUp}
                            disabled={!canUpgrade}
                            className="flex-1 text-xs flex items-center justify-center bg-yellow-900/80 px-2 py-1.5 rounded text-yellow-200 hover:bg-yellow-800 transition-colors border border-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ArrowUpCircle size={12} className="mr-1" /> 強化 ({formatNumber(cost)}G)
                          </button>
                          <button 
                            onClick={() => setIsEquipmentModalOpen(true)}
                            className="flex-1 text-xs flex items-center justify-center bg-emerald-900/80 px-2 py-1.5 rounded text-emerald-200 hover:bg-emerald-800 transition-colors border border-emerald-700"
                          >
                            <ShieldAlert size={12} className="mr-1" /> 装備
                          </button>
                          <button 
                            onClick={handleSell}
                            className="flex-1 text-xs flex items-center justify-center bg-red-900/80 px-2 py-1.5 rounded text-red-200 hover:bg-red-800 transition-colors border border-red-700"
                          >
                            <Trash2 size={12} className="mr-1" /> 売却
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* 3x3 Grid */}
                <div className="relative flex-1 max-h-[300px] mb-4">
                  {/* Row Indicators */}
                  <div className="absolute -left-2 top-0 bottom-0 w-2 flex flex-col pointer-events-none">
                    <div className="flex-1 flex items-center justify-center"><div className="w-1 h-1/2 bg-red-500/30 rounded-full" title="Front Row (Warrior Bonus)"></div></div>
                    <div className="flex-1 flex items-center justify-center"><div className="w-1 h-1/2 bg-gray-500/30 rounded-full" title="Middle Row (All Bonus)"></div></div>
                    <div className="flex-1 flex items-center justify-center"><div className="w-1 h-1/2 bg-blue-500/30 rounded-full" title="Back Row (Archer/Mage Bonus)"></div></div>
                  </div>
                  
                  <div className="grid grid-cols-3 grid-rows-3 gap-2 h-full pl-2">
                    {gameState.board.map((inst, i) => {
                      const isFormationPos = gameState.activeFormationId && FORMATIONS.find(f => f.id === gameState.activeFormationId)?.positions.includes(i);
                      return (
                        <div key={`board-${i}`} onClick={() => handleSlotClick('board', i)} className="cursor-pointer relative">
                          {/* Position hints */}
                          {!inst && i < 3 && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-red-500/30 pointer-events-none">前衛</div>}
                          {!inst && i >= 3 && i <= 5 && i !== 4 && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-500/30 pointer-events-none">中衛</div>}
                          {!inst && i > 5 && <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-500/30 pointer-events-none">後衛</div>}
                          
                          {/* Formation Highlight */}
                          {isFormationPos && (
                            <div className="absolute inset-0 border-2 border-cyan-500/50 rounded-lg pointer-events-none animate-pulse" />
                          )}

                          {renderHero(inst, selected?.type === 'board' && selected.index === i, i === 4)}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bench */}
                <span className="text-xs font-bold text-gray-400 tracking-widest mb-1">ベンチ (BENCH)</span>
                <div className="grid grid-cols-5 gap-2 h-16">
                  {gameState.bench.map((inst, i) => (
                    <div key={`bench-${i}`} onClick={() => handleSlotClick('bench', i)} className="cursor-pointer">
                      {renderHero(inst, selected?.type === 'bench' && selected.index === i)}
                    </div>
                  ))}
                </div>

                {/* Synergy Overlay */}
                <AnimatePresence>
                  {showSynergies && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                      className="absolute inset-2 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl p-4 z-30 overflow-y-auto overscroll-contain"
                    >
                      <div className="flex justify-between items-center mb-4 border-b border-gray-700 pb-2">
                        <h3 className="font-bold text-lg text-yellow-400">発動中のシナジー</h3>
                        <button onClick={() => setShowSynergies(false)} className="text-gray-400 p-1 bg-gray-800 rounded">✕</button>
                      </div>
                      
                      <div className="space-y-4 text-sm">
                        {/* Leader Skill Info */}
                        {leaderInst && (
                          <div className="bg-yellow-900/30 border border-yellow-500/50 p-3 rounded-lg">
                            <h4 className="font-bold text-yellow-400 mb-1 flex items-center">
                              <Sparkles size={14} className="mr-1" /> リーダースキル (中央配置)
                            </h4>
                            <p className="text-xs text-gray-300">
                              味方の <span className={FACTION_COLORS[HEROES.find(h=>h.id===leaderInst.heroId)!.faction]}>{FACTION_JA[HEROES.find(h=>h.id===leaderInst.heroId)!.faction]}属性</span> と 
                              <span className="text-white"> {CLASS_JA[HEROES.find(h=>h.id===leaderInst.heroId)!.classType]}</span> のDPSがそれぞれ +20%
                            </p>
                          </div>
                        )}

                        <div>
                          <h4 className="font-bold text-gray-400 mb-2 border-b border-gray-800 pb-1">属性 (FACTIONS)</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {(Object.entries(synergies.faction) as [Faction, number][]).map(([fac, count]) => count > 0 && (
                              <div key={fac} className="bg-gray-800 p-2 rounded flex flex-col">
                                <span className={cn("font-bold", FACTION_COLORS[fac])}>{FACTION_JA[fac]} ({count})</span>
                                <span className="text-[10px] text-gray-400 mt-1">
                                  {fac === 'Fire' || fac === 'Water' || fac === 'Nature' ? 
                                    (count >= 4 ? '+50% DPS' : count >= 2 ? '+20% DPS' : '2体必要') :
                                    (count >= 2 ? '+50% DPS' : '2体必要')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-400 mb-2 border-b border-gray-800 pb-1">クラス (CLASSES)</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {(Object.entries(synergies.class) as [ClassType, number][]).map(([cls, count]) => count > 0 && (
                              <div key={cls} className="bg-gray-800 p-2 rounded flex flex-col">
                                <span className="font-bold text-gray-200">{CLASS_JA[cls]} ({count})</span>
                                <span className="text-[10px] text-gray-400 mt-1">
                                  {count >= 4 ? '+40% DPS' : count >= 2 ? '+15% DPS' : '2体必要'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {Object.values(synergies.faction).every(v => v === 0) && Object.values(synergies.class).every(v => v === 0) && !leaderInst && (
                          <div className="text-center text-gray-500 py-4 italic">発動中のシナジーはありません。同じ属性やクラスのヒーローを配置しましょう！</div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          {activeTab === 'GACHA' && (
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto overscroll-contain">
              <div className="w-full max-w-sm mb-4 flex justify-end">
                <label className="flex items-center space-x-2 cursor-pointer bg-gray-800 px-3 py-2 rounded-lg border border-gray-700">
                  <input
                    type="checkbox"
                    checked={gameState.autoSellN || false}
                    onChange={(e) => setGameState(prev => ({ ...prev, autoSellN: e.target.checked }))}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-600 bg-gray-700 focus:ring-blue-500 focus:ring-offset-gray-800"
                  />
                  <span className="text-xs font-bold text-gray-300">Nレア自動売却</span>
                </label>
              </div>

              <div className="w-full max-w-sm bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl text-center relative overflow-hidden mb-4 shrink-0">
                <h2 className="text-2xl font-black text-gray-200 mb-2">ノーマルガチャ</h2>
                <p className="text-gray-400 text-xs mb-6">N 〜 SR のヒーローを召喚</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => pullGacha('normal', 1)}
                    disabled={gameState.gold < 100}
                    className="flex-1 py-3 rounded-xl font-bold text-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center border border-gray-600"
                  >
                    1回 <Coins size={16} className="ml-2 mr-1 text-yellow-400" /> 100
                  </button>
                  <button
                    onClick={() => pullGacha('normal', 10)}
                    disabled={gameState.gold < 1000}
                    className="flex-1 py-3 rounded-xl font-bold text-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center border border-gray-600"
                  >
                    10回 <Coins size={16} className="ml-2 mr-1 text-yellow-400" /> 1000
                  </button>
                </div>
              </div>

              <div className="w-full max-w-sm bg-gradient-to-b from-indigo-900 to-purple-900 rounded-2xl p-6 border-2 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.2)] text-center relative overflow-hidden shrink-0">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 pointer-events-none"></div>
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200 mb-2 drop-shadow-sm">
                  プレミアムガチャ
                </h2>
                <p className="text-purple-200 text-xs mb-2 font-medium">R 〜 UR のヒーローを召喚</p>
                
                {/* Pity System UI */}
                <div className="mb-4 bg-black/40 rounded-lg p-2 border border-purple-500/50">
                  <div className="flex justify-between text-[10px] text-purple-200 font-bold mb-1">
                    <span>SSR確定まで</span>
                    <span>{30 - gameState.pityCounter} 回</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div className="bg-gradient-to-r from-purple-500 to-yellow-400 h-1.5 rounded-full" style={{ width: `${(gameState.pityCounter / 30) * 100}%` }}></div>
                  </div>
                </div>

                <div className="flex gap-2 relative z-10">
                  <button
                    onClick={() => pullGacha('premium', 1)}
                    disabled={gameState.gems < 300}
                    className="flex-1 py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 disabled:opacity-50 text-black transition-all active:scale-95 flex items-center justify-center shadow-lg"
                  >
                    1回 <Gem size={18} className="ml-2 mr-1 text-white" /> 300
                  </button>
                  <button
                    onClick={() => pullGacha('premium', 10)}
                    disabled={gameState.gems < 3000}
                    className="flex-1 py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 disabled:opacity-50 text-black transition-all active:scale-95 flex items-center justify-center shadow-lg"
                  >
                    10回 <Gem size={18} className="ml-2 mr-1 text-white" /> 3000
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'UPGRADES' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto overscroll-contain">
              <div className="w-full max-w-sm bg-gray-800 rounded-2xl p-4 border border-gray-700 shadow-xl shrink-0">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-white flex items-center">
                    <Sword size={18} className="mr-2 text-red-400" /> タップダメージ
                  </h3>
                  <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">Lv {gameState.upgrades?.tapDamage || 1}</span>
                </div>
                <p className="text-xs text-gray-400 mb-4">敵をタップした際のダメージ倍率を増加させます。</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-red-400">x{(gameState.upgrades?.tapDamage || 1).toFixed(1)} 倍</span>
                  <button
                    onClick={() => handleUpgrade('tapDamage')}
                    disabled={gameState.gold < getUpgradeCost('tapDamage', gameState.upgrades?.tapDamage || 1)}
                    className="py-2 px-4 rounded-lg font-bold text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-all active:scale-95 flex items-center border border-gray-600"
                  >
                    強化 <Coins size={14} className="ml-2 mr-1 text-yellow-400" /> {formatNumber(getUpgradeCost('tapDamage', gameState.upgrades?.tapDamage || 1))}
                  </button>
                </div>
              </div>

              <div className="w-full max-w-sm bg-gray-800 rounded-2xl p-4 border border-gray-700 shadow-xl">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-bold text-white flex items-center">
                    <TrendingUp size={18} className="mr-2 text-green-400" /> ヒーローDPS
                  </h3>
                  <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">Lv {gameState.upgrades?.heroDps || 1}</span>
                </div>
                <p className="text-xs text-gray-400 mb-4">配置している全ヒーローのDPS倍率を増加させます。</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-green-400">x{(gameState.upgrades?.heroDps || 1).toFixed(1)} 倍</span>
                  <button
                    onClick={() => handleUpgrade('heroDps')}
                    disabled={gameState.gold < getUpgradeCost('heroDps', gameState.upgrades?.heroDps || 1)}
                    className="py-2 px-4 rounded-lg font-bold text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-all active:scale-95 flex items-center border border-gray-600"
                  >
                    強化 <Coins size={14} className="ml-2 mr-1 text-yellow-400" /> {formatNumber(getUpgradeCost('heroDps', gameState.upgrades?.heroDps || 1))}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'TACTICS' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-6 overflow-y-auto overscroll-contain">
              <h2 className="text-2xl font-black text-white mb-2 w-full max-w-sm text-left flex items-center drop-shadow-md shrink-0">
                <BookOpen size={24} className="mr-2 text-blue-400" /> 戦術
              </h2>

              {/* Formations */}
              <div className="w-full max-w-sm bg-gray-800 rounded-xl p-4 border border-gray-700 shrink-0">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center">
                  <Crosshair size={18} className="mr-2 text-cyan-400" /> 陣形
                </h3>
                <div className="space-y-3">
                  {FORMATIONS.map(formation => {
                    const level = gameState.formations?.[formation.id] || 0;
                    const isActive = gameState.activeFormationId === formation.id;
                    const unlockCost = 500; // Gems
                    
                    return (
                      <div key={formation.id} className={cn(
                        "p-3 rounded-lg border transition-all",
                        isActive ? "bg-cyan-900/30 border-cyan-500" : "bg-gray-900 border-gray-700"
                      )}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-gray-100">{formation.name}</h4>
                            <p className="text-xs text-gray-400 mt-1">{formation.description}</p>
                          </div>
                          {level > 0 ? (
                            <button
                              onClick={() => setGameState(prev => ({ ...prev, activeFormationId: isActive ? null : formation.id }))}
                              className={cn(
                                "px-3 py-1 rounded text-xs font-bold transition-colors",
                                isActive ? "bg-cyan-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                              )}
                            >
                              {isActive ? '解除' : '選択'}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (gameState.gems >= unlockCost) {
                                  setGameState(prev => ({
                                    ...prev,
                                    gems: prev.gems - unlockCost,
                                    formations: { ...(prev.formations || {}), [formation.id]: 1 }
                                  }));
                                }
                              }}
                              disabled={gameState.gems < unlockCost}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center"
                            >
                              <Gem size={12} className="mr-1" /> {unlockCost}
                            </button>
                          )}
                        </div>
                        {level > 0 && (
                          <div className="grid grid-cols-3 gap-1 mt-2 w-24 mx-auto">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(idx => (
                              <div key={idx} className={cn(
                                "w-6 h-6 rounded-sm border",
                                formation.positions.includes(idx) ? "bg-cyan-500/50 border-cyan-400" : "bg-gray-800 border-gray-700"
                              )} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Player Skills */}
              <div className="w-full max-w-sm bg-gray-800 rounded-xl p-4 border border-gray-700 shrink-0">
                <h3 className="text-lg font-bold text-white mb-3 flex items-center">
                  <Zap size={18} className="mr-2 text-yellow-400" /> プレイヤースキル
                </h3>
                <div className="space-y-3">
                  {PLAYER_SKILLS.map(skill => {
                    const level = gameState.activeSkills?.[skill.id] || 0;
                    const cost = Math.floor(skill.baseCost * Math.pow(skill.costMultiplier, level));
                    const isMax = level >= skill.maxLevel;

                    return (
                      <div key={skill.id} className="bg-gray-900 p-3 rounded-lg border border-gray-700">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-gray-100 flex items-center">
                              {skill.name} <span className="ml-2 text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">Lv.{level}</span>
                            </h4>
                            <p className="text-xs text-gray-400 mt-1">{skill.description}</p>
                            <p className="text-[10px] text-gray-500 mt-1">クールダウン: {skill.cooldown}秒</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (!isMax && gameState.gems >= cost) {
                              setGameState(prev => ({
                                ...prev,
                                gems: prev.gems - cost,
                                activeSkills: { ...(prev.activeSkills || {}), [skill.id]: level + 1 }
                              }));
                            }
                          }}
                          disabled={isMax || gameState.gems < cost}
                          className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center justify-center transition-colors"
                        >
                          {isMax ? 'MAX LEVEL' : <><Gem size={14} className="mr-1" /> {formatNumber(cost)} で強化</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'MISSIONS' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto overscroll-contain">
              <h2 className="text-2xl font-black text-white mb-2 w-full max-w-sm text-left flex items-center drop-shadow-md shrink-0">
                <Target size={24} className="mr-2 text-blue-400" /> ミッション
              </h2>

              <div className="w-full max-w-sm flex bg-gray-800 rounded-lg p-1 mb-2 shrink-0">
                <button 
                  onClick={() => setMissionTab('DAILY')}
                  className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-colors", missionTab === 'DAILY' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200")}
                >
                  デイリー
                </button>
                <button 
                  onClick={() => setMissionTab('ACHIEVEMENT')}
                  className={cn("flex-1 py-2 text-sm font-bold rounded-md transition-colors", missionTab === 'ACHIEVEMENT' ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200")}
                >
                  実績
                </button>
              </div>

              {missionTab === 'DAILY' ? (
                <div className="w-full max-w-sm space-y-3">
                  {gameState.missions.map(mission => {
                    const isComplete = mission.progress >= mission.target;
                    return (
                      <div key={mission.id} className={cn(
                        "w-full rounded-xl p-4 border shadow-lg relative overflow-hidden transition-all",
                        mission.claimed ? "bg-gray-900 border-gray-800 opacity-60" : "bg-gray-800 border-gray-600"
                      )}>
                        <div className="flex justify-between items-start mb-3 relative z-10 gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {mission.isDaily && <span className="text-[10px] bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded font-bold border border-blue-700 whitespace-nowrap">デイリー</span>}
                              <h3 className={cn("font-bold text-sm break-words", mission.claimed ? "text-gray-500" : "text-gray-100")}>{mission.title}</h3>
                            </div>
                            <p className="text-sm text-gray-300 mt-1 flex items-center">
                              報酬: <Gem size={14} className="inline text-cyan-400 mx-1 flex-shrink-0" /> <span className="text-cyan-400 font-bold">{mission.rewardGems}</span>
                            </p>
                          </div>
                          <button
                            onClick={() => claimMission(mission.id)}
                            disabled={!isComplete || mission.claimed}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex-shrink-0",
                              mission.claimed ? "bg-gray-800 text-gray-500 border border-gray-700" :
                              isComplete ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500 active:scale-95 shadow-[0_0_10px_rgba(37,99,235,0.6)] animate-pulse" :
                              "bg-gray-700 text-gray-300 border border-gray-600"
                            )}
                          >
                            {mission.claimed ? '受取済' : isComplete ? '受取可能' : '未達成'}
                          </button>
                        </div>
                        {!mission.claimed && (
                          <div className="w-full bg-gray-900 rounded-full h-2 mt-2 relative z-10 border border-gray-700 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }}
                            />
                          </div>
                        )}
                        <div className="absolute bottom-1 right-3 text-[10px] text-gray-400 font-mono z-10 font-bold">
                          {formatNumber(Math.min(mission.progress, mission.target))} / {formatNumber(mission.target)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="w-full max-w-sm space-y-3">
                  {ACHIEVEMENTS.map(ach => {
                    const isCompleted = gameState.achievements?.[ach.id];
                    return (
                      <div key={ach.id} className={cn(
                        "bg-gray-800 p-4 rounded-xl border flex items-center justify-between",
                        isCompleted ? "border-green-500/50 opacity-70" : "border-gray-700"
                      )}>
                        <div>
                          <h3 className={cn("font-bold text-base", isCompleted ? "text-green-400" : "text-gray-100")}>{ach.title}</h3>
                          <p className="text-xs text-gray-400 mt-1">{ach.description}</p>
                          <p className="text-sm text-gray-300 mt-1 flex items-center">
                            報酬: <Gem size={14} className="inline text-cyan-400 mx-1" /> <span className="text-cyan-400 font-bold">{ach.rewardGems}</span>
                          </p>
                        </div>
                        <div>
                          {isCompleted ? (
                            <div className="bg-green-900/50 text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-500/50 flex items-center">
                              <CheckCircle2 size={14} className="mr-1" /> 達成済
                            </div>
                          ) : (
                            <div className="bg-gray-700 text-gray-400 px-3 py-1 rounded-full text-xs font-bold">
                              未達成
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'PRESTIGE' && (
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto overscroll-contain">
              <div className="w-full max-w-sm bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl p-6 border border-gray-700 shadow-xl text-center relative overflow-hidden shrink-0 mb-4">
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 mb-2 drop-shadow-sm">
                  転生 (PRESTIGE)
                </h2>
                <p className="text-gray-400 text-sm mb-6">進行度をリセットし、永続的な力を得ます。</p>
                
                <div className="bg-gray-950 rounded-xl p-4 mb-6 border border-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-sm">現在のDPS倍率:</span>
                    <span className="text-cyan-400 font-bold">x{((gameState.prestigeMultiplier || 1)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-sm">所持転生ポイント:</span>
                    <span className="text-yellow-400 font-bold">{gameState.prestigePoints || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">転生回数:</span>
                    <span className="text-purple-400 font-bold">{gameState.prestigeCount || 0}</span>
                  </div>
                </div>

                <div className="bg-gray-950 rounded-xl p-4 mb-6 border border-gray-800">
                  <h3 className="text-gray-300 font-bold mb-2">次回の転生報酬</h3>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-sm">獲得ポイント:</span>
                    <span className="text-yellow-400 font-bold">+{Math.floor(gameState.stage / 10)}</span>
                  </div>
                  <p className="text-xs text-gray-500">10ステージクリアごとに1ポイント獲得。1ポイントにつき全体のDPSが+10%されます。</p>
                </div>

                <button
                  onClick={handlePrestige}
                  disabled={Math.floor(gameState.stage / 10) <= 0}
                  className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white transition-all active:scale-95 flex items-center justify-center shadow-lg"
                >
                  <ArrowUpCircle size={20} className="mr-2" /> 転生する
                </button>
              </div>

              <div className="w-full max-w-sm shrink-0">
                <h3 className="text-xl font-black text-white mb-4 flex items-center">
                  <Sparkles size={20} className="mr-2 text-yellow-400" /> タレントツリー
                </h3>
                <div className="space-y-3">
                  {TALENTS.map(talent => {
                    const currentLevel = gameState.talents?.[talent.id] || 0;
                    const isMax = currentLevel >= talent.maxLevel;
                    const cost = Math.floor(talent.baseCost * Math.pow(talent.costMultiplier, currentLevel));
                    const canAfford = (gameState.prestigePoints || 0) >= cost;

                    return (
                      <div key={talent.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-md">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-gray-100">{talent.name} <span className="text-xs text-gray-400 ml-1">Lv.{currentLevel}/{talent.maxLevel}</span></h4>
                            <p className="text-xs text-gray-400 mt-1">{talent.description}</p>
                            {currentLevel > 0 && (
                              <p className="text-[10px] text-cyan-400 mt-1">現在の効果: +{Math.round(currentLevel * talent.effectPerLevel * 100)}%</p>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              if (isMax || !canAfford) return;
                              setGameState(prev => ({
                                ...prev,
                                prestigePoints: (prev.prestigePoints || 0) - cost,
                                talents: {
                                  ...(prev.talents || {}),
                                  [talent.id]: currentLevel + 1
                                }
                              }));
                            }}
                            disabled={isMax || !canAfford}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap ml-2 transition-colors",
                              isMax ? "bg-gray-700 text-gray-500 cursor-not-allowed" :
                              canAfford ? "bg-yellow-600 text-white hover:bg-yellow-500" : "bg-gray-700 text-gray-400 cursor-not-allowed"
                            )}
                          >
                            {isMax ? 'MAX' : `${cost} pt`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'ARTIFACTS' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-3 overflow-y-auto overscroll-contain">
              <div className="w-full max-w-sm flex justify-between items-center mb-2 shrink-0">
                <h2 className="text-xl font-black text-white flex items-center">
                  <Crown size={20} className="mr-2 text-purple-400" /> 遺物 (ARTIFACTS)
                </h2>
                <div className="flex gap-2">
                  <div className="text-purple-300 font-bold bg-gray-800 px-3 py-1 rounded-full border border-gray-700 flex items-center text-xs">
                    <Sparkles size={12} className="mr-1" /> {gameState.artifactShards || 0}
                  </div>
                  <div className="text-yellow-400 font-bold bg-gray-800 px-3 py-1 rounded-full border border-gray-700 flex items-center text-xs">
                    <Crown size={12} className="mr-1" /> {gameState.prestigePoints || 0}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 w-full max-w-sm mb-2 shrink-0">転生ポイントや遺物の欠片を消費して強力な遺物を獲得・強化します。</p>
              
              <div className="w-full max-w-sm bg-gradient-to-br from-purple-900 to-indigo-900 rounded-xl p-4 border border-purple-500/30 shadow-lg shadow-purple-900/20 mb-4 relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
                <h3 className="font-black text-white mb-1 flex items-center"><Sparkles size={16} className="mr-2 text-purple-300" /> 遺物ガチャ</h3>
                <p className="text-xs text-purple-200/70 mb-4">遺物の欠片を10個消費して、ランダムな遺物を1レベル強化します。</p>
                <button
                  onClick={() => {
                    if ((gameState.artifactShards || 0) < 10) return;
                    
                    const availableArtifacts = ARTIFACTS.filter(a => (gameState.artifacts?.[a.id] || 0) < a.maxLevel);
                    if (availableArtifacts.length === 0) return; // All maxed
                    
                    const targetArtifact = availableArtifacts[Math.floor(Math.random() * availableArtifacts.length)];
                    
                    setGameState(prev => ({
                      ...prev,
                      artifactShards: (prev.artifactShards || 0) - 10,
                      artifacts: {
                        ...prev.artifacts,
                        [targetArtifact.id]: (prev.artifacts?.[targetArtifact.id] || 0) + 1
                      }
                    }));
                  }}
                  disabled={(gameState.artifactShards || 0) < 10 || ARTIFACTS.every(a => (gameState.artifacts?.[a.id] || 0) >= a.maxLevel)}
                  className={cn(
                    "w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center shadow-lg",
                    (gameState.artifactShards || 0) >= 10 && !ARTIFACTS.every(a => (gameState.artifacts?.[a.id] || 0) >= a.maxLevel)
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 active:scale-95 shadow-purple-500/20"
                      : "bg-gray-800 text-gray-500 border border-gray-700 shadow-none"
                  )}
                >
                  {ARTIFACTS.every(a => (gameState.artifacts?.[a.id] || 0) >= a.maxLevel) ? (
                    "全て最大レベル"
                  ) : (
                    <>
                      <Sparkles size={16} className="mr-2" />
                      ガチャを引く (欠片 10)
                    </>
                  )}
                </button>
              </div>

              {ARTIFACTS.map(artifact => {
                const currentLevel = gameState.artifacts?.[artifact.id] || 0;
                const isMax = currentLevel >= artifact.maxLevel;
                const cost = artifact.baseCost * Math.pow(2, currentLevel);
                
                return (
                  <div key={artifact.id} className="w-full max-w-sm bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-md shrink-0">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-bold text-purple-300">{artifact.name} <span className="text-xs text-gray-400 ml-1">Lv.{currentLevel}/{artifact.maxLevel}</span></h3>
                        <p className="text-xs text-gray-400 mt-1">{artifact.description}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (isMax || (gameState.prestigePoints || 0) < cost) return;
                          setGameState(prev => ({
                            ...prev,
                            prestigePoints: (prev.prestigePoints || 0) - cost,
                            artifacts: {
                              ...prev.artifacts,
                              [artifact.id]: currentLevel + 1
                            }
                          }));
                        }}
                        disabled={isMax || (gameState.prestigePoints || 0) < cost}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center",
                          isMax ? "bg-gray-700 text-gray-500" :
                          (gameState.prestigePoints || 0) >= cost ? "bg-purple-600 text-white hover:bg-purple-500 active:scale-95" :
                          "bg-gray-700 text-gray-400"
                        )}
                      >
                        {isMax ? 'MAX' : <>強化 <ArrowUpCircle size={12} className="ml-1 mr-1 text-yellow-400" /> {cost}</>}
                      </button>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      効果: {artifact.id === 'boss_sla' ? `ボスHP -${currentLevel * 5}%` : artifact.id === 'gold_rin' ? `ゴールド +${currentLevel * 20}%` : `DPS +${currentLevel * 10}%`}
                      {!isMax && <span className="text-purple-400 ml-2">→ 次: {artifact.id === 'boss_sla' ? `-${(currentLevel + 1) * 5}%` : artifact.id === 'gold_rin' ? `+${(currentLevel + 1) * 20}%` : `+${(currentLevel + 1) * 10}%`}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'EXPEDITIONS' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto overscroll-contain">
              <div className="w-full max-w-sm flex justify-between items-center mb-2 shrink-0">
                <h2 className="text-2xl font-black text-white flex items-center drop-shadow-md">
                  <Map size={24} className="mr-2 text-orange-400" /> 派遣
                </h2>
                <div className="flex space-x-2">
                  <button
                    onClick={handleClaimAllExpeditions}
                    className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg transition-colors shadow-md"
                  >
                    一括受取
                  </button>
                  <button
                    onClick={handleAutoDispatchExpeditions}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shadow-md"
                  >
                    自動派遣
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 w-full max-w-sm mb-2 shrink-0">ヒーローを派遣して報酬を獲得しましょう。派遣中もヒーローは通常通り戦闘に参加できます。</p>

              <div className="w-full max-w-sm space-y-3 shrink-0">
                {EXPEDITIONS.map(exp => {
                  const activeExp = gameState.activeExpeditions?.find(e => e.expeditionId === exp.id);
                  const isCompleted = activeExp && (now >= activeExp.startTime + exp.durationMinutes * 60 * 1000);
                  const timeLeft = activeExp ? Math.max(0, activeExp.startTime + exp.durationMinutes * 60 * 1000 - now) : 0;
                  const progress = activeExp ? Math.min(100, ((now - activeExp.startTime) / (exp.durationMinutes * 60 * 1000)) * 100) : 0;

                  return (
                    <div key={exp.id} className="bg-gray-800 p-3 rounded-xl border border-gray-700 shadow-md">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-bold text-gray-200">{exp.name}</h3>
                          <p className="text-[10px] text-gray-400">{exp.description}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-yellow-400 flex items-center justify-end">
                            {exp.rewardType === 'gold' && <Coins size={12} className="mr-1" />}
                            {exp.rewardType === 'gems' && <Gem size={12} className="mr-1" />}
                            {exp.rewardType === 'artifactShards' && <Crown size={12} className="mr-1" />}
                            {formatNumber(exp.baseReward)}
                          </div>
                          <div className="text-[10px] text-gray-500 flex items-center justify-end mt-1">
                            <Clock size={10} className="mr-1" /> {exp.durationMinutes}分
                          </div>
                        </div>
                      </div>

                      {activeExp ? (
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-gray-400">派遣中: {HEROES.find(h => h.id === activeExp.heroId)?.name}</span>
                            <span className={isCompleted ? "text-green-400 font-bold" : "text-orange-400"}>
                              {isCompleted ? '完了！' : `${Math.ceil(timeLeft / 1000 / 60)}分 ${Math.ceil((timeLeft / 1000) % 60)}秒`}
                            </span>
                          </div>
                          <div className="w-full bg-gray-900 rounded-full h-2 overflow-hidden border border-gray-700">
                            <div 
                              className={cn("h-full transition-all duration-1000", isCompleted ? "bg-green-500" : "bg-orange-500")}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          {isCompleted && (
                            <button
                              onClick={() => {
                                setGameState(prev => {
                                  let newGold = prev.gold;
                                  let newGems = prev.gems;
                                  let newShards = prev.artifactShards || 0;
                                  if (exp.rewardType === 'gold') newGold += exp.baseReward;
                                  if (exp.rewardType === 'gems') newGems += exp.baseReward;
                                  if (exp.rewardType === 'artifactShards') newShards += exp.baseReward;

                                  return {
                                    ...prev,
                                    gold: newGold,
                                    gems: newGems,
                                    artifactShards: newShards,
                                    activeExpeditions: prev.activeExpeditions?.filter(e => e.id !== activeExp.id)
                                  };
                                });
                              }}
                              className="w-full mt-2 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg text-sm transition-colors"
                            >
                              報酬を受け取る
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            // Find available heroes (unlocked and not currently dispatched)
                            const dispatchedHeroIds = gameState.activeExpeditions?.map(e => e.heroId) || [];
                            const availableHeroes = gameState.unlockedHeroes.filter(id => !dispatchedHeroIds.includes(id));

                            if (availableHeroes.length === 0) {
                              setModalState({
                                isOpen: true,
                                title: '派遣できるヒーローがいません',
                                message: 'すべてのヒーローが派遣中か、ヒーローを所持していません。',
                                isAlert: true
                              });
                              return;
                            }

                            // Select the first available hero for simplicity, or we could show a selection modal
                            // Let's just pick a random available hero for now to keep UI simple
                            const heroId = availableHeroes[Math.floor(Math.random() * availableHeroes.length)];

                            setGameState(prev => ({
                              ...prev,
                              activeExpeditions: [
                                ...(prev.activeExpeditions || []),
                                { id: Math.random().toString(), expeditionId: exp.id, heroId, startTime: Date.now(), completed: false }
                              ]
                            }));
                          }}
                          className="w-full mt-2 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg text-sm transition-colors"
                        >
                          派遣する
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'COLLECTION' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto overscroll-contain">
              <div className="w-full max-w-sm flex justify-between items-center mb-2 shrink-0">
                <h2 className="text-2xl font-black text-white flex items-center drop-shadow-md">
                  <BookOpen size={24} className="mr-2 text-orange-400" /> 図鑑
                </h2>
                <div className="text-gray-400 text-sm font-bold bg-gray-800 px-3 py-1 rounded-full border border-gray-700">
                  {gameState.unlockedHeroes.length} / {HEROES.length}
                </div>
              </div>
              
              {/* Collection Bonus Summary */}
              <div className="w-full max-w-sm bg-gradient-to-r from-orange-900/50 to-yellow-900/50 border border-orange-500/30 rounded-xl p-3 shrink-0 shadow-lg">
                <h3 className="text-sm font-bold text-orange-300 mb-1 flex items-center">
                  <Sparkles size={14} className="mr-1" /> 図鑑ボーナス (全体DPS上昇)
                </h3>
                <div className="flex justify-between text-xs text-gray-300">
                  <span>解放ボーナス ({gameState.unlockedHeroes.length}体):</span>
                  <span className="text-white font-bold">+{gameState.unlockedHeroes.length}%</span>
                </div>
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>覚醒ボーナス (計{Object.values(gameState.heroAwakenings || {}).reduce((a, b) => a + b, 0)}覚醒):</span>
                  <span className="text-white font-bold">+{Object.values(gameState.heroAwakenings || {}).reduce((a, b) => a + b, 0) * 2}%</span>
                </div>
                <div className="flex justify-between text-sm text-orange-400 font-black mt-2 pt-2 border-t border-orange-500/30">
                  <span>合計ボーナス:</span>
                  <span>+{gameState.unlockedHeroes.length + (Object.values(gameState.heroAwakenings || {}).reduce((a, b) => a + b, 0) * 2)}%</span>
                </div>
              </div>

              <p className="text-xs text-gray-400 w-full max-w-sm mb-2 shrink-0">獲得したヒーローの詳細を確認できます。解放・覚醒で全体DPSが上昇します。</p>
              
              <div className="w-full max-w-sm grid grid-cols-4 gap-2 shrink-0">
                {HEROES.map(hero => {
                  const isUnlocked = gameState.unlockedHeroes.includes(hero.id);
                  const souls = gameState.heroSouls?.[hero.id] || 0;
                  const awakeningLevel = gameState.heroAwakenings?.[hero.id] || 0;
                  const soulsNeeded = (awakeningLevel + 1) * 5; // 5, 10, 15, 20, 25
                  const canAwaken = souls >= soulsNeeded && awakeningLevel < 5;

                  return (
                    <div 
                      key={hero.id} 
                      onClick={() => {
                        if (isUnlocked) {
                          const passiveInfo = hero.passive ? `\n\nパッシブスキル: ${hero.passive.name}\n${hero.passive.description}` : '';
                          setModalState({
                            isOpen: true,
                            title: hero.name,
                            message: `レアリティ: ${hero.rarity}\nクラス: ${CLASS_JA[hero.classType]}\n属性: ${FACTION_JA[hero.faction]}\n基礎DPS: ${hero.baseDps}${passiveInfo}\n\n覚醒レベル: ${awakeningLevel}/5 (+${awakeningLevel * 50}% DPS)\n所持ソウル: ${souls}\n\n${canAwaken ? '覚醒可能です！' : awakeningLevel < 5 ? `次の覚醒まであと ${soulsNeeded - souls} ソウル` : '最大覚醒済み'}`,
                            isAlert: true,
                            onConfirm: canAwaken ? () => {
                              setGameState(prev => ({
                                ...prev,
                                heroSouls: { ...(prev.heroSouls || {}), [hero.id]: (prev.heroSouls?.[hero.id] || 0) - soulsNeeded },
                                heroAwakenings: { ...(prev.heroAwakenings || {}), [hero.id]: (prev.heroAwakenings?.[hero.id] || 0) + 1 }
                              }));
                              setModalState({ isOpen: false, title: '', message: '' });
                            } : undefined,
                            confirmText: canAwaken ? '覚醒する' : '閉じる'
                          });
                        }
                      }}
                      className={cn(
                        "aspect-square rounded-lg flex flex-col items-center justify-center border p-1 relative overflow-hidden cursor-pointer transition-transform hover:scale-105 active:scale-95",
                        isUnlocked ? "bg-gray-800 border-gray-600 shadow-sm" : "bg-gray-900 border-gray-800 opacity-50 grayscale cursor-not-allowed",
                        canAwaken ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-gray-900 animate-pulse" : ""
                      )}
                    >
                      <div className="text-2xl mb-1 relative">
                        {hero.emoji}
                        {awakeningLevel > 0 && (
                          <div className="absolute -top-1 -right-2 bg-yellow-500 text-black text-[8px] font-black px-1 rounded-full border border-yellow-200 shadow-sm">
                            +{awakeningLevel}
                          </div>
                        )}
                      </div>
                      {isUnlocked && (
                        <>
                          <div className={cn("text-[9px] font-bold", RARITY_COLORS[hero.rarity])}>{hero.rarity}</div>
                          <div className="text-[8px] text-gray-300 truncate w-full text-center">{hero.name}</div>
                          {awakeningLevel < 5 && (
                            <div className="w-full bg-gray-900 h-1 mt-1 rounded-full overflow-hidden">
                              <div className="bg-blue-400 h-full" style={{ width: `${Math.min(100, (souls / soulsNeeded) * 100)}%` }} />
                            </div>
                          )}
                        </>
                      )}
                      {!isUnlocked && <div className="text-xs text-gray-600 font-bold">?</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeTab === 'LEADERBOARD' && (
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto overscroll-contain">
              <h2 className="text-2xl font-black text-white mb-6 flex items-center justify-center tracking-widest shrink-0">
                <Trophy className="mr-2 text-pink-400" /> リーダーボード
              </h2>
              <div className="w-full max-w-sm space-y-3 shrink-0">
                {leaderboard.length > 0 ? (
                  leaderboard.map((entry, index) => (
                    <div key={entry.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                          index === 0 ? "bg-yellow-500 text-black" :
                          index === 1 ? "bg-gray-300 text-black" :
                          index === 2 ? "bg-orange-600 text-white" : "bg-gray-700 text-gray-300"
                        )}>
                          {index + 1}
                        </div>
                        <span className="font-bold text-white truncate max-w-[150px]">{entry.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">到達ステージ</div>
                        <div className="font-black text-pink-400 text-lg">{entry.stage}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-10">
                    データを読み込み中、またはデータがありません。
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'INVENTORY' && (
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto overscroll-contain">
              <h2 className="text-2xl font-black text-white mb-6 flex items-center justify-center tracking-widest shrink-0">
                <ShieldAlert className="mr-2 text-emerald-400" /> 鍛冶屋 (SMITHY)
              </h2>

              <div className="flex space-x-2 mb-6 w-full max-w-md shrink-0">
                <button
                  onClick={() => setInventoryTab('LIST')}
                  className={cn(
                    "flex-1 py-2 rounded-lg font-bold text-sm transition-colors",
                    inventoryTab === 'LIST' ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  )}
                >
                  装備一覧
                </button>
                <button
                  onClick={() => {
                    setInventoryTab('SYNTHESIS');
                    setSynthSelection([]);
                  }}
                  className={cn(
                    "flex-1 py-2 rounded-lg font-bold text-sm transition-colors",
                    inventoryTab === 'SYNTHESIS' ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  )}
                >
                  合成
                </button>
              </div>

              <div className="w-full max-w-md space-y-3 shrink-0">
                {inventoryTab === 'LIST' && (
                  <>
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-gray-400 text-sm">所持数: {gameState.inventory?.length || 0}</span>
                      <button
                        onClick={() => {
                          setGameState(prev => {
                            const toSell = (prev.inventory || []).filter(eq => eq.rarity === 'N' || eq.rarity === 'R');
                            if (toSell.length === 0) return prev;
                            
                            let totalGold = 0;
                            toSell.forEach(eq => {
                              totalGold += eq.rarity === 'R' ? 100 : 20;
                            });
                            
                            setTimeout(() => {
                              setModalState({
                                isOpen: true,
                                title: '一括売却完了',
                                message: `NとRの装備を${toSell.length}個売却し、${formatNumber(totalGold)}ゴールドを獲得しました。`,
                                isAlert: true
                              });
                            }, 100);

                            return {
                              ...prev,
                              gold: prev.gold + totalGold,
                              inventory: (prev.inventory || []).filter(eq => eq.rarity !== 'N' && eq.rarity !== 'R')
                            };
                          });
                        }}
                        className="px-3 py-1 bg-red-900/50 hover:bg-red-800/50 border border-red-500/50 text-red-400 text-xs font-bold rounded-lg transition-colors"
                      >
                        N/R一括売却
                      </button>
                    </div>
                    {(!gameState.inventory || gameState.inventory.length === 0) ? (
                      <div className="text-center text-gray-500 py-10 bg-gray-800/50 rounded-xl border border-gray-700">
                        装備を持っていません。<br/>ボスを倒してドロップを狙いましょう！
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {gameState.inventory.map((eq) => (
                          <div key={eq.id} className="bg-gray-800 p-3 rounded-xl border border-gray-700 flex flex-col relative">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center">
                                <span className={cn(
                                  "text-xs font-bold px-1.5 py-0.5 rounded mr-2",
                                  eq.rarity === 'UR' ? "bg-red-500/20 text-red-400 border border-red-500/50" :
                                  eq.rarity === 'SSR' ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50" :
                                  eq.rarity === 'SR' ? "bg-purple-500/20 text-purple-400 border border-purple-500/50" :
                                  eq.rarity === 'R' ? "bg-blue-500/20 text-blue-400 border border-blue-500/50" :
                                  "bg-gray-500/20 text-gray-400 border border-gray-500/50"
                                )}>{eq.rarity}</span>
                                <span className="font-bold text-white text-sm">{eq.name}</span>
                              </div>
                              <span className="text-[10px] text-gray-500 uppercase">{eq.type}</span>
                            </div>
                            <div className="text-xs text-emerald-400 mb-1">DPS +{formatNumber(eq.dpsBonus)}</div>
                            <div className="text-xs text-emerald-400 mb-3">DPS x{eq.dpsMultiplier.toFixed(2)}</div>
                            <button 
                              onClick={() => {
                                setGameState(prev => {
                                  const sellPrice = eq.rarity === 'UR' ? 10000 : eq.rarity === 'SSR' ? 2000 : eq.rarity === 'SR' ? 500 : eq.rarity === 'R' ? 100 : 20;
                                  return {
                                    ...prev,
                                    gold: prev.gold + sellPrice,
                                    inventory: (prev.inventory || []).filter(i => i.id !== eq.id)
                                  };
                                });
                              }}
                              className="mt-auto w-full py-1.5 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs rounded border border-red-700/50 transition-colors"
                            >
                              売却 (+{formatNumber(eq.rarity === 'UR' ? 10000 : eq.rarity === 'SSR' ? 2000 : eq.rarity === 'SR' ? 500 : eq.rarity === 'R' ? 100 : 20)}G)
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {inventoryTab === 'SYNTHESIS' && (
                  <>
                    <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 mb-4">
                      <p className="text-sm text-gray-300 mb-2">同じレアリティ・部位の装備を3つ選んで、1つ上のレアリティに合成します。</p>
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-gray-400 text-sm">選択中: {synthSelection.length}/3</span>
                        <div className="flex space-x-2">
                          <button
                            onClick={handleAutoSynthesizeEquipment}
                            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-colors flex items-center"
                          >
                            <Combine size={16} className="mr-1" /> 一括合成
                          </button>
                          <button
                            disabled={synthSelection.length !== 3}
                            onClick={() => {
                              if (synthSelection.length !== 3) return;
                              const eqs = synthSelection.map(id => gameState.inventory?.find(e => e.id === id)).filter(Boolean) as Equipment[];
                              if (eqs.length !== 3) return;
                              const newEq = synthesizeEquipment(eqs);
                              if (newEq) {
                                setGameState(prev => ({
                                  ...prev,
                                  inventory: [...(prev.inventory || []).filter(i => !synthSelection.includes(i.id)), newEq]
                                }));
                                setSynthSelection([]);
                                setDropNotification(newEq); // Show notification for the new item
                              } else {
                                // Synthesis failed (e.g. mismatched types)
                                setModalState({
                                  isOpen: true,
                                  title: '合成失敗',
                                  message: '同じレアリティ、同じ部位の装備を3つ選んでください。URは合成できません。',
                                  isAlert: true
                                });
                                setSynthSelection([]);
                              }
                            }}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold rounded-lg transition-colors"
                          >
                            合成する
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(gameState.inventory || []).filter(eq => eq.rarity !== 'UR').map((eq) => {
                        const isSelected = synthSelection.includes(eq.id);
                        const canSelect = synthSelection.length < 3 || isSelected;
                        
                        // If something is selected, only allow selecting matching type and rarity
                        let isMatch = true;
                        if (synthSelection.length > 0) {
                          const firstSelected = gameState.inventory?.find(e => e.id === synthSelection[0]);
                          if (firstSelected) {
                            isMatch = eq.type === firstSelected.type && eq.rarity === firstSelected.rarity;
                          }
                        }

                        const isDisabled = !isSelected && (!canSelect || !isMatch);

                        return (
                          <div 
                            key={eq.id} 
                            onClick={() => {
                              if (isDisabled) return;
                              setSynthSelection(prev => 
                                prev.includes(eq.id) ? prev.filter(id => id !== eq.id) : [...prev, eq.id]
                              );
                            }}
                            className={cn(
                              "p-3 rounded-xl border flex flex-col relative cursor-pointer transition-all",
                              isSelected ? "bg-emerald-900/30 border-emerald-500" : 
                              isDisabled ? "bg-gray-900/50 border-gray-800 opacity-50" : 
                              "bg-gray-800 border-gray-700 hover:border-gray-500"
                            )}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center">
                                <span className={cn(
                                  "text-xs font-bold px-1.5 py-0.5 rounded mr-2",
                                  eq.rarity === 'SSR' ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50" :
                                  eq.rarity === 'SR' ? "bg-purple-500/20 text-purple-400 border border-purple-500/50" :
                                  eq.rarity === 'R' ? "bg-blue-500/20 text-blue-400 border border-blue-500/50" :
                                  "bg-gray-500/20 text-gray-400 border border-gray-500/50"
                                )}>{eq.rarity}</span>
                                <span className="font-bold text-white text-sm">{eq.name}</span>
                              </div>
                              <span className="text-[10px] text-gray-500 uppercase">{eq.type}</span>
                            </div>
                            <div className="text-xs text-emerald-400 mb-1">DPS +{formatNumber(eq.dpsBonus)}</div>
                            <div className="text-xs text-emerald-400">DPS x{eq.dpsMultiplier.toFixed(2)}</div>
                            {isSelected && (
                              <div className="absolute top-2 right-2 text-emerald-400">
                                <CheckCircle2 size={16} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Menu Overlay */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 bg-gray-900/95 backdrop-blur-md z-20 flex flex-col p-4 overflow-y-auto overscroll-contain"
            >
              <div className="flex justify-between items-center mb-6 border-b border-gray-800 pb-2">
                <h2 className="text-xl font-black text-white">メニュー</h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => { setActiveTab('TACTICS'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95", activeTab === 'TACTICS' ? "bg-blue-900/40 border-blue-500/50 text-blue-400" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700")}
                >
                  <Target size={28} className="mb-2" />
                  <span className="text-xs font-bold">戦術</span>
                </button>
                <button
                  onClick={() => { setActiveTab('MISSIONS'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95", activeTab === 'MISSIONS' ? "bg-blue-900/40 border-blue-500/50 text-blue-400" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700")}
                >
                  <ScrollText size={28} className="mb-2" />
                  <span className="text-xs font-bold">任務</span>
                </button>
                <button
                  onClick={() => { setActiveTab('ARTIFACTS'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95", activeTab === 'ARTIFACTS' ? "bg-purple-900/40 border-purple-500/50 text-purple-400" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700")}
                >
                  <Crown size={28} className="mb-2" />
                  <span className="text-xs font-bold">遺物</span>
                </button>
                <button
                  onClick={() => { setActiveTab('EXPEDITIONS'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95", activeTab === 'EXPEDITIONS' ? "bg-orange-900/40 border-orange-500/50 text-orange-400" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700")}
                >
                  <Map size={28} className="mb-2" />
                  <span className="text-xs font-bold">派遣</span>
                </button>
                <button
                  onClick={() => { setActiveTab('PRESTIGE'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95", activeTab === 'PRESTIGE' ? "bg-cyan-900/40 border-cyan-500/50 text-cyan-400" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700")}
                >
                  <ArrowUpCircle size={28} className="mb-2" />
                  <span className="text-xs font-bold">転生</span>
                </button>
                <button
                  onClick={() => { setActiveTab('LEADERBOARD'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95", activeTab === 'LEADERBOARD' ? "bg-pink-900/40 border-pink-500/50 text-pink-400" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700")}
                >
                  <Trophy size={28} className="mb-2" />
                  <span className="text-[10px] sm:text-xs font-bold">ランキング</span>
                </button>
                <button
                  onClick={() => { setActiveTab('INVENTORY'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-4 rounded-2xl border transition-all active:scale-95", activeTab === 'INVENTORY' ? "bg-emerald-900/40 border-emerald-500/50 text-emerald-400" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700")}
                >
                  <ShieldAlert size={28} className="mb-2" />
                  <span className="text-xs font-bold">装備</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation */}
        <div className="bg-gray-900 border-t border-gray-800 flex justify-around p-2 pb-safe z-30 shrink-0">
          <button
            onClick={() => { setActiveTab('BATTLE'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-colors", activeTab === 'BATTLE' && !isMenuOpen ? "text-red-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <Sword size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">バトル</span>
          </button>
          <button
            onClick={() => { setActiveTab('GACHA'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-colors", activeTab === 'GACHA' && !isMenuOpen ? "text-yellow-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <Sparkles size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">ガチャ</span>
          </button>
          <button
            onClick={() => { setActiveTab('UPGRADES'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-colors", activeTab === 'UPGRADES' && !isMenuOpen ? "text-green-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <TrendingUp size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">強化</span>
          </button>
          <button
            onClick={() => { setActiveTab('COLLECTION'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-colors", activeTab === 'COLLECTION' && !isMenuOpen ? "text-orange-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <BookOpen size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">図鑑</span>
          </button>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-colors", isMenuOpen ? "text-blue-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <LayoutGrid size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">メニュー</span>
          </button>
        </div>

        {/* Equipment Modal */}
        <AnimatePresence>
          {isEquipmentModalOpen && selected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden flex flex-col max-h-[80vh]"
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-black text-white flex items-center">
                    <ShieldAlert className="mr-2 text-emerald-400" /> 装備変更
                  </h2>
                  <button onClick={() => { setIsEquipmentModalOpen(false); setSelectedEquipmentSlot(null); }} className="text-gray-400 hover:text-white">
                    <X size={24} />
                  </button>
                </div>

                {(() => {
                  const arr = selected.type === 'board' ? gameState.board : gameState.bench;
                  const inst = arr[selected.index];
                  if (!inst) return null;
                  const def = HEROES.find(h => h.id === inst.heroId)!;

                  return (
                    <div className="flex flex-col space-y-4 overflow-y-auto no-scrollbar">
                      <div className="flex items-center space-x-4 bg-gray-800 p-3 rounded-xl border border-gray-700">
                        <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center text-2xl border-2", RARITY_COLORS[def.rarity])}>
                          {def.emoji}
                        </div>
                        <div>
                          <div className="font-bold text-white">{def.name}</div>
                          <div className="text-xs text-gray-400">Lv.{inst.level || 1}</div>
                        </div>
                      </div>

                      {/* Equipment Slots */}
                      <div className="grid grid-cols-3 gap-2">
                        {(['weapon', 'armor', 'accessory'] as const).map(slot => {
                          const eq = inst.equipment?.[slot];
                          const isSelected = selectedEquipmentSlot === slot;
                          return (
                            <button
                              key={slot}
                              onClick={() => setSelectedEquipmentSlot(isSelected ? null : slot)}
                              className={cn(
                                "flex flex-col items-center p-2 rounded-xl border transition-colors",
                                isSelected ? "bg-emerald-900/40 border-emerald-500" : "bg-gray-800 border-gray-700 hover:bg-gray-700"
                              )}
                            >
                              <div className="text-xs text-gray-400 mb-1 uppercase">{slot}</div>
                              {eq ? (
                                <div className="flex flex-col items-center">
                                  <span className={cn(
                                    "text-[10px] font-bold px-1 rounded mb-1",
                                    eq.rarity === 'UR' ? "bg-red-500/20 text-red-400" :
                                    eq.rarity === 'SSR' ? "bg-yellow-500/20 text-yellow-400" :
                                    eq.rarity === 'SR' ? "bg-purple-500/20 text-purple-400" :
                                    eq.rarity === 'R' ? "bg-blue-500/20 text-blue-400" :
                                    "bg-gray-500/20 text-gray-400"
                                  )}>{eq.rarity}</span>
                                  <span className="text-[10px] text-white truncate w-full text-center">{eq.name}</span>
                                </div>
                              ) : (
                                <div className="text-gray-600 text-sm py-2">未装備</div>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Set Bonus Display */}
                      {(() => {
                        if (inst.equipment?.weapon && inst.equipment?.armor && inst.equipment?.accessory) {
                          const rarities = [inst.equipment.weapon.rarity, inst.equipment.armor.rarity, inst.equipment.accessory.rarity];
                          const rarityLevels = { 'N': 1, 'R': 2, 'SR': 3, 'SSR': 4, 'UR': 5 };
                          const minRarityLevel = Math.min(...rarities.map(r => rarityLevels[r as keyof typeof rarityLevels]));
                          
                          let bonusText = "";
                          let rarityName = "";
                          let colorClass = "";
                          
                          if (minRarityLevel >= 5) { rarityName = "UR"; bonusText = "+300%"; colorClass = "text-red-400 border-red-500/50 bg-red-900/20"; }
                          else if (minRarityLevel >= 4) { rarityName = "SSR"; bonusText = "+100%"; colorClass = "text-yellow-400 border-yellow-500/50 bg-yellow-900/20"; }
                          else if (minRarityLevel >= 3) { rarityName = "SR"; bonusText = "+30%"; colorClass = "text-purple-400 border-purple-500/50 bg-purple-900/20"; }
                          else if (minRarityLevel >= 2) { rarityName = "R"; bonusText = "+15%"; colorClass = "text-blue-400 border-blue-500/50 bg-blue-900/20"; }
                          else if (minRarityLevel >= 1) { rarityName = "N"; bonusText = "+5%"; colorClass = "text-gray-300 border-gray-500/50 bg-gray-800/50"; }

                          return (
                            <div className={cn("mt-2 p-2 rounded-lg border flex items-center justify-between shadow-inner", colorClass)}>
                              <div className="flex items-center">
                                <Sparkles size={14} className="mr-2" />
                                <span className="text-xs font-bold">{rarityName} セットボーナス発動中！</span>
                              </div>
                              <span className="text-sm font-black">{bonusText} DPS</span>
                            </div>
                          );
                        }
                        return (
                          <div className="mt-2 p-2 rounded-lg border border-gray-700 bg-gray-800/50 flex items-center justify-center text-gray-500 text-xs">
                            3部位装備でセットボーナス発動
                          </div>
                        );
                      })()}

                      {/* Inventory List for Selected Slot */}
                      {selectedEquipmentSlot && (
                        <div className="mt-4 border-t border-gray-800 pt-4 flex-1 overflow-y-auto">
                          <h3 className="text-sm font-bold text-gray-400 mb-2 uppercase">{selectedEquipmentSlot} 一覧</h3>
                          <div className="space-y-2">
                            {/* Unequip option */}
                            {inst.equipment?.[selectedEquipmentSlot] && (
                              <button
                                onClick={() => {
                                  setGameState(prev => {
                                    const newArr = selected.type === 'board' ? [...prev.board] : [...prev.bench];
                                    const currentInst = newArr[selected.index]!;
                                    const currentEq = currentInst.equipment?.[selectedEquipmentSlot];
                                    
                                    const newEquipment = { ...currentInst.equipment };
                                    delete newEquipment[selectedEquipmentSlot];
                                    
                                    newArr[selected.index] = { ...currentInst, equipment: newEquipment };
                                    
                                    return {
                                      ...prev,
                                      [selected.type]: newArr,
                                      inventory: currentEq ? [...(prev.inventory || []), currentEq] : prev.inventory
                                    };
                                  });
                                  setSelectedEquipmentSlot(null);
                                }}
                                className="w-full p-2 bg-red-900/30 hover:bg-red-900/50 border border-red-700/50 rounded-lg text-red-400 text-xs font-bold transition-colors"
                              >
                                外す
                              </button>
                            )}

                            {/* Available items */}
                            {(gameState.inventory || []).filter(eq => eq.type === selectedEquipmentSlot).length === 0 ? (
                              <div className="text-center text-gray-500 text-xs py-4">装備可能なアイテムがありません</div>
                            ) : (
                              (gameState.inventory || []).filter(eq => eq.type === selectedEquipmentSlot).map(eq => (
                                <button
                                  key={eq.id}
                                  onClick={() => {
                                    setGameState(prev => {
                                      const newArr = selected.type === 'board' ? [...prev.board] : [...prev.bench];
                                      const currentInst = newArr[selected.index]!;
                                      const currentEq = currentInst.equipment?.[selectedEquipmentSlot];
                                      
                                      const newEquipment = { ...currentInst.equipment, [selectedEquipmentSlot]: eq };
                                      newArr[selected.index] = { ...currentInst, equipment: newEquipment };
                                      
                                      let newInventory = (prev.inventory || []).filter(i => i.id !== eq.id);
                                      if (currentEq) newInventory.push(currentEq);
                                      
                                      return {
                                        ...prev,
                                        [selected.type]: newArr,
                                        inventory: newInventory
                                      };
                                    });
                                    setSelectedEquipmentSlot(null);
                                  }}
                                  className="w-full flex items-center justify-between p-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors text-left"
                                >
                                  <div>
                                    <div className="flex items-center">
                                      <span className={cn(
                                        "text-[10px] font-bold px-1 rounded mr-2",
                                        eq.rarity === 'UR' ? "bg-red-500/20 text-red-400" :
                                        eq.rarity === 'SSR' ? "bg-yellow-500/20 text-yellow-400" :
                                        eq.rarity === 'SR' ? "bg-purple-500/20 text-purple-400" :
                                        eq.rarity === 'R' ? "bg-blue-500/20 text-blue-400" :
                                        "bg-gray-500/20 text-gray-400"
                                      )}>{eq.rarity}</span>
                                      <span className="font-bold text-white text-sm">{eq.name}</span>
                                    </div>
                                    <div className="text-[10px] text-emerald-400 mt-1">DPS +{formatNumber(eq.dpsBonus)} / x{eq.dpsMultiplier.toFixed(2)}</div>
                                  </div>
                                  <div className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-1 rounded">装備</div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Offline Reward Modal */}
        <AnimatePresence>
          {offlineReward && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-gradient-to-b from-gray-800 to-gray-900 border border-yellow-500/50 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center"
              >
                <div className="w-16 h-16 mx-auto bg-yellow-500/20 rounded-full flex items-center justify-center mb-4">
                  <Sparkles size={32} className="text-yellow-400" />
                </div>
                <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400 mb-2">
                  おかえりなさい！
                </h3>
                <p className="text-gray-300 mb-6 text-sm">
                  あなたが離れていた {Math.floor(offlineReward.time / 60)}時間 {offlineReward.time % 60}分 の間に、ヒーローたちが戦い続けました。
                </p>
                
                <div className="bg-gray-950 rounded-xl p-4 mb-6 border border-gray-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center"><Coins size={16} className="mr-2 text-yellow-400" /> 獲得ゴールド</span>
                    <span className="text-yellow-400 font-bold text-lg">+{offlineReward.gold.toLocaleString()}</span>
                  </div>
                  {offlineReward.gems > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 flex items-center"><Gem size={16} className="mr-2 text-pink-400" /> 獲得ジェム</span>
                      <span className="text-pink-400 font-bold text-lg">+{offlineReward.gems.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setOfflineReward(null)}
                  className="w-full py-3 rounded-xl font-bold bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white transition-all active:scale-95 shadow-lg"
                >
                  受け取る
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal */}
        <AnimatePresence>
          {modalState.isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
              >
                <h3 className="text-xl font-bold text-white mb-2">{modalState.title}</h3>
                <p className="text-gray-300 mb-6 text-sm whitespace-pre-wrap">{modalState.message}</p>
                <div className="flex justify-end space-x-3">
                  {!modalState.isAlert && (
                    <button
                      onClick={() => setModalState({ isOpen: false, title: '', message: '' })}
                      className="px-4 py-2 rounded-lg font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                    >
                      キャンセル
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (modalState.onConfirm) modalState.onConfirm();
                      else setModalState({ isOpen: false, title: '', message: '' });
                    }}
                    className="px-4 py-2 rounded-lg font-bold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    {modalState.confirmText || (modalState.isAlert ? 'OK' : '確認')}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gacha Reveal Modal */}
        <AnimatePresence>
          {gachaReveal.isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 overflow-hidden"
              onClick={() => setGachaReveal({ isOpen: false, hero: null, is10Pull: false, heroes: [] })}
            >
              {/* High Rarity Background Effects */}
              {(() => {
                const hasUR = gachaReveal.is10Pull ? gachaReveal.heroes.some(h => HEROES.find(hd => hd.id === h.heroId)?.rarity === 'UR') : (gachaReveal.hero && HEROES.find(hd => hd.id === gachaReveal.hero!.heroId)?.rarity === 'UR');
                const hasSSR = gachaReveal.is10Pull ? gachaReveal.heroes.some(h => HEROES.find(hd => hd.id === h.heroId)?.rarity === 'SSR') : (gachaReveal.hero && HEROES.find(hd => hd.id === gachaReveal.hero!.heroId)?.rarity === 'SSR');
                
                if (hasUR) {
                  return (
                    <motion.div 
                      className="absolute inset-0 pointer-events-none flex items-center justify-center"
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                    >
                      <div className="w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(239,68,68,0.3)_30deg,transparent_60deg,rgba(239,68,68,0.3)_90deg,transparent_120deg,rgba(239,68,68,0.3)_150deg,transparent_180deg,rgba(239,68,68,0.3)_210deg,transparent_240deg,rgba(239,68,68,0.3)_270deg,transparent_300deg,rgba(239,68,68,0.3)_330deg,transparent_360deg)]" />
                    </motion.div>
                  );
                } else if (hasSSR) {
                  return (
                    <motion.div 
                      className="absolute inset-0 pointer-events-none flex items-center justify-center"
                      animate={{ rotate: -360 }}
                      transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
                    >
                      <div className="w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0deg,rgba(234,179,8,0.2)_45deg,transparent_90deg,rgba(234,179,8,0.2)_135deg,transparent_180deg,rgba(234,179,8,0.2)_225deg,transparent_270deg,rgba(234,179,8,0.2)_315deg,transparent_360deg)]" />
                    </motion.div>
                  );
                }
                return null;
              })()}

              <motion.div
                initial={{ scale: 0.5, y: 50, rotateY: 180 }}
                animate={{ scale: 1, y: 0, rotateY: 0 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: "spring", damping: 15, stiffness: 100 }}
                className="flex flex-col items-center max-w-4xl w-full relative z-10"
                onClick={e => e.stopPropagation()}
              >
                {gachaReveal.is10Pull ? (
                  <div className="flex flex-col items-center">
                    <h2 className="text-3xl font-black text-white tracking-widest mb-8 drop-shadow-lg">10連召喚結果</h2>
                    <div className="grid grid-cols-5 gap-4 mb-8">
                      {gachaReveal.heroes.map((h, idx) => {
                        const def = HEROES.find(hd => hd.id === h.heroId)!;
                        // We can't easily check if it was a duplicate at the exact moment of pull for each,
                        // but we can just show the hero.
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className={cn(
                              "w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border-2 flex flex-col items-center justify-center shadow-lg relative overflow-hidden",
                              RARITY_COLORS[def.rarity].bg,
                              RARITY_COLORS[def.rarity].border
                            )}
                          >
                            <span className="text-3xl sm:text-4xl drop-shadow-md z-10">{def.emoji}</span>
                            <div className="absolute bottom-0 w-full bg-black/60 text-center py-1 z-10">
                              <span className={cn("font-black tracking-widest text-[10px] sm:text-xs", RARITY_COLORS[def.rarity].text)}>
                                {def.rarity}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setGachaReveal({ isOpen: false, hero: null, is10Pull: false, heroes: [] })}
                      className="px-8 py-3 bg-white text-black font-black rounded-full hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95"
                    >
                      確認
                    </button>
                  </div>
                ) : gachaReveal.hero ? (
                  (() => {
                    const def = HEROES.find(h => h.id === gachaReveal.hero!.heroId)!;
                    const isDuplicate = (gameState.heroSouls?.[def.id] || 0) > 0;
                    return (
                      <>
                        <motion.div 
                          animate={{ y: [0, -10, 0] }}
                          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                          className={cn(
                            "w-48 h-48 rounded-3xl border-4 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden",
                            RARITY_COLORS[def.rarity].bg,
                            RARITY_COLORS[def.rarity].border
                          )}
                        >
                          <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
                          <span className="text-[100px] drop-shadow-2xl z-10">{def.emoji}</span>
                          <div className="absolute bottom-0 w-full bg-black/60 text-center py-2 z-10">
                            <span className={cn("font-black tracking-widest text-lg", RARITY_COLORS[def.rarity].text)}>
                              {def.rarity}
                            </span>
                          </div>
                        </motion.div>
                        
                        <div className="mt-8 text-center">
                          <h2 className="text-3xl font-black text-white tracking-widest mb-2 drop-shadow-lg">{def.name}</h2>
                          <div className="flex items-center justify-center gap-2 mb-4">
                            <span className={cn("px-3 py-1 rounded-full text-sm font-bold border", FACTION_COLORS[def.faction], "bg-black/50")}>
                              {FACTION_JA[def.faction]}
                            </span>
                            <span className="px-3 py-1 rounded-full text-sm font-bold border border-gray-500 text-gray-300 bg-black/50">
                              {CLASS_JA[def.classType]}
                            </span>
                          </div>
                          {isDuplicate && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 }}
                              className="bg-blue-900/50 text-blue-300 px-4 py-2 rounded-xl border border-blue-700/50 font-bold text-sm"
                            >
                              重複ボーナス: 魂 +1
                            </motion.div>
                          )}
                        </div>

                        <button
                          onClick={() => setGachaReveal({ isOpen: false, hero: null, is10Pull: false, heroes: [] })}
                          className="mt-8 px-8 py-3 bg-white text-black font-black rounded-full hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.3)] active:scale-95"
                        >
                          確認
                        </button>
                      </>
                    );
                  })()
                ) : null}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prestige Animation */}
        <AnimatePresence>
          {isPrestiging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-white"
            >
              <motion.div
                initial={{ scale: 0.5, rotate: 0 }}
                animate={{ scale: [0.5, 1.5, 20], rotate: 360 }}
                transition={{ duration: 2, ease: "easeInOut" }}
                className="text-cyan-500"
              >
                <ArrowUpCircle size={100} />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="absolute text-4xl font-black text-black tracking-widest uppercase mt-32"
              >
                PRESTIGE
              </motion.h1>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Modal */}
        <AnimatePresence>
          {showStats && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setShowStats(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center">
                    <BarChart2 size={20} className="mr-2 text-blue-400" /> ステータス詳細
                  </h3>
                  <button onClick={() => setShowStats(false)} className="text-gray-500 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                
                <div className="space-y-4">
                  {(() => {
                    const stats = getDpsBreakdown();
                    return (
                      <>
                        <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
                          <span className="text-gray-400 text-sm">ヒーロー基礎DPS合計</span>
                          <span className="text-white font-bold">{formatNumber(stats.baseTotal)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
                          <span className="text-gray-400 text-sm">個別倍率適用後</span>
                          <span className="text-white font-bold">{formatNumber(stats.afterIndividualMults)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
                          <span className="text-gray-400 text-sm">シナジー全体倍率</span>
                          <span className="text-yellow-400 font-bold">x{stats.globalMult.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
                          <span className="text-gray-400 text-sm">強化(アップグレード)倍率</span>
                          <span className="text-green-400 font-bold">x{stats.upgradeMult.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
                          <span className="text-gray-400 text-sm">タレント倍率</span>
                          <span className="text-purple-400 font-bold">x{stats.talentMult.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
                          <span className="text-gray-400 text-sm">アクティブスキル倍率</span>
                          <span className="text-orange-400 font-bold">x{stats.skillMult.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-800 p-3 rounded-lg border border-gray-700">
                          <span className="text-gray-400 text-sm">転生倍率</span>
                          <span className="text-cyan-400 font-bold">x{stats.prestigeMult.toFixed(2)}</span>
                        </div>
                        {currentEnemyTrait === 'EVASIVE' && (
                          <div className="flex justify-between items-center bg-red-900/30 p-3 rounded-lg border border-red-900/50">
                            <span className="text-red-400 text-sm">敵特性: 回避</span>
                            <span className="text-red-400 font-bold">x0.70</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center bg-blue-900/30 p-4 rounded-lg border border-blue-500/50 mt-2">
                          <span className="text-blue-200 font-bold">最終DPS</span>
                          <span className="text-blue-400 font-black text-xl">{formatNumber(stats.finalDps)}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Modal */}
        <AnimatePresence>
          {isSettingsOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl flex flex-col"
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-white flex items-center">
                    <Settings size={20} className="mr-2 text-gray-400" /> 設定
                  </h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-gray-500 hover:text-white">
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Account Section */}
                  <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                    <h4 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">アカウント</h4>
                    {isAuthReady ? (
                      user ? (
                        <div className="flex flex-col space-y-3">
                          <div className="flex items-center space-x-3">
                            {user.photoURL ? (
                              <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full border-2 border-gray-600" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xl">👤</div>
                            )}
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-sm font-bold text-white truncate">{user.displayName || '名無しプレイヤー'}</span>
                              <span className="text-xs text-gray-400 truncate">{user.email}</span>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                await logout();
                                setModalState({ isOpen: true, title: 'ログアウト', message: 'ログアウトしました。', isAlert: true });
                              } catch (e) {
                                setModalState({ isOpen: true, title: 'エラー', message: 'ログアウトに失敗しました。', isAlert: true });
                              }
                            }}
                            className="w-full py-2 rounded-lg font-bold text-sm bg-gray-700 hover:bg-gray-600 text-white transition-colors flex items-center justify-center"
                          >
                            <LogOut size={16} className="mr-2" /> ログアウト
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await loginWithGoogle();
                              setModalState({ isOpen: true, title: 'ログイン成功', message: 'Googleアカウントでログインしました。', isAlert: true });
                            } catch (e) {
                              setModalState({ isOpen: true, title: 'エラー', message: 'ログインに失敗しました。', isAlert: true });
                            }
                          }}
                          className="w-full py-3 rounded-lg font-bold text-sm bg-white hover:bg-gray-100 text-gray-900 transition-colors flex items-center justify-center"
                        >
                          <LogIn size={16} className="mr-2" /> Googleでログイン
                        </button>
                      )
                    ) : (
                      <div className="text-center text-gray-500 text-sm py-2">読み込み中...</div>
                    )}
                  </div>

                  {/* Cloud Save Section */}
                  <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                    <h4 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">クラウドセーブ</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={async () => {
                          if (!user) {
                            setModalState({ isOpen: true, title: 'エラー', message: 'クラウドセーブを利用するにはログインが必要です。', isAlert: true });
                            return;
                          }
                          try {
                            const saveRef = doc(db, 'saves', user.uid);
                            await setDoc(saveRef, {
                              gameState: JSON.stringify(gameState),
                              updatedAt: serverTimestamp(),
                              stage: gameState.stage,
                              displayName: user.displayName || '名無しプレイヤー'
                            });
                            setModalState({ isOpen: true, title: 'セーブ完了', message: 'データをクラウドに保存しました。', isAlert: true });
                          } catch (e) {
                            setModalState({ isOpen: true, title: 'エラー', message: 'セーブに失敗しました。', isAlert: true });
                            handleFirestoreError(e, OperationType.WRITE, `saves/${user.uid}`);
                          }
                        }}
                        disabled={!user}
                        className="py-2 rounded-lg font-bold text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-gray-700 text-white transition-colors flex flex-col items-center justify-center"
                      >
                        <CloudUpload size={18} className="mb-1" /> クラウドへ保存
                      </button>
                      <button
                        onClick={async () => {
                          if (!user) {
                            setModalState({ isOpen: true, title: 'エラー', message: 'クラウドロードを利用するにはログインが必要です。', isAlert: true });
                            return;
                          }
                          setModalState({
                            isOpen: true,
                            title: 'データロード確認',
                            message: 'クラウドからデータを読み込みますか？\n現在のローカルデータは上書きされます。',
                            onConfirm: async () => {
                              try {
                                const saveRef = doc(db, 'saves', user.uid);
                                const docSnap = await getDoc(saveRef);
                                if (docSnap.exists()) {
                                  const data = docSnap.data();
                                  if (data.gameState) {
                                    const parsed = JSON.parse(data.gameState);
                                    setGameState(parsed);
                                    localStorage.setItem('endlessGachaSave', data.gameState);
                                    setModalState({ isOpen: true, title: 'ロード完了', message: 'データをクラウドから読み込みました。', isAlert: true });
                                  }
                                } else {
                                  setModalState({ isOpen: true, title: 'エラー', message: 'クラウドにセーブデータが見つかりません。', isAlert: true });
                                }
                              } catch (e) {
                                setModalState({ isOpen: true, title: 'エラー', message: 'ロードに失敗しました。', isAlert: true });
                                handleFirestoreError(e, OperationType.GET, `saves/${user.uid}`);
                              }
                            }
                          });
                        }}
                        disabled={!user}
                        className="py-2 rounded-lg font-bold text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:bg-gray-700 text-white transition-colors flex flex-col items-center justify-center"
                      >
                        <CloudDownload size={18} className="mb-1" /> クラウドから読込
                      </button>
                    </div>
                  </div>
                  
                  {/* Danger Zone */}
                  <div className="bg-red-900/20 p-4 rounded-xl border border-red-900/50">
                    <h4 className="text-sm font-bold text-red-400 mb-3 uppercase tracking-wider">危険な操作</h4>
                    <button
                      onClick={() => {
                        setModalState({
                          isOpen: true,
                          title: 'データ初期化',
                          message: '本当にすべてのデータを初期化しますか？\nこの操作は取り消せません。',
                          onConfirm: () => {
                            localStorage.removeItem('endlessGachaSave');
                            window.location.reload();
                          }
                        });
                      }}
                      className="w-full py-2 rounded-lg font-bold text-sm bg-red-600 hover:bg-red-500 text-white transition-colors flex items-center justify-center"
                    >
                      <Trash2 size={16} className="mr-2" /> データをリセット
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drop Notification */}
        <AnimatePresence>
          {dropNotification && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.8 }}
              animate={{ opacity: 1, y: 20, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.8 }}
              className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
            >
              <div className="bg-gray-900/90 border border-yellow-500/50 rounded-xl p-3 shadow-2xl flex items-center gap-3 backdrop-blur-sm">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                  dropNotification.rarity === 'N' ? 'bg-gray-700 text-gray-300' :
                  dropNotification.rarity === 'R' ? 'bg-blue-900/50 text-blue-400' :
                  dropNotification.rarity === 'SR' ? 'bg-purple-900/50 text-purple-400' :
                  dropNotification.rarity === 'SSR' ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-red-900/50 text-red-400'
                }`}>
                  {dropNotification.type === 'weapon' ? '🗡️' : dropNotification.type === 'armor' ? '🛡️' : '💍'}
                </div>
                <div>
                  <div className="text-xs text-yellow-400 font-bold">装備ドロップ！</div>
                  <div className="text-sm text-white font-bold">{dropNotification.name}</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
