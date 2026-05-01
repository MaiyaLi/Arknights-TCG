import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export default function TermsModal({ isOpen, onAccept }: TermsModalProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Check if user is within 30px of the bottom for better reliability
    const isBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 30;
    if (isBottom) {
      setHasScrolledToBottom(true);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-2xl bg-rhodes-dark border border-rhodes-border rounded-lg overflow-hidden flex flex-col max-h-[80vh]"
        >
          <div className="p-6 border-b border-rhodes-border flex items-center gap-4 bg-black/40">
            <div className="p-2 bg-rhodes-blue/10 rounded">
              <ShieldIcon className="w-6 h-6 text-rhodes-blue" />
            </div>
            <div>
              <h2 className="text-xl font-bold terminal-text">Recruitment & Safety Agreement</h2>
              <p className="text-xs text-white/40 terminal-text">Document ID: RI-TERM-04-B</p>
            </div>
          </div>

          <div 
            className="flex-1 overflow-y-auto p-6" 
            onScroll={handleScroll}
          >
            <div className="space-y-6 text-sm text-white/70 leading-relaxed font-mono">
              <section>
                <h3 className="text-rhodes-blue mb-2 font-bold uppercase tracking-widest">01. Neural Link Protocol</h3>
                <p>
                  By establishing a neural link with the Rhodes Island Tactical Sync terminal, the operator acknowledges that their consciousness will be synchronized with the central mainframe. Any data generated during this session is the sole property of Rhodes Island.
                </p>
              </section>

              <section>
                <h3 className="text-rhodes-blue mb-2 font-bold uppercase tracking-widest">02. Virtual Operator Data Ownership</h3>
                <p>
                  All virtual operator profiles, combat records, and strategic assets acquired through this terminal are classified as "Rhodes Island Strategic Resources." Operators are granted a non-transferable license to utilize these assets for frontline mobilization.
                </p>
              </section>

              <section>
                <h3 className="text-rhodes-blue mb-2 font-bold uppercase tracking-widest">03. Fair Play Synchronization</h3>
                <p>
                  Any attempt to desynchronize or manipulate the tactical data stream via unauthorized external modules (hacks, exploits, or third-party augmentations) will result in immediate termination of the neural link and permanent blacklisting from the Rhodes Island network.
                </p>
              </section>

              <section>
                <h3 className="text-rhodes-blue mb-2 font-bold uppercase tracking-widest">04. Cognitive Load Warning</h3>
                <p>
                  Prolonged exposure to the tactical sync environment may cause minor cognitive fatigue. Operators are advised to disconnect if they experience "Originium-like" visual artifacts or auditory hallucinations.
                </p>
              </section>

              <div className="p-4 bg-rhodes-blue/5 border border-rhodes-blue/20 rounded flex gap-4 items-start">
                <AlertTriangle className="w-5 h-5 text-rhodes-blue shrink-0 mt-1" />
                <p className="text-xs text-rhodes-blue/80 italic">
                  NOTICE: You must review the entire mobilization protocol before authorization can be granted. Scroll to the bottom to confirm your identity.
                </p>
              </div>
              
              <div className="h-4" /> {/* Spacer for bottom scroll */}
            </div>
          </div>

          <div className="p-6 border-t border-rhodes-border bg-black/40 flex justify-end gap-4">
            <button
              disabled={!hasScrolledToBottom}
              onClick={onAccept}
              className={`rhodes-button ${hasScrolledToBottom ? 'glow-blue text-rhodes-blue border-rhodes-blue' : 'opacity-30'}`}
            >
              [ I ACCEPT ]
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  );
}
