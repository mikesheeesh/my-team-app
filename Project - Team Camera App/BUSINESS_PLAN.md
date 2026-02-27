# ERGON WORK MANAGEMENT - BUSINESS PLAN

## 1. ΕΚΤΕΛΕΣΤΙΚΗ ΠΕΡΙΛΗΨΗ

### Περιγραφή
Cross-platform mobile εφαρμογή (iOS, Android) για διαχείριση ομάδων εργασίας, projects και tasks. Σχεδιάστηκε για field work management (κατασκευαστικές, αρχιτεκτονικά γραφεία, τεχνικές υπηρεσίες, facility management).

### Value Proposition
- **Offline-First**: Πλήρης λειτουργικότητα χωρίς internet
- **Real-Time Sync**: Αυτόματος συγχρονισμός μέσω onSnapshot (Firestore)
- **Ρόλοι & Δικαιώματα**: 4-level ιεραρχία (Founder → Admin → Supervisor → Μέλος)
- **Φωτογραφική Τεκμηρίωση**: Camera + GPS + annotations (drawing editor)
- **PDF Reports**: Αυτόματη δημιουργία αναφορών ανά project
- **Google Drive Backup**: Αυτόματο backup φωτογραφιών, βίντεο και Excel αναφορών
- **Activity Log**: Ιστορικό ενεργειών ανά project σε real-time
- **Admin Panel (Web)**: Διαχείριση μελών, tasks και αρχείων μέσω browser

---

## 2. ΤΕΧΝΟΛΟΓΙΚΟ STACK

| Τεχνολογία | Χρήση |
|------------|-------|
| React Native (Expo SDK 54) | Cross-platform mobile |
| TypeScript | Type-safe code |
| Firebase Auth / Firestore / Storage | Backend |
| AsyncStorage | Offline cache & sync queue |
| Expo Router | File-based navigation |
| React Native SVG + ViewShot | Drawing editor & capture |
| Expo Location | GPS |
| Expo AV | Video playback |
| react-native-compressor | Video compression |
| Expo Print / Sharing | PDF generation |
| Expo Image Manipulator | EXIF orientation fix |
| Expo Network | Online/offline detection |
| Google Drive API v3 (REST) | Cloud backup |
| ExcelJS | Excel αρχεία για Drive sync |
| Firebase Hosting | Invite landing page + Admin Panel web app |

---

## 3. FIRESTORE DATABASE SCHEMA

### `users/{userId}`
`fullname`, `email`, `phone`, `createdAt`

### `teams/{teamId}`
`name`, `type`, `contactEmail`, `createdAt`, `memberIds[]`, `roles: { [userId]: Role }`, `groups: [{ id, title, projects: [{ id, title, status, supervisors[], members[] }] }]`

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

### `activityLog/{projectId}/entries/{entryId}`
`userId`, `userFullname`, `action`, `taskId`, `taskTitle`, `timestamp`

Actions: `task_created`, `task_deleted`, `photo_added`, `photo_deleted`, `video_added`, `video_deleted`, `value_set`, `value_cleared`, `task_completed`

### `driveConfig/{teamId}`
`refreshToken`, `accessToken`, `tokenExpiry`, `connectedEmail`, `connectedAt`

### `driveSyncState/{teamId}`
`lastSyncTimestamp`, `folderIds: { [path]: folderId }`, `sharedWith: string[]` (UIDs), `projects: { [projectId]: { lastSyncedTasksHash, syncedMedia } }`

---

## 4. ΡΟΛΟΙ & ΔΙΚΑΙΩΜΑΤΑ

