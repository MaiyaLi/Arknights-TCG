import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Zap, 
  ChevronLeft, 
  Briefcase, 
  Sparkles,
  Star,
  Shield,
  Zap as ZapIcon,
  Award
} from 'lucide-react';
import { UserProfile, UserCurrency } from '../types';
import { OPERATORS, Operator } from '../data/operators';
import { getCardImagePath } from '../utils/assetUtils';

interface HeadhuntingScreenProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onBack: () => void;
}

const RARITY_WEIGHTS = {
  6: 0.02,
  5: 0.08,
  4: 0.50,
  3: 0.40,
};

const DUPLICATE_CONVERSION = {
  3: 1,
  4: 5,
  5: 25,
  6: 100,
};

const RARITY_COLORS = {
  6: 'text-orange-500 shadow-orange-500/50',
  5: 'text-yellow-400 shadow-yellow-400/50',
  4: 'text-blue-400 shadow-blue-400/50',
  3: 'text-white shadow-white/50',
};

const RARITY_GLOWS = {
  6: 'rainbow-glow',
  5: 'gold-glow',
  4: 'blue-glow',
  3: 'white-glow',
};

interface PullResult extends Operator {
  isDuplicate: boolean;
}

export default function HeadhuntingScreen({ userProfile, onUpdateProfile, onBack }: HeadhuntingScreenProps) {
  const [pullResults, setPullResults] = useState<PullResult[]>([]);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentRevealIndex, setCurrentRevealIndex] = useState(0);
  const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
  const [highestRarity, setHighestRarity] = useState<number>(3);
  const [showNewOperator, setShowNewOperator] = useState<Operator | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const processingRef = React.useRef(false);

  const performHeadhunt = () => {
    if (processingRef.current || isProcessing || isRevealing || userProfile.currentCurrency.orundum < 500) {
      if (!processingRef.current && !isProcessing && !isRevealing && userProfile.currentCurrency.orundum < 500) {
        alert("Insufficient Orundum.");
      }
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    const results: PullResult[] = [];
    let allThreeStar = true;

    const currentCollection = [...userProfile.collection];
    let newPity5 = userProfile.pity5;
    let newPity6 = userProfile.pity6;

    for (let i = 0; i < 5; i++) {
      newPity5++;
      newPity6++;

      let rarity = 3;
      const rand = Math.random();

      // Pity checks
      if (newPity6 >= 90) {
        rarity = 6;
      } else if (newPity5 >= 10) {
        // Guaranteed 5-star or higher
        if (rand < 0.02) rarity = 6; // Small chance for 6 even on 5-pity
        else rarity = 5;
      } else {
        // Standard rates
        if (rand < RARITY_WEIGHTS[6]) rarity = 6;
        else if (rand < RARITY_WEIGHTS[6] + RARITY_WEIGHTS[5]) rarity = 5;
        else if (rand < RARITY_WEIGHTS[6] + RARITY_WEIGHTS[5] + RARITY_WEIGHTS[4]) rarity = 4;
        else rarity = 3;
      }

      // Special batch guarantee (Arknights 10-pull guarantee equivalent for 5-pulls here)
      if (i === 4 && allThreeStar && rarity < 4) {
        const pityRand = Math.random();
        const totalWeight = RARITY_WEIGHTS[6] + RARITY_WEIGHTS[5] + RARITY_WEIGHTS[4];
        const normalizedRand = pityRand * totalWeight;

        if (normalizedRand < RARITY_WEIGHTS[6]) rarity = 6;
        else if (normalizedRand < RARITY_WEIGHTS[6] + RARITY_WEIGHTS[5]) rarity = 5;
        else rarity = 4;
      }

      // Reset pity counters
      if (rarity === 6) {
        newPity6 = 0;
        newPity5 = 0;
      } else if (rarity === 5) {
        newPity5 = 0;
      }

      if (rarity > 3) allThreeStar = false;

      const pool = OPERATORS.filter(op => op.rarity === rarity);
      const selected = pool[Math.floor(Math.random() * pool.length)];
      
      const isDuplicate = currentCollection.includes(selected.id);
      results.push({ ...selected, isDuplicate });
      
      if (!isDuplicate) {
        currentCollection.push(selected.id);
      }
    }

    const newProfile = { 
      ...userProfile,
      currentCurrency: { ...userProfile.currentCurrency },
      collection: currentCollection,
      pity5: newPity5,
      pity6: newPity6
    };
    newProfile.currentCurrency.orundum -= 500;
    
    let certificatesGained = 0;
    results.forEach(op => {
      if (op.isDuplicate) {
        certificatesGained += DUPLICATE_CONVERSION[op.rarity as keyof typeof DUPLICATE_CONVERSION];
      }
    });

    newProfile.currentCurrency.certificates += certificatesGained;

    setPullResults(results);
    setHighestRarity(Math.max(...results.map(r => r.rarity)));
    setIsRevealing(true);
    setIsProcessing(false);
    processingRef.current = false;
    setCurrentRevealIndex(0);
    setRevealedIndices([]);
    setShowSummary(false);
    onUpdateProfile(newProfile);
  };

  const handleRevealCard = (index: number) => {
    if (revealedIndices.includes(index)) {
      // If already revealed, move to next
      if (index < 4) {
        setCurrentRevealIndex(index + 1);
      } else {
        setShowSummary(true);
      }
      return;
    }
    
    const newRevealed = [...revealedIndices, index];
    setRevealedIndices(newRevealed);

    const operator = pullResults[index];
    if (operator.rarity === 6) {
      setShowNewOperator(operator);
    }
  };

  const resetPull = () => {
    processingRef.current = false;
    setIsRevealing(false);
    setShowSummary(false);
    setPullResults([]);
    setRevealedIndices([]);
    setCurrentRevealIndex(0);
  };

  return (
    <div className="flex flex-col h-full bg-black relative overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-rhodes-border flex justify-between items-center bg-rhodes-dark z-10">
        <button onClick={onBack} className="flex items-center gap-2 text-white/60 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
          <span className="terminal-text text-xs">BACK</span>
        </button>
        <div className="flex gap-4">
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-orange-500" />
            <span className="terminal-text font-bold text-xs">{userProfile.currentCurrency.orundum}</span>
          </div>
          <div className="flex items-center gap-1">
            <Award className="w-3 h-3 text-rhodes-blue" />
            <span className="terminal-text font-bold text-xs">{userProfile.currentCurrency.certificates}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <AnimatePresence mode="wait">
          {!isRevealing ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="text-center space-y-8"
            >
              <div 
                className={`relative group ${isProcessing ? 'cursor-wait' : 'cursor-pointer'}`} 
                onClick={!isProcessing ? performHeadhunt : undefined}
              >
                <div className={`absolute inset-0 bg-rhodes-blue/20 blur-3xl transition-all ${!isProcessing && 'group-hover:bg-rhodes-blue/40'}`} />
                <Search className={`w-40 h-40 text-rhodes-blue relative z-10 transition-transform ${isProcessing ? 'scale-90 opacity-50' : 'group-active:scale-95'}`} />
                <motion.div
                  animate={{ 
                    opacity: isProcessing ? [0.2, 0.4, 0.2] : [0.5, 1, 0.5],
                    scale: isProcessing ? 0.9 : 1
                  }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute -top-4 -right-4 bg-rhodes-blue text-black font-bold text-[10px] px-2 py-1 rounded terminal-text"
                >
                  {isProcessing ? 'INITIALIZING...' : 'SCANNER READY'}
                </motion.div>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold terminal-text tracking-widest">HEADHUNTING</h2>
                <div className="flex flex-col gap-2 w-full max-w-[280px] mx-auto">
                  <button
                    onClick={performHeadhunt}
                    disabled={isProcessing || userProfile.currentCurrency.orundum < 500}
                    className="rhodes-button glow-blue w-full flex items-center justify-center gap-2 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Zap className={`w-4 h-4 ${isProcessing ? 'animate-spin' : 'text-orange-500'}`} />
                    <span className="text-[10px]">{isProcessing ? 'PROCESSING...' : `RECRUIT (500)`}</span>
                  </button>
                </div>

                {/* Pity Display */}
                <div className="flex justify-center gap-4 mt-4">
                  <div className="bg-black/40 border border-yellow-400/20 px-3 py-1.5 rounded flex flex-col items-center min-w-[100px]">
                    <p className="text-[7px] text-yellow-400/50 terminal-text mb-0.5 font-bold">5-STAR PITY</p>
                    <div className="flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-1 h-3 rounded-full ${i < userProfile.pity5 ? 'bg-yellow-400 shadow-[0_0_5px_#facc15]' : 'bg-white/5'}`} 
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-black terminal-text text-yellow-400">{userProfile.pity5}/10</span>
                    </div>
                  </div>
                  <div className="bg-black/40 border border-orange-500/20 px-3 py-1.5 rounded flex flex-col items-center min-w-[100px]">
                    <p className="text-[7px] text-orange-500/50 terminal-text mb-0.5 font-bold">6-STAR PITY</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-orange-500 shadow-[0_0_10px_#f97316]"
                          initial={{ width: 0 }}
                          animate={{ width: `${(userProfile.pity6 / 90) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-black terminal-text text-orange-500">{userProfile.pity6}/90</span>
                    </div>
                  </div>
                </div>

                <p className="text-white/40 terminal-text text-[8px] max-w-[200px] mx-auto">
                  Standard Recruitment Protocol. Guarantees 5-Operator batch authorization.
                </p>
              </div>
            </motion.div>
          ) : showSummary ? (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-sm space-y-6"
            >
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold terminal-text text-rhodes-blue">RECRUITMENT SUMMARY</h2>
                <p className="text-[10px] text-white/40 terminal-text">Batch Authorization Complete</p>
              </div>

              <div className="space-y-3">
                {pullResults.map((op, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={`p-3 border rounded flex items-center gap-4 bg-black/40 ${
                      op.rarity === 6 ? 'border-orange-500/50' :
                      op.rarity === 5 ? 'border-yellow-400/50' :
                      op.rarity === 4 ? 'border-blue-400/50' :
                      'border-white/10'
                    }`}
                  >
                    <div className="w-8 h-8 bg-white/5 rounded flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold terminal-text">{op.class[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold terminal-text truncate">{op.name}</p>
                      <div className="flex gap-0.5 mt-0.5">
                        {Array.from({ length: op.rarity }).map((_, i) => (
                          <Star key={i} className={`w-1.5 h-1.5 fill-current ${
                            op.rarity === 6 ? 'text-orange-500' :
                            op.rarity === 5 ? 'text-yellow-400' :
                            op.rarity === 4 ? 'text-blue-400' :
                            'text-white/40'
                          }`} />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <button
                onClick={resetPull}
                className="rhodes-button w-full glow-blue mt-8"
              >
                [ CONFIRM ]
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="revealing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full h-full flex flex-col items-center justify-center space-y-12"
            >
              <div className="text-center">
                <p className="text-[10px] text-rhodes-blue terminal-text mb-2">OPERATOR {currentRevealIndex + 1} / 5</p>
                <div className="flex gap-2 justify-center">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div 
                      key={i} 
                      className={`h-1 w-8 rounded-full transition-colors ${
                        i === currentRevealIndex ? 'bg-rhodes-blue' : 
                        revealedIndices.includes(i) ? 'bg-rhodes-blue/40' : 'bg-white/10'
                      }`} 
                    />
                  ))}
                </div>
              </div>

              <div className="relative w-64 h-96 perspective-1000">
                <AnimatePresence mode="popLayout">
                  <motion.div
                    key={currentRevealIndex}
                    initial={{ opacity: 0, scale: 0.8, x: 50, rotate: 5 }}
                    animate={{ opacity: 1, scale: 1, x: 0, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.8, x: -50, rotate: -5 }}
                    onClick={() => handleRevealCard(currentRevealIndex)}
                    className="w-full h-full cursor-pointer"
                  >
                    <motion.div
                      animate={{ rotateY: revealedIndices.includes(currentRevealIndex) ? 180 : 0 }}
                      transition={{ duration: 0.6, type: "spring" }}
                      className="w-full h-full relative preserve-3d"
                    >
                      {/* Back of Card */}
                      <div className="absolute inset-0 backface-hidden flex items-center justify-center">
                        <img 
                          src="/Characters/Card Back.png" 
                          alt="Card Back" 
                          className="w-full h-full object-contain drop-shadow-2xl"
                        />
                      </div>

                      <div className="absolute inset-0 backface-hidden rotate-y-180 flex flex-col items-center justify-center p-4">
                        <motion.div
                          onClick={() => handleRevealCard(currentRevealIndex)}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="relative cursor-pointer group flex flex-col items-center h-full justify-center"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <img 
                            src={getCardImagePath(pullResults[currentRevealIndex])}
                            alt={pullResults[currentRevealIndex].name}
                            className="h-full w-auto max-h-[85vh] shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-lg object-contain"
                            referrerPolicy="no-referrer"
                          />
                          
                          <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg pointer-events-none" />

                        </motion.div>
                      </div>
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* New Operator Splash */}
      <AnimatePresence>
        {showNewOperator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-8 text-center overflow-hidden"
          >
            {/* Background Atmosphere */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: [0.1, 0.3, 0.1], scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 8 }}
              className="absolute inset-0 bg-gradient-to-br from-orange-500/20 via-transparent to-orange-500/10 blur-[120px]"
            />

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={() => setShowNewOperator(null)}
              className="relative cursor-pointer flex flex-col items-center justify-center h-full max-w-full p-4 gap-6"
            >
              {/* Massive Glow for 6-Star */}
              <div className="absolute inset-0 bg-orange-500/10 blur-[150px] pointer-events-none" />
              
              <motion.img 
                src={getCardImagePath(showNewOperator)}
                alt={showNewOperator.name}
                className="max-h-[80vh] w-auto shadow-[0_0_100px_rgba(249,115,22,0.4)] rounded-lg border-2 border-orange-500/30"
                initial={{ y: 20 }}
                animate={{ y: 0 }}
              />

              <div className="text-center z-10">
                <h2 className="text-4xl font-black terminal-text text-white tracking-[0.2em] mb-1 italic">
                  {showNewOperator.name.toUpperCase()}
                </h2>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}
