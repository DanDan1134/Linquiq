import React from "react";
import { View, Text } from "react-native";
import { OFFLINE_PREVIEW_MESSAGE } from "../utils/helpers";

/** Immediate offline notice for image/PDF (no loading spinner). */
export function OfflinePreviewNotice({ compact }: { compact?: boolean }) {
  return (
    <View
      style={{
        width: "100%",
        borderRadius: 12,
        backgroundColor: "#1F2937",
        padding: compact ? 12 : 16,
        marginBottom: compact ? 8 : 4,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          color: "#F9FAFB",
          textAlign: "center",
          lineHeight: 22,
          fontSize: compact ? 14 : 15,
        }}
      >
        {OFFLINE_PREVIEW_MESSAGE}
      </Text>
    </View>
  );
}
