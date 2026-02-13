/**
 * Excel Generator for Google Drive Sync
 * Generates a single .xlsx file per project with Μετρήσεις + Κείμενο sheets
 */

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
 * Returns a Blob ready for Drive upload
 */
export const generateProjectExcel = (
  projectName: string,
  measurementTasks: TaskData[],
  generalTasks: TaskData[]
): Blob => {
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

  // Write to binary
  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([wbOut], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};
