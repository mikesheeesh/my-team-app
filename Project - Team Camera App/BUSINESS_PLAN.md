# ERGON WORK MANAGEMENT - BUSINESS PLAN

## 1. ΕΚΤΕΛΕΣΤΙΚΗ ΠΕΡΙΛΗΨΗ

### 1.1 Περιγραφή Προϊόντος
Το **Ergon Work Management** είναι μια cross-platform mobile εφαρμογή (iOS, Android, Web) για τη διαχείριση ομάδων εργασίας, projects και tasks. Σχεδιάστηκε για επιχειρήσεις που χρειάζονται field work management, όπως κατασκευαστικές εταιρείες, αρχιτεκτονικά γραφεία, τεχνικές υπηρεσίες και συνεργεία.

### 1.2 Value Proposition
- **Offline-First**: Πλήρης λειτουργικότητα χωρίς internet
- **Real-Time Sync**: Αυτόματος συγχρονισμός όταν υπάρχει WiFi
- **Ρόλοι & Δικαιώματα**: Ιεραρχική δομή (Founder → Admin → Supervisor → User)
- **Φωτογραφική Τεκμηρίωση**: Λήψη, αποθήκευση και κοινοποίηση φωτογραφιών
- **PDF Reports**: Αυτόματη δημιουργία αναφορών

### 1.3 Target Audience
| Κατηγορία | Περιγραφή |
|-----------|-----------|
| Κατασκευαστικές Εταιρείες | Διαχείριση έργων, εργοταξίων, συνεργείων |
| Αρχιτεκτονικά Γραφεία | Επιβλέψεις, αυτοψίες, τεκμηρίωση |
| Τεχνικές Υπηρεσίες | Συντήρηση, επισκευές, έλεγχοι |
| Property Management | Διαχείριση ακινήτων, επιθεωρήσεις |
| Facility Management | Διαχείριση κτιριακών εγκαταστάσεων |

---

## 2. ΔΟΜΗ ΕΦΑΡΜΟΓΗΣ

### 2.1 Τεχνολογικό Stack
| Τεχνολογία | Χρήση |
|------------|-------|
| React Native (Expo SDK 54) | Cross-platform development |
| TypeScript | Type-safe κώδικας |
| Firebase Auth | Authentication |
| Firestore | NoSQL Database |
| AsyncStorage | Local caching & offline queue |
| Expo Router | File-based navigation |
| React Native SVG | Drawing & annotations |
| React Native View Shot | Canvas capture |
| Expo Location | GPS coordinates |
| Expo AV | Video playback |
| Expo FileSystem | File operations & base64 |
| NetInfo | Network status monitoring |
| Expo Print | PDF generation |
| Expo Sharing | Native share functionality |

### 2.2 Αρχιτεκτονική
```
┌─────────────────────────────────────────────────────────────┐
│                      MOBILE APP                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Screens   │  │  Components │  │   Context   │         │
│  │  (app/*.tsx)│  │             │  │ (SyncContext│         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│  ┌──────┴────────────────┴────────────────┴──────┐         │
│  │              AsyncStorage (Cache)              │         │
│  └────────────────────────┬──────────────────────┘         │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                    FIREBASE BACKEND                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Auth       │  │  Firestore  │  │  Storage    │        │
│  │  (Users)    │  │  (Data)     │  │  (Files)    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└───────────────────────────────────────────────────────────┘
```

---

## 3. FIRESTORE DATABASE SCHEMA

### 3.1 Collection: `users`
```javascript
users/{userId}
├── fullname: string
├── email: string
├── phone: string
├── avatar: string | null
└── createdAt: timestamp
```

### 3.2 Collection: `teams`
```javascript
teams/{teamId}
├── name: string
├── type: string
├── contactEmail: string
├── logo: string | null (base64)
├── createdAt: timestamp
├── memberIds: string[]
├── roles: {
│   [userId]: "Founder" | "Admin" | "Supervisor" | "User"
│ }
└── groups: [
    {
      id: string,
      title: string,
      projects: [
        {
          id: string,
          title: string,
          status: "active" | "pending" | "completed",
          supervisors: string[],
          members: string[]
        }
      ]
    }
  ]
```

### 3.3 Collection: `projects`
```javascript
projects/{projectId}
├── title: string
├── status: "active" | "pending" | "completed"
├── teamId: string
├── supervisors: string[]
├── members: string[]
├── createdBy: string
├── createdAt: timestamp
└── tasks: Task[]  // Discriminated Union (see Task Types below)
```

