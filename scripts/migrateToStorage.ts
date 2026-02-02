/**
 * Firebase Storage Migration Script
 *
 * Migrates all existing base64 media (images/videos) from Firestore to Firebase Storage.
 *
 * Usage:
 *   npm run migrate
 *
 * What it does:
 * 1. Fetches all projects from Firestore
 * 2. For each task with base64 media (data:image or data:video):
 *    - Uploads to Firebase Storage
 *    - Replaces base64 with Storage URL
 * 3. Updates Firestore with new URLs
 * 4. Prints migration statistics
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  uploadBase64ToStorage,
  generateMediaId,
} from "../utils/storageUtils";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCASV17VUlZ8zjmkf8yJIb9LqiLDqB6BH4",
  authDomain: "teamcameraapp.firebaseapp.com",
  projectId: "teamcameraapp",
  storageBucket: "teamcameraapp.firebasestorage.app",
  messagingSenderId: "1066934665062",
  appId: "1:1066934665062:web:63a4241fd930aa13f7d2a7",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Statistics
interface MigrationStats {
  projectsTotal: number;
  projectsProcessed: number;
  projectsSkipped: number;
  tasksTotal: number;
  tasksProcessed: number;
  imagesTotal: number;
  imagesMigrated: number;
  imagesSkipped: number;
  imagesFailed: number;
  videosTotal: number;
  videosMigrated: number;
  videosSkipped: number;
  videosFailed: number;
  errors: string[];
}

const stats: MigrationStats = {
  projectsTotal: 0,
  projectsProcessed: 0,
  projectsSkipped: 0,
  tasksTotal: 0,
  tasksProcessed: 0,
  imagesTotal: 0,
  imagesMigrated: 0,
  imagesSkipped: 0,
  imagesFailed: 0,
  videosTotal: 0,
  videosMigrated: 0,
  videosSkipped: 0,
  videosFailed: 0,
  errors: [],
};

/**
 * Check if media URI is base64 data URI
 */
const isBase64DataUri = (uri: string): boolean => {
  return uri.startsWith("data:image") || uri.startsWith("data:video");
};

/**
 * Check if media URI is already a Storage URL
 */
const isStorageUrl = (uri: string): boolean => {
  return uri.startsWith("https://firebasestorage.googleapis.com");
};

/**
 * Migrate a single media item (image or video)
 */
const migrateMedia = async (
  mediaUri: string,
  teamId: string,
  projectId: string,
  taskId: string,
  mediaType: "image" | "video"
): Promise<string> => {
  if (isStorageUrl(mediaUri)) {
    // Already migrated
    if (mediaType === "image") {
      stats.imagesSkipped++;
    } else {
      stats.videosSkipped++;
    }
    return mediaUri;
  }

  if (!isBase64DataUri(mediaUri)) {
    // Unknown format (local file path, etc.)
    if (mediaType === "image") {
      stats.imagesSkipped++;
    } else {
      stats.videosSkipped++;
    }
    return mediaUri;
  }

  // Base64 data URI → Upload to Storage
  try {
    const mediaId = generateMediaId();
    const storageUrl = await uploadBase64ToStorage(
      mediaUri,
      teamId,
      projectId,
      taskId,
      mediaId,
      mediaType
    );

    if (mediaType === "image") {
      stats.imagesMigrated++;
    } else {
      stats.videosMigrated++;
    }

    return storageUrl;
  } catch (error: any) {
    console.error(`Failed to migrate ${mediaType}:`, error.message);
    stats.errors.push(`${projectId}/${taskId}: ${error.message}`);

    if (mediaType === "image") {
      stats.imagesFailed++;
    } else {
      stats.videosFailed++;
    }

    // Return original URI on failure
    return mediaUri;
  }
};

/**
 * Migrate a single task's media
 */
const migrateTask = async (
  task: any,
  teamId: string,
  projectId: string
): Promise<any> => {
  let taskChanged = false;
  const migratedTask = { ...task };

  // Migrate task.value (for photo/video tasks)
  if (task.value && typeof task.value === "string") {
    if (task.type === "photo" && isBase64DataUri(task.value)) {
      stats.imagesTotal++;
      migratedTask.value = await migrateMedia(
        task.value,
        teamId,
        projectId,
        task.id,
        "image"
      );
      taskChanged = true;
    } else if (task.type === "video" && isBase64DataUri(task.value)) {
      stats.videosTotal++;
      migratedTask.value = await migrateMedia(
        task.value,
        teamId,
        projectId,
        task.id,
        "video"
      );
      taskChanged = true;
    }
  }

  // Migrate task.images array
  if (task.images && Array.isArray(task.images) && task.images.length > 0) {
    const migratedImages: string[] = [];

    for (const imgUri of task.images) {
      if (!imgUri || typeof imgUri !== "string") {
        migratedImages.push(imgUri);
        continue;
      }

      if (isBase64DataUri(imgUri)) {
        stats.imagesTotal++;
        const migratedUri = await migrateMedia(
          imgUri,
          teamId,
          projectId,
          task.id,
          "image"
        );
        migratedImages.push(migratedUri);
        taskChanged = true;
      } else {
        migratedImages.push(imgUri);

        // Count already migrated images
        if (isStorageUrl(imgUri)) {
          stats.imagesTotal++;
          stats.imagesSkipped++;
        }
      }
    }

    migratedTask.images = migratedImages;
  }

  if (taskChanged) {
    stats.tasksProcessed++;
  }

  return migratedTask;
};

