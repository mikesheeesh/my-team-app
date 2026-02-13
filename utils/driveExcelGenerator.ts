/**
 * Excel Generator for Google Drive Sync
 * Generates a single .xlsx file per project with Μετρήσεις + Κείμενο sheets
 */

import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";

interface TaskData {
  title: string;
  description?: string;
  value: string;
  completedAt?: number;
  status: string;
}

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return "-";
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Generate an Excel file with Μετρήσεις and Κείμενο sheets
 * Writes to temp file and returns { uri, blob } for Drive upload
 */
export const generateProjectExcel = async (
  projectName: string,
  measurementTasks: TaskData[],
  generalTasks: TaskData[]
): Promise<{ uri: string; blob: Blob }> => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Μετρήσεις
  const measurementRows = measurementTasks.map((t) => ({
    "Τίτλος": t.title,
    "Περιγραφή": t.description || "-",
    "Τιμή": t.value || "-",
    "Κατάσταση": t.status === "completed" ? "Ολοκληρωμένο" : "Εκκρεμεί",
    "Ημερομηνία": formatDate(t.completedAt),
  }));

  if (measurementRows.length === 0) {
    measurementRows.push({
      "Τίτλος": "-",
      "Περιγραφή": "-",
      "Τιμή": "-",
      "Κατάσταση": "-",
      "Ημερομηνία": "-",
    });
  }

  const wsM = XLSX.utils.json_to_sheet(measurementRows);
  wsM["!cols"] = [
    { wch: 30 }, // Τίτλος
    { wch: 40 }, // Περιγραφή
    { wch: 20 }, // Τιμή
    { wch: 15 }, // Κατάσταση
    { wch: 20 }, // Ημερομηνία
  ];
  XLSX.utils.book_append_sheet(wb, wsM, "Μετρήσεις");

  // Sheet 2: Κείμενο
  const generalRows = generalTasks.map((t) => ({
    "Τίτλος": t.title,
    "Περιγραφή": t.description || "-",
    "Κείμενο": t.value || "-",
    "Κατάσταση": t.status === "completed" ? "Ολοκληρωμένο" : "Εκκρεμεί",
    "Ημερομηνία": formatDate(t.completedAt),
  }));

  if (generalRows.length === 0) {
    generalRows.push({
      "Τίτλος": "-",
      "Περιγραφή": "-",
      "Κείμενο": "-",
      "Κατάσταση": "-",
      "Ημερομηνία": "-",
    });
  }

  const wsG = XLSX.utils.json_to_sheet(generalRows);
  wsG["!cols"] = [
    { wch: 30 }, // Τίτλος
    { wch: 40 }, // Περιγραφή
    { wch: 50 }, // Κείμενο
    { wch: 15 }, // Κατάσταση
    { wch: 20 }, // Ημερομηνία
  ];
  XLSX.utils.book_append_sheet(wb, wsG, "Κείμενο");

  // Write to base64 and save to temp file (React Native Blob from ArrayBuffer is unreliable)
  const wbBase64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
  const tempPath = FileSystem.cacheDirectory + `excel_${Date.now()}.xlsx`;
  await FileSystem.writeAsStringAsync(tempPath, wbBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Read back as blob via fetch (proven pattern in React Native)
  const response = await fetch(tempPath);
  const blob = await response.blob();

  return { uri: tempPath, blob };
};
