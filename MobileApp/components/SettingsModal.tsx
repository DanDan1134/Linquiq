/**
 * SettingsModal — standard top-nav-bar layout (title + close at the top,
 * content below). Explicit safe-area insets; no SafeAreaView inside Modal.
 */
import React, { useMemo } from "react";
import {
  Alert,
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import "../global.css";

const BG = "#2A2E3E";
const ACCENT = "#D7827E";

interface SettingsModalProps {
  isVisible: boolean;
  onClose: () => void;
  onLogout: () => void;
  accountLabel?: string | null;
}

function useGutter() {
  const { width } = useWindowDimensions();
  return useMemo(() => {
    if (width < 360) return 16;
    if (width < 420) return 20;
    return 24;
  }, [width]);
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isVisible,
  onClose,
  onLogout,
  accountLabel,
}) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gutter = useGutter();

  const confirmLogout = () => {
    Alert.alert(
      "Log out?",
      accountLabel
        ? `You are signed in as:\n${accountLabel}`
        : "Are you sure you want to log out?",
      [
        { text: "No", style: "cancel" },
        { text: "Yes", style: "destructive", onPress: onLogout },
      ]
    );
  };

  const displayEmail =
    accountLabel && String(accountLabel).trim().length > 0
      ? String(accountLabel).trim()
      : null;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <StatusBar style="light" />

        {/* ── Nav bar ── respects status-bar / notch height */}
        <View
          style={[
            styles.navbar,
            {
              paddingTop: Math.max(insets.top, 12) + 8,
              paddingHorizontal: gutter,
            },
          ]}
        >
          <Text style={styles.navTitle} numberOfLines={1}>
            Settings
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityLabel="Close settings"
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && styles.closeBtnPressed,
            ]}
          >
            <FontAwesomeIcon icon={faXmark} size={20} color="white" />
          </Pressable>
        </View>

        {/* ── Content ── */}
        <View style={[styles.content, { paddingHorizontal: gutter, maxWidth: Math.min(540, width) }]}>
          {/* Section label */}
          <Text style={styles.sectionLabel}>Account</Text>

          {/* Email row — fixed height so nothing shifts */}
          <View style={styles.accountRow}>
            <Text style={styles.accountMeta}>Signed in as</Text>
            <Text
              style={[styles.accountEmail, !displayEmail && styles.invisible]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {displayEmail ?? " "}
            </Text>
          </View>

          {/* Log out */}
          <Pressable
            onPress={confirmLogout}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [
              styles.logoutBtn,
              pressed && styles.logoutPressed,
            ]}
          >
            <Text style={styles.logoutLabel}>Log Out</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  // Standard mobile top nav bar
  navbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    gap: 8,
  },
  navTitle: {
    flex: 1,
    color: ACCENT,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  // 44×44 minimum touch target (Apple HIG / Material)
  closeBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  closeBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  content: {
    marginTop: 32,
    alignSelf: "center",
    width: "100%",
  },
  sectionLabel: {
    color: "#D1D5DB",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  accountRow: {
    backgroundColor: "#3A3F52",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    minHeight: 68,
    justifyContent: "center",
  },
  accountMeta: {
    color: "#9CA3AF",
    fontSize: 11,
    marginBottom: 4,
  },
  accountEmail: {
    color: "#fff",
    fontSize: 15,
  },
  invisible: {
    opacity: 0,
  },
  logoutBtn: {
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutPressed: {
    opacity: 0.8,
  },
  logoutLabel: {
    color: ACCENT,
    fontSize: 16,
    fontWeight: "600",
  },
});
