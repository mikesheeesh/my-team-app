# ERGON WORK MANAGEMENT - SERVICE FLOWS

## ΠΕΡΙΕΧΟΜΕΝΑ
1. [Authentication](#1-authentication-flow)
2. [Team Creation](#2-team-creation-flow)
3. [Invite System](#3-invite-system-flow)
4. [Join Team](#4-join-team-flow)
5. [Project Management](#5-project-management-flow)
6. [Task Management](#6-task-management-flow)
7. [Photo Task](#7-photo-task-flow)
8. [Video Task](#8-video-task-flow)
9. [Image Editor](#9-image-editor-flow)
10. [Task Edit & Delete](#10-task-edit--delete-flow)
11. [Media Sharing](#11-media-sharing-flow)
12. [Offline Sync](#12-offline-sync-flow)
13. [PDF Generation](#13-pdf-generation-flow)
14. [User Role Management](#14-user-role-management-flow)
15. [Project Search & Filter](#15-project-search--filter-flow)
16. [3-Stage Project Status](#16-3-stage-project-status-flow)
17. [Role Change Cleanup](#17-role-change-cleanup-flow)
18. [Google Drive Sync](#18-google-drive-sync-flow)
19. [Open in Drive](#19-open-in-drive-flow)

---

## 1. AUTHENTICATION FLOW

### `app/index.tsx` (Landing)
1. SplashScreen → Deep Link check → Auth state check
2. Αν user → `/dashboard`, αλλιώς → Landing screen
3. Custom loading screen με logo + version number

### `app/login.tsx`
**Εγγραφή:** Validate → `createUserWithEmailAndPassword` → `updateProfile(displayName)` → Create Firestore user doc → Cache → `/dashboard`

**Σύνδεση:** Validate → `signInWithEmailAndPassword` → Fetch & cache user data → `/dashboard`

**Errors:** invalid-email, user-not-found, wrong-password, email-already-in-use, weak-password, network-request-failed

---

## 2. TEAM CREATION FLOW

### `app/onboarding/create-team.tsx`
1. Network check → Input validation (name, type, email)
2. `addDoc("teams", { name, type, contactEmail, memberIds: [uid], roles: { [uid]: "Founder" }, groups: [] })`
3. → `/dashboard`

---

## 3. INVITE SYSTEM FLOW (v2.0)

### `app/onboarding/invite.tsx`
1. Fetch myRole → Determine availableRoles (Founder/Admin → all, Supervisor → User only)
2. Generate 6-char code (excluded: 0, O, I, 1, L)
3. Create invite doc: `{ code, teamId, teamName, role, createdBy, status: "active" }`
4. Generate web URL: `https://ergon-work.web.app/join?code=X&team=Y`
5. Share message με clickable link + κωδικός + expiration (2 min)

### Web Landing Page (`static/invite/index.html` → `dist/invite/`)
- Hosted on Firebase Hosting
- Mobile: Auto-redirect via `ergonwork://join?inviteCode=X`
- Desktop: "Άνοιξε από κινητό" message
- Fallback: Download APK button (2sec timeout)

---

## 4. JOIN TEAM FLOW (v2.0)

### `app/join.tsx`
1. Auth check → Auto-fill code from deep link
2. Auto-join: `setTimeout(() => handleJoin(), 500)` αν code ready
3. Query invite → Expiration check (>120sec → delete + alert)
4. Already member check → Add to team: `arrayUnion(userId)` + role
5. Delete invite (one-time use) → Success → `/dashboard`

**End-to-end: ~3 seconds, zero manual actions**

---

## 5. PROJECT MANAGEMENT FLOW

### `app/team/[id].tsx`

**Data Loading:** Cache first → Firestore listener (onSnapshot) → Live project listener

**Create Group:** Online check → Input → `{ id: Date.now(), title, projects: [] }` → updateDoc

**Create Project:** Online check → Input → `setDoc("projects", { title, status: "active", supervisors, members: [], tasks: [], teamId })` + update team groups

**Delete Project:** Confirm → Remove from group → deleteDoc

**Move Project:** Select target group → Update groups array → updateDoc

---

## 6. TASK MANAGEMENT FLOW

### `app/project/[id].tsx`

**Data Loading:** Cache → onSnapshot → Merge (Map: cloud + local, local overwrites)

**Create Task:** Modal → Input (title, description, type) → `saveTaskLocal({ id, title, type, status: "pending", isLocal: true })`

**Complete Task:** Input value → `saveTaskLocal({ ...task, value, status: "completed" })`

**Task Types:** photo, video, measurement, general

---

## 7. PHOTO TASK FLOW (v2.0)

1. Camera capture (expo-image-picker)
2. GPS location (Accuracy.Balanced, fallback: 0,0)
3. Image Editor → User draws/annotates
4. Compress: 70% quality, full resolution, JPEG
5. Upload to Firebase Storage → Get URL
6. `saveTaskLocal({ images: [..., storageUrl], imageLocations: [..., location], status: "completed" })`

**Gallery:** FlatList grid (3 cols) → Full view → Share/Delete

---

## 8. VIDEO TASK FLOW (v2.1)

1. Camera capture (videoQuality: 0, max 4s)
2. Compress: react-native-compressor (720p, 2.5Mbps, ~70% reduction)
3. GPS location (parallel)
4. Upload to Firebase Storage → Get URL
5. `saveTaskLocal({ videos: [..., storageUrl], videoLocations: [..., location], status: "completed" })`

**Multiple videos support:** `videos: string[]`, `videoLocations: GeoPoint[]`
**Backward compat:** `normalizeVideoTask()` helper

---

## 9. IMAGE EDITOR FLOW

### `app/components/ImageEditorModal.tsx`

**Drawing:** PanResponder → SVG paths, 6 colors, 3 stroke widths, Undo
**Pan/Zoom:** Move mode, 1x-3x zoom with Animated values
**Boundary checks (v2.1):** 15px edge margin, wild value detection, prevents line jumps/flicks
**Save:** Capture canvas → Base64 → Replace original

---

## 10. TASK EDIT & DELETE FLOW

**Edit:** Long press → Action sheet → Edit modal (title, description, type) → saveTaskLocal
**Delete:** Long press → Confirm → Remove from local + cloud → updateDoc

---

## 11. MEDIA SHARING FLOW

**Share Image/Video:** Convert to file (if base64) → `Sharing.shareAsync(fileUri)`
**Delete Media:** Confirm → Remove from arrays (images/imageLocations) → Update status → saveTaskLocal

---

## 12. OFFLINE SYNC FLOW

### `app/context/SyncContext.tsx`

**Network Listener:** WiFi connected → auto sync (1sec delay)

**Manual Sync:** syncNow → Network check → Cellular confirmation → performGlobalSync

**Global Sync Process:**
1. Lock check (isSyncingRef)
2. Find all queue keys (`offline_tasks_queue_*`)
3. For each project:
   - Fetch cloud state
   - Process media: `file://` → upload, `data:` → migrate, `https://` → keep
   - Merge local into cloud
   - `updateDoc({ tasks: mergedList, status })`
4. Set `justSyncedProjectId` (2sec reset)
5. Remove queue key

**Abort:** `shouldAbortRef` flag for instant stop on WiFi drop
**Retry:** Re-sync check after 3sec if queue still has items
**Failed files:** Max 3 retries, then remove from queue

**Local Cleanup:** Watch cloud+local → Filter remaining (keep if not synced or different) → Update AsyncStorage

---

## 13. PDF GENERATION FLOW (v2.0.1)

### `app/project/[id].tsx` → `generatePDF()`

1. Calculate stats (total, completed, progress %)
2. Preprocess photos: `ImageManipulator.manipulateAsync(url, [{ rotate: 0 }])` → bakes EXIF orientation into pixels
3. Build HTML:
   - Header (gradient) + Summary cards (4) + Task cards (GPS links για όλες φωτογραφίες, completion dates)
   - **Photo Appendix** (μετά τα video tasks): Μία φωτογραφία ανά σελίδα (`page-break-before: always`)
     - Πρώτη φωτογραφία κάθε task: τίτλος task + "Φωτογραφία 1" + `<center><img></center>`
     - Υπόλοιπες: μόνο "Φωτογραφία N" + `<center><img></center>`
   - Footer
4. `Print.printToFileAsync({ html })` → `Sharing.shareAsync(uri)`

**CSS tricks για WebKit PDF:**
- `page-break-before: always` για photo pages
- `<center>` tag (πιο надежний από CSS `margin:auto` στο WebKit)
- `max-width: 100%; max-height: 80vh` για φωτογραφίες

---

## 14. USER ROLE MANAGEMENT FLOW

### `app/team/[id].tsx` → `changeUserRole()`

**Promote:** User→Supervisor, Supervisor→Admin
**Demote:** Admin→Supervisor, Supervisor→User
**Kick:** Confirm → Remove from team (memberIds, roles) → Remove from all projects (supervisors[], members[])

Permission checks: Supervisor can only manage Users, Founder cannot be changed.

---

## 15. PROJECT SEARCH & FILTER FLOW

### `app/team/[id].tsx`

**Search:** Real-time TextInput → case-insensitive title filter
**Status Filter:** Bottom Sheet Modal (all/active/pending/completed) με radio buttons
**Persistence:** AsyncStorage per team (`team_filters_${teamId}`)
**Visual:** Blue badge dot when filter active

**Filter Pipeline (3-stage):**
1. Role-based (Users see only assigned projects)
2. Status filter
3. Search filter

---

## 16. 3-STAGE PROJECT STATUS FLOW

### `app/project/[id].tsx`

| Status | Condition | Badge |
|--------|-----------|-------|
| active | 0% completed | Blue |
| pending | 1-99% completed | Orange |
| completed | 100% completed | Green |

**Auto-transitions:** useEffect watches combinedTasks → Calculate → updateDoc if changed
**Bidirectional:** completed → pending (on photo delete), pending → active (all tasks reset)

---

## 17. ROLE CHANGE CLEANUP FLOW

### `app/team/[id].tsx` → `changeUserRole()`

| Role Change | Action |
|-------------|--------|
| User → Supervisor | Remove from `members[]` |
| Supervisor → User | Remove from `supervisors[]` |
| Supervisor → Admin | Remove from `supervisors[]` |
| Admin → Supervisor | No action (Admins never in arrays) |

**No auto-assignment** - manual re-assignment only via Project Settings modal.

---

## 18. GOOGLE DRIVE SYNC FLOW (v2.0.1)

### Αρχεία
- `utils/driveAuth.ts` — OAuth2, token refresh, connect/disconnect
- `utils/driveApi.ts` — Drive REST API wrapper (folders, upload, share, delete, permissions)
- `utils/driveSyncEngine.ts` — Sync orchestration
- `utils/driveExcelGenerator.ts` — Excel generation
- `app/context/DriveSyncContext.tsx` — Auto-sync context
- `app/team/[id].tsx` — Drive Sync Modal UI

### 18a. Connect Google Drive

1. User πατάει "Σύνδεση Google Drive" στο Drive Sync Modal
2. `connectGoogleDrive(teamId)` → Open OAuth2 URL (Google Auth)
3. Callback: `https://ergon-work.web.app/auth/callback/` → Extract `code`
4. Exchange code → `{ access_token, refresh_token, expires_in }`
5. Save στο Firestore: `driveConfig/{teamId}` `{ refreshToken, accessToken, tokenExpiry, connectedEmail, connectedAt }`
6. Modal ενημερώνεται: "Συνδεδεμένο" + email + ημερομηνία

**Σημείωση:** `static/auth/callback/index.html` → `dist/auth/callback/index.html` (πρέπει να αντιγράφεται πριν κάθε Firebase deploy, γιατί το EAS update διαγράφει το `dist/`)

### 18b. Auto-Sync on App Open

### `app/context/DriveSyncContext.tsx`
1. onSnapshot στο `projects/{projectId}` → `docChanges().length > 0` → trigger sync
2. `triggerDriveSync(teamId)` → queue sync ανά project
3. Αποφεύγει concurrent syncs με `isSyncingRef`

### 18c. Sync Process (`syncProjectToDrive`)

1. `getValidAccessToken(teamId)` — refresh αν `tokenExpiry < now`
2. Load project data + team data + group info
3. **Hash check:** `computeTasksHash(tasks)` (με normalized URLs — χωρίς token params) vs saved hash → skip αν ίδιο
4. `ensureFolderStructure(teamName, groupName, projectName)`:
   - Root: "Ergon Work Management" (στο "root" Drive)
   - Level 1: `{teamName}/`
   - Level 2: `{teamName}/{groupName}/`
   - Level 3: `{teamName}/{groupName}/{projectName}/`
   - Level 4: `Φωτογραφίες/` + `Βίντεο/`
   - Folder IDs cached στο `syncState.folderIds`
5. **Auto-share:** Για κάθε νέο μέλος (που δεν είναι στο `sharedWith`):
   - Fetch email από `users/{uid}`
   - `shareFolderWithEmail(teamFolderId, email, "writer")` με `sendNotificationEmail=false`
   - Save UID στο `syncState.sharedWith`
6. **Upload photos:** Firebase Storage URL → fetch blob → `uploadFileResumable` στο Drive Photos folder
7. **Upload videos:** Firebase Storage URL → fetch blob → `uploadFileResumable` στο Drive Videos folder
8. **Excel generation:** `generateProjectExcel(tasks)` → upload/update `.xlsx` στο project folder
9. Save hash + `saveSyncState(teamId, syncState)`

### 18d. Hash-based Change Detection

```typescript
computeTasksHash(tasks):
  - Για κάθε task: id + title + status + type-specific data
  - Φωτογραφίες: normalizeStorageUrl(url) → αφαιρεί ?token=... params
  - SHA-256 → hex string
```

**Σκοπός:** Αποφυγή re-upload όταν αλλάζει μόνο το token στο Firebase Storage URL.

### 18e. Disconnect

`disconnectGoogleDrive(teamId)` → Delete `driveConfig/{teamId}` doc → Modal επιστρέφει σε "Μη Συνδεδεμένο"

---

## 19. OPEN IN DRIVE FLOW (v2.0.1)

### `app/team/[id].tsx` — "Άνοιγμα στο Drive" button

1. User πατάει "Άνοιγμα στο Drive" (πράσινο κουμπί στο Drive Sync Modal)
2. Fetch `driveSyncState/{teamId}` → `folderIds`
3. `folderId = folderIds[teamName] || folderIds["root"]`
4. `Linking.openURL("https://drive.google.com/drive/folders/{folderId}")`

**Errors:** Αν δεν έχει γίνει ακόμα sync → Alert "Κάντε πρώτα συγχρονισμό"

---

## APPENDIX: STATE & STORAGE

### AsyncStorage Keys
- `user_profile_data_cache` → User profile
- `cached_my_teams` → Teams list
- `cached_team_{teamId}` → Team data
- `cached_project_tasks_{id}` → Project tasks
- `offline_tasks_queue_{id}` → Pending sync

### Firebase Collections
- `users/{userId}`, `teams/{teamId}`, `projects/{projectId}`, `invites/{inviteId}`
- `driveConfig/{teamId}` — Google Drive OAuth credentials
- `driveSyncState/{teamId}` — Folder IDs, sync hashes, shared members

### Firebase Storage
- `teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{jpg|mp4}`

### Google Drive Structure
- `Ergon Work Management/{teamName}/{groupName}/{projectName}/Φωτογραφίες/`
- `Ergon Work Management/{teamName}/{groupName}/{projectName}/Βίντεο/`
- `Ergon Work Management/{teamName}/{groupName}/{projectName}/{projectName}.xlsx`

---

**Version**: 2.0.1
**Last Updated**: Φεβρουάριος 2026
