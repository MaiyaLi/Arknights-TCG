# Arknights: Tactical Sync (TCG)

A high-fidelity, tactical trading card game and simulation platform inspired by Arknights. Build your squad, interact with operators, and dominate the Conflict Zone.

## 🌟 Key Features

### 1. Tactical Combat Engine
- **Battlefield Simulation**: Deep tactical gameplay with operator classes (Vanguard, Guard, Medic, Sniper, Caster, Specialist, Supporter, Defender).
- **DP Management**: Strategic Deployment Point (DP) system for summoning operators.
- **Conflict Zone (PvP)**: Real-time multiplayer tactical matches powered by Supabase Realtime synchronization.
- **Simulation Mode**: Test your squads against AI in a low-stakes environment.

### 2. Strategic Deployment Mastery (NEW)
- **Deployment Delay**: Strategic "1-turn wait" for newly deployed operators to ensure tactical transparency and eliminate "surprise" shifts.
- **Stealth & Reveal Mechanics**: Specialist operators like Ethan and Manticore feature stealth traits, becoming "revealed" and targetable only when actively blocking an enemy.
- **Symmetrical 2.5D Mirroring**: A perfectly synchronized battlefield view where both players experience the combat from their own tactical perspective.

### 3. Tactical Inspector & UI (NEW)
- **Unit Statistics Overlay**: Click any unit on the battlefield to view real-time HP, ATK, DEF, SP, and active abilities.
- **High-Fidelity Match Results**: Cinematic "OPERATION SUCCESS" and "MISSION FAILURE" screens with detailed tactical analysis, recovery data, and supply rewards.
- **Neural Pulse Transitions**: Animated phase transitions and combat event notifications for a premium Rhodes Island terminal experience.

### 4. Operator Hub & Personalities
- **Neural Sync Chat**: Chat with operators using the **Gemini AI** engine. Each operator has a unique, lore-accurate personality and tone.
- **Affinity System**: Increase trust with your operators through interaction and battle. Higher affinity unlocks more personal chat lines.
- **Operator Card Collection**: View high-quality TCG cards for your acquired units.

### 5. Progression & Economy
- **Daily Missions**: Complete tasks like "Simulation Specialist" or "Neural Synchronization" to earn Orundum and Certificates.
- **Promotion System**: Level up your Doctor profile to unlock rewards and higher rank titles (Cadet to Elite).
- **Daily Mobilization**: Attendance-based rewards including Orundum and Recruitment Permits.

## 🛠️ Technical Stack
- **Frontend**: React + Vite + TailwindCSS + Framer Motion
- **Backend**: Supabase (Database, Realtime & Edge Functions)
- **Auth**: Firebase (Google & Guest Authentication)
- **AI**: Google Gemini Pro API
- **Deployment**: Firebase Hosting

## 🚀 Getting Started

1. Clone the repository: `git clone https://github.com/MaiyaLi/Arknights-TCG.git`
2. Install dependencies: `npm install`
3. Set up environment variables in `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
4. Run locally: `npm run dev`

---
*Developed for the Rhodes Island Central System.*