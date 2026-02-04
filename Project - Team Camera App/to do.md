# ERGON WORK MANAGEMENT - TODO LIST

## 📋 Κατάσταση Features

### ✅ Ολοκληρωμένα

- [x] **GPS σε φωτογραφία και βίντεο**
  Location tracking με expo-location (Accuracy.Balanced)
  Google Maps integration με deep linking

- [x] **Edit φωτογραφίες με σχέδιο, zoom κλπ.**
  Advanced Image Editor με drawing/annotation tools
  Pan & zoom capabilities (1x-3x), 6 colors, 3 stroke widths
  **v2.1:** Boundary fixes για αποφυγή line jumps/flicks όταν το δάχτυλο βγαίνει εκτός canvas

- [x] **Web View**
  Full web support με react-native-web
  Platform-specific conditionals για optimized UX

- [x] **Φίλτρα αναζήτησης**
  Search bar για project titles (always visible)
  Filter by status (active/pending/completed) με Bottom Sheet Modal
  AsyncStorage persistence για filters (per team)
  Visual indicators (badge dot) για active filters

- [x] **3-Stage Project Status**
  Automatic status transitions: active → pending → completed
  Pending status όταν έστω 1 task ολοκληρωθεί
  Real-time status updates με Firestore listeners

- [x] **Role Change Cleanup Logic**
  Automatic removal από projects όταν αλλάζει ρόλος χρήστη
  User → Supervisor: Αφαίρεση από members[]
  Supervisor → User/Admin: Αφαίρεση από supervisors[]
  ΟΧΙ automatic assignment (manual selection only)

- [x] **Firebase Storage Migration (v2.0)**
  Base64 → Firebase Storage URLs για photos/videos
  **Λεπτομέρειες:**
  - Photos: 70% compression, full camera resolution
  - Videos: 720p HD, 2.5Mbps bitrate, 4 seconds max (react-native-compressor)
  - Team-isolated paths: `teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{ext}`
  - Storage URLs στο Firestore (~100 bytes vs 500KB+ base64)
  - Offline sync με automatic upload όταν επιστρέφει Internet
  - Migration script: `npm run migrate` για existing base64 data
  - 99.98% μείωση Firestore document size
  - 10x faster task loading

- [x] **Multiple Videos Support + UX Improvements**
  VideoTask υποστηρίζει πολλαπλά βίντεο (όπως PhotoTask)
  **Λεπτομέρειες:**
  - VideoTask: `value: string` → `videos: string[]`, `videoLocations: GeoPoint[]`
  - Backward compatibility με normalizeVideoTask() helper
  - No preview modal - media εμφανίζονται μόνο στο gallery
  - Auto-refresh gallery όταν προστεθεί/διαγραφεί media
  - GPS support για κάθε βίντεο ξεχωριστά
  - Badge δείχνει αριθμό βίντεο (π.χ. "3 videos")
  - Πλήρης ενημέρωση: SyncContext, PDF generation, UI rendering

- [x] **Clickable Invite Links με Web Landing Page (v2.0)**
  Web-based invite system με clickable https:// links
  **Λεπτομέρειες:**
  - Web landing page hosted on Vercel (free tier)
  - Clickable links σε όλα τα messaging apps (WhatsApp, Viber, Messenger, Email)
  - Auto-join functionality (zero manual code entry)
  - Smart device detection (mobile vs desktop)
  - Auto-redirect σε app μέσω deep linking
  - Download fallback για χρήστες χωρίς εγκατεστημένη app
  - Branded landing page με team logo και όνομα
  - Professional UX με gradient background, spinner animations
  - EAS build integration για APK download: https://expo.dev/artifacts/eas/4bXP8oAFwjZMK61hxRLpgx.apk
  - Vercel deployment με rewrites configuration
  - ~3 second end-to-end join workflow
  - 100% free hosting (Vercel free tier: 100GB/month)

---

## 🚧 Pending Features

