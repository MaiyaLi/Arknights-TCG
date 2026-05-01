import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { BattleKernel, GamePhase, GameUnit } from './src/game/BattleKernel';
import { ALL_ASSETS } from './src/data/operators';

async function startServer() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Matchmaking Queue
  let queue: { socketId: string, userId: string, displayName: string, squad: any[] }[] = [];
  const activeMatches = new Map<string, {
    id: string;
    players: any[];
    kernel: BattleKernel;
    logs: string[];
    playerReady: boolean;
    opponentReady: boolean;
  }>();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_queue', (userData) => {
      queue = queue.filter(q => q.userId !== userData.userId);
      const entry = { socketId: socket.id, ...userData };
      
      if (queue.length > 0) {
        const opponent = queue.shift()!;
        const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        
        // Initialize Kernel for Battle Royale (PVP Mode)
        const kernel = new BattleKernel(
          (winner) => io.to(matchId).emit('game_over', { winner }),
          (owner, id) => {}, // Score handled via removed unit
          (unit, reason) => {
             // Handle unit removal pings if needed
          },
          (phase) => io.to(matchId).emit('phase_change', phase),
          (turn) => io.to(matchId).emit('turn_start', turn),
          (lane, row, value, type) => io.to(matchId).emit('combat_event', { lane, row, value, type })
        );
        kernel.start();

        activeMatches.set(matchId, {
          id: matchId,
          players: [
            { ...opponent, side: 'PLAYER' }, // Socket P1
            { ...entry, side: 'OPPONENT' }  // Socket P2
          ],
          kernel,
          logs: [],
          playerReady: false,
          opponentReady: false
        });
        
        socket.join(matchId);
        io.to(opponent.socketId).emit('match_found', { matchId, side: 'PLAYER', opponent: entry });
        socket.emit('match_found', { matchId, side: 'OPPONENT', opponent });
      } else {
        queue.push(entry);
        socket.emit('queue_joined');
      }
    });

    socket.on('leave_queue', () => {
      queue = queue.filter(q => q.socketId !== socket.id);
    });

    socket.on('join_match', (matchId) => {
      socket.join(matchId);
      const match = activeMatches.get(matchId);
      if (match) {
        socket.emit('match_sync', {
          id: match.id,
          players: match.players,
          units: match.kernel.units,
          phase: match.kernel.phase,
          turn: match.kernel.turnCount,
          playerDP: match.kernel.playerDP,
          opponentDP: match.kernel.aiDP,
          playerLP: match.kernel.playerLP,
          opponentLP: match.kernel.aiLP,
          logs: match.logs
        });
      }
    });

    socket.on('deploy_unit', ({ matchId, opId, lane, row, side }) => {
      const match = activeMatches.get(matchId);
      if (match) {
        const op = ALL_ASSETS.find(a => a.id === opId);
        if (op) {
          // In BattleKernel, AI corresponds to the OPPONENT in PVP
          const kernelOwner = (side === 'PLAYER' ? 'PLAYER' : 'AI');
          const success = match.kernel.deployUnit(op, kernelOwner, lane, row);
          if (success) {
            io.to(matchId).emit('match_sync', {
              id: match.id,
              players: match.players,
              units: match.kernel.units,
              phase: match.kernel.phase,
              playerDP: match.kernel.playerDP,
              opponentDP: match.kernel.aiDP,
              playerLP: match.kernel.playerLP,
              opponentLP: match.kernel.aiLP
            });
          }
        }
      }
    });

    socket.on('authorize_ready', ({ matchId, side }) => {
      const match = activeMatches.get(matchId);
      if (match) {
        if (side === 'PLAYER') match.playerReady = true;
        else match.opponentReady = true;

        if (match.playerReady && match.opponentReady) {
          match.playerReady = false;
          match.opponentReady = false;
          
          // Execute tactical cycle
          match.kernel.executeStrategy();
          
          // Delayed sync to allow client action animations to play out (3s corresponds to simulation reveal)
          setTimeout(() => {
            io.to(matchId).emit('match_sync', {
              id: match.id,
              players: match.players,
              units: match.kernel.units,
              phase: match.kernel.phase,
              turn: match.kernel.turnCount,
              playerDP: match.kernel.playerDP,
              opponentDP: match.kernel.aiDP,
              playerLP: match.kernel.playerLP,
              opponentLP: match.kernel.aiLP
            });
          }, 3000);
        }
        io.to(matchId).emit('ready_sync', { playerReady: match.playerReady, opponentReady: match.opponentReady });
      }
    });

    socket.on('disconnect', () => {
      queue = queue.filter(q => q.socketId !== socket.id);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist/index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
