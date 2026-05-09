import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Pause, Play, RotateCcw, Zap, Heart, Trash2, Star, Loader2
} from 'lucide-react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { ALL_ASSETS, Operator } from '../data/operators';
import { BattleKernel, GameUnit, GamePhase } from '../game/BattleKernel';
import { getSpriteImagePath, getCardImagePath } from '../utils/assetUtils';
import { RealtimeChannel } from '@supabase/supabase-js';

const CANVAS_W = 450;
const CANVAS_H = 400;
const PROJECT_CONFIG = {
  topY: 100, bottomY: 320, topWidth: 220, bottomWidth: 420, zFactor: 1.3
};

interface ConflictScreenProps {
  userProfile: UserProfile;
  onUpdateProfile: (p: UserProfile) => void;
  onBack: () => void;
  onMatchEnd: (result: 'Win' | 'Loss') => void;
}

interface FloatingLabel {
  id: string; x: number; y: number; value: string; type: 'DAMAGE' | 'HEAL' | 'STUN' | 'CRIT' | 'TRUE'; life: number; createdAt: number;
}

interface PendingDeploy {
  op: Operator; lane: number; row: number; side: 'PLAYER' | 'OPPONENT';
}

export default function ConflictScreen({ userProfile, onUpdateProfile, onBack, onMatchEnd }: ConflictScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // -- SYNC STATES --
  const [matchId, setMatchId] = useState<string | null>(null);
  const [side, setSide] = useState<'PLAYER' | 'OPPONENT' | null>(null);
  const [isQueuing, setIsQueuing] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  // -- GAME STATES --
  const [isPaused, setIsPaused] = useState(false);
  const [playerHand, setPlayerHand] = useState<Operator[]>([]);
  const [playerDeck, setPlayerDeck] = useState<Operator[]>([]);
  const [mulliganPhase, setMulliganPhase] = useState(true);
  const [mulliganSelected, setMulliganSelected] = useState<number[]>([]);
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [winner, setWinner] = useState<'PLAYER' | 'OPPONENT' | null>(null);
  const [phase, setPhase] = useState<GamePhase>('COMMAND');
  const [draggingOp, setDraggingOp] = useState<{ op: Operator, index: number } | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [playerCooldowns, setPlayerCooldowns] = useState<{ op: Operator, turnsRemaining: number }[]>([]);
  const [playerReady, setPlayerReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [pendingDeploys, setPendingDeploys] = useState<PendingDeploy[]>([]);
  
  const [uiState, setUiState] = useState({
    playerLP: 3, opponentLP: 3, playerDP: 15, opponentDP: 15,
  });

  const pendingUnitsRef = useRef<PendingDeploy[]>([]); 
  const floatingLabels = useRef<FloatingLabel[]>([]);
  const spriteImages = useRef<Record<string, HTMLImageElement>>({});
  const kernelRef = useRef<BattleKernel | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!matchId) joinLobby();
    ALL_ASSETS.forEach(op => {
      ['Front', 'Back'].forEach(view => {
        const path = getSpriteImagePath(op, view as 'Front' | 'Back');
        const img = new Image(); img.src = path; spriteImages.current[`${op.id}_${view}`] = img;
      });
    });
    return () => { channelRef.current?.unsubscribe(); };
  }, []);

  const joinLobby = async () => {
    setIsQueuing(true);
    const lobbyChannel = supabase.channel('lobby', { config: { presence: { key: userProfile.uid } } });
    let matchStarted = false;
    lobbyChannel.on('presence', { event: 'sync' }, () => {
        if (matchStarted) return;
        const state = lobbyChannel.presenceState();
        const users = Object.keys(state).sort();
        if (users.length >= 2) {
          let myPair: string[] | null = null;
          for (let i = 0; i < users.length - 1; i += 2) {
            const p = [users[i], users[i+1]];
            if (p.includes(userProfile.uid)) { myPair = p; break; }
          }
          if (myPair) {
            matchStarted = true;
            const mId = `match_${myPair.join('_')}`;
            setMatchId(mId);
            const myActualSide = myPair[0] === userProfile.uid ? 'PLAYER' : 'OPPONENT';
            setSide(myActualSide);
            startMatch(mId, myActualSide === 'PLAYER', myActualSide);
            setTimeout(() => { lobbyChannel.unsubscribe(); }, 5000);
          }
        }
      }).subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { await lobbyChannel.track({ user_id: userProfile.uid, name: userProfile.displayName, joined_at: Date.now() }); }
      });
  };

  const startMatch = (mId: string, amIHost: boolean, mySide: 'PLAYER' | 'OPPONENT') => {
    setIsQueuing(false); setIsHost(amIHost); setMulliganPhase(true);
    const squad = userProfile.squads[userProfile.activeSquadIndex].map(id => ALL_ASSETS.find(a => a.id === id)).filter(Boolean) as Operator[];
    const shuffled = [...squad].sort(() => Math.random() - 0.5);
    setPlayerHand(shuffled.slice(0, 4)); setPlayerDeck(shuffled.slice(4));

    const matchChannel = supabase.channel(mId);
    channelRef.current = matchChannel;
    setChannel(matchChannel);

    const kernel = new BattleKernel(
      (w) => { if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'game_over', payload: { winner: w } }); syncMatchState(); } },
      () => {},
      (unit, reason) => { if (amIHost && reason !== 'SCORED_GOAL') { matchChannel.send({ type: 'broadcast', event: 'unit_removed', payload: { owner: unit.owner, opId: unit.id } }); } },
      (p) => { setPhase(p); if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'phase_change', payload: p }); syncMatchState(); } },
      (turn) => { if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'turn_start', payload: turn }); syncMatchState(); } },
      (lane, row, value, type) => { matchChannel.send({ type: 'broadcast', event: 'combat_event', payload: { lane, row, value, type } }); }
    );
    if (amIHost) kernel.start();
    kernelRef.current = kernel;

    matchChannel
      .on('broadcast', { event: 'request_deploy' }, ({ payload }) => {
        if (amIHost && kernelRef.current) {
          const op = ALL_ASSETS.find(a => a.id === payload.opId);
          if (op) {
            const isPl = payload.side === 'PLAYER';
            const currentDP = isPl ? kernelRef.current.playerDP : kernelRef.current.aiDP;
            if (currentDP >= op.dp_cost) {
                if (isPl) kernelRef.current.playerDP -= op.dp_cost; else kernelRef.current.aiDP -= op.dp_cost;
                // Position flip for kernel: Guest's row 5 is kernel row 1
                const kRow = isPl ? payload.row : 6 - payload.row;
                const kLane = isPl ? payload.lane : 2 - payload.lane;
                pendingUnitsRef.current.push({ op, lane: kLane, row: kRow, side: payload.side });
                syncMatchState(); 
            }
          }
        }
      })
      .on('broadcast', { event: 'request_supply' }, ({ payload }) => {
          if (amIHost && kernelRef.current) {
              const currentDP = payload.side === 'PLAYER' ? kernelRef.current.playerDP : kernelRef.current.aiDP;
              if (currentDP >= 5) {
                  if (payload.side === 'PLAYER') kernelRef.current.playerDP -= 5; else kernelRef.current.aiDP -= 5;
                  syncMatchState();
                  matchChannel.send({ type: 'broadcast', event: 'supply_confirmed', payload: { side: payload.side } });
              }
          }
      })
      .on('broadcast', { event: 'supply_confirmed' }, ({ payload }) => {
          if (mySide === payload.side) {
              setPlayerHand(prev => {
                  if (prev.length >= 6) return prev;
                  const next = playerDeck[0];
                  if (!next) return prev;
                  setPlayerDeck(d => d.slice(1));
                  return [...prev, next];
              });
          }
      })
      .on('broadcast', { event: 'authorize_ready' }, ({ payload }) => {
        if (amIHost) { 
            if (payload.side === 'PLAYER') setPlayerReady(true); else setOpponentReady(true);
        }
      })
      .on('broadcast', { event: 'ready_sync' }, ({ payload }) => {
          if (!amIHost) { setPlayerReady(payload.playerReady); setOpponentReady(payload.opponentReady); }
      })
      .on('broadcast', { event: 'start_action' }, () => { setPlayerReady(false); setOpponentReady(false); setPendingDeploys([]); })
      .on('broadcast', { event: 'match_sync' }, ({ payload }) => {
        if (!amIHost && kernelRef.current) {
          setPhase(payload.phase);
          const isPl = mySide === 'PLAYER';
          const myDP = isPl ? payload.playerDP : payload.opponentDP;
          const oppDP = isPl ? payload.opponentDP : payload.playerDP;
          const myLP = isPl ? payload.playerLP : payload.opponentLP;
          const oppLP = isPl ? payload.opponentLP : payload.playerLP;
          setUiState({ playerLP: myLP, opponentLP: oppLP, playerDP: Math.floor(myDP), opponentDP: Math.floor(oppDP) });
          kernelRef.current.units = payload.units; kernelRef.current.playerLP = payload.playerLP; kernelRef.current.aiLP = payload.opponentLP;
          kernelRef.current.playerDP = payload.playerDP; kernelRef.current.aiDP = payload.opponentDP; kernelRef.current.phase = payload.phase;
        }
      })
      .on('broadcast', { event: 'combat_event' }, ({ payload }) => { handleCombatEvent(payload.lane, payload.row, payload.value, payload.type); })
      .on('broadcast', { event: 'unit_removed' }, ({ payload }) => {
          const isMe = (mySide === 'PLAYER' && payload.owner === 'PLAYER') || (mySide === 'OPPONENT' && payload.owner === 'AI');
          if (isMe) {
              const op = ALL_ASSETS.find(a => a.id === payload.opId);
              if (op) { let cooldown = op.class === 'Specialist' ? 1 : 4; setPlayerCooldowns(prev => [...prev, { op, turnsRemaining: cooldown }]); }
          }
      })
      .on('broadcast', { event: 'phase_change' }, ({ payload }) => { if (!amIHost) setPhase(payload); })
      .on('broadcast', { event: 'game_over' }, ({ payload }) => {
          const iWon = (mySide === 'PLAYER' && payload.winner === 'PLAYER') || (mySide === 'OPPONENT' && payload.winner === 'AI');
          setWinner(iWon ? 'PLAYER' : 'OPPONENT'); onMatchEnd(iWon ? 'Win' : 'Loss');
      })
      .subscribe((status, err) => {
          if (err) (window as any).LAST_SYNC_ERROR = err;
          if (status === 'SUBSCRIBED') (window as any).LAST_SYNC_ERROR = null;
          if (status === 'TIMED_OUT' || status === 'CLOSED') { (window as any).LAST_SYNC_ERROR = { message: 'CONNECTION INTERRUPTED' }; }
      });
  };

  useEffect(() => {
      if (isHost && playerReady && opponentReady && phase === 'COMMAND') {
          pendingUnitsRef.current.forEach(p => {
              kernelRef.current?.deployUnit(p.op, p.side === 'PLAYER' ? 'PLAYER' : 'AI', p.lane, p.row);
          });
          pendingUnitsRef.current = [];
          setPlayerReady(false); setOpponentReady(false); setPendingDeploys([]);
          channelRef.current?.send({ type: 'broadcast', event: 'start_action' });
          kernelRef.current?.executeStrategy();
          syncMatchState();
      } else if (isHost) {
          channelRef.current?.send({ type: 'broadcast', event: 'ready_sync', payload: { playerReady, opponentReady } });
      }
  }, [playerReady, opponentReady, isHost, phase]);

  const syncMatchState = () => {
    if (!kernelRef.current || !channelRef.current) return;
    const state = { units: kernelRef.current.units, phase: kernelRef.current.phase, turn: kernelRef.current.turnCount, playerLP: kernelRef.current.playerLP, opponentLP: kernelRef.current.aiLP, playerDP: kernelRef.current.playerDP, opponentDP: kernelRef.current.aiDP };
    const isPl = side === 'PLAYER';
    const myDP = isPl ? state.playerDP : state.opponentDP;
    const oppDP = isPl ? state.opponentDP : state.playerDP;
    const myLP = isPl ? state.playerLP : state.opponentLP;
    const oppLP = isPl ? state.opponentLP : state.playerLP;
    setUiState({ playerLP: myLP, opponentLP: oppLP, playerDP: Math.floor(myDP), opponentDP: Math.floor(oppDP) });
    channelRef.current.send({ type: 'broadcast', event: 'match_sync', payload: state });
  };

  // --- RENDERING (COORDINATE FLIPPED) ---
  const project = (l: number, r: number, z = 0) => {
    // VISUAL COORDINATES: r=0 is top, r=6 is bottom for EVERYONE.
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

  const isHighGround = (r: number) => r === 5;
  const canPlaceOnTile = (opClass: string, r: number) => {
      const isRanged = ['Sniper', 'Caster', 'Medic'].includes(opClass);
      if (r === 5) return true; 
      if (r === 4) return !isRanged;
      return false;
  };

  const render = React.useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Grid (Visual Only)
    ctx.strokeStyle = 'rgba(0, 152, 217, 0.05)'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 12; i++) { const pS = project(-1.5, i * (7 / 12) - 0.5); const pE = project(3.5, i * (7 / 12) - 0.5); ctx.beginPath(); ctx.moveTo(pS.x, pS.y); ctx.lineTo(pE.x, pE.y); ctx.stroke(); }
    for (let i = 0; i <= 8; i++) { const pS = project(i * (5 / 8) - 1.5, -0.5); const pE = project(i * (5 / 8) - 1.5, 6.5); ctx.beginPath(); ctx.moveTo(pS.x, pS.y); ctx.lineTo(pE.x, pE.y); ctx.stroke(); }

    // Platforms (Visual Only)
    for (let r = 0; r < 7; r++) { for (let l = 0; l < 3; l++) {
        const isSelected = selectedLane === l && selectedRow === r; const isPlat = isHighGround(r);
        const padSize = isSelected ? 0.43 : 0.4;
        const p0 = project(l - padSize, r - padSize); const p1 = project(l + padSize, r - padSize); const p2 = project(l + padSize, r + padSize); const p3 = project(l - padSize, r + padSize);
        const baseHeight = isPlat ? 12 : ((r === 0 || r === 6) ? 6 : 4);
        const p2d = { x: p2.x, y: p2.y + baseHeight }; const p3d = { x: p3.x, y: p3.y + baseHeight };
        ctx.fillStyle = isSelected ? 'rgba(0, 255, 231, 0.4)' : (isPlat ? 'rgba(0, 152, 217, 0.2)' : 'rgba(0, 152, 217, 0.1)');
        ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p2d.x, p2d.y); ctx.lineTo(p3d.x, p3d.y); ctx.closePath(); ctx.fill();
        let surface = isSelected ? 'rgba(0, 152, 217, 0.4)' : (r === 0 ? 'rgba(255, 59, 59, 0.4)' : r === 6 ? 'rgba(0, 255, 231, 0.4)' : (isPlat ? 'rgba(10, 20, 40, 0.98)' : 'rgba(10, 10, 20, 0.98)'));
        ctx.fillStyle = surface; ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = isSelected ? 'rgba(0, 255, 231, 1)' : (isPlat ? 'rgba(0, 255, 231, 0.3)' : 'rgba(0, 152, 217, 0.15)'); ctx.lineWidth = isSelected ? 2 : 0.8; ctx.stroke();
    }}

    const drawUnit = (id: string, name: string, lane: number, row: number, owner: 'PLAYER' | 'AI', hp?: number, maxHp?: number, isPending = false) => {
        const isPl = side === 'PLAYER';
        // KERNEL Row 6 is Player side. KERNEL Row 0 is AI side.
        // VISUALLY: We want OUR side at the bottom (Row 5, 6) and ENEMY at top (Row 0, 1).
        let displayRow = row; 
        let displayLane = lane;
        if (isPl) {
            // Host: Kernel 6 is screen 6.
            displayRow = row; displayLane = lane;
        } else {
            // Guest: Kernel 0 is screen 6.
            displayRow = 6 - row; displayLane = 2 - lane;
        }

        const isMe = (isPl && owner === 'PLAYER') || (!isPl && owner === 'AI');
        const view = isMe ? 'Back' : 'Front'; const mainColor = isMe ? '#00ffe7' : '#ff3b3b';
        const basePos = project(displayLane, displayRow); const spriteImg = spriteImages.current[`${id}_${view}`];
        if (spriteImg && spriteImg.complete) {
            ctx.save(); if (isPending) ctx.globalAlpha = 0.4;
            ctx.shadowBlur = isPending ? 20 : 10; ctx.shadowColor = mainColor + '44';
            let s = 140; let yOff = 40; if (name.includes('Slug')) { s = 800; yOff = 225; } else if (name === 'Zima') { s = 150; yOff = 45; } else if (name === 'Sarkaz Mercenary') { s = 700; yOff = 197; }
            ctx.drawImage(spriteImg, basePos.x - s/2, basePos.y - s + yOff, s, s); ctx.restore();
        }
        if (!isPending && hp !== undefined && maxHp !== undefined) {
            const hpP = hp / maxHp; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(basePos.x - 15, basePos.y - 45, 30, 3); ctx.fillStyle = mainColor; ctx.fillRect(basePos.x - 15, basePos.y - 45, 30 * hpP, 3);
        }
    };

    // Pending deploys are already in Screen Coordinates for the local player
    pendingDeploys.forEach(p => {
        const basePos = project(p.lane, p.row); const spriteImg = spriteImages.current[`${p.op.id}_Back`];
        if (spriteImg && spriteImg.complete) {
            ctx.save(); ctx.globalAlpha = 0.4; ctx.shadowBlur = 20; ctx.shadowColor = '#00ffe744';
            let s = 140; let yOff = 40; if (p.op.name === 'Zima') s = 150;
            ctx.drawImage(spriteImg, basePos.x - s/2, basePos.y - s + yOff, s, s); ctx.restore();
        }
    });

    kernelRef.current?.units.forEach(u => drawUnit(u.id, u.name, u.lane, u.row, u.owner, u.hp, u.maxHp));

    const now = Date.now();
    floatingLabels.current = floatingLabels.current.filter(l => {
      const age = now - l.createdAt; l.life = 1 - (age / 1200); if (l.life <= 0) return false;
      ctx.save(); ctx.globalAlpha = l.life; ctx.fillStyle = l.type === 'DAMAGE' ? '#ff3b3b' : '#22c55e'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText(l.value, l.x, l.y - (1 - l.life) * 40); ctx.restore(); return true;
    });
  }, [side, selectedLane, selectedRow, draggingOp, phase, pendingDeploys]);

  useEffect(() => {
    let animId: number;
    const loop = () => { if (isHost && kernelRef.current && phase === 'ACTION' && !isPaused) { kernelRef.current.tick(); syncMatchState(); } render(); animId = requestAnimationFrame(loop); };
    loop(); return () => cancelAnimationFrame(animId);
  }, [phase, isHost, isPaused, side, selectedLane, selectedRow, draggingOp, render]);

  // --- HANDLERS ---
  const handleDragStart = (op: Operator, index: number, e: any) => { if (phase !== 'COMMAND') return; setDraggingOp({ op, index }); setDragPos({ x: e.clientX || e.touches[0].clientX, y: e.clientY || e.touches[0].clientY }); };
  const handleDragMove = (e: any) => {
    if (!draggingOp) return; const x = e.clientX || e.touches[0].clientX; const y = e.clientY || e.touches[0].clientY; setDragPos({ x, y });
    const rect = canvasRef.current?.getBoundingClientRect(); if (rect) {
        const ux = (x - rect.left) * (CANVAS_W / rect.width); const uy = (y - rect.top) * (CANVAS_H / rect.height);
        const { lane, row } = unproject(ux, uy);
        if (lane !== null && row !== null && canPlaceOnTile(draggingOp.op.class, row)) { setSelectedLane(lane); setSelectedRow(row); } else { setSelectedLane(null); setSelectedRow(null); }
    }
  };
  const handleDragEnd = () => {
    if (draggingOp && selectedLane !== null && selectedRow !== null) {
      if (uiState.playerDP >= draggingOp.op.dp_cost) {
          channelRef.current?.send({ type: 'broadcast', event: 'request_deploy', payload: { opId: draggingOp.op.id, lane: selectedLane, row: selectedRow, side } });
          setPendingDeploys(prev => [...prev, { op: draggingOp.op, lane: selectedLane, row: selectedRow, side: side! }]);
          setPlayerHand(prev => prev.filter((_, i) => i !== draggingOp.index));
      }
    }
    setDraggingOp(null); setSelectedLane(null); setSelectedRow(null);
  };
  const handleCombatEvent = (lane: number, row: number, value: number, type: any) => {
    // Combat events from host are in KERNEL coordinates.
    const isPl = side === 'PLAYER';
    const displayRow = isPl ? row : 6 - row;
    const displayLane = isPl ? lane : 2 - lane;
    const pos = project(displayLane, displayRow, 10); 
    floatingLabels.current.push({ id: Math.random().toString(36).substr(2, 9), x: pos.x + (Math.random()-0.5)*30, y: pos.y + (Math.random()-0.5)*15, value: value > 0 ? value.toString() : '', type, life: 1.0, createdAt: Date.now() });
  };
  const handleAuthorize = () => { setPlayerReady(true); channelRef.current?.send({ type: 'broadcast', event: 'authorize_ready', payload: { side } }); };

  // --- UI (SIMULATION MIRROR) ---
  if (isQueuing) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none"> <div className="absolute top-0 left-0 w-full h-px bg-rhodes-blue" /> <div className="absolute bottom-0 left-0 w-full h-px bg-rhodes-blue" /> </div>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center relative z-10 p-8 text-center">
          <div className="relative w-32 h-32 mb-16"> <div className="absolute inset-4 border-4 border-t-rhodes-blue border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" /> </div>
          <h2 className="terminal-text text-xl font-black text-rhodes-blue tracking-[0.2em] uppercase italic leading-tight text-center">Establishing<br />Neural Link</h2>
          <button onClick={onBack} className="mt-24 terminal-text text-[10px] text-white/40 hover:text-white tracking-[0.4em] uppercase font-bold">Abort Search</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black relative overflow-hidden select-none" onMouseMove={handleDragMove} onTouchMove={handleDragMove} onMouseUp={handleDragEnd} onTouchEnd={handleDragEnd}>
      <div className="p-2 px-4 border-b border-rhodes-border flex justify-between items-center bg-black/95 backdrop-blur-md z-30 shrink-0 shadow-lg">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-rhodes-blue transition-colors group"> <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> <span className="terminal-text text-[8px] font-bold uppercase">Abort</span> </button>
        <div className="flex gap-4 sm:gap-8 items-center">
          <div className="flex flex-col items-center gap-1"> 
            <div className="flex items-center gap-2"> 
              <div className="flex gap-0.5"> {[...Array(3)].map((_, i) => ( <div key={i} className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < uiState.playerLP ? 'bg-rhodes-blue' : 'bg-white/5 border border-white/5'}`} /> ))} </div>
              <span className="terminal-text font-black text-xs text-rhodes-blue">{uiState.playerLP}</span> 
            </div> <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Doctor HP</span> 
          </div>
          <div className="px-4 py-1.5 bg-rhodes-blue/10 border border-rhodes-blue/30 rounded-full"> <span className="terminal-text text-[10px] font-black tracking-[0.2em] text-rhodes-blue uppercase">{phase}</span> </div>
          <div className="flex flex-col items-center gap-1"> 
            <div className="flex items-center gap-2"> 
              <span className="terminal-text font-black text-xs text-red-500">{uiState.opponentLP}</span> 
              <div className="flex gap-0.5"> {[...Array(3)].map((_, i) => ( <div key={i} className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < uiState.opponentLP ? 'bg-red-500 shadow-[0_0_5px_#ef4444]' : 'bg-white/5 border border-white/5'}`} /> ))} </div>
            </div> <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Target HP</span> 
          </div>
        </div>
        <button onClick={() => setIsPaused(!isPaused)} className="p-2 rounded-full border border-white/10 text-white/40 hover:text-white"> {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} </button>
      </div>

      <div className="flex-1 relative bg-black/40 overflow-hidden">
        <canvas ref={canvasRef} width={450} height={400} className="w-full h-full cursor-crosshair" />
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
        <AnimatePresence> {mulliganPhase && (
            <div className="absolute inset-0 bg-black/98 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-md">
                <h2 className="text-xl font-black terminal-text text-white tracking-widest uppercase mb-4 italic">Tactical Authorization</h2>
                <div className="flex justify-center gap-1.5 mb-8 w-full">
                    {playerHand.map((op, idx) => ( <div key={op.id} onClick={() => setMulliganSelected(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])} className={`w-[18vw] max-w-[80px] aspect-[2/3] border-2 rounded-sm overflow-hidden transition-all ${mulliganSelected.includes(idx) ? 'border-red-500' : 'border-white/10 hover:border-rhodes-blue/50'}`}> <img src={getCardImagePath(op)} className={`w-full h-full object-contain ${mulliganSelected.includes(idx) ? 'opacity-20 grayscale' : 'opacity-70'}`} referrerPolicy="no-referrer" /> </div> ))}
                </div>
                <button onClick={() => { if (mulliganSelected.length > 0) { const newHand = [...playerHand]; const newDeck = [...playerDeck]; mulliganSelected.forEach(idx => { const card = newHand[idx]; const next = newDeck.shift(); if (next) { newHand[idx] = next; newDeck.push(card); } }); setPlayerHand(newHand); setPlayerDeck(newDeck); } setMulliganPhase(false); }} className="rhodes-button glow-blue px-10 py-2.5 uppercase text-[10px] font-black"> Recycle {mulliganSelected.length} Units </button>
                <button onClick={() => setMulliganPhase(false)} className="mt-4 terminal-text text-[8px] text-white/30 hover:text-white uppercase">Skip & Start Operation</button>
            </div>
        )} </AnimatePresence>
        <AnimatePresence> {winner && (
            <div className="absolute inset-0 z-[1000] bg-black/90 flex flex-col items-center justify-center backdrop-blur-xl p-8">
                <div className={`text-7xl font-black italic mb-8 ${winner === 'PLAYER' ? 'text-rhodes-blue' : 'text-red-600'}`}> {winner === 'PLAYER' ? 'VICTORY' : 'DEFEAT'} </div>
                <button onClick={onBack} className="rhodes-button glow-blue px-16 py-4">Return to Terminal</button>
            </div>
        )} </AnimatePresence>
      </div>

      <div className="p-2 bg-[#050505] border-t border-rhodes-border shrink-0 z-20 shadow-2xl">
        <div className="flex justify-between items-center mb-2 px-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-2 py-1 rounded-sm">
                <Zap className="w-3 h-3 text-orange-500 fill-current" />
                <span className="text-[10px] font-black terminal-text text-orange-500 leading-none">{uiState.playerDP}</span>
            </div>
            <button 
              onClick={() => { channelRef.current?.send({ type: 'broadcast', event: 'request_supply', payload: { side } }); }}
              disabled={playerHand.length >= 6 || uiState.playerDP < 5 || playerDeck.length === 0 || phase !== 'COMMAND'}
              className={`rhodes-button h-8 px-3 py-0 flex flex-col items-center justify-center transition-all ${ playerHand.length < 6 && uiState.playerDP >= 5 && playerDeck.length > 0 && phase === 'COMMAND' ? 'glow-blue border-rhodes-blue/50 text-rhodes-blue' : 'border-white/5 text-white/10 opacity-50 grayscale pointer-events-none' }`}
            > <div className="flex items-center gap-1.5"> <span className="text-[8px] font-black uppercase tracking-tighter">Supply</span> <span className="text-[7px] bg-rhodes-blue/20 px-1 rounded text-rhodes-blue">5</span> </div> </button>
          </div>
          <div className="flex items-center gap-2"> <span className="text-[6px] text-rhodes-blue/40 terminal-text uppercase italic font-bold">Signal Deck: {playerDeck.length}</span> </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 px-1 scrollbar-hide min-h-[100px]">
          {playerHand.map((op, idx) => (
            <div key={`${op.id}-${idx}`} className="flex flex-col gap-1 shrink-0">
              <div onMouseDown={(e) => handleDragStart(op, idx, e)} onTouchStart={(e) => handleDragStart(op, idx, e)} className={`w-16 h-24 border rounded-sm relative overflow-hidden group transition-all cursor-grab active:cursor-grabbing ${ uiState.playerDP >= op.dp_cost && phase === 'COMMAND' ? 'border-rhodes-blue/40 bg-rhodes-blue/5 shadow-inner' : 'border-white/5 bg-white/5 opacity-50 grayscale' } ${draggingOp?.index === idx ? 'opacity-0 scale-95' : ''}`}>
                <img src={getCardImagePath(op)} className="w-full h-full object-contain opacity-70 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                <div className="absolute top-0.5 right-0.5 bg-black/80 px-1 py-0.5 rounded-sm border border-rhodes-blue/20 z-20"> <span className="text-[8px] font-black terminal-text text-rhodes-blue">{op.dp_cost}</span> </div>
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${uiState.playerDP >= op.dp_cost ? 'bg-rhodes-blue shadow-[0_0_5px_#0098d9]' : 'bg-white/10'}`} />
              </div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 6 - playerHand.length - playerCooldowns.length) }).map((_, i) => ( <div key={`empty-${i}`} className="w-16 h-24 border border-dashed border-white/5 rounded-sm shrink-0 flex items-center justify-center bg-white/5 opacity-10"> <RotateCcw className="w-3 h-3 text-white/50" /> </div> ))}
        </div>
      </div>
      {draggingOp && ( <div className="fixed pointer-events-none z-[1000] w-16 h-24 border border-rhodes-blue bg-rhodes-blue/20 rounded overflow-hidden shadow-2xl" style={{ left: dragPos.x - 32, top: dragPos.y - 48, transform: 'scale(1.1)' }}> <img src={getCardImagePath(draggingOp.op)} className="w-full h-full object-contain opacity-90" referrerPolicy="no-referrer" /> </div> )}
    </div>
  );
}
