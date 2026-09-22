/**
 * BottomNavigation Component
 *
 * Bottom action bar with 4 circular buttons:
 * - Note: Opens note creation modal
 * - Attachment: Opens file picker
 * - Microphone: Audio recording
 * - Camera: Photo capture
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { FontAwesomeIcon } from "./AppIcon";
import { faFileLines } from "@fortawesome/free-solid-svg-icons";
import { faPaperclip } from "@fortawesome/free-solid-svg-icons";
import { faMicrophone } from "@fortawesome/free-solid-svg-icons";
import { faCamera } from "@fortawesome/free-solid-svg-icons";
import { AppPressable } from "./AppPressable";
import "../global.css";

interface BottomNavigationProps {
  onNotePress: () => void;
  onAttachmentPress: () => void;
  onMicrophonePress: () => void;
  onCameraPress: () => void;
  isRecording?: boolean;
  /** Seconds elapsed in the current recording. */
  recordingTime?: number;
  /** Mic is starting or stopping — dims the button so the first tap reads as handled. */
  isMicBusy?: boolean;
}

/** Vertical-only slop; columns already fill width so side slop would overlap neighbors. */
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  onNotePress,
  onAttachmentPress,
  onMicrophonePress,
  onCameraPress,
  isRecording = false,
  recordingTime = 0,
  isMicBusy = false,
}) => {
  const micCircleClass = isRecording
    ? "bg-red-600 border-red-600"
    : "bg-button-outline border-button-outline";

  return (
    <View style={styles.bar} className="px-4 py-3 flex-row justify-around items-center">
      <AppPressable
        fillParent
        onPress={onNotePress}
        accessibilityRole="button"
        accessibilityLabel="Write a note"
        className="w-16 h-16 border-2 bg-button-outline border-button-outline rounded-full items-center justify-center"
      >
        <FontAwesomeIcon icon={faFileLines} size={20} color="black" />
      </AppPressable>

      <AppPressable
        fillParent
        onPress={onAttachmentPress}
        accessibilityRole="button"
        accessibilityLabel="Upload a file or image"
        className="w-16 h-16 border-2 bg-button-outline border-button-outline rounded-full items-center justify-center"
      >
        <FontAwesomeIcon icon={faPaperclip} size={20} color="black" />
      </AppPressable>

      <AppPressable
        fillParent
        onPress={onMicrophonePress}
        accessibilityRole="button"
        accessibilityLabel={isRecording ? "Stop recording" : "Start recording"}
        style={isMicBusy ? styles.micBusy : undefined}
        className={`w-16 h-16 border-2 rounded-full items-center justify-center ${micCircleClass}`}
      >
        {isRecording ? (
          <Text style={styles.recordingTime} className="text-slate-400 text-xs">
            {formatTime(recordingTime)}
          </Text>
        ) : null}
        <FontAwesomeIcon
          icon={faMicrophone}
          size={20}
          color={isRecording ? "white" : "black"}
        />
      </AppPressable>

      <AppPressable
        fillParent
        onPress={onCameraPress}
        accessibilityRole="button"
        accessibilityLabel="Take a photo"
        className="w-16 h-16 border-2 bg-button-outline border-button-outline rounded-full items-center justify-center"
      >
        <FontAwesomeIcon icon={faCamera} size={20} color="black" />
      </AppPressable>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    zIndex: 30,
    elevation: 30,
  },
  recordingTime: {
    position: "absolute",
    top: -20,
    alignSelf: "center",
  },
  micBusy: {
    opacity: 0.55,
  },
});
