import { BattleKernel } from './BattleKernel';
import { ALL_ASSETS, Operator } from '../data/operators';

export class MirrorAI {
  kernel: BattleKernel;
  squad: Operator[] = [];
  lastDeployTime: number = 0;

  constructor(kernel: BattleKernel) {
    this.kernel = kernel;
    this.selectRandomSquad();
  }

  private selectRandomSquad() {
    const pool = [...ALL_ASSETS];
    for (let i = 0; i < 12; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      this.squad.push(pool.splice(idx, 1)[0]);
    }
  }

  update() {
    if (this.kernel.phase !== 'ENEMY') return;
    const now = Date.now();
    if (now - this.lastDeployTime < 300) return; 

    // 0. Auto-Activate AI Skills
    this.kernel.units.filter(u => u.owner === 'AI' && u.ability.type === 'activated' && u.sp >= u.maxSp && !u.isSkillActive).forEach(u => {
      this.kernel.activateSkill(u.instanceId);
    });

    const availableSquad = this.squad.filter(op => 
      !this.kernel.units.some(u => u.id === op.id && u.owner === 'AI')
    );
    if (availableSquad.length === 0) return;

    // Tactical Assessment: Which lane is most threatened?
    const laneThreats = [0, 1, 2].map(l => {
      const enemies = this.kernel.units.filter(u => u.owner === 'PLAYER' && u.lane === l);
      const protectors = this.kernel.units.filter(u => u.owner === 'AI' && u.lane === l);
      return { lane: l, score: enemies.length - protectors.length, enemyCount: enemies.length };
    }).sort((a,b) => b.score - a.score);

    const targetLane = laneThreats[0].lane;

    // 1. Critical Defense: If a player unit is close to AI base (Row 1 or 2)
    const dangerousUnit = this.kernel.units.find(u => u.owner === 'PLAYER' && u.row <= 2);
    if (dangerousUnit) {
      const blocker = availableSquad.find(op => op.class === 'Defender' || op.class === 'Guard');
      if (blocker && this.kernel.aiDP >= blocker.dp_cost) {
        if (this.kernel.deployUnit(blocker, 'AI', dangerousUnit.lane, 2)) {
          this.lastDeployTime = now;
          return;
        }
      }
    }

    // 2. Standard Deployment Logic
    // Start with Vanguard if turn is early or DP is low
    if (this.kernel.turnCount < 5 && this.kernel.aiDP < 20) {
      const vanguard = availableSquad.find(op => op.class === 'Vanguard');
      if (vanguard && this.kernel.aiDP >= vanguard.dp_cost) {
        if (this.kernel.deployUnit(vanguard, 'AI', targetLane, 1)) {
          this.lastDeployTime = now;
          return;
        }
      }
    }

    // Medic Support: If a unit in target lane is damaged
    const damagedUnit = this.kernel.units.find(u => u.owner === 'AI' && u.lane === targetLane && u.hp < u.maxHp);
    if (damagedUnit) {
      const medic = availableSquad.find(op => op.class === 'Medic');
      if (medic && this.kernel.aiDP >= medic.dp_cost) {
        // Deploy medic in row 1
        if (this.kernel.deployUnit(medic, 'AI', targetLane, 1)) {
          this.lastDeployTime = now;
          return;
        }
      }
    }

    // Ranged Support: If an enemy is in row 2 or 3 of target lane
    const targetEnemy = this.kernel.units.find(u => u.owner === 'PLAYER' && u.lane === targetLane && u.row <= 3);
    if (targetEnemy) {
      const ranged = availableSquad.find(op => op.class === 'Caster' || op.class === 'Sniper');
      if (ranged && this.kernel.aiDP >= ranged.dp_cost) {
        if (this.kernel.deployUnit(ranged, 'AI', targetLane, 1)) {
          this.lastDeployTime = now;
          return;
        }
      }
    }

    // General high-pressure deployment
    if (this.kernel.aiDP > 20) {
      const op = availableSquad[Math.floor(Math.random() * availableSquad.length)];
      if (op && this.kernel.aiDP >= op.dp_cost) {
        const row = ['Sniper', 'Caster', 'Medic'].includes(op.class) ? 1 : 2;
        if (this.kernel.deployUnit(op, 'AI', targetLane, row)) {
          this.lastDeployTime = now;
          return;
        }
      }
    }
  }
}
