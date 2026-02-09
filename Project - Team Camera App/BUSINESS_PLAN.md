# ERGON WORK MANAGEMENT - BUSINESS PLAN

## 1. ΕΚΤΕΛΕΣΤΙΚΗ ΠΕΡΙΛΗΨΗ

### Περιγραφή
Cross-platform mobile εφαρμογή (iOS, Android, Web) για διαχείριση ομάδων εργασίας, projects και tasks. Σχεδιάστηκε για field work management (κατασκευαστικές, αρχιτεκτονικά γραφεία, τεχνικές υπηρεσίες, facility management).

### Value Proposition
- **Offline-First**: Πλήρης λειτουργικότητα χωρίς internet
- **Real-Time Sync**: Αυτόματος συγχρονισμός σε WiFi
- **Ρόλοι & Δικαιώματα**: 4-level ιεραρχία (Founder → Admin → Supervisor → User)
- **Φωτογραφική Τεκμηρίωση**: Camera + GPS + annotations
- **PDF Reports**: Αυτόματη δημιουργία αναφορών

---

## 2. ΤΕΧΝΟΛΟΓΙΚΟ STACK

| Τεχνολογία | Χρήση |
|------------|-------|
| React Native (Expo SDK 54) | Cross-platform |
| TypeScript | Type-safe code |
| Firebase Auth/Firestore/Storage | Backend |
| AsyncStorage | Offline cache & queue |
| Expo Router | File-based navigation |
| React Native SVG + View Shot | Drawing & capture |
| Expo Location | GPS |
| Expo AV | Video playback |
| react-native-compressor | Video compression |
| Expo Print/Sharing | PDF generation |

---

## 3. FIRESTORE DATABASE SCHEMA

### `users/{userId}`
`fullname`, `email`, `phone`, `avatar`, `createdAt`

### `teams/{teamId}`
`name`, `type`, `contactEmail`, `logo`, `createdAt`, `memberIds[]`, `roles: { [userId]: Role }`, `groups: [{ id, title, projects: [{ id, title, status, supervisors[], members[] }] }]`

### `projects/{projectId}`
`title`, `status` (active|pending|completed), `teamId`, `supervisors[]`, `members[]`, `createdBy`, `createdAt`, `tasks: Task[]`

**Task Types (Discriminated Union):**
- **PhotoTask:** `{ type: "photo", images: string[], imageLocations: GeoPoint[] }`
- **VideoTask:** `{ type: "video", videos: string[], videoLocations: GeoPoint[] }`
- **MeasurementTask:** `{ type: "measurement", value: string }`
- **GeneralTask:** `{ type: "general", value: string }`

Common fields: `id`, `title`, `description?`, `status`, `isLocal?`, `completedAt?`

### `invites/{inviteId}`
`code` (6 chars), `teamId`, `teamName`, `role`, `createdBy`, `createdAt`, `status`

---

## 4. ΡΟΛΟΙ & ΔΙΚΑΙΩΜΑΤΑ

| Ενέργεια | Founder | Admin | Supervisor | User |
|----------|---------|-------|------------|------|
| Διαγραφή Ομάδας | ✅ | - | - | - |
| Αλλαγή Ονόματος/Logo | ✅ | ✅ | - | - |
| Δημιουργία Group | ✅ | ✅ | - | - |
| Δημιουργία Project | ✅ | ✅ | ✅ | - |
| Ανάθεση Supervisors | ✅ | ✅ | - | - |
| Ανάθεση Members | ✅ | ✅ | ✅ | - |
| Πρόσκληση (Admin/Supervisor) | ✅ | ✅ | - | - |
| Πρόσκληση User | ✅ | ✅ | ✅ | - |
| Promote/Demote | ✅ | ✅ | - | - |
| Kick | ✅ | ✅ | ✅* | - |
| Task CRUD | ✅ | ✅ | ✅ | ✅ |
| Προβολή όλων Projects | ✅ | ✅ | ✅ | - |
| Προβολή assigned | ✅ | ✅ | ✅ | ✅ |

*Supervisor kick μόνο Users

---

## 5. ΛΕΙΤΟΥΡΓΙΚΟΤΗΤΕΣ

### Core (v1.0)
- Authentication (email/password, persistent session)
- Team management (create, logo, members, roles)
- Invite system (6-digit code, 2min expiration, one-time use)
- Project management (groups, CRUD, supervisors/members assignment)
- 4 task types: Photo (με GPS), Video (4s max), Measurement, General
- Advanced image editor (drawing, pan/zoom, 6 colors, 3 strokes)
- Offline support (AsyncStorage queue, WiFi auto-sync, cellular confirmation)
- PDF reports (summary cards, task table, gallery)

### v1.1.0
- Project search & filter (search bar + status filter, AsyncStorage persistence)
- 3-stage project status (active/pending/completed, auto-transitions)
- Role change cleanup (auto-remove from project arrays)

### v2.0
- Firebase Storage (files uploaded to Storage, URLs in Firestore, 99.98% smaller docs)
- Clickable invite links (web landing page, auto-join, ~3sec workflow)
- Multiple videos support (videos[], videoLocations[])

### v2.1
- Video compression (react-native-compressor, 720p, ~70% reduction)
- Image editor boundary fixes (15px margin, wild value detection)
- Enhanced PDF (thumbnails, GPS links, completion dates, card layout)
- Sync queue stuck fix (file validation, retry counter, abort flag)

### v2.2.0
- Custom loading screen (logo + version)
- Gallery picker (bottom sheet modal for camera/gallery)
- OTA updates (expo-updates, EAS Update)

---

## 6. MEDIA STORAGE (v2.0+)

### Firebase Storage
- Path: `teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{ext}`
- Photos: 70% compression, full resolution, JPEG
- Videos: 720p, 2.5Mbps, 4s max, MP4
- 10MB file size limit, auth required
- Migration script: `npm run migrate`

---

## 7. BUSINESS MODEL (Planned)

| Tier | Τιμή | Features |
|------|------|----------|
| Free | 0€ | 1 ομάδα, 3 μέλη, 5 projects |
| Starter | 9.99€/μήνα | 1 ομάδα, 10 μέλη, 20 projects |
| Business | 29.99€/μήνα | 3 ομάδες, 50 μέλη, unlimited projects |
| Enterprise | Custom | Unlimited, custom features |

---

## 8. ROADMAP

### Phase 1 - MVP (Complete ✅)
Authentication, Teams, Invites, Projects, Tasks, Photo/Video, Image Editor, Offline, PDF, Search/Filter, 3-stage Status, Role Cleanup, Firebase Storage, Web Landing Page, Video Compression, OTA Updates

### Phase 2 - Enhanced Features
- [ ] Push notifications
- [ ] Task comments & mentions
- [ ] Task deadlines & reminders
- [ ] File attachments (PDFs, docs)
- [ ] Calendar view

### Phase 3 - Advanced
- [ ] Analytics dashboard
- [ ] Time tracking
- [ ] Voice notes

### Phase 4 - Enterprise
- [ ] LDAP/SSO
- [ ] Custom workflows
- [ ] API integrations
- [ ] Multi-language support

---

## 9. PERFORMANCE TARGETS

- App launch: <2s
- Screen transition: <300ms
- Offline task save: <100ms
- Sync: <5s per project
- Image compression: <1s
- PDF generation: <3s for 20 tasks

---

**Version**: 2.2.0
**Last Updated**: Φεβρουάριος 2026
