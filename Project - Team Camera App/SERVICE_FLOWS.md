# ERGON WORK MANAGEMENT - SERVICE FLOWS

## ΠΕΡΙΕΧΟΜΕΝΑ
1. [Authentication Flow](#1-authentication-flow)
2. [Team Creation Flow](#2-team-creation-flow)
3. [Invite System Flow](#3-invite-system-flow)
4. [Join Team Flow](#4-join-team-flow)
5. [Project Management Flow](#5-project-management-flow)
6. [Task Management Flow](#6-task-management-flow)
7. [Photo Task Flow](#7-photo-task-flow)
8. [Video Task Flow](#8-video-task-flow)
9. [Image Editor Flow](#9-image-editor-flow)
10. [Task Edit & Delete Flow](#10-task-edit--delete-flow)
11. [Media Sharing Flow](#11-media-sharing-flow)
12. [Offline Sync Flow](#12-offline-sync-flow)
13. [Auto-Complete Project Flow](#13-auto-complete-project-flow)
14. [PDF Generation Flow](#14-pdf-generation-flow)
15. [User Role Management Flow](#15-user-role-management-flow)
16. [Project Search & Filter Flow](#16-project-search--filter-flow)
17. [3-Stage Project Status Flow](#17-3-stage-project-status-flow)
18. [Role Change Cleanup Flow](#18-role-change-cleanup-flow)

---

## 1. AUTHENTICATION FLOW

### 1.1 Αρχείο: `app/index.tsx` (Landing Screen)

```
ΒΗΜΑ 1: App Launch
├── SplashScreen.preventAutoHideAsync()
└── Εμφάνιση splash screen

ΒΗΜΑ 2: Deep Link Check
├── Linking.useURL() → url
├── ΑΝ url περιέχει inviteCode:
│   └── router.push(`/join?inviteCode=${code}`)
└── ΑΛΛΙΩΣ συνέχεια

ΒΗΜΑ 3: Auth State Check
├── onAuthStateChanged(auth, callback)
├── ΑΝ user υπάρχει:
│   └── router.replace("/dashboard")
├── ΑΛΛΙΩΣ:
│   └── setAppIsReady(true) → Εμφάνιση Landing
└── SplashScreen.hideAsync()

ΒΗΜΑ 4: User Action
└── Πάτημα "Σύνδεση/Εγγραφή" → router.push("/login")
```

### 1.2 Αρχείο: `app/login.tsx` (Login/Register Screen)

```
FLOW A: ΕΓΓΡΑΦΗ (isRegistering = true)
─────────────────────────────────────
ΒΗΜΑ 1: Input Validation
├── Έλεγχος email (not empty)
├── Έλεγχος password (not empty)
└── Έλεγχος fullname (not empty)

ΒΗΜΑ 2: Firebase Auth
├── createUserWithEmailAndPassword(auth, email, password)
└── Επιστροφή userCredential

ΒΗΜΑ 3: Update Profile
└── updateProfile(user, { displayName: fullname })

ΒΗΜΑ 4: Firestore User Document
├── Δημιουργία userData object:
│   ├── fullname
│   ├── email (lowercase)
│   ├── createdAt
│   ├── phone: ""
│   └── avatar: null
└── setDoc(doc(db, "users", user.uid), userData)

ΒΗΜΑ 5: Cache
└── AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(userData))

ΒΗΜΑ 6: Navigation
└── router.replace("/dashboard")


FLOW B: ΣΥΝΔΕΣΗ (isRegistering = false)
───────────────────────────────────────
ΒΗΜΑ 1: Input Validation
├── Έλεγχος email (not empty)
└── Έλεγχος password (not empty)

ΒΗΜΑ 2: Firebase Auth
├── signInWithEmailAndPassword(auth, email, password)
└── Επιστροφή userCredential

ΒΗΜΑ 3: Fetch & Cache User Data
├── getDoc(doc(db, "users", user.uid))
├── ΑΝ exists:
│   └── AsyncStorage.setItem(PROFILE_CACHE_KEY, data)
└── ΑΛΛΙΩΣ: console.log("Offline login")

ΒΗΜΑ 4: Navigation
└── router.replace("/dashboard")


ERROR HANDLING
──────────────
├── invalid-email → "Το email δεν είναι έγκυρο"
├── user-not-found → "Δεν βρέθηκε χρήστης"
├── wrong-password → "Λάθος κωδικός"
├── email-already-in-use → "Το email χρησιμοποιείται ήδη"
├── weak-password → "Κωδικός < 6 χαρακτήρες"
└── network-request-failed → "Πρόβλημα σύνδεσης"
```

---

## 2. TEAM CREATION FLOW

### Αρχείο: `app/onboarding/create-team.tsx`

```
ΒΗΜΑ 1: Network Check
├── NetInfo.fetch()
├── ΑΝ !isConnected:
│   └── Alert "Χρειάζεται internet"
└── ΑΛΛΙΩΣ συνέχεια

ΒΗΜΑ 2: Input Validation
├── teamName.trim().length === 0 → Alert
├── teamType.trim().length === 0 → Alert
├── teamEmail.trim().length === 0 → Alert
└── !teamEmail.includes("@") → Alert

ΒΗΜΑ 3: Auth Check
├── auth.currentUser
└── ΑΝ !user → Alert "Δεν βρέθηκε χρήστης"

ΒΗΜΑ 4: Create Team Document
├── addDoc(collection(db, "teams"), {
│   ├── name: teamName
│   ├── type: teamType
│   ├── contactEmail: teamEmail
│   ├── createdAt: serverTimestamp()
│   ├── memberIds: [user.uid]
│   ├── roles: { [user.uid]: "Founder" }
│   └── groups: []
│ })
└── Firestore auto-generates teamId

ΒΗΜΑ 5: Navigation
└── router.replace("/dashboard")
```

**Firestore Result:**
```javascript
teams/abc123
├── name: "Omega Constructions"
├── type: "Κατασκευαστική"
├── contactEmail: "omega@gmail.com"
├── createdAt: Timestamp
├── memberIds: ["user123"]
├── roles: { "user123": "Founder" }
└── groups: []
```

---

## 3. INVITE SYSTEM FLOW

### Αρχείο: `app/onboarding/invite.tsx`

```
ΒΗΜΑ 1: Fetch Current User Role
├── getDoc(doc(db, "teams", teamId))
├── Extract myRole = data.roles[user.uid]
└── Determine availableRoles:
    ├── Founder/Admin → ["Admin", "Supervisor", "User"]
    └── Supervisor → ["User"]

ΒΗΜΑ 2: Role Selection
└── User επιλέγει ρόλο για τον προσκεκλημένο

ΒΗΜΑ 3: Network Check
├── NetInfo.fetch()
└── ΑΝ !isConnected → Alert "Offline"

ΒΗΜΑ 4: Generate Invite Code
├── chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
├── shortCode = 6 random characters
└── (Αποκλεισμός 0, O, I, 1, L για clarity)

ΒΗΜΑ 5: Create Invite Document
└── addDoc(collection(db, "invites"), {
    ├── code: shortCode
    ├── teamId: teamId
    ├── teamName: teamName
    ├── role: selectedRole
    ├── createdBy: user.uid
    ├── createdAt: serverTimestamp()
    └── status: "active"
  })

ΒΗΜΑ 6: Generate Deep Link
├── scheme = isExpoGo ? "exp" : "ergonwork"
└── deepLink = Linking.createURL("join", {
    ├── scheme: scheme
    └── queryParams: { inviteCode: shortCode }
  })

ΒΗΜΑ 7: Share Message
├── Message includes:
│   ├── App download link
│   ├── Deep link
│   └── 6-digit code
└── Share.share({ message, title })
```

**Generated Deep Link Example:**
```
ergonwork://join?inviteCode=ABC123
```

**Share Message Example:**
```
👋 Πρόσκληση για την ομάδα "Omega Constructions"

1️⃣ Κατέβασε το App:
https://expo.dev/artifacts/...

2️⃣ Πάτα για είσοδο:
ergonwork://join?inviteCode=ABC123

🔑 Κωδικός: ABC123
(Λήγει σε 2 λεπτά)
```

---

## 4. JOIN TEAM FLOW

### Αρχείο: `app/join.tsx`

```
ΒΗΜΑ 1: Auth Check
├── onAuthStateChanged(auth, callback)
├── ΑΝ !user:
│   ├── Alert "Πρέπει να συνδεθείτε"
│   └── router.replace("/")
└── ΑΛΛΙΩΣ setCheckingAuth(false)

ΒΗΜΑ 2: Auto-fill from Deep Link
├── ΑΝ inviteCode ή paramCode:
│   └── setCode(inviteCode.toUpperCase())
└── ΑΛΛΙΩΣ manual input

ΒΗΜΑ 3: Network Check
├── NetInfo.fetch()
└── ΑΝ !isConnected → Alert "Offline"

ΒΗΜΑ 4: Validate Code
└── ΑΝ code.length < 6 → Alert "Έγκυρος κωδικός"

ΒΗΜΑ 5: Query Invite
├── q = query(collection(db, "invites"),
│     where("code", "==", code.toUpperCase()))
├── getDocs(q)
├── ΑΝ snapshot.empty:
│   └── Alert "Ο κωδικός δεν υπάρχει ή έχει λήξει"
└── ΑΛΛΙΩΣ inviteDoc = snapshot.docs[0]

ΒΗΜΑ 6: Expiration Check
├── createdAt = inviteData.createdAt.toDate()
├── diffInSeconds = (now - createdAt) / 1000
├── ΑΝ diffInSeconds > 120: (2 λεπτά)
│   ├── deleteDoc(inviteDoc.ref)
│   └── Alert "Ο κωδικός έχει λήξει"
└── ΑΛΛΙΩΣ συνέχεια

ΒΗΜΑ 7: Already Member Check
├── getDoc(doc(db, "teams", teamId))
├── ΑΝ memberIds.includes(userId):
│   ├── Alert "Είστε ήδη μέλος"
│   ├── deleteDoc(inviteDoc.ref)
│   └── router.replace("/dashboard")
└── ΑΛΛΙΩΣ συνέχεια

ΒΗΜΑ 8: Add User to Team
└── updateDoc(teamRef, {
    ├── memberIds: arrayUnion(userId)
    └── roles.${userId}: inviteData.role
  })

ΒΗΜΑ 9: Cleanup Invite
└── deleteDoc(inviteDoc.ref)

ΒΗΜΑ 10: Success
├── Alert "Καλωσήρθατε στην ομάδα X ως Y"
└── router.replace("/dashboard")
```

**State Diagram:**
```
[Start] → [Auth Check] → [Code Entry] → [Query Invite]
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
             [Not Found]              [Expired (>2min)]          [Valid]
                    │                         │                         │
                    ▼                         ▼                         │
               [Alert]                  [Delete Invite]                 │
                                         [Alert]                        │
                                                                        ▼
                                                               [Already Member?]
                                                                   │      │
                                                                  Yes    No
                                                                   │      │
                                                                   ▼      ▼
                                                              [Alert]  [Add to Team]
                                                                   │      │
                                                                   ▼      ▼
                                                               [Dashboard]
```

---

## 5. PROJECT MANAGEMENT FLOW

### Αρχείο: `app/team/[id].tsx`

### 5.1 Data Loading Flow
```
ΒΗΜΑ 1: Load Cache
├── AsyncStorage.getItem(CACHE_KEY)
├── ΑΝ cached:
│   ├── setTeamName(data.name)
│   ├── setTeamContact(data.contactEmail)
│   ├── setTeamLogo(data.logo)
│   ├── setGroups(data.groups)
│   ├── setMyRole(data.myRole)
│   └── setUsers(data.users)
└── setLoading(false)

ΒΗΜΑ 2: Setup Firestore Listener
├── onSnapshot(doc(db, "teams", teamId), callback)
├── On each snapshot:
│   ├── Extract team data
│   ├── Fetch user details for each memberIds
│   ├── Update state
│   └── Update cache
└── Return unsubscribe function

ΒΗΜΑ 3: Live Project Listener
├── query(collection(db, "projects"), where("teamId", "==", teamId))
├── onSnapshot(query, callback)
├── On each snapshot:
│   ├── Build freshProjectsMap
│   └── Update groups with fresh project data (members, supervisors, status)
└── Return unsubscribe function
```

### 5.2 Create Group Flow
```
ΒΗΜΑ 1: Online Check
└── checkOnline() → Alert αν offline

ΒΗΜΑ 2: Input
├── openInput("newGroup")
└── User εισάγει group title

ΒΗΜΑ 3: Create Group Object
└── newGroup = {
    ├── id: Date.now().toString()
    ├── title: tempValue
    └── projects: []
  }

ΒΗΜΑ 4: Update Firestore
└── updateDoc(teamRef, {
    groups: [...groups, newGroup]
  })
```

### 5.3 Create Project Flow
```
ΒΗΜΑ 1: Online Check
└── checkOnline() → Alert αν offline

ΒΗΜΑ 2: Input
├── openInput("newProject", groupId)
└── User εισάγει project title

ΒΗΜΑ 3: Generate Project ID
└── newProjectId = Date.now() + random(5)

ΒΗΜΑ 4: Determine Initial Supervisors
├── ΑΝ myRole === "Supervisor":
│   └── initialSupervisors = [currentUserId]
└── ΑΛΛΙΩΣ initialSupervisors = []

ΒΗΜΑ 5: Create Project Object
└── newProject = {
    ├── id: newProjectId
    ├── title: tempValue
    ├── status: "active"
    ├── supervisors: initialSupervisors
    ├── members: []
    ├── createdBy: currentUserId
    └── teamId: teamId
  }

ΒΗΜΑ 6: Update Team Groups
└── updateDoc(teamRef, { groups: updatedGroups })

ΒΗΜΑ 7: Create Project Document
└── setDoc(doc(db, "projects", newProjectId), {
    ...newProject,
    ├── tasks: []
    └── createdAt: serverTimestamp()
  })
```

### 5.4 Delete Project Flow
```
ΒΗΜΑ 1: Confirmation
└── Alert "Είστε σίγουροι;"

ΒΗΜΑ 2: Remove from Group Structure
└── updatedGroups = groups.map(g =>
    g.id === groupId
      ? {...g, projects: g.projects.filter(p => p.id !== project.id)}
      : g
  )

ΒΗΜΑ 3: Update Team
└── updateDoc(teamRef, { groups: updatedGroups })

ΒΗΜΑ 4: Delete Project Document
└── deleteDoc(doc(db, "projects", project.id))
```

### 5.5 Move Project Flow
```
ΒΗΜΑ 1: Select Target Group
└── User επιλέγει από modal

ΒΗΜΑ 2: Update Groups
└── updatedGroups = groups.map(g => {
    ├── ΑΝ g.id === oldGroupId:
    │   └── Remove project
    ├── ΑΝ g.id === targetGroupId:
    │   └── Add project
    └── ΑΛΛΙΩΣ return g
  })

ΒΗΜΑ 3: Update Firestore
└── updateDoc(teamRef, { groups: updatedGroups })
```

---

## 6. TASK MANAGEMENT FLOW

### Αρχείο: `app/project/[id].tsx`

### 6.1 Data Loading Flow
```
ΒΗΜΑ 1: Load Cache
├── AsyncStorage.getItem(CACHE_KEY)
├── Extract tasks, name, status
└── AsyncStorage.getItem(QUEUE_KEY) → localTasks

ΒΗΜΑ 2: Firestore Listener
├── onSnapshot(doc(db, "projects", projectId), callback)
├── On each snapshot:
│   ├── setCloudTasks(data.tasks)
│   ├── setProjectName(data.title)
│   ├── setProjectStatus(data.status)
│   └── Update cache
└── Return unsubscribe

ΒΗΜΑ 3: Merge Lists
└── combinedTasks = useMemo(() => {
    ├── map = new Map()
    ├── cloudTasks.forEach(t => map.set(t.id, t))
    ├── localTasks.forEach(t => map.set(t.id, t))
    └── return Array.from(map.values())
  })
```

### 6.2 Create Task Flow
```
ΒΗΜΑ 1: Open Modal
└── setCreateModalVisible(true)

ΒΗΜΑ 2: Input
├── Title (required)
├── Description (optional)
└── Type selection: "photo" | "video" | "measurement" | "general"

ΒΗΜΑ 3: Create Task Object
└── newItem = {
    ├── id: Date.now().toString()
    ├── title: newTaskTitle
    ├── description: newTaskDescription
    ├── type: newTaskType
    ├── status: "pending"
    ├── value: null
    ├── images: []
    ├── imageLocations: []                 // NEW: GPS array
    └── isLocal: true
  }

ΒΗΜΑ 4: Save Locally
└── saveTaskLocal(newItem)
    ├── Add to localTasks
    ├── AsyncStorage.setItem(QUEUE_KEY, localTasks)
    └── Trigger sync if WiFi
```

### 6.3 Complete Measurement/General Task Flow
```
ΒΗΜΑ 1: Open Input Modal
├── setCurrentTaskId(task.id)
├── setCurrentTaskType(task.type)
├── setInputValue(task.value || "")
└── setInputModalVisible(true)

ΒΗΜΑ 2: User Input
└── User εισάγει value

ΒΗΜΑ 3: Save
└── saveTaskLocal({
    ...task,
    ├── value: inputValue
    └── status: "completed"
  })
```

### 6.4 Auto-Complete Project Flow
```
ΒΗΜΑ 1: Watch combinedTasks
└── useEffect(() => {...}, [combinedTasks])

ΒΗΜΑ 2: Check All Done
├── allDone = combinedTasks.every(t => t.status === "completed")
└── newStatus = allDone ? "completed" : "active"

ΒΗΜΑ 3: Update if Changed
├── ΑΝ newStatus !== projectStatus:
│   ├── setProjectStatus(newStatus)
│   ├── updateDoc(projectRef, { status: newStatus })
│   └── Update cache
└── ΑΛΛΙΩΣ no action
```

---

## 7. PHOTO TASK FLOW

### 7.1 Launch Camera Flow (v2.0 - Firebase Storage)
```
ΒΗΜΑ 1: Request Permission & Capture
└── ImagePicker.launchCameraAsync({
    ├── quality: 0.8
    └── mediaTypes: Images
  })

ΒΗΜΑ 2: Check Result
├── ΑΝ canceled → return
└── ΑΛΛΙΩΣ uri = result.assets[0].uri

ΒΗΜΑ 3: Get GPS Location
├── requestForegroundPermissionsAsync()
├── getCurrentPositionAsync({
│     accuracy: Accuracy.Balanced
│   })
├── location = { lat: coords.latitude, lng: coords.longitude }
└── ΑΝ error → location = { lat: 0, lng: 0 }

ΒΗΜΑ 4: Open Image Editor
├── setTaskForEditing(task)
├── setTempImageUri(uri)
├── setTempGpsLoc(location)
└── setEditorVisible(true)

ΒΗΜΑ 5: User Edits → Save Button

ΒΗΜΑ 6: Compress Image (v2.0)
└── ImageManipulator.manipulateAsync(editedUri,
    [], // NO RESIZE - Full camera resolution
    {
      ├── compress: 0.7    // 70% quality
      └── format: JPEG
    }
  )

ΒΗΜΑ 7: Upload to Firebase Storage (v2.0)
├── Validate teamId exists
├── generateMediaId() → unique ID
└── uploadImageToStorage(
    ├── imageUri: m.uri
    ├── teamId: project.teamId
    ├── projectId: projectId
    ├── taskId: task.id
    └── mediaId: mediaId
  ) → storageUrl

ΒΗΜΑ 8: Add Storage URL to Task
└── saveTaskLocal({
    ...task,
    ├── images: [...task.images, storageUrl]  // Storage URL, not base64!
    ├── imageLocations: [...task.imageLocations, location]
    └── status: "completed"
  })

ΒΗΜΑ 9: Sync to Cloud (if online)
└── SyncContext.syncNow() → Upload to Firestore
```

### 7.2 Gallery View Flow
```
ΒΗΜΑ 1: Open Gallery
├── setActiveTaskForGallery(task)
└── setGalleryModalVisible(true)

ΒΗΜΑ 2: Display Grid
└── FlatList με numColumns={3}
    ├── Existing images (clickable)
    └── "ADD" tile for camera

ΒΗΜΑ 3: Image Click
└── setSelectedImageForView(image)

ΒΗΜΑ 4: Full View Actions
├── Share → Sharing.shareAsync(uri)
└── Delete → removeImageFromTask(uri)
```

### 7.3 Delete Image Flow
```
ΒΗΜΑ 1: Confirmation
└── Alert "Διαγραφή φωτογραφίας;"

ΒΗΜΑ 2: Remove from Array
└── imgs = task.images.filter(i => i !== uri)

ΒΗΜΑ 3: Update Status
├── ΑΝ imgs.length > 0 → status = "completed"
└── ΑΛΛΙΩΣ status = "pending"

ΒΗΜΑ 4: Save
└── saveTaskLocal({
    ...task,
    ├── images: imgs
    └── status: status
  })
```

---

## 8. VIDEO TASK FLOW

### Αρχείο: `app/project/[id].tsx`

### 8.1 Launch Video Capture Flow (v2.0 - Firebase Storage)
```
ΒΗΜΑ 1: Request Permission & Capture
└── ImagePicker.launchCameraAsync({
    ├── mediaTypes: ImagePicker.MediaTypeOptions.Videos
    ├── videoQuality: UIImagePickerControllerQualityType.High  // 1080p
    └── videoMaxDuration: 4         // 4 seconds max
  })

ΒΗΜΑ 2: Check Result
├── ΑΝ canceled → return
└── ΑΛΛΙΩΣ videoUri = result.assets[0].uri

ΒΗΜΑ 3: Get GPS Location
├── getCurrentPositionAsync()
└── location = { lat, lng } (ή {0,0} αν error)

ΒΗΜΑ 4: Validate TeamId
├── ΑΝ !teamId:
│   └── Alert "Δεν βρέθηκε η ομάδα του project"
└── ΑΛΛΙΩΣ συνέχεια

ΒΗΜΑ 5: Upload to Firebase Storage (v2.0)
├── generateMediaId() → unique ID
└── uploadVideoToStorage(
    ├── videoUri: videoUri
    ├── teamId: project.teamId
    ├── projectId: projectId
    ├── taskId: task.id
    └── mediaId: mediaId
  ) → storageUrl

ΒΗΜΑ 6: Add Storage URL to Task
└── saveTaskLocal({
    ...task,
    ├── value: base64Video
    └── status: "completed"
  })
```

### 8.2 Video Playback Flow
```
ΒΗΜΑ 1: Gallery Open
└── User πατάει task με video

ΒΗΜΑ 2: Display Video Player
└── <Video
    ├── source={{ uri: task.value }}
    ├── useNativeControls
    ├── resizeMode: "contain"
    ├── style={{ width, height }}
    └── shouldPlay={false}
  />

ΒΗΜΑ 3: Controls
├── Play/Pause
├── Seek bar
└── Fullscreen
```

---

## 9. IMAGE EDITOR FLOW

### Αρχείο: `app/components/ImageEditorModal.tsx`

### 9.1 Open Image Editor Flow
```
ΒΗΜΑ 1: Launch from Task
├── User επιλέγει εικόνα από gallery
├── setImageToEdit(imageUri)
└── setEditorVisible(true)

ΒΗΜΑ 2: Initialize State
├── scale = useRef(new Animated.Value(1))
├── translateX = useRef(new Animated.Value(0))
├── translateY = useRef(new Animated.Value(0))
├── paths = []
├── currentColor = "#ef4444" (κόκκινο)
└── strokeWidth = 3
```

### 9.2 Drawing Flow
```
ΒΗΜΑ 1: Select Pen Tool
└── setMode("draw")

ΒΗΜΑ 2: Choose Color & Stroke
├── User επιλέγει χρώμα (red, yellow, green, blue, white, black)
└── User επιλέγει πάχος (3px, 6px, 10px)

ΒΗΜΑ 3: Draw on Canvas
├── PanResponder tracks touch gestures
├── On Move:
│   ├── path += `L${x},${y} `
│   └── Update SVG path
└── On Release:
    ├── Complete path
    └── Add to paths array

ΒΗΜΑ 4: Undo
├── User πατάει Undo
└── paths.pop() → Remove last stroke
```

### 9.3 Pan/Zoom Flow
```
ΒΗΜΑ 1: Select Move Tool
└── setMode("move")

ΒΗΜΑ 2: Pan Gesture
├── PanResponder tracks drag
├── dx = gestureState.dx / PAN_DAMPING (1.5)
├── dy = gestureState.dy / PAN_DAMPING
├── translateX.setValue(dx)
└── translateY.setValue(dy)

ΒΗΜΑ 3: Zoom Controls
├── Zoom In:
│   ├── newScale = Math.min(scale + 0.5, 3)
│   └── Animated.timing(scale, { toValue: newScale })
└── Zoom Out:
    ├── newScale = Math.max(scale - 0.5, 1)
    └── Animated.timing(scale, { toValue: newScale })
```

### 9.4 Save Edited Image Flow
```
ΒΗΜΑ 1: User πατάει "Αποθήκευση"
└── setCapturing(true)

ΒΗΜΑ 2: Capture Canvas
├── captureRef.current.capture()
└── Returns new URI

ΒΗΜΑ 3: Convert to Base64
├── base64 = await FileSystem.readAsStringAsync(uri, {
│     encoding: Base64
│   })
└── base64Img = `data:image/jpeg;base64,${base64}`

ΒΗΜΑ 4: Replace Original
├── onSave(base64Img)
├── Close modal
└── Update task με new image
```

---

## 10. TASK EDIT & DELETE FLOW

### Αρχείο: `app/project/[id].tsx`

### 10.1 Edit Task Flow
```
ΒΗΜΑ 1: Long Press Task
├── ΑΝ Platform.OS !== "web":
│   └── Show action sheet (Edit / Delete)
└── ΑΛΛΙΩΣ show buttons

ΒΗΜΑ 2: Select Edit
├── setEditingTaskId(task.id)
├── setNewTaskTitle(task.title)
├── setNewTaskDescription(task.description || "")
├── setNewTaskType(task.type)
└── setCreateModalVisible(true)

ΒΗΜΑ 3: Modify Fields
├── User αλλάζει title
├── User αλλάζει description
└── User αλλάζει type (photo/video/measurement/general)

ΒΗΜΑ 4: Save Changes
└── saveTaskLocal({
    ...task,
    ├── title: newTaskTitle
    ├── description: newTaskDescription
    └── type: newTaskType
  })

ΒΗΜΑ 5: Close Modal
└── setCreateModalVisible(false)
```

### 10.2 Delete Task Flow
```
ΒΗΜΑ 1: Long Press Task
└── User επιλέγει "Διαγραφή"

ΒΗΜΑ 2: Confirmation
└── Alert "Οριστική διαγραφή του task;"

ΒΗΜΑ 3: Remove from Local
├── newLocal = localTasks.filter(t => t.id !== task.id)
└── AsyncStorage.setItem(QUEUE_KEY, newLocal)

ΒΗΜΑ 4: Remove from Cloud
├── cloudList = cloudTasks.filter(t => t.id !== task.id)
└── updateDoc(projectRef, { tasks: cloudList })

ΒΗΜΑ 5: UI Update
└── Task εξαφανίζεται από λίστα
```

---

## 11. MEDIA SHARING FLOW

### Αρχείο: `app/project/[id].tsx`

### 11.1 Share Image Flow
```
ΒΗΜΑ 1: Open Image Viewer
└── User πατάει εικόνα από gallery

ΒΗΜΑ 2: Press Share Button
└── handleShareImage()

ΒΗΜΑ 3: Convert Base64 to File
├── ΑΝ imgUri.startsWith("data:image"):
│   ├── base64 = imgUri.split(",")[1]
│   ├── fileUri = FileSystem.cacheDirectory + "share.jpg"
│   └── FileSystem.writeAsStringAsync(fileUri, base64, {
│       encoding: Base64
│     })
└── ΑΛΛΙΩΣ fileUri = imgUri

ΒΗΜΑ 4: Native Share
└── Sharing.shareAsync(fileUri, {
    ├── UTI: ".jpg"
    └── mimeType: "image/jpeg"
  })
```

### 11.2 Share Video Flow
```
ΒΗΜΑ 1: Open Video Viewer
└── User βλέπει video σε gallery

ΒΗΜΑ 2: Convert Base64 to File
├── base64 = videoUri.split(",")[1]
├── fileUri = FileSystem.cacheDirectory + "share.mp4"
└── FileSystem.writeAsStringAsync(fileUri, base64, { Base64 })

ΒΗΜΑ 3: Native Share
└── Sharing.shareAsync(fileUri, {
    ├── UTI: ".mp4"
    └── mimeType: "video/mp4"
  })
```

### 11.3 Delete Media Flow
```
ΒΗΜΑ 1: User πατάει Delete
└── Alert "Διαγραφή φωτογραφίας;"

ΒΗΜΑ 2: Remove from Arrays
├── images = task.images.filter((_, i) => i !== index)
├── locations = task.imageLocations?.filter((_, i) => i !== index)
└── newStatus = images.length > 0 ? "completed" : "pending"

ΒΗΜΑ 3: Update Task
└── saveTaskLocal({
    ...task,
    ├── images
    ├── imageLocations: locations
    └── status: newStatus
  })

ΒΗΜΑ 4: Close Viewer
└── setSelectedImageForView(null)
```

---

## 12. OFFLINE SYNC FLOW

### Αρχείο: `app/context/SyncContext.tsx`

### 12.1 Network Listener Flow
```
ΒΗΜΑ 1: Setup Listener
└── NetInfo.addEventListener(state => {...})

ΒΗΜΑ 2: On State Change
├── ΑΝ state.isConnected && state.type === "wifi":
│   └── setTimeout(() => performGlobalSync(), 1000)
└── ΑΛΛΙΩΣ no action

ΒΗΜΑ 3: Cleanup
└── unsubscribe on unmount
```

### 12.2 Manual Sync με Cellular Confirmation Flow
```
ΒΗΜΑ 1: User πατάει Sync Button
└── syncNow() called

ΒΗΜΑ 2: Network Check
├── netState = await NetInfo.fetch()
├── ΑΝ !netState.isConnected:
│   └── Alert "Δεν υπάρχει σύνδεση"
└── ΑΛΛΙΩΣ συνέχεια

ΒΗΜΑ 3: Cellular Data Confirmation
├── ΑΝ netState.type === "cellular":
│   ├── Alert "Είστε συνδεδεμένοι με δεδομένα κινητής.
│   │        Θέλετε να προχωρήσετε σε συγχρονισμό;"
│   ├── Buttons: ["Άκυρο", "Συγχρονισμός"]
│   └── ΑΝ user πατάει Άκυρο → return
└── ΑΛΛΙΩΣ (WiFi) → Συνέχεια

ΒΗΜΑ 4: Perform Sync
└── performGlobalSync()
```

### 12.3 Global Sync Process
```
ΒΗΜΑ 1: Lock Check
├── ΑΝ isSyncingRef.current → return
└── ΑΛΛΙΩΣ setSyncState(true)

ΒΗΜΑ 2: Find Queue Keys
├── keys = await AsyncStorage.getAllKeys()
└── queueKeys = keys.filter(k => k.startsWith(OFFLINE_QUEUE_PREFIX))

ΒΗΜΑ 3: Process Each Project
FOR each queueKey:
├── projectId = key.replace(prefix, "")
├── localList = JSON.parse(await AsyncStorage.getItem(key))
│
├── ΑΝ localList.length === 0:
│   ├── AsyncStorage.removeItem(key)
│   └── continue
│
├── Fetch current cloud state
│   └── projectSnap = await getDoc(projectRef)
│
├── ΑΝ !projectSnap.exists():
│   ├── AsyncStorage.removeItem(key)
│   └── continue
│
└── Merge local into cloud (v2.0 - Firebase Storage)
    │
    ├── Get teamId από project document
    │   ΑΝ !teamId → Skip project
    │
    FOR each task in localList:
    │
    ├── Process Images (v2.0)
    │   FOR each imgUri:
    │   ├── ΑΝ imgUri.startsWith("file://"):
    │   │   ├── Generate mediaId
    │   │   ├── uploadImageToStorage(...) → storageUrl
    │   │   └── processedImages.push(storageUrl)
    │   │
    │   ├── ΑΛΛΙΩΣ ΑΝ imgUri.startsWith("data:image"):
    │   │   ├── uploadBase64ToStorage(...) → storageUrl  // Migration
    │   │   └── processedImages.push(storageUrl)
    │   │
    │   └── ΑΛΛΙΩΣ ΑΝ imgUri.startsWith("https://firebasestorage"):
    │       └── processedImages.push(imgUri)  // Already migrated
    │
    ├── Process Value (v2.0)
    │   ΑΝ value.startsWith("file://"):
    │   ├── ΑΝ type === "photo":
    │   │   └── uploadImageToStorage(...) → storageUrl
    │   ├── ΑΝ type === "video":
    │   │   └── uploadVideoToStorage(...) → storageUrl
    │   │
    │   ΑΛΛΙΩΣ ΑΝ value.startsWith("data:image") ή "data:video":
    │   └── uploadBase64ToStorage(...) → storageUrl  // Migration
    │
    ├── Clean task (remove isLocal flag)
    │
    └── Merge into currentCloudList
        ├── ΑΝ exists → replace
        └── ΑΛΛΙΩΣ push

ΒΗΜΑ 4: Upload to Firestore
├── safeList = JSON.parse(JSON.stringify(list, null handler))
└── await updateDoc(projectRef, { tasks: safeList })

ΒΗΜΑ 5: UI Update
├── setJustSyncedProjectId(projectId)
└── setTimeout(() => setJustSyncedProjectId(null), 2000)

ΒΗΜΑ 6: Cleanup
├── await AsyncStorage.removeItem(key)
└── setSyncState(false)
```

### 12.4 Local Task Cleanup Flow
```
ΒΗΜΑ 1: Watch cloudTasks & localTasks
└── useEffect(() => {...}, [cloudTasks, localTasks])

ΒΗΜΑ 2: Build Cloud Map
└── cloudMap = new Map(cloudTasks.map(t => [t.id, t]))

ΒΗΜΑ 3: Filter Remaining Local
└── remainingLocal = localTasks.filter(localT => {
    ├── cloudT = cloudMap.get(localT.id)
    ├── ΑΝ !cloudT → keep (not synced yet)
    ├── ΑΝ localT.value !== cloudT.value → keep
    ├── ΑΝ localT.status !== cloudT.status → keep
    ├── ΑΝ localT.images.length !== cloudT.images.length → keep
    └── ΑΛΛΙΩΣ remove (fully synced)
  })

ΒΗΜΑ 4: Update if Changed
├── ΑΝ remainingLocal.length !== localTasks.length:
│   ├── setLocalTasks(remainingLocal)
│   └── AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remainingLocal))
└── ΑΛΛΙΩΣ no action
```

---

## 13. AUTO-COMPLETE PROJECT FLOW

### Αρχείο: `app/project/[id].tsx`

### 13.1 Automatic Status Update Flow
```
ΒΗΜΑ 1: Watch Combined Tasks
└── useEffect(() => {...}, [combinedTasks])

ΒΗΜΑ 2: Check All Tasks Status
├── allDone = combinedTasks.every(t => t.status === "completed")
├── ΑΝ allDone && combinedTasks.length > 0:
│   └── newStatus = "completed"
└── ΑΛΛΙΩΣ newStatus = "active"

ΒΗΜΑ 3: Compare with Current Status
├── ΑΝ newStatus !== projectStatus:
│   └── Συνέχεια
└── ΑΛΛΙΩΣ no action (skip update)

ΒΗΜΑ 4: Optimistic UI Update
└── setProjectStatus(newStatus)

ΒΗΜΑ 5: Firestore Update
└── updateDoc(doc(db, "projects", projectId), {
    status: newStatus
  })

ΒΗΜΑ 6: Cache Update
└── AsyncStorage.setItem(CACHE_KEY, {
    ...cachedData,
    status: newStatus
  })
```

### 13.2 Status Change Scenarios
```
SCENARIO A: All Tasks Completed
───────────────────────────────────
ΠΡΙΝ: projectStatus = "active"
      tasks = [
        { status: "pending" },
        { status: "completed" }
      ]

USER ACTION: Ολοκληρώνει το pending task

ΜΕΤΑ: projectStatus = "completed" (auto-update)
      tasks = [
        { status: "completed" },
        { status: "completed" }
      ]


SCENARIO B: Task Becomes Pending Again
───────────────────────────────────────
ΠΡΙΝ: projectStatus = "completed"
      tasks = [
        { status: "completed" },
        { status: "completed" }
      ]

USER ACTION: Διαγράφει φωτογραφία από task

ΜΕΤΑ: projectStatus = "active" (auto-revert)
      tasks = [
        { status: "pending" },
        { status: "completed" }
      ]
```

---

## 14. PDF GENERATION FLOW

### Αρχείο: `app/project/[id].tsx` → `generatePDF()`

```
ΒΗΜΑ 1: Set Processing State
└── setProcessing(true)

ΒΗΜΑ 2: Calculate Summary Stats
├── totalTasks = combinedTasks.length
├── completedCount = combinedTasks.filter(t => t.status === "completed").length
├── progressPercent = (completedCount / totalTasks) * 100
└── projectIcon = projectStatus === "completed" ? "✅" : "📋"

ΒΗΜΑ 3: Build Summary Cards HTML
└── summaryHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="card-number">{totalTasks}</div>
        <div>Συνολικές Αναθέσεις</div>
      </div>
      <div class="summary-card">
        <div class="card-number">{completedCount}</div>
        <div>Ολοκληρωμένες</div>
      </div>
      <div class="summary-card status-{projectStatus}">
        {projectIcon} {statusText}
      </div>
    </div>`

ΒΗΜΑ 4: Build Tasks Table HTML με Icons
└── FOR each task in combinedTasks:
    ├── taskIcon = {
    │   photo: "📷",
    │   video: "🎥",
    │   measurement: "📏",
    │   general: "📝"
    │ }[task.type]
    ├── statusBadge = completed
    │   ? `<span class="badge-completed">Ολοκληρώθηκε</span>`
    │   : `<span class="badge-pending">Εκκρεμεί</span>`
    ├── mediaInfo = task.images?.length
    │   ? `📷 ${task.images.length} Φωτογραφίες`
    │   : (task.value?.includes("video") ? "🎥 Βίντεο" : "-")
    ├── description = task.description || "-"
    └── rowsHTML += `
        <tr>
          <td>{taskIcon} {task.title}</td>
          <td class="desc">{description}</td>
          <td>{statusBadge}</td>
          <td>{mediaInfo}</td>
        </tr>`

ΒΗΜΑ 5: Build Gallery Section HTML
└── FOR each task with images OR video:
    ├── ΑΝ task.images?.length > 0:
    │   └── mediaHTML += `
    │       <div class="media-box">
    │         <h3>📷 {task.title}</h3>
    │         <div class="photo-grid">
    │           {images.map(img =>
    │             `<img src="${img}" />`
    │           )}
    │         </div>
    │       </div>`
    └── ΑΝ task.value?.includes("video"):
        └── mediaHTML += `
            <div class="media-box">
              <h3>🎥 {task.title}</h3>
              <div class="video-icon">▶️ Βίντεο Καταγράφηκε</div>
            </div>`

ΒΗΜΑ 6: Compose Full HTML με Professional Styling
└── htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

          body {
            font-family: 'Inter', sans-serif;
            padding: 40px;
            background: #f8f9fa;
          }

          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 12px;
            margin-bottom: 30px;
          }

          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 30px;
          }

          .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }

          .card-number {
            font-size: 32px;
            font-weight: 700;
            color: #667eea;
          }

          .badge-completed {
            background: #dcfce7;
            color: #166534;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }

          .badge-pending {
            background: #f1f5f9;
            color: #475569;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }

          table {
            width: 100%;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 30px;
          }

          .media-box {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }

          .photo-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }

          .photo-grid img {
            width: 100%;
            border-radius: 4px;
          }

          .footer {
            margin-top: 40px;
            text-align: center;
            color: #64748b;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>{projectIcon} {projectName}</h1>
          <p>Ημερομηνία: {date}</p>
          <p>Project ID: {projectId.slice(0,6)}</p>
        </div>

        {summaryHTML}

        <table>
          <thead>
            <tr>
              <th>Ανάθεση</th>
              <th>Περιγραφή</th>
              <th>Κατάσταση</th>
              <th>Media</th>
            </tr>
          </thead>
          <tbody>
            {rowsHTML}
          </tbody>
        </table>

        {mediaHTML}

        <div class="footer">
          Ergon Work Management App<br/>
          Generated at {timestamp}
        </div>
      </body>
    </html>`

ΒΗΜΑ 7: Generate PDF
└── { uri } = await Print.printToFileAsync({
    html: htmlContent,
    base64: false
  })

ΒΗΜΑ 8: Share
└── await Sharing.shareAsync(uri, {
    ├── UTI: ".pdf"
    └── mimeType: "application/pdf"
  })

ΒΗΜΑ 9: Cleanup
└── setProcessing(false)
```

---

## 15. USER ROLE MANAGEMENT FLOW

### Αρχείο: `app/team/[id].tsx` → `changeUserRole()`

### 15.1 Promote Flow
```
ΒΗΜΑ 1: Permission Check
├── ΑΝ myRole === "Supervisor" && targetUser.role !== "User":
│   └── Alert "Απαγορεύεται"
└── ΑΝ targetUser.role === "Founder":
    └── Alert "Δεν πειράζουμε τον Ιδρυτή"

ΒΗΜΑ 2: Determine New Role
├── User → Supervisor
└── Supervisor → Admin

ΒΗΜΑ 3: Optimistic UI Update
└── setUsers(prev => prev.map(u =>
    u.id === targetUser.id ? {...u, role: newRole} : u
  ))

ΒΗΜΑ 4: Firestore Update
└── updateDoc(teamRef, {
    [`roles.${targetUser.id}`]: newRole
  })
```

### 15.2 Demote Flow
```
ΒΗΜΑ 1: Permission Check
└── (Same as Promote)

ΒΗΜΑ 2: Determine New Role
├── Admin → Supervisor
└── Supervisor → User

ΒΗΜΑ 3-4: (Same as Promote)
```

### 15.3 Kick Flow
```
ΒΗΜΑ 1: Permission Check
├── ΑΝ myRole === "Supervisor" && targetUser.role !== "User":
│   └── Alert "Απαγορεύεται"
└── ΑΝ targetUser.role === "Founder":
    └── Alert "Δεν πειράζουμε τον Ιδρυτή"

ΒΗΜΑ 2: Confirmation
└── Alert "Αφαίρεση {name}?"

ΒΗΜΑ 3: Optimistic UI Update
└── setUsers(prev => prev.filter(u => u.id !== targetUser.id))

ΒΗΜΑ 4: Remove from Team
└── updateDoc(teamRef, {
    ├── memberIds: arrayRemove(targetUser.id)
    └── [`roles.${targetUser.id}`]: deleteField()
  })

ΒΗΜΑ 5: Remove from All Projects
├── query(collection(db, "projects"), where("teamId", "==", teamId))
├── getDocs(query)
└── FOR each project:
    └── updateDoc(projectRef, {
        ├── supervisors: arrayRemove(targetUser.id)
        └── members: arrayRemove(targetUser.id)
      })
```

---

## 16. PROJECT SEARCH & FILTER FLOW

### Αρχείο: `app/team/[id].tsx`

### 16.1 Filter Persistence Flow
```
ΒΗΜΑ 1: Load Saved Filters on Mount
├── FILTER_CACHE_KEY = `team_filters_${teamId}`
├── AsyncStorage.getItem(FILTER_CACHE_KEY)
├── ΑΝ cached:
│   ├── setSearchQuery(saved.search)
│   └── setStatusFilter(saved.status)
└── ΑΛΛΙΩΣ default values (searchQuery: "", statusFilter: "all")

ΒΗΜΑ 2: Auto-Save on Filter Change
└── useEffect(() => {
    AsyncStorage.setItem(FILTER_CACHE_KEY, JSON.stringify({
      search: searchQuery,
      status: statusFilter
    }))
  }, [searchQuery, statusFilter, teamId])
```

### 16.2 Search Flow
```
ΒΗΜΑ 1: User Types in Search Bar
├── TextInput.onChangeText(text)
└── setSearchQuery(text)

ΒΗΜΑ 2: Apply Filter
└── visibleGroups = groups.map(g => {
    projects: g.projects.filter(p =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })

ΒΗΜΑ 3: Clear Search
├── User πατάει X icon
└── setSearchQuery("")
```

### 16.3 Status Filter Flow (Bottom Sheet Modal)
```
ΒΗΜΑ 1: Open Filter Modal
├── User πατάει filter icon button
└── setFilterModalVisible(true)

ΒΗΜΑ 2: Display Options με Radio Buttons
├── "Όλα" (all)
├── "Ενεργά" (active) με ACTIVE badge
├── "Εκκρεμή" (pending) με PENDING badge
└── "Ολοκληρωμένα" (completed) με DONE badge

ΒΗΜΑ 3: User Selection
├── User επιλέγει status
├── setStatusFilter(selectedStatus)
└── setFilterModalVisible(false)

ΒΗΜΑ 4: Apply Status Filter
└── visibleGroups = groups.map(g => {
    projects: roleFilteredProjects.filter(p =>
      statusFilter === "all" || p.status === statusFilter
    )
  })

ΒΗΜΑ 5: Visual Indicator
├── ΑΝ statusFilter !== "all":
│   ├── Filter button → blue background
│   └── Show badge dot (blue)
└── ΑΛΛΙΩΣ default gray styling
```

### 16.4 Combined Filter Logic
```
FLOW: Search + Status Filter (3-stage pipeline)

ΒΗΜΑ 1: Role-based Filter
├── ΑΝ myRole === "User":
│   └── projects = g.projects.filter(p =>
│       p.members.includes(userId) || p.supervisors.includes(userId)
│     )
└── ΑΛΛΙΩΣ show all projects

ΒΗΜΑ 2: Status Filter
├── ΑΝ statusFilter !== "all":
│   └── projects = roleFilteredProjects.filter(p =>
│       p.status === statusFilter
│     )
└── ΑΛΛΙΩΣ keep all

ΒΗΜΑ 3: Search Filter
├── ΑΝ searchQuery.trim():
│   └── projects = statusFilteredProjects.filter(p =>
│       p.title.toLowerCase().includes(searchQuery.toLowerCase())
│     )
└── ΑΛΛΙΩΣ keep all

ΒΗΜΑ 4: Hide Empty Groups (User role only)
└── ΑΝ myRole === "User":
    └── groups = groups.filter(g => g.projects.length > 0)
```

---

## 17. 3-STAGE PROJECT STATUS FLOW

### Αρχείο: `app/project/[id].tsx`

### 17.1 Automatic Status Transition Flow
```
PROJECT STATUS STATES:
├── "active" (default) - Καμία ανάθεση ολοκληρωμένη
├── "pending" - Κάποιες αναθέσεις ολοκληρωμένες (αλλά όχι όλες)
└── "completed" - Όλες οι αναθέσεις ολοκληρωμένες

ΒΗΜΑ 1: Watch Combined Tasks
└── useEffect(() => {...}, [combinedTasks])

ΒΗΜΑ 2: Calculate Completion Stats
├── completedCount = combinedTasks.filter(t => t.status === "completed").length
├── totalCount = combinedTasks.length
└── ΑΝ totalCount === 0 → status = "active"

ΒΗΜΑ 3: Determine New Status
├── ΑΝ completedCount === totalCount:
│   └── newStatus = "completed" (100%)
├── ΑΝ completedCount > 0:
│   └── newStatus = "pending" (partial completion)
└── ΑΛΛΙΩΣ:
    └── newStatus = "active" (0%)

ΒΗΜΑ 4: Check if Changed
├── ΑΝ newStatus !== projectStatus:
│   └── Συνέχεια
└── ΑΛΛΙΩΣ skip update (no change)

ΒΗΜΑ 5: Optimistic UI Update
└── setProjectStatus(newStatus)

ΒΗΜΑ 6: Firestore Update
└── updateDoc(projectRef, { status: newStatus })

ΒΗΜΑ 7: Cache Update
└── AsyncStorage.setItem(CACHE_KEY, {
    ...cached,
    status: newStatus
  })
```

### 17.2 Status Transition Scenarios
```
SCENARIO A: Active → Pending
────────────────────────────
Initial: 5 tasks, 0 completed → status = "active"
Action:  User completes 1 task
Result:  5 tasks, 1 completed → status = "pending"

SCENARIO B: Pending → Completed
────────────────────────────────
Initial: 5 tasks, 4 completed → status = "pending"
Action:  User completes last task
Result:  5 tasks, 5 completed → status = "completed"

SCENARIO C: Completed → Pending (Revert)
─────────────────────────────────────────
Initial: 3 tasks, 3 completed → status = "completed"
Action:  User deletes photo from task (task becomes pending)
Result:  3 tasks, 2 completed → status = "pending"

SCENARIO D: Pending → Active (Full Revert)
───────────────────────────────────────────
Initial: 2 tasks, 1 completed → status = "pending"
Action:  User deletes completed task OR marks it pending
Result:  2 tasks, 0 completed → status = "active"
```

### 17.3 Status Badge Visual Indicators
```
UI COMPONENTS:

Active Status Badge:
├── Background: #dbeafe (light blue)
├── Text: "ACTIVE"
├── Color: #2563eb (blue)
└── Icon: 📋

Pending Status Badge:
├── Background: #fef3c7 (light yellow)
├── Text: "PENDING"
├── Color: #d97706 (orange)
└── Icon: ⏳

Completed Status Badge:
├── Background: #dcfce7 (light green)
├── Text: "DONE"
├── Color: #16a34a (green)
└── Icon: ✅
```

---

## 18. ROLE CHANGE CLEANUP FLOW

### Αρχείο: `app/team/[id].tsx` → `changeUserRole()`

### 18.1 Role Change με Project Cleanup
```
ΒΗΜΑ 1: Determine New Role
├── Promote:
│   ├── User → Supervisor
│   └── Supervisor → Admin
└── Demote:
    ├── Admin → Supervisor
    └── Supervisor → User

ΒΗΜΑ 2: Update Team Document
└── updateDoc(teamRef, {
    [`roles.${targetUser.id}`]: newRole
  })

ΒΗΜΑ 3: Cleanup από Projects (IMPORTANT!)
├── Query all team projects:
│   └── query(collection(db, "projects"), where("teamId", "==", teamId))
│
└── FOR each project:
    │
    ├── CASE 1: User → Supervisor
    │   └── updateDoc(projectRef, {
    │       members: arrayRemove(targetUser.id)
    │     })
    │       └── ΔΕΝ προσθέτει στο supervisors[] (manual assignment)
    │
    ├── CASE 2: Supervisor → User
    │   └── updateDoc(projectRef, {
    │       supervisors: arrayRemove(targetUser.id)
    │     })
    │       └── ΔΕΝ προσθέτει στο members[] (manual assignment)
    │
    ├── CASE 3: Supervisor → Admin
    │   └── updateDoc(projectRef, {
    │       supervisors: arrayRemove(targetUser.id)
    │     })
    │       └── Admins have automatic access (no array needed)
    │
    └── CASE 4: Admin → Supervisor
        └── Promise.resolve() (Admins were never in project arrays)
```

### 18.2 Manual Re-Assignment Flow
```
ΜΕΤΑ ΤΗΝ ΑΛΛΑΓΗ ΡΟΛΟΥ:

ΒΗΜΑ 1: Role Change Completed
├── User's role updated in teams collection
└── User removed από project arrays (supervisors[] ή members[])

ΒΗΜΑ 2: Manual Re-Assignment (if needed)
├── Founder/Admin/Supervisor opens Project Settings modal
├── Sees updated role for user in assignment lists:
│   ├── "Supervisors" section: Only shows users με role === "Supervisor"
│   └── "Μέλη (Users)" section: Only shows users με role === "User"
└── Manually checks/unchecks user for project assignment

ΒΗΜΑ 3: Assignment Update
└── toggleProjectRole(userId, type) → Updates project arrays
```

### 18.3 Why No Auto-Assignment?
```
DESIGN DECISION: Manual Assignment Only

ΛΟΓΟΣ 1: Granular Control
├── Admins may not want ALL Supervisors in ALL projects
└── Project assignments should be deliberate, not automatic

ΛΟΓΟΣ 2: Role Hierarchy
├── Admins & Founders: Automatic access (don't appear in UI)
├── Supervisors: Manual selection per project
└── Users: Manual selection per project

ΛΟΓΟΣ 3: Cleanup Prevention
├── Prevents clutter in project arrays
└── Only actively assigned users appear
```

---

## APPENDIX: STATE MANAGEMENT SUMMARY

### Global State (Context)
```
SyncContext
├── isSyncing: boolean
├── syncNow: () => Promise<void>
└── justSyncedProjectId: string | null
```

### Local Storage Keys
```
AsyncStorage
├── user_profile_data_cache      → User profile
├── cached_my_teams              → Teams list
├── cached_team_{teamId}         → Individual team data
├── cached_project_tasks_{id}    → Project tasks
└── offline_tasks_queue_{id}     → Pending sync tasks
```

### Firebase Collections
```
Firestore
├── users/{userId}
├── teams/{teamId}
├── projects/{projectId}
└── invites/{inviteId}
```

### Firebase Storage (v2.0)
```
Storage
└── teams/
    └── {teamId}/
        └── projects/
            └── {projectId}/
                └── tasks/
                    └── {taskId}/
                        ├── {mediaId}.jpg  (photos)
                        └── {mediaId}.mp4  (videos)
```

---

## 19. FIREBASE STORAGE MIGRATION FLOW (v2.0)

### Αρχείο: `scripts/migrateToStorage.ts`

### 19.1 Migration Process
```
ΒΗΜΑ 1: Fetch All Projects
├── getDocs(collection(db, "projects"))
└── stats.projectsTotal = snapshot.size

ΒΗΜΑ 2: For Each Project
├── Get projectId και projectData
├── Get teamId από project document
│   ΑΝ !teamId → Skip project
│
└── Get tasks array

ΒΗΜΑ 3: For Each Task
FOR each task in tasks:
│
├── Migrate task.value (if base64)
│   ΑΝ value.startsWith("data:image"):
│   ├── Generate mediaId
│   ├── uploadBase64ToStorage(value, teamId, projectId, taskId, mediaId, "image")
│   ├── storageUrl = result
│   └── task.value = storageUrl
│   │
│   ΑΝ value.startsWith("data:video"):
│   └── Similar process για video
│
├── Migrate task.images[] (if contains base64)
│   FOR each imgUri in task.images:
│   ΑΝ imgUri.startsWith("data:image"):
│   ├── uploadBase64ToStorage(...)
│   └── Replace με storageUrl
│   │
│   ΑΝ imgUri.startsWith("https://firebasestorage"):
│   └── stats.imagesSkipped++ (already migrated)
│
└── ΑΝ changes made → taskChanged = true

ΒΗΜΑ 4: Update Firestore
ΑΝ projectChanged:
├── updateDoc(projectRef, { tasks: migratedTasks })
└── stats.projectsProcessed++

ΒΗΜΑ 5: Print Statistics
├── Projects: Total, Processed, Skipped
├── Tasks: Total, Processed
├── Images: Total, Migrated, Skipped, Failed
├── Videos: Total, Migrated, Skipped, Failed
└── Errors: List of error messages
```

### 19.2 Run Migration
```bash
# Install dependencies (if needed)
npm install --save-dev ts-node @types/node

# Run migration
npm run migrate
```

### 19.3 Expected Output
```
🚀 Firebase Storage Migration Started
=====================================

📥 Fetching all projects from Firestore...
✅ Found 15 projects

🔄 Processing project: abc123xyz (42 tasks)
✅ Project abc123xyz: Updated successfully

...

🎉 Migration Complete!
======================

📊 Statistics:
─────────────────────────────────────
Projects Total:      15
  ✅ Processed:      12
  ⏭️  Skipped:        3

Tasks Total:         128
  ✅ Processed:      95

Images Total:        342
  ✅ Migrated:       280
  ⏭️  Already Stored: 50
  ❌ Failed:         12

Videos Total:        45
  ✅ Migrated:       42
  ⏭️  Already Stored: 3
  ❌ Failed:         0
─────────────────────────────────────

📈 Success Rate: 97.2%
```

---

**Repository**: `/home/administrator/projects/my-team-app`

**Version**: 2.0.0

**Last Updated**: Φεβρουάριος 2026
