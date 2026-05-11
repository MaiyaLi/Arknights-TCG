import { ALL_ASSETS, Operator } from '../data/operators';

export interface GameUnit {
  id: string;
  instanceId: string;
  owner: 'PLAYER' | 'AI';
  isAlly: boolean;
  lane: number;
  row: number; // 0 to 6
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  initialAtk: number;
  initialDef: number;
  res: number; // Magic Resistance (0-100)
  blockCount: number; // Max enemies this unit can stop
  speed: number; // ms per row
  lastMoveTime: number;
  lastCombatTime: number;
  isMoving: boolean;
  isStationary: boolean;
  rarity: number;
  class: string;
  name: string;
  ability: Operator['ability'];
  stunTurns: number; // Turns remaining
  silenced: boolean;
  turnsOnBoard: number;
  sp: number;
  maxSp: number;
  isSkillActive: boolean;
  skillDuration: number; // turns remaining
  isGoalSuccess?: boolean;
}

export type GamePhase = 'COMMAND' | 'ACTION' | 'ENEMY' | 'GAMEOVER';

export class BattleKernel {
  playerLP: number = 3;
  aiLP: number = 3;
  playerDP: number = 15;
  aiDP: number = 15;
  units: GameUnit[] = [];
  startTime: number = 0;
  lastTickTime: number = 0;
  isPaused: boolean = false;
  laneCount: number = 3;
  rowCount: number = 7; // 0: Enemy Goal, 1: AI Back, 2: AI Front, 3: Clash, 4: PL Front, 5: PL Back, 6: PL Goal
  phase: GamePhase = 'COMMAND';
  turnCount: number = 0;
  
  onGameOver: (winner: 'PLAYER' | 'AI') => void;
  onUnitReachedBase: (owner: 'PLAYER' | 'AI', unitId: string) => void;
  onUnitRemoved: (unit: GameUnit, reason: 'DEFEATED' | 'RETREATED' | 'SCORED_GOAL') => void;
  onPhaseChange: (phase: GamePhase) => void;
  onTurnStart: (turn: number) => void;
  onCombatEvent: (lane: number, row: number, value: number, type: 'DAMAGE' | 'HEAL' | 'STUN' | 'CRIT' | 'TRUE') => void;

  constructor(
    onGameOver: (winner: 'PLAYER' | 'AI') => void,
    onUnitReachedBase: (owner: 'PLAYER' | 'AI', unitId: string) => void,
    onUnitRemoved: (unit: GameUnit, reason: 'DEFEATED' | 'RETREATED' | 'SCORED_GOAL') => void,
    onPhaseChange: (phase: GamePhase) => void,
    onTurnStart: (turn: number) => void,
    onCombatEvent: (lane: number, row: number, value: number, type: 'DAMAGE' | 'HEAL' | 'STUN' | 'CRIT' | 'TRUE') => void
  ) {
    this.onGameOver = onGameOver;
    this.onUnitReachedBase = onUnitReachedBase;
    this.onUnitRemoved = onUnitRemoved;
    this.onPhaseChange = onPhaseChange;
    this.onTurnStart = onTurnStart;
    this.onCombatEvent = onCombatEvent;
  }

  start() {
    this.startTime = Date.now();
    this.lastTickTime = this.startTime;
    this.playerDP = 15;
    this.aiDP = 15;
    this.playerLP = 3;
    this.aiLP = 3;
    this.units = [];
    this.turnCount = 0;
    this.setPhase('COMMAND');
  }

  setPhase(newPhase: GamePhase) {
    this.phase = newPhase;
    this.onPhaseChange(newPhase);
  }