/**
 * Migrate a single project
 */
const migrateProject = async (projectDoc: any): Promise<boolean> => {
  const projectId = projectDoc.id;
  const projectData = projectDoc.data();

  // Get teamId
  const teamId = projectData.teamId;
  if (!teamId) {
    console.warn(`⚠️  Project ${projectId}: No teamId found, skipping...`);
    stats.projectsSkipped++;
    return false;
  }

  // Get tasks
  const tasks = projectData.tasks || [];
  if (tasks.length === 0) {
    console.log(`⏭️  Project ${projectId}: No tasks, skipping...`);
    stats.projectsSkipped++;
    return false;
  }

  stats.tasksTotal += tasks.length;

  console.log(`\n🔄 Processing project: ${projectId} (${tasks.length} tasks)`);

  // Migrate all tasks
  const migratedTasks: any[] = [];
  let projectChanged = false;

  for (const task of tasks) {
    const migratedTask = await migrateTask(task, teamId, projectId);
    migratedTasks.push(migratedTask);

    // Check if task was changed
    if (JSON.stringify(task) !== JSON.stringify(migratedTask)) {
      projectChanged = true;
    }
  }

  // Update Firestore if project changed
  if (projectChanged) {
    try {
      const projectRef = doc(db, "projects", projectId);
      await updateDoc(projectRef, {
        tasks: migratedTasks,
      });
      console.log(`✅ Project ${projectId}: Updated successfully`);
      stats.projectsProcessed++;
      return true;
    } catch (error: any) {
      console.error(`❌ Project ${projectId}: Failed to update:`, error.message);
      stats.errors.push(`Project ${projectId}: ${error.message}`);
      return false;
    }
  } else {
    console.log(`⏭️  Project ${projectId}: No changes needed`);
    stats.projectsSkipped++;
    return false;
  }
};

/**
 * Main migration function
 */
const migrateAllProjects = async () => {
  console.log("🚀 Firebase Storage Migration Started");
  console.log("=====================================\n");

  try {
    // Fetch all projects
    console.log("📥 Fetching all projects from Firestore...");
    const projectsSnapshot = await getDocs(collection(db, "projects"));
    stats.projectsTotal = projectsSnapshot.size;
    console.log(`✅ Found ${stats.projectsTotal} projects\n`);

    if (stats.projectsTotal === 0) {
      console.log("⚠️  No projects found. Exiting...");
      return;
    }

    // Migrate each project
    for (const projectDoc of projectsSnapshot.docs) {
      await migrateProject(projectDoc);
    }

    // Print final statistics
    console.log("\n\n🎉 Migration Complete!");
    console.log("======================\n");
    console.log("📊 Statistics:");
    console.log("─────────────────────────────────────");
    console.log(`Projects Total:      ${stats.projectsTotal}`);
    console.log(`  ✅ Processed:      ${stats.projectsProcessed}`);
    console.log(`  ⏭️  Skipped:        ${stats.projectsSkipped}`);
    console.log("");
    console.log(`Tasks Total:         ${stats.tasksTotal}`);
    console.log(`  ✅ Processed:      ${stats.tasksProcessed}`);
    console.log("");
    console.log(`Images Total:        ${stats.imagesTotal}`);
    console.log(`  ✅ Migrated:       ${stats.imagesMigrated}`);
    console.log(`  ⏭️  Already Stored: ${stats.imagesSkipped}`);
    console.log(`  ❌ Failed:         ${stats.imagesFailed}`);
    console.log("");
    console.log(`Videos Total:        ${stats.videosTotal}`);
    console.log(`  ✅ Migrated:       ${stats.videosMigrated}`);
    console.log(`  ⏭️  Already Stored: ${stats.videosSkipped}`);
    console.log(`  ❌ Failed:         ${stats.videosFailed}`);
    console.log("─────────────────────────────────────");

    // Print errors if any
    if (stats.errors.length > 0) {
      console.log("\n⚠️  Errors encountered:");
      stats.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err}`);
      });
    } else {
      console.log("\n✅ No errors encountered!");
    }

    // Success rate
    const totalMedia = stats.imagesTotal + stats.videosTotal;
    const successfulMedia = stats.imagesMigrated + stats.videosMigrated;
    const successRate = totalMedia > 0 ? ((successfulMedia / totalMedia) * 100).toFixed(1) : "0.0";
    console.log(`\n📈 Success Rate: ${successRate}%`);

  } catch (error: any) {
    console.error("\n❌ Migration failed:", error.message);
    process.exit(1);
  }
};

// Run migration
migrateAllProjects()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
