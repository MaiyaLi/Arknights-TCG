import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Target, 
  Zap, 
  ChevronRight, 
  Play,
  RotateCcw,
  CheckCircle2,
  Star,
  ChevronLeft
} from 'lucide-react';
import { ALL_ASSETS, AI_ENEMIES, Operator } from '../data/operators';
import { BattleKernel, GameUnit, GamePhase } from '../game/BattleKernel';
import { getCardImagePath, getSpriteImagePath } from '../utils/assetUtils';

interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  actionRequired?: 'DEPLOY' | 'SKILL' | 'TAP' | 'AUTHORIZE';
  targetUnitId?: string;
  targetPos?: { lane: number, row: number };
}

const PROJECT_CONFIG = {
  topY: 100,
  bottomY: 320,
  topWidth: 220,
  bottomWidth: 420,
  zFactor: 1.3
};

const CANVAS_W = 450;
const CANVAS_H = 400;

const TUTORIAL_SCRIPT: TutorialStep[] = [
  {
    id: 'intro',
    title: 'STATION INITIALIZATION',
    instruction: 'Doctor, Rhodes Island Command is online. We need to stabilize the sector. Tap START to begin tactical deployment training.',
    actionRequired: 'TAP'
  },
  {
    id: 'deploy_vanguard',
    title: 'AUTHORIZING VANGUARD',
    instruction: 'Select FANG and drag her to Lane 0, Row 4. Vanguards are essential for establishing early-game DP generation.',
    actionRequired: 'DEPLOY',
    targetUnitId: 'fang_001',
    targetPos: { lane: 0, row: 4 }
  },
  {
    id: 'wait_engagement',
    title: 'COMBAT ENGAGEMENT',
    instruction: 'An enemy unit is approaching. Press AUTHORIZE on the bottom right to advance the tactical cycle and engage the target.',
    actionRequired: 'AUTHORIZE'
  },
  {
    id: 'deploy_ranged',
    title: 'SUPPORT SNIPER',
    instruction: 'DEPLOY KROOS at Lane 0, Row 5 (directly behind FANG). Her ranged fire will assist in neutralising hostiles from safety.',
    actionRequired: 'DEPLOY',
    targetUnitId: 'kroos_001',
    targetPos: { lane: 0, row: 5 }
  },
  {
    id: 'deploy_melantha',
    title: 'ELIMINATION TARGET',
    instruction: 'A high-hp unit has appeared in the center. Deploy MELANTHA at Lane 1, Row 4 to intercept the threat directly.',
    actionRequired: 'DEPLOY',
    targetUnitId: 'melantha_001',
    targetPos: { lane: 1, row: 4 }
  },
  {
    id: 'skill_use',
    title: 'TACTICAL DATA INSPECTION',
    instruction: 'Operational efficiency is high. TAP on MELANTHA on the map to review her passive skill, then press AUTHORIZE to engage the target.',
    actionRequired: 'SKILL',
    targetUnitId: 'melantha_001'
  },
  {
    id: 'deploy_beagle',
    title: 'DEFENSIVE WALL',
    instruction: 'A heavy hostile signal is detected in Lane 2. Deploy BEAGLE at Lane 2, Row 4 to intercept the threat. Defenders excel at blocking high volumes of hostiles.',
    actionRequired: 'DEPLOY',
    targetUnitId: 'beagle_001',
    targetPos: { lane: 2, row: 4 }
  },
  {
    id: 'deploy_hibiscus',
    title: 'VITAL MAINTENANCE',
    instruction: 'Operator health is critical. Deploy HIBISCUS at Lane 1, Row 5. Medics will automatically restore Vital Integrity to nearby allies.',
    actionRequired: 'DEPLOY',
    targetUnitId: 'hibiscus_001',
    targetPos: { lane: 1, row: 5 }
  },
  {
    id: 'authorize_final',
    title: 'FINAL ENGAGEMENT',
    instruction: 'Formation complete. Press AUTHORIZE to initiate the final combat cycle and neutralize all remaining threats.',
    actionRequired: 'AUTHORIZE'
  },
  {
    id: 'conclusion',
    title: 'CERTIFICATION COMPLETE',
    instruction: 'Operational efficiency at 98%. Tactical training complete. You are now authorized to lead Rhodes Island in active combat missions.',
    actionRequired: 'TAP'
  }
];

