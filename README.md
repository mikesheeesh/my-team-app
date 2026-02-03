# Team Camera App - Ergon Work Management

Team-based work management application with camera integration for task documentation. Built with React Native, Expo, and Firebase.

## Features

### Core Functionality
- **Multi-Team Support**: Users can be members of multiple teams with role-based permissions (Owner, Supervisor, Member)
- **Project & Task Management**: Organize work into groups, projects, and tasks
- **3-Stage Task Status**: Active, Completed (Approved), Archived
- **Camera Integration**: Take photos and videos directly for tasks
- **Image Editor**: Built-in drawing tools, filters, and stickers
- **GPS Location**: Automatic location tagging for photos
- **Offline Mode**: Work offline and auto-sync when connection is restored
- **PDF Export**: Generate PDF reports with task photos and details

### Media Management (v2.0 - Firebase Storage)
- **Firebase Storage**: Photos and videos stored in Firebase Storage (not Firestore)
- **Full Camera Resolution**: Photos captured at full device resolution with 70% quality compression
- **HD Video**: Videos up to 1080p resolution, 4 seconds duration
- **Efficient Storage**: Only Storage URLs saved to Firestore (~100 bytes vs 500KB+ base64)
- **Team-Isolated Paths**: `teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{ext}`
- **10MB File Limit**: Per-file size restriction

### User Management
- **Firebase Authentication**: Email/password authentication
- **Role-Based Access**:
  - Owner: Full team control
  - Supervisor: Project and task management
  - Member: Task execution and photo upload
- **Invite System**: QR code-based team invitations

## Tech Stack

- **Framework**: React Native with Expo SDK 54
- **Routing**: Expo Router (file-based routing)
- **Backend**: Firebase (Auth, Firestore, Storage)
- **State Management**: React Context API
- **Styling**: NativeWind (TailwindCSS)
- **Media**: expo-camera, expo-image-picker, expo-image-manipulator
- **Offline**: AsyncStorage with automatic sync

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- Firebase project with Auth, Firestore, and Storage enabled

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd my-team-app
```

2. Install dependencies:
```bash
npm install
```

3. Configure Firebase:
   - Update `firebaseConfig.ts` with your Firebase project credentials
   - Deploy Storage rules: `firebase deploy --only storage`

4. Start the development server:
```bash
npm start
```

5. Run on your platform:
   - Press `w` for web
   - Press `a` for Android emulator
   - Press `i` for iOS simulator
   - Scan QR code with Expo Go app

## Project Structure

```
my-team-app/
├── app/                    # Main application (Expo Router)
│   ├── index.tsx          # Login screen
│   ├── team/[id].tsx      # Team management
│   ├── project/[id].tsx   # Project tasks view
│   └── components/        # Reusable UI components
├── utils/
│   └── storageUtils.ts    # Firebase Storage utilities
├── scripts/
│   └── migrateToStorage.ts # Base64 → Storage migration script
├── firebaseConfig.ts      # Firebase initialization
├── storage.rules          # Firebase Storage security rules
└── firebase.json          # Firebase configuration
```

## Firebase Storage Migration

If you have existing base64 media data in Firestore, run the migration script:

```bash
npm run migrate
```

This will:
- Convert all base64 images/videos to Firebase Storage
- Update Firestore with Storage URLs
- Print migration statistics

## Storage Rules

Firebase Storage rules enforce:
- Authentication required for all operations
- 10MB file size limit per upload
- Team isolation (configured in storage.rules)

Current rules allow all authenticated users. For team isolation, see `storage.rules` comments.

## Backup

The project includes Windows backup scripts:

```bash
# Run backup.bat (double-click)
# or
# Run backup.ps1 (PowerShell)
```

Backups are saved to `C:\Users\Michael\BackUp\` with timestamp.

See [BACKUP_README.md](BACKUP_README.md) for details.

## Development Scripts

```bash
npm start          # Start Expo dev server
npm run android    # Run on Android emulator
npm run ios        # Run on iOS simulator
npm run web        # Run on web browser
npm run migrate    # Migrate base64 media to Storage
```

## Key Components

### Photo Capture Flow
1. User selects "Photo" task
2. Camera launches (expo-camera)
3. Photo captured → Image Editor (filters, drawing)
4. Save → Compress (70%, full resolution) → Upload to Storage
5. Storage URL saved to Firestore task

### Video Capture Flow
1. User selects "Video" task
2. Camera launches with video mode
3. Record (max 4 seconds, 1080p)
4. Upload to Storage → URL saved to Firestore

### Offline Sync
1. Tasks created offline → Saved to AsyncStorage
2. Media stored as local file:// URIs
3. On reconnect → SyncContext uploads to Storage
4. Firestore updated with cloud data

## Configuration

### Image Quality
- Compression: 70% (0.7)
- Resolution: Full camera resolution (no resize)
- Format: JPEG

### Video Settings
- Quality: High (1080p)
- Duration: 4 seconds max
- Format: MP4

### Storage Paths
```
teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{ext}
```

## Security

- Firebase Authentication required for all operations
- Storage rules enforce authentication
- Role-based permissions in Firestore rules
- Client-side permission checks in UI

## Known Issues

- Team isolation in Storage rules not fully implemented (requires Cloud Functions)
- Offline video upload may fail on slow connections
- PDF generation doesn't support video thumbnails

## Future Improvements

- [ ] Cloud Functions for team permission enforcement
- [ ] Video thumbnail generation
- [ ] Image optimization pipeline
- [ ] Progressive Web App (PWA) support
- [ ] Push notifications for task assignments

## License

MIT

## Contributors

- Michael - Development
- Claude Sonnet 4.5 - AI Assistant

---

**Version**: 2.0.0
**Last Updated**: February 2026
**Firebase SDK**: v12.8.0
**Expo SDK**: v54.0.32
