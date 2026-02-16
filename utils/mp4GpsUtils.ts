/**
 * MP4 GPS Metadata Utility
 * Embeds GPS coordinates into MP4 video files using the ©xyz atom in moov/udta.
 * Pure JS implementation - no native modules required (OTA-compatible).
 *
 * MP4 structure: boxes (atoms) with [4-byte size][4-byte type][data]
 * GPS goes in: moov → udta → ©xyz (ISO 6709 string like "+37.9838+023.7275/")
 */

import * as FileSystem from "expo-file-system/legacy";

type GeoPoint = { lat: number; lng: number };

/**
 * Format GPS as ISO 6709 string for MP4 ©xyz atom.
 * Format: +DD.DDDD+DDD.DDDD/ (latitude then longitude with signs)
 */
const formatIso6709 = (location: GeoPoint): string => {
  const latSign = location.lat >= 0 ? "+" : "";
  const lngSign = location.lng >= 0 ? "+" : "";
  return `${latSign}${location.lat.toFixed(4)}${lngSign}${location.lng.toFixed(4)}/`;
};

const readUint32BE = (data: Uint8Array, offset: number): number => {
  return (
    ((data[offset] << 24) >>> 0) +
    (data[offset + 1] << 16) +
    (data[offset + 2] << 8) +
    data[offset + 3]
  );
};

const writeUint32BE = (data: Uint8Array, offset: number, value: number): void => {
  data[offset] = (value >>> 24) & 0xff;
  data[offset + 1] = (value >>> 16) & 0xff;
  data[offset + 2] = (value >>> 8) & 0xff;
  data[offset + 3] = value & 0xff;
};

const readType = (data: Uint8Array, offset: number): string => {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
};

/**
 * Find a box by type within a byte range. Returns { offset, size } or null.
 */
const findBox = (
  data: Uint8Array,
  type: string,
  start: number,
  end: number
): { offset: number; size: number } | null => {
  let pos = start;
  while (pos + 8 <= end) {
    const size = readUint32BE(data, pos);
    if (size < 8) return null; // Invalid box
    const boxType = readType(data, pos + 4);
    if (boxType === type) {
      return { offset: pos, size };
    }
    pos += size;
  }
  return null;
};

/**
 * Build a ©xyz atom containing the GPS ISO 6709 string.
 * Structure: [4 bytes size][©xyz type][2 bytes string length][2 bytes language][string]
 */
const buildXyzAtom = (gpsString: string): Uint8Array => {
  const encoder = new TextEncoder();
  const strBytes = encoder.encode(gpsString);
  const atomSize = 8 + 4 + strBytes.length; // header(8) + data header(4) + string
  const atom = new Uint8Array(atomSize);

  writeUint32BE(atom, 0, atomSize);

  // Box type: ©xyz (0xA9, 'x', 'y', 'z')
  atom[4] = 0xa9;
  atom[5] = 0x78;
  atom[6] = 0x79;
  atom[7] = 0x7a;

  // Data length
  atom[8] = (strBytes.length >> 8) & 0xff;
  atom[9] = strBytes.length & 0xff;

  // Language code: 0x15C7 (undetermined)
  atom[10] = 0x15;
  atom[11] = 0xc7;

  atom.set(strBytes, 12);
  return atom;
};

/**
 * Build a udta box containing the ©xyz atom.
 */
const buildUdtaBox = (xyzAtom: Uint8Array): Uint8Array => {
  const udtaSize = 8 + xyzAtom.length;
  const udta = new Uint8Array(udtaSize);
  writeUint32BE(udta, 0, udtaSize);
  udta[4] = 0x75; // u
  udta[5] = 0x64; // d
  udta[6] = 0x74; // t
  udta[7] = 0x61; // a
  udta.set(xyzAtom, 8);
  return udta;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  // Process in chunks to avoid call stack overflow on large arrays
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
};

/**
 * Find all boxes of a given type recursively within a byte range.
 * Used to find stco/co64 atoms nested inside trak/mdia/minf/stbl.
 */
const findAllBoxes = (
  data: Uint8Array,
  type: string,
  start: number,
  end: number
): { offset: number; size: number }[] => {
  const results: { offset: number; size: number }[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    const size = readUint32BE(data, pos);
    if (size < 8) break;
    const boxType = readType(data, pos + 4);
    if (boxType === type) {
      results.push({ offset: pos, size });
    }
    // Recurse into container boxes
    if (["moov", "trak", "mdia", "minf", "stbl", "udta", "edts"].includes(boxType)) {
      const children = findAllBoxes(data, type, pos + 8, pos + size);
      results.push(...children);
    }
    pos += size;
  }
  return results;
};

/**
 * Update stco (32-bit chunk offsets) by adding delta to all offsets
 * that point to data AFTER the insertion point.
 */
const patchStco = (data: Uint8Array, stco: { offset: number; size: number }, delta: number, insertOffset: number): void => {
  // stco format: [size][type][version(1)+flags(3)][entry_count(4)][offsets(4 each)]
  const entryCount = readUint32BE(data, stco.offset + 12);
  for (let i = 0; i < entryCount; i++) {
    const offsetPos = stco.offset + 16 + i * 4;
    const chunkOffset = readUint32BE(data, offsetPos);
    if (chunkOffset >= insertOffset) {
      writeUint32BE(data, offsetPos, chunkOffset + delta);
    }
  }
};

