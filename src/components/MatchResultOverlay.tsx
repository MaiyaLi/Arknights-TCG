import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, ChevronRight, RotateCcw, Home, Info, ShieldAlert } from 'lucide-react';

interface MatchResultOverlayProps {
  isOpen: boolean;
  result: 'Win' | 'Loss';
  onClose: () => void;
  onRetry?: () => void;
  stats?: {
    time?: string;
    operatorsDeployed?: number;
    damageDealt?: number;
    score?: string;
  };
  rewards?: {
    orundum?: number;
    exp?: number;
    certificates?: number;
  };
}

const MatchResultOverlay: React.FC<MatchResultOverlayProps> = ({ 
  isOpen, 
  result, 
  onClose, 
  onRetry,
  stats = { time: '02:45', operatorsDeployed: 8, damageDealt: 1240, score: 'PRMS-A' },
  rewards = { orundum: 100, exp: 50, certificates: 2 }
}) => {
  const isWin = result === 'Win';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[1000] flex items-center justify-center bg-black/90 backdrop-blur-xl overflow-hidden"
        >
          {/* Background Decorative Elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] opacity-20 ${isWin ? 'bg-rhodes-blue' : 'bg-red-600'}`} />
            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]" />
          </div>

          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 1.1, opacity: 0, y: -20 }}
            className={`relative w-full max-w-lg mx-4 flex flex-col items-center`}
          >
            {/* Header Text Overlay */}
            <div className="relative mb-12 flex flex-col items-center">
              <motion.div
                initial={{ letterSpacing: '1em', opacity: 0 }}
                animate={{ letterSpacing: '0.4em', opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className={`text-6xl md:text-7xl font-black italic tracking-[0.4em] select-none ${isWin ? 'text-white' : 'text-red-500'}`}
              >
                {isWin ? 'SUCCESS' : 'FAILURE'}
              </motion.div>
              <div className="flex items-center gap-4 mt-[-10px]">
                <div className={`h-[2px] w-12 ${isWin ? 'bg-rhodes-blue' : 'bg-red-500/50'}`} />
                <span className={`terminal-text text-sm font-black tracking-[0.2em] uppercase ${isWin ? 'text-rhodes-blue' : 'text-red-500'}`}>
                  {isWin ? 'Mission Accomplished' : 'Operation Terminated'}
                </span>
                <div className={`h-[2px] w-12 ${isWin ? 'bg-rhodes-blue' : 'bg-red-500/50'}`} />
              </div>
              
              {/* Floating ID Card */}
              <div className="absolute -top-12 -left-8 w-24 h-24 opacity-10 border border-white/20 rotate-12 flex items-center justify-center">
                <Info className="w-12 h-12 text-white" />
              </div>
            </div>

            {/* Main Content Card */}
            <div className="w-full bg-white/[0.03] border border-white/10 backdrop-blur-md rounded-sm p-8 shadow-2xl relative overflow-hidden group">
              <div className={`absolute top-0 left-0 w-1 h-full ${isWin ? 'bg-rhodes-blue' : 'bg-red-500'}`} />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Left: Stats */}
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] terminal-text text-white/40 uppercase font-bold tracking-widest mb-4 flex items-center gap-2">
                       <ShieldAlert className="w-3 h-3" /> Tactical Analysis
                    </p>
                    <div className="space-y-3">
                       <StatRow label="Operational Time" value={stats.time} />
                       <StatRow label="Operators Link" value={stats.operatorsDeployed} />
                       <StatRow label="Combat Damage" value={stats.damageDealt} />
                       <StatRow label="Neural Stability" value={isWin ? 'STABLE' : 'CRITICAL'} highlight={!isWin} />
                    </div>
                  </div>
                </div>

                {/* Right: Rewards */}
                <div className="space-y-6">
                  <div>
                    <p className="text-[10px] terminal-text text-white/40 uppercase font-bold tracking-widest mb-4 flex items-center gap-2">
                       <RotateCcw className="w-3 h-3" /> Supply Recovery
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                       <RewardBox label="Orundum" value={rewards.orundum} color="bg-orange-500" />
                       <RewardBox label="Exp" value={rewards.exp} color="bg-rhodes-blue" />
                       <RewardBox label="Certificates" value={rewards.certificates} color="bg-yellow-500" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative Scanline */}
              <div className="absolute top-0 left-0 w-full h-[1px] bg-white/10 animate-scanline" />
            </div>

            {/* Action Buttons */}
            <div className="mt-12 flex flex-col md:flex-row gap-4 w-full justify-center">
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-sm transition-all flex items-center justify-center gap-2 group min-w-[180px]"
                >
                  <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                  <span className="terminal-text text-[10px] font-black uppercase tracking-widest">Re-Initialize</span>
                </button>
              )}
              <button
                onClick={onClose}
                className={`px-12 py-3 rounded-sm transition-all flex items-center justify-center gap-2 group min-w-[200px] ${
                  isWin 
                    ? 'bg-rhodes-blue text-black glow-blue hover:bg-white' 
                    : 'bg-red-500 text-white hover:bg-red-400'
                }`}
              >
                <span className="terminal-text text-[11px] font-black uppercase tracking-widest">
                  {isWin ? 'Return to Base' : 'Acknowledge Retreat'}
                </span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Bottom Tech Text */}
            <div className="mt-16 flex flex-col items-center gap-1 opacity-20 pointer-events-none">
              <p className="text-[8px] terminal-text text-white font-bold tracking-[0.5em] uppercase">Rhodes Island Tactical Network // 2.5D</p>
              <div className="flex gap-4">
                 <p className="text-[7px] terminal-text text-white">SYNC_ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                 <p className="text-[7px] terminal-text text-white">DATE: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const StatRow = ({ label, value, highlight = false }: { label: string; value: string | number | undefined; highlight?: boolean }) => (
  <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
    <span className="text-[10px] terminal-text text-white/50 uppercase font-bold">{label}</span>
    <span className={`text-xs terminal-text font-black ${highlight ? 'text-red-500' : 'text-white'}`}>{value}</span>
  </div>
);

const RewardBox = ({ label, value, color }: { label: string; value: number | undefined; color: string }) => (
  <div className="bg-white/5 p-3 border border-white/5 flex flex-col items-center rounded-sm">
    <div className={`w-1.5 h-1.5 rounded-full ${color} mb-2 shadow-[0_0_8px_rgba(0,0,0,0.5)]`} />
    <span className="text-sm font-black text-white terminal-text">+{value}</span>
    <span className="text-[7px] text-white/30 uppercase font-black tracking-tighter">{label}</span>
  </div>
);

export default MatchResultOverlay;
