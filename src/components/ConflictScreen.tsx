import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  Play, 
  RotateCcw, 
  Zap,
  Loader2,
  Sword,
  Target,
  Shield,
  Activity,
  User,
  LogOut,
  Trash2,
  Star,
  Pause,
  Heart
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
  const [matchId, setMatchId] = useState<string | null>(null);
  const [side, setSide] = useState<'PLAYER' | 'OPPONENT' | null>(null);
  const [isQueuing, setIsQueuing] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [matchResult, setMatchResult] = useState<'VICTORY' | 'DEFEAT' | null>(null);

  const [channel, setChannel] = useState<RealtimeChannel | null>(null);
  const [isHost, setIsHost] = useState(false);
  const kernelRef = useRef<BattleKernel | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simulation-style state
  const [phase, setPhase] = useState<GamePhase>('COMMAND');
  const [playerHand, setPlayerHand] = useState<Operator[]>([]);
  const [playerDeck, setPlayerDeck] = useState<Operator[]>([]);
  const [playerCooldowns, setPlayerCooldowns] = useState<{ op: Operator, turnsRemaining: number }[]>([]);
  const [mulliganPhase, setMulliganPhase] = useState(false);
  const [mulliganSelected, setMulliganSelected] = useState<number[]>([]);
  
  const [uiState, setUiState] = useState({
    playerLP: 3,
    opponentLP: 3,
    playerDP: 15,
    opponentDP: 15,
  });

  const [draggingOp, setDraggingOp] = useState<{ op: Operator, index: number } | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [inspectedUnit, setInspectedUnit] = useState<GameUnit | null>(null);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);

  const floatingLabels = useRef<FloatingLabel[]>([]);
  const spriteImages = useRef<Record<string, HTMLImageElement>>({});

  // 1. Initial Setup
  useEffect(() => {
    if (!matchId) joinLobby();
    
    // Pre-load Sprites (Simulation style)
    ALL_ASSETS.forEach(op => {
      ['Front', 'Back'].forEach(view => {
        const path = getSpriteImagePath(op, view as 'Front' | 'Back');
        const img = new Image();
        img.src = path;
        spriteImages.current[`${op.id}_${view}`] = img;
      });
    });

    return () => {
      channel?.unsubscribe();
    };
  }, []);

  const joinLobby = async () => {
    setIsQueuing(true);
    const lobbyChannel = supabase.channel('lobby', { config: { presence: { key: userProfile.uid } } });

    lobbyChannel
      .on('presence', { event: 'sync' }, () => {
        const state = lobbyChannel.presenceState();
        const users = Object.keys(state).sort();
        
        if (users.length >= 2) {
          let myPair: string[] | null = null;
          for (let i = 0; i < users.length - 1; i += 2) {
            const p = [users[i], users[i+1]];
            if (p.includes(userProfile.uid)) {
              myPair = p;
              break;
            }
          }

          if (myPair) {
            const mId = `match_${myPair.join('_')}`;
            setMatchId(mId);
            const mySide = myPair[0] === userProfile.uid ? 'PLAYER' : 'OPPONENT';
            setSide(mySide);
            
            setTimeout(() => {
              startMatch(mId, myPair![0] === userProfile.uid);
              lobbyChannel.unsubscribe();
            }, 1000);
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await lobbyChannel.track({ user_id: userProfile.uid, name: userProfile.displayName, joined_at: Date.now() });
        }
      });
  };

  const startMatch = (mId: string, amIHost: boolean) => {
    setIsQueuing(false);
    setIsHost(amIHost);
    setMulliganPhase(true);

    // Squad initialization (Simulation style)
    const squad = userProfile.squads[userProfile.activeSquadIndex]
      .map(id => ALL_ASSETS.find(a => a.id === id))
      .filter(Boolean) as Operator[];
    const shuffled = [...squad].sort(() => Math.random() - 0.5);
    setPlayerHand(shuffled.slice(0, 4));
    setPlayerDeck(shuffled.slice(4));

    const matchChannel = supabase.channel(mId);

    // Initialize Kernel if Host
    if (amIHost) {
      const kernel = new BattleKernel(
        (winner) => {
          matchChannel.send({ type: 'broadcast', event: 'game_over', payload: { winner } });
          syncMatchState(matchChannel);
        },
        () => {},
        (unit, reason) => {
            if (unit.owner === 'PLAYER' || unit.owner === 'AI') {
                const op = ALL_ASSETS.find(a => a.id === unit.id);
                if (op && reason !== 'SCORED_GOAL') {
                    matchChannel.send({ type: 'broadcast', event: 'unit_removed', payload: { owner: unit.owner, opId: op.id } });
                }
            }
        },
        (p) => {
          setPhase(p);
          matchChannel.send({ type: 'broadcast', event: 'phase_change', payload: p });
          syncMatchState(matchChannel);
        },
        (turn) => {
          matchChannel.send({ type: 'broadcast', event: 'turn_start', payload: turn });
          syncMatchState(matchChannel);
        },
        (lane, row, value, type) => {
          matchChannel.send({ type: 'broadcast', event: 'combat_event', payload: { lane, row, value, type } });
        }
      );
      kernel.start();
      kernelRef.current = kernel;
    }

    matchChannel
      .on('broadcast', { event: 'deploy_unit' }, ({ payload }) => {
        if (amIHost && kernelRef.current) {
          const op = ALL_ASSETS.find(a => a.id === payload.opId);
          if (op) {
            kernelRef.current.deployUnit(op, payload.side === 'PLAYER' ? 'PLAYER' : 'AI', payload.lane, payload.row);
            syncMatchState(matchChannel);
          }
        }
      })
      .on('broadcast', { event: 'authorize_ready' }, ({ payload }) => {
        if (amIHost) {
          if (payload.side === 'PLAYER') setPlayerReady(true);
          else setOpponentReady(true);
        }
      })
      .on('broadcast', { event: 'match_sync' }, ({ payload }) => {
        if (!amIHost) {
          setPhase(payload.phase);
          setUiState({
            playerLP: payload.playerLP,
            opponentLP: payload.opponentLP,
            playerDP: payload.playerDP,
            opponentDP: payload.opponentDP
          });
          if (kernelRef.current) {
              kernelRef.current.units = payload.units;
              kernelRef.current.playerLP = payload.playerLP;
              kernelRef.current.aiLP = payload.opponentLP;
              kernelRef.current.playerDP = payload.playerDP;
              kernelRef.current.aiDP = payload.opponentDP;
              kernelRef.current.phase = payload.phase;
              kernelRef.current.turnCount = payload.turn;
          }
        }
      })
      .on('broadcast', { event: 'combat_event' }, ({ payload }) => {
        handleCombatEvent(payload.lane, payload.row, payload.value, payload.type);
      })
      .on('broadcast', { event: 'unit_removed' }, ({ payload }) => {
         // Mirror AI to Opponent for cooldown logic
         const mySide = amIHost ? (side === 'PLAYER' ? 'PLAYER' : 'OPPONENT') : (side === 'PLAYER' ? 'PLAYER' : 'OPPONENT');
         const unitOwner = payload.owner === 'PLAYER' ? 'PLAYER' : 'OPPONENT';
         
         // If MY unit was removed, add to cooldown
         const isMe = (side === 'PLAYER' && payload.owner === 'PLAYER') || (side === 'OPPONENT' && payload.owner === 'AI');
         if (isMe) {
            const op = ALL_ASSETS.find(a => a.id === payload.opId);
            if (op) {
                let cooldown = 4;
                if (op.class === 'Specialist') cooldown = 1;
                setPlayerCooldowns(prev => [...prev, { op, turnsRemaining: cooldown }]);
            }
         }
      })
      .on('broadcast', { event: 'phase_change' }, ({ payload }) => {
          if (!amIHost) setPhase(payload);
      })
      .on('broadcast', { event: 'game_over' }, ({ payload }) => {
        const iWon = (side === 'PLAYER' && payload.winner === 'PLAYER') || (side === 'OPPONENT' && payload.winner === 'AI');
        onMatchEnd(iWon ? 'Win' : 'Loss');
        setMatchResult(iWon ? 'VICTORY' : 'DEFEAT');
      })
      .on('broadcast', { event: 'ready_sync' }, ({ payload }) => {
          if (!amIHost) {
              setPlayerReady(side === 'PLAYER' ? payload.playerReady : payload.opponentReady);
              setOpponentReady(side === 'PLAYER' ? payload.opponentReady : payload.playerReady);
          }
      })
      .subscribe();

    setChannel(matchChannel);

    // If not host, we still need a client-side kernel to store unit positions for rendering
    if (!amIHost) {
        kernelRef.current = new BattleKernel(() => {}, () => {}, () => {}, () => {}, () => {}, () => {});
    }
  };

  const syncMatchState = (chan: RealtimeChannel) => {
    if (!kernelRef.current) return;
    const state = {
      units: kernelRef.current.units,
      phase: kernelRef.current.phase,
      turn: kernelRef.current.turnCount,
      playerLP: kernelRef.current.playerLP,
      opponentLP: kernelRef.current.aiLP,
      playerDP: kernelRef.current.playerDP,
      opponentDP: kernelRef.current.aiDP,
    };
    setUiState({
        playerLP: state.playerLP,
        opponentLP: state.opponentLP,
        playerDP: Math.floor(state.playerDP),
        opponentDP: Math.floor(state.opponentDP)
    });
    chan.send({ type: 'broadcast', event: 'match_sync', payload: state });
  };

  // 2. Projections & Scaling (Simulation Style)
  const project = (l: number, r: number, z = 0) => {
    // If we are OPPONENT, the map is flipped for US visually
    const displayRow = side === 'PLAYER' ? r : 6 - r;
    const displayLane = side === 'PLAYER' ? l : 2 - l;

    const linearProgress = Math.max(-0.1, displayRow / 6);
    const progress = Math.pow(Math.abs(linearProgress), PROJECT_CONFIG.zFactor) * (linearProgress < 0 ? -1 : 1);
    
    const currY = PROJECT_CONFIG.topY + progress * (PROJECT_CONFIG.bottomY - PROJECT_CONFIG.topY);
    const currW = PROJECT_CONFIG.topWidth + linearProgress * (PROJECT_CONFIG.bottomWidth - PROJECT_CONFIG.topWidth);
    
    const startX = (CANVAS_W - currW) / 2;
    const currX = startX + (displayLane + 0.5) * (currW / 3);
    
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

  // 3. Game Loop & Rendering
  useEffect(() => {
    let animId: number;
    const loop = () => {
      if (isHost && kernelRef.current && phase === 'ACTION') {
        kernelRef.current.tick();
        syncMatchState(channel!);
      }
      render();
      animId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animId);
  }, [phase, isHost, side, selectedLane, selectedRow, draggingOp]);

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Atmospheric Grid
    ctx.strokeStyle = 'rgba(0, 152, 217, 0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 12; i++) {
        const pS = project(-1.5, i * (7 / 12) - 0.5);
        const pE = project(3.5, i * (7 / 12) - 0.5);
        ctx.beginPath(); ctx.moveTo(pS.x, pS.y); ctx.lineTo(pE.x, pE.y); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
        const pS = project(i * (5 / 8) - 1.5, -0.5);
        const pE = project(i * (5 / 8) - 1.5, 6.5);
        ctx.beginPath(); ctx.moveTo(pS.x, pS.y); ctx.lineTo(pE.x, pE.y); ctx.stroke();
    }

    // Tactical Platforms
    for (let r = 0; r < 7; r++) {
      for (let l = 0; l < 3; l++) {
        const isSelected = selectedLane === l && selectedRow === r;
        const isOccupied = kernelRef.current?.units.some(u => u.lane === l && u.row === r);
        const isItem = draggingOp?.op.class === 'Item';
        
        // Mirror deploy check
        const displayRow = side === 'PLAYER' ? r : 6 - r;
        const classValid = isItem ? (r >= 1 && r <= 5) : (draggingOp ? kernelRef.current?.canDeploy(draggingOp.op.class, r, side === 'PLAYER' ? 'PLAYER' : 'AI') : false);
        
        const isPlaceable = draggingOp && classValid && (isItem || !isOccupied);
        const isInvalid = draggingOp && (!classValid || (!isItem && isOccupied));

        const padSize = isSelected ? 0.43 : 0.4;
        const center = project(l, r);
        const p0 = project(l - padSize, r - padSize);
        const p1 = project(l + padSize, r - padSize);
        const p2 = project(l + padSize, r + padSize);
        const p3 = project(l - padSize, r + padSize);

        const baseHeight = (r === 0 || r === 6) ? 6 : 4;
        const p2d = { x: p2.x, y: p2.y + baseHeight };
        const p3d = { x: p3.x, y: p3.y + baseHeight };

        let color = isSelected ? 'rgba(0, 255, 231, 0.4)' : (isPlaceable ? 'rgba(0, 152, 217, 0.25)' : 'rgba(0, 152, 217, 0.1)');
        if (isInvalid) color = 'rgba(255, 59, 59, 0.15)';

        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p2d.x, p2d.y); ctx.lineTo(p3d.x, p3d.y); ctx.closePath(); ctx.fill();

        let surface = isSelected ? 'rgba(0, 152, 217, 0.4)' : (isPlaceable ? 'rgba(0, 152, 217, 0.2)' : 'rgba(10, 10, 20, 0.98)');
        let border = isSelected ? 'rgba(0, 255, 231, 1)' : (isPlaceable ? 'rgba(0, 255, 231, 1)' : 'rgba(0, 152, 217, 0.15)');
        
        if (isInvalid) { surface = 'rgba(255, 59, 59, 0.05)'; border = 'rgba(255, 59, 59, 0.2)'; }
        if (r === 0) { surface = 'rgba(255, 59, 59, 0.4)'; border = 'rgba(255, 0, 0, 1)'; }
        if (r === 6) { surface = 'rgba(0, 255, 231, 0.4)'; border = 'rgba(0, 255, 231, 1)'; }

        ctx.fillStyle = surface;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = border; ctx.lineWidth = isSelected ? 2 : 0.8; ctx.stroke();
      }
    }

    // Units
    kernelRef.current?.units.sort((a, b) => a.row - b.row).forEach(u => {
      const isMe = (side === 'PLAYER' && u.owner === 'PLAYER') || (side === 'OPPONENT' && u.owner === 'AI');
      const view = isMe ? 'Back' : 'Front';
      const mainColor = isMe ? '#00ffe7' : '#ff3b3b';
      const basePos = project(u.lane, u.row, 0);
      const spriteImg = spriteImages.current[`${u.id}_${view}`];

      if (spriteImg && spriteImg.complete) {
        ctx.save();
        ctx.shadowBlur = 10; ctx.shadowColor = mainColor + '44';
        let s = 140; let yOff = 40;
        if (u.name.includes('Slug')) { s = 800; yOff = 225; }
        ctx.drawImage(spriteImg, basePos.x - s/2, basePos.y - s + yOff, s, s);
        ctx.restore();
      } else {
        ctx.fillStyle = mainColor + '44';
        ctx.beginPath(); ctx.arc(basePos.x, basePos.y - 15, 20, 0, Math.PI*2); ctx.fill();
      }

      // HP Bar
      const hpP = u.hp / u.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(basePos.x - 15, basePos.y - 45, 30, 3);
      ctx.fillStyle = mainColor; ctx.fillRect(basePos.x - 15, basePos.y - 45, 30 * hpP, 3);
    });

    // Floating Labels
    const now = Date.now();
    floatingLabels.current = floatingLabels.current.filter(l => {
      const age = now - l.createdAt;
      l.life = 1 - (age / 1200);
      if (l.life <= 0) return false;
      ctx.save(); ctx.globalAlpha = l.life; ctx.fillStyle = l.type === 'DAMAGE' ? '#ff3b3b' : '#22c55e';
      ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText(l.value, l.x, l.y - (1 - l.life) * 40);
      ctx.restore();
      return true;
    });
  };

  const handleCombatEvent = (lane: number, row: number, value: number, type: any) => {
    const pos = project(lane, row, 10);
    floatingLabels.current.push({
      id: Math.random().toString(36).substr(2, 9),
      x: pos.x + (Math.random()-0.5)*30,
      y: pos.y + (Math.random()-0.5)*15,
      value: value > 0 ? value.toString() : '',
      type,
      life: 1.0,
      createdAt: Date.now()
    });
  };

  // 4. Interactions
  const handleAuthorize = () => {
    setPlayerReady(true);
    channel?.send({ type: 'broadcast', event: 'authorize_ready', payload: { side } });
    
    // If Host, wait for both and execute
    if (isHost && opponentReady) {
        setPlayerReady(false);
        setOpponentReady(false);
        kernelRef.current?.executeStrategy();
        syncMatchState(channel!);
    }
  };

  useEffect(() => {
    if (isHost && playerReady && opponentReady) {
        setPlayerReady(false);
        setOpponentReady(false);
        kernelRef.current?.executeStrategy();
        syncMatchState(channel!);
        channel?.send({ type: 'broadcast', event: 'ready_sync', payload: { playerReady: false, opponentReady: false } });
    }
  }, [playerReady, opponentReady]);

  const handleDeploy = (op: Operator, lane: number, row: number) => {
    const cost = op.dp_cost;
    const currentDP = uiState.playerDP;
    if (currentDP < cost) return;

    // Kernel coordinate handling
    // Host side is always PLAYER, Opponent is AI
    const kernelOwner = side === 'PLAYER' ? 'PLAYER' : 'AI';
    
    channel?.send({ type: 'broadcast', event: 'deploy_unit', payload: { opId: op.id, lane, row, side } });
    
    setPlayerHand(prev => prev.filter(p => p.id !== op.id));
    if (playerDeck.length > 0) {
      const next = playerDeck[0];
      setPlayerHand(prev => [...prev, next]);
      setPlayerDeck(prev => prev.slice(1));
    }
  };

  const handleDrawCard = () => {
      if (playerHand.length < 6 && uiState.playerDP >= 5 && playerDeck.length > 0) {
          const next = playerDeck[0];
          setPlayerHand(prev => [...prev, next]);
          setPlayerDeck(prev => prev.slice(1));
          // Update DP
          if (isHost && kernelRef.current) {
              kernelRef.current.playerDP -= 5;
              syncMatchState(channel!);
          } else {
              // Client side should probably request DP update or host should sync it
          }
      }
  };

  if (isQueuing) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black/90 backdrop-blur-xl p-6 text-center">
        <div className="relative w-24 h-24 mb-12">
           <div className="absolute inset-0 border-4 border-rhodes-blue/20 rounded-full" />
           <div className="absolute inset-0 border-4 border-t-rhodes-blue rounded-full animate-spin shadow-[0_0_15px_#19baff]" />
        </div>
        <h2 className="terminal-text text-2xl font-black text-rhodes-blue tracking-[0.3em] uppercase italic mb-2">Establishing Neural Link</h2>
        <p className="terminal-text text-[10px] text-white/30 tracking-widest uppercase mb-12">Searching for compatible tactical signal in Conflict Zone...</p>
        <button onClick={onBack} className="rhodes-button border-white/10 text-white/40 px-8 py-2 text-[10px] terminal-text uppercase">Abort Search</button>
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
      {/* Header */}
      <div className="p-3 px-4 border-b border-white/10 flex justify-between items-center bg-black/95 backdrop-blur-md z-30 shadow-lg">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="terminal-text text-[10px] font-bold tracking-widest uppercase">Abort Operation</span>
        </button>
        <div className="flex gap-8 items-center">
          <div className="flex flex-col items-center gap-1">
             <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`h-4 w-2 rounded-sm skew-x-[-15deg] ${i < uiState.playerLP ? 'bg-rhodes-blue shadow-[0_0_8px_#19baff]' : 'bg-white/5 border border-white/5'}`} />
                ))}
             </div>
             <span className="text-[6px] terminal-text text-white/40 uppercase font-bold tracking-widest">Neural Stability</span>
          </div>
          <div className="px-6 py-1.5 bg-rhodes-blue/10 border border-rhodes-blue/30 rounded-full shadow-[0_0_15px_rgba(25,186,255,0.1)]">
             <span className="terminal-text text-[12px] font-black tracking-[0.2em] text-rhodes-blue uppercase">{phase} PHASE</span>
          </div>
          <div className="flex flex-col items-center gap-1">
             <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className={`h-4 w-2 rounded-sm skew-x-[-15deg] ${i < uiState.opponentLP ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : 'bg-white/5 border border-white/5'}`} />
                ))}
             </div>
             <span className="text-[6px] terminal-text text-white/40 uppercase font-bold tracking-widest">Hostile Signal</span>
          </div>
        </div>
        <div className="w-12" />
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative bg-black/40 overflow-hidden flex items-center justify-center">
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="max-w-full max-h-full cursor-crosshair" />

        {/* Phase Overlays */}
        <AnimatePresence>
          {phase === 'ACTION' && !matchResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-rhodes-blue/10 backdrop-blur-sm pointer-events-none flex flex-col items-center justify-center z-50">
                <div className="terminal-text text-rhodes-blue text-2xl font-black tracking-[0.4em] uppercase italic animate-pulse">Neural Execution</div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game Result */}
        <AnimatePresence>
          {matchResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[300] bg-black/95 flex flex-col items-center justify-center backdrop-blur-2xl p-8 text-center">
                <h2 className={`text-7xl font-black terminal-text mb-4 tracking-tighter ${matchResult === 'VICTORY' ? 'text-rhodes-blue' : 'text-red-600'} drop-shadow-[0_0_30px_currentColor]`}>
                  {matchResult}
                </h2>
                <p className="terminal-text text-[10px] text-white/40 uppercase tracking-[0.5em] mb-12 max-w-[300px]">
                  {matchResult === 'VICTORY' ? "Conflict resolution successful. Neural dominance established." : "Conflict link lost. Tactical withdrawal mandated."}
                </p>
                <button onClick={onBack} className="rhodes-button glow-blue px-12 py-4 bg-rhodes-blue text-black font-black terminal-text text-xs uppercase tracking-widest">Return to Base</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Authorize Button */}
        <AnimatePresence>
          {phase === 'COMMAND' && (
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} className="absolute bottom-8 right-8 z-40">
              <button 
                onClick={handleAuthorize}
                disabled={playerReady}
                className={`rhodes-button glow-blue px-8 py-3 flex items-center gap-3 ${playerReady ? 'opacity-50 grayscale' : 'bg-rhodes-blue text-black'}`}
              >
                {playerReady ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                <span className="terminal-text text-[12px] font-black uppercase tracking-widest">{playerReady ? 'Syncing...' : 'Authorize'}</span>
              </button>
              {opponentReady && <div className="absolute -top-10 right-0 text-[10px] text-rhodes-blue terminal-text animate-pulse font-black uppercase tracking-widest">Opponent Ready</div>}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mulligan */}
        <AnimatePresence>
          {mulliganPhase && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/98 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-xl">
                <h2 className="text-2xl font-black terminal-text text-white tracking-widest uppercase mb-12 italic">Neural Prep</h2>
                <div className="flex justify-center gap-3 mb-12">
                    {playerHand.map((op, idx) => (
                        <div key={op.id} onClick={() => setMulliganSelected(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])}
                             className={`w-20 h-32 border-2 rounded-sm overflow-hidden cursor-pointer transition-all ${mulliganSelected.includes(idx) ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'border-white/10 hover:border-rhodes-blue/50'}`}>
                            <img src={getCardImagePath(op)} className={`w-full h-full object-contain ${mulliganSelected.includes(idx) ? 'opacity-20 grayscale brightness-50' : 'opacity-80'}`} referrerPolicy="no-referrer" />
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
                }} className="rhodes-button glow-blue px-12 py-3.5 text-rhodes-blue font-black terminal-text text-xs uppercase tracking-[0.3em]">Confirm Tactical Sync</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hand / Controls */}
      <div className="p-3 bg-[#050505] border-t border-rhodes-blue/20 shrink-0 z-20 shadow-2xl">
        <div className="flex justify-between items-center mb-3 px-2">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3 bg-black/60 border border-white/10 px-3 py-1.5 rounded-sm shadow-inner">
                    <Zap className="w-4 h-4 text-orange-500 shadow-[0_0_5px_currentColor]" />
                    <span className="text-xl font-black terminal-text text-orange-500 leading-none">{uiState.playerDP}</span>
                </div>
                <button 
                    onClick={handleDrawCard}
                    disabled={playerHand.length >= 6 || uiState.playerDP < 5 || playerDeck.length === 0 || phase !== 'COMMAND'}
                    className={`rhodes-button px-4 py-1.5 h-10 flex items-center gap-2 border ${playerHand.length < 6 && uiState.playerDP >= 5 && phase === 'COMMAND' ? 'glow-blue border-rhodes-blue/50 text-rhodes-blue' : 'border-white/5 opacity-40 grayscale'}`}
                >
                    <span className="text-[10px] font-black terminal-text">SUPPLY</span>
                    <span className="text-[8px] bg-rhodes-blue/20 px-1 rounded">5</span>
                </button>
            </div>
            <div className="text-[10px] text-rhodes-blue/40 terminal-text uppercase font-black tracking-widest italic">Signal Deck: {playerDeck.length}</div>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-2 px-1 custom-scrollbar">
          {playerHand.map((op, idx) => (
            <div key={idx} onMouseDown={() => { if (phase === 'COMMAND') setDraggingOp({ op, index: idx }); }}
                 className={`w-20 h-32 border rounded-sm relative overflow-hidden shrink-0 transition-all cursor-grab active:cursor-grabbing ${
                   uiState.playerDP >= op.dp_cost && phase === 'COMMAND'
                   ? 'border-rhodes-blue/40 bg-rhodes-blue/10 shadow-[inset_0_0_15px_rgba(25,186,255,0.1)]' : 'border-white/5 opacity-40 grayscale'
                 } ${draggingOp?.index === idx ? 'opacity-0 scale-95' : ''}`}>
                <img src={getCardImagePath(op)} className="w-full h-full object-contain opacity-80" referrerPolicy="no-referrer" />
                <div className="absolute top-1 right-1 bg-black/90 px-1.5 py-0.5 rounded-sm border border-rhodes-blue/30 shadow-lg">
                    <span className="text-[10px] font-black terminal-text text-rhodes-blue">{op.dp_cost}</span>
                </div>
            </div>
          ))}
          {playerCooldowns.map((c, i) => (
             <div key={i} className="w-20 h-32 border border-white/5 bg-black/90 rounded-sm relative opacity-60 flex flex-col items-center justify-center shrink-0">
                <RotateCcw className="w-6 h-6 text-white/10 animate-spin-slow mb-2" />
                <div className="bg-rhodes-blue/20 px-2 py-0.5 rounded-full border border-rhodes-blue/40">
                    <span className="text-[10px] font-black text-rhodes-blue">{c.turnsRemaining}T</span>
                </div>
             </div>
          ))}
        </div>
      </div>

      {/* Dragging Ghost */}
      {draggingOp && (
        <div className="fixed pointer-events-none z-[1000] w-20 h-32 border-2 border-rhodes-blue bg-rhodes-blue/30 rounded shadow-[0_0_30px_#19baff] overflow-hidden"
             style={{ left: dragPos.x - 40, top: dragPos.y - 64, transform: 'scale(1.1) rotate(-5deg)' }}>
          <img src={getCardImagePath(draggingOp.op)} className="w-full h-full object-contain opacity-90" referrerPolicy="no-referrer" />
        </div>
      )}
    </div>
  );
}
