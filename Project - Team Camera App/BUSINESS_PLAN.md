# ERGON WORK MANAGEMENT - BUSINESS PLAN

## 1. ΕΚΤΕΛΕΣΤΙΚΗ ΠΕΡΙΛΗΨΗ

### Περιγραφή
Cross-platform mobile εφαρμογή (iOS, Android, Web) για διαχείριση ομάδων εργασίας, projects και tasks. Σχεδιάστηκε για field work management (κατασκευαστικές, αρχιτεκτονικά γραφεία, τεχνικές υπηρεσίες, facility management).

### Value Proposition
- **Offline-First**: Πλήρης λειτουργικότητα χωρίς internet
- **Real-Time Sync**: Αυτόματος συγχρονισμός σε WiFi
- **Ρόλοι & Δικαιώματα**: 4-level ιεραρχία (Founder → Admin → Supervisor → User)
- **Φωτογραφική Τεκμηρίωση**: Camera + GPS + annotations
- **PDF Reports**: Αυτόματη δημιουργία αναφορών
- **Google Drive Backup**: Αυτόματο backup φωτογραφιών, βίντεο και Excel αναφορών

---

## 2. ΤΕΧΝΟΛΟΓΙΚΟ STACK

| Τεχνολογία | Χρήση |
|------------|-------|
| React Native (Expo SDK 54) | Cross-platform |
| TypeScript | Type-safe code |
| Firebase Auth/Firestore/Storage | Backend |
| AsyncStorage | Offline cache & queue |
| Expo Router | File-based navigation |
| React Native SVG + View Shot | Drawing & capture |
| Expo Location | GPS |
| Expo AV | Video playback |
| react-native-compressor | Video compression |
| Expo Print/Sharing | PDF generation |
| Expo Image Manipulator | EXIF orientation fix |
| Google Drive API v3 (REST) | Cloud backup & sharing |
| ExcelJS | Excel αρχεία για Drive sync |

---

## 3. FIRESTORE DATABASE SCHEMA

### `users/{userId}`
`fullname`, `email`, `phone`, `avatar`, `createdAt`

### `teams/{teamId}`
`name`, `type`, `contactEmail`, `logo`, `createdAt`, `memberIds[]`, `roles: { [userId]: Role }`, `groups: [{ id, title, projects: [{ id, title, status, supervisors[], members[] }] }]`

### `projects/{projectId}`
`title`, `status` (active|pending|completed), `teamId`, `supervisors[]`, `members[]`, `createdBy`, `createdAt`, `tasks: Task[]`

**Task Types (Discriminated Union):**
- **PhotoTask:** `{ type: "photo", images: string[], imageLocations: GeoPoint[] }`
- **VideoTask:** `{ type: "video", videos: string[], videoLocations: GeoPoint[] }`
- **MeasurementTask:** `{ type: "measurement", value: string }`
- **GeneralTask:** `{ type: "general", value: string }`

Common fields: `id`, `title`, `description?`, `status`, `isLocal?`, `completedAt?`

### `invites/{inviteId}`
`code` (6 chars), `teamId`, `teamName`, `role`, `createdBy`, `createdAt`, `status`

### `driveConfig/{teamId}`
`refreshToken`, `accessToken`, `tokenExpiry`, `connectedEmail`, `connectedAt`

### `driveSyncState/{teamId}`
`lastSyncTimestamp`, `folderIds: { [path]: folderId }`, `sharedWith: string[]` (UIDs), `projects: { [projectId]: { lastSyncedTasksHash, syncedMedia, syncedPdfs } }`

---

## 4. ΡΟΛΟΙ & ΔΙΚΑΙΩΜΑΤΑ

| Ενέργεια | Founder | Admin | Supervisor | User |
|----------|---------|-------|------------|------|
| Διαγραφή Ομάδας | ✅ | - | - | - |
| Αλλαγή Ονόματος/Logo | ✅ | ✅ | - | - |
| Δημιουργία Group | ✅ | ✅ | - | - |
| Δημιουργία Project | ✅ | ✅ | ✅ | - |
| Ανάθεση Supervisors | ✅ | ✅ | - | - |
| Ανάθεση Members | ✅ | ✅ | ✅ | - |
| Πρόσκληση (Admin/Supervisor) | ✅ | ✅ | - | - |
| Πρόσκληση User | ✅ | ✅ | ✅ | - |
| Promote/Demote | ✅ | ✅ | - | - |
| Kick | ✅ | ✅ | ✅* | - |
| Task CRUD | ✅ | ✅ | ✅ | ✅ |
| Προβολή όλων Projects | ✅ | ✅ | ✅ | - |
| Προβολή assigned | ✅ | ✅ | ✅ | ✅ |
| Σύνδεση / Αποσύνδεση Drive | ✅ | ✅ | - | - |

*Supervisor kick μόνο Users

---

## 5. ΛΕΙΤΟΥΡΓΙΚΟΤΗΤΕΣ