  executeStrategy() {
    if (this.phase !== 'COMMAND') return;
    this.setPhase('ACTION');
    this.turnCount++;
    this.onTurnStart(this.turnCount);
    
    // DP Generation: Gain 2 DP every "Execute" cycle for BOTH sides in Conflict
    this.playerDP += 2;
    this.aiDP += 2;

    // Passive: Myrtle DP Printing
    const myrtles = this.units.filter(u => u.id === 'myrtle_001');
    myrtles.forEach(m => {
      if (m.owner === 'PLAYER') this.playerDP += 3;
      else this.aiDP += 3;
    });

    // Increment turnsOnBoard for all units
    this.units.forEach(u => {
      u.turnsOnBoard++;
      
      // Decrement stuns
      if (u.stunTurns > 0) {
        u.stunTurns--;
      }
      
      // Increment SP for skills that are not active
      if (u.ability.type === 'activated' && !u.isSkillActive) {
        // Stun blocks SP gain
        if (u.stunTurns === 0 && u.sp < u.maxSp) u.sp++;
      } else if (u.isSkillActive) {
        // Decrement skill duration
        u.skillDuration--;
        if (u.skillDuration <= 0) {
          u.isSkillActive = false;
          // After skill ends, reset SP to 0
          u.sp = 0;

          // SPECIAL: Surtr deletes self after skill
          if (u.id === 'surtr_001') {
            u.hp = 0;
          }
          // SPECIAL: Amiya Caster S3 (one time per deploy)
          if (u.id === 'amiya_c_001') {
            u.maxSp = 9999; // effectively one time
            u.hp -= 2;
            this.onCombatEvent(u.lane, u.row, 2, 'DAMAGE');
          }
        }
      }
    });
    
    // In V3, we resolve Action Phase in a specific sequence
    this.resolveActionPhase();

    setTimeout(() => {
      if (this.phase === 'ACTION') {
        this.setPhase('ENEMY');
        // AI Phase happens
        setTimeout(() => {
          if (this.phase === 'ENEMY') {
            this.playerDP += 5;
            this.aiDP += 5;
            this.setPhase('COMMAND');
          }
        }, 800);
      }
    }, 1000);
  }

  private resolveActionPhase() {
    // 0. Pre-turn processing (SP, Cooldowns, Aura/Passives)
    this.units.forEach(u => {
      u.turnsOnBoard++;
      
      // Skills & SP
      if (u.ability.type === 'activated' && !u.isSkillActive) {
        if (u.stunTurns === 0 && u.sp < u.maxSp) u.sp++;
      } else if (u.isSkillActive) {
        u.skillDuration--;
        if (u.skillDuration <= 0) {
          u.isSkillActive = false;
          u.sp = 0;
          // Exit Logic
          if (u.id === 'surtr_001') u.hp = 0;
        }
      }

      // Passive Aura application (Internal)
      if (u.id === 'ptilopsis_001' && u.hp > 0) {
        // Ptilopsis is handled in movement logic frequency, but maybe give SP to others?
        // Let's stick to her movement speed description for now
      }
    });

    // 1. Combat & Healing Resolves First
    this.updateCombatAndHealingStrict();
    
    // 2. Immediate Death Check
    this.units.forEach(u => {
      // Specter Immortality
      if (u.id === 'specter_001' && u.isSkillActive && u.hp <= 0) {
        u.hp = 1;
      }
    });

    const deadUnits = this.units.filter(u => u.hp <= 0);
    deadUnits.forEach(u => {
      if (!u.isGoalSuccess) {
        this.onUnitRemoved(u, 'DEFEATED');
      }
    });
    this.units = this.units.filter(u => u.hp > 0);

    // 3. Movement Occurs Second
    this.updateMovementStrict();

    // 4. End-of-Turn Effects (Post-Movement)
    this.units.forEach(u => {
      // Nearl Passive
      if (u.id === 'nearl_001' && u.hp > 0) {
        u.hp = Math.min(u.maxHp, u.hp + 3);
      }
      // Blue Poison Poison
      if (u.id === 'blue_poison_001') {
        // Needs a way to track who she hit. Let's simplify and damage neighbors?
        // Or just target the same front unit.
        const target = this.getCollisionLockTarget(u);
        if (target) {
          target.hp -= 2;
          this.onCombatEvent(target.lane, target.row, 2, 'DAMAGE');
        }
      }
    });

    // 5. Specialist Expiration & Maintenance
    const unitsToRetreat: string[] = [];
    this.units.filter(u => u.class === 'Specialist' || u.class === 'Robot').forEach(u => {
      let shouldRetreat = false;
      if (u.id === 'jaye_001') {
        const cost = 2;
        if (u.owner === 'PLAYER') {
          if (this.playerDP >= cost) this.playerDP -= cost; else shouldRetreat = true;
        } else {
          if (this.aiDP >= cost) this.aiDP -= cost; else shouldRetreat = true;
        }
      } else if (u.class === 'Robot' && u.turnsOnBoard >= 3) {
        shouldRetreat = true;
      } else if (u.turnsOnBoard >= (['shaw_001', 'rope_001'].includes(u.id) ? 3 : 2) && !['ethan_001', 'manticore_001', 'jaye_001', 'support_001', 'support_002'].includes(u.id) && u.class !== 'Robot') {
        shouldRetreat = true;
      }
      if (shouldRetreat) unitsToRetreat.push(u.instanceId);
    });

    // 6. Specialist Maintenance (Removed persistent item effects as items are now immediate)
    this.units = this.units.filter(u => u.hp > 0);

    unitsToRetreat.forEach(instanceId => {
       const u = this.units.find(unit => unit.instanceId === instanceId);
       if (u) {
          const refund = u.owner === 'PLAYER' ? Math.floor((ALL_ASSETS.find(a => a.id === u.id)?.dp_cost || 0) * 0.25) : 0;
          if (u.owner === 'PLAYER') this.playerDP += refund;
          this.onUnitRemoved(u, 'RETREATED');
       }
       this.units = this.units.filter(unit => unit.instanceId !== instanceId);
    });

    // 6. Check Win/Loss
    if (this.playerLP <= 0) { this.setPhase('GAMEOVER'); this.onGameOver('AI'); }
    else if (this.aiLP <= 0) { this.setPhase('GAMEOVER'); this.onGameOver('PLAYER'); }
  }

