import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, CheckCircle2 } from 'lucide-react';

interface SetupProfileScreenProps {
  initialName: string;
  onComplete: (name: string) => void;
}

export default function SetupProfileScreen({ initialName, onComplete }: SetupProfileScreenProps) {
  const [customName, setCustomName] = useState(initialName);

  return (
    <div className="flex flex-col items-center justify-center h-full bg-black p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full space-y-8"
      >
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold terminal-text tracking-widest italic leading-none text-rhodes-blue">PERSONNEL REGISTRATION</h2>
          <p className="text-white/40 terminal-text text-[8px] uppercase tracking-[0.3em]">Configure Commander Identity</p>
        </div>

        <div className="grid gap-6 py-6 border-y border-white/10">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-[10px] text-rhodes-blue terminal-text font-black uppercase tracking-widest pl-1">Commander Codename</p>
              <input 
                type="text" 
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="ENTER ID"
                className="w-full h-14 bg-white/5 border-2 border-white/10 px-6 text-white terminal-text text-sm focus:border-rhodes-blue focus:bg-rhodes-blue/5 outline-none transition-all placeholder:text-white/10 font-bold"
                maxLength={20}
              />
            </div>
            <button
              onClick={() => onComplete(customName.trim() || initialName)}
              className="rhodes-button glow-blue w-full h-14 flex items-center justify-center gap-4 group mt-4 bg-rhodes-blue/10 hover:bg-rhodes-blue/20 border border-rhodes-blue/30"
            >
              <CheckCircle2 className="w-5 h-5 text-rhodes-blue group-hover:text-white transition-colors" />
              <span className="font-black text-xs uppercase tracking-widest text-rhodes-blue group-hover:text-white transition-colors">Confirm Identity</span>
            </button>
          </div>
        </div>

        <div className="pt-4 text-center">
          <p className="text-[9px] text-white/20 terminal-text leading-relaxed uppercase tracking-tighter">
            NOTICE: This codename will be recorded in the Rhodes Island tactical database.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
