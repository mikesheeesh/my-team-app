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

---

## 🚧 Pending Features

### 🔴 Υψηλή Προτεραιότητα

- [ ] **Ρόλος Supervisor για χρήστες**
  - [ ] Δικαίωμα δημιουργίας project για Users
  - [ ] Αυτόματη ανάθεση σε Supervisor κατά τη δημιουργία
  - [ ] Update permissions matrix στο BUSINESS_PLAN.md

- [ ] **Φίλτρα αναζήτησης**
  - [ ] Search bar για projects
  - [ ] Filter by status (active/completed/pending)
  - [ ] Filter by assigned members
  - [ ] Search tasks by title/description

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
| Core Features | 3 | 0 | 3 |
| New Features | 0 | 2 | 2 |
| Rejected | 1 | 0 | 1 |
| **ΣΥΝΟΛΟ** | **3** | **2** | **5** |

**Progress:** 60% ολοκληρωμένο

---

## 📝 Notes

- Τα completed features έχουν ήδη documented στα BUSINESS_PLAN.md & SERVICE_FLOWS.md
- Supervisor role update θα χρειαστεί schema changes στο Firestore
- Φίλτρα αναζήτησης: consider using Algolia ή client-side filtering
- Project locking: soft-delete approach με `status: "archived"`

---

**Last Updated:** Ιανουάριος 2026
**Version:** 1.0.0