  private updateCombatAndHealingStrict() {
    type PendingEffect = { source: GameUnit; target: GameUnit; type: 'ATTACK' | 'HEAL' | 'TRUE' };
    const pendingEffects: PendingEffect[] = [];

    this.units.forEach(unit => {
      if (unit.hp <= 0 || unit.stunTurns > 0) return;
      if (unit.class === 'Item' && unit.atk <= 0) return;

      if (unit.class === 'Medic') {
        this.resolveMedicHealing(unit, pendingEffects);
        return;
      }

      // 1. Broad AOE/Lane effects
      if (unit.id === 'ifrit_001') {
        // Hits all enemies in the same lane (Straight line)
        this.units.filter(u => u.owner !== unit.owner && u.lane === unit.lane).forEach(t => {
          pendingEffects.push({ source: unit, target: t, type: 'ATTACK' });
        });
        return;
      }

      if (unit.id === 'silverash_001' && unit.isSkillActive) {
        // TSS: Target up to 3 units in range 2, across lanes
        const targets = this.units.filter(u => 
          u.owner !== unit.owner && 
          Math.abs(u.lane - unit.lane) <= 1 &&
          (unit.owner === 'PLAYER' ? (unit.row - u.row >= 0 && unit.row - u.row <= 2) : (u.row - unit.row >= 0 && u.row - unit.row <= 2))
        ).slice(0, 3);
        targets.forEach(t => pendingEffects.push({ source: unit, target: t, type: 'ATTACK' }));
        return;
      }

      // 2. Normal Combat
      const isAoeSpecialist = unit.id === 'ethan_001' || unit.id === 'manticore_001';
      const isDefenderMulti = unit.class === 'Defender' && this.isUnitEngaged(unit);

      if (isAoeSpecialist || isDefenderMulti) {
        const range = [unit.row, (unit.owner === 'PLAYER' ? unit.row - 1 : unit.row + 1)];
        const targets = this.units.filter(u => 
          u.owner !== unit.owner && u.lane === unit.lane && range.includes(u.row)
        );
        const limit = isAoeSpecialist ? 99 : unit.blockCount;
        targets.slice(0, limit).forEach(t => pendingEffects.push({ source: unit, target: t, type: 'ATTACK' }));
      } else {
        const meleeTarget = this.getCollisionLockTarget(unit);
        if (meleeTarget) {
          pendingEffects.push({ source: unit, target: meleeTarget, type: 'ATTACK' });
        } else if (['Sniper', 'Caster'].includes(unit.class) || unit.id === 'platinum_001') {
          const target = this.getRangedTarget(unit);
          if (target) pendingEffects.push({ source: unit, target, type: 'ATTACK' });
        }
      }
    });

    // Execute all effects
    pendingEffects.forEach(eff => {
      if (eff.type === 'HEAL') this.applyHealing(eff.source, eff.target);
      else if (eff.type === 'TRUE') this.applyDamage(eff.source, eff.target, 'TRUE');
      else {
        // Physical/Arts branch
        const isArts = eff.source.class === 'Caster' || eff.source.id === 'amiya_c_001';
        this.applyDamage(eff.source, eff.target, isArts ? 'ARTS' : 'PHYSICAL');
      }
    });
  }

