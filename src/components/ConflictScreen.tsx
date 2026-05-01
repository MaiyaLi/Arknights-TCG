import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';
import { 
  ChevronLeft, 
  Pause, 
  Play, 
  RotateCcw, 
  Zap, 
  Heart,
  Trash2,
  Star,
  Search,
  Swords,
  Loader2
} from 'lucide-react';
import { UserProfile } from '../types';
import { ALL_ASSETS, AI_ENEMIES, Operator } from '../data/operators';
import { getSpriteImagePath, getCardImagePath } from '../utils/assetUtils';

interface ConflictScreenProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onBack: () => void;
  onVictory: () => void;
}

interface FloatingLabel {
  id: string;
  x: number;
  y: number;
  value: string;
  type: 'DAMAGE' | 'HEAL' | 'STUN' | 'CRIT' | 'TRUE';
  life: number;
}

export default function ConflictScreen({ userProfile, onUpdateProfile, onBack, onVictory }: ConflictScreenProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [matchState, setMatchState] = useState<any>(null);
  const [side, setSide] = useState<'PLAYER' | 'OPPONENT'>('PLAYER');
  const [isQueuing, setIsQueuing] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);

  // Simulation-style states
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playerHand, setPlayerHand] = useState<Operator[]>([]);
  const [playerDeck, setPlayerDeck] = useState<Operator[]>([]);
  const [playerCooldowns, setPlayerCooldowns] = useState<{ op: Operator, turnsRemaining: number }[]>([]);
  const [mulliganPhase, setMulliganPhase] = useState(false);
  const [mulliganSelected, setMulliganSelected] = useState<number[]>([]);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [draggingOp, setDraggingOp] = useState<{ op: Operator, index: number } | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [selectedUnit, setSelectedUnit] = useState<any | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ lane: number, row: number } | null>(null);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  
  const lastDragTime = useRef<number>(0);
  const floatingLabels = useRef<FloatingLabel[]>([]);
  const spriteImages = useRef<Record<string, HTMLImageElement>>({});

  const startQueuing = () => {
    if (!socket) return;
    setIsQueuing(true);
    socket.emit('join_queue', { userId: userProfile.id, name: userProfile.name, squad: [] });
  };

  const cancelQueuing = () => {
    if (!socket) return;
    setIsQueuing(false);
    socket.emit('leave_queue', { userId: userProfile.id });
  };

  // 2.5D Projection (Simulation Screen Style)
  const CANVAS_W = 450;
  const CANVAS_H = 400;
  const PROJECT_CONFIG = {
    topY: 100,
    bottomY: 320,
    topWidth: 220,
    bottomWidth: 420,
    zFactor: 1.3
  };

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
    let minDist = 1600;
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

  // Helper: map server row to display row based on side
  // Goal: You are ALWAYS at the bottom (Blue side).
  // If side === PLAYER: displayRow = serverRow.
  // If side === OPPONENT: displayRow = 6 - serverRow (because serverRow 0 is your goal, which we want at bottom 6).
  const sideRef = useRef<'PLAYER' | 'OPPONENT'>('PLAYER');
  useEffect(() => { sideRef.current = side; }, [side]);

  const toDisplayRow = (serverRow: number) => side === 'PLAYER' ? serverRow : 6 - serverRow;
  const toDisplayRowRef = (serverRow: number) => sideRef.current === 'PLAYER' ? serverRow : 6 - serverRow;
  const toServerRow = (displayRow: number) => side === 'PLAYER' ? displayRow : 6 - displayRow;

  // Initialize Socket
  useEffect(() => {
    const s = io(import.meta.env.VITE_BACKEND_URL || undefined);
    setSocket(s);

    s.on('match_found', ({ matchId, side: sSide, opponent }) => {
      setSide(sSide);
      setIsQueuing(false);
      setMulliganPhase(true); // Start with mulligan phase just like simulation
      s.emit('join_match', matchId);
    });

    s.on('match_sync', (state) => {
      setMatchState((prev: any) => {
         // Handle unit removal/cooldown logic if phase changed to COMMAND
         if (prev && prev.phase === 'ACTION' && state.phase === 'COMMAND') {
             // Turn transition: Update local cooldowns
             setPlayerCooldowns(c => c.map(item => ({ ...item, turnsRemaining: item.turnsRemaining - 1 })).filter(item => {
                if (item.turnsRemaining <= 0) {
                   setPlayerDeck(d => [...d, item.op]);
                   return false;
                }
                return true;
             }));
         }
         return state;
      });
    });

    s.on('ready_sync', ({ playerReady: pr, opponentReady: or }) => {
      if (sideRef.current === 'PLAYER') {
        setPlayerReady(pr);
        setOpponentReady(or);
      } else {
        setPlayerReady(or);
        setOpponentReady(pr);
      }
    });

    s.on('combat_event', ({ lane, row, value, type }) => {
      const displayRow = toDisplayRowRef(row);
      const pos = project(lane, displayRow, 10);
      const id = Math.random().toString(36).substr(2, 9);
      floatingLabels.current.push({
        id,
        x: pos.x + (Math.random()-0.5)*30,
        y: pos.y + (Math.random()-0.5)*15,
        value: value > 0 ? value.toString() : '',
        type,
        life: 1.0
      });
    });

    return () => { s.disconnect(); };
  }, []);

  // Squad Initialization
  useEffect(() => {
    const squad = userProfile.squads[userProfile.activeSquadIndex]
      .map(id => ALL_ASSETS.find(a => a.id === id))
      .filter(Boolean) as Operator[];
    const shuffled = [...squad].sort(() => Math.random() - 0.5);
    setPlayerHand(shuffled.slice(0, 4));
    setPlayerDeck(shuffled.slice(4));

    // Pre-load Sprites
    [...ALL_ASSETS, ...AI_ENEMIES].forEach(op => {
      ['Front', 'Back'].forEach(view => {
        const path = getSpriteImagePath(op, view as 'Front' | 'Back');
        if (!spriteImages.current[`${op.id}_${view}`]) {
           const img = new Image();
           img.src = path;
           spriteImages.current[`${op.id}_${view}`] = img;
        }
      });
    });
  }, [userProfile]);

  // Interaction Handlers
  const handleDeploy = (op: Operator, lane: number, row: number) => {
    if (!socket || !matchState) return;
    const serverRow = toServerRow(row);
    socket.emit('deploy_unit', { matchId: matchState.id, opId: op.id, lane, row: serverRow, side });
    setPlayerHand(prev => prev.filter((_, i) => i !== draggingOp?.index));
  };

  const handleAuthorize = () => {
    if (!socket || !matchState) return;
    socket.emit('authorize_ready', { matchId: matchState.id, side });
  };

  // Render Loop
  useEffect(() => {
    if (!matchState || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    let animFrame: number;
    const render = () => {
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
          const isSelected = selectedLane === l && selectedRow === r;
          const canDeploy = (r === 4 || r === 5); // Fixed for local perspective
          const isOccupied = matchState.units.some((u: any) => u.lane === l && toDisplayRow(u.row) === r);
          
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

      // Units
      matchState.units.forEach((u: any) => {
        const displayRow = toDisplayRow(u.row);
        const basePos = project(u.lane, displayRow, 0);
        const mainColor = u.owner === (side === 'PLAYER' ? 'PLAYER' : 'AI') ? '#00ffe7' : '#ff3b3b';

        const spriteView = u.owner === (side === 'PLAYER' ? 'PLAYER' : 'AI') ? 'Back' : 'Front';
        const img = spriteImages.current[`${u.id}_${spriteView}`];
        if (img && img.complete) {
            ctx.save();
            let s = 140;
            let yOff = 40;
            if (u.name === 'Originium Slug') {
                s = 800;
                yOff = 225;
            } else if (u.name === 'Sarkaz Mercenary') {
                s = 700;
                yOff = 197;
            }
            ctx.shadowBlur = 15; ctx.shadowColor = mainColor + '44';
            ctx.drawImage(img, basePos.x - s/2, basePos.y - s + yOff, s, s);
            ctx.restore();
        }

        // Health Bar
        const barW = 30;
        const healthPct = u.hp / u.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(basePos.x - barW/2, basePos.y + 10, barW, 2);
        ctx.fillStyle = mainColor;
        ctx.fillRect(basePos.x - barW/2, basePos.y + 10, barW * healthPct, 2);
      });

      // Floating Labels
      floatingLabels.current = floatingLabels.current.filter(l => {
        l.life -= 0.02;
        if (l.life <= 0) return false;
        ctx.save();
        ctx.globalAlpha = l.life;
        ctx.fillStyle = l.type === 'DAMAGE' ? '#ff3b3b' : '#22c55e';
        ctx.font = '900 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(l.value, l.x, l.y - (1 - l.life) * 40);
        ctx.restore();
        return true;
      });

      animFrame = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animFrame);
  }, [matchState, draggingOp, selectedLane, selectedRow, side]);

  if (!matchState) {
    return (
      <div className="h-full bg-black flex flex-col items-center justify-center p-8 gap-6 terminal-bg">
        <div className="w-24 h-24 rounded-full border-2 border-rhodes-blue flex items-center justify-center relative overflow-hidden">
           <Swords className={`w-12 h-12 text-rhodes-blue ${isQueuing ? 'animate-pulse' : ''}`} />
           {isQueuing && <div className="absolute inset-0 bg-rhodes-blue/10 animate-scan" />}
        </div>
        <AnimatePresence mode="wait">
          {!isQueuing ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <h2 className="terminal-text text-2xl font-black text-white italic tracking-tighter">CONFLICT TERMINAL</h2>
              <button onClick={startQueuing} className="rhodes-button glow-blue w-full py-4 bg-rhodes-blue text-black font-black terminal-text text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 group">
                <Search className="w-4 h-4" /> INITIATE MATCHMAKING
              </button>
              <button onClick={onBack} className="text-white/40 text-[9px] terminal-text uppercase hover:text-white flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" /> RETURN TO DASHBOARD
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-8 w-full text-center">
              <Loader2 className="w-8 h-8 text-rhodes-blue animate-spin" />
              <p className="terminal-text text-xs text-rhodes-blue animate-pulse">SEARCHING FOR OPPONENT...</p>
              <button onClick={cancelQueuing} className="w-full py-3 border border-white/10 text-white/40 font-bold terminal-text text-[10px] uppercase">ABORT SEQUENCE</button>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black relative overflow-hidden select-none"
      onMouseMove={(e) => {
        if (!draggingOp) return;
        setDragPos({ x: e.clientX, y: e.clientY });
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          const x = (e.clientX - rect.left) * (CANVAS_W / rect.width);
          const y = (e.clientY - rect.top) * (CANVAS_H / rect.height);
          const { lane, row } = unproject(x, y);
          setSelectedLane(lane);
          setSelectedRow(row);
        }
      }}
      onMouseUp={() => {
        if (draggingOp && selectedLane !== null && selectedRow !== null) {
          handleDeploy(draggingOp.op, selectedLane, selectedRow);
        }
        setDraggingOp(null);
        setSelectedLane(null);
        setSelectedRow(null);
      }}
    >
      {/* Header (Simulation Style) */}
      <div className="p-2 px-4 border-b border-white/10 flex justify-between items-center bg-black/95 backdrop-blur-md z-30 shadow-lg">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
          <ChevronLeft className="w-4 h-4" />
          <span className="terminal-text text-[8px] font-bold tracking-widest uppercase">Abort</span>
        </button>
        <div className="flex gap-8 items-center">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < (side === 'PLAYER' ? matchState.playerLP : matchState.opponentLP) ? 'bg-rhodes-blue shadow-[0_0_5px_#19baff]' : 'bg-white/5 border border-white/5'}`} />
                ))}
              </div>
            </div>
            <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Doctor HP</span>
          </div>
          <div className="px-4 py-1.5 bg-rhodes-blue/10 border border-rhodes-blue/30 rounded-full">
            <span className="terminal-text text-[10px] font-black tracking-[0.2em] text-rhodes-blue uppercase">{matchState.phase}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < (side === 'PLAYER' ? matchState.opponentLP : matchState.playerLP) ? 'bg-red-500 shadow-[0_0_5px_#ef4444]' : 'bg-white/5 border border-white/5'}`} />
                ))}
              </div>
            </div>
            <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Target HP</span>
          </div>
        </div>
        <div className="w-8" />
      </div>

      <div className="flex-1 relative bg-black/40 overflow-hidden">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="w-full h-full cursor-crosshair" onClick={() => {}} />

        {/* Action Phase Overlay */}
        <AnimatePresence>
          {matchState.phase === 'ACTION' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-red-600/5 backdrop-blur-sm pointer-events-none flex flex-col items-center justify-center z-50">
                <div className="terminal-text text-red-500 text-xl font-black tracking-[0.4em] uppercase italic">Processing Tactics</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Execute Button */}
        <AnimatePresence>
          {matchState.phase === 'COMMAND' && (
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="absolute bottom-6 right-6 z-40">
              <button 
                onClick={handleAuthorize}
                disabled={playerReady}
                className={`rhodes-button glow-blue px-6 py-2.5 flex items-center gap-2 ${playerReady ? 'opacity-50 grayscale' : 'bg-rhodes-blue text-black'}`}
              >
                {playerReady ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span className="terminal-text text-[10px] font-black uppercase">{playerReady ? 'Syncing...' : 'Authorize'}</span>
              </button>
              {opponentReady && <div className="absolute -top-8 right-0 text-[8px] text-rhodes-blue terminal-text animate-pulse">Opponent Ready</div>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mulligan Phase */}
        <AnimatePresence>
          {mulliganPhase && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/98 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-md">
                <h2 className="text-xl font-black terminal-text text-white tracking-widest uppercase mb-8 italic">Tactical Authorization</h2>
                <div className="flex justify-center gap-2 mb-8">
                    {playerHand.map((op, idx) => (
                        <div key={op.id} onClick={() => setMulliganSelected(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])}
                             className={`w-16 h-24 border-2 rounded-sm overflow-hidden cursor-pointer ${mulliganSelected.includes(idx) ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-white/10 hover:border-rhodes-blue/50'}`}>
                            <img src={getCardImagePath(op)} className={`w-full h-full object-contain ${mulliganSelected.includes(idx) ? 'opacity-20 grayscale brightness-50' : 'opacity-70'}`} referrerPolicy="no-referrer" />
                        </div>
                    ))}
                </div>
                <button onClick={() => {
                   if (mulliganSelected.length > 0) {
                      const newHand = [...playerHand];
                      const newDeck = [...playerDeck];
                      mulliganSelected.forEach(idx => {
                         const card = newHand[idx];
                         const next = newDeck.shift();
                         if (next) { newHand[idx] = next; newDeck.push(card); }
                      });
                      setPlayerHand(newHand);
                      setPlayerDeck(newDeck);
                   }
                   setMulliganPhase(false);
                }} className="rhodes-button glow-blue px-10 py-3 text-rhodes-blue font-black terminal-text text-xs uppercase tracking-widest">Confirm Initial Sync</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Player Hand (Simulation Style) */}
      <div className="p-2 bg-[#050505] border-t border-white/10 shrink-0 z-20 shadow-2xl">
        <div className="flex justify-between items-center mb-2 px-2">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-2 py-1 rounded-sm">
                    <Zap className="w-3 h-3 text-orange-500" />
                    <span className="text-[10px] font-black terminal-text text-orange-500 leading-none">{side === 'PLAYER' ? matchState.playerDP : matchState.opponentDP}</span>
                </div>
            </div>
            <div className="text-[6px] text-rhodes-blue/40 terminal-text uppercase font-bold">Deck: {playerDeck.length}</div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 px-1 custom-scrollbar">
          {playerHand.map((op, idx) => (
            <div key={idx} onMouseDown={() => { if (matchState.phase === 'COMMAND') setDraggingOp({ op, index: idx }); }}
                 className={`w-16 h-24 border rounded-sm relative overflow-hidden shrink-0 transition-all ${
                   (side === 'PLAYER' ? matchState.playerDP : matchState.opponentDP) >= op.dp_cost && matchState.phase === 'COMMAND'
                   ? 'border-rhodes-blue/40 bg-rhodes-blue/5' : 'border-white/5 opacity-40 grayscale'
                 } ${draggingOp?.index === idx ? 'opacity-0' : ''}`}>
                <img src={getCardImagePath(op)} className="w-full h-full object-contain opacity-70" referrerPolicy="no-referrer" />
                <div className="absolute top-0.5 right-0.5 bg-black/80 px-1 py-0.5 rounded-sm border border-rhodes-blue/20">
                    <span className="text-[8px] font-black terminal-text text-rhodes-blue">{op.dp_cost}</span>
                </div>
            </div>
          ))}
          {playerCooldowns.map((c, i) => (
             <div key={i} className="w-16 h-24 border border-white/5 bg-black/80 rounded-sm relative opacity-60 flex items-center justify-center shrink-0">
                <RotateCcw className="w-4 h-4 text-white/10 animate-spin-slow" />
                <span className="absolute bottom-1 text-[8px] font-black text-rhodes-blue">{c.turnsRemaining}T</span>
             </div>
          ))}
        </div>
      </div>

      {/* Dragging Ghost */}
      {draggingOp && (
        <div className="fixed pointer-events-none z-[1000] w-16 h-24 border border-rhodes-blue bg-rhodes-blue/20 rounded overflow-hidden"
             style={{ left: dragPos.x - 32, top: dragPos.y - 48, transform: 'scale(1.1)' }}>
          <img src={getCardImagePath(draggingOp.op)} className="w-full h-full object-contain opacity-90" referrerPolicy="no-referrer" />
        </div>
      )}
    </div>
  );
}
