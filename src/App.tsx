import React, { useState, useEffect } from 'react';
import { auth, signInWithGoogle, logOut, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { supabase } from './supabase';
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
import SetupProfileScreen from './components/SetupProfileScreen';
import OperatorHub from './components/OperatorHub';
import LevelUpModal from './components/LevelUpModal';
import MissionsOverlay from './components/MissionsOverlay';
import ErrorBoundary from './ErrorBoundary';
import { ALL_ASSETS } from './data/operators';
import { getCardImagePath } from './utils/assetUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home, 
  Swords, 
  Cpu, 
  Users, 
  Search, 
  ShoppingBag, 
  Lock,
  CheckCircle2,
  MessageSquare
} from 'lucide-react';

const INITIAL_CURRENCY = { orundum: 1000, certificates: 0 };
const INITIAL_INVENTORY = {};

export default function App() {
  const [appState, setAppState] = useState<AppState>('SPLASH');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as true
  const [showDailyLogin, setShowDailyLogin] = useState(false);
  const [showRewardNotification, setShowRewardNotification] = useState<string[] | null>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpData, setLevelUpData] = useState({ level: 0, orundum: 0, certificates: 0 });
  const [showMissions, setShowMissions] = useState(false);

  // Global Error Listener
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Global Error Caught:", event.error);
      // Only alert on serious app-breaking errors during auth
      if (appState === 'SPLASH' || isLoading) {
        alert("CRITICAL SYSTEM ERROR: " + (event.error?.message || "Unknown Failure"));
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [appState, isLoading]);

  // Initialize from LocalStorage
  useEffect(() => {
    const savedProfile = localStorage.getItem('arknights_profile');
    if (savedProfile) {
      const profile = JSON.parse(savedProfile) as UserProfile;
      if (profile.hasAcceptedTerms && profile.loginType === 'guest') {
        setUserProfile(profile);
        // Sync latest from cloud if possible
        getDoc(doc(db, 'users', profile.uid)).then(docSnap => {
          if (docSnap.exists()) {
            const cloudProfile = docSnap.data() as UserProfile;
            setUserProfile(cloudProfile);
            localStorage.setItem('arknights_profile', JSON.stringify(cloudProfile));
          }
        }).catch(console.error);
      }
    }

    // Auth state listener handles everything
    // Safety timeout: If auth takes too long, stop loading so user can try guest login
    const safetyTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 4000);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(safetyTimeout);
      if (user) {
        const hasAccepted = localStorage.getItem('arknights_terms_accepted') === 'true';
        const savedProfileStr = localStorage.getItem('arknights_profile');
        let localProfile: UserProfile | null = savedProfileStr ? JSON.parse(savedProfileStr) : null;

        try {
          // alert("DEBUG: Auth State - User found: " + user.uid);
          
          // SYNC LOGIC: Check cloud vs local
          let activeProfile: UserProfile;
          let cloudProfile: UserProfile | null = null;
          try {
            // Check Supabase first as it's the primary DB now
            const { data: sbProfile } = await supabase.from('profiles').select('*').eq('id', user.uid).single();
            if (sbProfile) {
              // Convert DB format back to UserProfile type if necessary
              cloudProfile = {
                uid: sbProfile.id,
                email: sbProfile.email,
                displayName: sbProfile.display_name,
                level: sbProfile.level,
                exp: sbProfile.exp,
                currentCurrency: { orundum: sbProfile.orundum, certificates: sbProfile.certificates },
                collection: sbProfile.collection,
                squads: sbProfile.squads,
                hasCompletedTutorial: sbProfile.has_completed_tutorial,
                hasAcceptedTerms: sbProfile.has_accepted_terms,
                loginType: sbProfile.login_type,
                affinity: sbProfile.affinity || {},
                lastMatchResult: sbProfile.last_match_result,
                inventory: INITIAL_INVENTORY, // Default for now
                lastLogin: new Date().toISOString(),
                loginStreak: localProfile?.loginStreak || 1,
                lastClaimedDate: localProfile?.lastClaimedDate || null,
                pity5: localProfile?.pity5 || 0,
                pity6: localProfile?.pity6 || 0,
                unlockedSkills: localProfile?.unlockedSkills || [],
                activeSquadIndex: 0
              };
            }
          } catch (e) {
            console.warn("Cloud fetch failed:", e);
          }

          if (cloudProfile) {
            console.log("Cloud profile found. Using cloud data.");
            activeProfile = cloudProfile;
            
            // Special Case: If user has a guest profile locally, and it's their FIRST time linking to Google
            // (Cloud profile might be empty or basic), merge the local guest progress.
            if (localProfile && localProfile.loginType === 'guest') {
              console.log("Merging local guest data into existing cloud profile...");
              const uniqueCards = [...new Set([...activeProfile.collection, ...localProfile.collection])];
              activeProfile.collection = uniqueCards;
              
              if (localProfile.affinity) {
                Object.keys(localProfile.affinity).forEach(opId => {
                  if (!activeProfile.affinity[opId] || localProfile.affinity[opId] > activeProfile.affinity[opId]) {
                    activeProfile.affinity[opId] = localProfile.affinity[opId];
                  }
                });
              }
              
              if (localProfile.level > activeProfile.level) {
                activeProfile.level = localProfile.level;
                activeProfile.exp = localProfile.exp;
              }
            }
          } else if (localProfile && localProfile.loginType === 'guest') {
            console.log("No cloud profile. Merging guest data to new Google account.");
            activeProfile = {
              ...localProfile,
              uid: user.uid,
              email: user.email || '',
              loginType: 'google',
              displayName: user.displayName || localProfile.displayName
            };
          } else if (localProfile && (localProfile.uid === user.uid || localProfile.email === user.email)) {
            // FALLBACK: Use local profile if cloud fetch failed but local exists and matches
            console.log("Cloud sync delayed or failed. Using local backup profile.");
            activeProfile = {
              ...localProfile,
              uid: user.uid, // Ensure UID is correct
              loginType: 'google'
            };
          } else if (user.providerData.length > 0) {
            // It's a Google user, but no cloud profile was found AND no local guest profile exists.
            // This is either a TRULY new user, or a sync failure.
            console.log("Google user with no profile found. Creating fresh profile.");
            activeProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || 'Doctor',
              hasAcceptedTerms: hasAccepted,
              hasCompletedTutorial: false,
              loginType: 'google',
              currentCurrency: INITIAL_CURRENCY,
              inventory: INITIAL_INVENTORY,
              collection: ['ami_001'],
              unlockedSkills: [],
              squads: [['ami_001'], [], []],
              activeSquadIndex: 0,
              lastLogin: new Date().toISOString(),
              level: 1,
              exp: 0,
              loginStreak: 1,
              lastClaimedDate: null,
              pity5: 0,
              pity6: 0,
              affinity: {},
              lastMatchResult: null,
            };
          } else {
             // Fallback for unexpected cases
             throw new Error("Unable to resolve tactical profile.");
          }

          // Update state and persistence
          setUserProfile(activeProfile);
          localStorage.setItem('arknights_profile', JSON.stringify(activeProfile));
          
          // CRITICAL: Ensure cloud is updated IMMEDIATELY
          await handleUpdateProfile(activeProfile); 

          if (!activeProfile.hasAcceptedTerms) {
            setAppState('TERMS');
          } else {
            setAppState(activeProfile.hasCompletedTutorial ? 'DASHBOARD' : 'TUTORIAL');
          }
          
          setIsLoading(false);

        } catch (error: any) {
          console.error("Auth error:", error);
          alert("HANDSHAKE ERROR: " + error.code + " - " + error.message);
          setIsLoading(false);
        }
      } else {
        // User is logged out
        const savedProfileStr = localStorage.getItem('arknights_profile');
        if (savedProfileStr) {
          const profile = JSON.parse(savedProfileStr);
          if (profile.loginType === 'guest') {
            setUserProfile(profile);
          } else {
            setUserProfile(null);
            setAppState('SPLASH');
          }
        } else {
          setUserProfile(null);
          setAppState('SPLASH');
        }
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // The triggerGoogleLink flag is no longer used to prevent reload loops

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
    // 1. Immediate UI Transition
    setAppState('DASHBOARD');
    
    // 2. Local State update
    const starterPack = ['fang_001', 'beagle_001', 'melantha_001', 'kroos_001', 'hibiscus_001'];
    const newCollection = [...new Set([...(userProfile?.collection || []), ...starterPack])];
    const newSquads = [...(userProfile?.squads || [[], [], []])] as [string[], string[], string[]];
    if (newSquads[0].length === 0) newSquads[0] = [...starterPack];

    const newProfile = { 
      ...(userProfile || {}), 
      hasCompletedTutorial: true,
      collection: newCollection,
      squads: newSquads
    } as UserProfile;
    
    setUserProfile(newProfile);
    localStorage.setItem('arknights_profile', JSON.stringify(newProfile));
    localStorage.setItem('arknights_tutorial_completed', 'true');
    
    // Firestore sync disabled to prevent nested array errors. Supabase is primary.
    /*
    if (newProfile.uid) {
      const firestorePayload = sanitizeForFirestore(newProfile);
      setDoc(doc(db, 'users', newProfile.uid), firestorePayload, { merge: true }).catch(e => console.error(e));
    }
    */
    
    setShowRewardNotification(starterPack);
  };

  const handleSetupComplete = (name: string) => {
    if (!userProfile) return;
    const updatedProfile = { ...userProfile, displayName: name };
    handleUpdateProfile(updatedProfile);
    
    if (!updatedProfile.hasAcceptedTerms) {
      setAppState('TERMS');
    } else if (!updatedProfile.hasCompletedTutorial) {
      setAppState('TUTORIAL');
    } else {
      setAppState('DASHBOARD');
    }
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

  const handleGuestLogin = async (name?: string) => {
    setIsLoading(true);
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
      affinity: {},
      lastMatchResult: null,
    };

    setUserProfile(profile);
    localStorage.setItem('arknights_profile', JSON.stringify(profile));
    setIsLoading(false);
    
    // Firestore sync disabled
    /*
    try {
      const firestorePayload = sanitizeForFirestore(profile);
      await setDoc(doc(db, 'users', profile.uid), firestorePayload, { merge: true });
    } catch (e) {
      console.error(e);
    }
    */
    
    checkDailyLogin(profile);

    if (!profile.hasAcceptedTerms) {
      setAppState('TERMS');
    } else if (!profile.hasCompletedTutorial) {
      setAppState('TUTORIAL');
    } else {
      setAppState('DASHBOARD');
    }
  };

  const handleGoogleLogin = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      console.log("Attempting Google Login Popup...");
      try {
        await signInWithPopup(auth, provider);
      } catch (popupError: any) {
        console.error("Popup Error:", popupError.code, popupError.message);
        if (popupError.code === 'auth/popup-blocked' || 
            popupError.code === 'auth/cancelled-popup-request' || 
            popupError.code === 'auth/popup-closed-by-user') {
          alert("Neural Link: Popup blocked/closed. Redirecting to Google Login page...");
          await signInWithRedirect(auth, provider);
        } else {
          alert(`Neural Link Failed: ${popupError.code}\n${popupError.message}`);
          throw popupError;
        }
      }
    } catch (error: any) {
      console.error("Critical Auth Error:", error);
      alert(`CRITICAL AUTH ERROR: ${error.code}\n${error.message}`);
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

  const sanitizeForFirestore = (profile: UserProfile) => {
    return {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      level: profile.level,
      exp: profile.exp,
      currentCurrency: profile.currentCurrency,
      loginType: profile.loginType,
      hasCompletedTutorial: profile.hasCompletedTutorial,
      hasAcceptedTerms: profile.hasAcceptedTerms,
      updated_at: new Date().toISOString()
    };
  };

  const handleUpdateProfile = async (profile: UserProfile) => {
    setUserProfile(profile);
    localStorage.setItem('arknights_profile', JSON.stringify(profile));
    
    // Sync to Supabase
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: profile.uid,
          display_name: profile.displayName,
          email: profile.email,
          level: profile.level,
          exp: profile.exp,
          orundum: profile.currentCurrency.orundum,
          certificates: profile.currentCurrency.certificates,
          collection: profile.collection,
          squads: profile.squads,
          has_completed_tutorial: profile.hasCompletedTutorial,
          has_accepted_terms: profile.hasAcceptedTerms,
          login_type: profile.loginType,
          affinity: profile.affinity || {},
          last_match_result: profile.lastMatchResult,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      
      if (error) {
        console.error("Supabase Sync Error:", error.message);
        // Alert only on non-standard errors
        if (error.code !== 'PGRST116') {
           // We can't alert here as it might be too noisy, but we store the error
           (window as any).LAST_SYNC_ERROR = error;
        }
      } else {
        (window as any).LAST_SYNC_ERROR = null;
      }
    } catch (e) {
      console.error("Supabase Operation Failed:", e);
    }

    // Firestore sync disabled to prevent nested array errors. Supabase is primary.
    /*
    const firestorePayload = sanitizeForFirestore(profile);

    setDoc(doc(db, 'users', profile.uid), firestorePayload, { merge: true }).catch(e => {
      console.error("Firestore Sync Error (Basic):", e);
    });
    */
  };

  const handleWinMatch = (type: 'SIM' | 'PVP') => {
    if (!userProfile) return;

    let profile = { ...userProfile };
    const xpGain = type === 'SIM' ? 50 : 150;
    const orundumGain = type === 'SIM' ? 20 : 100;

    profile.exp += xpGain;
    profile.currentCurrency.orundum += orundumGain;

    profile.lastMatchResult = 'Win';

    // Update Missions
    const missionId = type === 'SIM' ? 'win_sim' : 'win_pvp';
    if (!profile.missions) profile.missions = {};
    if (!profile.missions[missionId]) profile.missions[missionId] = { progress: 0, claimed: false };
    if (!profile.missions[missionId].claimed) {
       profile.missions[missionId].progress = Math.min(1, profile.missions[missionId].progress + 1);
    }
    
    if (!profile.missions['play_matches']) profile.missions['play_matches'] = { progress: 0, claimed: false };
    if (!profile.missions['play_matches'].claimed) {
       profile.missions['play_matches'].progress = Math.min(3, profile.missions['play_matches'].progress + 1);
    }

    // Boost affinity for squad members
    const activeSquad = profile.squads[profile.activeSquadIndex];
    if (!profile.affinity) profile.affinity = {};
    activeSquad.forEach(opId => {
      profile.affinity[opId] = (profile.affinity[opId] || 0) + 1;
    });

    // Level up logic
    const oldLevel = userProfile.level;
    const expNeeded = profile.level * 100;
    let leveledUp = false;
    let totalOrundumReward = 0;
    let totalCertReward = 0;

    while (profile.exp >= expNeeded) {
      profile.exp -= expNeeded;
      profile.level += 1;
      totalOrundumReward += 500;
      totalCertReward += 10;
      leveledUp = true;
    }

    if (leveledUp) {
       profile.currentCurrency.orundum += totalOrundumReward;
       profile.currentCurrency.certificates += totalCertReward;
       setLevelUpData({ level: profile.level, orundum: totalOrundumReward, certificates: totalCertReward });
       setShowLevelUp(true);
    }

    handleUpdateProfile(profile);
  };

  const handleClaimMission = (missionId: string) => {
    if (!userProfile || !userProfile.missions?.[missionId]) return;
    
    const profile = { ...userProfile };
    const mission = profile.missions[missionId];
    
    // Find reward amount
    const reward = missionId === 'win_pvp' ? 500 : missionId === 'win_sim' ? 200 : missionId === 'chat_op' ? 100 : 300;
    
    profile.currentCurrency.orundum += reward;
    profile.missions[missionId].claimed = true;
    
    handleUpdateProfile(profile);
  };

  const handleMatchEnd = (result: 'Win' | 'Loss') => {
    if (!userProfile) return;
    let profile = { ...userProfile };
    profile.lastMatchResult = result;
    
    if (result === 'Loss') {
       // Losses don't gain XP/Orundum in this simple version, but record result
       handleUpdateProfile(profile);
    } else {
       handleWinMatch('SIM'); // Defaulting to SIM for generic end if not specified
    }
  };

  const showNav = userProfile && !['SPLASH', 'TERMS', 'LOGIN', 'SIMULATION', 'CONFLICT', 'TUTORIAL', 'SETUP_PROFILE'].includes(appState);

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

            {appState === 'SETUP_PROFILE' && userProfile && (
              <motion.div key="setup" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="h-full">
                <SetupProfileScreen 
                  initialName={userProfile.displayName || ''}
                  onComplete={handleSetupComplete}
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
                  onLinkGoogle={handleGoogleLogin}
                  onOpenMissions={() => setShowMissions(true)}
                />
                <DailyLoginOverlay 
                  isOpen={showDailyLogin}
                  onClaim={handleClaimReward}
                  loginStreak={userProfile.loginStreak}
                />

                <LevelUpModal 
                  isOpen={showLevelUp}
                  level={levelUpData.level}
                  orundum={levelUpData.orundum}
                  certificates={levelUpData.certificates}
                  onClose={() => setShowLevelUp(false)}
                />

                <MissionsOverlay 
                  isOpen={showMissions}
                  userProfile={userProfile}
                  onClaim={handleClaimMission}
                  onClose={() => setShowMissions(false)}
                />

                {showRewardNotification && (
                  <div className="absolute inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl">
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
                  onMatchEnd={(res) => handleMatchEnd(res)}
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
                    onMatchEnd={(res) => handleMatchEnd(res)}
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
            {appState === 'HUB' && userProfile && (
              <motion.div 
                key="hub" 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <OperatorHub 
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
              { id: 'HUB', icon: MessageSquare, label: 'HUB' },
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
