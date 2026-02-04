import { Video } from "react-native-compressor";
import * as FileSystem from "expo-file-system/legacy";

export interface CompressionResult {
  uri: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
}

export const compressVideo = async (
  inputUri: string,
  onProgress?: (progress: number) => void
): Promise<CompressionResult> => {
  // Get original file size
  const originalInfo = await FileSystem.getInfoAsync(inputUri);
  const originalSize = originalInfo.exists
    ? (originalInfo as any).size || 0
    : 0;

  console.log("🎬 Starting video compression...");
  console.log("  - Input URI:", inputUri);
  console.log(
    "  - Original size:",
    (originalSize / 1024 / 1024).toFixed(2),
    "MB"
  );

  // Compress video with better quality settings
  const compressedUri = await Video.compress(
    inputUri,
    {
      compressionMethod: "manual",
      maxSize: 720,           // HD resolution (720p)
      bitrate: 2500000,       // 2.5 Mbps - good quality balance
    },
    (progress) => {
      console.log("  - Progress:", Math.round(progress * 100) + "%");
      onProgress?.(progress);
    }
  );

  // Get compressed file size
  const compressedInfo = await FileSystem.getInfoAsync(compressedUri);
  const compressedSize = compressedInfo.exists
    ? (compressedInfo as any).size || 0
    : 0;

  const compressionRatio =
    originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0;

  console.log("✓ Video compressed successfully");
  console.log(
    "  - Compressed size:",
    (compressedSize / 1024 / 1024).toFixed(2),
    "MB"
  );
  console.log("  - Reduction:", compressionRatio.toFixed(1) + "%");

  return {
    uri: compressedUri,
    originalSize,
    compressedSize,
    compressionRatio,
  };
};
