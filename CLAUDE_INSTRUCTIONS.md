# CLAUDE CODE - ΟΔΗΓΙΕΣ ΕΡΓΑΣΙΑΣ

## Γενική Επισκόπηση

### Project: ERGON Work Management
- **Type:** Cross-platform mobile app (iOS, Android, Web)
- **Framework:** React Native + Expo SDK 54
- **Backend:** Firebase (Auth, Firestore, Storage)
- **Language:** TypeScript + Ελληνικά UI
- **Architecture:** Offline-First με Real-Time Sync
- **Version:** 2.2.0

### Κύριοι Στόχοι
1. **Offline-First:** Πρώτα local storage, μετά sync
2. **Real-Time Updates:** Firestore listeners για live data
3. **User Experience:** Smooth animations, fast responses
4. **Data Integrity:** Merge conflicts handled gracefully

---

## Συνεργασία & Επικοινωνία

### Κανόνας #1: MD Files vs Code Files

| Τύπος Αρχείου | Πολιτική |
|----------------|----------|
| **MD Files** (.md) | Ελεύθερη ενημέρωση χωρίς επιβεβαίωση |
| **Code Files** (.ts, .tsx, .js, .json) | ΠΑΝΤΑ ρώτα πριν αλλάξεις |

**Code files:** Εξήγησε πρόβλημα → Πρότεινε λύση + εναλλακτικές → Περίμενε confirmation → Κάνε αλλαγή

### Κανόνας #2: Πρότεινε Εναλλακτικές
- Για κάθε πρόταση: Pros, Cons, Impact, Effort
- Τουλάχιστον 2 options όπου υπάρχουν

### Κανόνας #3: Εξήγησε το "Γιατί"
- Bug fix: Τι ήταν, πώς φτιάχνεται
- Feature: Γιατί χρειάζεται
- Breaking change: **ΥΠΟΧΡΕΩΤΙΚΗ** εξήγηση + migration plan

---

## Αρχιτεκτονική & Πρότυπα

### File-Based Routing (Expo Router)
```
app/
├── _layout.tsx          # Root layout με providers
├── index.tsx            # Landing/splash + custom loading screen
├── login.tsx            # Auth screen
├── dashboard.tsx        # Main dashboard
├── teams/my-teams.tsx   # Team list
├── team/[id].tsx        # Team details (real-time via onSnapshot)
├── project/[id].tsx     # Project tasks, media, PDF export
├── components/          # Shared components (ImageEditorModal, etc.)
└── context/             # SyncContext (offline sync)
```

### Κανόνες

**ΚΑΝΕ:**
1. **Context API** για global state (όχι Redux/Zustand)
2. **AsyncStorage** για local data (`cached_{entity}_{id}`, `offline_tasks_queue_{projectId}`)
3. **onSnapshot** για real-time Firestore data (ΠΑΝΤΑ cleanup: `return () => unsubscribe()`)
4. **Firebase Storage** για media (URLs στο Firestore, όχι base64)
5. **Navigation debounce** (500ms lock pattern)

**ΜΗΝ ΚΑΝΕΙΣ:**
1. Direct Firestore writes χωρίς local cache
2. Console.log σε production (χρήση `__DEV__`)
3. `any` types - χρήση strict TypeScript
4. Ξεχνάς cleanup (listeners, timeouts, subscriptions)

---

## Coding Standards

### Naming Conventions
- Variables/Functions: `camelCase`
- Components: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

### Component Structure
```typescript
// Import order: React → React Native → Expo → External → Local
const MyComponent = () => {
  // 1. Hooks  2. Effects  3. Functions  4. Render
};
```

---

## Offline-First Pattern

### Local FIRST, Cloud SECOND
```typescript
const saveTask = async (task: Task) => {
  // 1. Save locally ΑΜΕΣΑ
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...tasks, { ...task, isLocal: true }]));
  // 2. Trigger sync (αν υπάρχει WiFi)
  if (isConnected) syncNow();
};
```

### Merge Strategy
Cloud + Local merge με Map - local overwrites cloud (by task ID).

### Sync System (SyncContext.tsx)
- `shouldAbortRef` + `manualSyncRef` flags control sync behavior
- `performGlobalSync(allowCellular)` - WiFi auto, cellular on manual only
- Missing files (deleted temp) skip without retry
- Status recalculated from tasks during sync
- Re-sync after 3sec if queue still has items
- `file://` URIs: validate existence before upload

---

## Media Storage (v2.0+)

### Firebase Storage
- Path: `teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{ext}`
- Photos: 70% compression, full resolution, JPEG
- Videos: 720p HD, 2.5Mbps, 4s max, MP4 (react-native-compressor)
- Storage URLs (~100 bytes) stored in Firestore, not base64

### Upload Flow
1. `file://` → Upload to Storage → Save URL
2. `data:image/video` → Migrate to Storage (backward compat)
3. `https://firebasestorage` → Keep as-is

---

## Git Workflow

### Commit Messages
```
<type>: <short description>
Types: feat, fix, docs, refactor, style, perf, test
```

---

## Γλώσσα
- **UI Text:** Ελληνικά
- **Code:** Αγγλικά (variables, functions)
- **Documentation:** Ελληνικά

---

## Αναφορές

### Documentation Files
- `BUSINESS_PLAN.md` - Business logic, schema, features, roadmap
- `SERVICE_FLOWS.md` - Detailed flows για κάθε λειτουργία
- `to do.md` - Pending features & roadmap

### Key Files
- `app/context/SyncContext.tsx` - Offline sync logic
- `app/components/ImageEditorModal.tsx` - Image editing
- `app/project/[id].tsx` - Project tasks, media, PDF
- `firebaseConfig.ts` - Firebase initialization

---

**Version:** 2.2.0
**Last Updated:** Φεβρουάριος 2026
