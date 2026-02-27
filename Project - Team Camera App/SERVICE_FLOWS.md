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
11. [Media Actions](#11-media-actions-flow)
12. [Offline Sync](#12-offline-sync-flow)
13. [PDF Generation](#13-pdf-generation-flow)
14. [Activity Log](#14-activity-log-flow)
15. [User Role Management](#15-user-role-management-flow)
16. [Project Search & Filter](#16-project-search--filter-flow)
17. [3-Stage Project Status](#17-3-stage-project-status-flow)
18. [Google Drive Sync](#18-google-drive-sync-flow)
19. [Admin Panel (Web)](#19-admin-panel-web-flow)

---

## 1. AUTHENTICATION FLOW

### `app/index.tsx` (Landing)
1. SplashScreen → Deep Link check → Auth state check
2. Αν user → `/dashboard`, αλλιώς → Landing screen
3. Custom loading screen: logo + `v2.2.5` (κάτω αριστερά)
4. Welcome screen: "Σύνδεση / Εγγραφή" button + version footer

### `app/login.tsx`
**Εγγραφή:** Validate → `createUserWithEmailAndPassword` → `updateProfile(displayName)` → Create Firestore user doc → Cache → `/dashboard`

**Σύνδεση:** Validate → `signInWithEmailAndPassword` → Fetch & cache user data → `/dashboard`

**Errors (στα ελληνικά):** invalid-email, user-not-found, wrong-password, email-already-in-use, weak-password, network-request-failed

---

## 2. TEAM CREATION FLOW

### `app/onboarding/create-team.tsx`
1. Network check → Input validation (name, type, contactEmail)
2. `addDoc("teams", { name, type, contactEmail, memberIds: [uid], roles: { [uid]: "Founder" }, groups: [] })`
3. → `/dashboard`

---

## 3. INVITE SYSTEM FLOW

### `app/onboarding/invite.tsx`
1. Fetch myRole → Determine availableRoles:
   - Founder → Admin, Supervisor, Μέλος
   - Admin → Admin, Supervisor, Μέλος
   - Supervisor → Μέλος μόνο
2. Generate 6-char code (excluded: 0, O, I, 1, L)
3. Create invite doc: `{ code, teamId, teamName, role, createdBy, status: "active" }`
4. Generate web URL: `https://ergon-work.web.app/join?code=X&team=Y`
5. Share message: clickable link + κωδικός + expiration (2 λεπτά, μία χρήση)

### Web Landing Page (`static/invite/index.html` → deployed `dist/invite/`)
- Hosted on Firebase Hosting
- Mobile: Auto-redirect via `ergonwork://join?inviteCode=X`
- Desktop: "Άνοιξε από κινητό" message
- Fallback: "Αν το link δεν λειτουργήσει, εισάγετε τον κωδικό χειροκίνητα"

---

## 4. JOIN TEAM FLOW

### `app/join.tsx`
1. Auth check → Auto-fill code from deep link
2. Auto-join: `setTimeout(() => handleJoin(), 500)` αν code από deep link
3. Query invite → Expiration check (>120sec → delete + alert)
4. Already member check → Add to team: `arrayUnion(userId)` + role
5. Delete invite (one-time use) → Success → `/dashboard`

**End-to-end: ~3 seconds, zero manual actions (via deep link)**

---

## 5. PROJECT MANAGEMENT FLOW

### `app/team/[id].tsx`

**Data Loading:** Cache first → Firestore `onSnapshot` (real-time) → Live project listener

**Create Group:** Online check → Input → `{ id: Date.now(), title, projects: [] }` → updateDoc

**Create Project:** Online check → Input → `setDoc("projects", { title, status: "pending", supervisors, members: [], tasks: [], teamId })` + update team groups

**Edit Project (Long Press):** Select project → Action sheet → Edit modal (title, ανάθεση supervisors/members) → updateDoc

**Delete Project (Long Press):** Confirm → Remove from group → deleteDoc

**Move Project (Long Press):** Select target group → Update groups array → updateDoc

**Delete Group (Long Press):** Confirm → updateDoc (αφαίρεση group)

---

## 6. TASK MANAGEMENT FLOW

### `app/project/[id].tsx`

**Data Loading:** Cache → `onSnapshot` → Merge (Map: cloud + local, local overwrites cloud)

**Create Task (FAB +):** Modal → Input (title, description, type) → `saveTaskLocal({ id, title, type, status: "pending", isLocal: true })`

**Complete Task:** Input value → `saveTaskLocal({ ...task, value, status: "completed" })`

**Clear Value (🗑️ button):** Alert.alert επιβεβαίωσης → Confirm → `saveTaskLocal({ ...task, value: "", status: "pending" })` + `logActivity(..., "value_cleared")`

**Task Types:** photo, video, measurement, general

---

## 7. PHOTO TASK FLOW

1. Tap task → Bottom sheet: Κάμερα / Γκαλερί
2. Camera: expo-image-picker → Αυτόματο άνοιγμα Image Editor
3. Gallery: Επιλογή από γκαλερί → Αν θέλει επεξεργασία → Image Editor
4. GPS location (Accuracy.Balanced, fallback: 0,0) — parallel
5. Compress: 70% quality, full resolution, JPEG
6. Upload to Firebase Storage → Get URL
7. `saveTaskLocal({ images: [..., storageUrl], imageLocations: [..., location], status: "completed" })`
8. `logActivity(..., "photo_added")`

**Gallery (multiple photos):** FlatList grid (3 cols) → Tap photo → Full screen view

**Photo Actions (Tap on photo in full screen):**
- Εμφάνιση τοποθεσίας στον χάρτη (Google Maps)
- Κοινοποίηση (`Sharing.shareAsync`)
- Επανεπεξεργασία (άνοιγμα Image Editor)
- Διαγραφή (confirm → remove from arrays → `logActivity(..., "photo_deleted")`)

---

## 8. VIDEO TASK FLOW

1. Tap task → Bottom sheet: Κάμερα / Γκαλερί
2. Camera: `videoQuality: 0`, max 4s
3. Compress: react-native-compressor (720p, 2.5Mbps, ~70% reduction)
4. GPS location (parallel)
5. Upload to Firebase Storage → Get URL
6. `saveTaskLocal({ videos: [..., storageUrl], videoLocations: [..., location], status: "completed" })`
7. `logActivity(..., "video_added")`

**Video Actions (Tap on video):**
- Εμφάνιση τοποθεσίας στον χάρτη
- Διαγραφή (confirm → `logActivity(..., "video_deleted")`)

**Backward compat:** `normalizeVideoTask()` helper για παλιά single-video format

---

## 9. IMAGE EDITOR FLOW

### `app/components/ImageEditorModal.tsx` (ViewShot-based)

**Είσοδος:** Αυτόματα μετά από camera capture (photo task)

**Drawing:**
- PanResponder → SVG paths
- 6 χρώματα: κόκκινο, κίτρινο, πράσινο, μπλε, λευκό, μαύρο
- 3 μεγέθη γραμμής (λεπτό / μεσαίο / χοντρό)
- **Undo**: αναίρεση τελευταίας γραμμής
- **Reset**: διαγραφή όλων των γραμμών

**Pan Mode:** Μετακίνηση εικόνας με δάχτυλο (χωρίς zoom)

**Boundary checks:** 15px edge margin, wild value detection (αποφυγή line jumps/flicks)

**Save:** ViewShot capture → JPEG → Replace original image → Continue upload flow

---

## 10. TASK EDIT & DELETE FLOW

**Edit (Long Press ~0.5s):** Action sheet → Edit modal (title, description, type) → `saveTaskLocal`

**Delete (Long Press ~0.5s):** Confirm Alert → Remove from local + cloud → `updateDoc` + `logActivity(..., "task_deleted")`

---

## 11. MEDIA ACTIONS FLOW

**Share:** Convert to file (αν base64) → `Sharing.shareAsync(fileUri)`

**Delete Photo/Video:**
1. Confirm Alert
2. Remove from `images[]`/`imageLocations[]` (ή `videos[]`/`videoLocations[]`)
3. Recalculate status (αν τελευταίο media → pending)
4. `saveTaskLocal(updatedTask)`
5. `logActivity(..., "photo_deleted"/"video_deleted")`

---

## 12. OFFLINE SYNC FLOW

### `app/context/SyncContext.tsx`

**Network Listener:** WiFi connected → auto sync (1s delay)

**Manual Sync:** "Sync Now" tap → Network check → Αν cellular: Alert επιβεβαίωσης → `performGlobalSync(allowCellular: true)`

**Global Sync Process (`performGlobalSync`):**
1. Lock check (`isSyncingRef`)
2. Find all queue keys (`offline_tasks_queue_*`)
3. For each project:
   - Fetch cloud state
   - Process media: `file://` → upload to Firebase, `data:` → migrate, `https://` → keep
   - Merge local into cloud (local wins)
   - Recalculate status from tasks
   - `updateDoc({ tasks: mergedList, status })`
4. Set `justSyncedProjectId` (2s reset → clears local queue display)
5. Remove queue key from AsyncStorage

**Abort:** `shouldAbortRef` flag → instant stop on WiFi drop

**Retry:** Re-sync check after 3s αν queue ακόμα έχει items

**Failed files:** Max 3 retries → then skip (missing temp files = not retryable)

**Local Cleanup:** onSnapshot watch → filter remaining unsynced → update AsyncStorage

---

## 13. PDF GENERATION FLOW

### `app/project/[id].tsx` → `generatePDF()`

1. Calculate stats (total, completed, progress %)
2. Preprocess photos: `ImageManipulator.manipulateAsync(url, [{ rotate: 0 }])` → bake EXIF orientation
3. Build HTML:
   - Header (gradient) + Summary cards + Task cards (GPS links, completion dates)
   - **Photo Appendix** (μετά τα tasks): Μία φωτογραφία ανά σελίδα (`page-break-before: always`)
     - Πρώτη φωτογραφία κάθε task: τίτλος task + "Φωτογραφία 1"
     - Υπόλοιπες: "Φωτογραφία N"
     - `<center><img></center>` για WebKit compatibility
   - Footer
4. `Print.printToFileAsync({ html })` → `Sharing.shareAsync(uri)`

---

## 14. ACTIVITY LOG FLOW

### `utils/activityLog.ts`

**Καταγραφή:** `logActivity(projectId, userId, userFullname, action, taskId, taskTitle)`
- Αποθηκεύεται στο Firestore: `activityLog/{projectId}/entries/{entryId}`
- Fields: `userId`, `userFullname`, `action`, `taskId`, `taskTitle`, `timestamp`

**Actions που καταγράφονται:**
| Action | Trigger |
|--------|---------|
| `task_created` | Δημιουργία task |
| `task_deleted` | Διαγραφή task |
| `photo_added` | Upload φωτογραφίας |
| `photo_deleted` | Διαγραφή φωτογραφίας |
| `video_added` | Upload βίντεο |
| `video_deleted` | Διαγραφή βίντεο |
| `value_set` | Καταχώριση τιμής (measurement/general) |
| `value_cleared` | Διαγραφή τιμής |
| `task_completed` | Task → completed |

**Εμφάνιση:**
- Header project → εικονίδιο 🕐 → Modal
- `onSnapshot` query (orderBy timestamp desc, limit 50)
- Κάθε εγγραφή: όνομα χρήστη + περιγραφή ενέργειας + "πριν Χ λεπτά/ώρες"

---

## 15. USER ROLE MANAGEMENT FLOW

### `app/team/[id].tsx`

**Αλλαγή ρόλου:** Tap μέλος → Action sheet (Promote/Demote/Kick) → Confirm → `updateDoc`

| Role Change | Project Cleanup |
|-------------|----------------|
| Μέλος → Supervisor | Remove from `members[]` |
| Supervisor → Μέλος | Remove from `supervisors[]` |
| Supervisor → Admin | Remove from `supervisors[]` |
| Admin → Supervisor | — (Admins δεν είναι σε project arrays) |

**Kick:** Confirm → Remove from `memberIds[]` + `roles` + όλα τα project `supervisors[]`/`members[]`

**Περιορισμοί:**
- Supervisor: kick μόνο Μέλη
- Admin: δεν τροποποιεί άλλον Admin ή Founder
- Κανείς δεν τροποποιεί τον εαυτό του

---

## 16. PROJECT SEARCH & FILTER FLOW

### `app/team/[id].tsx`

**Search:** Real-time TextInput → case-insensitive title filter

**Status Filter:** Bottom Sheet Modal (Όλα / Ενεργά / Εκκρεμή / Ολοκληρωμένα)

**Persistence:** AsyncStorage per team (`team_filters_${teamId}`) — αποθηκεύεται αυτόματα

**Visual:** Blue badge dot όταν filter ≠ "Όλα"

**Filter Pipeline:**
1. Role-based (Μέλη βλέπουν μόνο assigned projects)
2. Status filter
3. Search filter (title)

---

## 17. 3-STAGE PROJECT STATUS FLOW

### Ορισμός Status

| Status | Συνθήκη | Badge |
|--------|---------|-------|
| `pending` | 0 completed tasks (κανένα) | Πορτοκαλί |
| `active` | ≥1 completed, αλλά όχι όλα | Μπλε |
| `completed` | Όλα τα tasks completed | Πράσινο |

### Auto-transitions (`app/project/[id].tsx`)
- `useEffect` watches `combinedTasks`
- Recalculate `derivedStatus` → αν διαφορετικό από cloud → `updateDoc({ status })`
- **Bidirectional:** photo delete → pending, reset value → pending

### Status Derivation (`app/team/[id].tsx`)
Κατά το onSnapshot live listener:
```typescript
const done = tasks.filter(t => t.status === "completed").length;
if (done === tasks.length && tasks.length > 0) derivedStatus = "completed";
else if (done > 0) derivedStatus = "active";
else derivedStatus = "pending";
```

---

## 18. GOOGLE DRIVE SYNC FLOW

### Αρχεία
- `utils/driveAuth.ts` — OAuth2, token refresh, connect/disconnect
- `utils/driveApi.ts` — Drive REST API wrapper (folders, upload, share, delete, permissions)
- `utils/driveSyncEngine.ts` — Sync orchestration
- `utils/driveExcelGenerator.ts` — Excel generation (ExcelJS)
- `app/context/DriveSyncContext.tsx` — Auto-sync context (30s debounce)
- `app/team/[id].tsx` — Drive Sync Modal UI

### Offline Guard
Όλες οι Drive ενέργειες ελέγχουν πρώτα `Network.getNetworkStateAsync()`. Αν offline → Alert "Δεν υπάρχει σύνδεση στο διαδίκτυο." → abort.

### 18a. Connect Google Drive

1. User: "Σύνδεση Google Drive" → offline check
2. `connectGoogleDrive(teamId)` → Open OAuth2 URL
3. Callback: `https://ergon-work.web.app/auth/callback/` → Extract `code`
4. Exchange code → `{ access_token, refresh_token, expires_in }`
5. Save: `driveConfig/{teamId}` `{ refreshToken, accessToken, tokenExpiry, connectedEmail, connectedAt }`
6. Modal: "Συνδεδεμένο" + email + ημερομηνία

**Deploy σημείωση:** `static/auth/callback/index.html` → `dist/auth/callback/` (πρέπει re-deploy μετά OTA: `npx firebase deploy --only hosting:app`)

### 18b. Auto-Sync (DriveSyncContext)
1. `onSnapshot` στα projects → `docChanges().length > 0` → trigger sync
2. `triggerDriveSync(teamId)` → 30s debounce → `syncProjectToDrive`
3. Αποφεύγει concurrent syncs (`isSyncingRef`)
4. WiFi only (no cellular auto-sync)

### 18c. Sync Process (`syncProjectToDrive`)

1. `getValidAccessToken(teamId)` — refresh αν `tokenExpiry < now`
2. Load project + team + group data
3. **Hash check:** `computeTasksHash(tasks)` vs saved hash → skip αν ίδιο
4. `ensureFolderStructure` → Ergon Work Management → Team → Group → Project → Φωτογραφίες / Βίντεο
   - Folder IDs cached στο `syncState.folderIds`
5. **Auto-share:** Για κάθε νέο μέλος → fetch email → `shareFolderWithEmail(teamFolderId, email, "writer")` (no notification email)
6. Upload photos (Firebase URL → blob → Drive Φωτογραφίες folder)
7. Upload videos (Firebase URL → blob → Drive Βίντεο folder)
8. Excel generation: `generateProjectExcel(tasks)` → upload/update `.xlsx`
9. Save hash + `saveSyncState(teamId, syncState)`

### 18d. Hash-based Change Detection
```typescript
computeTasksHash(tasks):
  - id + title + status + type-specific data
  - Photos: normalizeStorageUrl(url) → αφαιρεί ?token=... params
  - SHA-256 → hex string
```
Σκοπός: Αποφυγή re-upload όταν αλλάζει μόνο το Firebase Storage URL token.

### 18e. Manual Sync ("Συγχρονισμός Τώρα")
1. Offline check → abort αν offline
2. `triggerDriveSync(teamId)` χωρίς debounce

### 18f. Open in Drive ("Άνοιγμα στο Drive")
1. Offline check → abort αν offline
2. Fetch `driveSyncState/{teamId}` → `folderIds`
3. `folderId = folderIds[teamName]` ή root fallback
4. `Linking.openURL("https://drive.google.com/drive/folders/{folderId}")`
5. Αν δεν έχει γίνει sync ακόμα → Alert "Κάντε πρώτα συγχρονισμό"

### 18g. Disconnect
1. Offline check → abort αν offline
2. `disconnectGoogleDrive(teamId)` → Delete `driveConfig/{teamId}` → Modal: "Μη Συνδεδεμένο"

---

## 19. ADMIN PANEL (WEB) FLOW

### `static/admin/index.html` → `ergon-work.web.app/admin`

**Πρόσβαση:**
1. Σελίδα Ομάδας → ⋮ → Admin Panel
2. Offline check → abort αν offline
3. `Linking.openURL("https://ergon-work.web.app/admin/?teamId=X&userId=Y")`
4. Browser: verify userId role → αν Founder/Admin → show panel

### Tab: Μέλη
- Λίστα μελών με badge ρόλου + email
- Tap → αλλαγή ρόλου / αφαίρεση
- Δεν επιτρέπεται τροποποίηση Founder ή του εαυτού

### Tab: Έργα
- Λίστα projects → Tap project → Λίστα tasks
- **Multi-select tasks:** Checkboxes + toolbar "Διαγραφή Επιλεγμένων (N)"
  - `onTaskCheckChange()` → update counter
  - `deleteSelectedTasks()` → filter tasks array → `updateDoc({ tasks: filteredTasks })`
- **Delete project:** Confirm → `deleteDoc("projects", projectId)` + remove from team groups

### Tab: Storage
- Λίστα projects → Tap project → Λίστα αρχείων (Firebase Storage)
- **Multi-select files:** Checkboxes + toolbar "Διαγραφή Επιλεγμένων (N)"
  - `onFileCheckChange(projectId)` → update `storageSelection[projectId]`
  - `deleteSelectedFiles(projectId)` → iterate → `deleteObject(ref)` per file
- **Delete all:** Confirm → delete all project files

---

## APPENDIX: STATE & STORAGE

### AsyncStorage Keys
| Key | Περιεχόμενο |
|-----|-------------|
| `user_profile_data_cache` | User profile |
| `cached_my_teams` | Teams list |
| `cached_team_{teamId}` | Team data |
| `cached_project_tasks_{id}` | Project tasks |
| `offline_tasks_queue_{id}` | Pending sync queue |
| `team_filters_{teamId}` | Active filter per team |

### Firebase Collections
- `users/{userId}` — Profiles
- `teams/{teamId}` — Teams + groups + project references
- `projects/{projectId}` — Tasks + media URLs
- `invites/{inviteId}` — Invite codes (2min TTL)
- `activityLog/{projectId}/entries/{entryId}` — Activity history
- `driveConfig/{teamId}` — Google Drive OAuth credentials
- `driveSyncState/{teamId}` — Folder IDs, sync hashes, shared members

### Firebase Storage
- `teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{jpg|mp4}`

### Google Drive Structure
```
Ergon Work Management/
  {teamName}/
    {groupName}/
      {projectName}/
        Φωτογραφίες/     ← .jpg files
        Βίντεο/           ← .mp4 files
        {projectName}.xlsx
```

### Firebase Hosting
- `ergon-work.web.app/invite` — Invite landing page
- `ergon-work.web.app/auth/callback` — Google OAuth callback
- `ergon-work.web.app/admin` — Admin Panel

---

**Version**: 2.2.5
**Last Updated**: Φεβρουάριος 2026