  private applyDamage(attacker: GameUnit, target: GameUnit, type: 'PHYSICAL' | 'ARTS' | 'TRUE') {
    let baseAtk = attacker.atk;
    
    // Duelist Melantha
    if (attacker.id === 'melantha_001') {
      const enemiesInSlot = this.units.filter(u => u.owner !== attacker.owner && u.lane === attacker.lane && u.row === target.row).length;
      if (enemiesInSlot === 1) baseAtk += 3;
    }

    // Skill modifiers
    if (attacker.isSkillActive) {
      if (attacker.id === 'amiya_g_001') type = 'TRUE'; // Ying Xiao
      if (attacker.id === 'saga_001') {
        // Saga cleave logic handle: we already target, but maybe buff dmg
        baseAtk = Math.floor(baseAtk * 1.5);
      }
    }

    // Crit Sniper
    if (attacker.class === 'Sniper' && Math.random() < 0.2) {
      baseAtk = Math.floor(baseAtk * 1.6);
      this.onCombatEvent(target.lane, target.row, 0, 'CRIT');
    }

    let finalDmg = 0;
    if (type === 'TRUE') {
      finalDmg = baseAtk;
    } else if (type === 'ARTS') {
      const resVal = target.res || 0;
      // Amiya Caster S3 ignores some res
      const effectiveRes = (attacker.id === 'amiya_c_001' && attacker.isSkillActive) ? Math.max(0, resVal - 15) : resVal;
      finalDmg = Math.max(2, Math.floor(baseAtk * (1 - (effectiveRes / 100))));
    } else {
      // Physical
      let def = target.def;
      // Haze Debuff
      if (this.units.some(u => u.id === 'haze_001' && u.owner === attacker.owner && u.lane === attacker.lane)) def = Math.max(0, def - 3);
      // UAV Scout Debuff
      if (this.units.some(u => u.id === 'item_drone_01' && u.owner === attacker.owner && u.lane === attacker.lane)) def = Math.max(0, def - 5);
      
      finalDmg = Math.max(Math.ceil(baseAtk * 0.05), Math.floor(baseAtk - def), 2);
    }

    target.hp -= finalDmg;
    this.onCombatEvent(target.lane, target.row, finalDmg, type === 'TRUE' ? 'TRUE' : 'DAMAGE');

    // Reaction Effects
    if (target.id === 'hoshiguma_001') {
      attacker.hp -= 2; // Thorns
    }
    if (target.id === 'liskarm_001' && finalDmg > 0) {
      if (target.owner === 'PLAYER') this.playerDP += 1; else this.aiDP += 1;
    }

    // Multi-taps
    if (attacker.id === 'kroos_001') this.applyDamageSimple(attacker.atk, target, 'PHYSICAL');
    if (attacker.id === 'exusiai_001' && attacker.isSkillActive) {
      for(let i=0; i<4; i++) this.applyDamageSimple(attacker.atk, target, 'PHYSICAL');
    }
  }

  private applyDamageSimple(atk: number, target: GameUnit, type: 'PHYSICAL' | 'ARTS') {
    const dmg = type === 'ARTS' ? Math.max(2, Math.floor(atk * (1-(target.res/100)))) : Math.max(2, atk - target.def);
    target.hp -= dmg;
    this.onCombatEvent(target.lane, target.row, dmg, 'DAMAGE');
  }

  private resolveMedicHealing(medic: GameUnit, pending: any[]) {
    const isPlayer = medic.owner === 'PLAYER';
    const range = [0, 1, 2];
    const allies = this.units.filter(u => 
      u.owner === medic.owner && 
      u.lane === medic.lane && 
      range.includes(isPlayer ? medic.row - u.row : u.row - medic.row) &&
      u.hp < u.maxHp && u.class !== 'Item'
    );
    if (allies.length > 0) {
      allies.sort((a,b) => (a.hp/a.maxHp) - (b.hp/b.maxHp));
      pending.push({ source: medic, target: allies[0], type: 'HEAL' });
    }
  }

  private applyHealing(medic: GameUnit, target: GameUnit) {
    const power = Math.floor(medic.atk * 0.85);
    target.hp = Math.min(target.maxHp, target.hp + power);
    this.onCombatEvent(target.lane, target.row, power, 'HEAL');
    // Shining Buff
    if (medic.id === 'shining_001') {
      // Temporary armor? For now let's just make her heal stronger
      target.hp = Math.min(target.maxHp, target.hp + 2);
    }
  }

  private getRangedTarget(attacker: GameUnit): GameUnit | null {
    const isPlayer = attacker.owner === 'PLAYER';
    let rangeLimit = 2;
    if (attacker.id === 'platinum_001') rangeLimit = 3;
    if (attacker.id === 'ifrit_001') rangeLimit = 6;

    const enemies = this.units.filter(u => {
      if (u.owner === attacker.owner || u.lane !== attacker.lane) return false;
      const dist = isPlayer ? (attacker.row - u.row) : (u.row - attacker.row);
      if (dist < 0 || dist > rangeLimit) return false;
      // Stealth check
      if (u.id === 'manticore_001' || u.id === 'ethan_001') {
        const isEngaged = this.units.some(a => a.owner === attacker.owner && a.lane === u.lane && a.row === u.row && a.blockCount > 0);
        if (!isEngaged) return false; // Untargetable if not blocked
      }
      
      // Specialized Reveal Logic: If a stealth unit is blocking an enemy in a collision lock, 
      // they should "appear" (become targetable) to reflect the "push forward" blocking.
      const isBlockingTarget = this.units.some(a => a.owner !== u.owner && a.lane === u.lane && a.row === u.row && a.blockCount > 0);
      if (isBlockingTarget && (u.id === 'manticore_001' || u.id === 'ethan_001')) {
        return true; // Revealed by blocking
      }

      return true;
    });

    if (enemies.length === 0) return null;
    return enemies.sort((a,b) => Math.abs(a.row - attacker.row) - Math.abs(b.row - attacker.row))[0];
  }