**Task Types (Discriminated Union):**

Το Task schema χρησιμοποιεί **Discriminated Union Types** για type-safe data structure χωρίς unused fields:

```typescript
// Common GeoPoint Type
type GeoPoint = {
  lat: number;
  lng: number;
}

// Photo Task - Contains images array με GPS locations
type PhotoTask = {
  id: string;
  title: string;
  description?: string;
  type: "photo";                    // Discriminator
  status: "pending" | "completed";
  images: string[];                 // Base64 encoded images
  imageLocations: GeoPoint[];       // GPS for each image
  isLocal?: boolean;
}

// Video Task - Contains single video URI
type VideoTask = {
  id: string;
  title: string;
  description?: string;
  type: "video";                    // Discriminator
  status: "pending" | "completed";
  value: string;                    // Base64 video URI
  isLocal?: boolean;
}

// Measurement Task - Contains numeric/text value
type MeasurementTask = {
  id: string;
  title: string;
  description?: string;
  type: "measurement";              // Discriminator
  status: "pending" | "completed";
  value: string;                    // Measurement value
  isLocal?: boolean;
}

// General Task - Contains text notes
type GeneralTask = {
  id: string;
  title: string;
  description?: string;
  type: "general";                  // Discriminator
  status: "pending" | "completed";
  value: string;                    // Text content
  isLocal?: boolean;
}

// Union Type
type Task = PhotoTask | VideoTask | MeasurementTask | GeneralTask;
```

**Πλεονεκτήματα Discriminated Unions:**
- ✅ Type-safe: TypeScript εξασφαλίζει σωστή πρόσβαση σε properties
- ✅ No unused fields: Κάθε task type έχει μόνο τα fields που χρειάζεται
- ✅ Clear semantics: Ο τύπος του task καθορίζει τα available properties
- ✅ Better IntelliSense: Auto-complete δείχνει μόνο valid properties

### 3.4 Collection: `invites`
```javascript
invites/{inviteId}
├── code: string (6 χαρακτήρες)
├── teamId: string
├── teamName: string
├── role: "Admin" | "Supervisor" | "User"
├── createdBy: string
├── createdAt: timestamp
└── status: "active" | "used" | "expired"
```

---

## 4. ΡΟΛΟΙ & ΔΙΚΑΙΩΜΑΤΑ

### 4.1 Ιεραρχία Ρόλων

| Ρόλος | Επίπεδο | Περιγραφή |
|-------|---------|-----------|
| **Founder** | 1 | Ιδρυτής ομάδας, πλήρη δικαιώματα |
| **Admin** | 2 | Διαχειριστής, σχεδόν πλήρη δικαιώματα |
| **Supervisor** | 3 | Επόπτης, διαχείριση projects & users |
| **User** | 4 | Απλός χρήστης, εκτέλεση tasks |

### 4.2 Πίνακας Δικαιωμάτων

| Ενέργεια | Founder | Admin | Supervisor | User |
|----------|---------|-------|------------|------|
| Διαγραφή Ομάδας | ✅ | ❌ | ❌ | ❌ |
| Αλλαγή Ονόματος/Logo | ✅ | ✅ | ❌ | ❌ |
| Δημιουργία Group | ✅ | ✅ | ❌ | ❌ |
| Διαγραφή Group | ✅ | ✅ | ❌ | ❌ |
| Δημιουργία Project | ✅ | ✅ | ✅ | ❌ |
| Διαγραφή Project | ✅ | ✅ | ✅ | ❌ |
| Ανάθεση Supervisors | ✅ | ✅ | ❌ | ❌ |
| Ανάθεση Members | ✅ | ✅ | ✅ | ❌ |
| Πρόσκληση Admin | ✅ | ✅ | ❌ | ❌ |
| Πρόσκληση Supervisor | ✅ | ✅ | ❌ | ❌ |
| Πρόσκληση User | ✅ | ✅ | ✅ | ❌ |
| Promote User | ✅ | ✅ | ❌ | ❌ |
| Demote User | ✅ | ✅ | ❌ | ❌ |
| Kick User | ✅ | ✅ | ✅* | ❌ |
| Δημιουργία Task | ✅ | ✅ | ✅ | ✅ |
| Ολοκλήρωση Task | ✅ | ✅ | ✅ | ✅ |
| Προβολή όλων Projects | ✅ | ✅ | ✅ | ❌ |
| Προβολή assigned Projects | ✅ | ✅ | ✅ | ✅ |

