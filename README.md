# Ergon Work Management

Cross-platform mobile app (iOS, Android, Web) για διαχείριση ομάδων εργασίας με camera integration. Built with React Native, Expo SDK 54, and Firebase.

## Features

- **Multi-Team Support**: Role-based permissions (Founder, Admin, Supervisor, User)
- **Project & Task Management**: Groups, projects, 4 task types (photo, video, measurement, general)
- **3-Stage Status**: Active → Pending → Completed (auto-transitions)
- **Camera Integration**: Photos with GPS + drawing editor, Videos (4s, 720p compressed)
- **Firebase Storage**: Media stored in Storage, URLs in Firestore (99.98% smaller docs)
- **Offline Mode**: AsyncStorage queue, WiFi auto-sync, cellular confirmation
- **PDF Export**: Professional reports with thumbnails, GPS links, completion dates
- **Invite System**: Clickable web links, auto-join (~3sec workflow)
- **OTA Updates**: expo-updates with EAS Update

## Tech Stack

- **Framework**: React Native + Expo SDK 54 + TypeScript
- **Routing**: Expo Router (file-based)
- **Backend**: Firebase (Auth, Firestore, Storage)
- **State**: React Context API + AsyncStorage
- **Media**: expo-image-picker, react-native-compressor, React Native SVG

## Getting Started

```bash
npm install
npm start
# Press w (web), a (Android), i (iOS), or scan QR with Expo Go
```

Configure Firebase credentials in `firebaseConfig.ts`.

## Project Structure

```
app/
├── index.tsx            # Landing + custom loading screen
├── dashboard.tsx        # Main dashboard
├── team/[id].tsx        # Team management (real-time)
├── project/[id].tsx     # Tasks, media, PDF export
├── components/          # ImageEditorModal, etc.
└── context/             # SyncContext (offline sync)
utils/storageUtils.ts    # Firebase Storage utilities
```

## Scripts

```bash
npm start          # Dev server
npm run android    # Android
npm run ios        # iOS
npm run web        # Web
npm run migrate    # Migrate base64 → Storage
```

## Documentation

- [BUSINESS_PLAN.md](Project%20-%20Team%20Camera%20App/BUSINESS_PLAN.md) - Schema, features, roadmap
- [SERVICE_FLOWS.md](Project%20-%20Team%20Camera%20App/SERVICE_FLOWS.md) - Detailed flows
- [BACKUP_README.md](BACKUP_README.md) - Backup scripts

---

**Version**: 2.2.0 | **Expo SDK**: 54 | **Firebase SDK**: v12.8.0
