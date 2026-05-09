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
  Star,
  Loader2
} from 'lucide-react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { ALL_ASSETS, Operator } from '../data/operators';
import { BattleKernel, GameUnit, GamePhase } from '../game/BattleKernel';
import { getSpriteImagePath, getCardImagePath } from '../utils/assetUtils';
import { RealtimeChannel } from '@supabase/supabase-js';

// --- VISUAL TWIN CONSTANTS ---
const CANVAS_W = 450;
const CANVAS_H = 400;
const PROJECT_CONFIG = {
  topY: 100,
  bottomY: 320,
  topWidth: 220,
  bottomWidth: 420,
  zFactor: 1.3
};

interface ConflictScreenProps {
  userProfile: UserProfile;
  onUpdateProfile: (p: UserProfile) => void;
  onBack: () => void;
  onMatchEnd: (result: 'Win' | 'Loss') => void;
}

interface FloatingLabel {
  id: string;
  x: number;
  y: number;
  value: string;
  type: 'DAMAGE' | 'HEAL' | 'STUN' | 'CRIT' | 'TRUE';
  life: number;
  createdAt: number;
}

export default function ConflictScreen({ userProfile, onUpdateProfile, onBack, onMatchEnd }: ConflictScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // -- MATCHMAKING STATE --
  const [matchId, setMatchId] = useState<string | null>(null);
  const [side, setSide] = useState<'PLAYER' | 'OPPONENT' | null>(null);
  const [isQueuing, setIsQueuing] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  // -- SIMULATION TWIN STATE (PIXEL PERFECT COPY) --
  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [playerHand, setPlayerHand] = useState<Operator[]>([]);
  const [playerSquad, setPlayerSquad] = useState<Operator[]>([]);
  const [playerDeck, setPlayerDeck] = useState<Operator[]>([]);
  const [mulliganPhase, setMulliganPhase] = useState(true);
  const [mulliganSelected, setMulliganSelected] = useState<number[]>([]);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [winner, setWinner] = useState<'PLAYER' | 'OPPONENT' | null>(null);
  const [phase, setPhase] = useState<GamePhase>('COMMAND');
  const [draggingOp, setDraggingOp] = useState<{ op: Operator, index: number } | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [selectedUnit, setSelectedUnit] = useState<GameUnit | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ lane: number, row: number } | null>(null);
  const [playerCooldowns, setPlayerCooldowns] = useState<{ op: Operator, turnsRemaining: number }[]>([]);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  
  const [uiState, setUiState] = useState({
    playerLP: 3,
    opponentLP: 3,
    playerDP: 15,
    opponentDP: 15,
  });

  const lastDragTime = useRef<number>(0);
  const floatingLabels = useRef<FloatingLabel[]>([]);
  const spriteImages = useRef<Record<string, HTMLImageElement>>({});
  const kernelRef = useRef<BattleKernel | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!matchId) joinLobby();
    
    ALL_ASSETS.forEach(op => {
      ['Front', 'Back'].forEach(view => {
        const path = getSpriteImagePath(op, view as 'Front' | 'Back');
        const img = new Image();
        img.src = path;
        spriteImages.current[`${op.id}_${view}`] = img;
      });
    });

    return () => { channel?.unsubscribe(); };
  }, []);

  const joinLobby = async () => {
    setIsQueuing(true);
    const lobbyChannel = supabase.channel('lobby', { config: { presence: { key: userProfile.uid } } });
    lobbyChannel.on('presence', { event: 'sync' }, () => {
        const state = lobbyChannel.presenceState();
        const users = Object.keys(state).sort();
        if (users.length >= 2) {
          let myPair: string[] | null = null;
          for (let i = 0; i < users.length - 1; i += 2) {
            const p = [users[i], users[i+1]];
            if (p.includes(userProfile.uid)) { myPair = p; break; }
          }
          if (myPair) {
            const mId = `match_${myPair.join('_')}`;
            setMatchId(mId);
            setSide(myPair[0] === userProfile.uid ? 'PLAYER' : 'OPPONENT');
            setTimeout(() => { startMatch(mId, myPair![0] === userProfile.uid); lobbyChannel.unsubscribe(); }, 1000);
          }
        }
      }).subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { await lobbyChannel.track({ user_id: userProfile.uid, name: userProfile.displayName, joined_at: Date.now() }); }
      });
  };

  const startMatch = (mId: string, amIHost: boolean) => {
    setIsQueuing(false); setIsHost(amIHost); setMulliganPhase(true);
    const squad = userProfile.squads[userProfile.activeSquadIndex].map(id => ALL_ASSETS.find(a => a.id === id)).filter(Boolean) as Operator[];
    const shuffled = [...squad].sort(() => Math.random() - 0.5);
    setPlayerHand(shuffled.slice(0, 4)); setPlayerDeck(shuffled.slice(4));

    const matchChannel = supabase.channel(mId);
    const kernel = new BattleKernel(
      (w) => { if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'game_over', payload: { winner: w } }); syncMatchState(matchChannel); } },
      () => {},
      (unit, reason) => { if (amIHost && reason !== 'SCORED_GOAL') { matchChannel.send({ type: 'broadcast', event: 'unit_removed', payload: { owner: unit.owner, opId: unit.id } }); } },
      (p) => { setPhase(p); if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'phase_change', payload: p }); syncMatchState(matchChannel); } },
      (turn) => { if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'turn_start', payload: turn }); syncMatchState(matchChannel); } },
      (lane, row, value, type) => { matchChannel.send({ type: 'broadcast', event: 'combat_event', payload: { lane, row, value, type } }); }
    );
    if (amIHost) kernel.start();
    kernelRef.current = kernel;

    matchChannel
      .on('broadcast', { event: 'deploy_unit' }, ({ payload }) => {
        if (amIHost && kernelRef.current) {
          const op = ALL_ASSETS.find(a => a.id === payload.opId);
          if (op) {
            const kRow = payload.side === 'PLAYER' ? payload.row : 6 - payload.row;
            const kOwner = payload.side === 'PLAYER' ? 'PLAYER' : 'AI';
            kernelRef.current.deployUnit(op, kOwner, payload.lane, kRow);
            syncMatchState(matchChannel);
          }
        }
      })
      .on('broadcast', { event: 'authorize_ready' }, ({ payload }) => {
        if (amIHost) { if (payload.side === 'PLAYER') setPlayerReady(true); else setOpponentReady(true); }
      })
      .on('broadcast', { event: 'match_sync' }, ({ payload }) => {
        if (!amIHost && kernelRef.current) {
          setPhase(payload.phase);
          setUiState({ playerLP: payload.playerLP, opponentLP: payload.opponentLP, playerDP: Math.floor(payload.playerDP), opponentDP: Math.floor(payload.opponentDP) });
          kernelRef.current.units = payload.units; kernelRef.current.playerLP = payload.playerLP; kernelRef.current.aiLP = payload.opponentLP;
          kernelRef.current.playerDP = payload.playerDP; kernelRef.current.aiDP = payload.opponentDP; kernelRef.current.phase = payload.phase;
        }
      })
      .on('broadcast', { event: 'combat_event' }, ({ payload }) => { handleCombatEvent(payload.lane, payload.row, payload.value, payload.type); })
      .on('broadcast', { event: 'unit_removed' }, ({ payload }) => {
          const isMe = (side === 'PLAYER' && payload.owner === 'PLAYER') || (side === 'OPPONENT' && payload.owner === 'AI');
          if (isMe) {
              const op = ALL_ASSETS.find(a => a.id === payload.opId);
              if (op) { let cooldown = op.class === 'Specialist' ? 1 : 4; setPlayerCooldowns(prev => [...prev, { op, turnsRemaining: cooldown }]); }
          }
      })
      .on('broadcast', { event: 'phase_change' }, ({ payload }) => { if (!amIHost) setPhase(payload); })
      .on('broadcast', { event: 'game_over' }, ({ payload }) => {
          const iWon = (side === 'PLAYER' && payload.winner === 'PLAYER') || (side === 'OPPONENT' && payload.winner === 'AI');
          setWinner(iWon ? 'PLAYER' : 'OPPONENT'); onMatchEnd(iWon ? 'Win' : 'Loss');
      })
      .on('broadcast', { event: 'ready_sync' }, ({ payload }) => {
          if (!amIHost) { setPlayerReady(side === 'PLAYER' ? payload.playerReady : payload.opponentReady); setOpponentReady(side === 'PLAYER' ? payload.opponentReady : payload.playerReady); }
      })
      .subscribe();
    setChannel(matchChannel);
  };

  const syncMatchState = (chan: RealtimeChannel) => {
    if (!kernelRef.current) return;
    const state = { units: kernelRef.current.units, phase: kernelRef.current.phase, turn: kernelRef.current.turnCount, playerLP: kernelRef.current.playerLP, opponentLP: kernelRef.current.aiLP, playerDP: kernelRef.current.playerDP, opponentDP: kernelRef.current.aiDP };
    setUiState({ playerLP: state.playerLP, opponentLP: state.opponentLP, playerDP: Math.floor(state.playerDP), opponentDP: Math.floor(state.opponentDP) });
    chan.send({ type: 'broadcast', event: 'match_sync', payload: state });
  };

  // --- RENDERING (TWIN) ---
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
    let minDist = 1600; let nearest = { lane: -1, row: -1 };
    for (let r = 0; r < 7; r++) { for (let l = 0; l < 3; l++) {
        const p = project(l, r); const d = Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2);
        if (d < minDist) { minDist = d; nearest = { lane: l, row: r }; }
    }}
    return nearest.lane === -1 ? { lane: null, row: null } : nearest;
  };

  const render = React.useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    ctx.strokeStyle = 'rgba(0, 152, 217, 0.05)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 12; i++) { const pS = project(-1.5, i * (7 / 12) - 0.5); const pE = project(3.5, i * (7 / 12) - 0.5); ctx.beginPath(); ctx.moveTo(pS.x, pS.y); ctx.lineTo(pE.x, pE.y); ctx.stroke(); }
    for (let i = 0; i <= 8; i++) { const pS = project(i * (5 / 8) - 1.5, -0.5); const pE = project(i * (5 / 8) - 1.5, 6.5); ctx.beginPath(); ctx.moveTo(pS.x, pS.y); ctx.lineTo(pE.x, pE.y); ctx.stroke(); }

    // Platforms
    for (let r = 0; r < 7; r++) { for (let l = 0; l < 3; l++) {
        const isSelected = selectedLane === l && selectedRow === r; const padSize = isSelected ? 0.43 : 0.4; const center = project(l, r);
        const p0 = project(l - padSize, r - padSize); const p1 = project(l + padSize, r - padSize); const p2 = project(l + padSize, r + padSize); const p3 = project(l - padSize, r + padSize);
        const baseHeight = (r === 0 || r === 6) ? 6 : 4; const p2d = { x: p2.x, y: p2.y + baseHeight }; const p3d = { x: p3.x, y: p3.y + baseHeight };
        ctx.fillStyle = isSelected ? 'rgba(0, 255, 231, 0.4)' : 'rgba(0, 152, 217, 0.1)'; ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p2d.x, p2d.y); ctx.lineTo(p3d.x, p3d.y); ctx.closePath(); ctx.fill();
        let surface = isSelected ? 'rgba(0, 152, 217, 0.4)' : (r === 0 ? 'rgba(255, 59, 59, 0.4)' : r === 6 ? 'rgba(0, 255, 231, 0.4)' : 'rgba(10, 10, 20, 0.98)');
        ctx.fillStyle = surface; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = isSelected ? 'rgba(0, 255, 231, 1)' : 'rgba(0, 152, 217, 0.15)'; ctx.lineWidth = isSelected ? 2 : 0.8; ctx.stroke();
    }}

    // Goal Accents (Simulation Twin)
    const aiBase = project(1, 0.2); const plBase = project(1, 5.8);
    ctx.font = '900 10px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255, 59, 59, 0.9)'; ctx.shadowBlur = 5; ctx.shadowColor = '#ff3b3b'; ctx.fillText('SIGNAL HOSTILE // ELIMINATION TARGET', aiBase.x, aiBase.y - 45);
    ctx.fillStyle = 'rgba(0, 255, 231, 0.9)'; ctx.shadowColor = '#00ffe7'; ctx.fillText('SIGNAL FRIENDLY // CORE SYNC', plBase.x, plBase.y + 45); ctx.shadowBlur = 0;

    // Units
    kernelRef.current?.units.forEach(u => {
      const displayRow = side === 'PLAYER' ? u.row : 6 - u.row; const displayLane = side === 'PLAYER' ? u.lane : 2 - u.lane;
      const isMe = (side === 'PLAYER' && u.owner === 'PLAYER') || (side === 'OPPONENT' && u.owner === 'AI');
      const view = isMe ? 'Back' : 'Front'; const mainColor = isMe ? '#00ffe7' : '#ff3b3b';
      const basePos = project(displayLane, displayRow); const spriteImg = spriteImages.current[`${u.id}_${view}`];
      if (spriteImg && spriteImg.complete) { ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = mainColor + '44'; let s = 140; let yOff = 40; if (u.name.includes('Slug')) { s = 800; yOff = 225; } ctx.drawImage(spriteImg, basePos.x - s/2, basePos.y - s + yOff, s, s); ctx.restore(); }
      const hpP = u.hp / u.maxHp; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(basePos.x - 15, basePos.y - 45, 30, 3); ctx.fillStyle = mainColor; ctx.fillRect(basePos.x - 15, basePos.y - 45, 30 * hpP, 3);
    });

    // Labels
    const now = Date.now();
    floatingLabels.current = floatingLabels.current.filter(l => {
      const age = now - l.createdAt; l.life = 1 - (age / 1200); if (l.life <= 0) return false;
      ctx.save(); ctx.globalAlpha = l.life; ctx.fillStyle = l.type === 'DAMAGE' ? '#ff3b3b' : '#22c55e'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText(l.value, l.x, l.y - (1 - l.life) * 40); ctx.restore();
      return true;
    });
  }, [side, selectedLane, selectedRow, draggingOp, phase]);

  useEffect(() => {
    let animId: number;
    const loop = () => { if (isHost && kernelRef.current && phase === 'ACTION' && !isPaused) { kernelRef.current.tick(); syncMatchState(channel!); } render(); animId = requestAnimationFrame(loop); };
    loop(); return () => cancelAnimationFrame(animId);
  }, [phase, isHost, isPaused, side, selectedLane, selectedRow, draggingOp, render]);

  // --- HANDLERS ---
  const handleDragStart = (op: Operator, index: number, e: any) => { if (phase !== 'COMMAND') return; setDraggingOp({ op, index }); setDragPos({ x: e.clientX || e.touches[0].clientX, y: e.clientY || e.touches[0].clientY }); };
  const handleDragMove = (e: any) => {
    if (!draggingOp) return; const x = e.clientX || e.touches[0].clientX; const y = e.clientY || e.touches[0].clientY; setDragPos({ x, y });
    const rect = canvasRef.current?.getBoundingClientRect(); if (rect) { const ux = (x - rect.left) * (CANVAS_W / rect.width); const uy = (y - rect.top) * (CANVAS_H / rect.height); const { lane, row } = unproject(ux, uy); setSelectedLane(lane); setSelectedRow(row); }
  };
  const handleDragEnd = () => {
    if (draggingOp && selectedLane !== null && selectedRow !== null) {
      if (uiState.playerDP >= draggingOp.op.dp_cost) {
          channel?.send({ type: 'broadcast', event: 'deploy_unit', payload: { opId: draggingOp.op.id, lane: selectedLane, row: selectedRow, side } });
          setPlayerHand(prev => prev.filter((_, i) => i !== draggingOp.index)); if (playerDeck.length > 0) { setPlayerHand(prev => [...prev, playerDeck[0]]); setPlayerDeck(prev => prev.slice(1)); }
      }
    }
    setDraggingOp(null); setSelectedLane(null); setSelectedRow(null);
  };
  const handleCombatEvent = (lane: number, row: number, value: number, type: any) => {
    const pos = project(lane, row, 10); floatingLabels.current.push({ id: Math.random().toString(36).substr(2, 9), x: pos.x + (Math.random()-0.5)*30, y: pos.y + (Math.random()-0.5)*15, value: value > 0 ? value.toString() : '', type, life: 1.0, createdAt: Date.now() });
  };
  const handleAuthorize = () => {
    setPlayerReady(true); channel?.send({ type: 'broadcast', event: 'authorize_ready', payload: { side } });
    if (isHost && opponentReady) { setPlayerReady(false); setOpponentReady(false); kernelRef.current?.executeStrategy(); syncMatchState(channel!); }
  };

  if (isQueuing) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black relative overflow-hidden">
        {/* Technical Background Accents */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
           <div className="absolute top-0 left-0 w-full h-px bg-rhodes-blue" />
           <div className="absolute bottom-0 left-0 w-full h-px bg-rhodes-blue" />
           <div className="absolute top-0 left-0 w-px h-full bg-rhodes-blue" />
           <div className="absolute top-0 right-0 w-px h-full bg-rhodes-blue" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center relative z-10 p-8 text-center"
        >
          {/* Animated Spinner Core */}
          <div className="relative w-32 h-32 mb-16">
             <motion.div 
               animate={{ rotate: 360 }}
               transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
               className="absolute inset-0 border border-rhodes-blue/20 rounded-full" 
             />
             <motion.div 
               animate={{ rotate: -360 }}
               transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
               className="absolute inset-2 border-2 border-dashed border-rhodes-blue/10 rounded-full" 
             />
             <div className="absolute inset-4 border-4 border-t-rhodes-blue border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
             <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-1 h-1 bg-rhodes-blue rounded-full animate-pulse shadow-[0_0_10px_#0098d9]" />
             </div>
          </div>

          <div className="space-y-4 max-w-[280px]">
            <h2 className="terminal-text text-xl font-black text-rhodes-blue tracking-[0.2em] uppercase italic leading-tight">
              Establishing<br />Neural Link
            </h2>
            
            <div className="flex items-center justify-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-rhodes-blue/30" />
              <div className="w-1 h-1 bg-rhodes-blue rotate-45" />
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-rhodes-blue/30" />
            </div>

            <p className="terminal-text text-[9px] text-white/30 tracking-[0.3em] uppercase animate-pulse">
              Syncing Conflict Area Parameters...
            </p>
          </div>

          <div className="mt-24">
            <button 
              onClick={onBack} 
              className="group flex flex-col items-center gap-2"
            >
              <span className="terminal-text text-[10px] text-white/40 group-hover:text-white transition-colors tracking-[0.4em] uppercase font-bold">
                Abort Search
              </span>
              <div className="w-8 h-0.5 bg-white/10 group-hover:w-16 group-hover:bg-rhodes-blue transition-all duration-300" />
            </button>
          </div>
        </motion.div>

        {/* Technical Corner Accents */}
        <div className="absolute top-4 left-4 text-[8px] terminal-text text-rhodes-blue/20 uppercase font-black tracking-widest">PRTS // SYS.LINK</div>
        <div className="absolute bottom-4 right-4 text-[8px] terminal-text text-rhodes-blue/20 uppercase font-black tracking-widest">RHODES.ISLAND.TERM</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black relative overflow-hidden select-none" onMouseMove={handleDragMove} onTouchMove={handleDragMove} onMouseUp={handleDragEnd} onTouchEnd={handleDragEnd}>
      {/* Header */}
      <div className="p-2 px-4 border-b border-rhodes-border flex justify-between items-center bg-black/95 backdrop-blur-md z-30 shrink-0 shadow-lg">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-rhodes-blue transition-colors group">
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="terminal-text text-[8px] font-bold tracking-widest uppercase">Abort</span>
        </button>
        <div className="flex gap-4 sm:gap-8 items-center">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5"> {[...Array(3)].map((_, i) => ( <div key={i} className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < uiState.playerLP ? 'bg-rhodes-blue shadow-[0_0_5px_#19baff]' : 'bg-white/5 border border-white/5'}`} /> ))} </div>
              <span className="terminal-text font-black text-xs text-rhodes-blue">{uiState.playerLP}</span>
            </div>
            <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Doctor HP</span>
          </div>
          <div className="px-4 py-1.5 bg-rhodes-blue/10 border border-rhodes-blue/30 rounded-full"> <span className="terminal-text text-[10px] font-black tracking-[0.2em] text-rhodes-blue uppercase">{phase}</span> </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <span className="terminal-text font-black text-xs text-red-500">{uiState.opponentLP}</span>
              <div className="flex gap-0.5"> {[...Array(3)].map((_, i) => ( <div key={i} className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < uiState.opponentLP ? 'bg-red-500 shadow-[0_0_5px_#ef4444]' : 'bg-white/5 border border-white/5'}`} /> ))} </div>
            </div>
            <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Target HP</span>
          </div>
        </div>
        <button onClick={() => setIsPaused(!isPaused)} className="p-2 rounded-full border border-white/10 text-white/40 hover:text-white"> {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} </button>
      </div>

      {/* Battlefield */}
      <div className="flex-1 relative bg-black/40 overflow-hidden">
        <canvas ref={canvasRef} width={450} height={400} className="w-full h-full cursor-crosshair" />

        {/* Authorize Button */}
        <AnimatePresence>
          {phase === 'COMMAND' && (
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 1.1, opacity: 0, y: 10 }} className="absolute bottom-6 right-6 z-40">
              <button onClick={handleAuthorize} disabled={playerReady} className={`rhodes-button glow-blue px-6 py-2.5 flex items-center gap-2 ${playerReady ? 'opacity-50 grayscale' : 'bg-rhodes-blue text-black'}`}>
                {playerReady ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span className="terminal-text text-[10px] font-black tracking-[0.2em] uppercase">{playerReady ? 'Syncing...' : 'Authorize'}</span>
              </button>
              {opponentReady && <div className="absolute -top-8 right-0 text-[8px] text-rhodes-blue terminal-text animate-pulse font-black uppercase">Opponent Ready</div>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tactical Authorization Twin Port */}
        <AnimatePresence>
          {mulliganPhase && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/98 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-md">
                <div className="mb-4 text-center">
                  <h2 className="text-xl font-black terminal-text text-white tracking-widest uppercase mb-1 italic">Tactical Authorization</h2>
                  <div className="flex items-center justify-center gap-2"> <div className="h-px w-6 bg-rhodes-blue/30" /> <p className="terminal-text text-[7px] text-rhodes-blue font-bold tracking-[0.2em] uppercase">Initial Link Prep</p> <div className="h-px w-6 bg-rhodes-blue/30" /> </div>
                </div>
                <div className="flex justify-center gap-1.5 mb-8 w-full">
                    {playerHand.map((op, idx) => (
                        <div key={op.id} onClick={() => setMulliganSelected(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])} className={`w-[18vw] max-w-[80px] aspect-[2/3] border-2 rounded-sm overflow-hidden cursor-pointer transition-all ${mulliganSelected.includes(idx) ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-white/10 hover:border-rhodes-blue/50'}`}>
                            <img src={getCardImagePath(op)} className={`w-full h-full object-contain ${mulliganSelected.includes(idx) ? 'opacity-20 grayscale brightness-50' : 'opacity-70'}`} referrerPolicy="no-referrer" />
                        </div>
                    ))}
                </div>
                <div className="flex flex-col items-center gap-4">
                  <button onClick={() => { if (mulliganSelected.length > 0) { const newHand = [...playerHand]; const newDeck = [...playerDeck]; mulliganSelected.forEach(idx => { const card = newHand[idx]; const next = newDeck.shift(); if (next) { newHand[idx] = next; newDeck.push(card); } }); setPlayerHand(newHand); setPlayerDeck(newDeck); } setMulliganPhase(false); }} className={`rhodes-button px-10 py-2.5 group relative overflow-hidden transition-all ${mulliganSelected.length > 0 ? 'glow-blue border-rhodes-blue/50' : 'opacity-20 grayscale border-white/10'}`}>
                    <div className="flex items-center gap-2"> <RotateCcw className={`w-3 h-3 ${mulliganSelected.length > 0 ? 'text-rhodes-blue animate-spin-slow' : 'text-white/20'}`} /> <span className="terminal-text font-black tracking-widest text-[10px] text-rhodes-blue uppercase">RECYCLE {mulliganSelected.length} {mulliganSelected.length === 1 ? 'UNIT' : 'UNITS'}</span> </div>
                  </button>
                  <button onClick={() => setMulliganPhase(false)} className="terminal-text text-[8px] text-white/30 hover:text-white transition-colors tracking-[0.3em] font-bold uppercase">Skip & Start Operation</button>
                </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Victory/Defeat Twin Port */}
        <AnimatePresence>
          {winner && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center backdrop-blur-xl p-8 text-center">
                <div className="relative mb-8">
                  <div className={`text-7xl font-black italic tracking-tighter ${winner === 'PLAYER' ? 'text-rhodes-blue' : 'text-red-600'} drop-shadow-[0_0_30px_currentColor]`}> {winner === 'PLAYER' ? 'VICTORY' : 'DEFEAT'} </div>
                  <div className="absolute -bottom-2 right-0 bg-white text-black text-[10px] font-black px-2 py-0.5 terminal-text uppercase"> Simulation {winner === 'PLAYER' ? 'Success' : 'Terminated'} </div>
                </div>
                <p className="terminal-text text-[10px] text-white/40 uppercase tracking-[0.5em] mb-12 max-w-[300px]"> {winner === 'PLAYER' ? "Neural link synchronization complete. Tactical objectives achieved." : "Neural link integrity compromised. Aborting simulation sequence."} </p>
                <button onClick={onBack} className="rhodes-button glow-blue px-16 py-4 bg-rhodes-blue text-black font-black terminal-text text-sm uppercase">Return to Terminal</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hand (Deck) Twin Port */}
      <div className="p-2 bg-[#050505] border-t border-rhodes-border shrink-0 z-20 shadow-2xl">
        <div className="flex justify-between items-center mb-2 px-2">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-2 py-1 rounded-sm">
                    <Zap className="w-3 h-3 text-orange-500" /> <span className="text-[10px] font-black terminal-text text-orange-500 leading-none">{uiState.playerDP}</span>
                </div>
                <button onClick={() => { if (playerHand.length < 6 && uiState.playerDP >= 5 && playerDeck.length > 0) { const next = playerDeck[0]; setPlayerHand([...playerHand, next]); setPlayerDeck(playerDeck.slice(1)); if (isHost && kernelRef.current) { kernelRef.current.playerDP -= 5; syncMatchState(channel!); } } }} className={`rhodes-button h-8 px-3 text-[8px] font-black uppercase ${playerHand.length < 6 && uiState.playerDP >= 5 && phase === 'COMMAND' ? 'glow-blue text-rhodes-blue' : 'opacity-30 grayscale pointer-events-none'}`}>
                  Supply 5
                </button>
            </div>
            <div className="text-[6px] text-rhodes-blue/40 terminal-text uppercase font-bold tracking-widest italic">Signal Deck: {playerDeck.length}</div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 px-1 custom-scrollbar">
          {playerHand.map((op, idx) => (
            <div key={idx} onMouseDown={(e) => handleDragStart(op, idx, e)} className={`w-16 h-24 border rounded-sm relative overflow-hidden shrink-0 transition-all ${uiState.playerDP >= op.dp_cost && phase === 'COMMAND' ? 'border-rhodes-blue/40 bg-rhodes-blue/5 shadow-inner' : 'border-white/5 opacity-40 grayscale'} ${draggingOp?.index === idx ? 'opacity-0 scale-95' : ''}`}>
                <img src={getCardImagePath(op)} className="w-full h-full object-contain opacity-70" referrerPolicy="no-referrer" />
                <div className="absolute top-0.5 right-0.5 bg-black/80 px-1 py-0.5 rounded-sm border border-rhodes-blue/20"> <span className="text-[8px] font-black terminal-text text-rhodes-blue">{op.dp_cost}</span> </div>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${uiState.playerDP >= op.dp_cost ? 'bg-rhodes-blue shadow-[0_0_5px_#0098d9]' : 'bg-white/10'}`} />
            </div>
          ))}
          {playerCooldowns.map((c, i) => ( <div key={i} className="w-16 h-24 border border-white/5 bg-black/80 rounded-sm relative opacity-60 flex flex-col items-center justify-center shrink-0"> <RotateCcw className="w-4 h-4 text-white/10 animate-spin-slow mb-1" /> <span className="text-[8px] font-black text-rhodes-blue">{c.turnsRemaining}T</span> </div> ))}
        </div>
      </div>

      {/* Dragging Ghost Twin Port */}
      {draggingOp && ( <div className="fixed pointer-events-none z-[1000] w-16 h-24 border border-rhodes-blue bg-rhodes-blue/20 rounded overflow-hidden shadow-2xl" style={{ left: dragPos.x - 32, top: dragPos.y - 48, transform: 'scale(1.1)' }}> <img src={getCardImagePath(draggingOp.op)} className="w-full h-full object-contain opacity-90" referrerPolicy="no-referrer" /> </div> )}
    </div>
  );
}