  private isUnitBlocked(unit: GameUnit): boolean {
    const isPlayer = unit.owner === 'PLAYER';
    const nextRow = isPlayer ? unit.row - 1 : unit.row + 1;
    
    // CENTER STAGE (Row 3) SPECIAL RULES:
    // Units are NOT blocked from moving INTO Row 3 by an enemy.
    // They are only blocked if they are already in Row 3 and an enemy is there.
    if (unit.row === 3) {
      const blockers = this.units.filter(u => u.owner !== unit.owner && u.lane === unit.lane && u.row === 3 && u.blockCount > 0);
      if (blockers.length > 0) return true;
    }
    
    // If we're not moving into Row 3, check for blockers in the destination row
    if (nextRow !== 3) {
      const blockerInNext = this.units.find(u => u.owner !== unit.owner && u.lane === unit.lane && u.row === nextRow && u.blockCount > 0);
      if (blockerInNext) return true;
    }

    return false;
  }

  private updateMovementStrict() {
    this.units.forEach(unit => {
      if (unit.stunTurns > 0 || unit.hp <= 0) { unit.isMoving = false; return; }
      
      // DEPLOYMENT DELAY: Newly deployed units stay in position for their first TWO turns.
      // They stay invisible for Turn 1, and remain stationary for Turn 2.
      // Movement only begins after the 3rd authorization (turnsOnBoard > 2).
      if (unit.turnsOnBoard <= 2) { 
        unit.isMoving = false; 
        return; 
      }

      const ownerLP = unit.owner === 'PLAYER' ? this.playerLP : this.aiLP;
      if (unit.class === 'Vanguard' && ownerLP > 1) { unit.isStationary = true; return; } else { unit.isStationary = false; }
      if (unit.isStationary) return;

      const isRanged = ['Sniper', 'Caster', 'Medic'].includes(unit.class);
      if (isRanged) {
        let frequency = 3;
        if (this.units.some(u => u.id === 'ptilopsis_001' && u.owner === unit.owner && u.lane === unit.lane)) frequency = 2;
        if (unit.turnsOnBoard % frequency !== 0) { unit.isMoving = false; return; }
      }
      if (['Defender', 'Guard'].includes(unit.class) && unit.turnsOnBoard % 2 !== 0) { unit.isMoving = false; return; }

      const nextRow = unit.owner === 'PLAYER' ? unit.row - 1 : unit.row + 1;
      if (this.isUnitBlocked(unit)) { unit.isMoving = false; return; }

      if (nextRow !== 3) {
        if (this.units.find(u => u.lane === unit.lane && u.row === nextRow)) { unit.isMoving = false; return; }
      } else {
        if (this.units.find(u => u.lane === unit.lane && u.row === 3 && u.owner === unit.owner)) { unit.isMoving = false; return; }
      }

      unit.row = nextRow;
      unit.isMoving = true;

      if (unit.owner === 'PLAYER' && unit.row <= 0) {
        this.aiLP -= 1;
        unit.isGoalSuccess = true;
        this.onUnitReachedBase('PLAYER', unit.id);
        this.onUnitRemoved(unit, 'SCORED_GOAL');
        unit.hp = 0;
      } else if (unit.owner === 'AI' && unit.row >= 6) {
        this.playerLP -= 1;
        unit.isGoalSuccess = true;
        this.onUnitReachedBase('AI', unit.id);
        this.onUnitRemoved(unit, 'SCORED_GOAL');
        unit.hp = 0;
      }
    });
    this.units = this.units.filter(u => u.hp > 0);
  }

  private getCollisionLockTarget(unit: GameUnit): GameUnit | null {
    const sameRowEnemy = this.units.find(u => u.owner !== unit.owner && u.lane === unit.lane && u.row === unit.row);
    if (sameRowEnemy) return sameRowEnemy;
    const nextRow = unit.owner === 'PLAYER' ? unit.row - 1 : unit.row + 1;
    return this.units.find(u => u.owner !== unit.owner && u.lane === unit.lane && u.row === nextRow) || null;
  }

