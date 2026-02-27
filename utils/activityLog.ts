import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

export const logActivity = async (
  projectId: string,
  userId: string,
  userName: string,
  action: string,
  taskId: string,
  taskTitle: string,
  details?: string,
): Promise<void> => {
  try {
    await addDoc(collection(db, "projects", projectId, "activity"), {
      action,
      userId,
      userName,
      taskId,
      taskTitle,
      details: details || null,
      timestamp: serverTimestamp(),
    });
  } catch {
    // Silent fail — log should never break app functionality
  }
};
