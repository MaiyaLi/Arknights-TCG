import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Ticket, Star, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '../types';

interface DailyLoginOverlayProps {
  isOpen: boolean;
  onClaim: (day: number) => void;
  loginStreak: number;
}

const REWARDS = [
  { day: 1, type: 'SHARDS', amount: 100, icon: Zap, color: 'text-orange-500' },
  { day: 2, type: 'SHARDS', amount: 100, icon: Zap, color: 'text-orange-500' },
  { day: 3, type: 'RECRUITMENT', amount: 1, icon: Ticket, color: 'text-rhodes-blue' },
  { day: 4, type: 'SHARDS', amount: 100, icon: Zap, color: 'text-orange-500' },
  { day: 5, type: 'SHARDS', amount: 100, icon: Zap, color: 'text-orange-500' },
  { day: 6, type: 'SHARDS', amount: 100, icon: Zap, color: 'text-orange-500' },
  { day: 7, type: 'ELITE', amount: 1, icon: Star, color: 'text-yellow-500' },
];

export default function DailyLoginOverlay({ isOpen, onClaim, loginStreak }: DailyLoginOverlayProps) {
  if (!isOpen) return null;

  const currentDay = (loginStreak % 7) || 7;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="w-full max-w-md bg-rhodes-dark border border-rhodes-blue/30 rounded-lg overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-rhodes-border bg-black/40 text-center">
            <h2 className="text-xl font-bold terminal-text text-rhodes-blue">DAILY MOBILIZATION REWARDS</h2>
            <p className="text-[10px] text-white/40 terminal-text mt-1">Operator Attendance Check | Cycle 07</p>
          </div>

          <div className="p-6 grid grid-cols-4 gap-3">
            {REWARDS.map((reward) => {
              const isClaimed = reward.day < currentDay;
              const isCurrent = reward.day === currentDay;
              const Icon = reward.icon;

              return (
                <div
                  key={reward.day}
                  className={`relative flex flex-col items-center justify-center p-3 border rounded transition-all duration-300 ${
                    isCurrent 
                      ? 'border-rhodes-blue bg-rhodes-blue/10 glow-blue' 
                      : isClaimed 
                        ? 'border-white/10 bg-white/5 opacity-50' 
                        : 'border-rhodes-border bg-black/20'
                  } ${reward.day === 7 ? 'col-span-2' : ''}`}
                >
                  <span className="text-[8px] terminal-text text-white/40 mb-2">DAY 0{reward.day}</span>
                  <Icon className={`w-6 h-6 ${reward.color} mb-1`} />
                  <span className="text-[10px] font-bold terminal-text">
                    {reward.amount}{reward.type === 'SHARDS' ? '' : 'x'}
                  </span>
                  
                  {isClaimed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-6 border-t border-rhodes-border bg-black/40">
            <button
              onClick={() => onClaim(currentDay)}
              className="rhodes-button w-full glow-blue text-rhodes-blue border-rhodes-blue"
            >
              [ CLAIM REWARDS ]
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
