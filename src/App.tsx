/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sword, Sparkles, Coins, Gem, Clock, Info, Trash2, ArrowUpCircle, TrendingUp, ScrollText, Target, Crown, BookOpen, Settings, Trophy, CloudUpload, CloudDownload, LogOut, LogIn, BarChart2, X, HelpCircle, CheckCircle2, Zap, ShieldAlert, Crosshair, Map, LayoutGrid, Combine, ChevronsUp } from 'lucide-react';
import { cn, formatNumber } from './lib/utils';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
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
        "w-full h-full rounded-xl border-2 border-dashed bg-gray-900/40 flex items-center justify-center transition-all duration-300", 
        isSelected ? "border-yellow-400/80 bg-yellow-400/10 shadow-[inset_0_0_15px_rgba(250,204,21,0.2)]" : "border-gray-700/50 hover:border-gray-500/80 hover:bg-gray-800/40",
        isLeaderSlot && !isSelected && "border-yellow-500/30 bg-yellow-900/10"
      )}>
        {isLeaderSlot && <span className="text-[10px] font-bold text-yellow-500/40 font-mono tracking-widest">LEADER</span>}
      </div>
    );
    
    const def = HEROES.find(h => h.id === inst.heroId)!;
    const awakeningLevel = gameState.heroAwakenings?.[def.id] || 0;
    
    const isHighRarity = def.rarity === 'UR' || def.rarity === 'SSR';

    return (
      <div className={cn(
        "relative w-full h-full rounded-xl border-2 flex flex-col items-center justify-center shadow-lg transition-all duration-300 overflow-hidden group",
        RARITY_COLORS[def.rarity].bg,
        isSelected ? "border-yellow-400 scale-105 z-10 shadow-[0_0_20px_rgba(250,204,21,0.6)]" : RARITY_COLORS[def.rarity].border,
        !isSelected && "hover:scale-[1.02] hover:z-10 hover:shadow-xl"
      )}>
        {/* Shine effect for high rarity */}
        {isHighRarity && (
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none transform -translate-x-full group-hover:translate-x-full" />
        )}
        
        {isLeaderSlot && (
          <div className="absolute -top-2.5 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black text-[8px] font-black px-2 py-0.5 rounded-full shadow-md z-20 border border-yellow-200 font-mono tracking-wider">
            LEADER
          </div>
        )}
        {awakeningLevel > 0 && (
          <div className="absolute -top-1.5 -left-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-[9px] font-black w-5 h-5 flex items-center justify-center rounded-full border border-blue-300 shadow-md z-20 font-mono">
            +{awakeningLevel}
          </div>
        )}
        {def.passive && (
          <div className="absolute top-1 left-1 text-yellow-300 drop-shadow-md z-20" title={`${def.passive.name}: ${def.passive.description}`}>
            <Sparkles size={12} className={isHighRarity ? "animate-pulse text-yellow-200" : ""} />
          </div>
        )}
        
        <motion.span 
          className={cn("text-3xl drop-shadow-lg relative z-10", isHighRarity && "drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]")}
          animate={isHighRarity ? { y: [0, -3, 0], scale: [1, 1.05, 1] } : {}}
          transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
        >
          {def.emoji}
        </motion.span>
        
        <div className="absolute -top-1.5 -right-1.5 flex z-20 bg-black/40 rounded-full px-1 backdrop-blur-sm border border-gray-700/50">
          {Array.from({ length: inst.star }).map((_, i) => (
            <span key={i} className="text-yellow-400 text-[10px] drop-shadow-[0_0_3px_rgba(250,204,21,0.8)]">★</span>
          ))}
        </div>
        
        <div className="absolute bottom-0 w-full bg-black/70 backdrop-blur-md text-[9px] text-center font-bold tracking-wider flex justify-center gap-1.5 py-0.5 z-20 border-t border-gray-700/50">
          <span className={FACTION_COLORS[def.faction]}>{FACTION_JA[def.faction]}</span>
          <span className="text-gray-300">{CLASS_JA[def.classType]}</span>
        </div>
        
        {/* Level indicator */}
        <div className="absolute top-1 right-1 text-[8px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded shadow-sm z-20 font-mono border border-gray-700/50">
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
    <div className="w-full h-full bg-gray-950 flex justify-center overflow-hidden font-sans overscroll-none relative">
      {/* Background ambient effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-900/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-fuchsia-900/20 blur-[100px]" />
      </div>

      <div className="w-full max-w-md h-full bg-gray-950/80 text-white flex flex-col relative shadow-2xl overflow-hidden border-x border-gray-800/50">
        
        {/* Header - Glassmorphism */}
        <div className="glass-panel p-3 z-20 border-b-0 rounded-b-2xl mx-2 mt-2 shadow-lg">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="flex items-center bg-gray-900/80 px-3 py-1.5 rounded-full border border-gray-700/50 shadow-inner">
                <Coins size={14} className="mr-1.5 text-yellow-400" /> 
                <span className="text-yellow-400 font-bold text-sm font-mono tracking-tight">{formatNumber(gameState.gold)}</span>
              </div>
              <div className="flex items-center bg-gray-900/80 px-3 py-1.5 rounded-full border border-gray-700/50 shadow-inner">
                <Gem size={14} className="mr-1.5 text-cyan-400" /> 
                <span className="text-cyan-400 font-bold text-sm font-mono tracking-tight">{formatNumber(gameState.gems)}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="text-xs text-emerald-400 font-bold bg-emerald-950/50 px-2.5 py-1.5 rounded-full border border-emerald-800/50 font-mono shadow-inner flex items-center">
                <TrendingUp size={12} className="mr-1" />
                {formatNumber(dps)}
              </div>
              <button onClick={() => setIsSettingsOpen(true)} className="p-1.5 rounded-full bg-gray-800/80 hover:bg-gray-700 text-gray-300 transition-colors border border-gray-700/50">
                <Settings size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto hide-scrollbar relative flex flex-col mt-2">
          {activeTab === 'BATTLE' && (
            <div className="flex-1 flex flex-col">
              
              {/* Enemy Area */}
              <div className="flex-[0.4] min-h-[200px] flex flex-col items-center justify-center relative select-none bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 border-b border-gray-800 shrink-0 overflow-hidden" onClick={handleTapEnemy}>
                {/* Ambient glow behind enemy */}
                <div className={cn(
                  "absolute inset-0 opacity-20 blur-3xl transition-colors duration-1000",
                  isBoss ? "bg-red-500" : "bg-cyan-500"
                )} />

                <AnimatePresence>
                  {showBossWarning && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5, y: -50 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 1.5 }}
                      className="absolute inset-0 z-50 flex items-center justify-center bg-red-950/90 backdrop-blur-md pointer-events-none"
                    >
                      <div className="text-center">
                        <motion.h1 
                          animate={{ opacity: [1, 0.5, 1], scale: [1, 1.05, 1] }} 
                          transition={{ repeat: Infinity, duration: 0.5 }}
                          className="text-5xl font-black text-red-500 tracking-widest drop-shadow-[0_0_20px_rgba(255,0,0,1)] font-mono"
                        >
                          WARNING
                        </motion.h1>
                        <p className="text-red-200 font-bold text-xl mt-2 tracking-widest font-mono">BOSS APPROACHING</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
                  <div className="flex flex-col">
                    <h2 className={cn("text-2xl font-black tracking-widest uppercase font-mono text-glow", isBoss ? "text-red-500 animate-pulse" : "text-gray-300")}>
                      {isBoss ? 'BOSS' : `STAGE ${gameState.stage}`}
                    </h2>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shadow-sm", FACTION_COLORS[currentEnemyElement].replace('text-', 'bg-').replace('400', '900/50').replace('500', '900/50'), FACTION_COLORS[currentEnemyElement])}>
                        {FACTION_JA[currentEnemyElement]}
                      </span>
                      {currentEnemyTrait !== 'NONE' && (
                        <span className="text-[10px] bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/50 shadow-sm">
                          {TRAIT_JA[currentEnemyTrait]}
                        </span>
                      )}
                      {currentBossAffix !== 'NONE' && (
                        <span className="text-[10px] bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded border border-red-500/50 shadow-sm">
                          {BOSS_AFFIX_JA[currentBossAffix]}
                        </span>
                      )}
                      {elementalAdvantage > 1 && <span className="text-[10px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded border border-red-500/50 font-bold animate-pulse">WEAK</span>}
                      {elementalAdvantage < 1 && <span className="text-[10px] bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/50 font-bold">RESIST</span>}
                    </div>
                  </div>
                  {gameState.bossTimeLeft !== null && (
                    <div className="flex items-center text-red-400 font-bold bg-red-950/80 px-3 py-1.5 rounded-lg border border-red-900/50 shadow-inner font-mono text-lg">
                      <Clock size={16} className="mr-1.5 animate-pulse" />
                      {Math.ceil(gameState.bossTimeLeft)}s
                    </div>
                  )}
                </div>

                <motion.div
                  key={gameState.stage}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  whileTap={{ scale: 0.9, rotate: (Math.random() - 0.5) * 20 }}
                  className="text-[90px] cursor-pointer drop-shadow-[0_0_30px_rgba(255,255,255,0.15)] mt-6 z-10 relative"
                >
                  {enemyEmoji}
                </motion.div>

                <div className="w-3/4 max-w-xs mt-8 bg-gray-950 rounded-full h-5 border border-gray-700 overflow-hidden relative pointer-events-none shadow-inner z-10">
                  <motion.div
                    className={cn("h-full", isBoss ? "bg-gradient-to-r from-red-700 to-red-500" : "bg-gradient-to-r from-emerald-700 to-emerald-400")}
                    initial={{ width: '100%' }}
                    animate={{ width: `${hpPercent}%` }}
                    transition={{ type: "spring", bounce: 0, duration: 0.2 }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow-md tracking-widest font-mono">
                    {formatNumber(gameState.enemyHp)} / {formatNumber(gameState.enemyMaxHp)}
                  </div>
                </div>

                <AnimatePresence>
                  {damageTexts.map(dt => (
                    <motion.div
                      key={dt.id}
                      initial={{ opacity: 1, y: dt.y, x: dt.x, scale: dt.isCrit ? 2 : 1 }}
                      animate={{ opacity: 0, y: dt.y - 80, x: dt.x + (Math.random() - 0.5) * 40 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className={cn(
                        "absolute pointer-events-none font-black drop-shadow-lg font-mono z-20", 
                        dt.isCrit ? "text-yellow-400 text-3xl text-glow" : "text-white text-xl",
                        dt.hitType === 'weak' && "text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.8)]",
                        dt.hitType === 'resist' && "text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]"
                      )}
                      style={{ left: 0, top: 0 }}
                    >
                      -{formatNumber(dt.val)}
                      {dt.hitType === 'weak' && <span className="text-[10px] ml-1 align-top text-red-300">WEAK</span>}
                      {dt.hitType === 'resist' && <span className="text-[10px] ml-1 align-top text-blue-300">RESIST</span>}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Player Skills Overlay */}
                <div className="absolute bottom-4 right-4 flex gap-2 z-20">
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
                          "w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-[0_0_15px_rgba(0,0,0,0.5)] border-2 transition-all active:scale-95 relative overflow-hidden backdrop-blur-sm",
                          isOnCooldown 
                            ? "bg-gray-900/80 border-gray-700 opacity-60 cursor-not-allowed grayscale" 
                            : "bg-gradient-to-br from-blue-600/90 to-indigo-800/90 border-blue-400/50 hover:border-blue-300 hover:shadow-[0_0_20px_rgba(59,130,246,0.6)]"
                        )}
                      >
                        <span className={cn(!isOnCooldown && "drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]")}>
                          {skill.id === 'meteor' ? '☄️' : skill.id === 'freeze' ? '❄️' : '💰'}
                        </span>
                        {isOnCooldown && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-bold text-sm font-mono backdrop-blur-[2px]">
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
                <div className="flex flex-col mb-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-400 tracking-widest font-mono">編成 (FORMATION)</span>
                    <div className="flex space-x-1.5">
                      <button 
                        onClick={handleAutoMergeHeroes}
                        className="text-[10px] flex items-center bg-purple-950/80 px-2 py-1 rounded-md text-purple-300 hover:bg-purple-900 transition-colors border border-purple-800/50 shadow-sm font-bold"
                        title="一括合成"
                      >
                        <Combine size={12} className="mr-1" /> 合成
                      </button>
                      <button 
                        onClick={handleAutoLevelUpHeroes}
                        className="text-[10px] flex items-center bg-orange-950/80 px-2 py-1 rounded-md text-orange-300 hover:bg-orange-900 transition-colors border border-orange-800/50 shadow-sm font-bold"
                        title="一括強化"
                      >
                        <ChevronsUp size={12} className="mr-1" /> 強化
                      </button>
                      <button 
                        onClick={() => setShowStats(true)}
                        className="text-[10px] flex items-center bg-blue-950/80 px-2 py-1 rounded-md text-blue-300 hover:bg-blue-900 transition-colors border border-blue-800/50 shadow-sm font-bold"
                      >
                        <BarChart2 size={12} className="mr-1" /> 詳細
                      </button>
                      <button 
                        onClick={() => setShowSynergies(!showSynergies)}
                        className="text-[10px] flex items-center bg-gray-800/80 px-2 py-1 rounded-md text-gray-300 hover:bg-gray-700 transition-colors border border-gray-700/50 shadow-sm font-bold"
                      >
                        <Info size={12} className="mr-1" /> シナジー
                      </button>
                    </div>
                  </div>

                  <div className="flex space-x-2 mt-3 pt-3 border-t border-gray-800/50 min-h-[44px]">
                    {(() => {
                      if (!selected) {
                        return (
                          <div className="flex-1 flex items-center justify-center text-xs text-gray-600 italic font-mono bg-gray-900/30 rounded-lg border border-gray-800/30">
                            ヒーローを選択してアクションを実行
                          </div>
                        );
                      }
                      const inst = selected.type === 'board' ? gameState.board[selected.index] : gameState.bench[selected.index];
                      if (!inst) {
                        return (
                          <div className="flex-1 flex items-center justify-center text-xs text-gray-600 italic font-mono bg-gray-900/30 rounded-lg border border-gray-800/30">
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
                            className="flex-1 text-xs flex items-center justify-center bg-yellow-950/80 px-2 py-1.5 rounded-lg text-yellow-300 hover:bg-yellow-900 transition-colors border border-yellow-700/50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                          >
                            <ArrowUpCircle size={14} className="mr-1.5" /> 強化 <span className="ml-1 font-mono text-[10px] opacity-80">({formatNumber(cost)}G)</span>
                          </button>
                          <button 
                            onClick={() => setIsEquipmentModalOpen(true)}
                            className="flex-1 text-xs flex items-center justify-center bg-emerald-950/80 px-2 py-1.5 rounded-lg text-emerald-300 hover:bg-emerald-900 transition-colors border border-emerald-700/50 shadow-sm font-bold"
                          >
                            <ShieldAlert size={14} className="mr-1.5" /> 装備
                          </button>
                          <button 
                            onClick={handleSell}
                            className="flex-1 text-xs flex items-center justify-center bg-red-950/80 px-2 py-1.5 rounded-lg text-red-300 hover:bg-red-900 transition-colors border border-red-700/50 shadow-sm font-bold"
                          >
                            <Trash2 size={14} className="mr-1.5" /> 売却
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
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto hide-scrollbar">
              <div className="w-full max-w-sm mb-4 flex justify-end">
                <label className="flex items-center space-x-2 cursor-pointer bg-gray-900/80 px-3 py-2 rounded-xl border border-gray-700/50 shadow-sm backdrop-blur-sm">
                  <input
                    type="checkbox"
                    checked={gameState.autoSellN || false}
                    onChange={(e) => setGameState(prev => ({ ...prev, autoSellN: e.target.checked }))}
                    className="form-checkbox h-4 w-4 text-blue-500 rounded border-gray-600 bg-gray-800 focus:ring-blue-500 focus:ring-offset-gray-900 transition-colors"
                  />
                  <span className="text-xs font-bold text-gray-300 font-mono">Nレア自動売却</span>
                </label>
              </div>

              <div className="w-full max-w-sm glass-panel rounded-3xl p-6 border border-gray-700/50 shadow-xl text-center relative overflow-hidden mb-6 shrink-0">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-800/50 to-gray-900/50 pointer-events-none" />
                <h2 className="text-2xl font-black text-gray-200 mb-1 relative z-10 font-mono tracking-wider">ノーマルガチャ</h2>
                <p className="text-gray-400 text-[10px] mb-6 relative z-10 font-bold tracking-widest">N 〜 SR のヒーローを召喚</p>
                <div className="flex gap-3 relative z-10">
                  <button
                    onClick={() => pullGacha('normal', 1)}
                    disabled={gameState.gold < 100}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center border border-gray-600/50 shadow-md"
                  >
                    1回 <Coins size={16} className="ml-2 mr-1 text-yellow-400" /> <span className="font-mono">100</span>
                  </button>
                  <button
                    onClick={() => pullGacha('normal', 10)}
                    disabled={gameState.gold < 1000}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-sm bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center border border-gray-600/50 shadow-md"
                  >
                    10回 <Coins size={16} className="ml-2 mr-1 text-yellow-400" /> <span className="font-mono">1000</span>
                  </button>
                </div>
              </div>

              <div className="w-full max-w-sm bg-gradient-to-b from-indigo-950 to-purple-950 rounded-3xl p-6 border border-purple-500/30 shadow-[0_0_40px_rgba(168,85,247,0.15)] text-center relative overflow-hidden shrink-0">
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none mix-blend-overlay"></div>
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
                
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-100 to-yellow-300 mb-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] relative z-10 font-mono tracking-wider">
                  プレミアムガチャ
                </h2>
                <p className="text-purple-300 text-[10px] mb-4 font-bold tracking-widest relative z-10">R 〜 UR のヒーローを召喚</p>
                
                {/* Pity System UI */}
                <div className="mb-6 bg-black/50 rounded-xl p-3 border border-purple-500/30 backdrop-blur-sm relative z-10 shadow-inner">
                  <div className="flex justify-between text-[10px] text-purple-200 font-bold mb-2 font-mono">
                    <span>SSR確定まで</span>
                    <span className="text-yellow-400">{30 - gameState.pityCounter} 回</span>
                  </div>
                  <div className="w-full bg-gray-900 rounded-full h-2 shadow-inner overflow-hidden">
                    <motion.div 
                      className="bg-gradient-to-r from-purple-600 via-fuchsia-500 to-yellow-400 h-full rounded-full relative" 
                      initial={{ width: 0 }}
                      animate={{ width: `${(gameState.pityCounter / 30) * 100}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    >
                      <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }} />
                    </motion.div>
                  </div>
                </div>

                <div className="flex gap-3 relative z-10">
                  <button
                    onClick={() => pullGacha('premium', 1)}
                    disabled={gameState.gems < 300}
                    className="flex-1 py-4 rounded-2xl font-bold text-md bg-gradient-to-b from-yellow-400 to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 disabled:opacity-50 text-yellow-950 transition-all active:scale-95 flex items-center justify-center shadow-[0_4px_15px_rgba(234,179,8,0.3)] border border-yellow-300/50"
                  >
                    1回 <Gem size={18} className="ml-2 mr-1 text-cyan-100 drop-shadow-md" /> <span className="font-mono text-lg">300</span>
                  </button>
                  <button
                    onClick={() => pullGacha('premium', 10)}
                    disabled={gameState.gems < 3000}
                    className="flex-1 py-4 rounded-2xl font-bold text-md bg-gradient-to-b from-yellow-400 to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 disabled:opacity-50 text-yellow-950 transition-all active:scale-95 flex items-center justify-center shadow-[0_4px_15px_rgba(234,179,8,0.3)] border border-yellow-300/50"
                  >
                    10回 <Gem size={18} className="ml-2 mr-1 text-cyan-100 drop-shadow-md" /> <span className="font-mono text-lg">3000</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'UPGRADES' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto hide-scrollbar">
              <div className="w-full max-w-sm glass-panel rounded-2xl p-5 border border-gray-700/50 shadow-xl shrink-0 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />
                <div className="flex justify-between items-center mb-3 relative z-10">
                  <h3 className="text-lg font-black text-white flex items-center tracking-wider">
                    <Sword size={20} className="mr-2 text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.8)]" /> タップダメージ
                  </h3>
                  <span className="text-xs bg-gray-900/80 px-2.5 py-1 rounded-md text-gray-300 font-mono border border-gray-700/50 shadow-inner">Lv {gameState.upgrades?.tapDamage || 1}</span>
                </div>
                <p className="text-xs text-gray-400 mb-5 relative z-10 font-medium">敵をタップした際のダメージ倍率を増加させます。</p>
                <div className="flex justify-between items-center relative z-10 bg-gray-900/40 p-3 rounded-xl border border-gray-800/50">
                  <span className="text-lg font-black text-red-400 font-mono drop-shadow-sm">x{(gameState.upgrades?.tapDamage || 1).toFixed(1)} <span className="text-xs text-red-500/70 font-sans">倍</span></span>
                  <button
                    onClick={() => handleUpgrade('tapDamage')}
                    disabled={gameState.gold < getUpgradeCost('tapDamage', gameState.upgrades?.tapDamage || 1)}
                    className="py-2.5 px-5 rounded-xl font-bold text-sm bg-gradient-to-b from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 disabled:opacity-50 transition-all active:scale-95 flex items-center border border-gray-600 shadow-md text-white"
                  >
                    強化 <Coins size={16} className="ml-2 mr-1.5 text-yellow-400" /> <span className="font-mono">{formatNumber(getUpgradeCost('tapDamage', gameState.upgrades?.tapDamage || 1))}</span>
                  </button>
                </div>
              </div>

              <div className="w-full max-w-sm glass-panel rounded-2xl p-5 border border-gray-700/50 shadow-xl shrink-0 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />
                <div className="flex justify-between items-center mb-3 relative z-10">
                  <h3 className="text-lg font-black text-white flex items-center tracking-wider">
                    <TrendingUp size={20} className="mr-2 text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" /> ヒーローDPS
                  </h3>
                  <span className="text-xs bg-gray-900/80 px-2.5 py-1 rounded-md text-gray-300 font-mono border border-gray-700/50 shadow-inner">Lv {gameState.upgrades?.heroDps || 1}</span>
                </div>
                <p className="text-xs text-gray-400 mb-5 relative z-10 font-medium">配置している全ヒーローのDPS倍率を増加させます。</p>
                <div className="flex justify-between items-center relative z-10 bg-gray-900/40 p-3 rounded-xl border border-gray-800/50">
                  <span className="text-lg font-black text-emerald-400 font-mono drop-shadow-sm">x{(gameState.upgrades?.heroDps || 1).toFixed(1)} <span className="text-xs text-emerald-500/70 font-sans">倍</span></span>
                  <button
                    onClick={() => handleUpgrade('heroDps')}
                    disabled={gameState.gold < getUpgradeCost('heroDps', gameState.upgrades?.heroDps || 1)}
                    className="py-2.5 px-5 rounded-xl font-bold text-sm bg-gradient-to-b from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 disabled:opacity-50 transition-all active:scale-95 flex items-center border border-gray-600 shadow-md text-white"
                  >
                    強化 <Coins size={16} className="ml-2 mr-1.5 text-yellow-400" /> <span className="font-mono">{formatNumber(getUpgradeCost('heroDps', gameState.upgrades?.heroDps || 1))}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'TACTICS' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-6 overflow-y-auto hide-scrollbar">
              <h2 className="text-2xl font-black text-white mb-2 w-full max-w-sm text-left flex items-center drop-shadow-md shrink-0 tracking-widest font-mono">
                <BookOpen size={24} className="mr-2 text-blue-400" /> 戦術
              </h2>

              {/* Formations */}
              <div className="w-full max-w-sm glass-panel rounded-2xl p-5 border border-gray-700/50 shrink-0 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />
                <h3 className="text-lg font-black text-white mb-4 flex items-center tracking-widest relative z-10">
                  <Crosshair size={20} className="mr-2 text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" /> 陣形
                </h3>
                <div className="space-y-3 relative z-10">
                  {FORMATIONS.map(formation => {
                    const level = gameState.formations?.[formation.id] || 0;
                    const isActive = gameState.activeFormationId === formation.id;
                    const unlockCost = 500; // Gems
                    
                    return (
                      <div key={formation.id} className={cn(
                        "p-4 rounded-xl border transition-all duration-300",
                        isActive ? "bg-cyan-950/40 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.15)]" : "bg-gray-900/50 border-gray-700/50 hover:bg-gray-800/50"
                      )}>
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className={cn("font-black tracking-wider", isActive ? "text-cyan-300" : "text-gray-200")}>{formation.name}</h4>
                            <p className="text-xs text-gray-400 mt-1 font-medium">{formation.description}</p>
                          </div>
                          {level > 0 ? (
                            <button
                              onClick={() => setGameState(prev => ({ ...prev, activeFormationId: isActive ? null : formation.id }))}
                              className={cn(
                                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 shadow-md active:scale-95",
                                isActive ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400/50" : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600"
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
                              className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center shadow-md active:scale-95 transition-all border border-blue-400/30"
                            >
                              <Gem size={14} className="mr-1.5 text-blue-200" /> <span className="font-mono">{unlockCost}</span>
                            </button>
                          )}
                        </div>
                        {level > 0 && (
                          <div className="grid grid-cols-3 gap-1.5 mt-3 w-24 mx-auto bg-gray-950/50 p-2 rounded-lg border border-gray-800/50">
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(idx => (
                              <div key={idx} className={cn(
                                "w-5 h-5 rounded-sm border transition-colors",
                                formation.positions.includes(idx) ? "bg-cyan-400/80 border-cyan-300 shadow-[0_0_5px_rgba(34,211,238,0.5)]" : "bg-gray-800/50 border-gray-700/50"
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
              <div className="w-full max-w-sm glass-panel rounded-2xl p-5 border border-gray-700/50 shrink-0 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />
                <h3 className="text-lg font-black text-white mb-4 flex items-center tracking-widest relative z-10">
                  <Zap size={20} className="mr-2 text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]" /> プレイヤースキル
                </h3>
                <div className="space-y-4 relative z-10">
                  {PLAYER_SKILLS.map(skill => {
                    const level = gameState.activeSkills?.[skill.id] || 0;
                    const cost = Math.floor(skill.baseCost * Math.pow(skill.costMultiplier, level));
                    const isMax = level >= skill.maxLevel;

                    return (
                      <div key={skill.id} className="bg-gray-900/50 p-4 rounded-xl border border-gray-700/50 hover:bg-gray-800/50 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-black text-gray-100 flex items-center tracking-wider">
                              {skill.name} <span className="ml-2 text-[10px] bg-gray-800 px-2 py-0.5 rounded-md text-gray-300 font-mono border border-gray-700">Lv.{level}</span>
                            </h4>
                            <p className="text-xs text-gray-400 mt-1.5 font-medium">{skill.description}</p>
                            <p className="text-[10px] text-gray-500 mt-1.5 font-mono bg-gray-950/50 inline-block px-2 py-0.5 rounded border border-gray-800">CD: {skill.cooldown}s</p>
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
                          className="w-full mt-2 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center transition-all active:scale-95 shadow-md border border-blue-400/30"
                        >
                          {isMax ? 'MAX LEVEL' : <><Gem size={16} className="mr-1.5 text-blue-200" /> <span className="font-mono">{formatNumber(cost)}</span> <span className="ml-1 text-xs font-normal">で強化</span></>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'MISSIONS' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto hide-scrollbar">
              <h2 className="text-2xl font-black text-white mb-2 w-full max-w-sm text-left flex items-center drop-shadow-md shrink-0 tracking-widest font-mono">
                <Target size={24} className="mr-2 text-blue-400" /> ミッション
              </h2>

              <div className="w-full max-w-sm flex bg-gray-900/80 rounded-xl p-1.5 mb-2 shrink-0 border border-gray-700/50 shadow-inner">
                <button 
                  onClick={() => setMissionTab('DAILY')}
                  className={cn("flex-1 py-2.5 text-sm font-black rounded-lg transition-all duration-300 tracking-wider", missionTab === 'DAILY' ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50")}
                >
                  デイリー
                </button>
                <button 
                  onClick={() => setMissionTab('ACHIEVEMENT')}
                  className={cn("flex-1 py-2.5 text-sm font-black rounded-lg transition-all duration-300 tracking-wider", missionTab === 'ACHIEVEMENT' ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50")}
                >
                  実績
                </button>
              </div>

              {missionTab === 'DAILY' ? (
                <div className="w-full max-w-sm space-y-3.5">
                  {gameState.missions.map(mission => {
                    const isComplete = mission.progress >= mission.target;
                    return (
                      <div key={mission.id} className={cn(
                        "w-full rounded-2xl p-4 border shadow-lg relative overflow-hidden transition-all duration-300",
                        mission.claimed ? "bg-gray-900/50 border-gray-800/50 opacity-60" : "glass-panel border-gray-700/50 hover:border-gray-600/50"
                      )}>
                        <div className="flex justify-between items-start mb-3 relative z-10 gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              {mission.isDaily && <span className="text-[10px] bg-blue-950 text-blue-300 px-2 py-0.5 rounded-md font-black border border-blue-800/50 tracking-wider shadow-inner">デイリー</span>}
                              <h3 className={cn("font-black text-sm break-words tracking-wide", mission.claimed ? "text-gray-500" : "text-gray-100")}>{mission.title}</h3>
                            </div>
                            <p className="text-sm text-gray-300 mt-1 flex items-center font-medium">
                              報酬: <Gem size={14} className="inline text-cyan-400 mx-1.5 flex-shrink-0" /> <span className="text-cyan-400 font-bold font-mono">{mission.rewardGems}</span>
                            </p>
                          </div>
                          <button
                            onClick={() => claimMission(mission.id)}
                            disabled={!isComplete || mission.claimed}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 whitespace-nowrap flex-shrink-0 shadow-md active:scale-95 tracking-wider",
                              mission.claimed ? "bg-gray-800/50 text-gray-500 border border-gray-700/50 shadow-none" :
                              isComplete ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:from-blue-400 hover:to-cyan-400 shadow-[0_0_15px_rgba(56,189,248,0.4)] animate-pulse border border-cyan-400/50" :
                              "bg-gray-800 text-gray-400 border border-gray-700"
                            )}
                          >
                            {mission.claimed ? '受取済' : isComplete ? '受取可能' : '未達成'}
                          </button>
                        </div>
                        {!mission.claimed && (
                          <div className="w-full bg-gray-950 rounded-full h-2.5 mt-3 relative z-10 border border-gray-800/50 overflow-hidden shadow-inner">
                            <div 
                              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-500" 
                              style={{ width: `${Math.min(100, (mission.progress / mission.target) * 100)}%` }}
                            />
                          </div>
                        )}
                        <div className="absolute bottom-1.5 right-4 text-[10px] text-gray-400 font-mono z-10 font-bold tracking-wider">
                          {formatNumber(Math.min(mission.progress, mission.target))} / {formatNumber(mission.target)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="w-full max-w-sm space-y-3.5">
                  {ACHIEVEMENTS.map(ach => {
                    const isCompleted = gameState.achievements?.[ach.id];
                    return (
                      <div key={ach.id} className={cn(
                        "glass-panel p-4 rounded-2xl border flex items-center justify-between transition-all duration-300",
                        isCompleted ? "border-emerald-500/30 bg-emerald-950/10 opacity-80" : "border-gray-700/50 hover:border-gray-600/50"
                      )}>
                        <div className="flex-1 pr-4">
                          <h3 className={cn("font-black text-sm tracking-wide mb-1", isCompleted ? "text-emerald-400" : "text-gray-100")}>{ach.title}</h3>
                          <p className="text-xs text-gray-400 font-medium leading-relaxed">{ach.description}</p>
                          <p className="text-sm text-gray-300 mt-2 flex items-center font-medium">
                            報酬: <Gem size={14} className="inline text-cyan-400 mx-1.5" /> <span className="text-cyan-400 font-bold font-mono">{ach.rewardGems}</span>
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          {isCompleted ? (
                            <div className="bg-emerald-950/50 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-black border border-emerald-500/30 flex items-center shadow-inner tracking-wider">
                              <CheckCircle2 size={16} className="mr-1.5" /> 達成済
                            </div>
                          ) : (
                            <div className="bg-gray-800/80 text-gray-500 px-3 py-1.5 rounded-xl text-xs font-black border border-gray-700/50 tracking-wider">
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
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto hide-scrollbar">
              <div className="w-full max-w-sm bg-gradient-to-br from-cyan-950/80 to-blue-950/80 rounded-2xl p-6 border border-cyan-500/30 shadow-[0_4px_20px_rgba(6,182,212,0.15)] text-center relative overflow-hidden shrink-0 mb-4 backdrop-blur-sm">
                <div className="absolute top-0 left-0 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl -ml-10 -mt-10 pointer-events-none"></div>
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mb-10 pointer-events-none"></div>
                
                <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 mb-2 drop-shadow-sm tracking-widest relative z-10">
                  転生 <span className="text-sm font-normal text-cyan-400/80 ml-1">(PRESTIGE)</span>
                </h2>
                <p className="text-gray-300 text-xs mb-6 font-medium relative z-10">進行度をリセットし、永続的な力を得ます。</p>
                
                <div className="bg-gray-950/80 rounded-xl p-5 mb-6 border border-gray-800/50 shadow-inner relative z-10">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-400 text-sm font-bold tracking-wider">現在のDPS倍率:</span>
                    <span className="text-cyan-400 font-black text-lg font-mono drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">x{((gameState.prestigeMultiplier || 1)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-400 text-sm font-bold tracking-wider">所持転生ポイント:</span>
                    <span className="text-yellow-400 font-black text-lg font-mono drop-shadow-[0_0_5px_rgba(250,204,21,0.5)] flex items-center"><Crown size={16} className="mr-1.5" /> {gameState.prestigePoints || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm font-bold tracking-wider">転生回数:</span>
                    <span className="text-purple-400 font-black text-lg font-mono drop-shadow-[0_0_5px_rgba(192,132,252,0.5)]">{gameState.prestigeCount || 0}</span>
                  </div>
                </div>

                <div className="glass-panel rounded-xl p-5 mb-6 border border-gray-700/50 relative z-10 text-left">
                  <h3 className="text-white font-black mb-3 flex items-center tracking-widest text-sm"><ArrowUpCircle size={16} className="mr-1.5 text-cyan-400" /> 次回の転生報酬</h3>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-300 text-sm font-bold">獲得ポイント:</span>
                    <span className="text-yellow-400 font-black text-xl font-mono flex items-center drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]">+{Math.floor(gameState.stage / 10)} <Crown size={16} className="ml-1.5" /></span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium leading-relaxed bg-gray-900/50 p-2 rounded-lg border border-gray-800/50">10ステージクリアごとに1ポイント獲得。1ポイントにつき全体のDPSが+10%されます。※ステージ、ゴールド、ヒーローレベルがリセットされます。</p>
                </div>

                <button
                  onClick={handlePrestige}
                  disabled={Math.floor(gameState.stage / 10) <= 0}
                  className={cn(
                    "w-full py-4 rounded-xl font-black text-lg transition-all duration-300 flex items-center justify-center shadow-lg tracking-widest relative z-10",
                    Math.floor(gameState.stage / 10) > 0
                      ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 active:scale-95 shadow-[0_0_20px_rgba(6,182,212,0.5)] animate-pulse border border-cyan-400/50" 
                      : "bg-gray-800/80 text-gray-500 border border-gray-700/50 shadow-none"
                  )}
                >
                  <ArrowUpCircle size={20} className="mr-2" /> {Math.floor(gameState.stage / 10) > 0 ? '転生する' : 'ステージ10で解放'}
                </button>
              </div>

              <div className="w-full max-w-sm shrink-0">
                <h3 className="text-xl font-black text-white mb-4 flex items-center tracking-widest drop-shadow-md font-mono">
                  <Sparkles size={20} className="mr-2 text-yellow-400" /> タレントツリー
                </h3>
                <div className="space-y-3.5">
                  {TALENTS.map(talent => {
                    const currentLevel = gameState.talents?.[talent.id] || 0;
                    const isMax = currentLevel >= talent.maxLevel;
                    const cost = Math.floor(talent.baseCost * Math.pow(talent.costMultiplier, currentLevel));
                    const canAfford = (gameState.prestigePoints || 0) >= cost;

                    return (
                      <div key={talent.id} className="glass-panel p-4 rounded-2xl border border-gray-700/50 shadow-lg hover:border-gray-600/50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-black text-gray-100 tracking-wider flex items-center">{talent.name} <span className="text-[10px] bg-gray-900/80 px-2 py-0.5 rounded-md text-gray-400 ml-2 font-mono border border-gray-700/50 shadow-inner">Lv.{currentLevel}/{talent.maxLevel}</span></h4>
                            <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{talent.description}</p>
                            {currentLevel > 0 && (
                              <p className="text-[10px] text-cyan-400 mt-1.5 font-bold bg-cyan-950/30 inline-block px-2 py-0.5 rounded border border-cyan-900/50">現在の効果: +{Math.round(currentLevel * talent.effectPerLevel * 100)}%</p>
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
                              "px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap ml-2 transition-all duration-300 shadow-md active:scale-95 tracking-wider flex-shrink-0",
                              isMax ? "bg-gray-800/80 text-gray-500 border border-gray-700/50 shadow-none" :
                              canAfford ? "bg-gradient-to-r from-yellow-600 to-amber-600 text-white hover:from-yellow-500 hover:to-amber-500 border border-yellow-500/50 shadow-[0_0_10px_rgba(250,204,21,0.3)]" : "bg-gray-800 text-gray-400 border border-gray-700"
                            )}
                          >
                            {isMax ? 'MAX' : <span className="font-mono">{cost} pt</span>}
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
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto hide-scrollbar">
              <div className="w-full max-w-sm flex justify-between items-center mb-2 shrink-0">
                <h2 className="text-2xl font-black text-white flex items-center drop-shadow-md tracking-widest font-mono">
                  <Crown size={24} className="mr-2 text-purple-400" /> 遺物 <span className="text-[10px] text-purple-400/80 ml-2 font-normal">(ARTIFACTS)</span>
                </h2>
                <div className="flex gap-2">
                  <div className="text-purple-300 font-bold bg-gray-900/80 px-3 py-1.5 rounded-xl border border-gray-700/50 flex items-center text-xs shadow-inner font-mono">
                    <Sparkles size={14} className="mr-1.5 text-purple-400" /> {gameState.artifactShards || 0}
                  </div>
                  <div className="text-yellow-400 font-bold bg-gray-900/80 px-3 py-1.5 rounded-xl border border-gray-700/50 flex items-center text-xs shadow-inner font-mono">
                    <Crown size={14} className="mr-1.5 text-yellow-500" /> {gameState.prestigePoints || 0}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 w-full max-w-sm mb-2 shrink-0 font-bold tracking-widest text-center">転生ポイントや遺物の欠片を消費して強力な遺物を獲得・強化します。</p>
              
              <div className="w-full max-w-sm bg-gradient-to-br from-purple-950/80 to-indigo-950/80 rounded-2xl p-5 border border-purple-500/30 shadow-[0_4px_20px_rgba(168,85,247,0.15)] mb-4 relative overflow-hidden shrink-0 backdrop-blur-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                <h3 className="font-black text-white mb-2 flex items-center tracking-widest relative z-10"><Sparkles size={18} className="mr-2 text-purple-400 drop-shadow-[0_0_5px_rgba(192,132,252,0.8)]" /> 遺物ガチャ</h3>
                <p className="text-xs text-purple-200/70 mb-5 relative z-10 font-medium">遺物の欠片を10個消費して、ランダムな遺物を1レベル強化します。</p>
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
                    "w-full py-3.5 rounded-xl font-black text-sm transition-all duration-300 flex items-center justify-center shadow-lg relative z-10 tracking-wider",
                    (gameState.artifactShards || 0) >= 10 && !ARTIFACTS.every(a => (gameState.artifacts?.[a.id] || 0) >= a.maxLevel)
                      ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 active:scale-95 shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-purple-400/50"
                      : "bg-gray-800/80 text-gray-500 border border-gray-700/50 shadow-none"
                  )}
                >
                  {ARTIFACTS.every(a => (gameState.artifacts?.[a.id] || 0) >= a.maxLevel) ? (
                    "全て最大レベル"
                  ) : (
                    <>
                      <Sparkles size={18} className="mr-2 text-purple-200" />
                      ガチャを引く <span className="text-[10px] font-normal ml-2 bg-purple-950/50 px-2 py-0.5 rounded border border-purple-800/50">(欠片 10)</span>
                    </>
                  )}
                </button>
              </div>

              {ARTIFACTS.map(artifact => {
                const currentLevel = gameState.artifacts?.[artifact.id] || 0;
                const isMax = currentLevel >= artifact.maxLevel;
                const cost = artifact.baseCost * Math.pow(2, currentLevel);
                
                return (
                  <div key={artifact.id} className="w-full max-w-sm glass-panel rounded-2xl p-5 border border-gray-700/50 shadow-xl shrink-0 hover:border-gray-600/50 transition-colors">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="font-black text-purple-300 tracking-wider flex items-center">{artifact.name} <span className="text-[10px] bg-gray-900/80 px-2 py-0.5 rounded-md text-gray-400 ml-2 font-mono border border-gray-700/50 shadow-inner">Lv.{currentLevel}/{artifact.maxLevel}</span></h3>
                        <p className="text-xs text-gray-400 mt-1.5 font-medium">{artifact.description}</p>
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
                          "px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 flex items-center shadow-md active:scale-95 tracking-wider",
                          isMax ? "bg-gray-800/80 text-gray-500 border border-gray-700/50 shadow-none" :
                          (gameState.prestigePoints || 0) >= cost ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 border border-purple-400/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]" :
                          "bg-gray-800 text-gray-400 border border-gray-700"
                        )}
                      >
                        {isMax ? 'MAX' : <>強化 <ArrowUpCircle size={14} className="ml-1.5 mr-1 text-yellow-400" /> <span className="font-mono">{cost}</span></>}
                      </button>
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono bg-gray-900/50 p-2 rounded-lg border border-gray-800/50 inline-block">
                      効果: <span className="text-purple-400 font-bold">{artifact.id === 'boss_sla' ? `ボスHP -${currentLevel * 5}%` : artifact.id === 'gold_rin' ? `ゴールド +${currentLevel * 20}%` : `DPS +${currentLevel * 10}%`}</span>

                      {!isMax && <span className="text-purple-400 ml-2">→ 次: {artifact.id === 'boss_sla' ? `-${(currentLevel + 1) * 5}%` : artifact.id === 'gold_rin' ? `+${(currentLevel + 1) * 20}%` : `+${(currentLevel + 1) * 10}%`}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'EXPEDITIONS' && (
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto hide-scrollbar">
              <div className="w-full max-w-sm flex justify-between items-center mb-2 shrink-0">
                <h2 className="text-2xl font-black text-white flex items-center drop-shadow-md tracking-widest font-mono">
                  <Map size={24} className="mr-2 text-orange-400" /> 派遣 <span className="text-[10px] text-orange-400/80 ml-2 font-normal">(EXPEDITIONS)</span>
                </h2>
                <div className="flex space-x-2">
                  <button
                    onClick={handleClaimAllExpeditions}
                    className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white text-xs font-black rounded-xl transition-all duration-300 shadow-md active:scale-95 border border-emerald-500/50 tracking-wider"
                  >
                    一括受取
                  </button>
                  <button
                    onClick={handleAutoDispatchExpeditions}
                    className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black rounded-xl transition-all duration-300 shadow-md active:scale-95 border border-blue-500/50 tracking-wider"
                  >
                    自動派遣
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 w-full max-w-sm mb-2 shrink-0 font-bold tracking-widest text-center">ヒーローを派遣して報酬を獲得しましょう。派遣中も戦闘に参加できます。</p>

              <div className="w-full max-w-sm space-y-3.5 shrink-0">
                {EXPEDITIONS.map(exp => {
                  const activeExp = gameState.activeExpeditions?.find(e => e.expeditionId === exp.id);
                  const isCompleted = activeExp && (now >= activeExp.startTime + exp.durationMinutes * 60 * 1000);
                  const timeLeft = activeExp ? Math.max(0, activeExp.startTime + exp.durationMinutes * 60 * 1000 - now) : 0;
                  const progress = activeExp ? Math.min(100, ((now - activeExp.startTime) / (exp.durationMinutes * 60 * 1000)) * 100) : 0;

                  return (
                    <div key={exp.id} className={cn(
                      "glass-panel p-4 rounded-2xl border shadow-lg transition-all duration-300",
                      isCompleted ? "border-emerald-500/30 bg-emerald-950/10" : activeExp ? "border-orange-500/30 bg-orange-950/10" : "border-gray-700/50 hover:border-gray-600/50"
                    )}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-black text-gray-100 tracking-wider">{exp.name}</h3>
                          <p className="text-[10px] text-gray-400 mt-1 font-medium">{exp.description}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-black text-yellow-400 flex items-center justify-end bg-gray-900/80 px-2 py-1 rounded-lg border border-gray-700/50 shadow-inner">
                            {exp.rewardType === 'gold' && <Coins size={12} className="mr-1.5 text-yellow-500" />}
                            {exp.rewardType === 'gems' && <Gem size={12} className="mr-1.5 text-cyan-400" />}
                            {exp.rewardType === 'artifactShards' && <Crown size={12} className="mr-1.5 text-purple-400" />}
                            <span className="font-mono">{formatNumber(exp.baseReward)}</span>
                          </div>
                          <div className="text-[10px] text-gray-500 flex items-center justify-end mt-1.5 font-mono font-bold">
                            <Clock size={10} className="mr-1" /> {exp.durationMinutes}分
                          </div>
                        </div>
                      </div>

                      {activeExp ? (
                        <div className="mt-4">
                          <div className="flex justify-between text-[10px] mb-1.5 font-bold tracking-wider">
                            <span className="text-gray-400 flex items-center"><User size={10} className="mr-1" /> 派遣中: <span className="text-gray-200 ml-1">{HEROES.find(h => h.id === activeExp.heroId)?.name}</span></span>
                            <span className={cn("font-mono", isCompleted ? "text-emerald-400 animate-pulse" : "text-orange-400")}>
                              {isCompleted ? '完了！' : `${Math.ceil(timeLeft / 1000 / 60)}分 ${Math.ceil((timeLeft / 1000) % 60)}秒`}
                            </span>
                          </div>
                          <div className="w-full bg-gray-950 rounded-full h-2.5 overflow-hidden border border-gray-800/50 shadow-inner">
                            <div 
                              className={cn("h-full transition-all duration-1000 rounded-full", isCompleted ? "bg-gradient-to-r from-emerald-500 to-green-400" : "bg-gradient-to-r from-orange-500 to-amber-400")}
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
                              className="w-full mt-3 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black rounded-xl text-sm transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.4)] active:scale-95 border border-emerald-400/50 tracking-wider"
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
                          className="w-full mt-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-black rounded-xl text-sm transition-all duration-300 border border-gray-700/50 shadow-md active:scale-95 tracking-wider"
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
            <div className="flex-1 flex flex-col items-center p-4 space-y-4 overflow-y-auto hide-scrollbar">
              <div className="w-full max-w-sm flex justify-between items-center mb-2 shrink-0">
                <h2 className="text-2xl font-black text-white flex items-center drop-shadow-md font-mono tracking-wider">
                  <BookOpen size={24} className="mr-2 text-orange-400" /> 図鑑
                </h2>
                <div className="text-gray-300 text-sm font-bold bg-gray-900/80 px-3 py-1.5 rounded-xl border border-gray-700/50 shadow-inner font-mono">
                  <span className="text-orange-400">{gameState.unlockedHeroes.length}</span> / {HEROES.length}
                </div>
              </div>
              
              {/* Collection Bonus Summary */}
              <div className="w-full max-w-sm bg-gradient-to-br from-orange-950/80 to-yellow-950/80 border border-orange-500/30 rounded-2xl p-4 shrink-0 shadow-[0_4px_20px_rgba(249,115,22,0.15)] relative overflow-hidden backdrop-blur-sm">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10" />
                <h3 className="text-sm font-black text-orange-300 mb-2 flex items-center tracking-widest relative z-10">
                  <Sparkles size={16} className="mr-1.5" /> 図鑑ボーナス <span className="text-[10px] text-orange-400/80 ml-2 font-normal">(全体DPS上昇)</span>
                </h3>
                <div className="flex justify-between text-xs text-gray-300 relative z-10 font-medium">
                  <span>解放ボーナス ({gameState.unlockedHeroes.length}体):</span>
                  <span className="text-white font-bold font-mono">+{gameState.unlockedHeroes.length}%</span>
                </div>
                <div className="flex justify-between text-xs text-gray-300 mt-1.5 relative z-10 font-medium">
                  <span>覚醒ボーナス (計{Object.values(gameState.heroAwakenings || {}).reduce((a, b) => a + b, 0)}覚醒):</span>
                  <span className="text-white font-bold font-mono">+{Object.values(gameState.heroAwakenings || {}).reduce((a, b) => a + b, 0) * 2}%</span>
                </div>
                <div className="flex justify-between text-sm text-orange-400 font-black mt-3 pt-3 border-t border-orange-500/30 relative z-10">
                  <span>合計ボーナス:</span>
                  <span className="font-mono text-lg drop-shadow-[0_0_5px_rgba(251,146,60,0.5)]">+{gameState.unlockedHeroes.length + (Object.values(gameState.heroAwakenings || {}).reduce((a, b) => a + b, 0) * 2)}%</span>
                </div>
              </div>

              <p className="text-[10px] text-gray-400 w-full max-w-sm mb-2 shrink-0 font-bold tracking-widest text-center">獲得したヒーローの詳細を確認できます。解放・覚醒で全体DPSが上昇します。</p>
              
              <div className="w-full max-w-sm grid grid-cols-4 gap-2.5 shrink-0">
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
                        "aspect-square rounded-xl flex flex-col items-center justify-center border relative overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.05] active:scale-95",
                        isUnlocked ? "bg-gray-800/80 border-gray-600/50 shadow-md hover:bg-gray-700/80" : "bg-gray-900/50 border-gray-800/50 opacity-40 grayscale cursor-not-allowed",
                        canAwaken ? "ring-2 ring-yellow-400 ring-offset-2 ring-offset-gray-950 animate-pulse shadow-[0_0_15px_rgba(250,204,21,0.4)]" : ""
                      )}
                    >
                      <div className="text-3xl mb-1 relative drop-shadow-md">
                        {hero.emoji}
                        {awakeningLevel > 0 && (
                          <div className="absolute -top-1.5 -right-2.5 bg-gradient-to-br from-yellow-400 to-yellow-600 text-yellow-950 text-[9px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-yellow-200 shadow-sm font-mono">
                            {awakeningLevel}
                          </div>
                        )}
                      </div>
                      {isUnlocked && (
                        <>
                          <div className={cn("text-[10px] font-black tracking-wider", RARITY_COLORS[hero.rarity].replace('bg-', 'text-').replace('border-', 'text-').replace('100', '400').replace('200', '400').replace('300', '400'))}>{hero.rarity}</div>
                          <div className="text-[9px] text-gray-300 truncate w-full text-center font-bold px-1">{hero.name}</div>
                          {awakeningLevel < 5 && (
                            <div className="w-10/12 bg-gray-900 h-1.5 mt-1.5 rounded-full overflow-hidden shadow-inner border border-gray-700/50">
                              <div className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full" style={{ width: `${Math.min(100, (souls / soulsNeeded) * 100)}%` }} />
                            </div>
                          )}
                        </>
                      )}
                      {!isUnlocked && <div className="text-xl text-gray-700 font-black font-mono">?</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeTab === 'LEADERBOARD' && (
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto hide-scrollbar">
              <h2 className="text-2xl font-black text-white mb-6 flex items-center justify-center tracking-widest shrink-0 drop-shadow-md font-mono">
                <Trophy className="mr-2 text-pink-400" /> リーダーボード
              </h2>
              <div className="w-full max-w-sm space-y-3.5 shrink-0">
                {leaderboard.length > 0 ? (
                  leaderboard.map((entry, index) => (
                    <div key={entry.id} className={cn(
                      "glass-panel p-4 rounded-2xl border flex items-center justify-between transition-all duration-300 hover:scale-[1.02]",
                      index === 0 ? "border-yellow-500/50 bg-yellow-950/20 shadow-[0_0_15px_rgba(250,204,21,0.2)]" :
                      index === 1 ? "border-gray-400/50 bg-gray-800/40" :
                      index === 2 ? "border-orange-500/50 bg-orange-950/20" : "border-gray-700/50"
                    )}>
                      <div className="flex items-center space-x-4">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shadow-inner border",
                          index === 0 ? "bg-gradient-to-br from-yellow-300 to-yellow-600 text-yellow-950 border-yellow-200" :
                          index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900 border-gray-200" :
                          index === 2 ? "bg-gradient-to-br from-orange-400 to-orange-700 text-orange-950 border-orange-300" : "bg-gray-800 text-gray-400 border-gray-700"
                        )}>
                          {index + 1}
                        </div>
                        <span className="font-bold text-white truncate max-w-[140px] tracking-wide">{entry.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 font-medium tracking-wider mb-0.5">到達ステージ</div>
                        <div className="font-black text-pink-400 text-xl font-mono drop-shadow-[0_0_5px_rgba(244,114,182,0.5)]">{entry.stage}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-gray-500 py-12 glass-panel rounded-2xl border border-gray-700/50 font-medium tracking-wider">
                    データを読み込み中、またはデータがありません。
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === 'INVENTORY' && (
            <div className="flex-1 flex flex-col items-center p-4 overflow-y-auto hide-scrollbar">
              <h2 className="text-2xl font-black text-white mb-6 flex items-center justify-center tracking-widest shrink-0 drop-shadow-md font-mono">
                <ShieldAlert className="mr-2 text-emerald-400" /> 鍛冶屋 <span className="text-[10px] text-emerald-400/80 ml-2 font-normal">(SMITHY)</span>
              </h2>

              <div className="w-full max-w-md flex bg-gray-900/80 rounded-xl p-1.5 mb-6 shrink-0 border border-gray-700/50 shadow-inner">
                <button
                  onClick={() => setInventoryTab('LIST')}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-black rounded-lg transition-all duration-300 tracking-wider",
                    inventoryTab === 'LIST' ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
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
                    "flex-1 py-2.5 text-sm font-black rounded-lg transition-all duration-300 tracking-wider",
                    inventoryTab === 'SYNTHESIS' ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                  )}
                >
                  合成
                </button>
              </div>

              <div className="w-full max-w-md space-y-3.5 shrink-0">
                {inventoryTab === 'LIST' && (
                  <>
                    <div className="flex justify-between items-center mb-4 px-1">
                      <span className="text-gray-300 text-sm font-bold tracking-wider flex items-center">所持数: <span className="text-white ml-2 font-mono bg-gray-800 px-2 py-0.5 rounded border border-gray-700">{gameState.inventory?.length || 0}</span></span>
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
                        className="px-4 py-2 bg-gradient-to-r from-red-900/80 to-rose-900/80 hover:from-red-800 hover:to-rose-800 border border-red-500/50 text-red-100 text-xs font-black rounded-xl transition-all duration-300 shadow-md active:scale-95 tracking-wider"
                      >
                        N/R一括売却
                      </button>
                    </div>
                    {(!gameState.inventory || gameState.inventory.length === 0) ? (
                      <div className="text-center text-gray-500 py-12 glass-panel rounded-2xl border border-gray-700/50 font-medium tracking-wider">
                        装備を持っていません。<br/><span className="text-gray-400 mt-2 inline-block">ボスを倒してドロップを狙いましょう！</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {gameState.inventory.map((eq) => (
                          <div key={eq.id} className="glass-panel p-4 rounded-2xl border border-gray-700/50 flex flex-col relative shadow-lg hover:border-gray-600/50 transition-colors">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center">
                                <span className={cn(
                                  "text-[10px] font-black px-2 py-0.5 rounded-md mr-2 tracking-wider shadow-inner",
                                  eq.rarity === 'UR' ? "bg-red-950/50 text-red-400 border border-red-500/50" :
                                  eq.rarity === 'SSR' ? "bg-yellow-950/50 text-yellow-400 border border-yellow-500/50" :
                                  eq.rarity === 'SR' ? "bg-purple-950/50 text-purple-400 border border-purple-500/50" :
                                  eq.rarity === 'R' ? "bg-blue-950/50 text-blue-400 border border-blue-500/50" :
                                  "bg-gray-800/80 text-gray-400 border border-gray-600/50"
                                )}>{eq.rarity}</span>
                                <span className="font-black text-white text-sm tracking-wide">{eq.name}</span>
                              </div>
                              <span className="text-[9px] text-gray-500 uppercase font-black bg-gray-900/80 px-1.5 py-0.5 rounded border border-gray-800">{eq.type}</span>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg p-2 mb-3 border border-gray-800/50">
                              <div className="text-xs text-emerald-400 mb-1 font-mono font-bold">DPS +{formatNumber(eq.dpsBonus)}</div>
                              <div className="text-xs text-emerald-400 font-mono font-bold">DPS x{eq.dpsMultiplier.toFixed(2)}</div>
                            </div>
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
                              className="mt-auto w-full py-2 bg-gray-800/80 hover:bg-red-900/40 text-gray-400 hover:text-red-300 text-xs font-black rounded-xl border border-gray-700/50 hover:border-red-800/50 transition-all duration-300 tracking-wider active:scale-95 flex justify-center items-center"
                            >
                              売却 <span className="text-[10px] font-mono ml-2">(+{formatNumber(eq.rarity === 'UR' ? 10000 : eq.rarity === 'SSR' ? 2000 : eq.rarity === 'SR' ? 500 : eq.rarity === 'R' ? 100 : 20)}G)</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {inventoryTab === 'SYNTHESIS' && (
                  <>
                    <div className="glass-panel p-5 rounded-2xl border border-gray-700/50 mb-4 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
                      <p className="text-xs text-gray-300 mb-3 font-medium leading-relaxed relative z-10">同じレアリティ・部位の装備を<span className="text-yellow-400 font-bold">3つ</span>選んで、1つ上のレアリティに合成します。</p>
                      <div className="flex justify-between items-center mt-4 relative z-10">
                        <span className="text-gray-400 text-sm font-bold tracking-wider flex items-center">選択中: <span className={cn("ml-2 font-mono px-2 py-0.5 rounded border", synthSelection.length === 3 ? "bg-emerald-900/50 text-emerald-400 border-emerald-500/50" : "bg-gray-800 text-white border-gray-700")}>{synthSelection.length}/3</span></span>
                        <div className="flex space-x-2">
                          <button
                            onClick={handleAutoSynthesizeEquipment}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl transition-all duration-300 flex items-center shadow-md active:scale-95 border border-purple-500/50 tracking-wider"
                          >
                            <Combine size={16} className="mr-1.5" /> 一括合成
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
                            className={cn(
                              "px-4 py-2 font-black text-xs rounded-xl transition-all duration-300 flex items-center tracking-wider",
                              synthSelection.length === 3 
                                ? "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] active:scale-95 border border-emerald-500/50 animate-pulse" 
                                : "bg-gray-800/80 text-gray-500 cursor-not-allowed border border-gray-700/50"
                            )}
                          >
                            合成する
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                              "p-4 rounded-2xl border flex flex-col relative cursor-pointer transition-all duration-300 shadow-lg",
                              isSelected ? "bg-emerald-950/40 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.2)] scale-[1.02]" : 
                              isDisabled ? "bg-gray-900/50 border-gray-800/50 opacity-40 grayscale" : 
                              "glass-panel border-gray-700/50 hover:border-emerald-500/30 hover:bg-gray-800/80"
                            )}
                          >
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center">
                                <span className={cn(
                                  "text-[10px] font-black px-2 py-0.5 rounded-md mr-2 tracking-wider shadow-inner",
                                  eq.rarity === 'SSR' ? "bg-yellow-950/50 text-yellow-400 border border-yellow-500/50" :
                                  eq.rarity === 'SR' ? "bg-purple-950/50 text-purple-400 border border-purple-500/50" :
                                  eq.rarity === 'R' ? "bg-blue-950/50 text-blue-400 border border-blue-500/50" :
                                  "bg-gray-800/80 text-gray-400 border border-gray-600/50"
                                )}>{eq.rarity}</span>
                                <span className="font-black text-white text-sm tracking-wide">{eq.name}</span>
                              </div>
                              <span className="text-[9px] text-gray-500 uppercase font-black bg-gray-900/80 px-1.5 py-0.5 rounded border border-gray-800">{eq.type}</span>
                            </div>
                            <div className="bg-gray-900/50 rounded-lg p-2 border border-gray-800/50">
                              <div className="text-xs text-emerald-400 mb-1 font-mono font-bold">DPS +{formatNumber(eq.dpsBonus)}</div>
                              <div className="text-xs text-emerald-400 font-mono font-bold">DPS x{eq.dpsMultiplier.toFixed(2)}</div>
                            </div>
                            {isSelected && (
                              <div className="absolute top-3 right-3 text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)] animate-bounce">
                                <CheckCircle2 size={20} />
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
              className="absolute inset-0 bg-gray-950/95 backdrop-blur-xl z-20 flex flex-col p-6 overflow-y-auto hide-scrollbar"
            >
              <div className="flex justify-between items-center mb-8 border-b border-gray-800/50 pb-4">
                <h2 className="text-2xl font-black text-white tracking-widest font-mono drop-shadow-md">メニュー</h2>
                <button onClick={() => setIsMenuOpen(false)} className="p-2.5 bg-gray-800/80 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors shadow-inner border border-gray-700/50">
                  <X size={22} />
                </button>
              </div>
              
              <div className="grid grid-cols-3 gap-5">
                <button
                  onClick={() => { setActiveTab('TACTICS'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 active:scale-95 shadow-lg relative overflow-hidden group", activeTab === 'TACTICS' ? "bg-blue-950/60 border-blue-500/50 text-blue-400" : "glass-panel border-gray-700/50 text-gray-300 hover:bg-gray-800/80 hover:border-gray-600/50")}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Target size={32} className={cn("mb-3 transition-transform group-hover:scale-110", activeTab === 'TACTICS' && "drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]")} />
                  <span className="text-xs font-black tracking-widest">戦術</span>
                </button>
                <button
                  onClick={() => { setActiveTab('MISSIONS'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 active:scale-95 shadow-lg relative overflow-hidden group", activeTab === 'MISSIONS' ? "bg-blue-950/60 border-blue-500/50 text-blue-400" : "glass-panel border-gray-700/50 text-gray-300 hover:bg-gray-800/80 hover:border-gray-600/50")}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <ScrollText size={32} className={cn("mb-3 transition-transform group-hover:scale-110", activeTab === 'MISSIONS' && "drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]")} />
                  <span className="text-xs font-black tracking-widest">任務</span>
                </button>
                <button
                  onClick={() => { setActiveTab('ARTIFACTS'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 active:scale-95 shadow-lg relative overflow-hidden group", activeTab === 'ARTIFACTS' ? "bg-purple-950/60 border-purple-500/50 text-purple-400" : "glass-panel border-gray-700/50 text-gray-300 hover:bg-gray-800/80 hover:border-gray-600/50")}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Crown size={32} className={cn("mb-3 transition-transform group-hover:scale-110", activeTab === 'ARTIFACTS' && "drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]")} />
                  <span className="text-xs font-black tracking-widest">遺物</span>
                </button>
                <button
                  onClick={() => { setActiveTab('EXPEDITIONS'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 active:scale-95 shadow-lg relative overflow-hidden group", activeTab === 'EXPEDITIONS' ? "bg-orange-950/60 border-orange-500/50 text-orange-400" : "glass-panel border-gray-700/50 text-gray-300 hover:bg-gray-800/80 hover:border-gray-600/50")}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Map size={32} className={cn("mb-3 transition-transform group-hover:scale-110", activeTab === 'EXPEDITIONS' && "drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]")} />
                  <span className="text-xs font-black tracking-widest">派遣</span>
                </button>
                <button
                  onClick={() => { setActiveTab('PRESTIGE'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 active:scale-95 shadow-lg relative overflow-hidden group", activeTab === 'PRESTIGE' ? "bg-cyan-950/60 border-cyan-500/50 text-cyan-400" : "glass-panel border-gray-700/50 text-gray-300 hover:bg-gray-800/80 hover:border-gray-600/50")}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <ArrowUpCircle size={32} className={cn("mb-3 transition-transform group-hover:scale-110", activeTab === 'PRESTIGE' && "drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]")} />
                  <span className="text-xs font-black tracking-widest">転生</span>
                </button>
                <button
                  onClick={() => { setActiveTab('LEADERBOARD'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 active:scale-95 shadow-lg relative overflow-hidden group", activeTab === 'LEADERBOARD' ? "bg-pink-950/60 border-pink-500/50 text-pink-400" : "glass-panel border-gray-700/50 text-gray-300 hover:bg-gray-800/80 hover:border-gray-600/50")}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Trophy size={32} className={cn("mb-3 transition-transform group-hover:scale-110", activeTab === 'LEADERBOARD' && "drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]")} />
                  <span className="text-[10px] sm:text-xs font-black tracking-widest">ランキング</span>
                </button>
                <button
                  onClick={() => { setActiveTab('INVENTORY'); setIsMenuOpen(false); }}
                  className={cn("flex flex-col items-center justify-center p-5 rounded-2xl border transition-all duration-300 active:scale-95 shadow-lg relative overflow-hidden group", activeTab === 'INVENTORY' ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-400" : "glass-panel border-gray-700/50 text-gray-300 hover:bg-gray-800/80 hover:border-gray-600/50")}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <ShieldAlert size={32} className={cn("mb-3 transition-transform group-hover:scale-110", activeTab === 'INVENTORY' && "drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]")} />
                  <span className="text-xs font-black tracking-widest">装備</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation */}
        <div className="glass-panel border-t-0 border-x-0 rounded-t-2xl flex justify-around p-2 pb-safe z-30 shrink-0 mx-2 mb-2 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
          <button
            onClick={() => { setActiveTab('BATTLE'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-all duration-300", activeTab === 'BATTLE' && !isMenuOpen ? "text-red-400 bg-red-950/50 shadow-inner scale-105" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/30")}
          >
            <Sword size={22} className={cn("mb-1", activeTab === 'BATTLE' && !isMenuOpen && "drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]")} />
            <span className="text-[10px] font-bold tracking-wider font-mono">バトル</span>
          </button>
          <button
            onClick={() => { setActiveTab('GACHA'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-all duration-300", activeTab === 'GACHA' && !isMenuOpen ? "text-yellow-400 bg-yellow-950/50 shadow-inner scale-105" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/30")}
          >
            <Sparkles size={22} className={cn("mb-1", activeTab === 'GACHA' && !isMenuOpen && "drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]")} />
            <span className="text-[10px] font-bold tracking-wider font-mono">ガチャ</span>
          </button>
          <button
            onClick={() => { setActiveTab('UPGRADES'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-all duration-300", activeTab === 'UPGRADES' && !isMenuOpen ? "text-emerald-400 bg-emerald-950/50 shadow-inner scale-105" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/30")}
          >
            <TrendingUp size={22} className={cn("mb-1", activeTab === 'UPGRADES' && !isMenuOpen && "drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]")} />
            <span className="text-[10px] font-bold tracking-wider font-mono">強化</span>
          </button>
          <button
            onClick={() => { setActiveTab('COLLECTION'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-all duration-300", activeTab === 'COLLECTION' && !isMenuOpen ? "text-orange-400 bg-orange-950/50 shadow-inner scale-105" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/30")}
          >
            <BookOpen size={22} className={cn("mb-1", activeTab === 'COLLECTION' && !isMenuOpen && "drop-shadow-[0_0_8px_rgba(251,146,60,0.8)]")} />
            <span className="text-[10px] font-bold tracking-wider font-mono">図鑑</span>
          </button>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn("flex flex-col items-center justify-center p-2 rounded-xl flex-1 transition-all duration-300", isMenuOpen ? "text-blue-400 bg-blue-950/50 shadow-inner scale-105" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/30")}
          >
            <LayoutGrid size={22} className={cn("mb-1", isMenuOpen && "drop-shadow-[0_0_8px_rgba(96,165,250,0.8)]")} />
            <span className="text-[10px] font-bold tracking-wider font-mono">メニュー</span>
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
                className="glass-panel border border-gray-700/50 rounded-3xl p-6 max-w-sm w-full shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden flex flex-col max-h-[80vh]"
              >
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <h2 className="text-xl font-black text-white flex items-center tracking-widest drop-shadow-md">
                    <ShieldAlert className="mr-2 text-emerald-400" /> 装備変更
                  </h2>
                  <button onClick={() => { setIsEquipmentModalOpen(false); setSelectedEquipmentSlot(null); }} className="text-gray-400 hover:text-white bg-gray-800/50 p-1.5 rounded-full transition-colors border border-gray-700/50 hover:bg-gray-700/50">
                    <X size={20} />
                  </button>
                </div>

                {(() => {
                  const arr = selected.type === 'board' ? gameState.board : gameState.bench;
                  const inst = arr[selected.index];
                  if (!inst) return null;
                  const def = HEROES.find(h => h.id === inst.heroId)!;

                  return (
                    <div className="flex flex-col space-y-4 overflow-y-auto hide-scrollbar relative z-10">
                      <div className="flex items-center space-x-4 bg-gray-900/60 p-4 rounded-2xl border border-gray-700/50 shadow-inner">
                        <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center text-3xl border-2 shadow-lg", RARITY_COLORS[def.rarity])}>
                          {def.emoji}
                        </div>
                        <div>
                          <div className="font-black text-white text-lg tracking-wide">{def.name}</div>
                          <div className="text-xs text-gray-400 font-mono font-bold bg-gray-800/80 inline-block px-2 py-0.5 rounded border border-gray-700/50 mt-1">Lv.{inst.level || 1}</div>
                        </div>
                      </div>

                      {/* Equipment Slots */}
                      <div className="grid grid-cols-3 gap-3">
                        {(['weapon', 'armor', 'accessory'] as const).map(slot => {
                          const eq = inst.equipment?.[slot];
                          const isSelected = selectedEquipmentSlot === slot;
                          return (
                            <button
                              key={slot}
                              onClick={() => setSelectedEquipmentSlot(isSelected ? null : slot)}
                              className={cn(
                                "flex flex-col items-center p-3 rounded-2xl border transition-all duration-300 shadow-md relative overflow-hidden",
                                isSelected ? "bg-emerald-950/60 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.3)] scale-[1.02]" : "glass-panel border-gray-700/50 hover:bg-gray-800/80 hover:border-gray-600/50"
                              )}
                            >
                              <div className="text-[10px] text-gray-400 mb-2 uppercase font-black tracking-widest">{slot}</div>
                              {eq ? (
                                <div className="flex flex-col items-center w-full">
                                  <span className={cn(
                                    "text-[10px] font-black px-1.5 py-0.5 rounded mb-1.5 shadow-inner border",
                                    eq.rarity === 'UR' ? "bg-red-950/50 text-red-400 border-red-500/50" :
                                    eq.rarity === 'SSR' ? "bg-yellow-950/50 text-yellow-400 border-yellow-500/50" :
                                    eq.rarity === 'SR' ? "bg-purple-950/50 text-purple-400 border-purple-500/50" :
                                    eq.rarity === 'R' ? "bg-blue-950/50 text-blue-400 border-blue-500/50" :
                                    "bg-gray-800/80 text-gray-400 border-gray-600/50"
                                  )}>{eq.rarity}</span>
                                  <span className="text-[10px] text-white truncate w-full text-center font-bold">{eq.name}</span>
                                </div>
                              ) : (
                                <div className="text-gray-600 text-xs py-2 font-medium">未装備</div>
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
                          
                          if (minRarityLevel >= 5) { rarityName = "UR"; bonusText = "+300%"; colorClass = "text-red-400 border-red-500/50 bg-red-950/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]"; }
                          else if (minRarityLevel >= 4) { rarityName = "SSR"; bonusText = "+100%"; colorClass = "text-yellow-400 border-yellow-500/50 bg-yellow-950/40 shadow-[0_0_10px_rgba(250,204,21,0.2)]"; }
                          else if (minRarityLevel >= 3) { rarityName = "SR"; bonusText = "+30%"; colorClass = "text-purple-400 border-purple-500/50 bg-purple-950/40 shadow-[0_0_10px_rgba(168,85,247,0.2)]"; }
                          else if (minRarityLevel >= 2) { rarityName = "R"; bonusText = "+15%"; colorClass = "text-blue-400 border-blue-500/50 bg-blue-950/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]"; }
                          else if (minRarityLevel >= 1) { rarityName = "N"; bonusText = "+5%"; colorClass = "text-gray-300 border-gray-500/50 bg-gray-800/50"; }

                          return (
                            <div className={cn("mt-2 p-3 rounded-xl border flex items-center justify-between", colorClass)}>
                              <div className="flex items-center">
                                <Sparkles size={16} className="mr-2" />
                                <span className="text-xs font-black tracking-wider">{rarityName} セットボーナス発動中！</span>
                              </div>
                              <span className="text-sm font-black font-mono">{bonusText} DPS</span>
                            </div>
                          );
                        }
                        return (
                          <div className="mt-2 p-3 rounded-xl border border-gray-700/50 bg-gray-900/50 flex items-center justify-center text-gray-500 text-xs font-medium tracking-wider">
                            3部位装備でセットボーナス発動
                          </div>
                        );
                      })()}

                      {/* Inventory List for Selected Slot */}
                      {selectedEquipmentSlot && (
                        <div className="mt-4 border-t border-gray-800/50 pt-4 flex-1 overflow-y-auto hide-scrollbar">
                          <h3 className="text-xs font-black text-gray-400 mb-3 uppercase tracking-widest flex items-center"><span className="bg-gray-800 px-2 py-1 rounded border border-gray-700 mr-2">{selectedEquipmentSlot}</span> 一覧</h3>
                          <div className="space-y-2.5">
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
                                className="w-full p-2.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800/50 rounded-xl text-red-400 text-xs font-black transition-all duration-300 active:scale-95 tracking-wider"
                              >
                                外す
                              </button>
                            )}

                            {/* Available items */}
                            {(gameState.inventory || []).filter(eq => eq.type === selectedEquipmentSlot).length === 0 ? (
                              <div className="text-center text-gray-500 text-xs py-6 bg-gray-900/50 rounded-xl border border-gray-800/50 font-medium">装備可能なアイテムがありません</div>
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
                                  className="w-full flex items-center justify-between p-3 glass-panel hover:bg-gray-800/80 border border-gray-700/50 rounded-xl transition-all duration-300 text-left active:scale-[0.98] shadow-sm"
                                >
                                  <div>
                                    <div className="flex items-center mb-1">
                                      <span className={cn(
                                        "text-[10px] font-black px-1.5 py-0.5 rounded mr-2 shadow-inner border",
                                        eq.rarity === 'UR' ? "bg-red-950/50 text-red-400 border-red-500/50" :
                                        eq.rarity === 'SSR' ? "bg-yellow-950/50 text-yellow-400 border-yellow-500/50" :
                                        eq.rarity === 'SR' ? "bg-purple-950/50 text-purple-400 border-purple-500/50" :
                                        eq.rarity === 'R' ? "bg-blue-950/50 text-blue-400 border-blue-500/50" :
                                        "bg-gray-800/80 text-gray-400 border-gray-600/50"
                                      )}>{eq.rarity}</span>
                                      <span className="font-bold text-white text-sm tracking-wide">{eq.name}</span>
                                    </div>
                                    <div className="text-[10px] text-emerald-400 font-mono font-bold bg-gray-900/50 inline-block px-1.5 py-0.5 rounded border border-gray-800/50">DPS +{formatNumber(eq.dpsBonus)} / x{eq.dpsMultiplier.toFixed(2)}</div>
                                  </div>
                                  <div className="text-[10px] font-black bg-emerald-950/60 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-800/50 shadow-sm">装備</div>
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
                className="glass-panel border border-yellow-500/30 rounded-3xl p-8 w-full max-w-sm shadow-[0_0_40px_rgba(250,204,21,0.2)] text-center relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none"></div>
                <div className="w-20 h-20 mx-auto bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-full flex items-center justify-center mb-6 shadow-inner border border-yellow-500/30 relative z-10">
                  <Sparkles size={40} className="text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.8)] animate-pulse" />
                </div>
                <h3 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400 mb-3 drop-shadow-md tracking-widest relative z-10">
                  おかえりなさい！
                </h3>
                <p className="text-gray-300 mb-8 text-sm font-medium leading-relaxed relative z-10">
                  あなたが離れていた <span className="text-white font-bold bg-gray-800 px-2 py-0.5 rounded border border-gray-700">{Math.floor(offlineReward.time / 60)}時間 {offlineReward.time % 60}分</span> の間に、<br/>ヒーローたちが戦い続けました。
                </p>
                
                <div className="bg-gray-950/80 rounded-2xl p-5 mb-8 border border-gray-800/50 shadow-inner space-y-4 relative z-10">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 flex items-center font-bold tracking-wider text-sm"><Coins size={18} className="mr-2 text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]" /> 獲得ゴールド</span>
                    <span className="text-yellow-400 font-black text-xl font-mono drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]">+{offlineReward.gold.toLocaleString()}</span>
                  </div>
                  {offlineReward.gems > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 flex items-center font-bold tracking-wider text-sm"><Gem size={18} className="mr-2 text-pink-400 drop-shadow-[0_0_5px_rgba(244,114,182,0.8)]" /> 獲得ジェム</span>
                      <span className="text-pink-400 font-black text-xl font-mono drop-shadow-[0_0_5px_rgba(244,114,182,0.5)]">+{offlineReward.gems.toLocaleString()}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setOfflineReward(null)}
                  className="w-full py-4 rounded-xl font-black text-lg bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white transition-all duration-300 active:scale-95 shadow-[0_0_20px_rgba(250,204,21,0.4)] tracking-widest border border-yellow-400/50 relative z-10"
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
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="glass-panel border border-gray-700/50 rounded-3xl p-6 w-full max-w-sm shadow-[0_0_30px_rgba(0,0,0,0.5)] relative overflow-hidden"
              >
                <h3 className="text-xl font-black text-white mb-3 tracking-widest drop-shadow-md">{modalState.title}</h3>
                <p className="text-gray-300 mb-8 text-sm whitespace-pre-wrap leading-relaxed font-medium bg-gray-900/50 p-4 rounded-xl border border-gray-800/50">{modalState.message}</p>
                <div className="flex justify-end space-x-3">
                  {!modalState.isAlert && (
                    <button
                      onClick={() => setModalState({ isOpen: false, title: '', message: '' })}
                      className="px-5 py-2.5 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-all duration-300 border border-gray-700/50 hover:border-gray-600/50"
                    >
                      キャンセル
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (modalState.onConfirm) modalState.onConfirm();
                      else setModalState({ isOpen: false, title: '', message: '' });
                    }}
                    className="px-6 py-2.5 rounded-xl font-black bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:from-blue-500 hover:to-cyan-500 transition-all duration-300 shadow-lg active:scale-95 border border-blue-500/50 tracking-wider"
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
                    <h2 className="text-3xl font-black text-white tracking-widest mb-10 drop-shadow-lg">10連召喚結果</h2>
                    <div className="grid grid-cols-5 gap-4 sm:gap-6 mb-10">
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
                              "w-16 h-16 sm:w-24 sm:h-24 rounded-2xl border-2 flex flex-col items-center justify-center shadow-lg relative overflow-hidden",
                              RARITY_COLORS[def.rarity].bg,
                              RARITY_COLORS[def.rarity].border
                            )}
                          >
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
                            <span className="text-2xl sm:text-4xl drop-shadow-md z-10">{def.emoji}</span>
                            <div className="absolute bottom-0 w-full bg-black/60 text-center py-1 z-10 backdrop-blur-sm">
                              <span className={cn("font-black tracking-widest text-[8px] sm:text-xs", RARITY_COLORS[def.rarity].text)}>
                                {def.rarity}
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setGachaReveal({ isOpen: false, hero: null, is10Pull: false, heroes: [] })}
                      className="px-10 py-3.5 bg-white text-black font-black rounded-full hover:bg-gray-200 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.4)] active:scale-95 tracking-widest text-lg"
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
                          <h2 className="text-3xl font-black text-white tracking-widest mb-3 drop-shadow-lg">{def.name}</h2>
                          <div className="flex items-center justify-center gap-2 mb-6">
                            <span className={cn("px-4 py-1.5 rounded-full text-xs font-black tracking-widest border shadow-inner", FACTION_COLORS[def.faction], "bg-black/50")}>
                              {FACTION_JA[def.faction]}
                            </span>
                            <span className="px-4 py-1.5 rounded-full text-xs font-black tracking-widest border border-gray-500 text-gray-300 bg-black/50 shadow-inner">
                              {CLASS_JA[def.classType]}
                            </span>
                          </div>
                          {isDuplicate && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.5 }}
                              className="bg-blue-950/60 text-blue-400 px-5 py-2.5 rounded-2xl border border-blue-800/50 font-black text-sm tracking-wider shadow-inner"
                            >
                              重複ボーナス: 魂 +1
                            </motion.div>
                          )}
                        </div>

                        <button
                          onClick={() => setGachaReveal({ isOpen: false, hero: null, is10Pull: false, heroes: [] })}
                          className="mt-10 px-10 py-3.5 bg-white text-black font-black rounded-full hover:bg-gray-200 transition-all duration-300 shadow-[0_0_30px_rgba(255,255,255,0.4)] active:scale-95 tracking-widest text-lg"
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
                className="glass-panel border border-gray-700/50 rounded-3xl p-6 w-full max-w-sm shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col relative overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <h3 className="text-xl font-black text-white flex items-center tracking-widest drop-shadow-md">
                    <BarChart2 size={20} className="mr-2 text-blue-400" /> ステータス詳細
                  </h3>
                  <button onClick={() => setShowStats(false)} className="text-gray-400 hover:text-white bg-gray-800/50 p-1.5 rounded-full transition-colors border border-gray-700/50 hover:bg-gray-700/50">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="space-y-3 relative z-10">
                  {(() => {
                    const stats = getDpsBreakdown();
                    return (
                      <>
                        <div className="flex justify-between items-center bg-gray-900/60 p-3.5 rounded-2xl border border-gray-700/50 shadow-inner">
                          <span className="text-gray-400 text-xs font-bold tracking-wider">ヒーロー基礎DPS合計</span>
                          <span className="text-white font-black font-mono">{formatNumber(stats.baseTotal)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-900/60 p-3.5 rounded-2xl border border-gray-700/50 shadow-inner">
                          <span className="text-gray-400 text-xs font-bold tracking-wider">個別倍率適用後</span>
                          <span className="text-white font-black font-mono">{formatNumber(stats.afterIndividualMults)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-900/60 p-3.5 rounded-2xl border border-gray-700/50 shadow-inner">
                          <span className="text-gray-400 text-xs font-bold tracking-wider">シナジー全体倍率</span>
                          <span className="text-yellow-400 font-black font-mono bg-yellow-950/40 px-2 py-0.5 rounded border border-yellow-500/30">x{stats.globalMult.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-900/60 p-3.5 rounded-2xl border border-gray-700/50 shadow-inner">
                          <span className="text-gray-400 text-xs font-bold tracking-wider">強化(アップグレード)倍率</span>
                          <span className="text-emerald-400 font-black font-mono bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30">x{stats.upgradeMult.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-900/60 p-3.5 rounded-2xl border border-gray-700/50 shadow-inner">
                          <span className="text-gray-400 text-xs font-bold tracking-wider">タレント倍率</span>
                          <span className="text-purple-400 font-black font-mono bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/30">x{stats.talentMult.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-900/60 p-3.5 rounded-2xl border border-gray-700/50 shadow-inner">
                          <span className="text-gray-400 text-xs font-bold tracking-wider">アクティブスキル倍率</span>
                          <span className="text-orange-400 font-black font-mono bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/30">x{stats.skillMult.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-gray-900/60 p-3.5 rounded-2xl border border-gray-700/50 shadow-inner">
                          <span className="text-gray-400 text-xs font-bold tracking-wider">転生倍率</span>
                          <span className="text-cyan-400 font-black font-mono bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30">x{stats.prestigeMult.toFixed(2)}</span>
                        </div>
                        {currentEnemyTrait === 'EVASIVE' && (
                          <div className="flex justify-between items-center bg-red-950/40 p-3.5 rounded-2xl border border-red-900/50 shadow-inner">
                            <span className="text-red-400 text-xs font-bold tracking-wider">敵特性: 回避</span>
                            <span className="text-red-400 font-black font-mono bg-red-950/60 px-2 py-0.5 rounded border border-red-800/50">x0.70</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center bg-gradient-to-r from-blue-900/40 to-cyan-900/40 p-4 rounded-2xl border border-blue-500/50 mt-4 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                          <span className="text-blue-200 font-black tracking-widest text-sm">最終DPS</span>
                          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 font-black text-2xl font-mono drop-shadow-sm">{formatNumber(stats.finalDps)}</span>
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
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="glass-panel border border-gray-700/50 rounded-3xl p-6 w-full max-w-sm shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col relative overflow-hidden"
              >
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <h3 className="text-xl font-black text-white flex items-center tracking-widest drop-shadow-md">
                    <Settings size={20} className="mr-2 text-gray-400" /> 設定
                  </h3>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-white bg-gray-800/50 p-1.5 rounded-full transition-colors border border-gray-700/50 hover:bg-gray-700/50">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 relative z-10">
                  {/* Account Section */}
                  <div className="bg-gray-900/60 p-5 rounded-2xl border border-gray-700/50 shadow-inner">
                    <h4 className="text-xs font-black text-gray-400 mb-4 uppercase tracking-widest flex items-center"><span className="bg-gray-800 px-2 py-1 rounded border border-gray-700 mr-2">ACCOUNT</span> アカウント</h4>
                    {isAuthReady ? (
                      user ? (
                        <div className="flex flex-col space-y-4">
                          <div className="flex items-center space-x-4 glass-panel p-3 rounded-xl border border-gray-700/50">
                            {user.photoURL ? (
                              <img src={user.photoURL} alt="Profile" className="w-12 h-12 rounded-full border-2 border-gray-600 shadow-md" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-2xl border-2 border-gray-700 shadow-md">👤</div>
                            )}
                            <div className="flex flex-col overflow-hidden">
                              <span className="text-sm font-black text-white truncate tracking-wide">{user.displayName || '名無しプレイヤー'}</span>
                              <span className="text-[10px] text-gray-400 truncate font-mono mt-0.5">{user.email}</span>
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
                            className="w-full py-3 rounded-xl font-black text-sm bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/50 transition-all duration-300 flex items-center justify-center active:scale-95 tracking-widest"
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
                          className="w-full py-3.5 rounded-xl font-black text-sm bg-white hover:bg-gray-200 text-gray-900 transition-all duration-300 flex items-center justify-center shadow-lg active:scale-95 tracking-widest"
                        >
                          <LogIn size={18} className="mr-2" /> Googleでログイン
                        </button>
                      )
                    ) : (
                      <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>

                  {/* Cloud Save Section */}
                  <div className="bg-gray-900/60 p-5 rounded-2xl border border-gray-700/50 shadow-inner">
                    <h4 className="text-xs font-black text-gray-400 mb-4 uppercase tracking-widest flex items-center"><span className="bg-gray-800 px-2 py-1 rounded border border-gray-700 mr-2">CLOUD</span> クラウドセーブ</h4>
                    <div className="grid grid-cols-2 gap-3">
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
                        className="py-3 rounded-xl font-black text-xs bg-blue-950/40 hover:bg-blue-900/60 disabled:opacity-50 disabled:bg-gray-800/50 text-blue-400 border border-blue-800/50 transition-all duration-300 flex flex-col items-center justify-center active:scale-95 tracking-widest"
                      >
                        <CloudUpload size={20} className="mb-1.5" /> クラウドへ保存
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
                        className="py-3 rounded-xl font-black text-xs bg-emerald-950/40 hover:bg-emerald-900/60 disabled:opacity-50 disabled:bg-gray-800/50 text-emerald-400 border border-emerald-800/50 transition-all duration-300 flex flex-col items-center justify-center active:scale-95 tracking-widest"
                      >
                        <CloudDownload size={20} className="mb-1.5" /> クラウドから読込
                      </button>
                    </div>
                  </div>
                  
                  {/* Danger Zone */}
                  <div className="bg-red-950/20 p-5 rounded-2xl border border-red-900/30 shadow-inner">
                    <h4 className="text-xs font-black text-red-500/80 mb-4 uppercase tracking-widest flex items-center"><span className="bg-red-950/50 px-2 py-1 rounded border border-red-900/50 mr-2 text-red-400">DANGER</span> 危険な操作</h4>
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
                      className="w-full py-3 rounded-xl font-black text-sm bg-red-600 hover:bg-red-500 text-white transition-all duration-300 flex items-center justify-center shadow-lg active:scale-95 tracking-widest border border-red-500/50"
                    >
                      <Trash2 size={18} className="mr-2" /> データをリセット
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
              <div className="glass-panel border border-yellow-500/50 rounded-2xl p-4 shadow-[0_0_30px_rgba(250,204,21,0.3)] flex items-center gap-4 backdrop-blur-md">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center text-2xl border-2 shadow-inner",
                  dropNotification.rarity === 'UR' ? "bg-red-950/50 text-red-400 border-red-500/50" :
                  dropNotification.rarity === 'SSR' ? "bg-yellow-950/50 text-yellow-400 border-yellow-500/50" :
                  dropNotification.rarity === 'SR' ? "bg-purple-950/50 text-purple-400 border-purple-500/50" :
                  dropNotification.rarity === 'R' ? "bg-blue-950/50 text-blue-400 border-blue-500/50" :
                  "bg-gray-800/80 text-gray-400 border-gray-600/50"
                )}>
                  {dropNotification.type === 'weapon' ? '🗡️' : dropNotification.type === 'armor' ? '🛡️' : '💍'}
                </div>
                <div>
                  <div className="text-[10px] text-yellow-400 font-black tracking-widest uppercase mb-0.5 drop-shadow-sm">装備ドロップ！</div>
                  <div className="text-sm text-white font-bold tracking-wide">{dropNotification.name}</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