### v2.0.1 (Current)
- **Google Drive Sync**: Full OAuth2 integration, auto-backup σε Google Drive
  - Αυτόματη δημιουργία φακέλων: Ergon Work Management → Team → Group → Project → Photos/Videos
  - Hash-based change detection (κανένα re-upload αν δεν άλλαξε τίποτα)
  - URL normalization (αγνοεί token αλλαγές στα Firebase Storage URLs)
  - Excel αρχείο ανά project (measurement + general tasks)
  - Auto-share team folder με όλα τα μέλη της ομάδας (writer role)
  - Progress indicator κατά τον συγχρονισμό
  - "Sync Now" button + "Άνοιγμα στο Drive" button
  - Auto-sync κατά το άνοιγμα της εφαρμογής (DriveSyncContext)
- **PDF Improvements**:
  - Μία φωτογραφία ανά σελίδα (page-break-before: always)
  - Τίτλος task μόνο στην πρώτη φωτογραφία κάθε task
  - Αρίθμηση ("Φωτογραφία 1, 2, 3...") σε κάθε σελίδα
  - EXIF orientation fix (ImageManipulator με `[{ rotate: 0 }]`)
  - GPS links για όλες τις φωτογραφίες (αφαίρεση .slice(0,4) ορίου)
  - Centering με `<center>` tag (WebKit-compatible)

---

## 6. GOOGLE DRIVE SYNC (v2.0.1)

### OAuth2 Flow
- Scope: `https://www.googleapis.com/auth/drive.file`
- Callback: `https://ergon-work.web.app/auth/callback/`
- Token refresh: αυτόματο με `refreshToken` πριν κάθε sync

### Folder Structure στο Drive
```
Ergon Work Management/
  └── {teamName}/
        └── {groupName}/
              └── {projectName}/
                    ├── Φωτογραφίες/    ← photos (jpg)
                    ├── Βίντεο/          ← videos (mp4)
                    └── {project}.xlsx   ← Excel με tasks
```

### Αρχεία
- `utils/driveAuth.ts` — OAuth2, token refresh, connect/disconnect
- `utils/driveApi.ts` — Drive REST API (folders, upload, share, delete)
- `utils/driveSyncEngine.ts` — Sync orchestration, hash detection, auto-share
- `utils/driveExcelGenerator.ts` — Excel generation με ExcelJS
- `app/context/DriveSyncContext.tsx` — Auto-sync on app open

### Auto-Share
Κατά τον πρώτο sync, ο team folder γίνεται αυτόματα share με όλα τα μέλη της ομάδας. Τα UIDs που έχουν ήδη πάρει πρόσβαση αποθηκεύονται στο `driveSyncState/{teamId}.sharedWith` για να αποφύγουμε duplicate API calls.

---

## 7. MEDIA STORAGE

### Firebase Storage
- Path: `teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{ext}`
- Photos: 70% compression, full resolution, JPEG
- Videos: 720p, 2.5Mbps, 4s max, MP4
- 10MB file size limit, auth required

### Google Drive (Backup)
- Photos: JPEG, original filename
- Videos: MP4, original filename
- Excel: `.xlsx` ανά project (measurement + general tasks)

---

## 8. BUSINESS MODEL (Planned)

| Tier | Τιμή | Features |
|------|------|----------|
| Free | 0€ | 1 ομάδα, 3 μέλη, 5 projects |
| Starter | 9.99€/μήνα | 1 ομάδα, 10 μέλη, 20 projects |
| Business | 29.99€/μήνα | 3 ομάδες, 50 μέλη, unlimited projects |
| Enterprise | Custom | Unlimited, custom features |

---

## 9. ROADMAP

### Phase 1 - MVP (Complete ✅)
Authentication, Teams, Invites, Projects, Tasks, Photo/Video, Image Editor, Offline, PDF, Search/Filter, 3-stage Status, Role Cleanup, Firebase Storage, Web Landing Page, Video Compression, OTA Updates, Google Drive Sync, Auto-Share Drive, PDF one-photo-per-page

### Phase 2 - Enhanced Features
- [ ] Push notifications
- [ ] Task comments & mentions
- [ ] Task deadlines & reminders
- [ ] File attachments (PDFs, docs)
- [ ] Calendar view

### Phase 3 - Advanced
- [ ] Analytics dashboard
- [ ] Time tracking
- [ ] Voice notes

### Phase 4 - Enterprise
- [ ] LDAP/SSO
- [ ] Custom workflows
- [ ] API integrations
- [ ] Multi-language support

---

## 10. PERFORMANCE TARGETS

- App launch: <2s
- Screen transition: <300ms
- Offline task save: <100ms
- Sync: <5s per project
- Image compression: <1s
- PDF generation: <3s for 20 tasks
- Drive sync: <30s per project (media upload dependent)

---

**Version**: 2.0.1
**Last Updated**: Φεβρουάριος 2026
