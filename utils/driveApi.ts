/**
 * Google Drive REST API Wrapper
 *
 * Handles folder creation, file upload/update, and file search
 * using the Google Drive v3 REST API with fetch.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/**
 * Find a folder by name inside a parent folder
 * Returns the folder ID if found, null otherwise
 */
export const findFolder = async (
  name: string,
  parentId: string,
  accessToken: string
): Promise<string | null> => {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const response = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Drive API findFolder error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.files?.[0]?.id || null;
};

/**
 * Create a folder in Google Drive
 * Returns the folder ID
 */
export const createFolder = async (
  name: string,
  parentId: string,
  accessToken: string
): Promise<string> => {
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentId === "root" ? undefined : [parentId],
  };

  const response = await fetch(`${DRIVE_API}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Drive API createFolder error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.id;
};

/**
 * Find or create a folder (idempotent)
 * If folder exists, returns its ID; otherwise creates it
 */
export const getOrCreateFolder = async (
  name: string,
  parentId: string,
  accessToken: string
): Promise<string> => {
  const existingId = await findFolder(name, parentId, accessToken);
  if (existingId) return existingId;
  return await createFolder(name, parentId, accessToken);
};

/**
 * Upload a file to Google Drive using multipart upload
 * For new files: creates in the specified folder
 * For existing files: updates content (pass existingFileId)
 * Returns the file ID
 */
export const uploadFile = async (
  name: string,
  content: Blob,
  mimeType: string,
  folderId: string,
  accessToken: string,
  existingFileId?: string
): Promise<string> => {
  const metadata: any = { name };
  if (!existingFileId) {
    metadata.parents = [folderId];
  }

  // Build multipart body
  const boundary = "drive_upload_boundary_" + Date.now();
  const metadataString = JSON.stringify(metadata);

  // Convert blob to base64 for the multipart body
  const arrayBuffer = await content.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadataString}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${btoa(binaryString)}\r\n` +
    `--${boundary}--`;

  const url = existingFileId
    ? `${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart`;

  const response = await fetch(url, {
    method: existingFileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Drive API uploadFile error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.id;
};

/**
 * Upload a large file using resumable upload
 * Better for files > 5MB (photos/videos from Firebase Storage)
 * Returns the file ID
 */
export const uploadFileResumable = async (
  name: string,
  content: Blob,
  mimeType: string,
  folderId: string,
  accessToken: string,
  existingFileId?: string
): Promise<string> => {
  // Step 1: Initiate resumable upload session
  const metadata: any = { name };
  if (!existingFileId) {
    metadata.parents = [folderId];
  }

  const initUrl = existingFileId
    ? `${DRIVE_UPLOAD_API}/files/${existingFileId}?uploadType=resumable`
    : `${DRIVE_UPLOAD_API}/files?uploadType=resumable`;

  const initResponse = await fetch(initUrl, {
    method: existingFileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": content.size.toString(),
    },
    body: JSON.stringify(metadata),
  });

  if (!initResponse.ok) {
    const error = await initResponse.text();
    throw new Error(`Drive resumable init error: ${initResponse.status} - ${error}`);
  }

  const uploadUri = initResponse.headers.get("Location");
  if (!uploadUri) {
    throw new Error("No upload URI returned from resumable init");
  }

  // Step 2: Upload the file content
  const uploadResponse = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": content.size.toString(),
    },
    body: content,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Drive resumable upload error: ${uploadResponse.status} - ${error}`);
  }

  const data = await uploadResponse.json();
  return data.id;
};

/**
 * Find a file by name in a folder
 * Returns the file ID if found, null otherwise
 */
export const findFile = async (
  name: string,
  folderId: string,
  accessToken: string
): Promise<string | null> => {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;

  const response = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) return null;

  const data = await response.json();
  return data.files?.[0]?.id || null;
};

/**
 * Delete a file from Google Drive
 */
export const deleteFile = async (
  fileId: string,
  accessToken: string
): Promise<void> => {
  const response = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Drive API deleteFile error: ${response.status} - ${error}`);
  }
};
