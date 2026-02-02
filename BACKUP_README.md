# 📦 Backup Scripts - Team Camera App

Οδηγίες χρήσης των backup scripts για το project.

---

## 📋 Περιεχόμενα

1. [Διαθέσιμα Scripts](#διαθέσιμα-scripts)
2. [Οδηγίες Χρήσης](#οδηγίες-χρήσης)
3. [Τι Εξαιρείται](#τι-εξαιρείται)
4. [Troubleshooting](#troubleshooting)

---

## 🔧 Διαθέσιμα Scripts

### 1. `backup.bat` (Απλό - Συνιστάται)
**Απλό batch script για γρήγορο backup**

**Χαρακτηριστικά:**
- ✅ Απλή χρήση - double-click και τρέχει
- ✅ Δεν χρειάζεται administrator
- ✅ Αυτόματο άνοιγμα φακέλου BackUp
- ✅ Ονομασία με ημερομηνία/ώρα
- ⚠️ Βασικό progress indication

**Πώς να το τρέξω:**
```
1. Κάνε double-click στο backup.bat
2. Περίμενε να ολοκληρωθεί
3. Έτοιμο! Θα ανοίξει ο φάκελος BackUp
```

---

### 2. `backup.ps1` (Advanced - PowerShell)
**Advanced PowerShell script με περισσότερες δυνατότητες**

**Χαρακτηριστικά:**
- ✅ Progress bar με ποσοστό ολοκλήρωσης
- ✅ Έγχρωμο output
- ✅ Αυτόματη διαγραφή παλιών backups (κρατάει τα 10 πιο πρόσφατα)
- ✅ Καλύτερη απόδοση
- ✅ Detailed error messages

**Πώς να το τρέξω:**

**Option A: Δεξί Click → Run with PowerShell**
```
1. Δεξί click στο backup.ps1
2. "Run with PowerShell"
3. Περίμενε να ολοκληρωθεί
```

**Option B: Από PowerShell Terminal**
```powershell
# Βασική χρήση
.\backup.ps1

# Κράτα όλα τα παλιά backups (no cleanup)
.\backup.ps1 -KeepOld

# Κράτα μόνο τα 5 πιο πρόσφατα
.\backup.ps1 -MaxBackups 5
```

**Αν παίρνεις execution policy error:**
```powershell
# Τρέξε αυτό πρώτα (μόνο μία φορά):
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Μετά τρέξε το script κανονικά:
.\backup.ps1
```

---

## 📂 Τι Εξαιρείται από το Backup

Τα παρακάτω φακέλοι και αρχεία **ΔΕΝ** συμπεριλαμβάνονται στο backup:

### Φακέλοι:
- `node_modules/` - Dependencies (μπορούν να ξανακατέβουν με npm install)
- `.git/` - Git history (μεγάλος σε μέγεθος)
- `.expo/` - Expo cache
- `BackUp/` - Προηγούμενα backups
- `.next/`, `build/`, `dist/` - Build outputs
- `.cache/` - Cache files

### Αρχεία:
- `*.log` - Log files
- `.DS_Store`, `Thumbs.db` - System files
- `.env.local` - Local environment (security)
- `backup.bat`, `backup.ps1` - Backup scripts

**Αποτέλεσμα:** Το ZIP θα περιέχει **μόνο τον source code** και τα configuration files.

---

## 📊 Παράδειγμα Backup

```
📦 my-team-app_2026-02-02_15-30-45.zip
├── 📁 app/
│   ├── index.tsx
│   ├── team/
│   ├── project/
│   └── components/
├── 📁 Project - Team Camera App/
├── 📄 package.json
├── 📄 tsconfig.json
├── 📄 app.json
└── ...
```

**Τυπικό μέγεθος:** 5-15 MB (χωρίς node_modules)

---

## 🎯 Πότε να Κάνω Backup

**Συνιστώμενες περιπτώσεις:**
- ✅ Πριν από μεγάλες αλλαγές στον κώδικα
- ✅ Μετά την ολοκλήρωση features
- ✅ Πριν από updates (Expo SDK, dependencies)
- ✅ Τέλος κάθε εβδομάδας
- ✅ Πριν από deployment

---

## 🔍 Που Αποθηκεύεται το Backup

**Τοποθεσία:** `C:\Users\Michael\BackUp\`

**Ονομασία αρχείων:**
```
my-team-app_YYYY-MM-DD_HH-MM-SS.zip

Παραδείγματα:
- my-team-app_2026-02-02_15-30-45.zip
- my-team-app_2026-02-02_18-22-10.zip
```

**Auto-Cleanup (μόνο PowerShell):**
- Το `backup.ps1` κρατάει αυτόματα τα 10 πιο πρόσφατα backups
- Διαγράφει τα παλιότερα για εξοικονόμηση χώρου

---

## 🛠️ Troubleshooting

### ❌ "Δεν μπορώ να τρέξω το backup.ps1"

**Λύση 1: Execution Policy**
```powershell
# Τρέξε ως Administrator στο PowerShell:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Λύση 2: Bypass για μια φορά**
```powershell
powershell -ExecutionPolicy Bypass -File .\backup.ps1
```

---

### ❌ "Το backup παίρνει πολλή ώρα"

**Αιτίες:**
- Μεγάλος αριθμός αρχείων
- Αργό hard drive

**Λύσεις:**
- Χρησιμοποίησε το `backup.ps1` (πιο γρήγορο)
- Κλείσε άλλα προγράμματα
- Έλεγξε αν εξαιρούνται σωστά τα node_modules

---

### ❌ "Δεν βρίσκω το BackUp folder"

**Λύση:**
1. Άνοιξε File Explorer
2. Πήγαινε στο: `C:\Users\Michael\`
3. Βρες το φάκελο `BackUp\`
4. Ή copy-paste στο address bar: `C:\Users\Michael\BackUp`

---

### ❌ "Το ZIP είναι πολύ μεγάλο (>100MB)"

**Πιθανή αιτία:** Τα node_modules δεν εξαιρέθηκαν σωστά

**Λύση:**
1. Άνοιξε το ZIP και έλεγξε αν υπάρχει `node_modules/`
2. Αν ναι, βεβαιώσου ότι υπάρχει το `backup_exclude.txt`
3. Τρέξε ξανά το script

---

## 📞 Επιπλέον Βοήθεια

Αν αντιμετωπίζεις πρόβλημα:

1. **Έλεγξε το error message** - Συνήθως δείχνει τι πήγε στραβά
2. **Τρέξε ξανά** - Μερικές φορές λύνει το πρόβλημα
3. **Χρησιμοποίησε το άλλο script** - Αν το .bat δεν δουλεύει, δοκίμασε .ps1

---

## 🎉 Tips & Tricks

### 💡 Γρήγορο Backup (Keyboard Shortcut)
1. Δημιούργησε shortcut του `backup.bat` στο Desktop
2. Δεξί click → Properties → Shortcut key: `Ctrl+Alt+B`
3. Πάτησε `Ctrl+Alt+B` οποιαδήποτε στιγμή για instant backup!

### 💡 Scheduled Backup (Αυτόματο)
Χρησιμοποίησε το Windows Task Scheduler:
```
1. Άνοιξε "Task Scheduler"
2. Create Basic Task → "My Team App Backup"
3. Trigger: Weekly (π.χ. κάθε Παρασκευή 18:00)
4. Action: Start Program → backup.bat
5. Finish!
```

### 💡 Cloud Sync
Για extra ασφάλεια, sync το `C:\Users\Michael\BackUp\` με:
- Google Drive
- OneDrive
- Dropbox

---

**Version:** 1.0.0
**Last Updated:** Φεβρουάριος 2026
**Maintainer:** Michael
