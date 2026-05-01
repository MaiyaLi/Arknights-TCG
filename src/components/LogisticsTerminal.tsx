import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ShoppingBag, 
  Zap, 
  Award, 
  Star,
  Package,
  Users,
  CheckCircle2,
  AlertCircle,
  Eye,
  Shield,
  Sword,
  Box,
  Cpu
} from 'lucide-react';
import { UserProfile } from '../types';
import { OPERATORS, ALL_ASSETS } from '../data/operators';
import { getCardImagePath } from '../utils/assetUtils';

interface LogisticsTerminalProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onBack: () => void;
}

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currencyType: 'orundum' | 'certificates';
  targetId?: string;
  icon?: any;
  image?: string;
  rarity?: number;
  preview?: {
    type: 'GRID' | 'STAT';
    row?: number;
    lane?: number;
    stat?: string;
    value?: string;
  };
}

const ROTATION_SCHEDULE: Record<number, { sixStar: string, fiveStar: string }> = {
  0: { sixStar: 'silverash_001', fiveStar: 'texas_001' },     // Jan
  1: { sixStar: 'hoshiguma_001', fiveStar: 'liskarm_001' },   // Feb
  2: { sixStar: 'exusiai_001', fiveStar: 'platinum_001' },    // Mar
  3: { sixStar: 'eyjafjalla_001', fiveStar: 'amiya_c_001' },  // Apr
  4: { sixStar: 'shining_001', fiveStar: 'warfarin_001' },    // May
  5: { sixStar: 'chen_001', fiveStar: 'lappland_001' },       // Jun
  6: { sixStar: 'mostima_001', fiveStar: 'red_001' },        // Jul
  7: { sixStar: 'surtr_001', fiveStar: 'specter_001' },      // Aug
  8: { sixStar: 'mountain_001', fiveStar: 'zima_001' },       // Sep
  9: { sixStar: 'flametail_001', fiveStar: 'nearl_001' },     // Oct
  10: { sixStar: 'saga_001', fiveStar: 'reed_001' },         // Nov
  11: { sixStar: 'ifrit_001', fiveStar: 'ptilopsis_001' },    // Dec
};

const BATTLE_ITEMS_LIST: ShopItem[] = [
  {
    id: 'item_roadblock',
    name: 'ROADBLOCK',
    description: 'Deployable barrier. Stops movement in slot. High durability.',
    price: 300,
    currencyType: 'certificates',
    type: 'CONSUMABLE',
    category: 'BATTLE_ITEMS',
    targetId: 'item_block_01',
    image: '/Characters/TCG Card/Items/3 Star/Roadblock.png',
    rarity: 3,
    preview: { type: 'GRID', row: 3 }
  },
  {
    id: 'item_mine',
    name: 'ORIGINIUM BOMB',
    description: 'Explosive device. Deals 25 True Damage to neighbors on deploy.',
    price: 400,
    currencyType: 'certificates',
    type: 'CONSUMABLE',
    category: 'BATTLE_ITEMS',
    targetId: 'item_mine_01',
    image: '/Characters/TCG Card/Items/4 Star/Originium Bomb.png',
    rarity: 4,
    preview: { type: 'STAT', stat: 'DAMAGE', value: '25 TRUE' }
  },
  {
    id: 'item_drone',
    name: 'UAV SCOUT',
    description: 'Support Drone. Reduces enemy Armor by 5 in lane.',
    price: 350,
    currencyType: 'certificates',
    type: 'CONSUMABLE',
    category: 'BATTLE_ITEMS',
    targetId: 'item_drone_01',
    image: '/Characters/TCG Card/Items/4 Star/UAV Scout.png',
    rarity: 4,
    preview: { type: 'STAT', stat: 'DEBUFF', value: '-5 DEF' }
  },
  {
    id: 'item_med_station',
    name: 'MEDICAL STATION',
    description: 'Support device. Restores 2 HP/sec to ally in same slot.',
    price: 500,
    currencyType: 'certificates',
    type: 'CONSUMABLE',
    category: 'BATTLE_ITEMS',
    targetId: 'item_med_01',
    image: '/Characters/TCG Card/Items/4 Star/Medical Station.png',
    rarity: 4,
    preview: { type: 'STAT', stat: 'HEAL', value: 'REGEN' }
  }
];

