# ERGON WORK MANAGEMENT - TODO LIST

## Ολοκληρωμένα

- [x] GPS σε φωτογραφία και βίντεο (expo-location, Google Maps deep linking)
- [x] Edit φωτογραφίες με σχέδιο, zoom (v2.1: boundary fixes)
- [x] Web View (react-native-web)
- [x] Φίλτρα αναζήτησης (search bar, status filter, AsyncStorage persistence)
- [x] 3-Stage Project Status (active/pending/completed, auto-transitions)
- [x] Role Change Cleanup (auto-remove from project arrays)
- [x] Firebase Storage Migration v2.0 (99.98% smaller docs, 10x faster loading)
- [x] Multiple Videos Support (videos[], videoLocations[], normalizeVideoTask)
- [x] Clickable Invite Links v2.0 (web landing page, auto-join, ~3sec)
- [x] Enhanced PDF Report v2.1 (thumbnails, GPS links, completion dates, card layout)
- [x] Sync Queue Stuck Fix (file validation, retry counter, abort flag, re-sync)
- [x] Custom Loading Screen (logo + version)
- [x] Gallery Picker (bottom sheet modal)
- [x] OTA Updates (expo-updates, EAS Update)
- [x] **Google Drive Sync v2.0.1** (OAuth2, auto-backup, folder structure, Excel)
  - OAuth2 connect/disconnect flow
  - Auto-sync κατά το άνοιγμα της εφαρμογής (DriveSyncContext)
  - Hash-based change detection (normalized URLs, αποφυγή re-uploads)
  - Folder structure: Ergon Work Management → Team → Group → Project → Photos/Videos
  - Upload photos + videos από Firebase Storage → Drive
  - Excel αρχεία ανά project (measurement + general tasks)
  - Progress indicator κατά τον συγχρονισμό
  - Drive Sync Modal (connect, sync now, disconnect)
- [x] **Auto-share Drive folder με μέλη ομάδας** (writer role, χωρίς notification email)
- [x] **"Άνοιγμα στο Drive" button** (πράσινο κουμπί → Linking.openURL στον team folder)
- [x] **PDF one-photo-per-page** (page-break-before: always, αρίθμηση, τίτλος task μόνο στην 1η)
- [x] **PDF EXIF orientation fix** (ImageManipulator με `[{ rotate: 0 }]`)
- [x] **PDF centering fix** (`<center>` tag για WebKit compatibility)
- [x] **PDF GPS links χωρίς όριο** (αφαίρεση .slice(0,4))

---

## Pending Features

### Υψηλή Προτεραιότητα

- [ ] **Task Search & Filtering**
  - Search tasks by title/description (within projects)
  - Filter tasks by status/type

### Μέτρια Προτεραιότητα

- [ ] **Κλείσιμο project από owners**
  - Lock/Archive functionality
  - Prevent edits, status badge "Κλειστό"
  - Restore option για Founder/Admin

- [ ] **Push Notifications**
  - Ειδοποίηση όταν task ολοκληρώνεται
  - Ειδοποίηση νέου μέλους στην ομάδα

### Χαμηλή Προτεραιότητα

- [ ] **Task comments & mentions**
- [ ] **Task deadlines & reminders**
- [ ] **Calendar view**
- [ ] **Analytics dashboard**
- [ ] **Time tracking**

---

## Progress

| Κατηγορία | Done | Pending | Total |
|-----------|------|---------|-------|
| Features | 22 | 7 | 29 |

**Progress:** 75.9%

---

**Last Updated:** Φεβρουάριος 2026
**Version:** 2.0.1
