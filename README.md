<div align="center">
  <img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Arknights: Tactical Sync

A web-based multiplayer tactical simulation game inspired by the visual aesthetics and world-building of Arknights. Build your squad, recruit elite operators, and engage in real-time PvP combat within a sleek, Rhodes Island-inspired terminal interface.

## ✨ Key Features

### 🛡️ Tactical Combat Systems
*   **Conflict Zone (Multiplayer PvP):** Real-time, synchronized tactical battles against other players. Deploy units on a grid, manage resources (DP/Orundum), and outmaneuver opponents in a turn-based tactical environment.
*   **Simulation Mode:** Single-player tactical simulations against advanced AI behavior for testing team compositions and earning resources.
*   **Grid-Based Movement & Combat:** Strategic deployment with unit ranges, attack patterns, and specialized item usage.

### 👥 Personnel & Progression
*   **Headhunting System:** Spend Orundum and permits to recruit new operators through a stylized gacha system featuring authentic rarities (3★ to 6★).
*   **Squad Management:** Assemble and save multiple customized squads to prepare for different tactical scenarios.
*   **Operator Progression:** Earn experience from battles to level up your player profile and empower your units.
*   **Logistics Terminal:** A fully functional shop system to exchange resources, buy permits, and purchase tactical items.

### 🖥️ High-Fidelity UI/UX
*   **Rhodes Island Aesthetic:** Features a sleek, dark-mode terminal interface with authentic Arknights typography, vibrant neon accents, and immersive micro-animations.
*   **Dynamic Visuals:** Responsive glassmorphism design, detailed operator cards, and stylized tactical overlays.
*   **Responsive Design:** Fully optimized for both desktop browsers and mobile (landscape) orientations.

### ☁️ Cloud & Synchronization
*   **Persistent Profiles:** Seamless login via Google or Guest accounts using Firebase Authentication.
*   **Multi-Database Sync:** Player states, currency, and inventories are persisted via Firebase.
*   **Real-time Multiplayer Server:** Powered by a custom Express/Socket.io backend for low-latency state synchronization during PvP matches.

## 🚀 Quick Start

**Prerequisites:**  Node.js (v20+)

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Configure your environment variables in `.env` (Firebase configuration, Server URLs).
3. Start the development server (Frontend + Backend):
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

## 🛠️ Technology Stack
*   **Frontend:** React 19, TypeScript, Vite, TailwindCSS (v4), Motion (Framer Motion)
*   **Backend:** Node.js, Express, Socket.io (WebSocket for real-time multiplayer)
*   **Database/Auth:** Firebase (Firestore + Authentication)
*   **UI Components:** Shadcn UI, Base UI, Lucide Icons
