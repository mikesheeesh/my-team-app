/**
 * EXIF Metadata Utility
 * Embeds GPS coordinates and date into JPEG photos before upload
 */

import * as FileSystem from "expo-file-system/legacy";
import piexif from "piexifjs";

type GeoPoint = { lat: number; lng: number };

/**
 * Convert decimal degrees to EXIF-format degrees/minutes/seconds
 * EXIF GPS uses rational numbers: [[degrees,1], [minutes,1], [seconds*100,100]]
 */
const decimalToDMS = (decimal: number): [[number, number], [number, number], [number, number]] => {
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60 * 100);
  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 100],
  ];
};

/**
 * Format date for EXIF (YYYY:MM:DD HH:MM:SS)
 */
const formatExifDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/**
 * Embed EXIF metadata (GPS + date) into a JPEG file
 * Returns the URI of the modified file, or original URI on error
 */
export const embedExifData = async (
  fileUri: string,
  location?: GeoPoint,
  date?: Date
): Promise<string> => {
  try {
    // Skip if no metadata to embed
    if (!location && !date) return fileUri;

    // Skip invalid GPS (0,0)
    if (location && location.lat === 0 && location.lng === 0) {
      location = undefined;
      if (!date) return fileUri;
    }

    // Read JPEG as base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const dataUri = `data:image/jpeg;base64,${base64}`;

    // Build EXIF data
    const exifObj: any = { "0th": {}, Exif: {}, GPS: {} };

    // Date metadata
    if (date) {
      const dateStr = formatExifDate(date);
      exifObj["0th"][piexif.ImageIFD.DateTime] = dateStr;
      exifObj.Exif[piexif.ExifIFD.DateTimeOriginal] = dateStr;
      exifObj.Exif[piexif.ExifIFD.DateTimeDigitized] = dateStr;
    }

    // GPS metadata
    if (location) {
      exifObj.GPS[piexif.GPSIFD.GPSLatitude] = decimalToDMS(location.lat);
      exifObj.GPS[piexif.GPSIFD.GPSLatitudeRef] = location.lat >= 0 ? "N" : "S";
      exifObj.GPS[piexif.GPSIFD.GPSLongitude] = decimalToDMS(location.lng);
      exifObj.GPS[piexif.GPSIFD.GPSLongitudeRef] = location.lng >= 0 ? "E" : "W";
    }

    // Insert EXIF into JPEG
    const exifBytes = piexif.dump(exifObj);
    const newDataUri = piexif.insert(exifBytes, dataUri);

    // Extract base64 and write to temp file
    const newBase64 = newDataUri.split(",")[1];
    const tempPath = FileSystem.cacheDirectory + `exif_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(tempPath, newBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Clean up original file
    await FileSystem.deleteAsync(fileUri, { idempotent: true });

    console.log("✓ EXIF embedded:", location ? `GPS ${location.lat},${location.lng}` : "no GPS", date ? `Date ${formatExifDate(date)}` : "");
    return tempPath;
  } catch (error) {
    console.warn("EXIF embedding failed (non-fatal):", error);
    return fileUri; // Return original on error
  }
};
