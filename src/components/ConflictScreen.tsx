import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Pause, Play, RotateCcw, Zap, Heart, Trash2, Star, Loader2
} from 'lucide-react';
import { supabase } from '../supabase';
import ConflictLobby from './ConflictLobby';
import MatchResultOverlay from './MatchResultOverlay';
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

  const [selectedUnit, setSelectedUnit] = useState<GameUnit | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ lane: number, row: number } | null>(null);

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
            const amIHostNow = myPair[0] === userProfile.uid;
            const myActualSide = amIHostNow ? 'PLAYER' : 'OPPONENT';
            setMatchId(mId); 
            setSide(myActualSide);
            startMatch(mId, amIHostNow, myActualSide);
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
      (w) => { if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'game_over', payload: { winner: w } }); syncMatchStateInternal(kernel, matchChannel, mySide); } },
      () => {},
      (unit, reason) => { if (amIHost && reason !== 'SCORED_GOAL') { matchChannel.send({ type: 'broadcast', event: 'unit_removed', payload: { owner: unit.owner, opId: unit.id } }); } },
      (p) => { setPhase(p); if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'phase_change', payload: p }); syncMatchStateInternal(kernel, matchChannel, mySide); } },
      (turn) => { if (amIHost) { matchChannel.send({ type: 'broadcast', event: 'turn_start', payload: turn }); syncMatchStateInternal(kernel, matchChannel, mySide); } },
      (lane, row, value, type) => { matchChannel.send({ type: 'broadcast', event: 'combat_event', payload: { lane, row, value, type } }); }
    );
    if (amIHost) kernel.start();
    kernelRef.current = kernel;

    matchChannel
      .on('broadcast', { event: 'request_deploy' }, ({ payload }) => {
        if (amIHost && kernelRef.current) {
          const op = ALL_ASSETS.find(a => a.id === payload.opId);
          if (op) {
            const sideKey = (payload.side || 'OPPONENT').toUpperCase();
            if (sideKey === 'PLAYER') {
                if (kernelRef.current.playerDP >= op.dp_cost) kernelRef.current.playerDP -= op.dp_cost;
            } else {
                if (kernelRef.current.aiDP >= op.dp_cost) kernelRef.current.aiDP -= op.dp_cost;
            }
            pendingUnitsRef.current.push({ op, lane: payload.lane, row: payload.row, side: payload.side || 'OPPONENT' });
            syncMatchStateInternal(kernelRef.current, matchChannel, mySide); 
          }
        }
      })
      .on('broadcast', { event: 'request_supply' }, ({ payload }) => {
          if (amIHost && kernelRef.current) {
              const sideKey = (payload.side || 'OPPONENT').toUpperCase();
              if (sideKey === 'PLAYER') {
                  if (kernelRef.current.playerDP >= 5) kernelRef.current.playerDP -= 5;
              } else {
                  if (kernelRef.current.aiDP >= 5) kernelRef.current.aiDP -= 5;
              }
              syncMatchStateInternal(kernelRef.current, matchChannel, mySide);
              matchChannel.send({ type: 'broadcast', event: 'supply_confirmed', payload: { side: payload.side || 'OPPONENT' } });
          }
      })
      .on('broadcast', { event: 'request_retreat' }, ({ payload }) => {
        if (amIHost && kernelRef.current) {
          kernelRef.current.retreatUnit(payload.instanceId);
          syncMatchStateInternal(kernelRef.current, matchChannel, mySide);
        }
      })
      .on('broadcast', { event: 'request_activate_skill' }, ({ payload }) => {
        if (amIHost && kernelRef.current) {
          kernelRef.current.activateSkill(payload.instanceId);
          syncMatchStateInternal(kernelRef.current, matchChannel, mySide);
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
        if (amIHost) { if (payload.side === 'PLAYER') setPlayerReady(true); else setOpponentReady(true); }
      })
      .on('broadcast', { event: 'ready_sync' }, ({ payload }) => {
          if (!amIHost) { 
            // Invert the mapping: Host's 'playerReady' is the Guest's 'opponentReady'
            setOpponentReady(payload.playerReady);
            setPlayerReady(payload.opponentReady);
          }
      })
      .on('broadcast', { event: 'start_action' }, () => { setPlayerReady(false); setOpponentReady(false); setPendingDeploys([]); })
      .on('broadcast', { event: 'match_sync' }, ({ payload }) => {
        if (!amIHost && kernelRef.current) {
          setPhase(payload.phase);
          const localIsPlayer = mySide === 'PLAYER';
          const myDP = localIsPlayer ? payload.playerDP : payload.opponentDP;
          const enemyDP = localIsPlayer ? payload.opponentDP : payload.playerDP;
          const myLP = localIsPlayer ? payload.playerLP : payload.opponentLP;
          const enemyLP = localIsPlayer ? payload.opponentLP : payload.playerLP;
          setUiState({ playerLP: myLP, opponentLP: enemyLP, playerDP: Math.floor(myDP), opponentDP: Math.floor(enemyDP) });
          kernelRef.current.units = payload.units; kernelRef.current.playerLP = payload.playerLP; kernelRef.current.aiLP = payload.opponentLP;
          kernelRef.current.playerDP = payload.playerDP; kernelRef.current.aiDP = payload.opponentDP; kernelRef.current.phase = payload.phase;
        }
      })
      .on('broadcast', { event: 'combat_event' }, ({ payload }) => { handleCombatEvent(payload.lane, payload.row, payload.value, payload.type, mySide); })
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

  const syncMatchStateInternal = (kernel: BattleKernel, chan: RealtimeChannel, mySide: string) => {
    const state = { units: kernel.units, phase: kernel.phase, turn: kernel.turnCount, playerLP: kernel.playerLP, opponentLP: kernel.aiLP, playerDP: kernel.playerDP, opponentDP: kernel.aiDP };
    const localIsPlayer = mySide === 'PLAYER';
    const myDPValue = localIsPlayer ? state.playerDP : state.opponentDP;
    const enemyDPValue = localIsPlayer ? state.opponentDP : state.playerDP;
    const myLPValue = localIsPlayer ? state.playerLP : state.opponentLP;
    const enemyLPValue = localIsPlayer ? state.opponentLP : state.playerLP;
    setUiState({ playerLP: myLPValue, opponentLP: enemyLPValue, playerDP: Math.floor(myDPValue), opponentDP: Math.floor(enemyDPValue) });
    chan.send({ type: 'broadcast', event: 'match_sync', payload: state });
  };

  useEffect(() => {
      if (isHost && playerReady && opponentReady && phase === 'COMMAND') {
          pendingUnitsRef.current.forEach(p => { kernelRef.current?.deployUnit(p.op, p.side === 'PLAYER' ? 'PLAYER' : 'AI', p.lane, p.row, true); });
          pendingUnitsRef.current = [];
          setPlayerReady(false); setOpponentReady(false); setPendingDeploys([]);
          channelRef.current?.send({ type: 'broadcast', event: 'start_action' });
          kernelRef.current?.executeStrategy();
          if (kernelRef.current && channelRef.current && side) syncMatchStateInternal(kernelRef.current, channelRef.current, side);
      } else if (isHost) {
          // Send current authoritative ready states to the guest
          channelRef.current?.send({ type: 'broadcast', event: 'ready_sync', payload: { playerReady, opponentReady } });
      }
  }, [playerReady, opponentReady, isHost, phase]);

  // --- RENDERING ---
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

    // Grid & Platforms
    for (let r = 0; r < 7; r++) { 
      for (let l = 0; l < 3; l++) {
        const isSelected = selectedLane === l && selectedRow === r; 
        const isPlat = r === 5;
        const isOccupied = kernelRef.current?.units.some(u => u.lane === l && u.row === r);
        const isItem = draggingOp?.op.class === 'Item';
        const classValid = draggingOp && (r === 5 || (r === 4 && !['Sniper', 'Caster', 'Medic'].includes(draggingOp.op.class)));
        const isPlaceable = draggingOp && classValid && !isOccupied;
        const isInvalid = draggingOp && (!classValid || isOccupied);

        const padSize = isSelected ? 0.43 : 0.4;
        
        const p0 = project(l - padSize, r - padSize); 
        const p1 = project(l + padSize, r - padSize); 
        const p2 = project(l + padSize, r + padSize); 
        const p3 = project(l - padSize, r + padSize);
        
        const baseHeight = isPlat ? 12 : ((r === 0 || r === 6) ? 6 : 4);
        const p2d = { x: p2.x, y: p2.y + baseHeight }; 
        const p3d = { x: p3.x, y: p3.y + baseHeight };
        
        // Surface & Depth Logic
        let surface = isSelected ? 'rgba(0, 152, 217, 0.4)' : (r === 0 ? 'rgba(255, 59, 59, 0.4)' : r === 6 ? 'rgba(0, 255, 231, 0.4)' : (r === 3 ? 'rgba(255, 255, 255, 0.1)' : (isPlat ? 'rgba(10, 20, 40, 0.98)' : 'rgba(10, 10, 20, 0.98)')));
        let sideColor = isSelected ? 'rgba(0, 255, 231, 0.4)' : (isPlat ? 'rgba(0, 152, 217, 0.2)' : 'rgba(0, 152, 217, 0.1)');
        
        // Depth/3D Side
        ctx.fillStyle = sideColor;
        ctx.beginPath(); 
        ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y); 
        ctx.lineTo(p2d.x, p2d.y); ctx.lineTo(p3d.x, p3d.y); 
        ctx.closePath(); ctx.fill();
        
        // Surface
        ctx.fillStyle = isInvalid && isSelected ? 'rgba(255, 59, 59, 0.2)' : surface; 
        ctx.beginPath(); 
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); 
        ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); 
        ctx.closePath(); ctx.fill();
        
        // Border
        ctx.strokeStyle = isInvalid && isSelected ? 'rgba(255, 59, 59, 0.8)' : (isSelected ? 'rgba(0, 255, 231, 1)' : (isPlat ? 'rgba(0, 255, 231, 0.3)' : 'rgba(0, 152, 217, 0.15)')); 
        ctx.lineWidth = isSelected ? 2.5 : 0.8; 
        ctx.stroke();

        // Invalid Feedback
        if (isInvalid && isSelected) {
           ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = 2;
           ctx.beginPath();
           ctx.moveTo(p0.x + 10, p0.y + 10); ctx.lineTo(p2.x - 10, p2.y - 10);
           ctx.moveTo(p1.x - 10, p1.y + 10); ctx.lineTo(p3.x + 10, p3.y - 10);
           ctx.stroke();
        }

        // Guide Pulse for placeable tiles - Ported from Simulation
        if (isPlaceable) {
            const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
            const center = project(l, r);
            
            // 1. Ground Tactical Zone
            ctx.fillStyle = `rgba(0, 255, 231, ${0.1 + 0.15 * pulse})`;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
            ctx.closePath(); ctx.fill();

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
            ctx.closePath(); ctx.fill();

            // 3. Thick Animated Border
            ctx.strokeStyle = `rgba(0, 255, 231, ${0.4 + 0.5 * pulse})`;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 4]);
            ctx.lineDashOffset = -Date.now() / 30;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
            ctx.closePath(); ctx.stroke();
            ctx.setLineDash([]);
        }

        // Holographic Effects for End Zones
        if (r === 0 || r === 6) {
           const center = project(l, r);
           const isHostile = r === 0;
           const pPillar = project(l, r, 20);
           const pillarGrad = ctx.createLinearGradient(0, center.y, 0, pPillar.y);
           const mainCol = isHostile ? '255, 59, 59' : '0, 255, 231';
           
           pillarGrad.addColorStop(0, `rgba(${mainCol}, 0.3)`);
           pillarGrad.addColorStop(1, `rgba(${mainCol}, 0)`);
           ctx.fillStyle = pillarGrad;
           ctx.beginPath();
           if (isHostile) {
             ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
             ctx.lineTo(pPillar.x + 10, pPillar.y); ctx.lineTo(pPillar.x - 10, pPillar.y);
           } else {
             ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y);
             ctx.lineTo(pPillar.x + 15, pPillar.y); ctx.lineTo(pPillar.x - 15, pPillar.y);
           }
           ctx.closePath(); ctx.fill();

           // Portal lines
           ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
           ctx.lineWidth = 1.5;
           ctx.beginPath();
           ctx.moveTo(p0.x, p0.y); ctx.lineTo(p2.x, p2.y);
           ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y);
           ctx.stroke();
        }

        // Accents
        if (r === 0 || r === 6) {
           ctx.strokeStyle = r === 0 ? 'rgba(255, 59, 59, 0.5)' : 'rgba(0, 255, 231, 0.5)';
           ctx.lineWidth = 1.5;
           ctx.beginPath();
           ctx.moveTo(p0.x, p0.y); ctx.lineTo(p2.x, p2.y);
           ctx.moveTo(p1.x, p1.y); ctx.lineTo(p3.x, p3.y);
           ctx.stroke();
        }

        if (isSelected) {
           const center = project(l, r);
           ctx.strokeStyle = '#fff';
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.moveTo(center.x - 10, center.y); ctx.lineTo(center.x + 10, center.y);
           ctx.moveTo(center.x, center.y - 6); ctx.lineTo(center.x, center.y + 6);
           ctx.stroke();

           // Corner accents
           [p0, p1, p2, p3].forEach((p) => {
             ctx.beginPath();
             ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
             ctx.stroke();
           });
        }

        // Technical Label
        if (r === 6 || r === 0 || isSelected) {
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '700 6px monospace';
          ctx.textAlign = 'center';
          const center = project(l, r);
          ctx.fillText(`SEC ${l}-${r}`, center.x, center.y + 18);
        }
      }
    }

    // Goal Accents
    const aiBase = project(1, 0.2);
    const plBase = project(1, 5.8);
    ctx.font = '900 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 59, 59, 0.9)';
    ctx.shadowBlur = 5; ctx.shadowColor = '#ff3b3b';
    ctx.fillText('SIGNAL HOSTILE // ELIMINATION TARGET', aiBase.x, aiBase.y - 45);
    ctx.fillStyle = 'rgba(0, 255, 231, 0.9)';
    ctx.shadowColor = '#00ffe7';
    ctx.fillText('SIGNAL FRIENDLY // CORE SYNC', plBase.x, plBase.y + 45);
    ctx.shadowBlur = 0;

        // Selected Highlighter - From Simulation
        if (selectedSlot) {
           const s = selectedSlot;
           const p0 = project(s.lane - 0.45, s.row - 0.45);
           const p1 = project(s.lane + 0.45, s.row - 0.45);
           const p2 = project(s.lane + 0.45, s.row + 0.45);
           const p3 = project(s.lane - 0.45, s.row + 0.45);
           
           ctx.strokeStyle = '#facc15';
           ctx.lineWidth = 2;
           ctx.setLineDash([4, 2]);
           ctx.beginPath();
           ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
           ctx.closePath(); ctx.stroke();
           ctx.setLineDash([]);
        }

        const drawUnit = (id: string, name: string, lane: number, row: number, owner: 'PLAYER' | 'AI', hp?: number, maxHp?: number, isPending = false, clusterOffset = { x: 0, y: 0 }) => {
        const isPl = side?.toUpperCase() === 'PLAYER';
        let dRow = isPl ? row : 6 - row; 
        let dLane = isPl ? lane : 2 - lane;
        const isMe = (isPl && owner === 'PLAYER') || (!isPl && owner === 'AI');
        const view = isMe ? 'Back' : 'Front'; 
        const mainColor = isMe ? '#00ffe7' : '#ff3b3b';
        
        const xOffset = row === 3 ? (owner === 'PLAYER' ? -0.25 : 0.25) : 0;
        const dLaneWithOffset = isPl ? lane + xOffset : (2 - lane) - xOffset;
        
        // 2.5D displacement
        const basePos = project(dLaneWithOffset, dRow); 
        const mainPos = project(dLaneWithOffset, dRow, 15);
        
        mainPos.x += clusterOffset.x;
        mainPos.y += clusterOffset.y;
        basePos.x += clusterOffset.x;
        basePos.y += clusterOffset.y;

        const spriteImg = spriteImages.current[`${id}_${view}`];
        
        if (spriteImg && spriteImg.complete) {
            ctx.save(); 
            if (isPending) ctx.globalAlpha = 0.4;
            ctx.shadowBlur = isPending ? 20 : 10; ctx.shadowColor = mainColor + '44';
            
            let s = 140; let yOff = 50; 
            if (id.toLowerCase().includes('slug')) { s = 800; yOff = 225; } 
            else if (id.toLowerCase().includes('zima') || name.toLowerCase().includes('zima')) { 
                s = 145; 
                yOff = 55;
            } 
            else if (id.toLowerCase().includes('sarkaz')) { s = 700; yOff = 197; }
            
            ctx.drawImage(spriteImg, mainPos.x - s/2, mainPos.y - s + yOff, s, s); 
            ctx.restore();
        }
        
        // Health bar removed per request
    };

    pendingDeploys.forEach(p => {
        drawUnit(p.op.id, p.op.name, p.lane, p.row, p.side === 'PLAYER' ? 'PLAYER' : 'AI', undefined, undefined, true);
    });

    const activeUnits = kernelRef.current?.units || [];
    // Sort by dRow (display row) for correct back-to-front depth layering
    const isPl = side?.toUpperCase() === 'PLAYER';
    [...activeUnits].sort((a, b) => {
        const dRowA = isPl ? a.row : 6 - a.row;
        const dRowB = isPl ? b.row : 6 - b.row;
        return dRowA - dRowB;
    }).forEach(u => {
      // INVISIBILITY LOGIC: Hide units from the opponent if they have just been deployed (turnsOnBoard <= 1)
      // This prevents "surprises" by allowing units to "appear" only after their initial setup turn.
      const isMyUnit = (side?.toUpperCase() === 'PLAYER' && u.owner === 'PLAYER') || (side?.toUpperCase() === 'OPPONENT' && u.owner === 'AI');
      if (u.turnsOnBoard <= 1 && !isMyUnit) return;

      const cluster = activeUnits.filter(other => other.lane === u.lane && other.row === u.row);
      const idx = cluster.findIndex(other => other.instanceId === u.instanceId);
      const offset = cluster.length > 1 ? { x: (idx - (cluster.length-1)/2) * 12, y: (idx - (cluster.length-1)/2) * 6 } : { x: 0, y: 0 };
      drawUnit(u.id, u.name, u.lane, u.row, u.owner, u.hp, u.maxHp, false, offset);
    });

    const now = Date.now();
    floatingLabels.current = floatingLabels.current.filter(l => {
      const age = now - l.createdAt; l.life = 1 - (age / 1200); if (l.life <= 0) return false;
      ctx.save(); ctx.globalAlpha = l.life; ctx.fillStyle = l.type === 'DAMAGE' ? '#ff3b3b' : '#22c55e'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillText(l.value, l.x, l.y - (1 - l.life) * 40); ctx.restore(); return true;
    });
  }, [side, selectedLane, selectedRow, draggingOp, phase, pendingDeploys]);

  useEffect(() => {
    let animId: number;
    const loop = () => { if (isHost && kernelRef.current && phase === 'ACTION' && !isPaused) { kernelRef.current.tick(); if (channelRef.current && side) syncMatchStateInternal(kernelRef.current, channelRef.current, side); } render(); animId = requestAnimationFrame(loop); };
    loop(); return () => cancelAnimationFrame(animId);
  }, [phase, isHost, isPaused, side, selectedLane, selectedRow, draggingOp, render]);

  const handleCombatEvent = (lane: number, row: number, value: number, type: any, mySide: string) => {
    const isPl = mySide === 'PLAYER'; const dRow = isPl ? row : 6 - row; const dLane = isPl ? lane : 2 - lane;
    const pos = project(dLane, dRow, 10); 
    floatingLabels.current.push({ id: Math.random().toString(36).substr(2, 9), x: pos.x + (Math.random()-0.5)*30, y: pos.y + (Math.random()-0.5)*15, value: value > 0 ? value.toString() : '', type, life: 1.0, createdAt: Date.now() });
  };

  const handleDragStart = (op: Operator, index: number, e: any) => { if (phase !== 'COMMAND') return; setDraggingOp({ op, index }); setDragPos({ x: e.clientX || e.touches[0].clientX, y: e.clientY || e.touches[0].clientY }); };
  const handleDragMove = (e: any) => {
    if (!draggingOp) return; const x = e.clientX || e.touches[0].clientX; const y = e.clientY || e.touches[0].clientY; setDragPos({ x, y });
    const rect = canvasRef.current?.getBoundingClientRect(); if (rect) {
        const ux = (x - rect.left) * (CANVAS_W / rect.width); const uy = (y - rect.top) * (CANVAS_H / rect.height);
        const { lane, row } = unproject(ux, uy);
        if (lane !== null && row !== null && (row === 5 || (row === 4 && !['Sniper', 'Caster', 'Medic'].includes(draggingOp.op.class)))) { setSelectedLane(lane); setSelectedRow(row); } else { setSelectedLane(null); setSelectedRow(null); }
    }
  };
  const handleDragEnd = () => {
    if (draggingOp && selectedLane !== null && selectedRow !== null) {
      if (uiState.playerDP >= draggingOp.op.dp_cost) {
          const isPl = side?.toUpperCase() === 'PLAYER';
          const kRow = isPl ? selectedRow : 6 - selectedRow;
          const kLane = isPl ? selectedLane : 2 - selectedLane;
          
          channelRef.current?.send({ type: 'broadcast', event: 'request_deploy', payload: { opId: draggingOp.op.id, lane: kLane, row: kRow, side } });
          
          // Host Fix: Immediately handle deployment logic locally to ensure DP is consumed
          if (isHost && kernelRef.current) {
            const op = draggingOp.op;
            const sideKey = (side || 'OPPONENT').toUpperCase();
            if (sideKey === 'PLAYER') {
              if (kernelRef.current.playerDP >= op.dp_cost) kernelRef.current.playerDP -= op.dp_cost;
            } else {
              if (kernelRef.current.aiDP >= op.dp_cost) kernelRef.current.aiDP -= op.dp_cost;
            }
            pendingUnitsRef.current.push({ op, lane: kLane, row: kRow, side: side! });
            syncMatchStateInternal(kernelRef.current, channelRef.current!, side!);
          }

          setPendingDeploys(prev => [...prev, { op: draggingOp.op, lane: kLane, row: kRow, side: side! }]);
          setPlayerHand(prev => prev.filter((_, i) => i !== draggingOp.index));
      }
    }
    setDraggingOp(null); setSelectedLane(null); setSelectedRow(null);
  };
  const handleCanvasClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const { lane, row } = unproject(x, y);

    if (lane === null || row === null) {
      setSelectedSlot(null);
      setSelectedUnit(null);
      return;
    }

    setSelectedSlot({ lane, row });
    const isPl = side?.toUpperCase() === 'PLAYER';
    const kRow = isPl ? row : 6 - row;
    const kLane = isPl ? lane : 2 - lane;
    
    let unit = kernelRef.current?.units.find(u => u.lane === kLane && u.row === kRow);
    
    // Clash row dual occupancy selection
    if (kRow === 3) {
      const p = project(lane, row);
      const isLeft = x < p.x;
      // If isPl, player is on left. If not isPl, opponent is on left (but opponent's owner is AI in kernel)
      const targetOwner = isPl ? (isLeft ? 'PLAYER' : 'AI') : (isLeft ? 'AI' : 'PLAYER');
      const sideUnit = kernelRef.current?.units.find(u => u.lane === kLane && u.row === kRow && u.owner === targetOwner);
      if (sideUnit) unit = sideUnit;
    }

    if (unit) {
      setSelectedUnit(unit);
    } else {
      setSelectedUnit(null);
      setSelectedSlot(null);
    }
  };

  const handleRetreat = () => {
    if (selectedUnit) {
      channelRef.current?.send({ type: 'broadcast', event: 'request_retreat', payload: { instanceId: selectedUnit.instanceId } });
      if (isHost) {
        kernelRef.current?.retreatUnit(selectedUnit.instanceId);
        syncMatchStateInternal(kernelRef.current!, channelRef.current!, side!);
      }
      setSelectedUnit(null);
      setSelectedSlot(null);
    }
  };

  const handleActivateSkill = () => {
    if (selectedUnit) {
      channelRef.current?.send({ type: 'broadcast', event: 'request_activate_skill', payload: { instanceId: selectedUnit.instanceId } });
      if (isHost) {
        kernelRef.current?.activateSkill(selectedUnit.instanceId);
        syncMatchStateInternal(kernelRef.current!, channelRef.current!, side!);
      }
      setSelectedUnit(null);
      setSelectedSlot(null);
    }
  };

  const inspectedUnit = selectedSlot && selectedUnit ? selectedUnit : null;

  const handleAuthorize = () => { setPlayerReady(true); channelRef.current?.send({ type: 'broadcast', event: 'authorize_ready', payload: { side } }); };

  if (isQueuing) return (
      <div className="flex flex-col items-center justify-center h-full bg-black relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-px bg-rhodes-blue/20" />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center p-8 text-center">
          <div className="relative w-32 h-32 mb-16"> <div className="absolute inset-4 border-4 border-t-rhodes-blue border-transparent rounded-full animate-spin" /> </div>
          <h2 className="terminal-text text-xl font-black text-rhodes-blue tracking-[0.2em] uppercase italic leading-tight">Establishing<br />Neural Link</h2>
          <button onClick={onBack} className="mt-24 terminal-text text-[10px] text-white/40 hover:text-white tracking-[0.4em] uppercase font-bold">Abort Search</button>
        </motion.div>
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-black relative overflow-hidden select-none" onMouseMove={handleDragMove} onTouchMove={handleDragMove} onMouseUp={handleDragEnd} onTouchEnd={handleDragEnd}>
      <div className="p-2 px-4 border-b border-rhodes-border flex justify-between items-center bg-black/95 backdrop-blur-md z-30 shrink-0">
        <button onClick={onBack} className="flex items-center gap-2 text-white/40 hover:text-rhodes-blue transition-colors group"> <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> <span className="terminal-text text-[8px] font-bold uppercase">Abort</span> </button>
        <div className="flex gap-4 sm:gap-8 items-center">
          <div className="flex flex-col items-center gap-1"> 
            <div className="flex items-center gap-2"> 
              <div className="flex gap-0.5"> {[...Array(3)].map((_, i) => ( <div key={i} className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < uiState.playerLP ? 'bg-rhodes-blue' : 'bg-white/5'}`} /> ))} </div>
              <span className="terminal-text font-black text-xs text-rhodes-blue">{uiState.playerLP}</span> 
            </div> <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Doctor HP</span> 
          </div>
          <div className="px-4 py-1.5 bg-rhodes-blue/10 border border-rhodes-blue/30 rounded-full"> <span className="terminal-text text-[10px] font-black tracking-[0.2em] text-rhodes-blue uppercase">{phase}</span> </div>
          <div className="flex flex-col items-center gap-1"> 
            <div className="flex items-center gap-2"> 
              <span className="terminal-text font-black text-xs text-red-500">{uiState.opponentLP}</span> 
              <div className="flex gap-0.5"> {[...Array(3)].map((_, i) => ( <div key={i} className={`h-4 w-1.5 rounded-sm skew-x-[-15deg] ${i < uiState.opponentLP ? 'bg-red-500 shadow-[0_0_5px_#ef4444]' : 'bg-white/5'}`} /> ))} </div>
            </div> <span className="text-[6px] terminal-text text-white/30 uppercase font-bold">Target HP</span> 
          </div>
        </div>
        <button onClick={() => setIsPaused(!isPaused)} className="p-2 rounded-full border border-white/10 text-white/40 hover:text-white"> {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} </button>
      </div>

      <div className="flex-1 relative bg-black/40 overflow-hidden">
        <canvas ref={canvasRef} width={450} height={400} className="w-full h-full cursor-crosshair" onClick={handleCanvasClick} />
        
        <MatchResultOverlay 
          isOpen={winner !== null}
          result={winner === 'PLAYER' ? 'Win' : 'Loss'}
          onClose={onBack}
          stats={{
            time: '03:12',
            operatorsDeployed: 12,
            damageDealt: 14500,
            score: winner === 'PLAYER' ? 'S' : 'B'
          }}
          rewards={winner === 'PLAYER' ? { orundum: 100, exp: 50, certificates: 5 } : { orundum: 10, exp: 5, certificates: 0 }}
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
                  onClick={() => { setSelectedSlot(null); setSelectedUnit(null); }} 
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
                  <p className="text-[7px] text-white/30 terminal-text font-bold uppercase mb-0.5">Combat ATK</p>
                  <p className="text-base font-black terminal-text text-white">{inspectedUnit.atk}</p>
                  <p className="text-[7px] text-white/20">BASE: {inspectedUnit.initialAtk}</p>
                </div>
                <div className="bg-white/5 p-2 rounded-sm border border-white/5 flex flex-col items-center">
                  <p className="text-[7px] text-white/30 terminal-text font-bold uppercase mb-0.5">Armor DEF</p>
                  <p className="text-base font-black terminal-text text-white">{inspectedUnit.def}</p>
                  <p className="text-[7px] text-white/20">BASE: {inspectedUnit.initialDef}</p>
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/5 p-2 rounded-sm shrink-0">
                <p className="text-[7px] text-white/30 terminal-text font-bold uppercase mb-1.5">Tactical Info</p>
                <div className="flex items-center gap-2">
                  <div className="w-1 h-1 bg-rhodes-blue rounded-full animate-pulse" />
                  <p className="text-[10px] font-bold terminal-text text-white/80 uppercase">
                    {inspectedUnit.owner === 'PLAYER' ? 'FRIENDLY UNIT' : 'HOSTILE UNIT'}
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

              {((inspectedUnit.owner === 'PLAYER' && side === 'PLAYER') || (inspectedUnit.owner === 'AI' && side === 'OPPONENT')) && phase === 'COMMAND' && (
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
                      <span className="text-[10px] font-bold uppercase">
                        {inspectedUnit.isSkillActive ? 'ACTIVE' : 'ACTIVATE'}
                      </span>
                    </button>
                  )}
                  <button 
                    onClick={handleRetreat}
                    className="w-full border border-red-500/50 text-red-500 hover:bg-red-500/10 py-2 flex items-center justify-center gap-2 rounded transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Retreat</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Phase Overlays */}
        <AnimatePresence>
          {phase === 'ACTION' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-rhodes-blue/10 backdrop-blur-sm pointer-events-none flex flex-col items-center justify-center z-50">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-1 bg-rhodes-blue/20 rounded-full overflow-hidden">
                  <motion.div initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} className="h-full w-1/2 bg-rhodes-blue" />
                </div>
                <div className="terminal-text text-rhodes-blue text-xl font-black tracking-[0.4em] uppercase">Processing Tactics</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'COMMAND' && (
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 1.1, opacity: 0, y: 10 }} className="absolute bottom-6 right-6 z-40">
              <button onClick={handleAuthorize} disabled={playerReady} className={`rhodes-button glow-blue px-6 py-2.5 flex items-center gap-2 group overflow-hidden ${playerReady ? 'opacity-50 grayscale' : 'bg-rhodes-blue text-black font-black uppercase'}`}>
                <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                {playerReady ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                <span className="terminal-text text-[10px] tracking-[0.2em]">{playerReady ? 'Syncing...' : 'Authorize'}</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Mulligan Overlay */}
        <AnimatePresence>
          {mulliganPhase && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/98 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-md">
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
                        <motion.div key={op.id} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setMulliganSelected(prev => prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx])} className={`w-[18vw] max-w-[80px] aspect-[2/3] border-2 rounded-sm overflow-hidden transition-all relative cursor-pointer ${mulliganSelected.includes(idx) ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-white/10 hover:border-rhodes-blue/50'}`}> 
                            <img src={getCardImagePath(op)} className={`w-full h-full object-contain ${mulliganSelected.includes(idx) ? 'opacity-20 grayscale brightness-50' : 'opacity-70 grayscale-[0.2]'}`} referrerPolicy="no-referrer" /> 
                            {mulliganSelected.includes(idx) && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10 z-30">
                                    <RotateCcw className="w-6 h-6 text-red-500 animate-spin-slow" />
                                    <span className="text-[5px] font-black terminal-text text-red-500 mt-1 uppercase">Recycle</span>
                                </div>
                            )}
                        </motion.div> 
                    ))}
                </div>
                <div className="flex flex-col items-center gap-4">
                    <button onClick={() => { if (mulliganSelected.length > 0) { const newHand = [...playerHand]; const newDeck = [...playerDeck]; mulliganSelected.forEach(idx => { const card = newHand[idx]; const next = newDeck.shift(); if (next) { newHand[idx] = next; newDeck.push(card); } }); setPlayerHand(newHand); setPlayerDeck(newDeck); } setMulliganPhase(false); }} disabled={mulliganSelected.length === 0} className={`rhodes-button px-10 py-2.5 group relative overflow-hidden transition-all ${mulliganSelected.length > 0 ? 'glow-blue border-rhodes-blue/50' : 'opacity-20 grayscale border-white/10'}`}> 
                        <div className="absolute inset-0 bg-white/5 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                        <div className="flex items-center gap-2">
                            <RotateCcw className={`w-3 h-3 ${mulliganSelected.length > 0 ? 'text-rhodes-blue animate-spin-slow' : 'text-white/20'}`} />
                            <span className="terminal-text font-black tracking-widest text-[10px] text-rhodes-blue uppercase">Recycle {mulliganSelected.length} {mulliganSelected.length === 1 ? 'Unit' : 'Units'}</span> 
                        </div>
                    </button>
                    <button onClick={() => setMulliganPhase(false)} className="terminal-text text-[8px] text-white/30 hover:text-white transition-colors tracking-[0.3em] font-bold uppercase">Skip & Start Operation</button>
                </div>
                <p className="mt-6 text-[7px] terminal-text text-white/20 uppercase tracking-[0.2em] max-w-[200px] text-center leading-relaxed">
                    Selective recycling enables tactical optimization of your initial deployment link.
                </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Victory/Defeat Overlay */}
        <AnimatePresence>
          {winner && (
            <motion.div initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 z-[1000] bg-black/95 flex flex-col items-center justify-center backdrop-blur-xl p-8 text-center">
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mb-12">
                    <h2 className={`text-6xl font-black terminal-text mb-2 tracking-tighter italic ${winner === 'PLAYER' ? 'text-rhodes-blue' : 'text-red-600'}`}>
                        {winner === 'PLAYER' ? 'OPERATION COMPLETE' : 'CRITICAL FAILURE'}
                    </h2>
                    <div className={`h-1 w-full ${winner === 'PLAYER' ? 'bg-rhodes-blue/50' : 'bg-red-500/50'} rounded-full mx-auto`} />
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="terminal-text text-[10px] text-white/50 mb-8 tracking-widest max-w-[280px] leading-relaxed uppercase">
                    {winner === 'PLAYER' ? 'All tactical objectives secured. Field parameters satisfied. Returning to base command.' : 'System integrity compromised. Deployment force eliminated. Initiating emergency neural decoupling.'}
                </motion.p>
                <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9 }} onClick={onBack} className={`rhodes-button px-16 py-4 font-black terminal-text text-sm ${winner === 'PLAYER' ? 'glow-blue text-rhodes-blue' : 'border-red-500 text-red-500 glow-orange'}`}>
                    DISCONNECT LINK
                </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-2 bg-[#050505] border-t border-rhodes-border shrink-0 shadow-[0_-10px_30px_rgba(0,0,0,0.8)] z-20">
        <div className="flex justify-between items-center mb-2 px-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-black/40 border border-white/5 px-2 py-1 rounded-sm">
                <Zap className="w-3 h-3 text-orange-500 fill-current" />
                <div className="flex flex-col">
                    <span className="text-[10px] font-black terminal-text text-orange-500 leading-none">{uiState.playerDP}</span>
                    <span className="text-[5px] terminal-text text-white/20 uppercase font-bold">DP</span>
                </div>
            </div>
            <button 
              onClick={() => { channelRef.current?.send({ type: 'broadcast', event: 'request_supply', payload: { side } }); }}
              disabled={playerHand.length >= 6 || uiState.playerDP < 5 || playerDeck.length === 0 || phase !== 'COMMAND'}
              className={`rhodes-button h-8 px-3 py-0 flex flex-col items-center justify-center transition-all ${ playerHand.length < 6 && uiState.playerDP >= 5 && playerDeck.length > 0 && phase === 'COMMAND' ? 'glow-blue border-rhodes-blue/50 text-rhodes-blue' : 'border-white/5 text-white/10 opacity-50 grayscale pointer-events-none' }`}
            > <div className="flex items-center gap-1.5"> <span className="text-[8px] font-black uppercase tracking-tighter">Supply</span> <span className="text-[7px] bg-rhodes-blue/20 px-1 rounded text-rhodes-blue">5</span> </div> </button>
          </div>
          <div className="flex items-center gap-2"> <span className="text-[6px] text-rhodes-blue/40 terminal-text uppercase italic font-bold">Deck: {playerDeck.length}</span> </div>
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
