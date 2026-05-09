import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  Search, 
  Filter, 
  Star, 
  Shield, 
  Zap, 
  Award, 
  Users, 
  Cpu, 
  Briefcase,
  X,
  Plus,
  Minus,
  Info,
  Wand2,
  Lock
} from 'lucide-react';
import { UserProfile } from '../types';
import { ALL_ASSETS, OPERATORS, BATTLE_ITEMS, SUPPORT_ROBOTS, Operator } from '../data/operators';
import { getCardImagePath } from '../utils/assetUtils';

interface PersonnelScreenProps {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
  onBack: () => void;
}

type AssetType = 'OPERATOR' | 'ROBOT' | 'ITEM';

export default function PersonnelScreen({ userProfile, onUpdateProfile, onBack }: PersonnelScreenProps) {
  const [activeTab, setActiveTab] = useState<AssetType>('OPERATOR');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Operator | null>(null);
  const [sortBy, setSortBy] = useState<'RARITY' | 'DP'>('RARITY');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [showAll, setShowAll] = useState(true);
  const [showSquad, setShowSquad] = useState(true);

  const classes = ['ALL', 'Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Specialist'];

  // Filtered and Sorted Assets
  const filteredAssets = useMemo(() => {
    let assets: Operator[] = [];
    if (activeTab === 'OPERATOR') assets = [...OPERATORS];
    else if (activeTab === 'ROBOT') assets = [...SUPPORT_ROBOTS];
    else if (activeTab === 'ITEM') assets = [...BATTLE_ITEMS];

    // Filter by ownership if not showing all
    if (!showAll) {
      assets = assets.filter(asset => userProfile.collection.includes(asset.id));
    }

    // Class filter (only for Operators)
    if (activeTab === 'OPERATOR' && classFilter !== 'ALL') {
      assets = assets.filter(asset => asset.class === classFilter);
    }

    // Search filter
    if (searchQuery) {
      assets = assets.filter(asset => 
        asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        asset.class.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    assets.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'RARITY') comparison = b.rarity - a.rarity;
      else if (sortBy === 'DP') comparison = b.dp_cost - a.dp_cost;

      return sortOrder === 'DESC' ? comparison : -comparison;
    });

    return assets;
  }, [activeTab, searchQuery, sortBy, sortOrder, classFilter, userProfile.collection, showAll]);

  // Grouped Assets for "ALL" class view
  const groupedAssets = useMemo<Record<string, Operator[]> | null>(() => {
    if (activeTab !== 'OPERATOR' || classFilter !== 'ALL') return null;
    
    const groups: Record<string, Operator[]> = {};
    filteredAssets.forEach(asset => {
      if (!groups[asset.class]) groups[asset.class] = [];
      groups[asset.class].push(asset);
    });
    return groups;
  }, [filteredAssets, activeTab, classFilter]);

  // Squad Logic
  const activeSquad = useMemo(() => {
    return userProfile.squads[userProfile.activeSquadIndex].map(id => ALL_ASSETS.find(a => a.id === id)).filter(Boolean) as Operator[];
  }, [userProfile.squads, userProfile.activeSquadIndex]);

  const averageDP = useMemo(() => {
    if (activeSquad.length === 0) return 0;
    const total = activeSquad.reduce((sum, op) => sum + op.dp_cost, 0);
    return (total / activeSquad.length).toFixed(1);
  }, [activeSquad]);

  const handleAddToSquad = (asset: Operator) => {
    const currentSquad = userProfile.squads[userProfile.activeSquadIndex];
    if (currentSquad.includes(asset.id)) return;

    const isItem = asset.class === 'Item';
    const currentItems = activeSquad.filter(a => a.class === 'Item');

    if (isItem && currentItems.length >= 1) {
      alert("Maximum 1 Battle Item allowed in squad.");
      return;
    }

    if (currentSquad.length >= 12) {
      alert("Maximum 12 units allowed in squad.");
      return;
    }

    const newSquads = [...userProfile.squads] as [string[], string[], string[]];
    newSquads[userProfile.activeSquadIndex] = [...currentSquad, asset.id];
    onUpdateProfile({ ...userProfile, squads: newSquads });
  };

  const handleRemoveFromSquad = (assetId: string) => {
    const newSquads = [...userProfile.squads] as [string[], string[], string[]];
    newSquads[userProfile.activeSquadIndex] = newSquads[userProfile.activeSquadIndex].filter(id => id !== assetId);
    onUpdateProfile({ ...userProfile, squads: newSquads });
  };

  const handleSwitchSquad = (index: number) => {
    onUpdateProfile({ ...userProfile, activeSquadIndex: index });
  };

  const handleAutoOptimize = () => {
    // 1. Get all owned operators
    const ownedOps = OPERATORS.filter(op => userProfile.collection.includes(op.id));
    
    // Step 1: Sort all owned units by Rarity (High to Low)
    const sortedOps = [...ownedOps].sort((a, b) => {
      if (b.rarity !== a.rarity) return b.rarity - a.rarity;
      return b.stats.atk - a.stats.atk;
    });

    const newSquadIds: string[] = [];

    const findAndAdd = (className: string, count: number) => {
      const matches = sortedOps.filter(op => op.class === className && !newSquadIds.includes(op.id));
      const toAdd = matches.slice(0, count);
      toAdd.forEach(op => newSquadIds.push(op.id));
      return toAdd.length;
    };

    // Step 2: Assign the first 2 Vanguards found (to ensure DP flow)
    findAndAdd('Vanguard', 2);

    // Step 3: Assign the first 2 Defenders found (to hold Row 3)
    findAndAdd('Defender', 2);

    // Step 4: Assign the first 2 Medics found (to support Row 3/4)
    findAndAdd('Medic', 2);

    // Step 5: Fill the remaining slots with the highest Rarity/ATK units remaining (up to 12)
    const fillers = sortedOps.filter(op => !newSquadIds.includes(op.id));
    fillers.slice(0, 12 - newSquadIds.length).forEach(op => newSquadIds.push(op.id));

    // Preserve item if already in squad and within limit
    const currentItem = userProfile.squads[userProfile.activeSquadIndex].find(id => {
      const asset = ALL_ASSETS.find(a => a.id === id);
      return asset?.class === 'Item';
    });
    
    if (currentItem && !newSquadIds.includes(currentItem) && newSquadIds.length < 12) {
      newSquadIds.push(currentItem);
    }

    const newSquads = [...userProfile.squads] as [string[], string[], string[]];
    newSquads[userProfile.activeSquadIndex] = newSquadIds;
    onUpdateProfile({ ...userProfile, squads: newSquads });
  };

  const renderAssetCard = (asset: Operator) => {
    const isOwned = userProfile.collection.includes(asset.id);
    const isInSquad = userProfile.squads[userProfile.activeSquadIndex].includes(asset.id);
    
    return (
      <motion.div
        key={asset.id}
        layoutId={asset.id}
        onClick={() => setSelectedAsset(asset)}
        className={`relative aspect-[2/3] bg-[#0c0c0c] border overflow-hidden cursor-pointer group transition-all duration-300 ${
          isInSquad 
            ? 'border-rhodes-blue shadow-[0_0_10px_rgba(0,152,217,0.3)] ring-1 ring-rhodes-blue' 
            : isOwned 
              ? 'border-white/10 hover:border-white/30' 
              : 'border-white/5 opacity-50 grayscale contrast-75 hover:grayscale-0 hover:opacity-100 hover:contrast-100'
        }`}
      >
        {/* Background Graphic */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden opacity-20">
          <div className="absolute -top-4 -left-4 w-12 h-12 border-t border-l border-white/20 rotate-45" />
          <div className="absolute bottom-0 right-0 w-1/2 h-[1px] bg-gradient-to-l from-white/20 to-transparent" />
        </div>

        <img 
          src={getCardImagePath(asset)}
          alt={asset.name}
          className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        
        {/* Rarity Bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 flex gap-px px-1 pt-1">
          {Array.from({ length: asset.rarity }).map((_, i) => (
            <div key={i} className={`flex-1 h-full ${isOwned ? 'bg-orange-500' : 'bg-white/10'}`} />
          ))}
        </div>

        {/* DP Cost Badge */}
        <div className="absolute top-2 right-2 flex flex-col items-center">
          <div className="bg-black/80 px-1.5 py-0.5 rounded-sm border border-white/10 flex flex-col items-center">
            <p className="text-[6px] text-white/40 terminal-text leading-none mb-0.5">COST</p>
            <span className="text-[10px] font-bold terminal-text text-rhodes-blue leading-none">{asset.dp_cost}</span>
          </div>
        </div>

        {/* Info Content */}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p className="text-[11px] font-bold terminal-text truncate leading-none mb-1 text-white shadow-black shadow-sm uppercase tracking-tighter">
            {asset.name}
          </p>
          <div className="flex justify-between items-center">
            <span className="text-[7px] text-rhodes-blue terminal-text font-bold opacity-80 uppercase">{asset.class}</span>
            <div className="flex gap-0.5">
              {Array.from({ length: asset.rarity }).map((_, i) => (
                <Star key={i} className={`w-1.5 h-1.5 fill-current ${isOwned ? 'text-orange-400' : 'text-white/10'}`} />
              ))}
            </div>
          </div>
        </div>

        {isInSquad && (
          <div className="absolute top-2 left-2 bg-rhodes-blue text-black text-[7px] px-1.5 py-0.5 font-bold rounded-sm tracking-tighter shadow-lg">
            DEPLOYED
          </div>
        )}

        {!isOwned && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/80 border border-white/20 px-3 py-1.5 flex items-center gap-2">
              <Lock className="w-3 h-3 text-white/40" />
              <span className="text-[9px] terminal-text font-bold">INFO LOCKED</span>
            </div>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-black relative overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-rhodes-border flex justify-between items-center bg-rhodes-dark z-10">
        <button onClick={onBack} className="flex items-center gap-2 text-white/60 hover:text-white">
          <ChevronLeft className="w-5 h-5" />
          <span className="terminal-text text-xs">BACK</span>
        </button>
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-rhodes-blue" />
          <span className="terminal-text text-xs font-bold">PERSONNEL ARCHIVES</span>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="p-4 space-y-3 bg-rhodes-dark/80 border-b border-rhodes-border z-10">
        <div className="flex gap-2">
          {[
            { id: 'OPERATOR', icon: Users, label: 'COMBAT' },
            { id: 'ROBOT', icon: Cpu, label: 'ROBOTS' },
            { id: 'ITEM', icon: Briefcase, label: 'ITEMS' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as AssetType);
                setClassFilter('ALL');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 border rounded transition-all ${
                activeTab === tab.id 
                  ? 'border-rhodes-blue bg-rhodes-blue/10 text-rhodes-blue' 
                  : 'border-rhodes-border text-white/40 hover:border-white/20'
              }`}
            >
              <tab.icon className="w-3 h-3" />
              <span className="text-[10px] font-bold terminal-text">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[150px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
            <input 
              type="text"
              placeholder="SEARCH..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black border border-rhodes-border rounded py-1.5 pl-8 pr-4 text-[10px] terminal-text focus:border-rhodes-blue outline-none"
            />
          </div>
          
          <div className="flex gap-1">
            <button 
              onClick={() => setShowAll(!showAll)}
              className={`px-3 py-1.5 border rounded flex items-center gap-2 text-[8px] terminal-text transition-all ${
                showAll ? 'border-rhodes-blue bg-rhodes-blue/20 text-rhodes-blue' : 'border-rhodes-border text-white/60'
              }`}
            >
              <Filter className="w-3 h-3" />
              {showAll ? 'VIEWING: ALL' : 'VIEWING: OWNED'}
            </button>
            
            <div className="flex border border-rhodes-border rounded overflow-hidden">
              <button 
                onClick={() => setSortBy(sortBy === 'RARITY' ? 'DP' : 'RARITY')}
                className="px-2 py-1.5 bg-black text-[8px] terminal-text text-white/60 border-r border-rhodes-border hover:bg-white/5"
              >
                {sortBy}
              </button>
              <button 
                onClick={() => setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC')}
                className="px-2 py-1.5 bg-black text-[8px] terminal-text text-rhodes-blue hover:bg-white/5 font-bold"
              >
                {sortOrder === 'DESC' ? 'HIGH' : 'LOW'}
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'OPERATOR' && (
          <div className="flex gap-1 overflow-x-auto pb-1">
            {classes.map(cls => (
              <button
                key={cls}
                onClick={() => setClassFilter(cls)}
                className={`px-3 py-1 rounded border transition-all whitespace-nowrap text-[8px] terminal-text ${
                  classFilter === cls 
                    ? 'bg-rhodes-blue border-rhodes-blue text-black font-bold' 
                    : 'bg-black/40 border-rhodes-border text-white/40 hover:border-white/20'
                }`}
              >
                {cls.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        <div className="flex justify-between items-center mb-4">
          <button 
            onClick={handleAutoOptimize}
            className="flex-1 py-2 border border-rhodes-blue/30 bg-rhodes-blue/5 rounded flex items-center justify-center gap-2 hover:bg-rhodes-blue/10 transition-all group"
          >
            <Wand2 className="w-3 h-3 text-rhodes-blue group-hover:scale-110 transition-transform" />
            <span className="terminal-text text-[9px] font-bold text-rhodes-blue uppercase tracking-widest">Auto-Optimize Squad</span>
          </button>
        </div>

        {groupedAssets ? (
          <div className="space-y-8">
            {Object.entries(groupedAssets).map(([className, assets]) => {
              const typedAssets = assets as Operator[];
              return (
                <div key={className} className="space-y-3">
                  <div className="flex items-center gap-2 border-l-2 border-rhodes-blue pl-2">
                    <span className="terminal-text text-[10px] font-bold text-rhodes-blue uppercase tracking-widest">{className}</span>
                    <div className="h-[1px] flex-1 bg-gradient-to-r from-rhodes-blue/30 to-transparent" />
                    <span className="terminal-text text-[8px] text-white/20">{typedAssets.length} UNITS</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {typedAssets.map(asset => renderAssetCard(asset))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {filteredAssets.map(asset => renderAssetCard(asset))}
          </div>
        )}
      </div>

      {/* Squad Bar */}
      <div className="sticky bottom-0 left-0 right-0 bg-[#080808] border-t border-rhodes-border p-3 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <div className="flex justify-between items-center mb-2.5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowSquad(!showSquad)}
                className={`p-1 rounded border transition-colors ${showSquad ? 'border-rhodes-blue text-rhodes-blue' : 'border-white/10 text-white/40'}`}
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold terminal-text leading-none uppercase tracking-tighter">Squad Management</span>
                  <button 
                    onClick={() => setShowSquad(!showSquad)}
                    className="text-[7px] terminal-text text-white/20 hover:text-white transition-colors uppercase"
                  >
                    [{showSquad ? 'HIDE PREVIEW' : 'SHOW PREVIEW'}]
                  </button>
                </div>
                <span className="text-[7px] text-white/40 terminal-text leading-none">SLOT {userProfile.activeSquadIndex + 1} | {activeSquad.length}/12</span>
              </div>
            </div>
            
            {/* Squad Selector */}
            <div className="flex gap-1 bg-black/40 p-0.5 rounded border border-white/5">
              {[0, 1, 2].map(idx => (
                <button
                  key={idx}
                  onClick={() => handleSwitchSquad(idx)}
                  className={`w-8 h-5 text-[8px] font-bold terminal-text rounded transition-all flex items-center justify-center ${
                    userProfile.activeSquadIndex === idx
                      ? 'bg-rhodes-blue text-black'
                      : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-[7px] text-white/30 terminal-text mb-0.5">AVERAGE DP</p>
            <span className="text-[11px] font-bold terminal-text text-rhodes-blue leading-none">{averageDP}</span>
          </div>
        </div>

        <AnimatePresence>
          {showSquad && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-6 gap-2 pt-1">
                {Array.from({ length: 12 }).map((_, i) => {
                  const asset = activeSquad[i];
                  
                  return (
                    <div 
                      key={i}
                      onClick={() => asset && handleRemoveFromSquad(asset.id)}
                      className={`aspect-square border rounded-sm flex items-center justify-center relative overflow-hidden cursor-pointer transition-all ${
                        asset 
                          ? 'border-rhodes-blue/60 bg-rhodes-blue/5 shadow-[inset_0_0_10px_rgba(0,152,217,0.1)]' 
                          : 'border-dashed border-white/5 bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      {asset ? (
                        <>
                          <img 
                            src={getCardImagePath(asset)}
                            alt={asset.name}
                            className="w-full h-full object-cover opacity-80"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-0 right-0 bg-black/90 px-0.5 rounded-bl">
                            <span className="text-[6px] font-bold terminal-text text-rhodes-blue">{asset.dp_cost}</span>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rhodes-blue/40" />
                        </>
                      ) : (
                        <Plus className="w-2.5 h-2.5 text-white/10" />
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Detail Overlay */}
      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-rhodes-dark border border-rhodes-border rounded-lg overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="relative p-6 flex flex-col items-center gap-2 shrink-0 bg-black/40">
                <button 
                  onClick={() => setSelectedAsset(null)}
                  className="absolute top-4 right-4 p-2 bg-black/60 rounded-full text-white/60 hover:text-white z-20"
                >
                  <X className="w-4 h-4" />
                </button>
                
                <div className="w-full max-w-[280px] aspect-[3/4] relative group">
                  <img 
                    src={getCardImagePath(selectedAsset)}
                    alt={selectedAsset.name}
                    className="w-full h-full object-contain rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/5"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 pt-0 space-y-6">


                {!userProfile.collection.includes(selectedAsset.id) ? (
                  <div className="bg-orange-500/10 border border-orange-500/30 p-4 rounded text-center">
                    <p className="text-[10px] terminal-text text-orange-500 font-bold mb-1">CONTRACT NOT SIGNED</p>
                    <p className="text-[8px] terminal-text text-white/40">This operator has not joined Rhodes Island yet. Use Shards in Headhunting or visit the Logistics Terminal to acquire contracts.</p>
                  </div>
                ) : (
                      <button
                        onClick={() => {
                          handleAddToSquad(selectedAsset);
                          setSelectedAsset(null);
                        }}
                        disabled={userProfile.squads[userProfile.activeSquadIndex].includes(selectedAsset.id)}
                        className={`rhodes-button w-full ${
                          userProfile.squads[userProfile.activeSquadIndex].includes(selectedAsset.id) ? 'opacity-50 grayscale' : 'glow-blue'
                        }`}
                      >
                        {userProfile.squads[userProfile.activeSquadIndex].includes(selectedAsset.id) ? '[ ALREADY IN SQUAD ]' : '[ ASSIGN TO SQUAD ]'}
                      </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