  private isUnitEngaged(unit: GameUnit): boolean {
    const isPlayer = unit.owner === 'PLAYER';
    const nextRow = isPlayer ? unit.row - 1 : unit.row + 1;
    return this.units.some(u => 
      u.owner !== unit.owner && 
      u.lane === unit.lane && 
      (u.row === unit.row || u.row === nextRow)
    );
  }

  retreatUnit(instanceId: string) {
    const unit = this.units.find(u => u.instanceId === instanceId);
    if (!unit || unit.owner !== 'PLAYER') return;
    
    const op = ALL_ASSETS.find(a => a.id === unit.id);
    if (op) {
      this.playerDP += Math.floor(op.dp_cost * 0.5);
    }
    
    this.onUnitRemoved(unit, 'RETREATED');
    this.units = this.units.filter(u => u.instanceId !== instanceId);
  }

  activateSkill(instanceId: string) {
    const unit = this.units.find(u => u.instanceId === instanceId);
    if (!unit || unit.owner !== 'PLAYER' || unit.ability.type !== 'activated') return;
    
    if (unit.sp < unit.maxSp || unit.isSkillActive) return;

    unit.isSkillActive = true;
    unit.skillDuration = unit.ability.duration || 1; 

    // Special logic for instant skills or permanent toggles
    if (unit.id === 'saga_001') {
      this.playerDP += 2;
      const target = this.units.find(u => u.lane === unit.lane && u.row === unit.row - 1 && u.owner === 'AI');
      if (target) {
        target.hp -= Math.max(5, unit.atk * 1.5);
        this.onCombatEvent(target.lane, target.row, Math.max(5, unit.atk * 1.5), 'DAMAGE');
      }
    } else if (unit.id === 'cuora_001') {
      unit.hp = Math.min(unit.maxHp, unit.hp + 10);
      unit.def += 5;
      unit.isStationary = true;
    } else if (unit.id === 'silverash_001') {
      // TSS logic is handled in combat loop during isSkillActive
    } else if (unit.id === 'specter_001') {
      unit.hp = Math.max(1, unit.hp);
    } else if (unit.id === 'surtr_001') {
      unit.atk += 10;
    } else if (unit.id === 'exusiai_001') {
      // Exu overload is 5 hits, handled in applyDamage
    }

    if (!unit.ability.duration) {
      unit.isSkillActive = false;
      unit.sp = 0;
    }
  }

  private applyDisplacement(target: GameUnit, deltaRow: number) {
    const nextRow = target.row + deltaRow;
    
    // Bounds check
    if (nextRow < 0 || nextRow > 6) {
      target.hp -= 10; // Edge collision damage
      this.onCombatEvent(target.lane, target.row, 10, 'DAMAGE');
      target.stunTurns = 2;
      return;
    }

    // Check if target slot is occupied (Row 3 allows dual occupancy per owner)
    const isOccupied = this.units.some(u => 
      u.instanceId !== target.instanceId && 
      u.lane === target.lane && 
      u.row === nextRow &&
      (nextRow === 3 ? u.owner === target.owner : true)
    );

    if (isOccupied) {
      // Collision damage if blocked
      target.hp -= 15;
      this.onCombatEvent(target.lane, target.row, 15, 'DAMAGE');
      target.stunTurns = 2;
    } else {
      // Actual displacement
      target.row = nextRow;
      target.stunTurns = 1; // Displacement stun
      this.onCombatEvent(target.lane, target.row, 0, 'STUN');
      target.lastMoveTime = Date.now(); // Reset movement throttle
    }
  }