### 🔴 Υψηλή Προτεραιότητα

- [ ] **Ρόλος Supervisor για χρήστες**
  - [ ] Δικαίωμα δημιουργίας project για Users
  - [ ] Αυτόματη ανάθεση σε Supervisor κατά τη δημιουργία
  - [ ] Update permissions matrix στο BUSINESS_PLAN.md

- [ ] **Task Search & Filtering**
  - [ ] Search tasks by title/description (within projects)
  - [ ] Filter tasks by status/priority
  - [ ] Filter by assigned members

### 🟡 Μέτρια Προτεραιότητα

- [ ] **Κλείσιμο project από owners**
  - [ ] Lock/Archive functionality
  - [ ] Prevent edits σε closed projects
  - [ ] Status badge: "Κλειστό"
  - [ ] Restore option για Founder/Admin

---

## ❌ Απορριφθέντα / Δεν Θα Γίνουν

- [x] **~~Φωτογραφίες και βίντεο αποθηκεύονται σε Google Drive του email ομάδας~~**
  **ΑΠΟΦΑΣΗ:** Υλοποιήθηκε με Firebase Storage (όχι Google Drive)
  **ΕΝΑΛΛΑΚΤΙΚΗ ΛΥΣΗ:** Firebase Storage με team isolation
  **v2.0:** Base64 deprecated, χρησιμοποιείται Firebase Storage

---

## 📊 Progress Overview

| Κατηγορία | Completed | Pending | Total |
|-----------|-----------|---------|-------|
| Core Features | 9 | 0 | 9 |
| New Features | 0 | 2 | 2 |
| Rejected | 1 | 0 | 1 |
| **ΣΥΝΟΛΟ** | **9** | **2** | **11** |

**Progress:** 81.8% ολοκληρωμένο

---

## 📝 Notes

- Τα completed features έχουν ήδη documented στα BUSINESS_PLAN.md & SERVICE_FLOWS.md
- Supervisor role update θα χρειαστεί schema changes στο Firestore
- Project search/filter: Implemented με client-side filtering (AsyncStorage persistence)
- 3-stage status: Auto-updates με Firestore real-time listeners
- Role cleanup: Αφαιρεί χρήστες από projects, αλλά ΟΧΙ auto-assignment
- Project locking: soft-delete approach με `status: "archived"` (pending)
- **Firebase Storage (v2.0):**
  - Media stored in Firebase Storage (not Firestore base64)
  - 99.98% smaller Firestore documents
  - 10x faster task loading
  - Team isolation με storage paths
  - Migration script available για existing data
  - Offline mode: Local URIs → Auto-upload when online
- **Multiple Videos Support:**
  - VideoTask τώρα υποστηρίζει arrays: `videos[]` και `videoLocations[]`
  - Backward compatible με παλιά format (normalizeVideoTask helper)
  - No preview modal - καλύτερο UX
  - Auto-refresh gallery με useEffect
  - GPS για κάθε βίντεο ξεχωριστά
- **Clickable Invite Links (v2.0):**
  - Web landing page: https://ergon-work-management.vercel.app
  - Clickable https:// links αντί για custom scheme (ergonwork://)
  - Auto-join με zero manual code entry
  - Hosted on Vercel free tier (100GB bandwidth/month)
  - Download button με real EAS build URL
  - Professional branded UX με app logo
- **Video Compression (v2.1):**
  - react-native-compressor library
  - Manual mode: 720p HD, 2.5Mbps bitrate
  - ~70% μείωση μεγέθους με καλή ποιότητα
  - Αυτόματη συμπίεση πριν το upload
- **Image Editor Boundaries (v2.1):**
  - Strict boundary checking (15px margin)
  - Αποτρέπει line jumps όταν το δάχτυλο βγαίνει εκτός canvas
  - Αποτρέπει flicks προς header/footer areas
  - Wild value detection για UI element transitions

---

**Last Updated:** Φεβρουάριος 2026
**Version:** 2.1.0