interface TutorialScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function TutorialScreen({ onComplete, onSkip }: TutorialScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('COMMAND');
  const [playerDP, setPlayerDP] = useState(15);
  const [hand, setHand] = useState<Operator[]>([]);
  const [draggingOp, setDraggingOp] = useState<{ op: Operator, index: number } | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isGameOver, setIsGameOver] = useState(false);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [hasInspectedTarget, setHasInspectedTarget] = useState(false);
  const spriteImages = useRef<Record<string, HTMLImageElement>>({});

  const currentStep = TUTORIAL_SCRIPT[stepIndex];
  const spawnedStepRef = useRef<number | null>(null);
  const isAutoPlayRef = useRef(false);

  // Kernel Reference
  const kernel = useRef(new BattleKernel(
    () => setIsGameOver(true),
    () => {},
    () => {},
    (p) => setPhase(p),
    () => { setPlayerDP(prev => prev + 1); },
    () => {}
  ));

  // 2.5D Projection (MATCHES SIMULATION SCREEN)
  const project = (l: number, r: number, z = 0) => {
    const linearProgress = Math.max(-0.1, r / 6);
    const progress = Math.pow(Math.abs(linearProgress), PROJECT_CONFIG.zFactor) * (linearProgress < 0 ? -1 : 1);
    const currY = PROJECT_CONFIG.topY + progress * (PROJECT_CONFIG.bottomY - PROJECT_CONFIG.topY);
    const currW = PROJECT_CONFIG.topWidth + linearProgress * (PROJECT_CONFIG.bottomWidth - PROJECT_CONFIG.topWidth);
    const startX = (CANVAS_W - currW) / 2;
    const currX = startX + (l + 0.5) * (currW / 3);
    return { x: currX, y: currY - z };
  };

  const unproject = (x: number, y: number) => {
    let minDist = 3600; // Increased to 60px distance threshold squared for easier center selection
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
    return nearest.lane === -1 ? { lane: null, row: null } : { lane: nearest.lane, row: nearest.row };
  };

  // Initialize
  useEffect(() => {
    kernel.current.start();
    const tutorialOps = ['fang_001', 'kroos_001', 'melantha_001', 'beagle_001', 'hibiscus_001'].map(id => ALL_ASSETS.find(a => a.id === id)!);
    setHand([tutorialOps[0]]); 

    // Pre-load Sprites
    [...ALL_ASSETS, ...AI_ENEMIES].forEach(op => {
      ['Front', 'Back'].forEach(view => {
        const path = getSpriteImagePath(op, view as 'Front' | 'Back');
        const img = new Image();
        img.src = path;
        spriteImages.current[`${op.id}_${view}`] = img;
      });
    });
  }, []);

  // Sync hand to steps
  useEffect(() => {
    setInspectedUnitId(null); // Reset on step change
    setHasInspectedTarget(false); // Reset on step change
    if (stepIndex === 3) {
      setHand([ALL_ASSETS.find(a => a.id === 'kroos_001')!]);
    } else if (stepIndex === 4) {
      setHand([ALL_ASSETS.find(a => a.id === 'melantha_001')!]);
    } else if (stepIndex === 6) {
      setHand([ALL_ASSETS.find(a => a.id === 'beagle_001')!]);
    } else if (stepIndex === 7) {
      setHand([ALL_ASSETS.find(a => a.id === 'hibiscus_001')!]);
    }
  }, [stepIndex]);

  const handleAuthorize = () => {
    if (phase !== 'COMMAND') return;
    kernel.current.executeStrategy();

    if (currentStep.actionRequired === 'SKILL') {
      setStepIndex(prev => prev + 1);
    }
    
    // Trigger auto-play for final engagement
    if (stepIndex === 8) {
      isAutoPlayRef.current = true;
    }
  };

  // Main Loop
  useEffect(() => {
    let animationFrameId: number;
    
    const loop = () => {
      const k = kernel.current;
      k.playerDP = 99; // Infinite DP for Tutorial
      
      // Control combat spawning logic
      if (stepIndex === 2 && spawnedStepRef.current !== 2 && !isGameOver) {
        const dummyEnemy: any = {
           id: 'dummy_slug', name: 'Originium Slug', class: 'Guard', rarity: 1, dp_cost: 0, 
           stats: { hp: 12, atk: 1, def: 0 }, movement: '1:1', ability: { type: 'passive', title: 'None', description: '' }
        };
        // Alignment: Lane 0 to match Fang's deployment
        k.deployUnit(dummyEnemy, 'AI', 0, 1);
        spawnedStepRef.current = 2;
      }

      // Wave 2: For Melantha
      if (stepIndex === 5 && spawnedStepRef.current !== 5 && !isGameOver) {
        const heavyEnemy: any = {
           id: 'sarkaz_merc', name: 'Sarkaz Mercenary', class: 'Guard', rarity: 3, dp_cost: 0, 
           stats: { hp: 50, atk: 1, def: 1 }, movement: '1:1', ability: { type: 'passive', title: 'Heavy', description: '' }
        };
        k.deployUnit(heavyEnemy, 'AI', 1, 1);
        const secondHeavy: any = { ...heavyEnemy, id: 'sarkaz_merc_2' };
        k.deployUnit(secondHeavy, 'AI', 2, 1);
        spawnedStepRef.current = 5;
      }

      // Check step advancement requirements
      if (stepIndex === 2 && spawnedStepRef.current === 2 && k.units.filter(u => u.owner === 'AI').length === 0) {
         // Step 2 is complete when enemy is dead
         setStepIndex(3);
      }
      
      if (stepIndex === 8 && spawnedStepRef.current === 5 && k.units.filter(u => u.owner === 'AI').length === 0) {
         setIsGameOver(true);
         isAutoPlayRef.current = false;
         setStepIndex(9); // Move to conclusion step
      }
      
      // Auto-play loop for the final combat phase
      if (isAutoPlayRef.current && k.phase === 'COMMAND' && !isGameOver) {
         k.executeStrategy();
      }

      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [stepIndex, isGameOver, phase, draggingOp, selectedLane, selectedRow]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

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
        const isTutorialTarget = currentStep.targetPos && currentStep.targetPos.lane === l && currentStep.targetPos.row === r;
        const isSelected = selectedLane === l && selectedRow === r;
        const isOccupied = kernel.current.units.some(u => u.lane === l && u.row === r);
        
        const canDeploy = currentStep.targetPos ? (currentStep.targetPos.lane === l && currentStep.targetPos.row === r) : false;

        const isPlaceable = draggingOp && canDeploy && !isOccupied;
        const isInvalid = draggingOp && (!canDeploy || isOccupied);
        
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
          : (isPlaceable ? 'rgba(0, 152, 217, 0.25)' : (isTutorialTarget ? 'rgba(0, 152, 217, 0.25)' : 'rgba(0, 152, 217, 0.1)'));
        
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
          : (isPlaceable ? 'rgba(0, 152, 217, 0.2)' : (isTutorialTarget ? 'rgba(0, 152, 217, 0.2)' : 'rgba(0, 152, 217, 0.05)'));
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p1d.x, p1d.y); ctx.lineTo(p2d.x, p2d.y);
        ctx.closePath();
        ctx.fill();

        // Draw Top Surface
        let surfaceColor = isSelected 
          ? 'rgba(0, 152, 217, 0.4)' 
          : (isPlaceable ? 'rgba(0, 152, 217, 0.2)' : (isTutorialTarget ? 'rgba(0, 152, 217, 0.2)' : 'rgba(10, 10, 20, 0.98)'));
        
        let borderColor = isSelected 
          ? 'rgba(0, 255, 231, 1)' 
          : (isPlaceable ? 'rgba(0, 255, 231, 1)' : (isTutorialTarget ? 'rgba(0, 255, 231, 1)' : 'rgba(0, 152, 217, 0.15)'));

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
          if (!isSelected && !isPlaceable && !isInvalid && !isTutorialTarget) surfaceColor = 'rgba(255, 255, 255, 0.1)';
        }

        ctx.fillStyle = surfaceColor;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();

        // Surface Rim
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isSelected ? 2.5 : ((isPlaceable || isTutorialTarget) ? 2 : 0.8);
        ctx.stroke();

        // Target Indicator Pulse
        if (isTutorialTarget && currentStep.actionRequired === 'DEPLOY') {
            const pulseTime = Date.now() / 150;
            const pulse = (Math.sin(pulseTime) + 1) / 2;
            
            // 1. Surface Pulse
            ctx.strokeStyle = `rgba(0, 255, 231, ${0.4 + 0.5 * pulse})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 4]);
            ctx.lineDashOffset = -pulseTime * 2;
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
            
            // 2. Vertical Tactical Pin
            const zHeight = 40 + Math.sin(pulseTime * 0.5) * 5;
            const topPos = project(l, r, zHeight);
            const midPos = project(l, r, 0);

            // Laser Beam
            const beamGrad = ctx.createLinearGradient(midPos.x, midPos.y, topPos.x, topPos.y);
            beamGrad.addColorStop(0, 'rgba(0, 255, 231, 0.8)');
            beamGrad.addColorStop(1, 'rgba(0, 255, 231, 0)');
            ctx.strokeStyle = beamGrad;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(midPos.x, midPos.y); ctx.lineTo(topPos.x, topPos.y); ctx.stroke();
            
            // Tactical Title
            ctx.fillStyle = '#00ffe7';
            ctx.shadowBlur = 10; ctx.shadowColor = '#00ffe7';
            ctx.font = '900 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('DEPLOY TARGET', topPos.x, topPos.y - 5);
            ctx.shadowBlur = 0;
        }

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

    // Goal Labels
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

    // 4. Draw Units
    kernel.current.units.sort((a,b) => a.row - b.row).forEach(u => {
      const isClashRow = u.row === 3;
      const xOffset = isClashRow ? (u.owner === 'PLAYER' ? -0.25 : 0.25) : 0;
      const unitHeight = 15;
      const basePos = project(u.lane + xOffset, u.row, 0);
      const mainPos = project(u.lane + xOffset, u.row, unitHeight);

      const mainColor = u.owner === 'PLAYER' ? '#00ffe7' : '#ff3b3b';

      // 1. Shadow/Ground Indicator
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(basePos.x, basePos.y, 20, 10, 0, 0, Math.PI * 2); ctx.fill();

      // 2. Connector / Height Stem
      ctx.strokeStyle = mainColor + '44'; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(basePos.x, basePos.y); ctx.lineTo(mainPos.x, mainPos.y); ctx.stroke(); ctx.setLineDash([]);

      // 3. Main Body Sprite
      const isSkillTarget = currentStep.actionRequired === 'SKILL' && u.id === currentStep.targetUnitId && !inspectedUnitId;
      const isInspected = inspectedUnitId === u.instanceId;
      
      const view = u.owner === 'PLAYER' ? 'Back' : 'Front';
      const spriteKey = `${u.id}_${view}`;
      const spriteImg = spriteImages.current[spriteKey];
      const isLoaded = spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0;

      if (isLoaded) {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = mainColor + '44';
        let s = 140; 
        let yOff = 40;
        if (u.name === 'Originium Slug') {
            s = 800;
            yOff = 225;
        } else if (u.name === 'Sarkaz Mercenary') {
            s = 700;
            yOff = 197;
        }
        ctx.drawImage(spriteImg, basePos.x - s/2, basePos.y - s + yOff, s, s);
        ctx.restore();
      } else {
        // Fallback: Minimal indicator for units without icons
        ctx.fillStyle = mainColor + '22';
        ctx.beginPath(); ctx.arc(mainPos.x, mainPos.y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText(u.class[0].toUpperCase(), mainPos.x, mainPos.y + 3);
      }

      if (isInspected) {
          ctx.strokeStyle = '#facc15';
          ctx.setLineDash([5, 5]);
          ctx.beginPath(); ctx.arc(mainPos.x, mainPos.y, 35, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
      }

      // 4. Discreet Tactical HP Bar (at base)
      const barW = 30;
      const barH = 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(basePos.x - barW/2, basePos.y + 12, barW, barH);
      ctx.fillStyle = mainColor;
      ctx.fillRect(basePos.x - barW/2, basePos.y + 12, barW * (u.hp/u.maxHp), barH);

      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '500 6px monospace';
      ctx.textAlign = 'center';
      if (u.owner !== 'AI') {
         ctx.fillText(u.name.toUpperCase(), mainPos.x, mainPos.y - 35);
      }

      // 5. Tutorial Assistance Overlays
      if (isSkillTarget) {
          const time = Date.now() / 200;
          const bounce = Math.sin(time) * 5;
          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(mainPos.x, mainPos.y, 25, 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(mainPos.x - 30, mainPos.y); ctx.lineTo(mainPos.x - 20, mainPos.y);
          ctx.moveTo(mainPos.x + 30, mainPos.y); ctx.lineTo(mainPos.x + 20, mainPos.y);
          ctx.moveTo(mainPos.x, mainPos.y - 30); ctx.lineTo(mainPos.x, mainPos.y - 20);
          ctx.moveTo(mainPos.x, mainPos.y + 30); ctx.lineTo(mainPos.x, mainPos.y + 20);
          ctx.stroke();

          ctx.fillStyle = '#facc15';
          ctx.font = '900 8px monospace';
          ctx.fillText('INSPECT TARGET', mainPos.x, mainPos.y - 45 + bounce);
      }

      // Skill Indicator
      if (u.owner === 'PLAYER' && u.ability.type === 'activated') {
        const isReady = u.sp >= u.maxSp;
        const isActive = u.isSkillActive;
        ctx.strokeStyle = isActive ? '#fff' : (isReady ? '#facc15' : 'rgba(255,255,255,0.2)'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mainPos.x + 14, mainPos.y - 14, 6, 0, Math.PI * 2); ctx.stroke();
        if (isActive) {
            const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
            ctx.fillStyle = `rgba(250, 204, 21, ${0.5 + 0.5 * pulse})`; ctx.shadowBlur = 10; ctx.shadowColor = '#facc15';
            ctx.beginPath(); ctx.arc(mainPos.x + 14, mainPos.y - 14, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = isReady ? '#facc15' : 'rgba(255,255,255,0.1)';
            ctx.beginPath(); ctx.moveTo(mainPos.x + 14, mainPos.y - 14);
            ctx.arc(mainPos.x + 14, mainPos.y - 14, 4, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * (u.sp/u.maxSp))); ctx.fill();
        }
      }
    });

    // 5. Draw Target Snapping for Drags
    if (draggingOp && selectedLane !== null && selectedRow !== null) {
      const hoverPos = project(selectedLane, selectedRow, 40);
      const glowColor = '#00ffe7';
      ctx.shadowBlur = 30; ctx.shadowColor = glowColor;
      ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
      ctx.beginPath(); ctx.arc(hoverPos.x, hoverPos.y, 25, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = glowColor; ctx.lineWidth = 3; ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(hoverPos.x, hoverPos.y); ctx.lineTo(project(selectedLane, selectedRow, 0).x, project(selectedLane, selectedRow, 0).y); ctx.stroke();
      ctx.setLineDash([]); ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = '900 12px monospace';
      ctx.fillText(draggingOp.op.class[0].toUpperCase(), hoverPos.x, hoverPos.y + 5);
    }
  };

  const handleNext = () => {
    if (currentStep.actionRequired === 'TAP') {
      if (stepIndex < TUTORIAL_SCRIPT.length - 1) {
        setStepIndex(prev => prev + 1);
      } else {
        onComplete();
      }
    }
  };

  const handleGlobalMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingOp) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Update visual drag position for the ghost overlay
    setDragPos({ x: clientX, y: clientY });

    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;

      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
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

  const handleGlobalUp = () => {
    if (!draggingOp || !currentStep.targetPos) {
      setDraggingOp(null);
      setSelectedLane(null);
      setSelectedRow(null);
      return;
    }

    if (selectedLane !== null && selectedLane === currentStep.targetPos.lane && selectedRow === currentStep.targetPos.row) {
      if (kernel.current.deployUnit(draggingOp.op, 'PLAYER', selectedLane, selectedRow)) {
        setHand([]); 
        setStepIndex(prev => prev + 1);
      }
    }
    setDraggingOp(null);
    setSelectedLane(null);
    setSelectedRow(null);
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, op: Operator, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentStep.actionRequired !== 'DEPLOY' || op.id !== currentStep.targetUnitId) return;
    
    setDraggingOp({ op, index: idx });
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragPos({ x: clientX, y: clientY });
  };

  const handleCanvasClick = (clientX: number, clientY: number) => {
    if (currentStep.actionRequired !== 'SKILL') return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    kernel.current.units.forEach(u => {
      const p = project(u.lane + (u.row === 3 ? (u.owner === 'PLAYER' ? -0.25 : 0.25) : 0), u.row, 15);
      if (Math.abs(x - p.x) < 35 && Math.abs(y - p.y) < 35 && u.id === currentStep.targetUnitId) {
         setInspectedUnitId(u.instanceId);
         setHasInspectedTarget(true);
      }
    });
  };

  return (
    <div 
      ref={containerRef}
      className="h-full bg-black flex flex-col relative overflow-hidden select-none"
      onMouseMove={handleGlobalMove}
      onMouseUp={handleGlobalUp}
      onTouchMove={handleGlobalMove}
      onTouchEnd={handleGlobalUp}
    >
      <div className="absolute top-4 left-4 right-4 z-50 flex flex-col items-center pointer-events-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-full max-lg bg-black/95 backdrop-blur-md border-l-4 border-rhodes-blue p-4 shadow-2xl pointer-events-auto border-t border-white/5"
          >
            <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-1">
              <span className="terminal-text text-[9px] font-black text-rhodes-blue uppercase tracking-widest">{currentStep.title}</span>
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSkip();
                }} 
                className="text-[7px] terminal-text text-white/30 hover:text-white hover:text-rhodes-blue uppercase transition-colors pointer-events-auto relative z-[60]"
              >
                [ SKIP INITIALIZATION ]
              </button>
            </div>
            <div className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded border border-rhodes-blue/30 bg-rhodes-blue/5 flex items-center justify-center">
                 <Target className="w-5 h-5 text-rhodes-blue" />
              </div>
              <p className="text-[11px] terminal-text text-white leading-relaxed font-bold italic">
                {currentStep.instruction}
              </p>
            </div>
            
            {currentStep.actionRequired === 'TAP' && (
              <button
                onClick={handleNext}
                className="mt-4 w-full py-2 bg-rhodes-blue text-black font-black terminal-text text-[10px] tracking-widest hover:bg-white transition-colors flex items-center justify-center gap-2"
              >
                PROCEED NEXT PHASE
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex-1 relative bg-black/40 overflow-hidden">
        <canvas 
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onClick={(e) => handleCanvasClick(e.clientX, e.clientY)}
          onTouchStart={(e) => {
             const touch = e.touches[0];
             handleCanvasClick(touch.clientX, touch.clientY);
          }}
          className="w-full h-full cursor-crosshair"
        />
        
        {/* Authorize Button (ONLY FOR COMBAT PHASES) */}
        <AnimatePresence>
          {inspectedUnitId && (
            <motion.div
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              className="absolute top-0 right-0 bottom-0 w-64 bg-black/95 backdrop-blur-xl border-l border-rhodes-blue/30 p-5 z-[100] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col gap-4 overflow-y-auto"
            >
              {(() => {
                const u = kernel.current.units.find(unit => unit.instanceId === inspectedUnitId);
                if (!u) return null;
                return (
                  <>
                    <div className="flex justify-between items-start shrink-0">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] bg-rhodes-blue/20 text-rhodes-blue px-2 py-0.5 rounded-sm font-black terminal-text w-fit uppercase tracking-tighter">
                          {u.class}
                        </span>
                        <h3 className="terminal-text text-2xl font-black text-white tracking-tighter leading-none mt-1">
                          {u.name.toUpperCase()}
                        </h3>
                        <div className="flex gap-1">
                          {Array.from({ length: u.rarity }).map((_, i) => (
                            <Star key={i} className="w-2.5 h-2.5 text-orange-500 fill-orange-500" />
                          ))}
                        </div>
                      </div>
                      <button 
                        onClick={() => setInspectedUnitId(null)} 
                        className="p-1 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
                      >
                        <ChevronLeft className="w-5 h-5 rotate-180" />
                      </button>
                    </div>

                    <div className="space-y-2 shrink-0 mt-2">
                      <div className="flex justify-between text-[9px] terminal-text">
                        <span className="text-white/40 font-bold uppercase tracking-wider">Vital Integrity</span>
                        <span className="text-white font-black">{u.hp} / {u.maxHp}</span>
                      </div>
                      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(u.hp / u.maxHp) * 100}%` }}
                          className="h-full bg-rhodes-blue"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 shrink-0">
                      <div className="bg-white/5 p-3 rounded-sm border border-white/5 flex flex-col items-center">
                        <p className="text-[8px] text-white/30 terminal-text font-bold uppercase mb-1">Combat ATK</p>
                        <p className="text-xl font-black terminal-text text-white">{u.atk}</p>
                        <p className="text-[7px] text-white/20 uppercase">Base: {u.atk}</p>
                      </div>
                      <div className="bg-white/5 p-3 rounded-sm border border-white/5 flex flex-col items-center">
                        <p className="text-[8px] text-white/30 terminal-text font-bold uppercase mb-1">Armor DEF</p>
                        <p className="text-xl font-black terminal-text text-white">{u.def}</p>
                        <p className="text-[7px] text-white/20 uppercase">Base: {u.def}</p>
                      </div>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-3 rounded-sm shrink-0">
                      <p className="text-[8px] text-white/30 terminal-text font-bold uppercase mb-2">Tactical Movement</p>
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-rhodes-blue rounded-full animate-pulse" />
                        <p className="text-[10px] font-bold terminal-text text-white/80 uppercase">
                          {u.class === 'Guard' ? '2-Cycle Frequency' : 'Standard Frequency'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 shrink-0">
                      <div className="bg-white/5 p-2 rounded-sm border border-white/5 flex flex-col items-center">
                         <p className="text-[7px] text-white/30 uppercase font-bold terminal-text">Block</p>
                         <p className="text-sm font-black text-white">{u.blockCount || 2}</p>
                      </div>
                      <div className="bg-white/5 p-2 rounded-sm border border-white/5 flex flex-col items-center">
                         <p className="text-[7px] text-white/30 uppercase font-bold terminal-text">RES</p>
                         <p className="text-sm font-black text-white">{u.res || 0}</p>
                      </div>
                      <div className="bg-white/5 p-2 rounded-sm border border-white/5 flex flex-col items-center">
                         <p className="text-[7px] text-white/30 uppercase font-bold terminal-text">Coord</p>
                         <p className="text-[10px] font-black text-rhodes-blue">{u.lane}:{u.row}</p>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-white/10 pt-4">
                       <div className="flex items-center gap-2 mb-2">
                          <Star className="w-3 h-3 text-rhodes-blue" />
                          <span className="text-[10px] font-black text-white uppercase terminal-text">
                            {u.ability.title}
                          </span>
                       </div>
                       <p className="text-[10px] text-white/60 italic leading-relaxed terminal-text">
                          {u.ability.description}
                       </p>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          )}

          {(currentStep.actionRequired === 'AUTHORIZE' || (currentStep.actionRequired === 'SKILL' && hasInspectedTarget)) && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.1, opacity: 0, y: 10 }}
              className="absolute bottom-6 right-6 z-40"
            >
              <button 
                onClick={handleAuthorize}
                className="rhodes-button glow-blue px-6 py-2.5 flex items-center gap-2 bg-rhodes-blue text-black font-black uppercase tracking-[0.2em] group overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                <Play className="w-4 h-4 fill-current" />
                <span className="terminal-text text-[10px]">Authorize</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-28 bg-black/95 border-t border-rhodes-blue/30 p-4 flex items-center justify-center gap-6 relative">
         <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rhodes-blue/50 to-transparent" />
         {hand.map((op, idx) => (
            <motion.div
             key={op.id}
             onMouseDown={(e) => handleDragStart(e, op, idx)}
             onTouchStart={(e) => handleDragStart(e, op, idx)}
             className={`w-20 h-28 border rounded shadow-2xl relative flex flex-col items-center justify-center transition-all cursor-grab active:cursor-grabbing ${
               op.id === currentStep.targetUnitId ? 'border-rhodes-blue bg-rhodes-blue/20 scale-105 shadow-[0_0_20px_rgba(0,186,255,0.4)]' : 'border-white/5 opacity-20 grayscale pointer-events-none'
             } ${draggingOp?.index === idx ? 'opacity-0 scale-95' : ''}`}
           >
              <img src={getCardImagePath(op)} className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />
           </motion.div>
         ))}
         {hand.length === 0 && (
           <p className="terminal-text text-[9px] text-white/10 uppercase tracking-[0.5em] italic">Tactical Authorization Granted...</p>
         )}
      </div>

      {/* Dragging Ghost Overlay */}
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

      <AnimatePresence>
        {isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-8"
          >
             <div className="w-32 h-32 bg-rhodes-blue/10 border-2 border-rhodes-blue rounded-full flex items-center justify-center mb-8 shadow-[0_0_80px_rgba(0,186,255,0.5)]">
                <CheckCircle2 className="w-20 h-20 text-rhodes-blue" />
             </div>
             <h2 className="text-3xl sm:text-5xl font-black terminal-text text-white italic mb-2 tracking-tighter">PHASE COMPLETE</h2>
             <p className="terminal-text text-[10px] sm:text-[12px] text-rhodes-blue mb-12 font-black">AUTHORIZATION GRANTED: 5x OPERATOR PACK</p>
             <button onClick={onComplete} className="rhodes-button glow-blue w-full max-w-xs py-4 font-black terminal-text text-sm uppercase tracking-widest border-2 border-rhodes-blue">Initialize Deployment</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
