/**
 * Firebase Storage Utility Functions
 *
 * Handles all file upload, download, and deletion operations for Firebase Storage.
 * Storage Structure: teams/{teamId}/projects/{projectId}/tasks/{taskId}/{mediaId}.{ext}
 */

import { storage } from "../firebaseConfig";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
} from "firebase/storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/**
 * Generate unique media ID
 * Format: {timestamp}_{randomString}
 */
export const generateMediaId = (): string => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 11);
  return `${timestamp}_${randomStr}`;
};

/**
 * Convert URI to Blob
 * Handles both file:// URIs (mobile) and blob URIs (web)
 */
const uriToBlob = async (uri: string): Promise<Blob> => {
  try {
    // Use fetch for both web and mobile
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Failed to fetch URI: ${response.statusText}`);
    }
    const blob = await response.blob();
    console.log("✓ Blob created from URI, size:", blob.size, "type:", blob.type);
    return blob;
  } catch (error: any) {
    console.error("❌ Failed to create blob from URI:", error);
    throw new Error(`Αποτυχία μετατροπής αρχείου: ${error.message}`);
  }
};

/**
 * Convert base64 data URI to Blob
 * Used for migration of existing base64 media
 */
const base64ToBlob = (dataUri: string): Blob => {
  // Extract base64 data and mime type
  const [metadata, base64Data] = dataUri.split(",");
  const mimeMatch = metadata.match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

  // Convert base64 to binary
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);

  return new Blob([byteArray], { type: mimeType });
};

/**
 * Upload Image to Firebase Storage
 *
 * @param imageUri - Local file URI (file:// or blob:)
 * @param teamId - Team ID for storage path
 * @param projectId - Project ID
 * @param taskId - Task ID
 * @param mediaId - Unique media ID
 * @returns Download URL of uploaded image
 */
export const uploadImageToStorage = async (
  imageUri: string,
  teamId: string,
  projectId: string,
  taskId: string,
  mediaId: string
): Promise<string> => {
  try {
    console.log("🔧 uploadImageToStorage called with:");
    console.log("  - imageUri:", imageUri);
    console.log("  - teamId:", teamId);
    console.log("  - projectId:", projectId);
    console.log("  - taskId:", taskId);
    console.log("  - mediaId:", mediaId);

    // Validate inputs
    if (!imageUri || !teamId || !projectId || !taskId || !mediaId) {
      throw new Error("Missing required parameters for image upload");
    }

    // Create storage path
    const storagePath = `teams/${teamId}/projects/${projectId}/tasks/${taskId}/${mediaId}.jpg`;
    console.log("  - Storage path:", storagePath);
    const storageRef = ref(storage, storagePath);

    // Convert URI to Blob
    console.log("  - Converting URI to Blob...");
    const blob = await uriToBlob(imageUri);
    console.log("  - Blob created, size:", blob.size, "bytes");

    // Upload to Firebase Storage
    console.log("  - Uploading to Firebase Storage...");
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: "image/jpeg",
    });

    // Get download URL
    console.log("  - Getting download URL...");
    const downloadURL = await getDownloadURL(snapshot.ref);

    console.log(`✓ Image uploaded successfully: ${storagePath}`);
    console.log(`  - Download URL: ${downloadURL}`);
    return downloadURL;
  } catch (error: any) {
    console.error("❌ Image upload failed:");
    console.error("  - Error:", error);
    console.error("  - Message:", error.message);
    console.error("  - Code:", error.code);
    throw new Error(`Η μεταφόρτωση της εικόνας απέτυχε: ${error.message}`);
  }
};

/**
 * Upload Video to Firebase Storage
 *
 * @param videoUri - Local file URI
 * @param teamId - Team ID
 * @param projectId - Project ID
 * @param taskId - Task ID
 * @param mediaId - Unique media ID
 * @returns Download URL of uploaded video
 */
export const uploadVideoToStorage = async (
  videoUri: string,
  teamId: string,
  projectId: string,
  taskId: string,
  mediaId: string
): Promise<string> => {
  try {
    // Validate inputs
    if (!videoUri || !teamId || !projectId || !taskId || !mediaId) {
      throw new Error("Missing required parameters for video upload");
    }

    // Create storage path
    const storagePath = `teams/${teamId}/projects/${projectId}/tasks/${taskId}/${mediaId}.mp4`;
    const storageRef = ref(storage, storagePath);

    // Convert URI to Blob
    const blob = await uriToBlob(videoUri);

    // Upload to Firebase Storage
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: "video/mp4",
    });

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    console.log(`✓ Video uploaded: ${storagePath}`);
    return downloadURL;
  } catch (error: any) {
    console.error("Video upload failed:", error);
    throw new Error(`Η μεταφόρτωση του βίντεο απέτυχε: ${error.message}`);
  }
};

/**
 * Upload Base64 Media to Storage (Migration)
 *
 * Used for migrating existing base64 data URIs to Firebase Storage
 *
 * @param base64Data - Base64 data URI (data:image/jpeg;base64,...)
 * @param teamId - Team ID
 * @param projectId - Project ID
 * @param taskId - Task ID
 * @param mediaId - Unique media ID
 * @param mediaType - 'image' or 'video'
 * @returns Download URL
 */
export const uploadBase64ToStorage = async (
  base64Data: string,
  teamId: string,
  projectId: string,
  taskId: string,
  mediaId: string,
  mediaType: "image" | "video"
): Promise<string> => {
  try {
    // Validate inputs
    if (!base64Data || !teamId || !projectId || !taskId || !mediaId) {
      throw new Error("Missing required parameters for base64 upload");
    }

    // Determine file extension and content type
    const ext = mediaType === "image" ? "jpg" : "mp4";
    const contentType = mediaType === "image" ? "image/jpeg" : "video/mp4";

    // Create storage path
    const storagePath = `teams/${teamId}/projects/${projectId}/tasks/${taskId}/${mediaId}.${ext}`;
    const storageRef = ref(storage, storagePath);

    // Convert base64 to Blob
    const blob = base64ToBlob(base64Data);

    // Upload to Firebase Storage
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: contentType,
    });

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    console.log(`✓ Base64 ${mediaType} migrated: ${storagePath}`);
    return downloadURL;
  } catch (error: any) {
    console.error(`Base64 ${mediaType} upload failed:`, error);
    throw new Error(
      `Η μετατροπή ${mediaType === "image" ? "εικόνας" : "βίντεο"} απέτυχε: ${error.message}`
    );
  }
};

/**
 * Delete Media from Firebase Storage
 *
 * @param storageUrl - Full Firebase Storage download URL
 */
export const deleteMediaFromStorage = async (
  storageUrl: string
): Promise<void> => {
  try {
    if (!storageUrl || !storageUrl.startsWith("https://firebasestorage.googleapis.com")) {
      console.warn("Invalid storage URL for deletion:", storageUrl);
      return; // Silent fail for invalid URLs
    }

    // Extract storage path from URL
    // URL format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
    const urlParts = storageUrl.split("/o/")[1];
    if (!urlParts) {
      console.warn("Could not extract path from URL:", storageUrl);
      return;
    }

    // Remove query parameters and decode
    const storagePath = decodeURIComponent(urlParts.split("?")[0]);

    // Create reference and delete
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);

    console.log(`✓ Media deleted: ${storagePath}`);
  } catch (error: any) {
    // Silent fail - file might already be deleted or never existed
    if (error.code === "storage/object-not-found") {
      console.log("File already deleted or doesn't exist");
    } else {
      console.error("Media deletion failed:", error);
    }
  }
};

/**
 * Get Storage Path from Download URL
 * Helper function for debugging/logging
 */
export const getStoragePathFromUrl = (downloadUrl: string): string | null => {
  try {
    const urlParts = downloadUrl.split("/o/")[1];
    if (!urlParts) return null;
    return decodeURIComponent(urlParts.split("?")[0]);
  } catch {
    return null;
  }
};

/**
 * Delete all media files for a project from Firebase Storage
 * Recursively lists and deletes all files under teams/{teamId}/projects/{projectId}/
 */
export const deleteProjectMedia = async (
  teamId: string,
  projectId: string
): Promise<void> => {
  try {
    const projectPath = `teams/${teamId}/projects/${projectId}`;
    const projectRef = ref(storage, projectPath);

    // Recursively delete all files
    const deleteRecursive = async (folderRef: any): Promise<void> => {
      const result = await listAll(folderRef);

      // Delete all files in this folder
      const deletePromises = result.items.map((itemRef) =>
        deleteObject(itemRef).catch((err) => {
          if (err.code !== "storage/object-not-found") {
            console.warn("Failed to delete:", itemRef.fullPath, err);
          }
        })
      );

      // Recurse into subfolders
      const folderPromises = result.prefixes.map((prefix) =>
        deleteRecursive(prefix)
      );

      await Promise.all([...deletePromises, ...folderPromises]);
    };

    await deleteRecursive(projectRef);
    console.log(`✓ All media deleted for project: ${projectPath}`);
  } catch (error: any) {
    if (error.code === "storage/object-not-found") {
      console.log("No media files found for project");
    } else {
      console.error("Failed to delete project media:", error);
    }
  }
};
