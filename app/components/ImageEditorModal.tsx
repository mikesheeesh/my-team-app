import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
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
import ViewShot from "react-native-view-shot";

interface ImageEditorModalProps {
  visible: boolean;
  imageUri: string | null;
  onClose: () => void;
  onSave: (editedUri: string) => void;
}

type DrawnPath = {
  d: string;
  color: string;
  width: number;
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

// --- ΡΥΘΜΙΣΗ ΕΥΑΙΣΘΗΣΙΑΣ ---
// Όσο μεγαλύτερο το νούμερο, τόσο πιο αργά/ομαλά κινείται το χέρι.
// Το 1.5 είναι μια καλή μέση λύση. Αν το θες πιο αργό, βάλε 2.
const PAN_DAMPING = 1.5;

export default function ImageEditorModal({
  visible,
  imageUri,
  onClose,
  onSave,
}: ImageEditorModalProps) {
  // --- STATE ---
  const [paths, setPaths] = useState<DrawnPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");

  // Tools
  const [activeTool, setActiveTool] = useState<"pen" | "move">("pen");
  const [selectedColor, setSelectedColor] = useState("#ef4444");
  const [selectedWidth, setSelectedWidth] = useState(5);

  // Zoom State (Παραμένει state γιατί γίνεται με κλικ, όχι gesture)
  const [scale, setScale] = useState(1);

  // Hint visibility state
  const [showHint, setShowHint] = useState(true);

  // --- NEW: ANIMATED VALUES FOR PANNING (Για ομαλή κίνηση) ---
  // Αντί για useState, χρησιμοποιούμε Animated.Value που δεν προκαλεί re-renders
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  // Κρατάμε την τελευταία θέση για να προσθέτουμε το νέο gesture πάνω της
  const lastPan = useRef({ x: 0, y: 0 });

  // Refs για να αποφύγουμε τα stale closures
  const colorRef = useRef(selectedColor);
  const widthRef = useRef(selectedWidth);
  const toolRef = useRef(activeTool);
  const scaleRef = useRef(scale);

  // Track if last drawing point was in bounds to prevent jump lines
  const wasInBounds = useRef(true);
  // Track last valid drawing position to detect jumps
  const lastValidPos = useRef({ x: 0, y: 0 });

  // Dimensions πρέπει να δηλωθούν ΠΡΙΝ τα canvas refs που τα χρησιμοποιούν
  const viewShotRef = useRef<ViewShot>(null);
  const { width, height } = Dimensions.get("window");

  // Canvas layout measurement (absolute screen coordinates)
  const canvasLayoutRef = useRef({ top: 100, bottom: height - 110, left: 0, right: width });
  const canvasContainerRef = useRef<View>(null);
  const canvasHeightRef = useRef(height - 210);
  const [measuredCanvasHeight, setMeasuredCanvasHeight] = useState(height - 210);

  useEffect(() => {
    colorRef.current = selectedColor;
  }, [selectedColor]);
  useEffect(() => {
    widthRef.current = selectedWidth;
  }, [selectedWidth]);
  useEffect(() => {
    toolRef.current = activeTool;
  }, [activeTool]);
  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Keep canvasHeightRef in sync with state
  useEffect(() => {
    canvasHeightRef.current = measuredCanvasHeight;
  }, [measuredCanvasHeight]);

  // Re-measure canvas when tool changes (footer size changes with paintRow)
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

  // Auto-hide hint after 2 seconds when tool changes
  useEffect(() => {
    setShowHint(true);
    const timer = setTimeout(() => {
      setShowHint(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, [activeTool]);

  // --- PAN RESPONDER ---
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // CRITICAL: Επέτρεψε termination όταν το touch πάει σε άλλα UI elements
      onPanResponderTerminationRequest: () => true,

      onPanResponderGrant: (evt) => {
        const { locationX, locationY, pageX, pageY } = evt.nativeEvent;
        if (toolRef.current === "pen") {
          // Έλεγχος αν το αρχικό touch είναι μέσα στα όρια
          const EDGE_MARGIN = 15;
          const { top: canvasTop, bottom: canvasBottom, left: canvasLeft, right: canvasRight } = canvasLayoutRef.current;

          // Compute actual image bounds in screen coords (accounting for pan + scale)
          const s = scaleRef.current;
          const tx = lastPan.current.x;
          const ty = lastPan.current.y;
          const cx = width / 2;
          const cy = canvasHeightRef.current / 2;
          const imgLeft = canvasLeft + cx * (1 - s) + s * tx;
          const imgRight = canvasLeft + cx * (1 + s) + s * tx;
          const imgTop = canvasTop + cy * (1 - s) + s * ty;
          const imgBottom = canvasTop + cy * (1 + s) + s * ty;

          // Visible area = intersection of canvas bounds and image bounds
          const isOutsideVisible =
            pageX < Math.max(canvasLeft, imgLeft) || pageX > Math.min(canvasRight, imgRight) ||
            pageY < Math.max(canvasTop, imgTop) || pageY > Math.min(canvasBottom, imgBottom);

          const isInBounds =
            !isOutsideVisible &&
            locationX >= EDGE_MARGIN &&
            locationX <= width - EDGE_MARGIN &&
            locationY >= EDGE_MARGIN &&
            locationY <= canvasHeightRef.current - EDGE_MARGIN;

          if (isInBounds) {
            setCurrentPath(`M${locationX},${locationY}`);
            lastValidPos.current = { x: locationX, y: locationY };
            wasInBounds.current = true;
          } else {
            // Αν ξεκίνησε εκτός, μην κάνεις τίποτα
            wasInBounds.current = false;
          }
        }
        // Στο 'move' δεν χρειάζεται να κάνουμε κάτι στο grant πλέον
      },

      onPanResponderMove: (evt, gestureState) => {
        const { locationX, locationY, pageX, pageY } = evt.nativeEvent;

        if (toolRef.current === "pen") {
          // ΖΩΓΡΑΦΙΣΜΑ - ΑΥΣΤΗΡΟΣ ΕΛΕΓΧΟΣ ΟΡΙΩΝ
          const EDGE_MARGIN = 15;
          const { top: canvasTop, bottom: canvasBottom, left: canvasLeft, right: canvasRight } = canvasLayoutRef.current;

          // Compute actual image bounds in screen coords (accounting for pan + scale)
          const s = scaleRef.current;
          const tx = lastPan.current.x;
          const ty = lastPan.current.y;
          const cx = width / 2;
          const cy = canvasHeightRef.current / 2;
          const imgLeft = canvasLeft + cx * (1 - s) + s * tx;
          const imgRight = canvasLeft + cx * (1 + s) + s * tx;
          const imgTop = canvasTop + cy * (1 - s) + s * ty;
          const imgBottom = canvasTop + cy * (1 + s) + s * ty;

          // Visible area = intersection of canvas (with 20px header/footer buffer) and image bounds
          const isOutsideVisible =
            pageX < Math.max(canvasLeft, imgLeft) || pageX > Math.min(canvasRight, imgRight) ||
            pageY < Math.max(canvasTop + 20, imgTop) || pageY > Math.min(canvasBottom - 20, imgBottom);

          if (isOutsideVisible) {
            // Το δάχτυλο είναι εκτός ορατής εικόνας - σταμάτα
            wasInBounds.current = false;
            return;
          }

          // Strict bounds check με locationX/Y
          const minX = EDGE_MARGIN;
          const maxX = width - EDGE_MARGIN;
          const minY = EDGE_MARGIN;
          const maxY = canvasHeightRef.current - EDGE_MARGIN;

          const isInBounds =
            locationX >= minX &&
            locationX <= maxX &&
            locationY >= minY &&
            locationY <= maxY;

          // Έλεγχος για wild values ή μεγάλα jumps
          const isWildValue =
            locationX < -20 ||
            locationX > width + 20 ||
            locationY < -20 ||
            locationY > canvasHeightRef.current + 50 ||
            Math.abs(locationX) > 2000 ||
            Math.abs(locationY) > 2000;

          // Έλεγχος για JUMP: αν η νέα θέση είναι πολύ μακριά από την τελευταία έγκυρη
          const distanceFromLast = Math.sqrt(
            Math.pow(locationX - lastValidPos.current.x, 2) +
            Math.pow(locationY - lastValidPos.current.y, 2)
          );
          const isJump = wasInBounds.current && distanceFromLast > 150; // >150px = jump

          if (isWildValue || isJump) {
            // Wild value ή jump - αγνόησε
            wasInBounds.current = false;
            return;
          }

          if (!isInBounds) {
            // Εκτός ορίων - σταμάτα να σχεδιάζεις
            wasInBounds.current = false;
            return;
          }

          // Μέσα στα όρια - σχεδίασε
          const needsNewSegment = !wasInBounds.current;
          wasInBounds.current = true;

          // Ενημέρωση τελευταίας έγκυρης θέσης
          lastValidPos.current = { x: locationX, y: locationY };

          setCurrentPath((prev) => {
            if (needsNewSegment) {
              // Μόλις γυρίσαμε στα όρια - ξεκίνα νέο segment
              return `${prev} M${locationX},${locationY}`;
            }
            // Συνέχισε τη γραμμή κανονικά
            return `${prev} L${locationX},${locationY}`;
          });
        } else {
          // ΜΕΤΑΚΙΝΗΣΗ (Framing) - ΟΜΑΛΗ ΕΚΔΟΣΗ
          // Υπολογίζουμε τη νέα θέση βασισμένοι στην παλιά + την κίνηση του δαχτύλου.
          // Διαιρούμε με το scaleRef.current για να μένει σταθερό στο zoom.
          // Διαιρούμε με το PAN_DAMPING για να μειώσουμε την ευαισθησία.
          const newX =
            lastPan.current.x +
            gestureState.dx / scaleRef.current / PAN_DAMPING;
          const newY =
            lastPan.current.y +
            gestureState.dy / scaleRef.current / PAN_DAMPING;

          // Ενημερώνουμε απευθείας τα Animated Values (ΔΕΝ προκαλεί re-render React)
          panX.setValue(newX);
          panY.setValue(newY);
        }
      },

      onPanResponderRelease: () => {
        if (toolRef.current === "pen") {
          setCurrentPath((prevPath) => {
            // Αποθήκευσε μόνο αν υπάρχει πραγματικό path (τουλάχιστον M και L)
            if (prevPath && prevPath.length > 15 && prevPath.includes("L")) {
              setPaths((prev) => [
                ...prev,
                {
                  d: prevPath,
                  color: colorRef.current,
                  width: widthRef.current,
                },
              ]);
            }
            return "";
          });
          wasInBounds.current = true;
        } else {
          // Μόλις αφήσει το δάχτυλο, αποθηκεύουμε την τελική θέση
          // για να ξεκινήσει από εκεί την επόμενη φορά.
          // (Χρησιμοποιούμε ένα 'hack' για να διαβάσουμε την τρέχουσα τιμή του animated value)
          lastPan.current.x = (panX as any)._value;
          lastPan.current.y = (panY as any)._value;
        }
      },

      // CRITICAL: Χειρισμός termination όταν το gesture ακυρώνεται
      // (π.χ. όταν το δάχτυλο πάει σε scrollable content ή άλλα UI elements)
      onPanResponderTerminate: () => {
        if (toolRef.current === "pen") {
          // Αποθήκευσε μόνο αν υπάρχει πραγματικό path
          setCurrentPath((prevPath) => {
            if (prevPath && prevPath.length > 15 && prevPath.includes("L")) {
              setPaths((prev) => [
                ...prev,
                {
                  d: prevPath,
                  color: colorRef.current,
                  width: widthRef.current,
                },
              ]);
            }
            return "";
          });
          wasInBounds.current = true;
        } else {
          // Για move tool, απλά αποθήκευσε την τελική θέση
          lastPan.current.x = (panX as any)._value;
          lastPan.current.y = (panY as any)._value;
        }
      },
    }),
  ).current;

  // --- ACTIONS ---
  const handleUndo = () => setPaths((prev) => prev.slice(0, -1));

  const handleClearAll = () => {
    setPaths([]);
    setScale(1);
    // Reset animated values
    panX.setValue(0);
    panY.setValue(0);
    lastPan.current = { x: 0, y: 0 };
    wasInBounds.current = true;
    lastValidPos.current = { x: 0, y: 0 };
  };

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.2, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.2, 1));

  const handleSave = async () => {
    if (viewShotRef.current && viewShotRef.current.capture) {
      try {
        const uri = await viewShotRef.current.capture();
        onSave(uri);
        // Reset μετά από λίγο
        setTimeout(() => {
          handleClearAll();
        }, 500);
      } catch (e) {
        console.log("Capture failed", e);
      }
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
              <Text style={{ color: "#ef4444", fontWeight: "bold" }}>
                Reset
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[
                styles.iconBtn,
                { backgroundColor: "#22c55e", borderRadius: 20, padding: 4 },
              ]}
            >
              <Ionicons name="checkmark" size={24} color="white" />
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
          style={{
            flex: 1,
            overflow: "hidden",
            backgroundColor: "#111",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <ViewShot
            ref={viewShotRef}
            options={{ format: "jpg", quality: 0.9 }}
            style={{
              width: width,
              height: measuredCanvasHeight,
              backgroundColor: "black",
              overflow: "hidden",
            }}
          >
            {/* Χρησιμοποιούμε Animated.View για τη μετακίνηση */}
            <Animated.View
              style={{
                width: "100%",
                height: "100%",
                transform: [
                  { scale: scale }, // Το Zoom παραμένει με state (είναι ΟΚ γιατί δεν είναι συνεχές gesture)
                  { translateX: panX }, // Η μετακίνηση Χ με Animated Value
                  { translateY: panY }, // Η μετακίνηση Y με Animated Value
                ],
              }}
            >
              <Image
                source={{ uri: imageUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
              />

              <View
                style={StyleSheet.absoluteFill}
                {...panResponder.panHandlers}
              >
                <Svg height="100%" width="100%">
                  {paths.map((p, index) => (
                    <Path
                      key={index}
                      d={p.d}
                      stroke={p.color}
                      strokeWidth={p.width / scale}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {currentPath ? (
                    <Path
                      d={currentPath}
                      stroke={selectedColor}
                      strokeWidth={selectedWidth / scale}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                </Svg>
              </View>
            </Animated.View>
          </ViewShot>

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
                style={[
                  styles.modeBtn,
                  activeTool === "move" && styles.modeBtnActive,
                ]}
              >
                <Ionicons
                  name="hand-left"
                  size={22}
                  color={activeTool === "move" ? "white" : "#999"}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTool("pen")}
                style={[
                  styles.modeBtn,
                  activeTool === "pen" && styles.modeBtnActive,
                ]}
              >
                <Ionicons
                  name="pencil"
                  size={22}
                  color={activeTool === "pen" ? "white" : "#999"}
                />
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
                        ? {
                            borderColor: "white",
                            borderWidth: 1,
                            backgroundColor: selectedColor,
                          }
                        : { backgroundColor: "#555" },
                    ]}
                  />
                ))}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.colorScroll}
              >
                {COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setSelectedColor(color)}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: color },
                      selectedColor === color && styles.selectedColor,
                    ]}
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

  modeSwitch: {
    flexDirection: "row",
    backgroundColor: "#222",
    borderRadius: 12,
    padding: 2,
  },
  modeBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 10 },
  modeBtnActive: { backgroundColor: "#3b82f6" },

  zoomControls: { flexDirection: "row", gap: 10, alignItems: "center" },
  zoomHint: {
    color: "#999",
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#333",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomText: { color: "white", fontSize: 24, fontWeight: "bold", marginTop: -2 },

  paintRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 5,
  },
  strokeSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 15,
  },
  strokeOption: {},
  colorScroll: { alignItems: "center", gap: 12 },
  colorCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "transparent",
  },
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