  private triggerOnDeploy(unit: GameUnit) {
    if (unit.ability.type !== 'on_deploy') return;

    if (unit.id === 'texas_001') {
       // Stun enemy in current slot
       this.units.filter(u => u.lane === unit.lane && u.row === unit.row && u.owner !== unit.owner).forEach(u => {
         u.stunTurns = 2;
         this.onCombatEvent(u.lane, u.row, 0, 'STUN');
       });
    } else if (unit.id === 'eyjafjalla_001') {
       this.units.filter(u => u.lane === unit.lane && u.owner !== unit.owner).forEach(u => {
         u.hp -= 10;
         this.onCombatEvent(u.lane, u.row, 10, 'DAMAGE');
       });
    } else if (unit.id === 'mostima_001') {
       // Mostima: Push all enemies in lane back 1 slot
       const enemies = this.units.filter(u => u.lane === unit.lane && u.owner !== unit.owner);
       // Sort so units closest to the edge move first to avoid unnecessary chain-collisions
       enemies.sort((a, b) => {
         const delta = a.owner === 'PLAYER' ? 1 : -1;
         return delta > 0 ? b.row - a.row : a.row - b.row;
       });
       enemies.forEach(u => {
          const delta = u.owner === 'PLAYER' ? 1 : -1;
          this.applyDisplacement(u, delta);
       });
    } else if (unit.id === 'red_001') {
       const target = this.units.find(u => u.lane === unit.lane && u.row === unit.row && u.owner !== unit.owner);
       if (target) {
         target.hp -= 10;
         this.onCombatEvent(target.lane, target.row, 10, 'DAMAGE');
       }
    } else if (unit.id === 'gravel_001') {
       unit.hp += 25;
       unit.maxHp += 25;
    } else if (unit.id === 'aak_001') {
       const ally = this.units.find(u => u.owner === unit.owner && u.lane === unit.lane && u.row === (unit.owner === 'PLAYER' ? unit.row - 1 : unit.row + 1));
       if (ally) {
         ally.hp -= 2;
         ally.atk += 5;
       }
    } else if (unit.id === 'shaw_001') {
       // Shaw: Push enemy in same slot back 1 slot
       const target = this.units.find(u => u.lane === unit.lane && u.row === unit.row && u.owner !== unit.owner);
       if (target) {
          const delta = target.owner === 'PLAYER' ? 1 : -1;
          this.applyDisplacement(target, delta);
       }
    } else if (unit.id === 'rope_001') {
       // Rope: Pull enemy in front slot forward 1 slot
       const frontRow = unit.owner === 'PLAYER' ? unit.row - 1 : unit.row + 1;
       const target = this.units.find(u => u.lane === unit.lane && u.row === frontRow && u.owner !== unit.owner);
       if (target) {
          const delta = target.owner === 'PLAYER' ? -1 : 1;
          this.applyDisplacement(target, delta);
       }
    } else if (unit.id === 'support_002') {
       this.units.filter(u => u.owner === unit.owner).forEach(u => u.hp = Math.min(u.maxHp, u.hp + 5));
    } else if (unit.id === 'support_001') {
       // Castle-3: Tactical Support
       this.units.filter(u => u.owner === unit.owner && (u.class === 'Guard' || u.class === 'Defender')).forEach(u => {
          u.atk += 2;
          u.def += 2;
       });
    }
  }

  canDeploy(unitClass: string, rowIndex: number, owner: 'PLAYER' | 'AI'): boolean {
    if (owner === 'PLAYER') {
      // Player can ONLY deploy in Rows 4 and 5
      if (rowIndex === 4) {
        const rangedClasses = ['Sniper', 'Caster', 'Medic'];
        return !rangedClasses.includes(unitClass);
      }
      if (rowIndex === 5) return true;
      return false;
    } else {
      // AI Logic: Backline and Frontline (Rows 1 and 2)
      if (rowIndex === 1) return true;
      if (rowIndex === 2) {
        const rangedClasses = ['Sniper', 'Caster', 'Medic'];
        return !rangedClasses.includes(unitClass);
      }
      return false;
    }
  }

  tick() {
    if (this.isPaused || this.phase === 'GAMEOVER') return;
    
    // Real-time DP Regeneration (Passive: ~1 DP every 5 seconds)
    if (this.phase === 'COMMAND') {
        const now = Date.now();
        const delta = (now - this.lastTickTime) / 1000;
        this.lastTickTime = now;
        
        // Accumulate DP
        this.playerDP = Math.min(99, this.playerDP + 0.2 * delta);
        this.aiDP = Math.min(99, this.aiDP + 0.2 * delta);
    } else {
        this.lastTickTime = Date.now();
    }
  }

  useItem(operator: Operator, lane: number, row: number, owner: 'PLAYER' | 'AI', bypassCost: boolean = false): boolean {
    const cost = operator.dp_cost;
    if (!bypassCost) {
      if (owner === 'PLAYER') {
        if (this.playerDP < cost) return false;
        this.playerDP -= cost;
      } else {
        if (this.aiDP < cost) return false;
        this.aiDP -= cost;
      }
    }

    // Apply immediate effect based on item ID
    if (operator.id === 'item_med_01') {
      // Heal all allies in a 3x3 area around target
      this.units.filter(u => u.owner === owner && Math.abs(u.lane - lane) <= 1 && Math.abs(u.row - row) <= 1)
        .forEach(u => {
          u.hp = Math.min(u.maxHp, u.hp + 15);
          this.onCombatEvent(u.lane, u.row, 15, 'HEAL');
        });
    } else if (operator.id === 'item_mine_01') {
      // Damage all enemies in a 3x3 area
      this.units.filter(u => u.owner !== owner && Math.abs(u.lane - lane) <= 1 && Math.abs(u.row - row) <= 1)
        .forEach(u => {
          u.hp -= 30;
          this.onCombatEvent(u.lane, u.row, 30, 'DAMAGE');
        });
    } else if (operator.id === 'item_drone_01') {
      // Global DP boost or something? Let's make it a tactical scan
      // For now, just damage everyone in lane
      this.units.filter(u => u.owner !== owner && u.lane === lane)
        .forEach(u => {
          u.hp -= 10;
          this.onCombatEvent(u.lane, u.row, 10, 'DAMAGE');
        });
    }

    return true;
  }

