import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  Skia,
  useImage,
  PaintStyle,
  StrokeCap,
  StrokeJoin,
  ImageFormat,
} from "@shopify/react-native-skia";

interface ImageEditorModalProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
  onSave: (editedUri: string) => void;
  imageWidth?: number;
  imageHeight?: number;
}

type Point = { x: number; y: number };

type DrawnPath = {
  points: Point[];
  color: string;
  strokeWidth: number;
};

const COLORS = [
  "#ef4444",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#ffffff",
  "#000000",
];
const STROKE_WIDTHS = [3, 6, 10];
const PAN_DAMPING = 1.5;

// Convert point array to SVG path string for display
const pointsToSvgD = (points: Point[]): string => {
  if (points.length === 0) return "";
  return points.reduce((d, pt, i) => {
    return d + (i === 0 ? `M${pt.x},${pt.y}` : ` L${pt.x},${pt.y}`);
  }, "");
};

export default function ImageEditorModal({
  visible,
  imageUri,
  onClose,
  onSave,
  imageWidth,
  imageHeight,
}: ImageEditorModalProps) {
  // --- STATE ---
  const [paths, setPaths] = useState<DrawnPath[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);

  // Tools
  const [activeTool, setActiveTool] = useState<"pen" | "move">("pen");
  const [selectedColor, setSelectedColor] = useState("#ef4444");
  const [selectedWidth, setSelectedWidth] = useState(5);
  const [scale, setScale] = useState(1);
  const [showHint, setShowHint] = useState(true);
  const [saving, setSaving] = useState(false);

  // Animated pan values
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const lastPan = useRef({ x: 0, y: 0 });

  // Refs for stale closure prevention
  const colorRef = useRef(selectedColor);
  const widthRef = useRef(selectedWidth);
  const toolRef = useRef(activeTool);
  const scaleRef = useRef(scale);
  const wasInBounds = useRef(true);
  const lastValidPos = useRef({ x: 0, y: 0 });

  const { width, height } = Dimensions.get("window");
  const canvasLayoutRef = useRef({ top: 100, bottom: height - 110, left: 0, right: width });
  const canvasContainerRef = useRef<View>(null);
  const canvasHeightRef = useRef(height - 210);
  const [measuredCanvasHeight, setMeasuredCanvasHeight] = useState(height - 210);

  // Load image into Skia for high-res export
  const skiaImage = useImage(imageUri);

  // Sync refs
  useEffect(() => { colorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { widthRef.current = selectedWidth; }, [selectedWidth]);
  useEffect(() => { toolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { canvasHeightRef.current = measuredCanvasHeight; }, [measuredCanvasHeight]);

  useEffect(() => {
    const timer = setTimeout(() => {
      canvasContainerRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
        if (h > 0) {
          canvasLayoutRef.current = { top: y, bottom: y + h, left: x, right: x + w };
          if (Math.abs(h - canvasHeightRef.current) > 5) {
            setMeasuredCanvasHeight(h);
            canvasHeightRef.current = h;
          }
        }
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTool]);

  useEffect(() => {
    setShowHint(true);
    const timer = setTimeout(() => setShowHint(false), 2000);
    return () => clearTimeout(timer);
  }, [activeTool]);

  // --- PAN RESPONDER ---
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => true,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY, pageX, pageY } = evt.nativeEvent;
        if (toolRef.current === "pen") {
          const EDGE_MARGIN = 15;
          const { top: canvasTop, bottom: canvasBottom, left: canvasLeft, right: canvasRight } = canvasLayoutRef.current;
          const s = scaleRef.current;
          const tx = lastPan.current.x;
          const ty = lastPan.current.y;
          const cx = width / 2;
          const cy = canvasHeightRef.current / 2;
          const imgLeft = canvasLeft + cx * (1 - s) + s * tx;
          const imgRight = canvasLeft + cx * (1 + s) + s * tx;
          const imgTop = canvasTop + cy * (1 - s) + s * ty;
          const imgBottom = canvasTop + cy * (1 + s) + s * ty;

          const isOutsideVisible =
            pageX < Math.max(canvasLeft, imgLeft) || pageX > Math.min(canvasRight, imgRight) ||
            pageY < Math.max(canvasTop, imgTop) || pageY > Math.min(canvasBottom, imgBottom);

          const isInBounds =
            !isOutsideVisible &&
            locationX >= EDGE_MARGIN && locationX <= width - EDGE_MARGIN &&
            locationY >= EDGE_MARGIN && locationY <= canvasHeightRef.current - EDGE_MARGIN;

          if (isInBounds) {
            setCurrentPoints([{ x: locationX, y: locationY }]);
            lastValidPos.current = { x: locationX, y: locationY };
            wasInBounds.current = true;
          } else {
            wasInBounds.current = false;
          }
        }
      },

      onPanResponderMove: (evt, gestureState) => {
        const { locationX, locationY, pageX, pageY } = evt.nativeEvent;

        if (toolRef.current === "pen") {
          const EDGE_MARGIN = 15;
          const { top: canvasTop, bottom: canvasBottom, left: canvasLeft, right: canvasRight } = canvasLayoutRef.current;
          const s = scaleRef.current;
          const tx = lastPan.current.x;
          const ty = lastPan.current.y;
          const cx = width / 2;
          const cy = canvasHeightRef.current / 2;
          const imgLeft = canvasLeft + cx * (1 - s) + s * tx;
          const imgRight = canvasLeft + cx * (1 + s) + s * tx;
          const imgTop = canvasTop + cy * (1 - s) + s * ty;
          const imgBottom = canvasTop + cy * (1 + s) + s * ty;

          const isOutsideVisible =
            pageX < Math.max(canvasLeft, imgLeft) || pageX > Math.min(canvasRight, imgRight) ||
            pageY < Math.max(canvasTop + 20, imgTop) || pageY > Math.min(canvasBottom - 20, imgBottom);

          if (isOutsideVisible) { wasInBounds.current = false; return; }

          const isInBounds =
            locationX >= EDGE_MARGIN && locationX <= width - EDGE_MARGIN &&
            locationY >= EDGE_MARGIN && locationY <= canvasHeightRef.current - EDGE_MARGIN;

          const isWildValue =
            locationX < -20 || locationX > width + 20 ||
            locationY < -20 || locationY > canvasHeightRef.current + 50 ||
            Math.abs(locationX) > 2000 || Math.abs(locationY) > 2000;

          const distanceFromLast = Math.sqrt(
            Math.pow(locationX - lastValidPos.current.x, 2) +
            Math.pow(locationY - lastValidPos.current.y, 2)
          );
          const isJump = wasInBounds.current && distanceFromLast > 150;

          if (isWildValue || isJump) { wasInBounds.current = false; return; }
          if (!isInBounds) { wasInBounds.current = false; return; }

          wasInBounds.current = true;
          lastValidPos.current = { x: locationX, y: locationY };
          setCurrentPoints(prev => [...prev, { x: locationX, y: locationY }]);
        } else {
          const newX = lastPan.current.x + gestureState.dx / scaleRef.current / PAN_DAMPING;
          const newY = lastPan.current.y + gestureState.dy / scaleRef.current / PAN_DAMPING;
          panX.setValue(newX);
          panY.setValue(newY);
        }
      },

      onPanResponderRelease: () => {
        if (toolRef.current === "pen") {
          setCurrentPoints(prevPoints => {
            if (prevPoints.length > 2) {
              setPaths(prev => [...prev, {
                points: prevPoints,
                color: colorRef.current,
                strokeWidth: widthRef.current,
              }]);
            }
            return [];
          });
          wasInBounds.current = true;
        } else {
          lastPan.current.x = (panX as any)._value;
          lastPan.current.y = (panY as any)._value;
        }
      },

      onPanResponderTerminate: () => {
        if (toolRef.current === "pen") {
          setCurrentPoints(prevPoints => {
            if (prevPoints.length > 2) {
              setPaths(prev => [...prev, {
                points: prevPoints,
                color: colorRef.current,
                strokeWidth: widthRef.current,
              }]);
            }
            return [];
          });
          wasInBounds.current = true;
        } else {
          lastPan.current.x = (panX as any)._value;
          lastPan.current.y = (panY as any)._value;
        }
      },
    })
  ).current;

  // --- ACTIONS ---
  const handleUndo = () => setPaths(prev => prev.slice(0, -1));

  const handleClearAll = () => {
    setPaths([]);
    setCurrentPoints([]);
    setScale(1);
    panX.setValue(0);
    panY.setValue(0);
    lastPan.current = { x: 0, y: 0 };
    wasInBounds.current = true;
    lastValidPos.current = { x: 0, y: 0 };
  };

  const handleZoomIn = () => setScale(s => Math.min(s + 0.2, 3));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.2, 1));

  // --- SAVE with Skia offscreen surface (full original resolution) ---
  const handleSave = async () => {
    if (!skiaImage) {
      console.log("⏳ Skia image not ready yet");
      return;
    }

    setSaving(true);
    try {
      const imgW = imageWidth || skiaImage.width();
      const imgH = imageHeight || skiaImage.height();

      // How the image is displayed with "contain" fitting on screen
      const containScale = Math.min(width / imgW, measuredCanvasHeight / imgH);
      const displayW = imgW * containScale;
      const displayH = imgH * containScale;
      const containX = (width - displayW) / 2;
      const containY = (measuredCanvasHeight - displayH) / 2;

      // Scale factors from screen coords → image coords
      const scaleX = imgW / displayW;
      const scaleY = imgH / displayH;

      // Create offscreen Skia surface at ORIGINAL image resolution
      const surface = Skia.Surface.MakeOffscreen(imgW, imgH);
      if (!surface) throw new Error("Failed to create Skia surface");

      const skCanvas = surface.getCanvas();

      // Draw original full-res image
      const imgPaint = Skia.Paint();
      skCanvas.drawImageRect(
        skiaImage,
        Skia.XYWHRect(0, 0, skiaImage.width(), skiaImage.height()),
        Skia.XYWHRect(0, 0, imgW, imgH),
        imgPaint
      );

      // Draw all annotation paths at image resolution
      for (const pathData of paths) {
        if (pathData.points.length < 2) continue;

        const strokePaint = Skia.Paint();
        strokePaint.setStyle(PaintStyle.Stroke);
        strokePaint.setColor(Skia.Color(pathData.color));
        strokePaint.setStrokeWidth(pathData.strokeWidth * scaleX);
        strokePaint.setStrokeCap(StrokeCap.Round);
        strokePaint.setStrokeJoin(StrokeJoin.Round);
        strokePaint.setAntiAlias(true);

        const skPath = Skia.Path.Make();
        let started = false;

        for (const pt of pathData.points) {
          // Convert screen canvas coords → image coords
          const imgX = (pt.x - containX) * scaleX;
          const imgY = (pt.y - containY) * scaleY;
          if (!started) {
            skPath.moveTo(imgX, imgY);
            started = true;
          } else {
            skPath.lineTo(imgX, imgY);
          }
        }

        if (started) skCanvas.drawPath(skPath, strokePaint);
      }

      // Export as JPEG at 90% quality
      const snapshot = surface.makeImageSnapshot();
      const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, 90);

      const fileUri = (FileSystem.cacheDirectory || "") + "skia_edited_" + Date.now() + ".jpg";
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log(`✅ Skia export: ${imgW}×${imgH} → ${fileUri}`);
      onSave(fileUri);

      setTimeout(() => handleClearAll(), 500);
    } catch (e: any) {
      console.error("Skia save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  if (!imageUri) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "black" }}>
        <StatusBar hidden />

        {/* --- HEADER --- */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleClearAll} style={styles.textBtn}>
              <Text style={{ color: "#ef4444", fontWeight: "bold" }}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={[styles.iconBtn, { backgroundColor: saving ? "#555" : "#22c55e", borderRadius: 20, padding: 4 }]}
            >
              <Ionicons name={saving ? "hourglass" : "checkmark"} size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* --- CANVAS AREA --- */}
        <View
          ref={canvasContainerRef}
          onLayout={() => {
            requestAnimationFrame(() => {
              canvasContainerRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
                if (h > 0) {
                  canvasLayoutRef.current = { top: y, bottom: y + h, left: x, right: x + w };
                  if (Math.abs(h - canvasHeightRef.current) > 5) {
                    setMeasuredCanvasHeight(h);
                    canvasHeightRef.current = h;
                  }
                }
              });
            });
          }}
          style={{ flex: 1, overflow: "hidden", backgroundColor: "#111", justifyContent: "center", alignItems: "center" }}
        >
          <Animated.View
            style={{
              width: width,
              height: measuredCanvasHeight,
              backgroundColor: "black",
              overflow: "hidden",
              transform: [{ scale }, { translateX: panX }, { translateY: panY }],
            }}
          >
            <Image
              source={{ uri: imageUri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
            />

            <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers}>
              <Svg height="100%" width="100%">
                {paths.map((p, index) => (
                  <Path
                    key={index}
                    d={pointsToSvgD(p.points)}
                    stroke={p.color}
                    strokeWidth={p.strokeWidth / scale}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentPoints.length > 0 && (
                  <Path
                    d={pointsToSvgD(currentPoints)}
                    stroke={selectedColor}
                    strokeWidth={selectedWidth / scale}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </Svg>
            </View>
          </Animated.View>

          {showHint && (
            <View style={styles.overlayGuide}>
              <Text style={styles.guideText}>
                {activeTool === "move" ? "Σύρετε για μετακίνηση" : "Σχεδιάστε"}
              </Text>
            </View>
          )}
        </View>

        {/* --- TOOLS FOOTER --- */}
        <View style={styles.footer}>
          <View style={styles.toolsRow}>
            <TouchableOpacity onPress={handleUndo} style={styles.toolBtn}>
              <Ionicons name="arrow-undo" size={24} color="white" />
            </TouchableOpacity>

            <View style={styles.modeSwitch}>
              <TouchableOpacity
                onPress={() => setActiveTool("move")}
                style={[styles.modeBtn, activeTool === "move" && styles.modeBtnActive]}
              >
                <Ionicons name="hand-left" size={22} color={activeTool === "move" ? "white" : "#999"} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTool("pen")}
                style={[styles.modeBtn, activeTool === "pen" && styles.modeBtnActive]}
              >
                <Ionicons name="pencil" size={22} color={activeTool === "pen" ? "white" : "#999"} />
              </TouchableOpacity>
            </View>

            <View style={styles.zoomControls}>
              <Text style={styles.zoomHint}>Zoom/Crop</Text>
              <TouchableOpacity onPress={handleZoomOut} style={styles.zoomBtn}>
                <Text style={styles.zoomText}>-</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleZoomIn} style={styles.zoomBtn}>
                <Text style={styles.zoomText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {activeTool === "pen" && (
            <View style={styles.paintRow}>
              <View style={styles.strokeSelector}>
                {STROKE_WIDTHS.map((w) => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => setSelectedWidth(w)}
                    style={[
                      styles.strokeOption,
                      { width: w + 8, height: w + 8, borderRadius: 20 },
                      selectedWidth === w
                        ? { borderColor: "white", borderWidth: 1, backgroundColor: selectedColor }
                        : { backgroundColor: "#555" },
                    ]}
                  />
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorScroll}>
                {COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    style={[styles.colorCircle, { backgroundColor: color }, selectedColor === color && styles.selectedColor]}
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: "#111",
    borderBottomWidth: 1,
    borderBottomColor: "#222",
    zIndex: 10,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 15 },
  iconBtn: { padding: 5 },
  textBtn: { padding: 5, marginRight: 25 },

  footer: {
    backgroundColor: "#111",
    borderTopWidth: 1,
    borderTopColor: "#222",
    paddingVertical: 10,
    paddingBottom: 50,
  },
  toolsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 10,
    height: 50,
  },
  toolBtn: { padding: 10, backgroundColor: "#333", borderRadius: 8 },

  modeSwitch: { flexDirection: "row", backgroundColor: "#222", borderRadius: 12, padding: 2 },
  modeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10 },
  modeBtnActive: { backgroundColor: "#3b82f6" },

  zoomControls: { flexDirection: "row", gap: 10, alignItems: "center" },
  zoomHint: { color: "#999", fontSize: 12, fontWeight: "600", marginRight: 8 },
  zoomBtn: { width: 40, height: 40, backgroundColor: "#333", borderRadius: 20, justifyContent: "center", alignItems: "center" },
  zoomText: { color: "white", fontSize: 24, fontWeight: "bold", marginTop: -2 },

  paintRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginTop: 5 },
  strokeSelector: { flexDirection: "row", alignItems: "center", gap: 10, marginRight: 15 },
  strokeOption: {},
  colorScroll: { alignItems: "center", gap: 12 },
  colorCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "transparent" },
  selectedColor: { borderColor: "white", transform: [{ scale: 1.1 }] },

  overlayGuide: {
    position: "absolute",
    top: 110,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    pointerEvents: "none",
  },
  guideText: { color: "white", fontSize: 12 },
});
