import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  MessageSquare, 
  Heart, 
  Star, 
  Sparkles,
  Zap,
  Coffee,
  Ghost,
  Flame,
  Shield,
  Search,
  Send,
  Loader2,
  Users
} from 'lucide-react';
import { UserProfile } from '../types';
import { ALL_ASSETS } from '../data/operators';
import { getCardImagePath } from '../utils/assetUtils';
import { getGeminiResponse } from '../lib/gemini';

interface OperatorHubProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onBack: () => void;
}

interface PersonalityModule {
  name: string;
  id: string;
  details: string;
}

const OPERATOR_PERSONALITIES: Record<string, PersonalityModule> = {
  'flametail_001': {
    name: 'Flametail',
    id: 'flametail_001',
    details: 'The Energetic Knight: Bouncy, optimistic, and casual. She treats the player like a squad-mate. She often mentions the "Red Pine Knights" and staying fast.',
  },
  'saga_001': {
    name: 'Saga',
    id: 'saga_001',
    details: 'The Shiba Inu Monk: Vibrant and loud. Constantly shouts "NATTO GOHAN!" Treats life as a spiritual journey. She is very hungry and treats the player like a traveling companion.',
  },
  'exusiai_001': {
    name: 'Exusiai',
    id: 'exusiai_001',
    details: 'The Hype-Girl: High-energy, loves Apple Pie and Penguin Logistics. She uses modern slang and treats the player like a best friend she’s grabbing a snack with.',
  },
  'aak_001': {
    name: 'Aak',
    id: 'aak_001',
    details: 'The Chaos Doctor: Sarcastic, mocking, and suspicious. He treats the player like a "fascinating test subject" and jokes about unethical medical experiments.',
  },
  'mostima_001': {
    name: 'Mostima',
    id: 'mostima_001',
    details: 'The Timeless Wanderer: Detached, mysterious, and very relaxed. She speaks cryptically about time and travel. She feels like she’s always about to leave for somewhere else.',
  },
  'ifrit_001': {
    name: 'Ifrit',
    id: 'ifrit_001',
    details: 'The Firebrand: Aggressive, loud, and impatient. She hates standing still and wants to burn things. She treats the player like a "big sibling" she’s trying to impress.',
  },
  'eyjafjalla_001': {
    name: 'Eyjafjalla',
    id: 'eyjafjalla_001',
    details: 'The Gentle Scholar: Polite, soft-spoken, and scholarly. Due to her hearing loss, she is very attentive and calls the player "Senpai." She loves talking about volcanoes.',
  },
  'silverash_001': {
    name: 'SilverAsh',
    id: 'silverash_001',
    details: 'The Kjerag Warlord: A sophisticated CEO. He is formal, cold, and strategic. He treats the player as a business partner and discusses "investments" and "power."',
  },
  'mountain_001': {
    name: 'Mountain',
    id: 'mountain_001',
    details: 'The Gentleman Brawler: Deeply polite and refined. He speaks like a philosopher and enjoys tea and literature. He is calm but carries a sense of hidden strength.',
  },
  'surtr_001': {
    name: 'Surtr',
    id: 'surtr_001',
    details: 'The Dismissive Queen: Arrogant and easily bored. She only cares about ice cream and strength. She is blunt and will tell the player to stop talking if they aren\'t interesting.',
  },
  'chen_001': {
    name: 'Ch\'en',
    id: 'chen_001',
    details: 'The Disciplined Officer: Strict, professional, and serious. She treats the chat like a formal report and constantly checks if the player is "slacking off" from training.',
  },
  'shining_001': {
    name: 'Shining',
    id: 'shining_001',
    details: 'The Confessor: Serene, quiet, and deeply empathetic. She speaks in metaphors about light and shadow. She offers the player profound emotional support.',
  },
  'hoshiguma_001': {
    name: 'Hoshiguma',
    id: 'hoshiguma_001',
    details: 'The Reliable Big Sis: Down-to-earth and tough. She loves a good laugh and talks about city life and drinking. She is the most "grounded" and easy to talk to.',
  }
};

interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export default function OperatorHub({ userProfile, onUpdateProfile, onBack }: OperatorHubProps) {
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const messages = useMemo(() => userProfile.chatHistory || {}, [userProfile.chatHistory]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownedSpecialOperators = useMemo(() => {
    return ALL_ASSETS
      .filter(op => userProfile.collection.includes(op.id) && !!OPERATOR_PERSONALITIES[op.id]);
  }, [userProfile.collection]);

  const currentMessages = selectedOpId ? messages[selectedOpId] || [] : [];

  const handleSelectOperator = (id: string) => {
    setSelectedOpId(id);
    setError(null);
    if (!messages[id]) {
      // Initial greeting can be generated or just left empty until the user speaks
      // For now, let's just keep it empty or add a simple greeting placeholder
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !selectedOpId || isTyping) return;

    const personality = OPERATOR_PERSONALITIES[selectedOpId];
    const affinity = userProfile.affinity?.[selectedOpId] || 0;
    const lastMatch = userProfile.lastMatchResult;
    
    const newUserMessage: Message = { role: 'user', parts: [{ text: userInput }] };
    const updatedMessages = [...currentMessages, newUserMessage];
    
    // Immediate local update via profile
    const midProfile = { 
      ...userProfile, 
      chatHistory: { ...messages, [selectedOpId]: updatedMessages } 
    };
    onUpdateProfile(midProfile);

    setUserInput('');
    setIsTyping(true);
    setError(null);

    const systemInstruction = `
Role: You are ${personality.name}, a 6-star character from Arknights. You are currently stationed in the TCG Hub next to the Shop.
Personality Details: ${personality.details}
Context: You are chatting with the player (The Doctor/Player) outside of matches. You are only accessible because the player owns your card.
User Data: { Affinity: ${affinity}%, Recent_Match: ${lastMatch || 'None'} }
Learning Protocol: 
- If Affinity is low, be professional/distant. 
- If Affinity is high, be personal, share secrets, or use nicknames. 
- If Recent_Match was a 'Loss', offer encouragement or critique based on your personality.
Constraints: 
- Keep responses to 2-3 sentences. 
- Never mention being an AI. 
- Use specific lore references related to ${personality.name}.
- Keep the tone consistent with your Arknights character.
    `.trim();

    try {
      const responseText = await getGeminiResponse(systemInstruction, updatedMessages);
      const newModelMessage: Message = { role: 'model', parts: [{ text: responseText }] };
      const finalMessages = [...updatedMessages, newModelMessage];
      
      // Update profile with both new message and affinity
      const newProfile = { ...userProfile };
      if (!newProfile.affinity) newProfile.affinity = {};
      if (!newProfile.chatHistory) newProfile.chatHistory = {};
      
      newProfile.chatHistory = { ...messages, [selectedOpId]: finalMessages };
      newProfile.affinity[selectedOpId] = Math.min(100, (newProfile.affinity[selectedOpId] || 0) + 1);
      
      // Update Mission
      if (!newProfile.missions) newProfile.missions = {};
      if (!newProfile.missions['chat_op']) newProfile.missions['chat_op'] = { progress: 0, claimed: false };
      if (!newProfile.missions['chat_op'].claimed) {
        newProfile.missions['chat_op'].progress = Math.min(1, newProfile.missions['chat_op'].progress + 1);
      }

      onUpdateProfile(newProfile);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to establish neural connection.");
    } finally {
      setIsTyping(false);
    }
  };

  const selectedOp = useMemo(() => 
    selectedOpId ? ALL_ASSETS.find(a => a.id === selectedOpId) : null
  , [selectedOpId]);

  return (
    <div className="flex flex-col h-full bg-rhodes-dark relative overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-rhodes-border flex justify-between items-center bg-black/60 backdrop-blur-md z-10">
        <button onClick={onBack} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="terminal-text text-[10px] font-bold">RETURN</span>
        </button>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-rhodes-blue" />
          <span className="terminal-text text-[10px] font-bold uppercase tracking-widest">Operator Hub</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Operator List */}
        <div className="w-24 border-r border-rhodes-border bg-black/20 overflow-y-auto no-scrollbar">
          {ownedSpecialOperators.length > 0 ? (
            ownedSpecialOperators.map(op => (
              <button
                key={op.id}
                onClick={() => handleSelectOperator(op.id)}
                className={`w-full aspect-square border-b border-rhodes-border/30 relative group transition-all ${
                  selectedOpId === op.id ? 'bg-rhodes-blue/10' : 'hover:bg-white/5'
                }`}
              >
                <img 
                  src={getCardImagePath(op)} 
                  className={`w-full h-full object-cover transition-all ${selectedOpId === op.id ? 'grayscale-0' : 'grayscale opacity-60 group-hover:opacity-100 group-hover:grayscale-0'}`} 
                  referrerPolicy="no-referrer"
                />
                {selectedOpId === op.id && (
                  <motion.div layoutId="op-indicator" className="absolute left-0 top-0 bottom-0 w-1 bg-rhodes-blue" />
                )}
                <div className="absolute bottom-0 right-0 p-0.5">
                   <div className="flex gap-0.5">
                      {Array.from({ length: op.rarity }).map((_, i) => (
                        <div key={i} className="w-1 h-1 bg-orange-500 rounded-full" />
                      ))}
                   </div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-center">
              <p className="text-[8px] terminal-text text-white/20 uppercase font-bold">No 6★ Operators Synchronized</p>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 relative flex flex-col bg-black/40">
          <AnimatePresence mode="wait">
            {selectedOp ? (
              <motion.div 
                key={selectedOp.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 flex flex-col p-4"
              >
                {/* Character Banner */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-black terminal-text text-white tracking-tighter uppercase leading-none">
                      {selectedOp.name}
                    </h2>
                    <p className="text-[7px] terminal-text text-rhodes-blue font-bold tracking-[0.2em] uppercase mt-0.5">
                      {selectedOp.class} // {OPERATOR_PERSONALITIES[selectedOp.id].details.split(':')[0]}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 bg-rhodes-blue/10 border border-rhodes-blue/30 px-2 py-0.5 rounded-full">
                       <Heart className={`w-2 h-2 ${userProfile.affinity?.[selectedOp.id] > 50 ? 'text-red-500 fill-red-500' : 'text-rhodes-blue'}`} />
                       <span className="terminal-text text-[8px] font-black text-white">{userProfile.affinity?.[selectedOp.id] || 0}%</span>
                    </div>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2 custom-scrollbar">
                  {currentMessages.length === 0 && !isTyping && (
                    <div className="h-full flex items-center justify-center text-center opacity-20 px-8">
                       <p className="text-[8px] terminal-text uppercase tracking-widest leading-loose">
                         Establish neural sync by sending a message to {selectedOp.name}.
                       </p>
                    </div>
                  )}
                  {currentMessages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] p-3 rounded-lg text-[10px] terminal-text leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-rhodes-blue/20 border border-rhodes-blue/30 text-white' 
                          : 'bg-white/5 border border-white/10 text-white/90'
                      }`}>
                        {msg.parts[0].text}
                      </div>
                    </motion.div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 p-3 rounded-lg">
                        <div className="flex gap-1.5">
                           <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-rhodes-blue rounded-full" />
                           <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-rhodes-blue rounded-full" />
                           <motion.div animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-rhodes-blue rounded-full" />
                        </div>
                      </div>
                    </div>
                  )}
                  {error && (
                    <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-[8px] text-red-500 terminal-text text-center">
                      ERROR: {error}
                    </div>
                  )}
                </div>

                {/* Interaction Footer */}
                <div className="flex gap-2">
                   <input 
                     type="text"
                     value={userInput}
                     onChange={(e) => setUserInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                     placeholder="Type message..."
                     className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-[10px] terminal-text text-white focus:outline-none focus:border-rhodes-blue/50 transition-all"
                   />

                   <button 
                     onClick={handleSendMessage}
                     disabled={!userInput.trim() || isTyping}
                     className={`p-2 rounded flex items-center justify-center transition-all ${
                       !userInput.trim() || isTyping ? 'bg-white/5 text-white/20' : 'bg-rhodes-blue text-black hover:bg-white'
                     }`}
                   >
                     {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                   </button>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
                <div className="w-20 h-20 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center mb-6">
                   <Users className="w-10 h-10 text-white/20" />
                </div>
                <h3 className="terminal-text text-sm font-black text-white uppercase mb-2">Select an Operator</h3>
                <p className="text-[8px] terminal-text text-white/30 uppercase tracking-widest leading-loose">
                  Select a high-rarity operator from the sidebar to establish a neural connection and begin synchronization.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Background Decor */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-white/5 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/5 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-white/5 rounded-full pointer-events-none animate-pulse" />
    </div>
  );
}