| Ενέργεια | Founder | Admin | Supervisor | Μέλος |
|----------|:-------:|:-----:|:----------:|:-----:|
| Δημιουργία ομάδας | ✅ | - | - | - |
| Διαγραφή ομάδας | ✅ | - | - | - |
| Δημιουργία Group | ✅ | ✅ | ✅ | - |
| Δημιουργία Project | ✅ | ✅ | ✅ | - |
| Διαγραφή Project | ✅ | ✅ | - | - |
| Μεταφορά Project | ✅ | ✅ | - | - |
| Ανάθεση Supervisors/Members | ✅ | ✅ | - | - |
| Πρόσκληση Admin | ✅ | ✅ | - | - |
| Πρόσκληση Supervisor | ✅ | ✅ | - | - |
| Πρόσκληση Μέλους | ✅ | ✅ | ✅ | - |
| Promote/Demote μελών | ✅ | ✅* | - | - |
| Αφαίρεση μελών | ✅ | ✅* | Μόνο Μέλη | - |
| Task CRUD | ✅ | ✅ | ✅ | ✅ |
| PDF Export | ✅ | ✅ | ✅ | ✅ |
| Google Drive (Σύνδεση/Sync) | ✅ | ✅ | - | - |
| Admin Panel (web) | ✅ | ✅ | - | - |

*Admin δεν μπορεί να τροποποιήσει άλλον Admin ή Founder

---

## 5. ΛΕΙΤΟΥΡΓΙΚΟΤΗΤΕΣ ANA ΕΚΔΟΣΗ

### v2.0 — Core MVP
Authentication, Teams, Invites, Projects, Tasks (photo/video/measurement/general), Image Editor, Offline-first, PDF Export, Search/Filter, 3-stage Status, Role management, Firebase Storage, OTA Updates (EAS Update)

### v2.0.1 — Google Drive
- Full OAuth2 integration με Google Drive
- Αυτόματη δημιουργία φακέλων: Ergon Work Management → Team → Group → Project → Φωτογραφίες/Βίντεο
- Hash-based change detection (αποφυγή re-upload)
- Excel αρχείο ανά project (measurement + general tasks)
- Auto-share team folder με όλα τα μέλη (writer role)
- Invite landing page (`ergon-work.web.app/invite`)

### v2.2.0 — Image Editor + Video
- Image Editor: ViewShot capture, Pan mode, 6 χρώματα, 3 μεγέθη, Undo, Reset
- Video compression: 720p, 2.5Mbps
- Multiple photos/videos ανά task

### v2.2.2 — Admin Panel + Activity Log + Offline Guards
- **Activity Log**: `utils/activityLog.ts`, Firestore subcollection `activityLog/{projectId}/entries`
  - Καταγραφή: task create/delete, photo/video add/delete, value set/clear, task complete
  - Εμφάνιση: εικονίδιο 🕐 στο header project → modal με τελευταίες 50 εγγραφές
- **Admin Panel (Web)**: `static/admin/index.html` → `ergon-work.web.app/admin`
  - Tab Μέλη: αλλαγή ρόλων, αφαίρεση μελών
  - Tab Έργα: λίστα projects → tasks με multi-select + bulk delete
  - Tab Storage: αρχεία ανά project, multi-select + bulk delete
  - Πρόσβαση: Σελίδα ομάδας → ⋮ → Admin Panel (Founder/Admin μόνο)
- **Offline Guards**: Alert "Offline" αν δεν υπάρχει internet σε:
  - Google Drive Sync Now / Connect / Disconnect / Open in Drive
  - Admin Panel (Linking.openURL)
- **Confirmation dialogs**: Alert επιβεβαίωσης πριν διαγραφή τιμής (measurement/general tasks)

### v2.2.5 — Current
- Version bump (dashboard, splash screen, landing screen, MANUAL.md)
- Filter logic: Ενεργά = ≥1 completed task, Εκκρεμή = 0 completed tasks

---

## 6. GOOGLE DRIVE SYNC

### OAuth2 Flow
- Scope: `https://www.googleapis.com/auth/drive.file`
- Callback: `https://ergon-work.web.app/auth/callback/`
- Token refresh: αυτόματο πριν κάθε sync
- **Σημείωση deploy**: Το EAS update αντικαθιστά το `dist/` → πρέπει `npx firebase deploy --only hosting:app` μετά από κάθε OTA