/**
 * Update co64 (64-bit chunk offsets) by adding delta.
 * We only handle the lower 32 bits since our files are small (<4GB).
 */
const patchCo64 = (data: Uint8Array, co64: { offset: number; size: number }, delta: number, insertOffset: number): void => {
  const entryCount = readUint32BE(data, co64.offset + 12);
  for (let i = 0; i < entryCount; i++) {
    const offsetPos = co64.offset + 16 + i * 8;
    // Read as two 32-bit values (hi + lo)
    const hi = readUint32BE(data, offsetPos);
    const lo = readUint32BE(data, offsetPos + 4);
    const chunkOffset = hi * 0x100000000 + lo;
    if (chunkOffset >= insertOffset) {
      const newOffset = chunkOffset + delta;
      writeUint32BE(data, offsetPos, Math.floor(newOffset / 0x100000000));
      writeUint32BE(data, offsetPos + 4, newOffset >>> 0);
    }
  }
};

/**
 * Embed GPS coordinates into an MP4 file.
 * Returns the URI of the modified file, or the original URI on error.
 */
export const embedVideoGps = async (
  fileUri: string,
  location?: GeoPoint
): Promise<string> => {
  try {
    if (!location || (location.lat === 0 && location.lng === 0)) {
      return fileUri;
    }

    console.log("MP4 GPS: Embedding coordinates", location);

    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const data = base64ToUint8Array(base64);
    console.log("MP4 GPS: File size", data.length, "bytes");

    // Find moov box at top level
    const moov = findBox(data, "moov", 0, data.length);
    if (!moov) {
      console.warn("MP4 GPS: No moov box found, skipping");
      return fileUri;
    }

    const mdat = findBox(data, "mdat", 0, data.length);
    const moovBeforeMdat = mdat && moov.offset < mdat.offset;
    console.log("MP4 GPS: moov at", moov.offset, "mdat at", mdat?.offset, moovBeforeMdat ? "(moov-first)" : "(moov-last)");

    // Build the ©xyz atom
    const gpsString = formatIso6709(location);
    const xyzAtom = buildXyzAtom(gpsString);

    // Check for existing udta inside moov
    const moovDataStart = moov.offset + 8;
    const moovDataEnd = moov.offset + moov.size;
    const existingUdta = findBox(data, "udta", moovDataStart, moovDataEnd);

    let insertBytes: Uint8Array;
    let insertOffset: number;

    if (existingUdta) {
      console.log("MP4 GPS: Found existing udta, appending ©xyz");
      insertBytes = xyzAtom;
      insertOffset = existingUdta.offset + existingUdta.size;
    } else {
      console.log("MP4 GPS: No udta found, creating new");
      insertBytes = buildUdtaBox(xyzAtom);
      insertOffset = moovDataEnd;
    }

    // Build new file: [before insert] + [new bytes] + [after insert]
    const newData = new Uint8Array(data.length + insertBytes.length);
    newData.set(data.subarray(0, insertOffset), 0);
    newData.set(insertBytes, insertOffset);
    newData.set(data.subarray(insertOffset), insertOffset + insertBytes.length);

    // Update moov box size
    writeUint32BE(newData, moov.offset, moov.size + insertBytes.length);

    // Update udta box size if it existed
    if (existingUdta) {
      writeUint32BE(newData, existingUdta.offset, existingUdta.size + xyzAtom.length);
    }

    // If moov is before mdat, inserting bytes shifts mdat position.
    // Patch stco/co64 chunk offsets to account for the shift.
    if (moovBeforeMdat) {
      console.log("MP4 GPS: Patching stco/co64 offsets (moov-first layout)");
      const delta = insertBytes.length;

      // Find and patch all stco atoms (32-bit chunk offsets)
      const stcoBoxes = findAllBoxes(newData, "stco", moov.offset + 8, moov.offset + moov.size + delta);
      for (const stco of stcoBoxes) {
        patchStco(newData, stco, delta, insertOffset);
      }

      // Find and patch all co64 atoms (64-bit chunk offsets)
      const co64Boxes = findAllBoxes(newData, "co64", moov.offset + 8, moov.offset + moov.size + delta);
      for (const co64 of co64Boxes) {
        patchCo64(newData, co64, delta, insertOffset);
      }
    }

    // Write to temp file
    const newBase64 = uint8ArrayToBase64(newData);
    const tempPath = FileSystem.cacheDirectory + `gps_${Date.now()}.mp4`;
    await FileSystem.writeAsStringAsync(tempPath, newBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Clean up original
    await FileSystem.deleteAsync(fileUri, { idempotent: true });

    console.log("MP4 GPS: Embedded successfully:", gpsString);
    return tempPath;
  } catch (error: any) {
    console.error("MP4 GPS embedding failed:", error?.message || error);
    return fileUri;
  }
};
