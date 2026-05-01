import React from 'react';
import { motion } from 'motion/react';
import { Shield } from 'lucide-react';

interface SplashScreenProps {
  onStart: () => void;
}

export default function SplashScreen({ onStart }: SplashScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-black relative overflow-hidden p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        className="text-center z-10"
      >
        <div className="mb-8 flex justify-center">
          <motion.div
            animate={{ 
              rotate: [0, 10, -10, 0],
              opacity: [0.8, 1, 0.8]
            }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <Shield className="w-20 h-20 text-rhodes-blue" />
          </motion.div>
        </div>

        <h1 className="text-3xl font-bold terminal-text mb-2 tracking-tighter leading-tight">
          [ ARKNIGHTS: TACTICAL SYNC ]
        </h1>
        <p className="text-rhodes-blue/60 terminal-text text-[10px] mb-12">
          Frontline Mobilization Protocol | v1.0.4-BETA
        </p>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onStart}
          className="rhodes-button glow-blue w-full"
        >
          ESTABLISH NEURAL LINK
        </motion.button>
      </motion.div>

      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
        <div className="absolute top-10 left-10 border-l border-t border-rhodes-blue/20 w-32 h-32" />
        <div className="absolute bottom-10 right-10 border-r border-b border-rhodes-blue/20 w-32 h-32" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-rhodes-blue/5 rounded-full blur-[120px]" />
      </div>
    </div>
  );
}