### Folder Structure στο Drive
```
Ergon Work Management/
  └── {teamName}/
        └── {groupName}/
              └── {projectName}/
                    ├── Φωτογραφίες/    ← photos (jpg)
                    ├── Βίντεο/          ← videos (mp4)
                    └── {project}.xlsx   ← measurement + general tasks
```

### Αρχεία
- `utils/driveAuth.ts` — OAuth2, token refresh, connect/disconnect
- `utils/driveApi.ts` — Drive REST API (folders, upload, share)
- `utils/driveSyncEngine.ts` — Sync orchestration, hash detection, auto-share
- `utils/driveExcelGenerator.ts` — Excel generation με ExcelJS
- `app/context/DriveSyncContext.tsx` — Auto-sync on project changes (30s debounce)

### Auto-Share
Κατά τον πρώτο sync, ο team folder γίνεται αυτόματα share με όλα τα μέλη. UIDs που έλαβαν πρόσβαση αποθηκεύονται στο `driveSyncState/{teamId}.sharedWith`.

---

## 7. MEDIA STORAGE

### Firebase Storage
- Path: `teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{ext}`
- Photos: 70% quality, full resolution, JPEG
- Videos: 720p, 2.5Mbps, MP4 (react-native-compressor)

### Google Drive (Backup)
- Photos: JPEG, original filename
- Videos: MP4, original filename
- Excel: `.xlsx` ανά project (measurement + general tasks)

---

## 8. ADMIN PANEL (WEB)

### Αρχεία
- `static/admin/index.html` → deployed στο `ergon-work.web.app/admin`
- Vanilla JS + Firebase SDK (CDN)

### Tabs
| Tab | Λειτουργίες |
|-----|-------------|
| Μέλη | Λίστα μελών, αλλαγή ρόλου, αφαίρεση |
| Έργα | Λίστα projects → tasks list με multi-select + bulk delete |
| Storage | Αρχεία ανά project, multi-select checkboxes + bulk delete |

### Πρόσβαση
Μόνο Founder / Admin. Ανοίγει από: Σελίδα Ομάδας → ⋮ → Admin Panel. Απαιτεί internet.

---

## 9. BUSINESS MODEL (Planned)

| Tier | Τιμή | Features |
|------|------|----------|
| Free | 0€ | 1 ομάδα, 3 μέλη, 5 projects |
| Starter | 9.99€/μήνα | 1 ομάδα, 10 μέλη, 20 projects |
| Business | 29.99€/μήνα | 3 ομάδες, 50 μέλη, unlimited projects |
| Enterprise | Custom | Unlimited, custom features |

---

## 10. ROADMAP

### Phase 1 — MVP (Complete ✅)
Authentication, Teams, Invites, Projects, Tasks (4 types), Image Editor (ViewShot), Offline-first, PDF Export, Search/Filter, 3-stage Status, Role management, Firebase Storage, OTA Updates, Google Drive Sync, Activity Log, Admin Panel (web), Offline guards, Confirmation dialogs

### Phase 2 — Enhanced Features
- [ ] Push notifications
- [ ] Task comments & mentions
- [ ] Task deadlines & reminders
- [ ] File attachments (PDFs, docs)
- [ ] Calendar view

### Phase 3 — Advanced
- [ ] Analytics dashboard
- [ ] Time tracking
- [ ] Voice notes

### Phase 4 — Enterprise
- [ ] LDAP/SSO
- [ ] Custom workflows
- [ ] API integrations
- [ ] Multi-language support

---

## 11. PERFORMANCE TARGETS

- App launch: <2s
- Screen transition: <300ms
- Offline task save: <100ms
- Sync: <5s per project
- Image compression: <1s
- PDF generation: <3s for 20 tasks
- Drive sync: <30s per project (media upload dependent)

---

**Version**: 2.2.5
**Last Updated**: Φεβρουάριος 2026
