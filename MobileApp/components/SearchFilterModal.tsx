import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

export type SubmissionTimeFilter = "all" | "24h" | "7d" | "30d";

export type SearchFilters = {
  pdf: boolean;
  audio: boolean;
  images: boolean;
  link: boolean;
  notes: boolean;
};

interface SearchFilterModalProps {
  visible: boolean;
  filters: SearchFilters;
  submissionTime: SubmissionTimeFilter;
  onToggleFilter: (key: keyof SearchFilters) => void;
  onSubmissionTimeChange: (value: SubmissionTimeFilter) => void;
  onReset: () => void;
  onClose: () => void;
}

const FILTER_LABELS: Record<keyof SearchFilters, string> = {
  pdf: "PDF Documents",
  audio: "Audio Files",
  images: "Images & Uploads",
  link: "linqs",
  notes: "Notes",
};

const SUBMISSION_TIME_OPTIONS: { value: SubmissionTimeFilter; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export function SearchFilterModal({
  visible,
  filters,
  submissionTime,
  onToggleFilter,
  onSubmissionTimeChange,
  onReset,
  onClose,
}: SearchFilterModalProps) {
  const activeContentFilterCount = Object.values(filters).filter(Boolean).length;
  const hasAnyFilterApplied =
    activeContentFilterCount > 0 || submissionTime !== "all";

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdropContainer}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={onReset}
                style={[styles.headerResetButton, !hasAnyFilterApplied && styles.headerResetButtonDisabled]}
                disabled={!hasAnyFilterApplied}
              >
                <Text
                  style={[
                    styles.headerResetText,
                    !hasAnyFilterApplied && styles.headerResetTextDisabled,
                  ]}
                >
                  Reset
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeButton}
                delayPressIn={0}
                accessibilityRole="button"
                accessibilityLabel="Close filters"
              >
                <FontAwesomeIcon icon={faXmark} size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Content Type</Text>
            {Object.entries(FILTER_LABELS).map(([key, label]) => {
              const typedKey = key as keyof SearchFilters;
              const active = filters[typedKey];
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => onToggleFilter(typedKey)}
                  style={[styles.filterRow, active && styles.filterRowActive]}
                >
                  <Text
                    style={[styles.filterLabel, active && styles.filterLabelActive]}
                  >
                    {label}
                  </Text>
                  {active ? (
                    <FontAwesomeIcon icon={faCheck} size={14} color="#D7827E" />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Time Submitted</Text>
            <View style={styles.chipGroup}>
              {SUBMISSION_TIME_OPTIONS.map((option) => {
                const active = submissionTime === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => onSubmissionTimeChange(option.value)}
                    style={[styles.timeChip, active && styles.timeChipActive]}
                  >
                    <Text
                      style={[styles.timeChipLabel, active && styles.timeChipLabelActive]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.footerRow}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.applyButton}
            >
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  sheet: {
    backgroundColor: "#2A2E3E", // App background color from tailwind config
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.select({ ios: 32, android: 24, default: 24 }),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 12,
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerResetButton: {
    backgroundColor: "#D7827E",
    borderRadius: 999,
    minHeight: 48,
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  headerResetButtonDisabled: {
    backgroundColor: "#3A3F52",
  },
  headerResetText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  headerResetTextDisabled: {
    color: "#94a3b8",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff", // White text to match app theme
  },
  closeButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3A3F52", // Card background color from tailwind config
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94a3b8", // Light slate text for labels
    marginBottom: 12,
  },
  filterRow: {
    borderWidth: 1,
    borderColor: "#3A3F52", // Card background color for border
    borderRadius: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    backgroundColor: "#3A3F52", // Card background color
  },
  filterRowActive: {
    borderColor: "#D7827E", // Button outline color (salmon/coral)
    backgroundColor: "#4A4F62", // Slightly lighter when active
  },
  filterLabel: {
    fontSize: 14,
    color: "#f1f5f9", // Light text
  },
  filterLabelActive: {
    fontWeight: "600",
    color: "#ffffff", // White text when active
  },
  chipGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  timeChip: {
    borderWidth: 1,
    borderColor: "#3A3F52", // Card background color for border
    borderRadius: 999,
    minHeight: 48,
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#3A3F52", // Card background color
  },
  timeChipActive: {
    backgroundColor: "#D7827E", // Button outline color (salmon/coral)
    borderColor: "#D7827E",
  },
  timeChipLabel: {
    fontSize: 13,
    color: "#cbd5e1", // Light slate text
  },
  timeChipLabelActive: {
    color: "#ffffff", // White text when active
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  applyButton: {
    minHeight: 52,
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 22,
    backgroundColor: "#D7827E", // Button outline color (salmon/coral)
    borderRadius: 12,
  },
  applyText: {
    fontSize: 14,
    color: "#ffffff", // White text
    fontWeight: "600",
  },
});
