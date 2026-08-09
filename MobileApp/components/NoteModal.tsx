/**
 * NoteModal Component
 *
 * Single free-form body (plain text; paste may include HTML-like text).
 * Filename is derived on save (web Linquiq behavior) — no separate title field.
 *
 * Custom spring slide-up + backdrop fade (smoother than Modal animationType="slide").
 */
import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Animated,
  Easing,
} from "react-native";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import "../global.css";

interface NoteModalProps {
  isVisible: boolean;
  noteText: string;
  onNoteTextChange: (text: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export const NoteModal: React.FC<NoteModalProps> = ({
  isVisible,
  noteText,
  onNoteTextChange,
  onClose,
  onSave,
}) => {
  const { height } = useWindowDimensions();
  const sheetMaxHeight = Platform.OS === "ios" ? height * 0.72 : undefined;

  const sheetY = useRef(new Animated.Value(height)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);

  useEffect(() => {
    if (!isVisible) {
      sheetY.setValue(height);
      backdropOpacity.setValue(0);
      closingRef.current = false;
      return;
    }
    closingRef.current = false;
    sheetY.setValue(Math.min(height * 0.35, 280));
    backdropOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(sheetY, {
        toValue: 0,
        damping: 26,
        stiffness: 280,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isVisible, height, sheetY, backdropOpacity]);

  const animateClose = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheetY, {
        toValue: Math.min(height * 0.4, 320),
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) after?.();
      else closingRef.current = false;
    });
  };

  const handleClose = () => animateClose(onClose);

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.modalRoot}
        keyboardVerticalOffset={0}
      >
        <Animated.View
          pointerEvents="box-none"
          style={[styles.backdropFill, { opacity: backdropOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheetWrapper,
            { transform: [{ translateY: sheetY }] },
          ]}
        >
          <View
            className="bg-background px-4 py-4"
            style={[
              styles.sheet,
              sheetMaxHeight ? { maxHeight: sheetMaxHeight } : null,
            ]}
          >
            <View className="flex-row justify-end items-center mb-3">
              <TouchableOpacity
                onPress={handleClose}
                className="rounded-full items-center justify-center"
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                delayPressIn={0}
                accessibilityRole="button"
                accessibilityLabel="Close note"
              >
                <FontAwesomeIcon icon={faXmark} size={20} color="white" />
              </TouchableOpacity>
            </View>

            <Text className="text-gray-400 text-sm mb-2">Note</Text>
            <View className="bg-gray-600 rounded-lg px-4 py-3 mb-4">
              <TextInput
                placeholder="Write your note…"
                placeholderTextColor="#9CA3AF"
                value={noteText}
                onChangeText={onNoteTextChange}
                className="text-white text-base"
                multiline
                autoFocus
                style={{ minHeight: 140, maxHeight: 280 }}
                textAlignVertical="top"
              />
            </View>

            <View className="flex-row justify-end">
              <TouchableOpacity
                className="bg-button-outline rounded-lg px-5 items-center justify-center"
                style={styles.saveButton}
                onPress={onSave}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                delayPressIn={0}
                accessibilityRole="button"
              >
                <Text className="text-black font-semibold text-sm">
                  Save Note
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  sheetWrapper: {
    width: "100%",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: Platform.OS === "ios" ? 12 : 0,
  },
  closeButton: {
    width: 56,
    height: 56,
  },
  saveButton: {
    minHeight: 44,
  },
});
