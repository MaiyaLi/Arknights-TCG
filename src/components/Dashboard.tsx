import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Zap, 
  Award, 
  LogOut, 
  Swords, 
  Cpu, 
  Users, 
  Search,
  ChevronRight,
  Lock,
  ShoppingBag,
  RefreshCcw,
  Star
} from 'lucide-react';
import { UserProfile } from '../types';
import { ALL_ASSETS } from '../data/operators';
import { getCardImagePath } from '../utils/assetUtils';

interface DashboardProps {
  userProfile: UserProfile;
  onLogout: () => void;
  onStartTutorial: () => void;
  onUpdateProfile: (p: UserProfile) => void;
  onLinkGoogle: () => void;
  onOpenMissions: () => void;
}

export default function Dashboard({ userProfile, onLogout, onStartTutorial, onUpdateProfile, onLinkGoogle, onOpenMissions }: DashboardProps) {
  const [showSelector, setShowSelector] = React.useState(false);
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [newName, setNewName] = React.useState(userProfile.displayName || '');
  const isTutorialPending = !userProfile.hasCompletedTutorial;

  const handleUpdateName = () => {
    if (newName.trim() && newName !== userProfile.displayName) {
      onUpdateProfile({
        ...userProfile,
        displayName: newName.trim()
      });
    }
    setIsEditingName(false);
  };

  // Resolve Assistant
  const activeSquad = userProfile.squads[userProfile.activeSquadIndex];
  const firstMatch = activeSquad.length > 0 ? activeSquad[0] : (userProfile.collection.length > 0 ? userProfile.collection[0] : 'melantha_001');
  const assistantId = (userProfile as any).assistantId || firstMatch;
  const assistant = ALL_ASSETS.find(a => a.id === assistantId) || ALL_ASSETS.find(a => a.id === 'melantha_001')!;

  const handleSelectAssistant = (id: string) => {
    onUpdateProfile({
      ...userProfile,
      assistantId: id
    } as any);
    setShowSelector(false);
  };

  return (
    <div className="p-6 space-y-6 relative z-10 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex justify-between items-center border-b border-rhodes-blue/30 pb-4 shrink-0 bg-black/20 backdrop-blur-sm -mx-6 px-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-black border border-rhodes-blue flex items-center justify-center rounded-sm overflow-hidden">
              <img 
                src={getCardImagePath(assistant)} 
                alt="Doctor" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-rhodes-blue text-[8px] px-1 rounded-sm terminal-text font-black text-black">
              LV.{userProfile.level}
            </div>
          </div>
          <div className="space-y-0.5 group">
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <input
                  autoFocus
                  className="bg-white/5 border border-rhodes-blue/30 text-[10px] terminal-text text-white px-2 py-0.5 outline-none w-32"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.toUpperCase())}
                  onBlur={() => handleUpdateName()}
                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateName()}
                />
              ) : (
                <h1 
                  onClick={() => setIsEditingName(true)}
                  className="text-[10px] font-black terminal-text truncate max-w-[120px] tracking-tighter uppercase text-white/90 cursor-pointer hover:text-rhodes-blue transition-colors flex items-center gap-1"
                >
                  {userProfile.displayName || 'Doctor'}
                  <RefreshCcw className="w-2 h-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h1>
              )}
            </div>
            <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
               <div 
                 className="h-full bg-rhodes-blue transition-all duration-1000 shadow-[0_0_5px_rgba(0,186,255,0.5)]" 
                 style={{ width: `${Math.min(100, (userProfile.exp / (userProfile.level * 100)) * 100)}%` }} 
               />
            </div>
            <p className="text-[7px] text-white/30 terminal-text font-bold uppercase">
              RANK: <span className="text-rhodes-blue">
                {userProfile.level < 5 ? 'Cadet' : userProfile.level < 15 ? 'Junior' : userProfile.level < 30 ? 'Senior' : 'Elite'}
              </span>
            </p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-orange-500" />
              <motion.span 
                key={userProfile.currentCurrency.orundum}
                initial={{ scale: 1.5, color: '#f97316' }}
                animate={{ scale: 1, color: '#ffffff' }}
                className="terminal-text font-black text-[10px] text-white"
              >
                {userProfile.currentCurrency.orundum}
              </motion.span>
            </div>
            <p className="text-[6px] text-white/20 terminal-text uppercase font-black">Orundum</p>
          </div>
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-1">
              <Award className="w-2.5 h-2.5 text-rhodes-blue" />
              <motion.span 
                key={userProfile.currentCurrency.certificates}
                initial={{ scale: 1.5, color: '#00baff' }}
                animate={{ scale: 1, color: '#ffffff' }}
                className="terminal-text font-black text-[10px] text-white"
              >
                {userProfile.currentCurrency.certificates}
              </motion.span>
            </div>
            <p className="text-[6px] text-white/20 terminal-text uppercase font-black">Certificates</p>
          </div>
          
          <button 
            onClick={onOpenMissions}
            className="bg-rhodes-blue/10 border border-rhodes-blue/30 px-2 py-1 rounded-sm flex items-center gap-1 hover:bg-rhodes-blue/20 transition-all group relative"
          >
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-75" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            <Shield className="w-2.5 h-2.5 text-rhodes-blue" />
            <span className="text-[6px] terminal-text font-black text-rhodes-blue">MISSIONS</span>
          </button>

          {userProfile.loginType === 'guest' && (
            <button 
              onClick={onLinkGoogle}
              className="bg-white/5 border border-white/10 px-2 py-1 rounded-sm flex items-center gap-1 hover:bg-white/10 transition-all group"
            >
              <RefreshCcw className="w-2.5 h-2.5 text-rhodes-blue group-hover:rotate-180 transition-transform duration-500" />
              <span className="text-[6px] terminal-text font-black text-white/60 group-hover:text-white">LINK GMAIL</span>
            </button>
          )}

          <button 
            onClick={onLogout}
            className="p-1.5 hover:bg-white/5 rounded-full transition-colors ml-1 text-white/30 hover:text-white"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Visual - Assistant Card */}
      <div className="flex-1 relative flex items-center justify-center min-h-[350px]">
        {/* Background Visual Depth */}
        <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none scale-150 blur-3xl">
           <img src={getCardImagePath(assistant)} alt="" className="w-full h-full object-contain" />
        </div>

        <motion.div
          key={assistantId}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="relative w-full h-full flex items-center justify-center pointer-events-none"
        >
          <img 
            src={getCardImagePath(assistant)} 
            alt={assistant.name} 
            className="h-[92%] object-contain drop-shadow-[0_0_40px_rgba(0,186,255,0.15)]"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        
        {/* Cleaner Tactical Info HUD - Anchored at the very bottom */}
        <div className="absolute bottom-4 left-0 right-0 px-6 pointer-events-none z-20">
          <div className="bg-black/60 backdrop-blur-md border border-white/5 p-4 flex justify-between items-center rounded-sm">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[6px] text-rhodes-blue terminal-text font-black tracking-[0.4em] uppercase opacity-80">Sync Identity</span>
                <button 
                  onClick={() => setShowSelector(true)}
                  className="p-1 hover:bg-white/10 rounded-sm transition-all pointer-events-auto active:scale-95"
                >
                  <RefreshCcw className="w-2 h-2 text-white/30" />
                </button>
              </div>
              <h2 className="text-2xl font-black terminal-text tracking-tighter text-white uppercase leading-none">
                {assistant.name}
              </h2>
            </div>
            <div className="flex flex-col items-end gap-1">
               <div className="flex gap-0.5">
                  {Array.from({ length: assistant.rarity }).map((_, i) => (
                    <Star key={i} className="w-2 h-2 text-orange-500 fill-orange-500" />
                  ))}
               </div>
               <p className="text-[7px] terminal-text font-black text-rhodes-blue border border-rhodes-blue/30 px-2 py-0.5 rounded-sm uppercase tracking-widest leading-none bg-rhodes-blue/5">
                  {assistant.class}
               </p>
            </div>
          </div>
        </div>

        {isTutorialPending && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute bottom-4 right-4 flex flex-col items-end gap-2"
          >
            <div className="bg-orange-500/10 border border-orange-500/50 px-2 py-1 rounded text-[7px] text-orange-500 terminal-text font-bold animate-pulse">
              REWARD: 5x STARTER RECRUITS (★★★)
            </div>
            <button
              onClick={onStartTutorial}
              className="rhodes-button glow-blue py-3 px-6 flex items-center gap-2 group"
            >
              <Zap className="w-4 h-4 text-orange-500 group-hover:animate-bounce" />
              <span className="text-[10px] font-black">BEGIN TACTICAL BRIEFING</span>
            </button>
          </motion.div>
        )}
      </div>

      {/* Assistant Selector Modal */}
      <AnimatePresence>
        {showSelector && (
          <div className="absolute inset-0 z-[100] flex flex-col bg-black/90 backdrop-blur-md p-6">
            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
              <div>
                <h3 className="terminal-text text-sm font-black text-white italic tracking-tighter uppercase">Assign Assistant</h3>
                <p className="text-[8px] text-white/30 uppercase tracking-widest">Operator Personnel Synchronization</p>
              </div>
              <button onClick={() => setShowSelector(false)} className="p-2 text-white/40 hover:text-white transition-colors">
                <ChevronRight className="rotate-180 w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-3 content-start pb-20">
              {userProfile.collection.map(id => {
                const op = ALL_ASSETS.find(a => a.id === id);
                if (!op) return null;
                const isSelected = assistantId === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleSelectAssistant(id)}
                    className={`aspect-[3/4] relative rounded-sm overflow-hidden border transition-all ${
                      isSelected ? 'border-rhodes-blue ring-1 ring-rhodes-blue scale-95 shadow-[0_0_15px_rgba(0,186,255,0.3)]' : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <img src={getCardImagePath(op)} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    {isSelected && (
                      <div className="absolute inset-0 bg-rhodes-blue/20 flex items-center justify-center">
                         <div className="bg-rhodes-blue text-black text-[6px] font-black px-1 uppercase py-0.5">ACTIVE</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <footer className="border-t border-rhodes-blue/20 pt-4 flex justify-between items-center shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_5px_rgba(34,197,94,0.5)] ${(window as any).LAST_SYNC_ERROR ? 'bg-red-500 shadow-[0_0_5px_#ef4444]' : 'bg-green-500 shadow-[0_0_5px_#22c55e]'}`} />
            <span className="text-[8px] text-white/40 terminal-text font-bold uppercase">
              {(window as any).LAST_SYNC_ERROR ? 'SYNC ERROR: CONNECTION INTERRUPTED' : 'CLOUD SYNC: OPERATIONAL'}
            </span>
          </div>
          {(window as any).LAST_SYNC_ERROR && (
            <button 
              onClick={() => {
                // Trigger a dummy update to force sync
                onUpdateProfile({ ...userProfile });
                alert("Neural Link: Manual synchronization initiated...");
              }}
              className="text-[6px] text-rhodes-blue terminal-text hover:underline text-left font-black"
            >
              [ FORCE MANUAL SYNC ]
            </button>
          )}
        </div>
        <span className="text-[8px] text-white/30 terminal-text font-bold uppercase">RHODES ISLAND TERMINAL v1.0.7</span>
      </footer>
    </div>
  );
}