const ROBOTS_LIST: ShopItem[] = [
  {
    id: 'robot_castle',
    name: 'CASTLE-3 (ROBOT)',
    description: 'Support Robot. +10% ATK to all Guards while on board.',
    price: 200,
    currencyType: 'certificates',
    type: 'OPERATOR',
    category: 'ROBOTS',
    targetId: 'support_001',
    image: '/Characters/TCG Card/Robot/3 Star/Castle-3.png',
    rarity: 2,
    preview: { type: 'STAT', stat: 'BUFF', value: 'GUARDS' }
  },
  {
    id: 'robot_lancet',
    name: 'LANCET-2 (ROBOT)',
    description: 'Medical Robot. Heals all allies on deployment.',
    price: 200,
    currencyType: 'certificates',
    type: 'OPERATOR',
    category: 'ROBOTS',
    targetId: 'support_002',
    image: '/Characters/TCG Card/Robot/3 Star/Lancet-2.png',
    rarity: 2,
    preview: { type: 'STAT', stat: 'HEAL', value: 'GLOBAL' }
  }
];

export default function LogisticsTerminal({ userProfile, onUpdateProfile, onBack }: LogisticsTerminalProps) {
  const [feedback, setFeedback] = useState<{ type: 'SUCCESS' | 'ERROR', message: string } | null>(null);
  const [selectedItem, setSelectedItem] = useState<ShopItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<ShopItem['category']>('OPERATORS');

  const currentMonth = new Date().getMonth();
  const rotation = ROTATION_SCHEDULE[currentMonth];

  const getMonthlyOperators = (): ShopItem[] => {
    const sixStarOp = ALL_ASSETS.find(a => a.id === rotation.sixStar);
    const fiveStarOp = ALL_ASSETS.find(a => a.id === rotation.fiveStar);

    const items: ShopItem[] = [];

    if (sixStarOp) {
      items.push({
        id: `op_${sixStarOp.id}`,
        name: `${sixStarOp.name.toUpperCase()} (CONTRACT)`,
        description: `Official recruitment contract for 6-star ${sixStarOp.class} ${sixStarOp.name}.`,
        price: 1500,
        currencyType: 'certificates',
        type: 'OPERATOR',
        category: 'OPERATORS',
        targetId: sixStarOp.id,
        image: getCardImagePath(sixStarOp),
        rarity: 6,
        preview: { type: 'STAT', stat: 'CLASS', value: sixStarOp.class.toUpperCase() }
      });
    }

    if (fiveStarOp) {
      items.push({
        id: `op_${fiveStarOp.id}`,
        name: `${fiveStarOp.name.toUpperCase()} (CONTRACT)`,
        description: `Official recruitment contract for 5-star ${fiveStarOp.class} ${fiveStarOp.name}.`,
        price: 800,
        currencyType: 'certificates',
        type: 'OPERATOR',
        category: 'OPERATORS',
        targetId: fiveStarOp.id,
        image: getCardImagePath(fiveStarOp),
        rarity: 5,
        preview: { type: 'STAT', stat: 'CLASS', value: fiveStarOp.class.toUpperCase() }
      });
    }

    return items;
  };

  const shopItems: ShopItem[] = [
    ...getMonthlyOperators(),
    ...BATTLE_ITEMS_LIST,
    ...ROBOTS_LIST
  ];

  const buyItem = (item: ShopItem) => {
    const currency = item.currencyType === 'orundum' ? userProfile.currentCurrency.orundum : userProfile.currentCurrency.certificates;
    
    if (currency < item.price) {
      setFeedback({ type: 'ERROR', message: 'INSUFFICIENT FUNDS' });
      setTimeout(() => setFeedback(null), 2000);
      return;
    }

    const newProfile = { 
      ...userProfile,
      currentCurrency: { ...userProfile.currentCurrency },
      collection: [...userProfile.collection],
      unlockedSkills: [...userProfile.unlockedSkills]
    };
    
    if (item.currencyType === 'orundum') {
      newProfile.currentCurrency.orundum -= item.price;
    } else {
      newProfile.currentCurrency.certificates -= item.price;
    }

    if (item.type === 'OPERATOR' && item.targetId) {
      if (newProfile.collection.includes(item.targetId)) {
        setFeedback({ type: 'ERROR', message: 'ALREADY OWNED' });
        setTimeout(() => setFeedback(null), 2000);
        return;
      }
      newProfile.collection.push(item.targetId);
    } else if (item.type === 'SKILL_UNLOCK' && item.targetId) {
      if (newProfile.unlockedSkills.includes(item.targetId)) {
        setFeedback({ type: 'ERROR', message: 'ALREADY UNLOCKED' });
        setTimeout(() => setFeedback(null), 2000);
        return;
      }
      newProfile.unlockedSkills.push(item.targetId);
    } else if (item.type === 'CONSUMABLE' && item.targetId) {
      if (!newProfile.collection.includes(item.targetId)) {
        newProfile.collection.push(item.targetId);
      }
    }

    onUpdateProfile(newProfile);
    setFeedback({ type: 'SUCCESS', message: 'PURCHASE SUCCESSFUL' });
    setTimeout(() => setFeedback(null), 2000);
  };

  const filteredItems = shopItems.filter(item => item.category === activeCategory);

  const categories: { id: ShopItem['category'], label: string }[] = [
    { id: 'OPERATORS', label: 'Operator Contracts' },
    { id: 'BATTLE_ITEMS', label: 'Battle Items' },
    { id: 'ROBOTS', label: 'Support Robots' },
  ];

  return (
    <div className="flex flex-col h-full bg-rhodes-dark relative overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-rhodes-border flex justify-between items-center bg-black/60 backdrop-blur-md z-10">
        <button onClick={onBack} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="terminal-text text-[10px] font-bold">RETURN</span>
        </button>
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-rhodes-blue" />
          <span className="terminal-text text-[10px] font-bold uppercase tracking-widest">Logistics Terminal</span>
        </div>
      </div>

      {/* Currency & Tabs */}
      <div className="shrink-0 bg-black/40 border-b border-rhodes-border">
        <div className="p-6 flex justify-between items-end">
          <div className="space-y-1">
            <p className="text-[8px] terminal-text text-white/30 uppercase tracking-[0.2em]">Current Assets</p>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-rhodes-blue" />
                <span className="text-2xl font-bold terminal-text tracking-tighter text-white">
                  {userProfile.currentCurrency.certificates}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                <span className="text-2xl font-bold terminal-text tracking-tighter text-white">
                  {userProfile.currentCurrency.orundum}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[8px] terminal-text text-rhodes-blue font-bold">AUTHORIZED ACCESS</p>
            <p className="text-[6px] terminal-text text-white/20">ID: {userProfile.uid.slice(0, 8)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-rhodes-border/30 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-1 min-w-[100px] py-3 terminal-text text-[9px] font-bold transition-all relative shrink-0 ${
                activeCategory === cat.id ? 'text-rhodes-blue bg-rhodes-blue/5' : 'text-white/40 hover:text-white/60'
              }`}
            >
              {cat.label.toUpperCase()}
              {activeCategory === cat.id && <motion.div layoutId="tab-active" className="absolute bottom-0 left-0 right-0 h-0.5 bg-rhodes-blue" />}
            </button>
          ))}
        </div>
      </div>

      {/* Shop List */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="grid grid-cols-2 gap-3">
          {filteredItems.map(item => {
            const isOwned = (item.type === 'OPERATOR' && item.targetId && userProfile.collection.includes(item.targetId)) ||
                            (item.type === 'SKILL_UNLOCK' && item.targetId && userProfile.unlockedSkills.includes(item.targetId));
            
            const canAfford = (item.currencyType === 'orundum' ? userProfile.currentCurrency.orundum : userProfile.currentCurrency.certificates) >= item.price;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -2 }}
                onClick={() => setSelectedItem(item)}
                className={`group relative aspect-[4/5] overflow-hidden border rounded-lg transition-all cursor-pointer flex flex-col ${
                  isOwned 
                    ? 'border-white/5 bg-white/5 opacity-40' 
                    : 'border-rhodes-border bg-black/40 hover:border-rhodes-blue/50'
                }`}
              >
                {/* Rarity Stripe */}
                <div className={`absolute left-0 top-0 right-0 h-1 ${
                  item.rarity === 6 ? 'bg-orange-500' : 
                  item.rarity === 5 ? 'bg-yellow-400' : 
                  item.rarity === 4 ? 'bg-purple-500' : 'bg-rhodes-blue'
                }`} />

                {/* Item Icon Container */}
                <div className="flex-1 flex items-center justify-center relative p-1 overflow-hidden">
                  {item.image ? (
                    <img 
                      src={item.image} 
                      alt={item.name} 
                      className="w-full h-full object-contain transition-transform group-hover:scale-105" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className={`w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 transition-transform group-hover:scale-110 ${isOwned ? '' : 'group-hover:border-rhodes-blue/30'}`}>
                      {item.icon && <item.icon className={`w-8 h-8 ${isOwned ? 'text-white/20' : item.currencyType === 'orundum' ? 'text-orange-500' : 'text-rhodes-blue'}`} />}
                    </div>
                  )}
                  
                  {/* Rarity Stars (only if no image) */}
                  {!item.image && item.rarity && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {Array.from({ length: item.rarity }).map((_, i) => (
                        <Star key={i} className="w-1.5 h-1.5 fill-current text-yellow-500/60" />
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Item Info */}
                <div className="p-2 bg-black/60 border-t border-rhodes-border/50">
                  <h4 className="text-[9px] font-bold terminal-text text-white truncate text-center mb-1">{item.name}</h4>
                  
                  <div className="flex items-center justify-center gap-1">
                    {isOwned ? (
                      <span className="text-[7px] font-bold terminal-text text-rhodes-blue/60">ACQUIRED</span>
                    ) : (
                      <>
                        {item.currencyType === 'orundum' ? <Zap className="w-2.5 h-2.5 text-orange-500" /> : <Award className="w-2.5 h-2.5 text-rhodes-blue" />}
                        <span className={`text-[10px] font-bold terminal-text ${canAfford ? 'text-white' : 'text-red-500'}`}>{item.price}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Sold Out Overlay */}
                {isOwned && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="border-2 border-rhodes-blue/40 px-2 py-1 rotate-[-15deg]">
                      <span className="text-[10px] font-bold terminal-text text-rhodes-blue/60">SOLD OUT</span>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Feedback Overlay */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-xs bg-rhodes-dark border border-rhodes-border rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-rhodes-border flex justify-between items-center">
                <span className="terminal-text text-[10px] font-bold text-rhodes-blue">TACTICAL PREVIEW</span>
                <button onClick={() => setSelectedItem(null)} className="text-white/40 hover:text-white">
                  <ChevronLeft className="w-4 h-4 rotate-180" />
                </button>
              </div>

              <div className="p-6 flex flex-col items-center gap-6">
                {selectedItem.image ? (
                  <div className="w-full aspect-[3/4] relative">
                    <img 
                      src={selectedItem.image} 
                      alt={selectedItem.name} 
                      className="w-full h-full object-contain rounded shadow-lg"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : selectedItem.preview?.type === 'GRID' ? (
                  <div className="w-full aspect-square bg-black/40 border border-white/5 rounded p-2 grid grid-rows-7 gap-1">
                    {Array.from({ length: 7 }).map((_, r) => (
                      <div key={r} className={`border border-white/5 flex items-center justify-center ${r === selectedItem.preview?.row ? 'bg-rhodes-blue/20 border-rhodes-blue/40' : ''}`}>
                        {r === selectedItem.preview?.row && <Box className="w-4 h-4 text-rhodes-blue" />}
                        <span className="text-[6px] terminal-text text-white/10 absolute left-8">ROW {r}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full space-y-4">
                    <div className="flex items-center gap-4 bg-white/5 p-4 rounded border border-white/10">
                      <div className="w-10 h-10 bg-rhodes-blue/20 rounded flex items-center justify-center">
                        <Zap className="w-6 h-6 text-rhodes-blue" />
                      </div>
                      <div>
                        <p className="text-[8px] terminal-text text-white/40 uppercase">{selectedItem.preview?.stat || 'EFFECT'}</p>
                        <p className="text-sm font-bold terminal-text text-rhodes-blue">{selectedItem.preview?.value || 'ACTIVE'}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-center">
                  <h3 className="terminal-text text-sm font-bold mb-1">{selectedItem.name}</h3>
                  <p className="terminal-text text-[8px] text-white/40 leading-relaxed">{selectedItem.description}</p>
                </div>

                <button
                  onClick={() => {
                    buyItem(selectedItem);
                    setSelectedItem(null);
                  }}
                  disabled={(selectedItem.type === 'OPERATOR' && selectedItem.targetId && userProfile.collection.includes(selectedItem.targetId)) ||
                            (selectedItem.type === 'SKILL_UNLOCK' && selectedItem.targetId && userProfile.unlockedSkills.includes(selectedItem.targetId))}
                  className="rhodes-button glow-blue w-full py-3 flex items-center justify-center gap-2"
                >
                  {selectedItem.currencyType === 'orundum' ? <Zap className="w-4 h-4 text-orange-500" /> : <Award className="w-4 h-4 text-rhodes-blue" />}
                  <span className="terminal-text font-bold">EXCHANGE ({selectedItem.price})</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full border shadow-2xl z-[100] flex items-center gap-3 ${
              feedback.type === 'SUCCESS' 
                ? 'bg-green-500/90 border-green-400 text-white shadow-green-500/20' 
                : 'bg-red-500/90 border-red-400 text-white shadow-red-500/20 animate-shake'
            }`}
          >
            {feedback.type === 'SUCCESS' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="terminal-text font-bold text-xs tracking-widest">{feedback.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shake {
          0%, 100% { transform: translateX(-50%); }
          25% { transform: translateX(-55%); }
          75% { transform: translateX(-45%); }
        }
        .animate-shake {
          animation: shake 0.2s ease-in-out infinite;
        }
      `}} />
    </div>
  );
}
