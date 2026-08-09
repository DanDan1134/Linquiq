import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";

/**
 * Shown where a preview should be.
 *
 * For the first few seconds it is just an empty card — most previews arrive in
 * that window, and a spinner there only makes a fast load look slow. The
 * explanatory message appears once the wait is long enough to be a real
 * problem.
 */
export function PreviewFallbackBanner({
  message,
  timeoutMs = 6_000,
}: {
  message: string;
  timeoutMs?: number;
}) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [message, timeoutMs]);

  return (
    <View style={styles.card}>
      {timedOut ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: "#1F2937",
    padding: 16,
    marginBottom: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: "#F9FAFB",
    textAlign: "center",
    lineHeight: 22,
    fontSize: 15,
  },
});
