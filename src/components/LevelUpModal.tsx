import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, TrendingUp, Coins, Award } from 'lucide-react';

interface LevelUpModalProps {
  isOpen: boolean;
  level: number;
  orundum: number;
  certificates: number;
  onClose: () => void;
}

export default function LevelUpModal({ isOpen, level, orundum, certificates, onClose }: LevelUpModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 z-[300] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 1.1, opacity: 0 }}
            className="w-full max-w-sm bg-black/40 border border-rhodes-blue/30 p-8 flex flex-col items-center shadow-[0_0_100px_rgba(0,186,255,0.1)] rounded-sm relative overflow-hidden"
          >
            {/* Animated Background Elements */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-rhodes-blue to-transparent" />
            <motion.div 
              animate={{ rotate: 360 }} 
              transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
              className="absolute -top-24 -right-24 w-48 h-48 border border-rhodes-blue/10 rounded-full" 
            />
            
            {/* Header Icon */}
            <div className="relative mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-20 h-20 bg-rhodes-blue/10 rounded-full flex items-center justify-center border border-rhodes-blue/30"
              >
                <TrendingUp className="w-10 h-10 text-rhodes-blue" />
              </motion.div>
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 bg-rhodes-blue/20 rounded-full blur-xl"
              />
            </div>

            {/* Title */}
            <h2 className="terminal-text text-3xl font-black text-white italic tracking-tighter mb-1 text-center">
              PROMOTION REACHED
            </h2>
            <div className="flex items-center gap-3 mb-10">
               <span className="text-[10px] terminal-text text-white/30 uppercase tracking-[0.4em]">Neural Level</span>
               <span className="text-2xl font-black text-rhodes-blue terminal-text">{level}</span>
            </div>

            {/* Rewards Grid */}
            <div className="w-full space-y-3 mb-12">
               <p className="text-[8px] terminal-text text-white/20 uppercase tracking-widest text-center mb-4">Acquired Resources</p>
               
               <div className="flex items-center justify-between bg-white/5 border border-white/10 p-4 rounded-sm">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 bg-orange-500/20 rounded flex items-center justify-center border border-orange-500/30">
                        <Coins className="w-4 h-4 text-orange-500" />
                     </div>
                     <span className="terminal-text text-[10px] font-bold text-white/80">ORUNDUM</span>
                  </div>
                  <span className="terminal-text text-lg font-black text-white">+{orundum}</span>
               </div>

               <div className="flex items-center justify-between bg-white/5 border border-white/10 p-4 rounded-sm">
                  <div className="flex items-center gap-3">
                     <div className="w-8 h-8 bg-rhodes-blue/20 rounded flex items-center justify-center border border-rhodes-blue/30">
                        <Award className="w-4 h-4 text-rhodes-blue" />
                     </div>
                     <span className="terminal-text text-[10px] font-bold text-white/80">CERTIFICATES</span>
                  </div>
                  <span className="terminal-text text-lg font-black text-white">+{certificates}</span>
               </div>
            </div>

            <button
              onClick={onClose}
              className="rhodes-button glow-blue w-full py-4 bg-rhodes-blue text-black font-black terminal-text text-[10px] uppercase tracking-[0.4em] transition-all hover:bg-white"
            >
              CONFIRM SYNCHRONIZATION
            </button>
            
            <div className="mt-6 flex items-center gap-2 opacity-20">
               <Sparkles className="w-3 h-3 text-white" />
               <p className="text-[7px] terminal-text text-white uppercase tracking-widest">Rhodes Island Central System</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
