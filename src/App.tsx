/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sword, Sparkles, Coins, Gem, Clock, Info, Trash2, ArrowUpCircle, TrendingUp, ScrollText, Target, Crown, BookOpen, Settings, Trophy, CloudUpload, CloudDownload, LogOut, LogIn, BarChart2, X, HelpCircle, CheckCircle2, Zap, ShieldAlert, Crosshair, Map, LayoutGrid } from 'lucide-react';
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
  TalentId
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
      };
    }
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

  const [activeTab, setActiveTab] = useState<'BATTLE' | 'GACHA' | 'UPGRADES' | 'MISSIONS' | 'PRESTIGE' | 'ARTIFACTS' | 'COLLECTION' | 'LEADERBOARD' | 'TACTICS' | 'EXPEDITIONS'>('BATTLE');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [missionTab, setMissionTab] = useState<'DAILY' | 'ACHIEVEMENT'>('DAILY');
  const [showHelp, setShowHelp] = useState(false);
  const [damageTexts, setDamageTexts] = useState<{ id: number; x: number; y: number; val: number; isCrit: boolean; timestamp: number }[]>([]);
  const [selected, setSelected] = useState<SelectedSlot>(null);
  const [showSynergies, setShowSynergies] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const [showStats, setShowStats] = useState(false);

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
  const dps = useMemo(() => calculateDps(gameState, currentEnemyElement, currentEnemyTrait) * (gameState.prestigeMultiplier || 1) * (gameState.upgrades?.heroDps || 1), [gameState, currentEnemyElement, currentEnemyTrait]);
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
        const offlineDps = calculateDps({ ...prev, currentBossAffix }, currentEnemyElement, currentEnemyTrait) * (prev.prestigeMultiplier || 1) * (prev.upgrades?.heroDps || 1) * 0.5;
        
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
        const currentDps = calculateDps({ ...prev, currentBossAffix }, currentEnemyElement, currentEnemyTrait) * (prev.prestigeMultiplier || 1) * (prev.upgrades?.heroDps || 1);
        if (currentDps > 0) {
          newHp -= currentDps * 0.1; // 10 ticks per second
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
          if (isBoss) {
            newGems += 100 + newStage * 10;
            newArtifactShards += Math.floor(newStage / 10);
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
        const awakeningLevel = gameState.heroAwakenings?.[def.id] || 0;
        const awakeningMult = 1 + (awakeningLevel * 0.5);
        const base = def.baseDps * starMult * awakeningMult;
        baseTotal += base;

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

        afterIndividualMults += base * positionMult * leaderBuffMult * elementalMult * artifactMult;
      }
    });

    const upgradeMult = gameState.upgrades?.heroDps || 1;
    const prestigeMult = gameState.prestigeMultiplier || 1;
    
    let finalDps = afterIndividualMults * globalMult * upgradeMult * prestigeMult;
    if (currentEnemyTrait === 'EVASIVE') {
      finalDps *= 0.7;
    }

    return {
      baseTotal,
      afterIndividualMults,
      globalMult,
      upgradeMult,
      prestigeMult,
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

    setDamageTexts(prev => [...prev, { id: Math.random(), x, y, val: damage, isCrit, timestamp: Date.now() }]);
    setGameState(prev => ({ ...prev, enemyHp: prev.enemyHp - damage }));
  };

  const pullGacha = (type: 'normal' | 'premium') => {
    let cost = type === 'normal' ? 100 : 300;
    const isGems = type === 'premium';

    if (type === 'normal' && gameState.talents?.gacha_discount) {
      const talent = TALENTS.find(t => t.id === 'gacha_discount')!;
      cost = Math.floor(cost * (1 - (gameState.talents.gacha_discount * talent.effectPerLevel)));
    }

    if (isGems && gameState.gems < cost) return;
    if (!isGems && gameState.gold < cost) return;

    if (gameState.bench.every(slot => slot !== null)) {
      setModalState({
        isOpen: true,
        title: 'ベンチが満杯です',
        message: 'ガチャを引く前にベンチの空きを作ってください。',
        isAlert: true
      });
      return;
    }

    setGameState(prev => {
      const rand = Math.random();
      let rarity: Rarity = 'N';
      let newPityCounter = prev.pityCounter;
      let newPremiumGachaCount = prev.premiumGachaCount || 0;

      if (type === 'premium') {
        newPityCounter += 1;
        newPremiumGachaCount += 1;
        if (newPityCounter >= 30) {
          rarity = 'SSR'; // Pity system
          newPityCounter = 0;
        } else {
          if (rand < 0.05) rarity = 'UR';
          else if (rand < 0.20) { rarity = 'SSR'; newPityCounter = 0; } // Reset pity on natural SSR
          else if (rand < 0.50) rarity = 'SR';
          else rarity = 'R';
        }
      } else {
        let srRate = 0.05;
        if (prev.talents?.sr_rate_up) {
          const talent = TALENTS.find(t => t.id === 'sr_rate_up')!;
          srRate += (prev.talents.sr_rate_up * talent.effectPerLevel);
        }
        
        if (rand < 0.01) rarity = 'SSR';
        else if (rand < 0.01 + srRate) rarity = 'SR';
        else if (rand < 0.30) rarity = 'R';
        else rarity = 'N';
      }

      const pool = HEROES.filter(h => h.rarity === rarity);
      const hero = pool[Math.floor(Math.random() * pool.length)];

      const newMissions = prev.missions.map(m => 
        m.type === 'gacha' ? { ...m, progress: prev.totalGachaPulls + 1 } : m
      );

      if (prev.autoSellN && rarity === 'N') {
        const sellValue = 10;
        return {
          ...prev,
          gold: (isGems ? prev.gold : prev.gold - cost) + sellValue,
          gems: isGems ? prev.gems - cost : prev.gems,
          pityCounter: newPityCounter,
          premiumGachaCount: newPremiumGachaCount,
          totalGachaPulls: prev.totalGachaPulls + 1,
          missions: newMissions
        };
      }

      const isDuplicate = prev.unlockedHeroes.includes(hero.id);
      const newUnlockedHeroes = isDuplicate ? prev.unlockedHeroes : [...prev.unlockedHeroes, hero.id];
      
      const newHeroSouls = { ...(prev.heroSouls || {}) };
      let newBench = [...prev.bench];

      if (isDuplicate) {
        // Add souls for duplicate
        newHeroSouls[hero.id] = (newHeroSouls[hero.id] || 0) + 1;
      }

      const emptyBenchIndex = prev.bench.findIndex(s => s === null);
      if (emptyBenchIndex !== -1) {
        newBench[emptyBenchIndex] = { uid: Math.random().toString(), heroId: hero.id, star: 1, level: 1 };
      }

      return {
        ...prev,
        gold: isGems ? prev.gold : prev.gold - cost,
        gems: isGems ? prev.gems - cost : prev.gems,
        bench: newBench,
        pityCounter: newPityCounter,
        premiumGachaCount: newPremiumGachaCount,
        totalGachaPulls: prev.totalGachaPulls + 1,
        missions: newMissions,
        unlockedHeroes: newUnlockedHeroes,
        heroSouls: newHeroSouls
      };
    });
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
          setGameState(prev => ({
            gold: 500,
            gems: 1000,
            stage: 1,
            enemyHp: 50,
            enemyMaxHp: 50,
            board: Array(9).fill(null),
            bench: Array(5).fill(null),
            bossTimeLeft: null,
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
          }));
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
        "w-full h-full rounded-xl border-2 border-dashed bg-gray-800/50 flex items-center justify-center", 
        isSelected ? "border-yellow-400 bg-yellow-400/20" : "border-gray-700",
        isLeaderSlot && !isSelected && "border-yellow-500/50 bg-yellow-900/10"
      )}>
        {isLeaderSlot && <span className="text-[10px] font-bold text-yellow-500/50">LEADER</span>}
      </div>
    );
    
    const def = HEROES.find(h => h.id === inst.heroId)!;
    const awakeningLevel = gameState.heroAwakenings?.[def.id] || 0;

    return (
      <div className={cn(
        "relative w-full h-full rounded-xl border-2 flex flex-col items-center justify-center shadow-lg transition-transform",
        RARITY_COLORS[def.rarity].bg,
        isSelected ? "border-yellow-400 scale-105 z-10" : RARITY_COLORS[def.rarity].border
      )}>
        {isLeaderSlot && (
          <div className="absolute -top-3 bg-yellow-500 text-black text-[8px] font-black px-2 py-0.5 rounded-full shadow-md z-20">
            LEADER
          </div>
        )}
        {awakeningLevel > 0 && (
          <div className="absolute -top-1 -left-2 bg-blue-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border border-blue-300 shadow-md z-20">
            +{awakeningLevel}
          </div>
        )}
        {def.passive && (
          <div className="absolute top-1 left-1 text-yellow-300 drop-shadow-md z-20" title={`${def.passive.name}: ${def.passive.description}`}>
            <Sparkles size={10} />
          </div>
        )}
        <span className="text-3xl drop-shadow-md">{def.emoji}</span>
        <div className="absolute -top-2 -right-2 flex">
          {Array.from({ length: inst.star }).map((_, i) => (
            <span key={i} className="text-yellow-400 text-xs drop-shadow-md">★</span>
          ))}
        </div>
        <div className="absolute bottom-0 w-full bg-black/50 text-[10px] text-center font-bold tracking-wider rounded-b-lg flex justify-center gap-1 py-0.5">
          <span className={FACTION_COLORS[def.faction]}>{FACTION_JA[def.faction]}</span>
          <span className="text-gray-300">{CLASS_JA[def.classType]}</span>
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
                      className={cn("absolute pointer-events-none font-black drop-shadow-lg", dt.isCrit ? "text-yellow-400 text-2xl" : "text-white text-lg")}
                      style={{ left: 0, top: 0 }}
                    >
                      -{formatNumber(dt.val)}
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
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-gray-400 tracking-widest">編成 (FORMATION)</span>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setShowStats(true)}
                      className="text-xs flex items-center bg-blue-900/80 px-2 py-1 rounded text-blue-200 hover:bg-blue-800 transition-colors border border-blue-700"
                    >
                      <BarChart2 size={12} className="mr-1" /> 詳細
                    </button>
                    {selected && (
                      <>
                        <button 
                          onClick={handleHeroLevelUp}
                          disabled={gameState.gold < getHeroLevelUpCost(HEROES.find(h => h.id === (selected.type === 'board' ? gameState.board[selected.index] : gameState.bench[selected.index])?.heroId)!.rarity, (selected.type === 'board' ? gameState.board[selected.index] : gameState.bench[selected.index])?.level || 1)}
                          className="text-xs flex items-center bg-yellow-900/80 px-2 py-1 rounded text-yellow-200 hover:bg-yellow-800 transition-colors border border-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed mr-2"
                        >
                          <ArrowUpCircle size={12} className="mr-1" /> 強化 ({formatNumber(getHeroLevelUpCost(HEROES.find(h => h.id === (selected.type === 'board' ? gameState.board[selected.index] : gameState.bench[selected.index])?.heroId)!.rarity, (selected.type === 'board' ? gameState.board[selected.index] : gameState.bench[selected.index])?.level || 1))}G)
                        </button>
                        <button 
                          onClick={handleSell}
                          className="text-xs flex items-center bg-red-900/80 px-2 py-1 rounded text-red-200 hover:bg-red-800 transition-colors border border-red-700"
                        >
                          <Trash2 size={12} className="mr-1" /> 売却
                        </button>
                      </>
                    )}
                    <button 
                      onClick={() => setShowSynergies(!showSynergies)}
                      className="text-xs flex items-center bg-gray-800 px-2 py-1 rounded text-gray-300 hover:bg-gray-700 transition-colors"
                    >
                      <Info size={12} className="mr-1" /> シナジー
                    </button>
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
                <button
                  onClick={() => pullGacha('normal')}
                  disabled={gameState.gold < 100}
                  className="w-full py-3 rounded-xl font-bold text-md bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center border border-gray-600"
                >
                  召喚 <Coins size={16} className="ml-2 mr-1 text-yellow-400" /> 100
                </button>
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

                <button
                  onClick={() => pullGacha('premium')}
                  disabled={gameState.gems < 300}
                  className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 disabled:opacity-50 text-black transition-all active:scale-95 flex items-center justify-center shadow-lg"
                >
                  召喚 <Gem size={18} className="ml-2 mr-1 text-white" /> 300
                </button>
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
              <p className="text-xs text-gray-400 w-full max-w-sm mb-2 shrink-0">獲得したヒーローの詳細を確認できます。</p>
              
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
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation */}
        <div className="bg-gray-900 border-t border-gray-800 flex justify-around p-2 pb-safe z-30">
          <button
            onClick={() => { setActiveTab('BATTLE'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center p-2 rounded-xl w-16 transition-colors", activeTab === 'BATTLE' && !isMenuOpen ? "text-red-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <Sword size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">バトル</span>
          </button>
          <button
            onClick={() => { setActiveTab('GACHA'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center p-2 rounded-xl w-16 transition-colors", activeTab === 'GACHA' && !isMenuOpen ? "text-yellow-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <Sparkles size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">ガチャ</span>
          </button>
          <button
            onClick={() => { setActiveTab('UPGRADES'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center p-2 rounded-xl w-16 transition-colors", activeTab === 'UPGRADES' && !isMenuOpen ? "text-green-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <TrendingUp size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">強化</span>
          </button>
          <button
            onClick={() => { setActiveTab('COLLECTION'); setIsMenuOpen(false); }}
            className={cn("flex flex-col items-center p-2 rounded-xl w-16 transition-colors", activeTab === 'COLLECTION' && !isMenuOpen ? "text-orange-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <BookOpen size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">図鑑</span>
          </button>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={cn("flex flex-col items-center p-2 rounded-xl w-16 transition-colors", isMenuOpen ? "text-blue-400 bg-gray-800" : "text-gray-500 hover:text-gray-300")}
          >
            <LayoutGrid size={20} className="mb-1" />
            <span className="text-[9px] font-bold tracking-wider">メニュー</span>
          </button>
        </div>

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

      </div>
    </div>
  );
}
