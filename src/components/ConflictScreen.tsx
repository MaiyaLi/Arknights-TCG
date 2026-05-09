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
  LogOut
} from 'lucide-react';
import { supabase } from '../supabase';
import { UserProfile } from '../types';
import { ALL_ASSETS, Operator } from '../data/operators';
import { BattleKernel } from '../game/BattleKernel';
import { getCardImagePath } from '../utils/assetUtils';
import { RealtimeChannel } from '@supabase/supabase-js';

const CANVAS_W = 400;
const CANVAS_H = 600;

interface ConflictScreenProps {
  userProfile: UserProfile;
  onUpdateProfile: (p: UserProfile) => void;
  onBack: () => void;
  onMatchEnd: (result: 'Win' | 'Loss') => void;
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

  const [matchState, setMatchState] = useState({
    id: '',
    units: [] as any[],
    phase: 'COMMAND' as any,
    turn: 0,
    playerDP: 15,
    opponentDP: 15,
    playerLP: 3,
    opponentLP: 3,
  });

  const [playerHand, setPlayerHand] = useState<Operator[]>([]);
  const [playerDeck, setPlayerDeck] = useState<Operator[]>([]);
  const [playerCooldowns, setPlayerCooldowns] = useState<{ id: string, turnsRemaining: number }[]>([]);
  const [mulliganPhase, setMulliganPhase] = useState(false);
  const [mulliganSelected, setMulliganSelected] = useState<number[]>([]);

  const [draggingOp, setDraggingOp] = useState<{ op: Operator, index: number } | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [selectedLane, setSelectedLane] = useState<number | null>(null);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const floatingLabels = useRef<{ id: string, x: number, y: number, value: string, type: string, life: number }[]>([]);

