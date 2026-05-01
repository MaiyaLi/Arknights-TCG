import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Globe, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface LoginScreenProps {
  onGuestLogin: (name?: string) => void;
  onGoogleLogin: () => void;
  isLoading: boolean;
}

const TERMINAL_MESSAGES = [
  "Checking Neural Stability...",
  "Loading Operator Personnel Files...",
  "Synchronizing Tactical Data Stream...",
  "Bypassing Security Firewalls...",
  "Establishing Secure Handshake...",
  "Verifying Originium Resistance...",
  "Initializing Rhodes Island Terminal...",
  "Allocating Memory Shards...",
];

export default function LoginScreen({ onGuestLogin, onGoogleLogin, isLoading }: LoginScreenProps) {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(TERMINAL_MESSAGES[0]);
  const [customName, setCustomName] = useState('');

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 100) return 100;
          return prev + Math.random() * 15;
        });
        setCurrentMessage(TERMINAL_MESSAGES[Math.floor(Math.random() * TERMINAL_MESSAGES.length)]);
      }, 800);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-black p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full space-y-8"
      >
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold terminal-text tracking-widest italic leading-none">AUTHENTICATION</h2>
          <p className="text-white/40 terminal-text text-[8px] uppercase tracking-[0.3em]">Establish Neural Link</p>
        </div>

        {isLoading ? (
          <div className="space-y-6 py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-rhodes-blue animate-spin" />
              <div className="text-center">
                <p className="text-rhodes-blue terminal-text text-sm animate-pulse">
                  {currentMessage}
                </p>
                <p className="text-white/20 terminal-text text-[10px] mt-1">
                  PROGRESS: {Math.floor(loadingProgress)}%
                </p>
              </div>
            </div>
            <Progress value={loadingProgress} className="h-1 bg-white/10" />
          </div>
        ) : (
          <div className="grid gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-[10px] text-rhodes-blue terminal-text font-black uppercase tracking-widest pl-1">Commander Codename</p>
                <input 
                  type="text" 
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="ENTER ID"
                  className="w-full h-14 bg-white/5 border-2 border-white/10 px-6 text-white terminal-text text-sm focus:border-rhodes-blue focus:bg-rhodes-blue/5 outline-none transition-all placeholder:text-white/10 font-bold"
                />
              </div>
              <button
                onClick={() => onGuestLogin(customName)}
                className="rhodes-button w-full h-14 flex items-center justify-center gap-4 group"
              >
                <User className="w-5 h-5 group-hover:text-rhodes-blue transition-colors" />
                <span className="font-black text-xs uppercase tracking-widest">Initialise Session</span>
              </button>
            </div>

            <div className="relative py-4 flex items-center justify-center">
               <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5" /></div>
               <span className="relative bg-black px-4 text-[8px] text-white/20 terminal-text uppercase">Social Cluster Sync</span>
            </div>

            <button
              onClick={onGoogleLogin}
              className="w-full h-14 border-2 border-white/10 hover:border-rhodes-blue/50 flex items-center justify-center gap-4 transition-all group backdrop-blur-sm"
            >
              <Globe className="w-5 h-5 text-white/40 group-hover:text-rhodes-blue transition-colors" />
              <span className="terminal-text text-xs uppercase tracking-widest text-white/40 group-hover:text-white">Google Auth Link</span>
            </button>

            <div className="pt-8 text-center">
              <p className="text-[9px] text-white/20 terminal-text leading-relaxed uppercase tracking-tighter">
                WARNING: Unauthorized access to Rhodes Island terminals is punishable by immediate cognitive restructuring.
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
