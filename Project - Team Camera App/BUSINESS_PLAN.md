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
└── tasks: [
    {
      id: string,
      title: string,
      description: string,
      type: "photo" | "measurement" | "general",
      status: "pending" | "completed",
      value: string | null,
      images: string[] (base64)
    }
  ]
```

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
- Τρεις τύποι tasks:
  - **Photo**: Λήψη και αποθήκευση φωτογραφιών
  - **Measurement**: Καταγραφή μετρήσεων
  - **General**: Κείμενο/σημειώσεις
- Progress tracking (pending → completed)
- Long press για διαγραφή

### 5.6 Offline Support
- Cache με AsyncStorage
- Offline queue για pending uploads
- Auto-sync σε WiFi connection
- Visual indicator για local tasks

### 5.7 PDF Reports
- Αυτόματη δημιουργία αναφοράς
- Πίνακας tasks με status
- Ενσωματωμένες φωτογραφίες
- Share functionality

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
- [x] Photo tasks
- [x] Offline support
- [x] PDF reports

### Phase 2 - Enhanced Features
- [ ] Push notifications
- [ ] Task comments
- [ ] Task deadlines
- [ ] File attachments (beyond photos)
- [ ] Calendar view

### Phase 3 - Advanced
- [ ] Analytics dashboard
- [ ] Time tracking
- [ ] Geolocation tracking
- [ ] Voice notes
- [ ] Video capture

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
- **Storage**: 5GB (free tier)

### 10.3 Performance Targets
- App launch: <2 seconds
- Screen transition: <300ms
- Offline task save: <100ms
- Sync operation: <5 seconds per project

---

**Repository**: `/home/administrator/projects/my-team-app`

**Version**: 1.0.0

**Last Updated**: Ιανουάριος 2026
