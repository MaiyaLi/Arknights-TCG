export interface UserCurrency {
  orundum: number;
  certificates: number;
}

export interface UserInventory {
  // Inventory items can be added here in the future
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  hasAcceptedTerms: boolean;
  hasCompletedTutorial: boolean;
  loginType: 'guest' | 'google' | null;
  currentCurrency: UserCurrency;
  inventory: UserInventory;
  collection: string[]; // Array of operator IDs
  unlockedSkills: string[]; // Array of operator IDs with 2nd skill unlocked
  squads: [string[], string[], string[]]; // Array of 3 squads, each with 12 slots max
  activeSquadIndex: number;
  lastLogin: string;
  level: number;
  exp: number;
  loginStreak: number;
  lastClaimedDate: string | null;
  pity5: number; // Counter for 5-star pity (guaranteed at 10)
  pity6: number; // Counter for 6-star pity (guaranteed at 90)
}

export type AppState = 'SPLASH' | 'TERMS' | 'LOGIN' | 'LOADING' | 'DASHBOARD' | 'HEADHUNTING' | 'PERSONNEL' | 'SIMULATION' | 'SHOP' | 'TUTORIAL';
