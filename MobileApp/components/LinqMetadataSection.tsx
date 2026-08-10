import React, { useState } from "react";
import { View, Text, TouchableOpacity, Clipboard, StyleSheet } from "react-native";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faCopy, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import {
  getLinqDetailFields,
  getFilePreviewUrl,
  getFilePreviewUrlLabel,
  isFilePreviewUrlLive,
} from "../utils/helpers";
import { openHttpUrl } from "../utils/openHttpUrl";

type BaseLinqProps = {
  id?: string | null;
  createdAt?: string | number | Date | null;
  date?: string | null;
  creator?: string | null;
};

/** Label column width — keeps every value left-aligned in the dense layout. */
const LABEL_WIDTH = 62;

/**
 * One `Label  value` line.
 *
 * Label and value share a row rather than stacking, which is what keeps the
 * whole details block short enough to stay out of the preview's way.
 */
export function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  if (!String(value ?? "").trim()) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Shows `https://…/preview/{id}` whenever an id exists.
 * Live (server) ids are tappable; pending opt- ids show the same URL as plain text.
 */
function MetadataUrlRow({ fileId }: { fileId?: string | null }) {
  const [copied, setCopied] = useState(false);
  const id = String(fileId ?? "").trim();
  if (!id) return null;

  const urlLabel = getFilePreviewUrlLabel(id);
  const liveUrl = getFilePreviewUrl(id);
  const isLive = isFilePreviewUrlLive(id);

  const handleCopy = () => {
    const toCopy = liveUrl || urlLabel;
    if (!toCopy) return;
    Clipboard.setString(toCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.label}>Link</Text>
      {isLive && liveUrl ? (
        <>
          <TouchableOpacity
            onPress={() => void openHttpUrl(liveUrl)}
            activeOpacity={0.75}
            accessibilityRole="link"
            accessibilityLabel={`Open ${liveUrl}`}
            style={styles.linkTouch}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 0 }}
          >
            <Text style={styles.link} numberOfLines={1} ellipsizeMode="tail">
              {liveUrl}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCopy}
            hitSlop={{ top: 6, bottom: 6, left: 0, right: 6 }}
            accessibilityLabel="Copy file link"
            accessibilityRole="button"
            style={styles.copyButton}
          >
            <FontAwesomeIcon
              icon={faCopy}
              size={14}
              color={copied ? "#86EFAC" : "#9CA3AF"}
            />
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.value} numberOfLines={1} ellipsizeMode="tail" selectable>
          {urlLabel}
        </Text>
      )}
    </View>
  );
}

/** Dense metadata body shared by files and linqs. */
function MetadataBody(props: BaseLinqProps & { displayName?: string }) {
  const { displayName, ...rest } = props;
  const f = getLinqDetailFields(rest);
  return (
    <View style={styles.body}>
      {displayName ? <MetadataRow label="Name" value={displayName} /> : null}
      <MetadataRow label="Created" value={f.created} />
      <MetadataRow label="Creator" value={f.creator} />
      <MetadataUrlRow fileId={rest.id} />
      <MetadataRow label="File ID" value={f.fileId} />
      <MetadataRow label="UTC" value={f.utc} />
    </View>
  );
}

/**
 * Collapsed-by-default details panel.
 *
 * The summary line carries the two facts people actually scan for (date and
 * type); everything else stays one tap away so previews open near the top of
 * the sheet instead of below a screen of labels.
 */
export function CollapsibleFileDetails({
  summary,
  displayName,
  defaultExpanded = false,
  ...rest
}: BaseLinqProps & {
  /** Short line shown while collapsed, e.g. "Image · 5/3/2026, 11:09 AM". */
  summary: string;
  displayName?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={styles.panel}>
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        style={styles.summaryRow}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? "Hide file details" : "Show file details"}
      >
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
        </Text>
        <View style={styles.summaryAction}>
          <Text style={styles.summaryActionText}>
            {expanded ? "Less" : "Details"}
          </Text>
          <FontAwesomeIcon
            icon={expanded ? faChevronUp : faChevronDown}
            size={10}
            color="#9CA3AF"
          />
        </View>
      </TouchableOpacity>
      {expanded ? <MetadataBody displayName={displayName} {...rest} /> : null}
    </View>
  );
}

/** Always-expanded metadata for linqs (used where there is no preview to protect). */
export function LinqMetadataSection(props: BaseLinqProps) {
  return <MetadataBody {...props} />;
}

/** Always-expanded metadata for a single file. */
export function StandardFileMetadataSection(
  props: BaseLinqProps & { displayName: string; compact?: boolean }
) {
  const { compact: _compact, ...rest } = props;
  return <MetadataBody {...rest} />;
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 10,
    backgroundColor: "rgba(31, 41, 55, 0.45)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 26,
  },
  summary: {
    color: "#D1D5DB",
    fontSize: 12,
    flexShrink: 1,
    marginRight: 8,
  },
  summaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  summaryActionText: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "500",
  },
  body: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#374151",
    paddingTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  label: {
    width: LABEL_WIDTH,
    color: "#9CA3AF",
    fontSize: 11,
  },
  value: {
    flex: 1,
    color: "#E5E7EB",
    fontSize: 12,
  },
  linkTouch: {
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  link: {
    color: "#60A5FA",
    fontSize: 12,
    textDecorationLine: "underline",
  },
  copyButton: {
    marginLeft: 8,
    padding: 2,
  },
});
