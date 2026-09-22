/**
 * NoteModal Component
 *
 * Minimal compose bar (iMessage-style): a single rounded text field that
 * dynamically grows with content, docked just above the keyboard, sitting on
 * a darker translucent toolbar panel so it reads clearly over whatever is
 * behind it. No card, no separate "Note" label/section, no explicit close
 * button — tapping anywhere on the dimmed backdrop cancels. The filename is
 * derived from the body on save (web Linquiq behavior).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  type TextInput as RNTextInput,
  type KeyboardEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontAwesomeIcon } from "./AppIcon";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import "../global.css";

interface NoteModalProps {
  isVisible: boolean;
  noteText: string;
  onNoteTextChange: (text: string) => void;
  onClose: () => void;
  onSave: () => void;
}

const MIN_INPUT_HEIGHT = 22;
/** Cap the field at roughly 7-8 lines — past this it scrolls internally instead of pushing the whole bar (and screen) taller. */
const MAX_INPUT_HEIGHT = 160;

const OPEN_MS = 200;
const CLOSE_MS = 30;
const RISE_PX = 8;
const GAP_ABOVE_KEYBOARD = 10;

export const NoteModal: React.FC<NoteModalProps> = ({
  isVisible,
  noteText,
  onNoteTextChange,
  onClose,
  onSave,
}) => {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const barOpacity = useRef(new Animated.Value(1)).current;
  const barRise = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(1)).current;
  const closingRef = useRef(false);
  const inputRef = useRef<RNTextInput>(null);

  // Lift the bar with the keyboard height. KeyboardAvoidingView inside a
  // transparent Modal is unreliable on iOS — the field ends up under the keyboard.
  useEffect(() => {
    if (!isVisible) {
      setKeyboardHeight(0);
      return;
    }

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    };
    const onHide = () => setKeyboardHeight(0);

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) {
      closingRef.current = false;
      barOpacity.setValue(1);
      barRise.setValue(0);
      backdropOpacity.setValue(1);
      return;
    }

    closingRef.current = false;
    // Always show chrome immediately. Opacity-0 open + native driver inside a
    // Modal left users with only the keyboard. Keep a tiny rise for feel.
    barOpacity.setValue(1);
    backdropOpacity.setValue(1);
    barRise.setValue(RISE_PX);
    Animated.timing(barRise, {
      toValue: 0,
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [isVisible, barOpacity, barRise, backdropOpacity]);

  const animateClose = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(barOpacity, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(barRise, {
        toValue: RISE_PX,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) after?.();
      else closingRef.current = false;
    });
  };

  const handleClose = () => {
    inputRef.current?.blur();
    animateClose(onClose);
  };

  const handleSave = () => {
    if (!noteText.trim()) return;
    inputRef.current?.blur();
    animateClose(onSave);
  };

  const canSend = noteText.trim().length > 0;
  const bottomPad =
    keyboardHeight > 0
      ? keyboardHeight + GAP_ABOVE_KEYBOARD
      : insets.bottom + GAP_ABOVE_KEYBOARD;

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <Animated.View
          style={[styles.backdropFill, { opacity: backdropOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.barOuter,
            {
              paddingBottom: bottomPad,
              opacity: barOpacity,
              transform: [{ translateY: barRise }],
            },
          ]}
        >
          <View style={styles.barPanel}>
            <View
              style={[
                styles.inputWrap,
                { maxHeight: MAX_INPUT_HEIGHT + 20 },
              ]}
            >
              <TextInput
                ref={inputRef}
                placeholder="Note"
                placeholderTextColor="#9CA3AF"
                value={noteText}
                onChangeText={onNoteTextChange}
                className="text-white text-base"
                multiline
                scrollEnabled
                autoFocus
                style={styles.input}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.sendSlot}>
              <TouchableOpacity
                onPress={handleSave}
                disabled={!canSend}
                className="items-center justify-center rounded-full"
                style={[
                  styles.sendButton,
                  { backgroundColor: canSend ? "#D7827E" : "#3F3F46" },
                ]}
                delayPressIn={0}
                accessibilityRole="button"
                accessibilityLabel="Save note"
                accessibilityState={{ disabled: !canSend }}
              >
                <FontAwesomeIcon
                  icon={faArrowUp}
                  size={16}
                  color={canSend ? "#111827" : "#6B7280"}
                />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
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
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  barOuter: {
    paddingHorizontal: 8,
  },
  // Darker, slightly transparent toolbar panel behind the field so the note
  // stands out from the (already dimmed) content underneath — same idea as
  // iMessage's compose toolbar sitting on its own surface above the thread.
  barPanel: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "rgba(20, 20, 22, 0.82)",
    borderRadius: 22,
    padding: 6,
    gap: 6,
  },
  inputWrap: {
    flex: 0.85,
    backgroundColor: "#3A3A3C",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    overflow: "hidden",
  },
  // minHeight/maxHeight (not a fixed `height` driven by state) let the native
  // TextInput grow itself as lines are added, then scroll internally once it
  // hits the max. Tying `height` to onContentSizeChange causes a feedback loop
  // on Android — it measures the already-clipped view, so it never grows past
  // the initial size.
  input: {
    padding: 0,
    margin: 0,
    minHeight: MIN_INPUT_HEIGHT,
    maxHeight: MAX_INPUT_HEIGHT,
  },
  sendSlot: {
    flex: 0.15,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  sendButton: {
    width: 44,
    height: 44,
  },
});