  useEffect(() => {
    if (!matchId) joinLobby();
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
          const pair = users.slice(0, 2);
          if (pair.includes(userProfile.uid)) {
            const mId = `match_${pair.join('_')}`;
            setMatchId(mId);
            setSide(pair[0] === userProfile.uid ? 'PLAYER' : 'OPPONENT');
            startMatch(mId, pair[0] === userProfile.uid);
            lobbyChannel.unsubscribe();
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await lobbyChannel.track({ user_id: userProfile.uid, name: userProfile.displayName });
        }
      });
  };

  const startMatch = (mId: string, amIHost: boolean) => {
    setIsQueuing(false);
    const squad = userProfile.squads[userProfile.activeSquadIndex];
    const operators = squad.map(id => ALL_ASSETS.find(a => a.id === id)).filter(Boolean) as Operator[];
    const shuffled = [...operators].sort(() => Math.random() - 0.5);
    setPlayerHand(shuffled.slice(0, 4));
    setPlayerDeck(shuffled.slice(4));
    
    const mySide = amIHost ? 'PLAYER' : 'OPPONENT';
    setIsHost(amIHost);
    setMulliganPhase(true);

    const matchChannel = supabase.channel(mId);

    if (amIHost) {
      const kernel = new BattleKernel(
        (winner) => {
          matchChannel.send({ type: 'broadcast', event: 'game_over', payload: { winner } });
          syncMatchState(matchChannel);
        },
        () => {},
        () => {},
        (phase) => {
          matchChannel.send({ type: 'broadcast', event: 'phase_change', payload: phase });
          syncMatchState(matchChannel);
        },
        (turn) => {
          matchChannel.send({ type: 'broadcast', event: 'turn_start', payload: turn });
          syncMatchState(matchChannel);
        },
        (lane, row, value, type) => matchChannel.send({ type: 'broadcast', event: 'combat_event', payload: { lane, row, value, type } })
      );
      kernel.start();
      kernelRef.current = kernel;
    }

    matchChannel
      .on('broadcast', { event: 'deploy_unit' }, ({ payload }) => {
        if (amIHost && kernelRef.current) {
          const kernelOwner = (payload.side === 'PLAYER' ? 'PLAYER' : 'AI');
          const op = ALL_ASSETS.find(a => a.id === payload.opId);
          if (op) {
            kernelRef.current.deployUnit(op, kernelOwner, payload.lane, payload.row);
            syncMatchState(matchChannel);
          }
        }
      })
      .on('broadcast', { event: 'authorize_ready' }, ({ payload }) => {
        if (amIHost && kernelRef.current) {
          if (payload.side === 'PLAYER') setPlayerReady(true);
          else setOpponentReady(true);
        }
      })
      .on('broadcast', { event: 'match_sync' }, ({ payload }) => {
        if (!amIHost) setMatchState(payload);
      })
      .on('broadcast', { event: 'ready_sync' }, ({ payload }) => {
        if (!amIHost) {
          setPlayerReady(mySide === 'PLAYER' ? payload.playerReady : payload.opponentReady);
          setOpponentReady(mySide === 'PLAYER' ? payload.opponentReady : payload.playerReady);
        }
      })
      .on('broadcast', { event: 'combat_event' }, ({ payload }) => {
        if (!amIHost) handleCombatEvent(payload);
      })
      .on('broadcast', { event: 'game_over' }, ({ payload }) => {
        const iWon = (mySide === 'PLAYER' && payload.winner === 'PLAYER') || (mySide === 'OPPONENT' && payload.winner === 'AI');
        onMatchEnd(iWon ? 'Win' : 'Loss');
        setMatchResult(iWon ? 'VICTORY' : 'DEFEAT');
      })
      .subscribe();

    setChannel(matchChannel);
  };

  const syncMatchState = (chan: RealtimeChannel) => {
    if (!kernelRef.current) return;
    const state = {
      id: chan.topic,
      units: kernelRef.current.units,
      phase: kernelRef.current.phase,
      turn: kernelRef.current.turnCount,
      playerDP: kernelRef.current.playerDP,
      opponentDP: kernelRef.current.aiDP,
      playerLP: kernelRef.current.playerLP,
      opponentLP: kernelRef.current.aiLP,
    };
    setMatchState(state);
    chan.send({ type: 'broadcast', event: 'match_sync', payload: state });
  };

  const handleCombatEvent = ({ lane, row, value, type }: any) => {
    const displayRow = toDisplayRowRef(row);
    const pos = project(lane, displayRow, 10);
    const id = Math.random().toString(36).substr(2, 9);
    floatingLabels.current.push({ id, x: pos.x + (Math.random()-0.5)*30, y: pos.y + (Math.random()-0.5)*15, value: value > 0 ? value.toString() : '', type, life: 1.0 });
  };

  useEffect(() => {
    if (isHost && playerReady && opponentReady) {
      setPlayerReady(false);
      setOpponentReady(false);
      kernelRef.current?.executeStrategy();
      setTimeout(() => { if (channel) syncMatchState(channel); }, 3000);
      channel?.send({ type: 'broadcast', event: 'ready_sync', payload: { playerReady: false, opponentReady: false } });
    }
  }, [playerReady, opponentReady]);

  const handleAuthorize = () => {
    setPlayerReady(true);
    channel?.send({ type: 'broadcast', event: 'authorize_ready', payload: { side } });
    if (!isHost) {
      channel?.send({ type: 'broadcast', event: 'ready_sync', payload: { playerReady: side === 'PLAYER', opponentReady: side === 'OPPONENT' } });
    }
  };

  const handleDeploy = (op: Operator, lane: number, row: number) => {
    const cost = op.dp_cost;
    const currentDP = side === 'PLAYER' ? matchState.playerDP : matchState.opponentDP;
    if (currentDP < cost) return;

    // Item check: Items can be dropped in rows 1-5
    const isItem = op.class === 'Item';
    if (!isItem && (row < 4 || row > 5)) return; // Normal units restricted to frontline/backline
    if (isItem && (row < 1 || row > 5)) return; // Items restricted to field

    channel?.send({ type: 'broadcast', event: 'deploy_unit', payload: { opId: op.id, lane, row: toKernelRow(row), side } });
    
    setPlayerHand(prev => prev.filter(p => p.id !== op.id));
    // Draw next
    if (playerDeck.length > 0) {
      const next = playerDeck[0];
      setPlayerHand(prev => [...prev, next]);
      setPlayerDeck(prev => prev.slice(1));
    }
  };

  const toKernelRow = (displayRow: number) => {
    return side === 'PLAYER' ? displayRow : 6 - displayRow;
  };

  const toDisplayRowRef = (kernelRow: number) => {
    return side === 'PLAYER' ? kernelRow : 6 - kernelRow;
  };

  const project = (lane: number, row: number, offset: number = 0) => {
    const laneW = CANVAS_W / 3;
    const rowH = CANVAS_H / 7;
    return {
      x: lane * laneW + laneW / 2,
      y: row * rowH + rowH / 2 + offset
    };
  };

  const unproject = (x: number, y: number) => {
    const lane = Math.floor(x / (CANVAS_W / 3));
    const row = Math.floor(y / (CANVAS_H / 7));
    return { lane: Math.max(0, Math.min(2, lane)), row: Math.max(0, Math.min(6, row)) };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      
      // Grid
      ctx.strokeStyle = 'rgba(25, 186, 255, 0.1)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(i * (CANVAS_W/3), 0); ctx.lineTo(i * (CANVAS_W/3), CANVAS_H); ctx.stroke();
      }
      for (let i = 1; i < 7; i++) {
        ctx.beginPath(); ctx.moveTo(0, i * (CANVAS_H/7)); ctx.lineTo(CANVAS_W, i * (CANVAS_H/7)); ctx.stroke();
      }

      // Zones
      ctx.fillStyle = 'rgba(25, 186, 255, 0.05)';
      ctx.fillRect(0, 5 * (CANVAS_H/7), CANVAS_W, CANVAS_H/7); // Deploy Front
      ctx.fillRect(0, 4 * (CANVAS_H/7), CANVAS_W, CANVAS_H/7); // Deploy Back

      // Selection
      if (selectedLane !== null && selectedRow !== null) {
        const isItem = draggingOp?.op.class === 'Item';
        const isValid = isItem ? (selectedRow >= 1 && selectedRow <= 5) : true; // More detailed checks happen in handleDeploy
        
        ctx.fillStyle = isValid ? 'rgba(25, 186, 255, 0.2)' : 'rgba(239, 68, 68, 0.1)';
        ctx.fillRect(selectedLane * (CANVAS_W/3), selectedRow * (CANVAS_H/7), CANVAS_W/3, CANVAS_H/7);
      }

      // Units
      matchState.units.forEach(u => {
        const displayRow = toDisplayRowRef(u.row);
        const pos = project(u.lane, displayRow);
        
        ctx.save();
        ctx.translate(pos.x, pos.y);

        // Unit Sprite Placeholder
        const isMe = (side === 'PLAYER' && u.owner === 'PLAYER') || (side === 'OPPONENT' && u.owner === 'AI');
        ctx.fillStyle = isMe ? '#19baff' : '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();

        // HP Bar
        const hpPercent = u.hp / u.maxHp;
        ctx.fillStyle = '#333';
        ctx.fillRect(-20, -25, 40, 4);
        ctx.fillStyle = isMe ? '#19baff' : '#ef4444';
        ctx.fillRect(-20, -25, 40 * hpPercent, 4);

        ctx.restore();
      });

      // Floating Labels
      floatingLabels.current = floatingLabels.current.filter(l => l.life > 0);
      floatingLabels.current.forEach(l => {
        l.y -= 1;
        l.life -= 0.02;
        ctx.globalAlpha = l.life;
        ctx.fillStyle = l.type === 'HEAL' ? '#22c55e' : (l.type === 'DAMAGE' ? '#ef4444' : '#ffffff');
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(l.value, l.x, l.y);
        ctx.globalAlpha = 1;
      });

      animId = requestAnimationFrame(render);
    };
    render();
    return () => cancelAnimationFrame(animId);
  }, [matchState, selectedLane, selectedRow]);

  if (isQueuing) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-black/90 backdrop-blur-xl">
        <div className="relative w-24 h-24 mb-8">
           <div className="absolute inset-0 border-4 border-rhodes-blue/20 rounded-full" />
           <div className="absolute inset-0 border-4 border-t-rhodes-blue rounded-full animate-spin" />
        </div>
        <h2 className="terminal-text text-xl font-black text-rhodes-blue tracking-[0.3em] uppercase italic">Establishing Neural Link</h2>
        <p className="terminal-text text-[8px] text-white/30 mt-4 tracking-widest uppercase">Searching for compatible tactical signal...</p>
        <button onClick={onBack} className="mt-12 text-[10px] text-white/40 hover:text-white terminal-text uppercase border-b border-white/10 pb-1">Abort Search</button>
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
        <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className="w-full h-full cursor-crosshair" />

        <AnimatePresence>
          {matchState.phase === 'ACTION' && !matchResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-red-600/5 backdrop-blur-sm pointer-events-none flex flex-col items-center justify-center z-50">
                <div className="terminal-text text-red-500 text-xl font-black tracking-[0.4em] uppercase italic">Processing Tactics</div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {matchResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-[300] bg-black/90 flex flex-col items-center justify-center backdrop-blur-xl">
               <motion.div 
                 initial={{ scale: 0.8, opacity: 0 }} 
                 animate={{ scale: 1, opacity: 1 }} 
                 transition={{ delay: 0.5, type: 'spring' }} 
                 className="flex flex-col items-center"
               >
                  <div className="relative mb-8 text-center">
                    <div className={`text-7xl font-black italic tracking-tighter ${matchResult === 'VICTORY' ? 'text-rhodes-blue' : 'text-red-600'} drop-shadow-[0_0_30px_rgba(0,186,255,0.4)]`}>
                      {matchResult}
                    </div>
                    <div className="absolute -bottom-2 right-0 left-0 text-center text-white text-[10px] font-black px-2 py-0.5 terminal-text uppercase">
                      Conflict {matchResult === 'VICTORY' ? 'Resolution: SUCCESS' : 'Resolution: FAILED'}
                    </div>
                  </div>

                  <div className="terminal-text text-[10px] text-white/40 uppercase tracking-[0.5em] mb-12 text-center max-w-[300px]">
                    {matchResult === 'VICTORY' 
                      ? "Neural link synchronization complete. Territorial control established." 
                      : "Neural link integrity compromised. Strategic withdrawal initiated."}
                  </div>

                  <button 
                    onClick={onBack} 
                    className="rhodes-button glow-blue px-12 py-4 bg-rhodes-blue text-black font-black terminal-text text-xs uppercase tracking-widest"
                  >
                    Return to Terminal
                  </button>
               </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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

      {draggingOp && (
        <div className="fixed pointer-events-none z-[1000] w-16 h-24 border border-rhodes-blue bg-rhodes-blue/20 rounded overflow-hidden"
             style={{ left: dragPos.x - 32, top: dragPos.y - 48, transform: 'scale(1.1)' }}>
          <img src={getCardImagePath(draggingOp.op)} className="w-full h-full object-contain opacity-90" referrerPolicy="no-referrer" />
        </div>
      )}
    </div>
  );
}