  deployUnit(operator: Operator, owner: 'PLAYER' | 'AI', lane: number, row: number, bypassCost: boolean = false) {
    if (operator.class === 'Item') return this.useItem(operator, lane, row, owner, bypassCost);
    if (!this.canDeploy(operator.class, row, owner)) return false;
    
    const cost = operator.dp_cost;
    if (!bypassCost) {
      if (owner === 'PLAYER') {
        if (this.playerDP < cost) return false;
        this.playerDP -= cost;
      } else {
        if (this.aiDP < cost) return false;
        this.aiDP -= cost;
      }
    }

    // Check occupancy (except for Row 3 which allows dual occupancy)
    if (row !== 3) {
      if (this.units.find(u => u.lane === lane && u.row === row)) {
        return false;
      }
    } else {
      // In Row 3, allow one player and one AI unit
      if (this.units.find(u => u.lane === lane && u.row === row && u.owner === owner)) {
        return false;
      }
    }

    const newUnit: GameUnit = {
      id: operator.id,
      instanceId: Math.random().toString(36).substr(2, 9),
      owner,
      isAlly: owner === 'PLAYER',
      lane,
      row,
      hp: operator.stats.hp,
      maxHp: operator.stats.hp,
      atk: operator.stats.atk,
      def: operator.stats.def,
      initialAtk: operator.stats.atk,
      initialDef: operator.stats.def,
      speed: 0,
      lastMoveTime: Date.now(),
      lastCombatTime: 0,
      isMoving: true,
      isStationary: operator.class === 'Vanguard' || operator.class === 'Specialist' || operator.class === 'Robot',
      rarity: operator.rarity,
      class: operator.class,
      name: operator.name,
      ability: operator.ability,
      stunTurns: 0,
      silenced: false,
      turnsOnBoard: 0,
      sp: operator.ability.initialSp || 0,
      maxSp: operator.ability.sp || 10,
      res: (operator.class === 'Caster' || operator.class === 'Medic') ? 15 : 0,
      blockCount: this.getDefaultBlockCount(operator.class),
      isSkillActive: false,
      skillDuration: 0
    };

    this.units.push(newUnit);

    // SPECIAL: Roadblock has extreme block count
    if (newUnit.id === 'item_block_01') {
      newUnit.blockCount = 99;
    }

    this.triggerOnDeploy(newUnit);
    return true;
  }

  public swapUnits(id1: string, id2: string): boolean {
    const u1 = this.units.find(u => u.instanceId === id1);
    const u2 = this.units.find(u => u.instanceId === id2);

    if (!u1 || !u2 || u1.owner !== u2.owner) return false;

    // Movement/Action consequence logic:
    // Swapping requires neural synchronization energy (DP)
    const SWAP_COST = 5;
    if (u1.owner === 'PLAYER') {
      if (this.playerDP < SWAP_COST) return false;
      this.playerDP -= SWAP_COST;
    } else {
      if (this.aiDP < SWAP_COST) return false;
      this.aiDP -= SWAP_COST;
    }

    // Swap lanes and rows
    const tempLane = u1.lane;
    const tempRow = u1.row;
    u1.lane = u2.lane;
    u1.row = u2.row;
    u2.lane = tempLane;
    u2.row = tempRow;

    // Reset move timers and stun for a short duration to signify "sync recovery"
    u1.lastMoveTime = Date.now();
    u2.lastMoveTime = Date.now();
    
    // Optional: Add a brief stun or block move for 1 turn?
    // User said "not just swap anytime without any consequence".
    // DP cost + movement reset is already decent. Let's stick with DP cost for now.

    return true;
  }

  private getDefaultBlockCount(className: string): number {
    switch (className) {
      case 'Defender': return 3;
      case 'Vanguard': return 2;
      case 'Guard': return 2;
      case 'Specialist': return 1;
      case 'Sniper': return 1;
      case 'Caster': return 1;
      case 'Medic': return 1;
      case 'Robot': return 1;
      case 'Item': return 2; // Default for things like Medical Station
      default: return 1;
    }
  }
}
