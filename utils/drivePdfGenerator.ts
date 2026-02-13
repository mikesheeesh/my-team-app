/**
 * PDF Generator for Google Drive Sync
 *
 * Generates metadata PDFs for tasks:
 * - Στοιχεία.pdf: Photo/video metadata (description, GPS, date)
 * - μετρήσεις.pdf: All measurement tasks
 * - σημειώσεις.pdf: All general/text tasks
 *
 * Uses expo-print to generate PDF files from HTML templates.
 */

import * as Print from "expo-print";

type GeoPoint = { lat: number; lng: number };

interface MediaMetadataItem {
  filename: string;
  description?: string;
  location?: GeoPoint;
  date?: string;
}

interface MeasurementTaskData {
  title: string;
  description?: string;
  value: string;
  completedAt?: number;
}

interface GeneralTaskData {
  title: string;
  description?: string;
  value: string;
  completedAt?: number;
}

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleDateString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const generateGpsLink = (loc?: GeoPoint): string | null => {
  if (!loc || (loc.lat === 0 && loc.lng === 0)) return null;
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
};

const commonStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  body { font-family: 'Inter', Arial, sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
  h1 { font-size: 22px; color: #0f172a; margin-bottom: 5px; }
  h2 { font-size: 16px; color: #475569; font-weight: 400; margin-top: 0; margin-bottom: 25px; }
  .item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .item-title { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 6px; }
  .field { font-size: 13px; color: #64748b; margin-top: 4px; }
  .field-label { color: #334155; font-weight: 600; }
  .gps-link { color: #2563eb; text-decoration: none; }
  .value-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; font-size: 14px; color: #1e40af; margin-top: 6px; }
  .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge-photo { background: #dbeafe; color: #1d4ed8; }
  .badge-video { background: #fce7f3; color: #be185d; }
`;

/**
 * Generate Στοιχεία.pdf for a photo or video task
 * Contains metadata (filename, description, GPS location, date) for each media item
 */
export const generateMediaMetadataPdf = async (
  taskTitle: string,
  mediaType: "photo" | "video",
  items: MediaMetadataItem[]
): Promise<string> => {
  const typeLabel = mediaType === "photo" ? "Φωτογραφίες" : "Βίντεο";
  const typeIcon = mediaType === "photo" ? "📷" : "🎥";

  const itemsHTML = items
    .map(
      (item, i) => `
      <div class="item">
        <div class="item-title">${typeIcon} ${item.filename}</div>
        ${item.description ? `<div class="field"><span class="field-label">Περιγραφή:</span> ${item.description}</div>` : ""}
        ${
          item.location
            ? (() => {
                const link = generateGpsLink(item.location);
                return link
                  ? `<div class="field"><span class="field-label">Τοποθεσία:</span> <a class="gps-link" href="${link}">${item.location.lat.toFixed(6)}, ${item.location.lng.toFixed(6)}</a></div>`
                  : "";
              })()
            : ""
        }
        ${item.date ? `<div class="field"><span class="field-label">Ημερομηνία:</span> ${item.date}</div>` : ""}
      </div>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>${commonStyles}</style>
    </head>
    <body>
      <h1>${taskTitle}</h1>
      <h2>Στοιχεία ${typeLabel} (${items.length})</h2>
      ${itemsHTML}
      <div class="footer">Ergon Work Management - ${new Date().toLocaleDateString("el-GR")}</div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
};

/**
 * Generate μετρήσεις.pdf for all measurement tasks in a project
 */
export const generateMeasurementsPdf = async (
  projectName: string,
  tasks: MeasurementTaskData[]
): Promise<string> => {
  const tasksHTML = tasks
    .map(
      (task) => `
      <div class="item">
        <div class="item-title">📏 ${task.title}</div>
        ${task.description ? `<div class="field"><span class="field-label">Περιγραφή:</span> ${task.description}</div>` : ""}
        <div class="value-box">${task.value}</div>
        ${task.completedAt ? `<div class="field"><span class="field-label">Ημερομηνία:</span> ${formatDate(task.completedAt)}</div>` : ""}
      </div>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>${commonStyles}</style>
    </head>
    <body>
      <h1>${projectName}</h1>
      <h2>Μετρήσεις (${tasks.length})</h2>
      ${tasksHTML}
      <div class="footer">Ergon Work Management - ${new Date().toLocaleDateString("el-GR")}</div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
};

/**
 * Generate σημειώσεις.pdf for all general/text tasks in a project
 */
export const generateNotesPdf = async (
  projectName: string,
  tasks: GeneralTaskData[]
): Promise<string> => {
  const tasksHTML = tasks
    .map(
      (task) => `
      <div class="item">
        <div class="item-title">📝 ${task.title}</div>
        ${task.description ? `<div class="field"><span class="field-label">Περιγραφή:</span> ${task.description}</div>` : ""}
        ${task.value ? `<div class="value-box">${task.value}</div>` : ""}
        ${task.completedAt ? `<div class="field"><span class="field-label">Ημερομηνία:</span> ${formatDate(task.completedAt)}</div>` : ""}
      </div>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>${commonStyles}</style>
    </head>
    <body>
      <h1>${projectName}</h1>
      <h2>Σημειώσεις (${tasks.length})</h2>
      ${tasksHTML}
      <div class="footer">Ergon Work Management - ${new Date().toLocaleDateString("el-GR")}</div>
    </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  return uri;
};