*Supervisor μπορεί να κάνει kick μόνο Users (όχι Supervisors/Admins)

---

## 5. ΛΕΙΤΟΥΡΓΙΚΟΤΗΤΕΣ

### 5.1 Authentication
- Email/Password Login & Registration
- Persistent session με AsyncStorage
- Auto-redirect βάσει auth state

### 5.2 Team Management
- Δημιουργία ομάδας με όνομα, τύπο, email επικοινωνίας
- Αλλαγή logo (image picker με compression)
- Διαχείριση μελών (promote, demote, kick)
- Real-time updates με Firestore listeners

### 5.3 Invite System
- Δημιουργία 6-ψήφιου κωδικού πρόσκλησης
- Επιλογή ρόλου νέου μέλους
- 2 λεπτά expiration time
- Deep linking support (ergonwork://join?inviteCode=XXXXXX)
- One-time use (διαγράφεται μετά τη χρήση)

### 5.4 Project Management
- Οργάνωση σε Groups
- Δημιουργία projects με τίτλο
- Ανάθεση Supervisors & Members
- Μεταφορά project μεταξύ groups
- Auto-complete όταν όλα τα tasks ολοκληρωθούν

### 5.5 Task Management
- Τέσσερις τύποι tasks:
  - **Photo**: Λήψη και αποθήκευση φωτογραφιών με GPS coordinates
  - **Video**: Βίντεο έως 4 δευτερόλεπτα (max 900KB)
  - **Measurement**: Καταγραφή μετρήσεων
  - **General**: Κείμενο/σημειώσεις
- Task descriptions (προαιρετικό πεδίο κειμένου)
- Progress tracking (pending → completed)
- Task editing (τίτλος, περιγραφή, τύπος)
- Long press για επεξεργασία/διαγραφή
- Αυτόματη ολοκλήρωση όταν προστεθεί media (photo/video)

### 5.6 Offline Support
- Cache με AsyncStorage
- Offline queue για pending uploads
- Auto-sync σε WiFi connection
- Manual sync με cellular data confirmation
- Visual indicator για local tasks ("Τοπικό" badge)
- Sync button με cloud icon όταν υπάρχουν pending tasks
- Real-time network monitoring με NetInfo

### 5.7 PDF Reports
- Αυτόματη δημιουργία αναφοράς με προηγμένο styling
- Summary cards (total tasks, completed, status)
- Πίνακας tasks με:
  - Task type icons (📷 📹 📏 📝)
  - Descriptions
  - Color-coded status badges
  - Media count indicators
- Gallery section με φωτογραφίες και βίντεο
- Project metadata (ID, timestamp)
- Professional layout με Inter font
- Share functionality (PDF export)

### 5.8 Advanced Image Editor
- Drawing/annotation tools με pen
- Pan & zoom capabilities (1x έως 3x)
- Color selection (6 χρώματα: κόκκινο, κίτρινο, πράσινο, μπλε, άσπρο, μαύρο)
- Stroke width options (3px, 6px, 10px)
- Undo functionality
- Reset/clear all drawings
- Native crop on capture
- Smooth gesture handling με PanResponder
- ViewShot integration για image capture
- Real-time SVG path rendering

### 5.9 Location Services
- GPS coordinates attached to images
- Location tracking με expo-location (Accuracy.Balanced)
- Location display in media viewer
- Google Maps integration με deep linking
- Fallback handling για offline GPS
- Location validation (check for 0,0 defaults)

### 5.10 Media Management
- Photo & Video gallery viewer
- Media sharing (native share sheet)
- Media deletion με confirmation
- Video playback με native controls
- Image compression (800px width, 40% quality)
- Base64 encoding για offline storage
- File system caching για sharing
- Index-based media organization με location sync

### 5.11 Auto-Complete Projects
- Automatic status update σε "completed" όταν όλα τα tasks ολοκληρωθούν
- Reverse update σε "active" αν κάποιο task γίνει pending
- Real-time status tracking με useEffect
- Firestore sync για project status changes

### 5.12 Project Search & Filter (v1.1.0)
**Αρχείο:** `app/team/[id].tsx`

#### Features:
- **Search Bar**: Real-time filtering by project title
  - Always visible at top of screen
  - Case-insensitive search
  - Clear button (X icon) when text entered
- **Status Filter**: Bottom Sheet Modal
  - 4 options: All, Active, Pending, Completed
  - Visual badges με χρωματική κωδικοποίηση
  - Radio button selection
- **Filter Persistence**: AsyncStorage per team
  - Filters saved automatically on change
  - Restored on app launch
- **Visual Indicators**:
  - Blue badge dot on filter icon when active
  - Active filter button styling

#### Filter Pipeline:
```
1. Role-based filter (Users see only assigned projects)
   ↓
2. Status filter (if statusFilter !== "all")
   ↓
3. Search filter (if searchQuery.trim())
```

#### UX Benefits:
- Instant project discovery σε μεγάλες ομάδες
- Quick status overview
- Persistent filters = faster workflow

### 5.13 3-Stage Project Status (v1.1.0)
**Αρχείο:** `app/project/[id].tsx`

#### Status States:
| Status | Icon | Condition | Badge Color |
|--------|------|-----------|-------------|
| **active** | 📋 | 0% tasks completed | Blue (#2563eb) |
| **pending** | ⏳ | 1-99% tasks completed | Orange (#d97706) |
| **completed** | ✅ | 100% tasks completed | Green (#16a34a) |

#### Auto-Transition Logic:
- **Active → Pending**: Όταν ολοκληρωθεί το 1ο task
- **Pending → Completed**: Όταν ολοκληρωθεί το τελευταίο task
- **Completed → Pending**: Όταν task γίνει pending (photo delete)
- **Pending → Active**: Όταν όλα τα completed tasks γίνουν pending

#### Implementation:
- Real-time calculation με `useEffect` on task changes
- Firestore automatic sync
- Cache update για offline consistency
- Visual feedback με status badges

#### Business Value:
- Clear project progress visibility
- Automatic workflow tracking
- No manual status updates needed
- Better team coordination

### 5.14 Role Change Cleanup (v1.1.0)
**Αρχείο:** `app/team/[id].tsx` → `changeUserRole()`

#### Functionality:
Όταν αλλάζει ο ρόλος ενός χρήστη, αυτόματα αφαιρείται από project arrays:

#### Cleanup Rules:
| Role Change | Action | Result |
|-------------|--------|--------|
| User → Supervisor | Remove from `members[]` | Manual re-assignment needed |
| Supervisor → User | Remove from `supervisors[]` | Manual re-assignment needed |
| Supervisor → Admin | Remove from `supervisors[]` | Admin has automatic access |
| Admin → Supervisor | No action | Admins never in arrays |

#### Design Philosophy:
- **No Auto-Assignment**: Prevents unwanted access
- **Manual Control**: Admins explicitly assign users to projects
- **Granular Permissions**: Per-project assignment
- **Hierarchy Respect**:
  - Admins & Founders: Automatic access (not in arrays)
  - Supervisors & Users: Manual per-project assignment

#### Technical Implementation:
```typescript
// Batch update all team projects
const q = query(collection(db, "projects"), where("teamId", "==", teamId));
const querySnapshot = await getDocs(q);

// Remove user from appropriate array based on role change
updatePromises.map(projectDoc => {
  if (oldRole === "User") return updateDoc({ members: arrayRemove(userId) });
  if (oldRole === "Supervisor") return updateDoc({ supervisors: arrayRemove(userId) });
  // ... etc
});
```

#### Benefits:
- Clean project membership lists
- Clear audit trail of assignments
- Prevents permission escalation bugs
- Supports dynamic team restructuring

---

## 6. BUSINESS MODEL

### 6.1 Freemium Model

| Tier | Τιμή | Features |
|------|------|----------|
| **Free** | 0€/μήνα | 1 ομάδα, 3 μέλη, 5 projects |
| **Starter** | 9.99€/μήνα | 1 ομάδα, 10 μέλη, 20 projects |
| **Business** | 29.99€/μήνα | 3 ομάδες, 50 μέλη, unlimited projects |
| **Enterprise** | Custom | Unlimited, custom features, support |

### 6.2 Revenue Streams
1. **Subscriptions**: Μηνιαίες/ετήσιες συνδρομές
2. **Storage Add-ons**: Επιπλέον αποθηκευτικός χώρος
3. **White Label**: Custom branding για μεγάλες εταιρείες
4. **API Access**: Integration με τρίτα συστήματα

---

## 7. ROADMAP

### Phase 1 - MVP (Current)
- [x] Authentication
- [x] Team creation & management
- [x] Invite system
- [x] Project & task management
- [x] Photo tasks με GPS coordinates
- [x] Video tasks (4-second max)
- [x] Advanced image editor με drawing/annotations
- [x] Offline support με cellular confirmation
- [x] PDF reports με advanced layout
- [x] Task descriptions
- [x] Task editing & deletion
- [x] Media sharing
- [x] Location tracking
- [x] Auto-complete projects
- [x] Web support
- [x] Project search & filter (v1.1.0)
- [x] 3-stage project status (v1.1.0)
- [x] Role change cleanup logic (v1.1.0)

### Phase 2 - Enhanced Features
- [ ] Push notifications
- [ ] Task comments & mentions
- [ ] Task deadlines & reminders
- [ ] File attachments (PDFs, docs)
- [ ] Calendar view
- [ ] Extended video duration (>4s)
- [ ] Cloud storage integration

### Phase 3 - Advanced
- [ ] Analytics dashboard
- [ ] Time tracking
- [ ] Voice notes
- [ ] Multi-language support

### Phase 4 - Enterprise
- [ ] LDAP/SSO integration
- [ ] Custom workflows
- [ ] API for integrations
- [ ] Advanced reporting
- [ ] Multi-language support

---

## 8. ΑΝΤΑΓΩΝΙΣΤΙΚΟ ΠΛΕΟΝΕΚΤΗΜΑ

| Feature | Ergon | Competitor A | Competitor B |
|---------|-------|--------------|--------------|
| Offline-First | ✅ | ⚠️ Limited | ❌ |
| Photo Documentation | ✅ | ✅ | ⚠️ |
| Real-time Sync | ✅ | ✅ | ✅ |
| Role Hierarchy | ✅ 4 levels | ⚠️ 2 levels | ⚠️ 2 levels |
| One-time Invite Codes | ✅ | ❌ | ❌ |
| PDF Reports | ✅ | ✅ | ❌ |
| Cross-platform | ✅ | ⚠️ iOS only | ✅ |
| Greek Localization | ✅ Native | ❌ | ❌ |

---

## 9. KEY METRICS (KPIs)

| Metric | Περιγραφή | Target (Year 1) |
|--------|-----------|-----------------|
| MAU | Monthly Active Users | 5,000 |
| Teams Created | Συνολικές ομάδες | 1,000 |
| Conversion Rate | Free → Paid | 5% |
| Churn Rate | Μηνιαία απώλεια | <5% |
| NPS | Net Promoter Score | >40 |
| DAU/MAU | Engagement ratio | >30% |

---

## 10. ΤΕΧΝΙΚΕΣ ΑΠΑΙΤΗΣΕΙΣ

### 10.1 System Requirements
- **iOS**: 14.0+
- **Android**: API 24+ (Android 7.0)
- **Web**: Modern browsers (Chrome, Firefox, Safari, Edge)

### 10.2 Firebase Usage
- **Auth**: 10K verifications/month (free tier)
- **Firestore**: 50K reads, 20K writes/day (free tier)
- **Storage**: Base64 encoding used (no Firebase Storage needed currently)

### 10.3 Android Permissions
- `CAMERA` - Photo/video capture
- `RECORD_AUDIO` - Video recording
- `READ_EXTERNAL_STORAGE` - Media access
- `WRITE_EXTERNAL_STORAGE` - Media saving
- `READ_MEDIA_VISUAL_USER_SELECTED` - Scoped storage
- `ACCESS_MEDIA_LOCATION` - GPS exif data
- `READ_MEDIA_IMAGES` - Image gallery
- `READ_MEDIA_VIDEO` - Video gallery
- `READ_MEDIA_AUDIO` - Audio metadata
- `ACCESS_FINE_LOCATION` - GPS coordinates
- `ACCESS_COARSE_LOCATION` - Approximate location

### 10.4 Performance Targets
- App launch: <2 seconds
- Screen transition: <300ms (με 500ms navigation lock)
- Offline task save: <100ms
- Sync operation: <5 seconds per project
- Image compression: <1 second per image
- Video encoding: <2 seconds per video
- PDF generation: <3 seconds για 20 tasks
- Drawing/annotation: Real-time με Animated Values

---

**Repository**: `/home/administrator/projects/my-team-app`

**Version**: 1.1.0

**Last Updated**: Φεβρουάριος 2026
