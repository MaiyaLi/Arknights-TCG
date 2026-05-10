import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Pause, 
  Play, 
  RotateCcw, 
  Zap, 
  Heart,
  Trash2,
  Star
} from 'lucide-react';
import { UserProfile } from '../types';
import { ALL_ASSETS, AI_ENEMIES, Operator } from '../data/operators';
import { BattleKernel, GameUnit, GamePhase } from '../game/BattleKernel';
import { MirrorAI } from '../game/MirrorAI';
import { getSpriteImagePath, getCardImagePath } from '../utils/assetUtils';

interface SimulationScreenProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onBack: () => void;
  onMatchEnd: (result: 'Win' | 'Loss') => void;
}

interface FloatingLabel {
  id: string;
  x: number;
  y: number;
  value: string;
  type: 'DAMAGE' | 'HEAL' | 'STUN' | 'CRIT' | 'TRUE';
  life: number; // 1.0 (new) to 0.0 (dead)
  createdAt: number;
}

export default function SimulationScreen({ userProfile, onUpdateProfile, onBack, onMatchEnd }: SimulationScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1. State declarations first
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [playerHand, setPlayerHand] = useState<Operator[]>([]);
  const [playerSquad, setPlayerSquad] = useState<Operator[]>([]);
  const [playerDeck, setPlayerDeck] = useState<Operator[]>([]);
  const [mulliganPhase, setMulliganPhase] = useState(true);
  const [mulliganSelected, setMulliganSelected] = useState<number[]>([]);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [winner, setWinner] = useState<'PLAYER' | 'AI' | null>(null);
  const [phase, setPhase] = useState<GamePhase>('COMMAND');
  const [draggingOp, setDraggingOp] = useState<{ op: Operator, index: number } | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [selectedUnit, setSelectedUnit] = useState<GameUnit | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ lane: number, row: number } | null>(null);
  const [playerCooldowns, setPlayerCooldowns] = useState<{ op: Operator, turnsRemaining: number }[]>([]);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  
  const lastDragTime = useRef<number>(0);
  
  const floatingLabels = useRef<FloatingLabel[]>([]);
  
  const [uiState, setUiState] = useState({
    playerLP: 3,
    aiLP: 3,
    playerDP: 15,
    aiDP: 15,
  });

  const spriteImages = useRef<Record<string, HTMLImageElement>>({});

  // 2. Handlers used in kernel initialization
  const handleGameOver = (winner: 'PLAYER' | 'AI') => {
    onMatchEnd(winner === 'PLAYER' ? 'Win' : 'Loss');
    setWinner(winner);
    setIsPaused(true);
  };

  const handleUnitReachedBase = (owner: 'PLAYER' | 'AI', unitId: string) => {
    // Scoring units are now handled via onUnitRemoved with 'SCORED_GOAL'
  };

  const handleUnitRemoved = (unit: GameUnit, reason: 'DEFEATED' | 'RETREATED' | 'SCORED_GOAL') => {
    if (reason === 'SCORED_GOAL') {
      // Permanent removal: Do NOT add back to cooldowns or deck
      return;
    }
    
    if (unit.owner === 'PLAYER') {
      const op = ALL_ASSETS.find(a => a.id === unit.id);
      if (op) {
        // Items are ONLY allowed once per game
        if (op.class === 'Item') {
          return;
        }

        let cooldown = 4; // Base 4 turns
        if (op.class === 'Specialist') cooldown = 1; // Fast Redeploy
        if (op.id === 'fang_001') cooldown -= 1; // Passive
        
        // Items and Robots might have different rules
        if (op.class === 'Robot') cooldown = 8; // Robots have long cooldowns
        if (op.class === 'Item') cooldown = 10; // Items are usually one-off or very long
        
        setPlayerCooldowns(prev => [...prev, { op, turnsRemaining: Math.max(1, cooldown) }]);
      }
    }
  };

  const handleTurnStart = (turn: number) => {
    setPlayerCooldowns(prev => {
      const updated = prev.map(c => ({ ...c, turnsRemaining: c.turnsRemaining - 1 }));
      const finished = updated.filter(c => c.turnsRemaining <= 0);
      const remaining = updated.filter(c => c.turnsRemaining > 0);
      
      if (finished.length > 0) {
        setPlayerDeck(deck => [...deck, ...finished.map(c => c.op)]);
      }
      
      return remaining;
    });
  };

  const handleCombatEvent = (lane: number, row: number, value: number, type: 'DAMAGE' | 'HEAL' | 'STUN' | 'CRIT') => {
    const pos = project(lane, row, 10); // Offset up a bit
    // Add jitter to prevent stacking overlap
    const jitterX = (Math.random() - 0.5) * 30;
    const jitterY = (Math.random() - 0.5) * 15;
    
    const id = Math.random().toString(36).substr(2, 9);
    floatingLabels.current.push({
      id,
      x: pos.x + jitterX,
      y: pos.y + jitterY,
      value: value > 0 ? value.toString() : '',
      type,
      life: 1.0,
      createdAt: Date.now()
    });
  };

  // 3. Game Engine Initialization
  const [kernel] = useState(() => new BattleKernel(
    handleGameOver, 
    handleUnitReachedBase, 
    handleUnitRemoved,
    (p) => setPhase(p),
    handleTurnStart,
    handleCombatEvent
  ));
  const [ai] = useState(() => new MirrorAI(kernel));

  // 2.5D Projection Constants
  const CANVAS_W = 450;
  const CANVAS_H = 400;
  const PROJECT_CONFIG = {
    topY: 100,
    bottomY: 320,
    topWidth: 220,
    bottomWidth: 420,
    zFactor: 1.3 // More natural perspective compression
  };

  const project = (l: number, r: number, z = 0) => {
    // Apply non-linear progress for perspective depth
    const linearProgress = Math.max(-0.1, r / 6);
    const progress = Math.pow(Math.abs(linearProgress), PROJECT_CONFIG.zFactor) * (linearProgress < 0 ? -1 : 1);
    
    const currY = PROJECT_CONFIG.topY + progress * (PROJECT_CONFIG.bottomY - PROJECT_CONFIG.topY);
    // Width interpolation uses linear progress to preserve lane straightness in perspective
    const currW = PROJECT_CONFIG.topWidth + linearProgress * (PROJECT_CONFIG.bottomWidth - PROJECT_CONFIG.topWidth);
    
    const startX = (CANVAS_W - currW) / 2;
    // (l + 0.5) to center in the lane
    const currX = startX + (l + 0.5) * (currW / 3);
    
    return { x: currX, y: currY - z };
  };

  const unproject = (x: number, y: number) => {
    let minDist = 1600; // 40px distance threshold squared (tighter snapping)
    let nearest = { lane: -1, row: -1 };
    for (let r = 0; r < 7; r++) {
      for (let l = 0; l < 3; l++) {
        const p = project(l, r);
        const d = Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2);
        if (d < minDist) {
          minDist = d;
          nearest = { lane: l, row: r };
        }
      }
    }
    return nearest.lane === -1 ? { lane: null, row: null } : nearest;
  };

  // 4. Render and Loop
  const render = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = CANVAS_W;
    const height = CANVAS_H;

    ctx.clearRect(0, 0, width, height);

    // Draw Atmospheric Background (Holographic Grid)
    ctx.strokeStyle = 'rgba(0, 152, 217, 0.05)';
    ctx.lineWidth = 0.5;
    const gridRows = 12;
    const gridCols = 8;
    for (let i = 0; i <= gridRows; i++) {
        const pStart = project(-1.5, i * (7 / gridRows) - 0.5);
        const pEnd = project(3.5, i * (7 / gridRows) - 0.5);
        ctx.beginPath();
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.stroke();
    }
    for (let i = 0; i <= gridCols; i++) {
        const pStart = project(i * (5 / gridCols) - 1.5, -0.5);
        const pEnd = project(i * (5 / gridCols) - 1.5, 6.5);
        ctx.beginPath();
        ctx.moveTo(pStart.x, pStart.y);
        ctx.lineTo(pEnd.x, pEnd.y);
        ctx.stroke();
    }

    // Draw Vertical Scanning Waves
    const time = Date.now() / 2000;
    for (let i = 0; i < 2; i++) {
        const rPos = ((time + i * 0.5) % 1) * 7 - 0.5;
        const pS = project(-1, rPos);
        const pE = project(3, rPos);
        ctx.strokeStyle = `rgba(0, 152, 217, ${0.1 * (1 - rPos/7)})`;
        ctx.beginPath();
        ctx.moveTo(pS.x, pS.y);
        ctx.lineTo(pE.x, pE.y);
        ctx.stroke();
    }

        // Draw Tactical Environment (Floating Platforms)
    for (let r = 0; r < 7; r++) {
      for (let l = 0; l < 3; l++) {
        const isSelected = selectedLane === l && selectedRow === r;
        const isOccupied = kernel.units.some(u => u.lane === l && u.row === r);
        
        // Item Logic: Can be dropped anywhere in rows 1-5
        const isItem = draggingOp?.op.class === 'Item';
        const classValid = isItem 
          ? (r >= 1 && r <= 5) 
          : (draggingOp ? kernel.canDeploy(draggingOp.op.class, r, 'PLAYER') : false);
        
        const isPlaceable = draggingOp && classValid && (isItem || !isOccupied);
        const isInvalid = draggingOp && (!classValid || (!isItem && isOccupied));
        
        // Platform "Pad" sizes - strictly independent
        const padSize = isSelected ? 0.43 : 0.4; 
        
        const center = project(l, r);
        const p0 = project(l - padSize, r - padSize);
        const p1 = project(l + padSize, r - padSize);
        const p2 = project(l + padSize, r + padSize);
        const p3 = project(l - padSize, r + padSize);

        // Side Depth for the Platform
        const baseHeight = (r === 0 || r === 6) ? 6 : 4;
        const p0d = { x: p0.x, y: p0.y + baseHeight };
        const p1d = { x: p1.x, y: p1.y + baseHeight };
        const p2d = { x: p2.x, y: p2.y + baseHeight };
        const p3d = { x: p3.x, y: p3.y + baseHeight };

        // Draw Sides (Front and Right with lighting)
        let sideColor = isSelected 
          ? 'rgba(0, 255, 231, 0.4)' 
          : (isPlaceable ? 'rgba(0, 152, 217, 0.25)' : 'rgba(0, 152, 217, 0.1)');
        
        if (isInvalid) {
          sideColor = 'rgba(255, 59, 59, 0.15)';
        }
        
        ctx.fillStyle = sideColor;
        ctx.beginPath();
        ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p2d.x, p2d.y); ctx.lineTo(p3d.x, p3d.y);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = isSelected 
          ? 'rgba(0, 255, 231, 0.3)' 
          : (isPlaceable ? 'rgba(0, 152, 217, 0.2)' : 'rgba(0, 152, 217, 0.05)');
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p1d.x, p1d.y); ctx.lineTo(p2d.x, p2d.y);
        ctx.closePath();
        ctx.fill();

        // Draw Top Surface
        let surfaceColor = isSelected 
          ? 'rgba(0, 152, 217, 0.4)' 
          : (isPlaceable ? 'rgba(0, 152, 217, 0.2)' : 'rgba(10, 10, 20, 0.98)');
        
        let borderColor = isSelected 
          ? 'rgba(0, 255, 231, 1)' 
          : (isPlaceable ? 'rgba(0, 255, 231, 1)' : 'rgba(0, 152, 217, 0.15)');

        if (isInvalid) {
          surfaceColor = 'rgba(255, 59, 59, 0.05)';
          borderColor = 'rgba(255, 59, 59, 0.2)';
        }

        if (r === 0) {
          // ENEMY GOAL (RED BOX)
          surfaceColor = isSelected ? 'rgba(255, 59, 59, 0.8)' : (isInvalid ? 'rgba(255, 59, 59, 0.2)' : 'rgba(255, 59, 59, 0.4)');
          borderColor = 'rgba(255, 0, 0, 1)';
          
          // Add Holographic Pillar effect for Goal
          const pPillar = project(l, r, 20);
          const pillarGrad = ctx.createLinearGradient(0, center.y, 0, pPillar.y);
          pillarGrad.addColorStop(0, 'rgba(255, 59, 59, 0.3)');
          pillarGrad.addColorStop(1, 'rgba(255, 59, 59, 0)');
          ctx.fillStyle = pillarGrad;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(pPillar.x + 10, pPillar.y); ctx.lineTo(pPillar.x - 10, pPillar.y);
          ctx.closePath();
          ctx.fill();

          // Add portal lines
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y); ctx.lineTo(p2.x, p2.y);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y);
          ctx.stroke();
        } else if (r === 6) {
          // PLAYER GOAL (BLUE BOX)
          surfaceColor = isSelected ? 'rgba(0, 255, 231, 0.7)' : (isInvalid ? 'rgba(255, 59, 59, 0.2)' : 'rgba(0, 255, 231, 0.4)');
          borderColor = 'rgba(0, 255, 231, 1)';
          
          // Add Holographic Pillar effect
          const pPillar = project(l, r, 20);
          const pillarGrad = ctx.createLinearGradient(0, center.y, 0, pPillar.y);
          pillarGrad.addColorStop(0, 'rgba(0, 255, 231, 0.3)');
          pillarGrad.addColorStop(1, 'rgba(0, 255, 231, 0)');
          ctx.fillStyle = pillarGrad;
          ctx.beginPath();
          ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(pPillar.x + 15, pPillar.y); ctx.lineTo(pPillar.x - 15, pPillar.y);
          ctx.closePath();
          ctx.fill();

          // Add portal lines
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y); ctx.lineTo(p2.x, p2.y);
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y);
          ctx.stroke();
        } else if (r === 3) {
          if (!isSelected && !isPlaceable && !isInvalid) surfaceColor = 'rgba(255, 255, 255, 0.1)';
        }

        ctx.fillStyle = surfaceColor;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();

        // Surface Rim
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected ? 2.5 : (isPlaceable ? 2 : 0.8);
        ctx.stroke();

        // Invalid Feedback (Red Pulse or X)
        if (isInvalid && isSelected) {
          ctx.strokeStyle = '#ff3b3b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p0.x + 5, p0.y + 5); ctx.lineTo(p2.x - 5, p2.y - 5);
          ctx.moveTo(p1.x - 5, p1.y + 5); ctx.lineTo(p3.x + 5, p3.y - 5);
          ctx.stroke();
        }

        // Guide Pulse for placeable tiles - EXTREME TACTICAL VISIBILITY
        if (isPlaceable) {
            const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
            
            // 1. Ground Tactical Zone
            ctx.fillStyle = `rgba(0, 255, 231, ${0.1 + 0.15 * pulse})`;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
            ctx.closePath();
            ctx.fill();

            // 2. Animated Scanning Beam
            const beamHeight = 40;
            const pBeam = project(l, r, beamHeight);
            const beamGrad = ctx.createLinearGradient(0, center.y, 0, pBeam.y);
            beamGrad.addColorStop(0, `rgba(0, 255, 231, ${0.4 * pulse})`);
            beamGrad.addColorStop(1, 'rgba(0, 255, 231, 0)');
            
            ctx.strokeStyle = `rgba(0, 255, 231, ${0.6 * pulse})`;
            ctx.lineWidth = 1;
            ctx.strokeRect(center.x - 10 * pulse, pBeam.y, 20 * pulse, 1);
            
            ctx.fillStyle = beamGrad;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(pBeam.x + 8, pBeam.y); ctx.lineTo(pBeam.x - 8, pBeam.y);
            ctx.closePath();
            ctx.fill();

            // 3. Thick Animated Border
            ctx.strokeStyle = `rgba(0, 255, 231, ${0.4 + 0.5 * pulse})`;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 4]);
            ctx.lineDashOffset = -Date.now() / 30;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Selected Crosshair
        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(center.x - 10, center.y); ctx.lineTo(center.x + 10, center.y);
          ctx.moveTo(center.x, center.y - 6); ctx.lineTo(center.x, center.y + 6);
          ctx.stroke();
          
          // Corner accents
          [p0, p1, p2, p3].forEach((p, i) => {
            const angle = (i * Math.PI) / 2 + Math.PI / 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.stroke();
          });
        }

        // Technical Label
        if (r === 6 || r === 0 || isSelected) {
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '700 6px monospace';
          ctx.fillText(`SEC ${l}-${r}`, center.x, center.y + (padSize * 20) + 10);
        }
      }
    }

    // Goal Accents
    const aiBase = project(1, 0.2); // Move labels further onto the visible map
    const plBase = project(1, 5.8);
    
    ctx.font = '900 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 59, 59, 0.9)';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#ff3b3b';
    ctx.fillText('SIGNAL HOSTILE // ELIMINATION TARGET', aiBase.x, aiBase.y - 45);
    ctx.fillStyle = 'rgba(0, 255, 231, 0.9)';
    ctx.shadowColor = '#00ffe7';
    ctx.fillText('SIGNAL FRIENDLY // CORE SYNC', plBase.x, plBase.y + 45);
    ctx.shadowBlur = 0;

    // Draw Units
    kernel.units.sort((a, b) => a.row - b.row).forEach(unit => {
      // Hide units that have reached base/scored
      if (unit.isGoalSuccess) return;

      // De-clutter Logic: If multiple units are in the same grid slot, offset them
      const cluster = kernel.units.filter(u => u.lane === unit.lane && u.row === unit.row);
      const clusterIdx = cluster.findIndex(u => u.instanceId === unit.instanceId);
      const cOffsetX = cluster.length > 1 ? (clusterIdx - (cluster.length - 1) / 2) * 12 : 0;
      const cOffsetY = cluster.length > 1 ? (clusterIdx - (cluster.length - 1) / 2) * 6 : 0;

      let lane = unit.lane;
      const row = unit.row;
      
      const isClashRow = row === 3;
      let xOffset = 0;
      if (isClashRow) {
        xOffset = unit.owner === 'PLAYER' ? -0.25 : 0.25;
      }
      
      const unitHeight = 15; // Vertical displacement for 2.5D
      const basePos = project(lane + xOffset, row, 0);
      const mainPos = project(lane + xOffset, row, unitHeight);

      // Apply declutter offset
      mainPos.x += cOffsetX;
      mainPos.y += cOffsetY;
      basePos.x += cOffsetX;
      basePos.y += cOffsetY;

      const mainColor = unit.owner === 'PLAYER' ? '#00ffe7' : '#ff3b3b';

      // NEW: Swap Selection Highlight
      if (swapSourceId === unit.instanceId) {
        const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3 + 2 * pulse;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(mainPos.x, mainPos.y, 25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#facc15';

        // Cost Label
        ctx.fillStyle = '#facc15';
        ctx.font = 'bold 8px monospace';
        ctx.fillText('AWAITING SYNC 5 DP', mainPos.x, mainPos.y - 35);
      }

      // 3. Main Body Sprite
      const view = unit.owner === 'PLAYER' ? 'Back' : 'Front';
      const spriteKey = `${unit.id}_${view}`;
      const spriteImg = spriteImages.current[spriteKey];
      const isLoaded = spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0;

      if (isLoaded) {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = mainColor + '44';
        let s = 140; // Massive presence
        let yOff = 40;
        if (unit.name === 'Originium Slug') {
            s = 800;
            yOff = 225;
        } else if (unit.name === 'Zima' || unit.id.includes('zima')) {
            s = 180;
            yOff = 52;
        } else if (unit.name === 'Sarkaz Mercenary') {
            s = 700;
            yOff = 197;
        }
        
        // Anchor deeper into the image (+yOff) to align the feet with the grid floor
        ctx.drawImage(spriteImg, basePos.x - s/2, basePos.y - s + yOff, s, s);
        ctx.restore();
      } else {
        // Fallback: Tactical Hologram
        ctx.fillStyle = mainColor + '44';
        ctx.beginPath();
        ctx.arc(mainPos.x, mainPos.y, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = mainColor;
        ctx.stroke();
      }

      // 6. Stun Visual
      if (unit.stunTurns > 0) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const angle = (Date.now() / 100 + i * Math.PI / 2) % (Math.PI * 2);
          ctx.beginPath();
          ctx.arc(mainPos.x + Math.cos(angle) * 45, mainPos.y + Math.sin(angle) * 45, 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Skill Indicator
      if (unit.owner === 'PLAYER' && unit.ability.type === 'activated') {
        const isReady = unit.sp >= unit.maxSp;
        const isActive = unit.isSkillActive;
        
        ctx.strokeStyle = isActive ? '#fff' : (isReady ? '#facc15' : 'rgba(255,255,255,0.2)');
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mainPos.x + 30, mainPos.y - 30, 6, 0, Math.PI * 2);
        ctx.stroke();

        if (isActive) {
          const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
          ctx.fillStyle = `rgba(250, 204, 21, ${0.5 + 0.5 * pulse})`;
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#facc15';
          ctx.beginPath();
          ctx.arc(mainPos.x + 30, mainPos.y - 30, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          const spPercent = unit.sp / unit.maxSp;
          ctx.fillStyle = isReady ? '#facc15' : 'rgba(255,255,255,0.1)';
          ctx.beginPath();
          ctx.moveTo(mainPos.x + 30, mainPos.y - 30);
          ctx.arc(mainPos.x + 30, mainPos.y - 30, 4, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * spPercent));
          ctx.fill();
        }
      }
    });

    // Draw Drag Ghosting
    if (draggingOp && selectedLane !== null && selectedRow !== null) {
      const isValid = kernel.canDeploy(draggingOp.op.class, selectedRow, 'PLAYER');
      const groundPos = project(selectedLane, selectedRow, 0);
      const hoverPos = project(selectedLane, selectedRow, 40); // Higher hover
      const glowColor = isValid ? '#00ffe7' : '#ff3b3b';

      // 1. Sector Target Focus
      ctx.shadowBlur = 20;
      ctx.shadowColor = glowColor;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(groundPos.x, groundPos.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 2. Tactical Beam (Volumetric feel)
      const grad = ctx.createLinearGradient(0, groundPos.y, 0, hoverPos.y);
      grad.addColorStop(0, glowColor + '88');
      grad.addColorStop(1, glowColor + '00');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(groundPos.x, groundPos.y);
      ctx.lineTo(hoverPos.x, hoverPos.y);
      ctx.stroke();

      // 3. Holographic Operator Ring
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Ring Outer Glow
      ctx.strokeStyle = glowColor + '33';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, 35, 0, Math.PI * 2);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#fff';
      ctx.font = '900 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isValid ? "INITIALIZING_DEPLOY" : "LINK_TERMINATED", hoverPos.x, hoverPos.y - 45);
      
      // Operator Name in projection
      ctx.fillStyle = glowColor;
      ctx.font = '800 14px monospace';
      ctx.fillText(draggingOp.op.name.toUpperCase(), hoverPos.x, hoverPos.y + 5);
    }

    // Selected Highlighter
    if (selectedSlot) {
      const s = selectedSlot;
      const p0 = project(s.lane - 0.5, s.row - 0.5);
      const p1 = project(s.lane + 0.5, s.row - 0.5);
      const p2 = project(s.lane + 0.5, s.row + 0.5);
      const p3 = project(s.lane - 0.5, s.row + 0.5);
      
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.stroke();
    }

    // 9. Floating Labels
    const currentTime = Date.now();
    floatingLabels.current = floatingLabels.current.filter(label => {
      const age = currentTime - label.createdAt;
      const duration = 1200; // 1.2s lifespan
      label.life = 1 - (age / duration);
      
      if (label.life <= 0) return false;

      const alpha = label.life;
      const yOffset = (1 - label.life) * 40; // Float up 40px
      
      let color = '#fff';
      if (label.type === 'DAMAGE') color = '#ff3b3b';
      if (label.type === 'HEAL') color = '#22c55e';
      if (label.type === 'STUN') color = '#facc15';
      if (label.type === 'CRIT') color = '#fb923c';
      if (label.type === 'TRUE') color = '#ffffff';
      
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      
      if (label.type === 'CRIT') {
        ctx.font = '900 18px monospace';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#ea580c';
      } else if (label.type === 'TRUE') {
        ctx.font = '900 14px monospace';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#3b82f6';
      } else {
        ctx.font = '900 14px monospace';
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
      }
      
      let labelText = label.value;
      if (label.type === 'HEAL') labelText = `+${label.value}`;
      if (label.type === 'CRIT') labelText = `!!${label.value}!!`;
      if (label.type === 'TRUE') labelText = `${label.value}*`;

      ctx.textAlign = 'center';
      ctx.fillText(labelText, label.x, label.y - yOffset);
      ctx.restore();
      
      return true;
    });
  }, [draggingOp, selectedLane, selectedRow, selectedSlot, kernel, isPaused, countdown, mulliganPhase]);

  // Initialize Squad and Hand
  useEffect(() => {
    const rawSquad = userProfile.squads[userProfile.activeSquadIndex]
      .map(id => ALL_ASSETS.find(a => a.id === id))
      .filter(Boolean) as Operator[];
    
    // Ensure unique operators by ID
    const squadMap = new Map<string, Operator>();
    rawSquad.forEach(op => {
      if (!squadMap.has(op.id)) squadMap.set(op.id, op);
    });
    const squad = Array.from(squadMap.values());
    
    const shuffledSquad = [...squad].sort(() => Math.random() - 0.5);
    setPlayerSquad(shuffledSquad);
    setPlayerHand(shuffledSquad.slice(0, 4));
    setPlayerDeck(shuffledSquad.slice(4));

    // Pre-load Sprites
    [...ALL_ASSETS, ...AI_ENEMIES].forEach(op => {
      ['Front', 'Back'].forEach(view => {
        const path = getSpriteImagePath(op, view as 'Front' | 'Back');
        const img = new Image();
        img.src = path;
        spriteImages.current[`${op.id}_${view}`] = img;
      });
    });

    kernel.start();
  }, []);

  useEffect(() => {
    setSelectedUnit(null);
  }, [phase]);

  // Game Loop
  useEffect(() => {
    let animationFrameId: number;

    const loop = () => {
      if (!isPaused && countdown === 0 && !mulliganPhase) {
        kernel.tick();
        if (kernel.phase === 'ENEMY') {
          ai.update();
        }
        setUiState({
          playerLP: kernel.playerLP,
          aiLP: kernel.aiLP,
          playerDP: Math.floor(kernel.playerDP),
          aiDP: Math.floor(kernel.aiDP),
        });
      }
      render();
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPaused, countdown, mulliganPhase, render]);

  const handleDrawCard = () => {
    if (Date.now() - lastDragTime.current < 200) return;
    if (playerHand.length < 6 && kernel.playerDP >= 5 && playerDeck.length > 0) {
      let deck = [...playerDeck];
      let attempts = 0;
      let drawnCard: Operator | null = null;

      while (attempts < deck.length) {
        const topCard = deck[0];
        const isDuplicate = playerHand.some(h => h.id === topCard.id) || 
                            kernel.units.some(u => u.id === topCard.id && u.owner === 'PLAYER') ||
                            playerCooldowns.some(c => c.op.id === topCard.id);
        
        if (!isDuplicate) {
          drawnCard = deck.shift()!;
          break;
        }
        
        // Cycle duplicate to bottom
        deck.push(deck.shift()!);
        attempts++;
      }

      if (!drawnCard) {
        // No unique cards available to draw right now
        handleCombatEvent(1, 4, 0, 'STUN'); // Visual ping for "No cards"
        return;
      }

      kernel.playerDP -= 5;
      setPlayerHand([...playerHand, drawnCard]);
      setPlayerDeck(deck);
    }
  };

  const toggleMulliganSelection = (index: number) => {
    setMulliganSelected(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleConfirmMulligan = () => {
    if (mulliganSelected.length > 0) {
      const newHand = [...playerHand];
      const newDeck = [...playerDeck];
      
      mulliganSelected.forEach(idx => {
        const cardToSwap = newHand[idx];
        const newCard = newDeck.shift();
        if (newCard) {
          newHand[idx] = newCard;
          newDeck.push(cardToSwap);
        }
      });
      
      setPlayerHand(newHand);
      setPlayerDeck(newDeck);
    }
    setMulliganPhase(false);
  };

  const handleDragStart = (op: Operator, index: number, e: React.MouseEvent | React.TouchEvent) => {
    if (phase !== 'COMMAND') return;
    setDraggingOp({ op, index });
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragPos({ x: clientX, y: clientY });
  };

  const handleDragMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingOp) return;
    lastDragTime.current = Date.now();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragPos({ x: clientX, y: clientY });

    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        // Safety: If cursors is in the bottom 10% of canvas, treat as "return to hand" cancellation zone
        const relativeY = clientY - rect.top;
        if (relativeY > rect.height * 0.9) {
          setSelectedLane(null);
          setSelectedRow(null);
          return;
        }

        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        const { lane, row } = unproject(x, y);
        setSelectedLane(lane);
        setSelectedRow(row);
      } else {
        setSelectedLane(null);
        setSelectedRow(null);
      }
    }
  };

  const handleDragEnd = () => {
    if (!draggingOp) return;
    lastDragTime.current = Date.now();
    
    if (selectedLane !== null && selectedRow !== null) {
      if (kernel.deployUnit(draggingOp.op, 'PLAYER', selectedLane, selectedRow)) {
        setPlayerHand(prev => prev.filter((_, i) => i !== draggingOp.index));
      }
    }

    setDraggingOp(null);
    setSelectedLane(null);
    setSelectedRow(null);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (Date.now() - lastDragTime.current < 200) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const { lane, row } = unproject(x, y);

    if (lane === null || row === null) {
      setSelectedSlot(null);
      setSelectedUnit(null);
      setSwapSourceId(null);
      return;
    }

    setSelectedSlot({ lane, row });

    let unit = kernel.units.find(u => u.lane === lane && u.row === row);
    
    // Improved selection for clash row (dual occupancy)
    if (row === 3) {
      const p = project(lane, row);
      const isLeft = x < p.x;
      const sideUnit = kernel.units.find(u => u.lane === lane && u.row === row && (isLeft ? u.owner === 'PLAYER' : u.owner === 'AI'));
      if (sideUnit) unit = sideUnit;
    }

    if (unit && unit.owner === 'PLAYER') {
      if (swapSourceId) {
        if (swapSourceId !== unit.instanceId) {
          // ACTIVATE SWAP
          const success = kernel.swapUnits(swapSourceId, unit.instanceId);
          if (!success) {
            // Signal insufficient DP
            handleCombatEvent(unit.lane, unit.row, 0, 'STUN');
          }
          setSwapSourceId(null);
          setSelectedUnit(null);
          return;
        } else {
          // Deselect
          setSwapSourceId(null);
          setSelectedUnit(null);
        }
      } else {
        setSelectedUnit(unit);
      }
    } else {
      setSelectedUnit(null);
      setSwapSourceId(null);
    }
  };

  const handleInitiateSwap = () => {
    if (selectedUnit) {
      setSwapSourceId(selectedUnit.instanceId);
    }
  };

  const inspectedUnit = selectedSlot 
    ? kernel.units.find(u => u.lane === selectedSlot.lane && u.row === selectedSlot.row)
    : null;

  const handleRetreat = () => {
    if (selectedUnit) {
      kernel.retreatUnit(selectedUnit.instanceId);
      setSelectedUnit(null);
    }
  };

  const handleActivateSkill = () => {
    if (selectedUnit) {
      kernel.activateSkill(selectedUnit.instanceId);
      setSelectedUnit(null);
    }
  };

  const togglePause = () => {
    if (isPaused) {
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsPaused(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setIsPaused(true);
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-black relative overflow-hidden select-none"
      onMouseMove={handleDragMove}
      onTouchMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onTouchEnd={handleDragEnd}
    >
      {/* Header */}
      <div className="p-2 px-4 border-b border-rhodes-border flex justify-between items-center bg-black/95 backdrop-blur-md z-30 shrink-0 shadow-lg">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-white/40 hover:text-rhodes-blue transition-colors group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="terminal-text text-[8px] font-bold tracking-widest uppercase truncate max-w-[50px] sm:max-w-none">Abort</span>
        </button>
        
        <div className="flex gap-4 sm:gap-8 items-center">
          {/* Player LP */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {[...Array(3)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < uiState.playerLP ? 'bg-rhodes-blue' : 'bg-white/5 border border-white/5'}`} 
                  />
                ))}
              </div>
              <span className="terminal-text font-black text-xs text-rhodes-blue">{uiState.playerLP}</span>
            </div>
            <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Doctor HP</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="px-4 py-1.5 bg-rhodes-blue/10 border border-rhodes-blue/30 rounded-full shadow-[0_0_10px_rgba(0,152,217,0.1)]">
              <span className="terminal-text text-[10px] font-black tracking-[0.2em] text-rhodes-blue">{phase}</span>
            </div>
          </div>

          {/* AI LP */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <span className="terminal-text font-black text-xs text-red-500">{uiState.aiLP}</span>
              <div className="flex gap-0.5">
                {[...Array(3)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < uiState.aiLP ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-white/5 border border-white/5'}`} 
                  />
                ))}
              </div>
            </div>
            <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Target HP</span>
          </div>
        </div>

        <button 
          onClick={togglePause} 
          className={`p-2 rounded-full border transition-all ${isPaused ? 'bg-rhodes-blue text-black border-rhodes-blue' : 'bg-black border-white/10 text-white/40 hover:text-white'}`}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </button>
      </div>

      {/* Battlefield */}
      <div className="flex-1 relative bg-black/40 overflow-hidden">
        <canvas 
          ref={canvasRef} 
          width={450} 
          height={400} 
          className="w-full h-full cursor-crosshair"
          onClick={handleCanvasClick}
        />

        {/* Inspector Panel */}
        <AnimatePresence>
          {inspectedUnit && (
            <motion.div 
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="absolute top-0 right-0 bottom-0 w-56 bg-black/95 backdrop-blur-xl border-l border-rhodes-blue/30 p-4 z-[100] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col gap-4 overflow-y-auto overflow-x-hidden custom-scrollbar"
            >
              <div className="flex justify-between items-start shrink-0">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] bg-rhodes-blue/20 text-rhodes-blue px-1.5 py-0.5 rounded-sm font-black terminal-text">{inspectedUnit.class.toUpperCase()}</span>
                  </div>
                  <h3 className="terminal-text text-lg font-black text-white tracking-tighter leading-none">{inspectedUnit.name}</h3>
                  <div className="flex gap-0.5">
                    {Array.from({ length: inspectedUnit.rarity }).map((_, i) => (
                      <Star key={i} className="w-2 h-2 text-orange-500 fill-orange-500" />
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedSlot(null)} 
                  className="p-1 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
                >
                  <ChevronLeft className="w-4 h-4 rotate-180" />
                </button>
              </div>

              <div className="space-y-2 shrink-0">
                <div className="flex justify-between text-[9px] terminal-text">
                  <span className="text-white/40 font-bold uppercase tracking-wider">Vital Integrity</span>
                  <span className="text-white font-black">{Math.ceil(inspectedUnit.hp)} / {inspectedUnit.maxHp}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(inspectedUnit.hp / inspectedUnit.maxHp) * 100}%` }}
                    className={`h-full transition-all ${inspectedUnit.owner === 'PLAYER' ? 'bg-rhodes-blue' : 'bg-red-500'}`}
                  />
                </div>
              </div>

              {inspectedUnit.stunTurns > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 p-2 rounded-sm flex items-center gap-2 shrink-0">
                   <Zap className="w-3 h-3 text-red-500 animate-pulse" />
                   <div className="flex flex-col">
                      <span className="text-[7px] font-black text-red-500 uppercase terminal-text">Systems Suppressed</span>
                      <span className="text-[9px] font-bold text-white/80 terminal-text">{inspectedUnit.stunTurns} TURNS REMAINING</span>
                   </div>
                </div>
              )}

              {inspectedUnit.ability.type === 'activated' && (
                <div className="space-y-2 shrink-0">
                  <div className="flex justify-between text-[9px] terminal-text">
                    <span className="text-orange-500/60 font-bold uppercase tracking-wider">Tactical SP</span>
                    <span className="text-orange-500 font-black">
                      {inspectedUnit.isSkillActive ? 'ACTIVE' : `${inspectedUnit.sp} / ${inspectedUnit.maxSp}`}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(inspectedUnit.sp / inspectedUnit.maxSp) * 100}%` }}
                      className={`h-full transition-all ${inspectedUnit.isSkillActive ? 'bg-white animate-pulse' : 'bg-orange-500'}`}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 shrink-0">
                <div className="bg-white/5 p-2 rounded-sm border border-white/5 flex flex-col items-center">
                  <p className="text-[7px] text-white/30 terminal-text font-bold uppercase mb-0.5">
                    {inspectedUnit.class === 'Medic' ? 'Healing PWR' : 'Combat ATK'}
                  </p>
                  <p className="text-base font-black terminal-text text-white">
                    {inspectedUnit.atk}
                    {inspectedUnit.atk > (inspectedUnit.initialAtk || 0) && (
                       <span className="text-[9px] text-rhodes-blue ml-1">↑</span>
                    )}
                  </p>
                  <p className="text-[7px] text-white/20">BASE: {inspectedUnit.initialAtk || inspectedUnit.atk}</p>
                </div>
                <div className="bg-white/5 p-2 rounded-sm border border-white/5 flex flex-col items-center">
                  <p className="text-[7px] text-white/30 terminal-text font-bold uppercase mb-0.5">Armor DEF</p>
                  <p className="text-base font-black terminal-text text-white">
                    {inspectedUnit.def}
                    {inspectedUnit.def > (inspectedUnit.initialDef || 0) && (
                       <span className="text-[9px] text-rhodes-blue ml-1">↑</span>
                    )}
                  </p>
                  <p className="text-[7px] text-white/20">BASE: {inspectedUnit.initialDef || inspectedUnit.def}</p>
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/5 p-2 rounded-sm shrink-0">
                <p className="text-[7px] text-white/30 terminal-text font-bold uppercase mb-1.5">Tactical Movement</p>
                <div className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-rhodes-blue rounded-full animate-pulse" />
                  <p className="text-[10px] font-bold terminal-text text-white/80">
                    {inspectedUnit.class === 'Vanguard' ? 
                      (uiState.playerLP === 1 ? 'ACTIVE (CRITICAL LP)' : 'STATIC (GENERATING DP)') : 
                     inspectedUnit.class === 'Specialist' ?
                      'HIGH-SPEED INTERVENTION' :
                     (['Sniper', 'Caster', 'Medic'].includes(inspectedUnit.class)) ? 
                      '3-CYCLE FREQUENCY' : 
                     (['Defender', 'Guard'].includes(inspectedUnit.class)) ? 
                      '2-CYCLE FREQUENCY' : 
                      'STANDARD FREQUENCY'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 shrink-0">
                 <div className="bg-white/5 p-1.5 rounded-sm border border-white/5 flex flex-col items-center">
                    <p className="text-[6px] text-white/30 uppercase font-black">Block</p>
                    <p className="text-xs font-black text-white">{inspectedUnit.blockCount}</p>
                 </div>
                 <div className="bg-white/5 p-1.5 rounded-sm border border-white/5 flex flex-col items-center">
                    <p className="text-[6px] text-white/30 uppercase font-black">RES</p>
                    <p className="text-xs font-black text-white">{inspectedUnit.res}</p>
                 </div>
                 <div className="bg-white/5 p-1.5 rounded-sm border border-white/5 flex flex-col items-center">
                    <p className="text-[6px] text-white/30 uppercase font-black">Coord</p>
                    <p className="text-[9px] font-black text-rhodes-blue">{inspectedUnit.lane}:{inspectedUnit.row}</p>
                 </div>
              </div>

              <div className="space-y-1 shrink-0">
                 <div className="flex items-center gap-2 mb-0.5">
                    <Star className="w-2.5 h-2.5 text-rhodes-blue" />
                    <span className="text-[9px] font-black text-white uppercase terminal-text">{inspectedUnit.ability.title}</span>
                 </div>
                 <p className="text-[9px] italic text-white/50 leading-snug terminal-text pb-2">
                    {inspectedUnit.ability.description}
                 </p>
              </div>

              {inspectedUnit.owner === 'PLAYER' && phase === 'COMMAND' && (
                <div className="mt-auto pt-2 space-y-2 shrink-0">
                  {inspectedUnit.ability.type === 'activated' && (
                    <button 
                      onClick={handleActivateSkill}
                      disabled={inspectedUnit.sp < inspectedUnit.maxSp || inspectedUnit.isSkillActive}
                      className={`w-full rhodes-button py-2 flex items-center justify-center gap-2 ${
                        inspectedUnit.sp >= inspectedUnit.maxSp && !inspectedUnit.isSkillActive
                        ? 'glow-blue bg-rhodes-blue text-black'
                        : 'opacity-40 grayscale pointer-events-none'
                      }`}
                    >
                      <Zap className={`w-3 h-3 ${inspectedUnit.isSkillActive ? 'animate-pulse' : ''}`} />
                      <span className="text-[10px] font-bold">
                        {inspectedUnit.isSkillActive ? 'SKILL_OPERATIONAL' : 'ACTIVATE_TACTICAL'}
                      </span>
                    </button>
                  )}
                  <button 
                    onClick={handleRetreat}
                    className="w-full border border-red-500/50 text-red-500 hover:bg-red-500/10 py-2 flex items-center justify-center gap-2 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Initiate Retreat</span>
                  </button>
                  <button 
                    onClick={handleInitiateSwap}
                    className={`w-full py-2 flex items-center justify-center gap-2 rounded border transition-colors ${
                      swapSourceId === inspectedUnit.instanceId 
                        ? 'border-facc15 bg-facc15 text-black' 
                        : 'border-rhodes-blue/50 text-rhodes-blue hover:bg-rhodes-blue/10'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {swapSourceId === inspectedUnit.instanceId 
                        ? 'Awaiting Target' 
                        : `Swap Position (5 DP)`}
                    </span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Phase Overlay */}
        <AnimatePresence>
          {phase === 'ACTION' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-rhodes-blue/10 backdrop-blur-sm pointer-events-none flex flex-col items-center justify-center z-50"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-1 w-full bg-rhodes-blue/20 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="h-full w-1/2 bg-rhodes-blue"
                  />
                </div>
                <div className="terminal-text text-rhodes-blue text-xl font-black tracking-[0.4em] uppercase">Processing Tactics</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'ENEMY' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-red-500/10 backdrop-blur-sm pointer-events-none flex flex-col items-center justify-center z-50"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-1 w-full bg-red-500/20 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="h-full w-1/2 bg-red-500"
                  />
                </div>
                <div className="terminal-text text-red-500 text-xl font-black tracking-[0.4em] uppercase italic">Counter-Strike Detected</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Execute Button */}
        <AnimatePresence>
          {phase === 'COMMAND' && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.1, opacity: 0, y: 10 }}
              className="absolute bottom-6 right-6 z-40"
            >
              <button 
                onClick={() => kernel.executeStrategy()}
                className="rhodes-button glow-blue px-6 py-2.5 flex items-center gap-2 bg-rhodes-blue text-black font-black uppercase tracking-[0.2em] group overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                <Play className="w-4 h-4 fill-current" />
                <span className="terminal-text text-[10px]">Authorize</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Countdown Overlay */}
        <AnimatePresence>
          {countdown > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 2 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute inset-0 flex items-center justify-center bg-black/60 z-50"
            >
              <span className="text-8xl font-bold terminal-text text-rhodes-blue">{countdown}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Over Overlay */}
        <AnimatePresence>
          {winner && (
            <motion.div
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 z-[500] p-8 text-center backdrop-blur-xl"
            >
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-12"
              >
                <h2 className={`text-6xl font-black terminal-text mb-2 tracking-tighter ${winner === 'PLAYER' ? 'text-rhodes-blue italic' : 'text-red-600'}`}>
                  {winner === 'PLAYER' ? 'OPERATION COMPLETE' : 'CRITICAL FAILURE'}
                </h2>
                <div className={`h-1 w-full ${winner === 'PLAYER' ? 'bg-rhodes-blue/50' : 'bg-red-500/50'} rounded-full mx-auto`} />
              </motion.div>

              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="terminal-text text-[10px] text-white/50 mb-8 tracking-widest max-w-[280px] leading-relaxed uppercase"
              >
                {winner === 'PLAYER' 
                  ? 'All tactical objectives secured. Field parameters satisfied. Returning to base command.' 
                  : 'System integrity compromised. Deployment force eliminated. Initiating emergency neural decoupling.'}
              </motion.p>

              {winner === 'PLAYER' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="flex gap-6 mb-16"
                >
                  <div className="flex flex-col items-center">
                    <p className="text-[8px] text-white/30 terminal-text mb-1 uppercase">Orundum</p>
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-4 py-2 rounded">
                      <Zap className="w-3 h-3 text-orange-500" />
                      <span className="text-white font-black terminal-text">+20</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <p className="text-[8px] text-white/30 terminal-text mb-1 uppercase">Tactical XP</p>
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-4 py-2 rounded">
                      <Star className="w-3 h-3 text-rhodes-blue" />
                      <span className="text-white font-black terminal-text">+50</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <motion.button 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.9 }}
                onClick={onBack} 
                className={`rhodes-button px-16 py-4 font-black terminal-text text-sm ${winner === 'PLAYER' ? 'glow-blue text-rhodes-blue' : 'border-red-500 text-red-500 glow-orange'}`}
              >
                DISCONNECT LINK
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mulligan Overlay */}
        <AnimatePresence>
          {mulliganPhase && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/98 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-md"
            >
              <div className="mb-4 text-center">
                <h2 className="text-xl font-black terminal-text text-white tracking-widest uppercase mb-1 italic">Tactical Authorization</h2>
                <div className="flex items-center justify-center gap-2">
                  <div className="h-px w-6 bg-rhodes-blue/30" />
                  <p className="terminal-text text-[7px] text-rhodes-blue font-bold tracking-[0.2em] uppercase">Initial Link Prep</p>
                  <div className="h-px w-6 bg-rhodes-blue/30" />
                </div>
              </div>

              <div className="flex justify-center gap-1.5 mb-8 w-full">
                {playerHand.map((op, idx) => (
                  <motion.div 
                    key={op.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleMulliganSelection(idx)}
                    className={`w-[18vw] max-w-[80px] aspect-[2/3] border-2 rounded-sm relative overflow-hidden transition-all cursor-pointer ${
                      mulliganSelected.includes(idx) 
                      ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' 
                      : 'border-white/10 hover:border-rhodes-blue/50'
                    }`}
                  >
                    <img 
                      src={getCardImagePath(op)}
                      alt={op.name}
                      className={`w-full h-full object-contain transition-all ${mulliganSelected.includes(idx) ? 'opacity-20 grayscale brightness-50' : 'opacity-70 grayscale-[0.2]'}`}
                      referrerPolicy="no-referrer"
                    />
                    
                    {mulliganSelected.includes(idx) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10 z-30">
                        <RotateCcw className="w-6 h-6 text-red-500 animate-spin-slow" />
                        <span className="text-[5px] font-black terminal-text text-red-500 mt-1">RECYCLE</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>

              <div className="flex flex-col items-center gap-4">
                <button 
                  onClick={handleConfirmMulligan}
                  disabled={mulliganSelected.length === 0}
                  className={`rhodes-button px-10 py-2.5 group relative overflow-hidden transition-all ${
                    mulliganSelected.length > 0 ? 'glow-blue border-rhodes-blue/50' : 'opacity-20 grayscale border-white/10'
                  }`}
                >
                  <div className="absolute inset-0 bg-white/5 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <div className="flex items-center gap-2">
                    <RotateCcw className={`w-3 h-3 ${mulliganSelected.length > 0 ? 'text-rhodes-blue animate-spin-slow' : 'text-white/20'}`} />
                    <span className="terminal-text font-black tracking-widest text-[10px] text-rhodes-blue">
                      RECYCLE {mulliganSelected.length} {mulliganSelected.length === 1 ? 'UNIT' : 'UNITS'}
                    </span>
                  </div>
                </button>

                <button 
                  onClick={() => setMulliganPhase(false)}
                  className="terminal-text text-[8px] text-white/30 hover:text-white transition-colors tracking-[0.3em] font-bold uppercase"
                >
                  Skip & Start Operation
                </button>
              </div>
              
              <p className="mt-6 text-[7px] terminal-text text-white/20 uppercase tracking-[0.2em] max-w-[200px] text-center leading-relaxed">
                Selective recycling enables tactical optimization of your initial deployment link.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Player Hand */}
      <div className="p-2 bg-[#050505] border-t border-rhodes-border shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] z-20">
        <div className="flex justify-between items-center mb-2 px-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-2 py-1 rounded-sm">
              <Zap className="w-3 h-3 text-orange-500" />
              <div className="flex flex-col">
                <span className="text-[10px] font-black terminal-text text-orange-500 leading-none">{uiState.playerDP}</span>
                <span className="text-[5px] terminal-text text-white/20 uppercase font-bold">DP</span>
              </div>
            </div>
            
            <button 
              onClick={handleDrawCard}
              disabled={playerHand.length >= 6 || uiState.playerDP < 5 || playerDeck.length === 0 || phase !== 'COMMAND'}
              className={`rhodes-button h-8 px-3 py-0 flex flex-col items-center justify-center transition-all ${
                playerHand.length < 6 && uiState.playerDP >= 5 && playerDeck.length > 0 && phase === 'COMMAND'
                ? 'glow-blue border-rhodes-blue/50 text-rhodes-blue'
                : 'border-white/5 text-white/10 opacity-50 grayscale'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-black uppercase tracking-tighter">Supply</span>
                <span className="text-[7px] bg-rhodes-blue/20 px-1 rounded text-rhodes-blue">5</span>
              </div>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[6px] text-rhodes-blue/40 terminal-text uppercase">Deck: {playerDeck.length}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-hide">
          {playerHand.map((op, idx) => (
            <div key={op.id} className="flex flex-col gap-1 shrink-0">
              <div
                onMouseDown={(e) => handleDragStart(op, idx, e)}
                onTouchStart={(e) => handleDragStart(op, idx, e)}
                className={`w-16 h-24 border rounded-sm relative overflow-hidden group transition-all cursor-grab active:cursor-grabbing ${
                  uiState.playerDP >= op.dp_cost && phase === 'COMMAND'
                    ? 'border-rhodes-blue/40 bg-rhodes-blue/5 shadow-inner'
                    : 'border-white/5 bg-white/5 opacity-50 grayscale'
                } ${draggingOp?.index === idx ? 'opacity-0 scale-95' : ''}`}
              >
                
                <img 
                  src={getCardImagePath(op)}
                  alt={op.name}
                  className="w-full h-full object-contain opacity-70 group-hover:opacity-100 transition-opacity"
                  referrerPolicy="no-referrer"
                />
                
                {/* DP Badge */}
                <div className="absolute top-0.5 right-0.5 bg-black/80 px-1 py-0.5 rounded-sm border border-rhodes-blue/20 z-20">
                  <span className="text-[8px] font-black terminal-text text-rhodes-blue">{op.dp_cost}</span>
                </div>

                {/* Status Bar */}
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${uiState.playerDP >= op.dp_cost ? 'bg-rhodes-blue shadow-[0_0_5px_#0098d9]' : 'bg-white/10'}`} />
              </div>
            </div>
          ))}

          {/* Cooldown Display */}
          {playerCooldowns.map((c, idx) => (
            <div key={`cooldown-${c.op.id}-${idx}`} className="flex flex-col gap-1 shrink-0">
              <div className="w-16 h-24 border border-white/5 bg-black/80 rounded-sm relative overflow-hidden group opacity-60">
                 <img 
                  src={getCardImagePath(c.op)}
                  alt={c.op.name}
                  className="w-full h-full object-contain grayscale brightness-50 opacity-40"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                   <RotateCcw className="w-4 h-4 text-white/20 animate-spin-slow" />
                   <div className="bg-rhodes-blue/20 px-2 py-0.5 rounded-full border border-rhodes-blue/40">
                      <span className="text-[10px] font-black terminal-text text-rhodes-blue">{c.turnsRemaining}T</span>
                   </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-black/90 p-1 border-t border-white/5">
                   <p className="text-[5px] text-white/40 terminal-text text-center font-bold uppercase tracking-tighter">RECOVERING</p>
                </div>
              </div>
            </div>
          ))}

          {/* Empty Slots */}
          {Array.from({ length: Math.max(0, 6 - playerHand.length - playerCooldowns.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="w-16 h-24 border border-dashed border-white/5 rounded-sm shrink-0 flex items-center justify-center bg-white/5 opacity-10">
              <RotateCcw className="w-3 h-3 text-white/50" />
            </div>
          ))}
        </div>
      </div>

      {/* Victory/Defeat Overlay */}
      <AnimatePresence>
        {winner && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="absolute inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center backdrop-blur-xl"
          >
             <motion.div 
               initial={{ scale: 0.8, opacity: 0 }} 
               animate={{ scale: 1, opacity: 1 }} 
               transition={{ delay: 0.5, type: 'spring' }} 
               className="flex flex-col items-center"
             >
                <div className="relative mb-8">
                  <div className={`text-7xl font-black italic tracking-tighter ${winner === 'PLAYER' ? 'text-rhodes-blue' : 'text-red-600'} drop-shadow-[0_0_30px_rgba(0,186,255,0.5)]`}>
                    {winner === 'PLAYER' ? 'VICTORY' : 'DEFEAT'}
                  </div>
                  <div className="absolute -bottom-2 right-0 bg-white text-black text-[10px] font-black px-2 py-0.5 terminal-text uppercase">
                    Simulation {winner === 'PLAYER' ? 'Success' : 'Terminated'}
                  </div>
                </div>

                <div className="terminal-text text-[10px] text-white/40 uppercase tracking-[0.5em] mb-12 text-center max-w-[300px]">
                  {winner === 'PLAYER' 
                    ? "Neural link synchronization complete. Tactical objectives achieved." 
                    : "Neural link integrity compromised. Aborting simulation sequence."}
                </div>

                <div className="flex flex-col gap-4 w-full max-w-[200px]">
                  <button 
                    onClick={onBack} 
                    className="rhodes-button glow-blue w-full py-4 bg-rhodes-blue text-black font-black terminal-text text-xs uppercase tracking-widest"
                  >
                    Return to Terminal
                  </button>
                  <button 
                    onClick={() => window.location.reload()} 
                    className="text-[10px] text-white/20 hover:text-white terminal-text uppercase transition-colors"
                  >
                    [ REINITIALIZE SIMULATION ]
                  </button>
                </div>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dragging Ghost */}
      {draggingOp && (
        <div 
          className="fixed pointer-events-none z-[1000] w-16 h-24 border border-rhodes-blue bg-rhodes-blue/20 rounded overflow-hidden"
          style={{ 
            left: dragPos.x - 32, 
            top: dragPos.y - 48,
            transform: 'scale(1.1)'
          }}
        >
          <img 
            src={getCardImagePath(draggingOp.op)}
            alt={draggingOp.op.name}
            className="w-full h-full object-contain opacity-90"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
}
