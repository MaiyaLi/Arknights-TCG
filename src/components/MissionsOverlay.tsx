import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Circle, Trophy, Zap, MessageSquare, Swords } from 'lucide-react';
import { UserProfile } from '../types';

interface Mission {
  id: string;
  title: string;
  description: string;
  goal: number;
  reward: number;
  icon: any;
}

export const DAILY_MISSIONS: Mission[] = [
  { id: 'win_sim', title: 'Simulation Specialist', description: 'Win 1 Tactical Simulation match.', goal: 1, reward: 200, icon: Zap },
  { id: 'win_pvp', title: 'Battlefield Dominator', description: 'Win 1 Conflict Zone (PvP) match.', goal: 1, reward: 500, icon: Swords },
  { id: 'chat_op', title: 'Neural Synchronization', description: 'Chat with any operator in the Hub.', goal: 1, reward: 100, icon: MessageSquare },
  { id: 'play_matches', title: 'Combat Veteran', description: 'Complete 3 matches (any mode).', goal: 3, reward: 300, icon: Trophy },
];

interface MissionsOverlayProps {
  isOpen: boolean;
  userProfile: UserProfile;
  onClaim: (missionId: string) => void;
  onClose: () => void;
}

export default function MissionsOverlay({ isOpen, userProfile, onClaim, onClose }: MissionsOverlayProps) {
  const missionsState = userProfile.missions || {};

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 z-[250] flex items-center justify-end bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-[90%] h-full bg-rhodes-dark border-l border-rhodes-border shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-rhodes-border flex justify-between items-center bg-black/40">
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-rhodes-blue" />
                <h2 className="terminal-text text-lg font-black text-white italic tracking-tighter uppercase">Daily Missions</h2>
              </div>
              <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mission List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-[8px] terminal-text text-white/30 uppercase tracking-[0.3em] mb-6">Missions reset every 24 hours of local time</p>
              
              {DAILY_MISSIONS.map((mission) => {
                const state = missionsState[mission.id] || { progress: 0, claimed: false };
                const isCompleted = state.progress >= mission.goal;
                const progressPercent = Math.min(100, (state.progress / mission.goal) * 100);

                return (
                  <div 
                    key={mission.id}
                    className={`p-4 border rounded-sm transition-all relative overflow-hidden ${
                      state.claimed 
                        ? 'bg-black/20 border-white/5 opacity-50' 
                        : isCompleted 
                          ? 'bg-rhodes-blue/5 border-rhodes-blue/30' 
                          : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex gap-4 items-start relative z-10">
                      <div className={`p-2 rounded ${isCompleted && !state.claimed ? 'bg-rhodes-blue/20' : 'bg-white/5'}`}>
                        <mission.icon className={`w-5 h-5 ${isCompleted && !state.claimed ? 'text-rhodes-blue' : 'text-white/40'}`} />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="terminal-text text-[10px] font-black text-white uppercase tracking-wider">{mission.title}</h3>
                          <span className="terminal-text text-[9px] font-bold text-rhodes-blue">+{mission.reward} ORUNDUM</span>
                        </div>
                        <p className="text-[9px] terminal-text text-white/40 leading-relaxed mb-4">{mission.description}</p>
                        
                        <div className="flex items-center gap-3">
                           <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                className={`h-full ${isCompleted ? 'bg-rhodes-blue' : 'bg-white/20'}`}
                              />
                           </div>
                           <span className="terminal-text text-[9px] font-black text-white/60">{state.progress}/{mission.goal}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center pt-1">
                        {state.claimed ? (
                          <div className="flex flex-col items-center gap-1">
                             <CheckCircle2 className="w-5 h-5 text-white/20" />
                             <span className="text-[6px] terminal-text text-white/20 font-bold uppercase">CLAIMED</span>
                          </div>
                        ) : isCompleted ? (
                          <button 
                            onClick={() => onClaim(mission.id)}
                            className="bg-rhodes-blue text-black px-3 py-1.5 rounded-sm terminal-text text-[8px] font-black uppercase hover:bg-white transition-all shadow-[0_0_15px_rgba(0,186,255,0.3)]"
                          >
                            CLAIM
                          </button>
                        ) : (
                          <Circle className="w-5 h-5 text-white/10" />
                        )}
                      </div>
                    </div>

                    {/* Progress Background Flash */}
                    {isCompleted && !state.claimed && (
                      <motion.div 
                        animate={{ opacity: [0.05, 0.15, 0.05] }} 
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 bg-rhodes-blue pointer-events-none" 
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-rhodes-border bg-black/20">
               <div className="flex items-center gap-3 opacity-30">
                  <div className="w-8 h-1 bg-white/20 rounded-full" />
                  <span className="text-[7px] terminal-text text-white uppercase tracking-[0.5em]">Rhodes Island Mission Terminal</span>
               </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
