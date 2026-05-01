import React, { useState, useEffect } from 'react';
import { auth, signInWithGoogle, logOut } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { AppState, UserProfile } from './types';
import TerminalOverlay from './components/TerminalOverlay';
import SplashScreen from './components/SplashScreen';
import TermsModal from './components/TermsModal';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import DailyLoginOverlay from './components/DailyLoginOverlay';
import HeadhuntingScreen from './components/HeadhuntingScreen';
import PersonnelScreen from './components/PersonnelScreen';
import SimulationScreen from './components/SimulationScreen';
import LogisticsTerminal from './components/LogisticsTerminal';
import TutorialScreen from './components/TutorialScreen';
import ConflictScreen from './components/ConflictScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { ALL_ASSETS } from './data/operators';
import { getCardImagePath } from './utils/assetUtils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  Swords, 
  Cpu, 
  Users, 
  Search, 
  ShoppingBag, 
  Lock,
  CheckCircle2
} from 'lucide-react';

const INITIAL_CURRENCY = { orundum: 1000, certificates: 0 };
const INITIAL_INVENTORY = {};

export default function App() {
  const [appState, setAppState] = useState<AppState>('SPLASH');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDailyLogin, setShowDailyLogin] = useState(false);
  const [showRewardNotification, setShowRewardNotification] = useState<string[] | null>(null);

  // Initialize from LocalStorage
  useEffect(() => {
    const savedProfile = localStorage.getItem('arknights_profile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile) as UserProfile;
      if (profile.hasAcceptedTerms && profile.loginType === 'guest') {
        setUserProfile(profile);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const hasAccepted = localStorage.getItem('arknights_terms_accepted') === 'true';
        const savedProfile = localStorage.getItem('arknights_profile');
        let profile: UserProfile;

        if (savedProfile) {
          profile = JSON.parse(savedProfile);
          profile.uid = user.uid;
          profile.email = user.email;
          profile.displayName = user.displayName;
          // Migration for old profiles
          if (!profile.squads) {
            const oldSquad = (profile as any).activeSquad || [];
            profile.squads = [[...oldSquad], [], []];
            profile.activeSquadIndex = 0;
          }
          if (profile.pity5 === undefined) profile.pity5 = 0;
          if (profile.pity6 === undefined) profile.pity6 = 0;
          if (profile.level === undefined) profile.level = 1;
          if (profile.exp === undefined) profile.exp = 0;
          if ((profile.currentCurrency as any).shards !== undefined) {
             profile.currentCurrency.orundum = (profile.currentCurrency as any).shards;
             delete (profile.currentCurrency as any).shards;
          }
        } else {
          profile = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            hasAcceptedTerms: hasAccepted,
            hasCompletedTutorial: false,
            loginType: 'google',
            currentCurrency: INITIAL_CURRENCY,
            inventory: INITIAL_INVENTORY,
            collection: [],
            unlockedSkills: [],
            squads: [[], [], []],
            activeSquadIndex: 0,
            lastLogin: new Date().toISOString(),
            level: 1,
            exp: 0,
            loginStreak: 1,
            lastClaimedDate: null,
            pity5: 0,
            pity6: 0,
          };
        }
        
        setUserProfile(profile);
        checkDailyLogin(profile);
        
        if (!hasAccepted) {
          setAppState('TERMS');
        } else if (!profile.hasCompletedTutorial) {
          setAppState('TUTORIAL');
        } else {
          setAppState('DASHBOARD');
        }
      } else {
        if (userProfile?.loginType === 'google') {
          setUserProfile(null);
          setAppState('SPLASH');
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const checkDailyLogin = (profile: UserProfile) => {
    const today = new Date().toDateString();
    if (profile.lastClaimedDate !== today) {
      setShowDailyLogin(true);
    }
  };

  const handleClaimReward = (day: number) => {
    if (!userProfile) return;

    const today = new Date().toDateString();
    const newProfile = { ...userProfile };
    
    // Reward Logic
    if ([1, 2, 4, 5, 6].includes(day)) {
      newProfile.currentCurrency.orundum += 100;
    } else if (day === 3) {
      newProfile.currentCurrency.orundum += 200; // Replacement for standard permit
    } else if (day === 7) {
      newProfile.currentCurrency.orundum += 500; // Replacement for elite permit
    }

    newProfile.lastClaimedDate = today;
    newProfile.loginStreak = (newProfile.loginStreak % 7) + 1;
    
    setUserProfile(newProfile);
    localStorage.setItem('arknights_profile', JSON.stringify(newProfile));
    setShowDailyLogin(false);
  };

  const handleCompleteTutorial = () => {
    if (!userProfile) return;
    
    // Grant 3-star operators as a starter pack
    const starterPack = ['fang_001', 'beagle_001', 'melantha_001', 'kroos_001', 'hibiscus_001'];
    // Merge with current collection ensuring no duplicates
    const newCollection = [...new Set([...userProfile.collection, ...starterPack])];
    
    // Automatically populate the first empty squad if it's empty
    const newSquads = [...userProfile.squads] as [string[], string[], string[]];
    if (newSquads[0].length === 0) {
      newSquads[0] = [...starterPack];
    }

    const newProfile = { 
      ...userProfile, 
      hasCompletedTutorial: true,
      collection: newCollection,
      squads: newSquads
    };
    
    handleUpdateProfile(newProfile);
    setAppState('DASHBOARD');
    setShowRewardNotification(starterPack);
  };

  const handleStart = () => {
    setAppState('LOGIN');
  };

  const handleAcceptTerms = () => {
    localStorage.setItem('arknights_terms_accepted', 'true');
    if (userProfile) {
      const updatedProfile = { ...userProfile, hasAcceptedTerms: true };
      handleUpdateProfile(updatedProfile);
      
      if (!updatedProfile.hasCompletedTutorial) {
        setAppState('TUTORIAL');
      } else {
        setAppState('DASHBOARD');
      }
    } else {
      setAppState('DASHBOARD');
    }
  };

  const handleGuestLogin = (name?: string) => {
    setIsLoading(true);
    setTimeout(() => {
      const guestId = `GUEST_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const profile: UserProfile = {
        uid: guestId,
        email: null,
        displayName: name || `Operator ${guestId.split('_')[1]}`,
        hasAcceptedTerms: localStorage.getItem('arknights_terms_accepted') === 'true',
        hasCompletedTutorial: false,
        loginType: 'guest',
        currentCurrency: INITIAL_CURRENCY,
        inventory: INITIAL_INVENTORY,
        collection: [],
        unlockedSkills: [],
        squads: [[], [], []],
        activeSquadIndex: 0,
        lastLogin: new Date().toISOString(),
        level: 1,
        exp: 0,
        loginStreak: 1,
        lastClaimedDate: null,
        pity5: 0,
        pity6: 0,
      };
      setUserProfile(profile);
      localStorage.setItem('arknights_profile', JSON.stringify(profile));
      setIsLoading(false);
      
      checkDailyLogin(profile);

      if (!profile.hasAcceptedTerms) {
        setAppState('TERMS');
      } else if (!profile.hasCompletedTutorial) {
        setAppState('TUTORIAL');
      } else {
        setAppState('DASHBOARD');
      }
    }, 3000); // Simulate loading
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      // Auth state listener will handle the transition
    } catch (error) {
      console.error("Login failed:", error);
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (userProfile?.loginType === 'google') {
      await logOut();
    } else {
      setUserProfile(null);
      setAppState('SPLASH');
    }
  };

  const handleUpdateProfile = (profile: UserProfile) => {
    setUserProfile(profile);
    localStorage.setItem('arknights_profile', JSON.stringify(profile));
  };

  const handleWinMatch = (type: 'SIM' | 'PVP') => {
    if (!userProfile) return;

    let profile = { ...userProfile };
    const xpGain = type === 'SIM' ? 50 : 150;
    const orundumGain = type === 'SIM' ? 20 : 100;

    profile.exp += xpGain;
    profile.currentCurrency.orundum += orundumGain;

    // Level up logic
    const expNeeded = profile.level * 100;
    while (profile.exp >= expNeeded) {
      profile.exp -= expNeeded;
      profile.level += 1;
      // Level up reward!
      profile.currentCurrency.orundum += 500;
      profile.currentCurrency.certificates += 10;
    }

    handleUpdateProfile(profile);
  };

  const showNav = userProfile && !['SPLASH', 'TERMS', 'LOGIN', 'SIMULATION', 'CONFLICT', 'TUTORIAL'].includes(appState);

  return (
    <div className="relative min-h-screen bg-black flex justify-center items-center overflow-hidden">
      <TerminalOverlay />
      
      <div className="relative w-full max-w-[450px] h-screen max-h-[900px] bg-rhodes-dark shadow-2xl shadow-rhodes-blue/20 border-x border-rhodes-border overflow-hidden flex flex-col">
        <div className="flex-1 overflow-hidden relative flex flex-col">
          <AnimatePresence mode="wait">
            {appState === 'SPLASH' && (
              <motion.div key="splash" exit={{ opacity: 0, y: -20 }} className="h-full">
                <SplashScreen onStart={handleStart} />
              </motion.div>
            )}

            {appState === 'TERMS' && (
              <motion.div key="terms" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
                <TermsModal isOpen={true} onAccept={handleAcceptTerms} />
              </motion.div>
            )}

            {appState === 'LOGIN' && (
              <motion.div key="login" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                <LoginScreen 
                  onGuestLogin={handleGuestLogin} 
                  onGoogleLogin={handleGoogleLogin} 
                  isLoading={isLoading} 
                />
              </motion.div>
            )}

            {appState === 'DASHBOARD' && userProfile && (
              <motion.div 
                key="dashboard" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                className="h-full"
              >
                <Dashboard 
                  userProfile={userProfile} 
                  onLogout={handleLogout}
                  onStartTutorial={() => setAppState('TUTORIAL')}
                  onUpdateProfile={handleUpdateProfile}
                />
                <DailyLoginOverlay 
                  isOpen={showDailyLogin}
                  onClaim={handleClaimReward}
                  loginStreak={userProfile.loginStreak}
                />

                {showRewardNotification && (
                  <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
                     <motion.div 
                       initial={{ scale: 0.95, opacity: 0, y: 20 }}
                       animate={{ scale: 1, opacity: 1, y: 0 }}
                       className="w-full max-w-sm bg-black/40 border border-rhodes-blue/30 p-8 flex flex-col items-center shadow-[0_0_100px_rgba(0,186,255,0.1)] rounded-sm relative overflow-hidden"
                     >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-rhodes-blue to-transparent" />
                        
                        <CheckCircle2 className="w-12 h-12 text-rhodes-blue mb-6 opacity-80" />
                        <h2 className="terminal-text text-2xl font-black text-white italic tracking-tighter mb-1 text-center">OPERATOR PACK AUTHORIZED</h2>
                        <p className="text-[9px] terminal-text text-white/30 uppercase mb-10 tracking-[0.3em] text-center">Data packets synchronized with core terminal</p>
                        
                        <div className="flex flex-wrap justify-center gap-2 mb-12">
                           {showRewardNotification.map(id => {
                             const op = ALL_ASSETS.find(a => a.id === id);
                             if (!op) return null;
                             return (
                               <motion.div 
                                 key={id} 
                                 initial={{ opacity: 0, scale: 0.8 }}
                                 animate={{ opacity: 1, scale: 1 }}
                                 className="w-16 h-20 bg-black/60 border border-white/10 rounded-sm overflow-hidden shadow-2xl relative group"
                               >
                                  <img src={getCardImagePath(op)} className="w-full h-full object-contain p-0.5" referrerPolicy="no-referrer" />
                                  <div className="absolute inset-0 bg-rhodes-blue/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                               </motion.div>
                             );
                           })}
                        </div>

                        <button 
                          onClick={() => setShowRewardNotification(null)}
                          className="rhodes-button glow-blue w-full py-4 bg-rhodes-blue text-black font-black terminal-text text-[10px] uppercase tracking-[0.4em] transition-all hover:bg-white"
                        >
                          ACKNOWLEDGE DATA
                        </button>
                     </motion.div>
                  </div>
                )}
              </motion.div>
            )}

            {appState === 'TUTORIAL' && userProfile && (
              <motion.div 
                key="tutorial" 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="h-full"
              >
                <TutorialScreen 
                  onComplete={handleCompleteTutorial}
                  onSkip={handleCompleteTutorial}
                />
              </motion.div>
            )}

            {appState === 'HEADHUNTING' && userProfile && (
              <motion.div 
                key="headhunting" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <HeadhuntingScreen 
                  userProfile={userProfile}
                  onUpdateProfile={handleUpdateProfile}
                  onBack={() => setAppState('DASHBOARD')}
                />
              </motion.div>
            )}
            {appState === 'PERSONNEL' && userProfile && (
              <motion.div 
                key="personnel" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <PersonnelScreen 
                  userProfile={userProfile}
                  onUpdateProfile={handleUpdateProfile}
                  onBack={() => setAppState('DASHBOARD')}
                />
              </motion.div>
            )}
            {appState === 'SIMULATION' && userProfile && (
              <motion.div 
                key="simulation" 
                initial={{ opacity: 0, scale: 1.1 }} 
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="h-full"
              >
                <SimulationScreen 
                  userProfile={userProfile}
                  onUpdateProfile={handleUpdateProfile}
                  onBack={() => setAppState('DASHBOARD')}
                  onVictory={() => handleWinMatch('SIM')}
                />
              </motion.div>
            )}
            {appState === 'CONFLICT' && userProfile && (
              <motion.div 
                key="conflict" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <ErrorBoundary>
                  <ConflictScreen 
                    userProfile={userProfile}
                    onUpdateProfile={handleUpdateProfile}
                    onBack={() => setAppState('DASHBOARD')}
                    onVictory={() => handleWinMatch('PVP')}
                  />
                </ErrorBoundary>
              </motion.div>
            )}
            {appState === 'SHOP' && userProfile && (
              <motion.div 
                key="shop" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <LogisticsTerminal 
                  userProfile={userProfile}
                  onUpdateProfile={handleUpdateProfile}
                  onBack={() => setAppState('DASHBOARD')}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {showNav && (
          <div className="flex border-t border-rhodes-border bg-black/80 backdrop-blur-md shrink-0 p-1 gap-1">
            {[
              { id: 'DASHBOARD', icon: Home, label: 'HOME' },
              { id: 'CONFLICT', icon: Swords, label: 'CONFLICT', disabled: !userProfile?.hasCompletedTutorial || userProfile?.squads[userProfile?.activeSquadIndex].length === 0 },
              { id: 'SIMULATION', icon: Cpu, label: 'SIM' },
              { id: 'PERSONNEL', icon: Users, label: 'UNITS' },
              { id: 'HEADHUNTING', icon: Search, label: 'RECRUIT' },
              { id: 'SHOP', icon: ShoppingBag, label: 'SHOP' },
            ].map(item => (
              <button
                key={item.id}
                disabled={item.disabled}
                onClick={() => setAppState(item.id as AppState)}
                className={`flex-1 flex flex-col items-center justify-center py-2 rounded transition-all relative ${
                  appState === item.id 
                    ? 'bg-rhodes-blue/20 text-rhodes-blue' 
                    : item.disabled ? 'opacity-20 grayscale cursor-not-allowed' : 'text-white/40 hover:bg-white/5 hover:text-white/60'
                }`}
              >
                <item.icon className={`w-4 h-4 mb-1 ${appState === item.id ? 'text-rhodes-blue' : ''}`} />
                <span className="text-[7px] font-bold terminal-text leading-none">{item.label}</span>
                {item.disabled && <Lock className="absolute top-1 right-1 w-2 h-2 text-white/20" />}
                {appState === item.id && (
                  <motion.div layoutId="nav-active" className="absolute bottom-0 left-1 right-1 h-0.5 bg-rhodes-blue rounded-full" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
