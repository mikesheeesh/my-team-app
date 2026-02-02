# ERGON WORK MANAGEMENT - TODO LIST

## 📋 Κατάσταση Features

### ✅ Ολοκληρωμένα

- [x] **GPS σε φωτογραφία και βίντεο**
  Location tracking με expo-location (Accuracy.Balanced)
  Google Maps integration με deep linking

- [x] **Edit φωτογραφίες με σχέδιο, zoom κλπ.**
  Advanced Image Editor με drawing/annotation tools
  Pan & zoom capabilities (1x-3x), 6 colors, 3 stroke widths

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
  **ΑΠΟΦΑΣΗ:** ΟΧΙ
  **ΛΟΓΟΣ:** Base64 encoding σε Firestore είναι αρκετό για MVP
  Potential future feature σε Phase 3 με cloud storage integration

---

## 📊 Progress Overview

| Κατηγορία | Completed | Pending | Total |
|-----------|-----------|---------|-------|
| Core Features | 6 | 0 | 6 |
| New Features | 0 | 2 | 2 |
| Rejected | 1 | 0 | 1 |
| **ΣΥΝΟΛΟ** | **6** | **2** | **8** |

**Progress:** 75% ολοκληρωμένο

---

## 📝 Notes

- Τα completed features έχουν ήδη documented στα BUSINESS_PLAN.md & SERVICE_FLOWS.md
- Supervisor role update θα χρειαστεί schema changes στο Firestore
- Project search/filter: Implemented με client-side filtering (AsyncStorage persistence)
- 3-stage status: Auto-updates με Firestore real-time listeners
- Role cleanup: Αφαιρεί χρήστες από projects, αλλά ΟΧΙ auto-assignment
- Project locking: soft-delete approach με `status: "archived"` (pending)

---

**Last Updated:** Φεβρουάριος 2026
**Version:** 1.1.0
