# 🤖 CLAUDE CODE - ΟΔΗΓΙΕΣ ΕΡΓΑΣΙΑΣ

## 📋 Περιεχόμενα
1. [Γενική Επισκόπηση](#γενική-επισκόπηση)
2. [Συνεργασία & Επικοινωνία](#συνεργασία--επικοινωνία)
3. [Αρχιτεκτονική & Πρότυπα](#αρχιτεκτονική--πρότυπα)
4. [Coding Standards](#coding-standards)
5. [State Management](#state-management)
6. [Offline-First Προτεραιότητες](#offline-first-προτεραιότητες)
7. [Testing & QA](#testing--qa)
8. [Git Workflow](#git-workflow)
9. [DO's and DON'Ts](#dos-and-donts)
10. [Γλώσσα & Localization](#γλώσσα--localization)
11. [Performance Guidelines](#performance-guidelines)

---

## 🎯 Γενική Επισκόπηση

### Project: ERGON Work Management
- **Type:** Cross-platform mobile app (iOS, Android, Web)
- **Framework:** React Native + Expo SDK 54
- **Backend:** Firebase (Auth, Firestore)
- **Language:** TypeScript + Ελληνικά
- **Architecture:** Offline-First με Real-Time Sync

### Κύριοι Στόχοι
1. **Offline-First:** Πρώτα local storage, μετά sync
2. **Real-Time Updates:** Firestore listeners για live data
3. **User Experience:** Smooth animations, fast responses
4. **Data Integrity:** Merge conflicts handled gracefully

---

## 🤝 Συνεργασία & Επικοινωνία

### 🔴 Κανόνας #1: ΠΑΝΤΑ Ρώτα Πριν Αλλάξεις

**ΜΗΝ ΚΑΝΕΙΣ ποτέ:**
- ❌ Άμεσες αλλαγές χωρίς confirmation
- ❌ Breaking changes χωρίς warning
- ❌ Διαγραφή κώδικα/features χωρίς λόγο
- ❌ Refactoring χωρίς συζήτηση
- ❌ Αλλαγή architecture patterns χωρίς approval

**ΚΑΝΕ ΠΑΝΤΑ:**
- ✅ Ρώτα: "Θέλεις να αλλάξω X σε Y;"
- ✅ Εξήγησε: "Προτείνω Α γιατί Β"
- ✅ Περίμενε confirmation πριν προχωρήσεις

#### Παράδειγμα Workflow
```
User: "Φτιάξε το bug στο sync"

Claude Response:
"Βρήκα το bug στο SyncContext.tsx:245. Το πρόβλημα είναι ότι
το cleanup δεν γίνεται σωστά μετά το merge.

Προτείνω να:
1. Προσθέσω ένα check για empty arrays πριν το cleanup
2. Αλλάξω το filter logic να ελέγχει και τα imageLocations

Εναλλακτικά θα μπορούσα να:
- Κάνω complete rewrite του cleanup logic (πιο safe αλλά breaking change)
- Προσθέσω μόνο try-catch (quick fix αλλά δεν λύνει root cause)

Ποια approach προτιμάς;"

User: "Πήγαινε με την πρώτη"

Claude: "Perfect! Προχωράω με την αλλαγή..."
```

---

#### 🔷 ΕΞΑΙΡΕΣΗ: MD Files vs Code Files

**ΣΗΜΑΝΤΙΚΗ ΔΙΕΥΚΡΙΝΙΣΗ:**

| Τύπος Αρχείου | Πολιτική Ενημέρωσης |
|----------------|---------------------|
| **📄 MD Files (Documentation)** | ✅ Ελεύθερη ενημέρωση χωρίς επιβεβαίωση |
| **💻 Code Files (Project)** | ⚠️ ΠΑΝΤΑ ρώτα πριν αλλάξεις |

#### MD Files - Auto-Update OK ✅

Τα **αρχεία documentation** (.md) μπορούν να ενημερώνονται αυτόματα:

**Ποια αρχεία:**
- `BUSINESS_PLAN.md`
- `SERVICE_FLOWS.md`
- `to do.md`
- `CLAUDE_INSTRUCTIONS.md`
- Οποιοδήποτε άλλο `.md` file

**Τι μπορώ να κάνω:**
- ✅ Προσθήκη νέων features που ολοκληρώθηκαν
- ✅ Update των flows με νέα λειτουργικότητα
- ✅ Marking tasks ως completed στο TODO
- ✅ Προσθήκη νέων οδηγιών/rules
- ✅ Διόρθωση outdated information

**Πώς να το κάνω:**
```
User: "Προσθέτω GPS tracking στο project"

Claude Response:
"Ολοκλήρωσα το GPS tracking! Ενημερώνω τα MD files...

✅ BUSINESS_PLAN.md: Προσθέτω Section 5.9 με GPS features
✅ SERVICE_FLOWS.md: Ενημερώνω Photo Task Flow (Step 3)
✅ to do.md: Marking GPS feature ως completed

Όλα ενημερωμένα! 🎉"
```

**ΠΡΟΣΟΧΗ:** Ενημερώνω τον χρήστη **ΜΕΤΑ** την αλλαγή, δεν ρωτάω πριν.

#### Code Files - Always Ask First ⚠️

Για **οποιοδήποτε αρχείο κώδικα** (`.ts`, `.tsx`, `.js`, `.json`, etc.) ισχύουν τα **ΠΑΝΤΑ Ρώτα Πριν Αλλάξεις** rules:

**Ποια αρχεία:**
- `app/**/*.tsx` (components, screens)
- `app/**/*.ts` (context, utils)
- `firebaseConfig.ts`
- `app.json`
- `package.json`
- Οποιοδήποτε αρχείο κώδικα

**Workflow:**
1. 🔍 Εξήγησε το πρόβλημα/ανάγκη
2. 💡 Πρότεινε λύση + εναλλακτικές
3. ⏸️ Περίμενε confirmation
4. ✅ Κάνε την αλλαγή

**Παράδειγμα:**
```
User: "Φτιάξε το bug στο sync"

Claude: "Βρήκα το bug... [analysis]

Προτείνω να: [solution + alternatives]

Ποια approach προτιμάς?"

User: "Πήγαινε με την πρώτη"

Claude: "Perfect! Προχωράω..." [makes changes]
```

---

### 🎯 Κανόνας #2: Πρότεινε Ιδέες & Εναλλακτικές

Όταν ο χρήστης ζητάει κάτι, **ΠΑΝΤΑ** προσφέρε:

#### ✅ Πολλαπλές Επιλογές
```
User: "Θέλω να προσθέσω comments στα tasks"

Claude Response:
"Εξαιρετική ιδέα! Έχω 3 approaches:

**Option 1: Simple (Προτεινόμενο)**
- Array of comments στο Task type
- Store locally με το task
- Pros: Εύκολο, fast, offline-ready
- Cons: Περιορισμένη functionality (όχι mentions, όχι reactions)

**Option 2: Firestore Subcollection**
- tasks/{taskId}/comments/{commentId}
- Real-time updates
- Pros: Scalable, rich features
- Cons: Πολυπλοκότερο, χρειάζεται online

**Option 3: Hybrid**
- Local για offline, subcollection για sync
- Pros: Best of both worlds
- Cons: Πιο πολύς κώδικας

Ποια θα δουλέψει καλύτερα για το use case σου;"
```

#### ✅ Tradeoffs Analysis
Για κάθε πρόταση, εξήγησε:
- ✅ **Pros** - Τι κερδίζουμε
- ⚠️ **Cons** - Τι χάνουμε
- 💡 **Impact** - Πώς επηρεάζει το project
- ⏱️ **Effort** - Complexity level (Low/Medium/High)

---

### 📝 Κανόνας #3: Εξήγησε το "Γιατί"

Για **κάθε αλλαγή** που κάνεις, εξήγησε τον λόγο:

#### Format:
```typescript
// ✅ ΣΩΣΤΟ Comment
// FIX: Προσθήκη check για empty imageLocations
// ΛΟΓΟΣ: Το app crashάρει όταν task έχει images αλλά όχι locations
// IMPACT: Prevents crash σε edge case (old tasks χωρίς GPS)
if (task.imageLocations && task.imageLocations.length > 0) {
  // ... location logic
}

// ❌ ΛΑΘΟΣ Comment (δεν λέει γιατί)
// Added check
if (task.imageLocations && task.imageLocations.length > 0) {
```

#### Κατηγορίες Αλλαγών:
| Τύπος | Πρέπει να Εξηγήσεις |
|-------|---------------------|
| **Bug Fix** | Τι ήταν το bug, πώς το φτιάχνεις |
| **Feature** | Γιατί χρειάζεται, πώς δουλεύει |
| **Refactor** | Τι βελτιώνεται, τι risks υπάρχουν |
| **Performance** | Πόσο faster, τι compromises |
| **Breaking Change** | **ΥΠΟΧΡΕΩΤΙΚΗ** εξήγηση + migration plan |

---

### 💬 Communication Templates

#### Template 1: Πρόταση Αλλαγής
```
📌 ΠΡΟΤΑΣΗ: [Short description]

🔍 ΑΝΑΛΥΣΗ:
- Current state: [Πώς είναι τώρα]
- Problem: [Τι δεν δουλεύει]
- Impact: [Ποιους επηρεάζει]

💡 ΛΥΣΗ:
[Η προτεινόμενη αλλαγή]

✅ PROS:
- [Όφελος 1]
- [Όφελος 2]

⚠️ CONS:
- [Tradeoff 1]
- [Tradeoff 2]

🎯 ΕΝΑΛΛΑΚΤΙΚΕΣ:
1. [Option A] - [Σύντομη περιγραφή]
2. [Option B] - [Σύντομη περιγραφή]

Προχωράω με την κύρια λύση ή προτιμάς κάποια εναλλακτική;
```

#### Template 2: Επεξήγηση Κώδικα
```
🔧 ΑΛΛΑΓΗ: [Τι άλλαξα]

📍 LOCATION: [Αρχείο:γραμμή]

❓ ΛΟΓΟΣ:
[Γιατί ήταν ανάγκη]

💻 ΠΩΣ ΔΟΥΛΕΥΕΙ:
[Σύντομη τεχνική εξήγηση]

⚡ IMPACT:
- Performance: [None/Better/Worse]
- Breaking: [Yes/No]
- Testing needed: [Yes/No]
```

---

### 🚨 Critical Communication Rules

#### 1. Πριν Διαγράψεις Κώδικα
```
⚠️ ΠΡΟΣΟΧΗ: Θέλω να διαγράψω [X]

ΛΟΓΟΣ: [Γιατί δεν χρειάζεται]

ΘΑ ΕΠΗΡΕΑΣΤΕΙ:
- [Feature/File 1]
- [Feature/File 2]

Είσαι σίγουρος ότι μπορώ να το αφαιρέσω;
```

#### 2. Πριν Breaking Changes
```
🔴 BREAKING CHANGE ALERT

ΑΛΛΑΓΗ: [Τι θα σπάσει]

AFFECTED:
- Users: [Πώς επηρεάζονται]
- Code: [Ποια files χρειάζονται update]

MIGRATION:
[Step-by-step πώς να φτιαχτεί]

Θέλεις να προχωρήσω; (Χρειάζεται explicit YES)
```

#### 3. Πριν Architectural Changes
```
🏗️ ARCHITECTURE PROPOSAL

CURRENT: [Πώς δουλεύει τώρα]
PROPOSED: [Πώς θα δουλεύει]

BENEFITS:
- [Benefit 1]

RISKS:
- [Risk 1]

FILES TO CHANGE: [N files]
ESTIMATED EFFORT: [Low/Medium/High]

Θέλεις να δούμε alternatives ή να προχωρήσω;
```

---

### 🎓 Best Practices Checklist

Πριν κάθε response, check:

- [ ] Εξήγησα το "γιατί" για κάθε αλλαγή;
- [ ] Έδωσα τουλάχιστον 2 εναλλακτικές (αν υπάρχουν);
- [ ] Ανέφερα pros/cons για κάθε option;
- [ ] Ζήτησα confirmation πριν breaking changes;
- [ ] Χρησιμοποίησα clear, structured format;
- [ ] Έδωσα code examples όπου χρειάζεται;

---

### 📌 Quick Reference

| Scenario | Action Required |
|----------|----------------|
| Simple bug fix | Εξήγησε bug + fix |
| New feature | Πρότεινε 2-3 approaches |
| Refactoring | Εξήγησε benefits + risks |
| Breaking change | **ΠΑΝΤΑ ρώτα** + migration plan |
| Delete code | **ΠΑΝΤΑ ρώτα** + explain why |
| Unclear request | Ρώτα clarifying questions |

---

## 🏗️ Αρχιτεκτονική & Πρότυπα

### File-Based Routing (Expo Router)
```
app/
├── _layout.tsx          # Root layout με providers
├── index.tsx            # Landing/splash
├── login.tsx            # Auth screen
├── dashboard.tsx        # Main dashboard
├── teams/my-teams.tsx   # Team list
├── team/[id].tsx        # Team details (dynamic route)
├── project/[id].tsx     # Project tasks (dynamic route)
├── onboarding/          # Onboarding flows
├── components/          # Shared components
└── context/             # Global state (Context API)
```

### Κανόνες Αρχιτεκτονικής

#### ✅ ΚΑΝΕ:
1. **Χρησιμοποίησε Context API** για global state (όχι Redux/Zustand)
   - `SyncContext` για offline sync state
   - Lightweight, minimal dependencies

2. **AsyncStorage για όλα τα local data**
   - Cache key pattern: `cached_{entity}_{id}`
   - Queue key pattern: `offline_tasks_queue_{projectId}`

3. **Firestore listeners (onSnapshot) για real-time**
   ```typescript
   const unsubscribe = onSnapshot(
     doc(db, "teams", teamId),
     { includeMetadataChanges: true },
     (snapshot) => {
       if (!snapshot.metadata.fromCache) {
         // Update from server
       }
     }
   );
   // ΠΑΝΤΑ cleanup: return () => unsubscribe();
   ```

4. **Base64 encoding για images/videos**
   - ΟΧΙ Firebase Storage (τουλάχιστον για MVP)
   - Pattern: `data:image/jpeg;base64,{base64Data}`

#### ❌ ΜΗΝ ΚΑΝΕΙΣ:
1. **Μην χρησιμοποιείς Firebase Storage** (rejected feature)
2. **Μην κάνεις direct Firestore writes χωρίς local cache**
3. **Μην ξεχνάς cleanup** (listeners, timeouts, subscriptions)
4. **Μην κάνεις navigation χωρίς debounce** (500ms lock pattern)

---

## 💻 Coding Standards

### TypeScript
```typescript
// ✅ ΣΩΣΤΟ: Strict typing
type Task = {
  id: string;
  title: string;
  description?: string;
  type: "photo" | "video" | "measurement" | "general";
  status: "pending" | "completed";
  value: string | null;
  images?: string[];
  imageLocations?: GeoPoint[];
  isLocal?: boolean;
};

// ❌ ΛΑΘΟΣ: Any types
const task: any = { ... };
```

### Naming Conventions
```typescript
// Variables & Functions: camelCase
const userName = "Michael";
const handleSyncPress = () => {};

// Components: PascalCase
const ImageEditorModal = () => {};

// Constants: UPPER_SNAKE_CASE
const OFFLINE_QUEUE_PREFIX = "offline_tasks_queue_";
const CACHE_KEY = "cached_project_tasks_";

// Types/Interfaces: PascalCase
type GeoPoint = { lat: number; lng: number };
interface TaskProps { task: Task; onPress: () => void; }
```

### Component Structure
```typescript
// Σειρά imports
import { useState, useEffect } from "react";        // 1. React
import { View, Text, Alert } from "react-native";  // 2. React Native
import { router } from "expo-router";               // 3. Expo
import AsyncStorage from "@react-native-async-storage/async-storage"; // 4. External libs
import { auth, db } from "@/firebaseConfig";        // 5. Local imports

// Σειρά στο component
const MyComponent = () => {
  // 1. Hooks (useState, useRef, etc.)
  const [loading, setLoading] = useState(false);

  // 2. Effects
  useEffect(() => { ... }, []);

  // 3. Functions
  const handlePress = () => { ... };

  // 4. Render
  return <View>...</View>;
};
```

---

## 🔄 State Management

### Local State (useState)
- Χρήση για UI state (modals, inputs, loading)
```typescript
const [modalVisible, setModalVisible] = useState(false);
const [inputValue, setInputValue] = useState("");
```

### Global State (Context)
- **SyncContext** - μόνο για sync-related state
```typescript
const { isSyncing, syncNow, justSyncedProjectId } = useSyncContext();
```

### Persistent State (AsyncStorage)
- **Cache pattern:**
```typescript
// Save
await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));

// Load with fallback
const cached = await AsyncStorage.getItem(CACHE_KEY);
const data = cached ? JSON.parse(cached) : defaultValue;
```

### Server State (Firestore)
- **Real-time listeners** για live updates
- **Optimistic UI updates** πριν το Firestore

---

## 📴 Offline-First Προτεραιότητες

### Κανόνας #1: Local FIRST, Cloud SECOND
```typescript
// ✅ ΣΩΣΤΟ
const saveTask = async (task: Task) => {
  // 1. Save locally ΑΜΕΣΑ
  const localTasks = [...tasks, { ...task, isLocal: true }];
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(localTasks));
  setTasks(localTasks);

  // 2. Trigger sync (αν υπάρχει WiFi)
  if (isConnected) {
    syncNow();
  }
};

// ❌ ΛΑΘΟΣ: Firestore first
const saveTask = async (task: Task) => {
  await updateDoc(projectRef, { tasks: [...tasks, task] }); // ΟΧΙ!
};
```

### Merge Strategy
```typescript
// Cloud + Local merge με Map
const merged = new Map<string, Task>();
cloudTasks.forEach(t => merged.set(t.id, t));
localTasks.forEach(t => merged.set(t.id, t)); // Local overwrites cloud
const combinedTasks = Array.from(merged.values());
```

### Cleanup After Sync
```typescript
// Αφαίρεση μόνο αν fully synced
const remainingLocal = localTasks.filter(localTask => {
  const cloudTask = cloudMap.get(localTask.id);
  if (!cloudTask) return true; // Keep (not synced)
  if (localTask.value !== cloudTask.value) return true; // Keep (different)
  if (localTask.images?.length !== cloudTask.images?.length) return true;
  return false; // Remove (identical)
});
```

---

## 🧪 Testing & QA

### Πριν το Commit - Checklist
- [ ] TypeScript errors: `npx tsc --noEmit`
- [ ] Offline mode tested (Airplane mode)
- [ ] WiFi sync tested
- [ ] Cellular data confirmation tested
- [ ] Navigation lock (500ms) working
- [ ] Listeners cleanup (no memory leaks)
- [ ] AsyncStorage cleanup after sync

### Edge Cases να Τσεκάρεις
1. **Empty states** - τι γίνεται αν δεν υπάρχουν tasks;
2. **Network failures** - τι γίνεται αν πέσει το WiFi στη μέση;
3. **Concurrent syncs** - `isSyncingRef` lock working;
4. **Large images** - compression σε 800px, 40% quality;
5. **GPS failures** - fallback σε (0, 0);

---

## 🔀 Git Workflow

### Commit Messages
```bash
# Format: <type>: <short description>
git commit -m "feat: Add video task support with 4s duration limit"
git commit -m "fix: Prevent double navigation with 500ms debounce"
git commit -m "docs: Update BUSINESS_PLAN.md with GPS features"
git commit -m "refactor: Extract sync logic to SyncContext"
```

### Types:
- `feat` - Νέο feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `refactor` - Code refactoring (no behavior change)
- `style` - Formatting, styling
- `perf` - Performance improvements
- `test` - Tests

### Branch Strategy
- `main` - Production-ready code
- `feature/feature-name` - Νέα features
- `fix/bug-description` - Bug fixes

---

## ✅ DO's and ❌ DON'Ts

### DO's

#### 1. Πάντα Cleanup
```typescript
useEffect(() => {
  const unsubscribe = onSnapshot(docRef, callback);
  return () => unsubscribe(); // ✅ CLEANUP
}, []);
```

#### 2. Debounce Navigation
```typescript
const [isNavigating, setIsNavigating] = useState(false);

const safeNavigate = (path: string) => {
  if (isNavigating) return;
  setIsNavigating(true);
  router.push(path);
  setTimeout(() => setIsNavigating(false), 500);
};
```

#### 3. Error Handling
```typescript
try {
  await riskyOperation();
} catch (error: any) {
  console.error("Error:", error);
  Alert.alert("Σφάλμα", error.message || "Κάτι πήγε στραβά");
}
```

#### 4. Optimistic UI
```typescript
// Update UI ΑΜΕΣΑ
setUsers(prev => prev.map(u =>
  u.id === userId ? { ...u, role: newRole } : u
));

// ΜΕΤΑ update Firestore
await updateDoc(teamRef, { [`roles.${userId}`]: newRole });
```

#### 5. Platform Checks
```typescript
import { Platform } from "react-native";

if (Platform.OS !== "web") {
  // Mobile-only code (long press, image editor, etc.)
}
```

### DON'Ts

#### 1. ❌ Μην Ξεχνάς το `isLocal` Flag
```typescript
// ✅ ΣΩΣΤΟ
const newTask = { ...task, isLocal: true };

// ❌ ΛΑΘΟΣ - χάνεται το tracking
const newTask = { ...task };
```

#### 2. ❌ Μην Κάνεις Direct Firestore Writes σε Offline Mode
```typescript
// ❌ ΛΑΘΟΣ
await updateDoc(projectRef, { tasks: newTasks }); // Θα πετάξει error!

// ✅ ΣΩΣΤΟ
await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newTasks));
// Sync θα το στείλει μετά
```

#### 3. ❌ Μην Χρησιμοποιείς `any`
```typescript
// ❌ ΛΑΘΟΣ
const data: any = await getDoc(docRef);

// ✅ ΣΩΣΤΟ
const data = (await getDoc(docRef)).data() as TeamData;
```

#### 4. ❌ Μην Κάνεις Console.log σε Production
```typescript
// ✅ ΣΩΣΤΟ (αν χρειάζεται)
if (__DEV__) {
  console.log("Debug info:", data);
}
```

---

## 🌍 Γλώσσα & Localization

### Πρότυπα
1. **UI Text:** Πάντα στα Ελληνικά
2. **Code:** Αγγλικά (variables, functions, comments σε Ελληνικά OK)
3. **Documentation:** Ελληνικά

### Παραδείγματα
```typescript
// ✅ ΣΩΣΤΟ
const userName = "Μιχάλης"; // Variable: Αγγλικά, Value: Ελληνικά
Alert.alert("Σφάλμα", "Δεν υπάρχει σύνδεση"); // UI: Ελληνικά

// Comment: Ελληνικά OK
// Αυτή η function κάνει sync των tasks

// ❌ ΛΑΘΟΣ
const onoma_xristi = "Μιχάλης"; // Variable σε Ελληνικά - ΟΧΙ
```

---

## ⚡ Performance Guidelines

### Image Optimization
```typescript
// Πάντα compress
const manipResult = await ImageManipulator.manipulateAsync(
  uri,
  [{ resize: { width: 800 } }],
  {
    compress: 0.4,  // 40% quality
    format: SaveFormat.JPEG,
    base64: true
  }
);
```

### Lazy Loading
```typescript
// Load cache first, fetch later
useEffect(() => {
  // 1. Load from cache ΑΜΕΣΑ
  const loadCache = async () => {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      setData(JSON.parse(cached));
      setLoading(false); // Show cached data
    }
  };
  loadCache();

  // 2. Setup Firestore listener
  const unsubscribe = onSnapshot(docRef, (snap) => {
    if (!snap.metadata.fromCache) {
      setData(snap.data());
    }
  });

  return () => unsubscribe();
}, []);
```

### Memoization
```typescript
import { useMemo } from "react";

// Expensive computation
const combinedTasks = useMemo(() => {
  const map = new Map();
  cloudTasks.forEach(t => map.set(t.id, t));
  localTasks.forEach(t => map.set(t.id, t));
  return Array.from(map.values());
}, [cloudTasks, localTasks]);
```

---

## 📚 Αναφορές

### Documentation Files
- `BUSINESS_PLAN.md` - Business logic, schema, features
- `SERVICE_FLOWS.md` - Detailed flows για κάθε λειτουργία
- `to do.md` - Pending features & roadmap

### Key Files να Γνωρίζεις
- `app/context/SyncContext.tsx` - Offline sync logic
- `app/components/ImageEditorModal.tsx` - Image editing
- `firebaseConfig.ts` - Firebase initialization
- `app/_layout.tsx` - Root layout με SyncProvider

---

## 🚨 Critical Rules - ΔΙΑΒΑΣΕ ΠΡΩΤΑ

### 1. ΠΑΝΤΑ Cache + Firestore
```typescript
// ✅ Pattern να ακολουθείς ΠΑΝΤΟΤΕ
const saveData = async (data: any) => {
  // 1. Local
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  setData(data); // Optimistic UI

  // 2. Cloud
  await updateDoc(docRef, data);
};
```

### 2. ΠΑΝΤΑ Cleanup Listeners
```typescript
useEffect(() => {
  const unsubscribe = onSnapshot(...);
  return () => unsubscribe(); // ΥΠΟΧΡΕΩΤΙΚΟ
}, []);
```

### 3. ΠΑΝΤΑ Navigation Debounce
```typescript
const safeNavigate = (path: string) => {
  if (isNavigating) return; // Prevent double nav
  setIsNavigating(true);
  router.push(path);
  setTimeout(() => setIsNavigating(false), 500);
};
```

### 4. ΠΑΝΤΑ Ελεγχος για Offline
```typescript
const netState = await NetInfo.fetch();
if (!netState.isConnected) {
  Alert.alert("Offline", "Χρειάζεται σύνδεση");
  return;
}
```

---

## 🆕 Recently Implemented Features (v1.1.0)

### 1. Project Search & Filter System
**File:** `app/team/[id].tsx`

#### Implementation Details:
```typescript
// State Management
const [searchQuery, setSearchQuery] = useState("");
const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "completed">("all");
const [filterModalVisible, setFilterModalVisible] = useState(false);

// AsyncStorage Persistence (per team)
const FILTER_CACHE_KEY = `team_filters_${teamId}`;
```

#### Features:
- **Search Bar**: Real-time filtering by project title (case-insensitive)
- **Status Filter**: Bottom Sheet Modal με 4 options (all, active, pending, completed)
- **Persistence**: Filters saved to AsyncStorage and restored on mount
- **Visual Indicators**: Blue badge dot when filters active
- **UI Pattern**: Compact search bar + filter icon button (not always-visible buttons)

#### Filter Pipeline (3-stage):
```typescript
1. Role-based filter (Users see only assigned projects)
2. Status filter (if statusFilter !== "all")
3. Search filter (if searchQuery.trim())
```

---

### 2. 3-Stage Project Status System
**File:** `app/project/[id].tsx`

#### Status States:
```typescript
type ProjectStatus = "active" | "pending" | "completed";

// Transition Logic:
// - active: 0% tasks completed
// - pending: 1-99% tasks completed
// - completed: 100% tasks completed
```

#### Auto-Update Logic:
```typescript
useEffect(() => {
  const completedCount = combinedTasks.filter(t => t.status === "completed").length;
  const totalCount = combinedTasks.length;

  let newStatus: ProjectStatus;
  if (completedCount === totalCount) {
    newStatus = "completed";
  } else if (completedCount > 0) {
    newStatus = "pending";
  } else {
    newStatus = "active";
  }

  if (newStatus !== projectStatus) {
    setProjectStatus(newStatus);
    updateDoc(projectRef, { status: newStatus });
  }
}, [combinedTasks]);
```

#### Visual Badges:
- **Active**: 📋 Blue badge (#2563eb)
- **Pending**: ⏳ Orange badge (#d97706)
- **Completed**: ✅ Green badge (#16a34a)

---

### 3. Role Change Cleanup Logic
**File:** `app/team/[id].tsx` → `changeUserRole()`

#### Purpose:
Όταν αλλάζει ο ρόλος ενός χρήστη, πρέπει να αφαιρείται από τα projects arrays, αλλά **ΟΧΙ** να προστίθεται αυτόματα στο νέο array (manual assignment only).

#### Implementation:
```typescript
// After updating team role:
const q = query(collection(db, "projects"), where("teamId", "==", teamId));
const querySnapshot = await getDocs(q);

const updatePromises = querySnapshot.docs.map((projectDoc) => {
  // Case 1: User → Supervisor (remove from members[])
  if (targetUser.role === "User" && newRole === "Supervisor") {
    return updateDoc(projectDoc.ref, {
      members: arrayRemove(targetUser.id),
    });
  }
  // Case 2: Supervisor → User (remove from supervisors[])
  else if (targetUser.role === "Supervisor" && newRole === "User") {
    return updateDoc(projectDoc.ref, {
      supervisors: arrayRemove(targetUser.id),
    });
  }
  // Case 3: Supervisor → Admin (remove from supervisors[])
  else if (targetUser.role === "Supervisor" && newRole === "Admin") {
    return updateDoc(projectDoc.ref, {
      supervisors: arrayRemove(targetUser.id),
    });
  }
  // Case 4: Admin → Supervisor (no action - Admins never in arrays)
  else {
    return Promise.resolve();
  }
});

await Promise.all(updatePromises);
```

#### Design Decision:
- **NO auto-assignment**: Prevents unwanted project access
- **Manual selection only**: Admins manually assign users via Project Settings modal
- **Admins & Founders hidden**: Don't appear in assignment UI (automatic access)

---

### 4. Bottom Sheet Modal Pattern
**File:** `app/team/[id].tsx`

#### UI Pattern:
```typescript
// Filter Modal with Bottom Sheet
<Modal visible={filterModalVisible} transparent animationType="slide">
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      {/* Radio button options with badges */}
    </View>
  </View>
</Modal>
```

#### Styling:
```typescript
modalOverlay: {
  flex: 1,
  justifyContent: "flex-end",
  backgroundColor: "rgba(0,0,0,0.4)",
},
modalContent: {
  backgroundColor: "white",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  padding: 20,
  maxHeight: "70%",
}
```

---

### 5. Key Technical Decisions

#### AsyncStorage Keys Structure:
```typescript
// Filter persistence (per team)
`team_filters_${teamId}` → { search: string, status: string }
```

#### Firestore Schema Updates:
```typescript
// projects collection
{
  status: "active" | "pending" | "completed",  // NEW: 3-stage status
  // ... existing fields
}
```

#### State Management:
- **Search/Filter state**: Local useState (persisted to AsyncStorage)
- **Project status**: Real-time Firestore listeners με optimistic UI updates
- **Role cleanup**: Server-side batch updates (no local state)

---

## 🎯 Priorities Matrix

| Priority | Feature Type | Example |
|----------|--------------|---------|
| 🔴 **P0** | Data integrity, Offline sync | Merge conflicts, Queue cleanup |
| 🟠 **P1** | Core functionality | Task CRUD, Authentication |
| 🟡 **P2** | UX improvements | Animations, Loading states |
| 🟢 **P3** | Nice-to-have | Advanced filters, Analytics |

---

**Version:** 1.1.0
**Last Updated:** Φεβρουάριος 2026
**Maintainer:** Michael

---

**Σημείωση:** Αυτό το αρχείο είναι **living document**. Update όποτε αλλάζουν patterns ή standards.
