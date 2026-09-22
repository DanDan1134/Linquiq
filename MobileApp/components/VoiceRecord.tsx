/**
 * VoiceRecord Hook
 *
 * - Countdown, start/stop, duration tracking
 * - Returns a FileItem that matches the shape your app expects
 * - Ensures unique .mp3 filename and correct creator email
 */
import { useState, useRef, useEffect } from "react";
import { Alert } from "react-native";
import { Audio } from "expo-av";
import { formatDateTime } from "../utils/helpers";
import {
  ensureMicrophonePermission,
  enterRecordingAudioMode,
  exitRecordingAudioMode,
} from "../utils/permissions";
import { track } from "../utils/perfLog";
import { logSafeError, logSafeWarn } from "../utils/safeLog";

export type FileItem = {
  id: number;
  name: string;
  date: string;
  type: string;
  typeColor: string;
  number: string;
  createdAt: string;
  creator: string;
  url: string;
  /** Added so App.tsx can read recordingItem?.uri without type errors */
  uri?: string;
  content: string;
  durationMs?: number;
  mediaType?: string;
};

interface VoiceRecordProps {
  onRecordingSaved: (recordingItem: FileItem) => void;
  defaultFiles: FileItem[];
  bundles: FileItem[];
  notes: FileItem[];
  currentUserEmail?: string;
  /** Countdown seconds before auto-start (0 to start immediately) */
  recordingDuration?: number;
}

/** Small helper to produce a short random id */
function shortId(len = 4) {
  return Math.random().toString(16).slice(2, 2 + len);
}

/** Builds a unique, human-friendly .mp3 filename */
function buildUniqueMp3Name(now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const sid = shortId();
  return `voice_${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}_${sid}.mp3`;
}

export const useVoiceRecord = ({
  onRecordingSaved,
  defaultFiles,
  bundles,
  notes,
  currentUserEmail,
  recordingDuration = 60,
}: VoiceRecordProps) => {
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [isAudioRequesting, setIsAudioRequesting] = useState(false);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(recordingDuration);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const isPreparingRef = useRef<boolean>(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsCountdownActive(false);
    setCountdownSeconds(recordingDuration);
  };

  const beginCountdown = () => {
    if (isCountdownActive || isRecordingActive) return;
    setIsCountdownActive(true);
    setCountdownSeconds(recordingDuration);
    countdownIntervalRef.current = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearCountdown();
          startRecordingAsync();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startRecordingAsync = async () => {
    if (isAudioRequesting || isRecordingActive || isPreparingRef.current) return;
    setIsAudioRequesting(true);
    isPreparingRef.current = true;
    const t = track("START RECORDING");
    try {
      const allowed = await ensureMicrophonePermission();
      if (!allowed) {
        t.fail("microphone not allowed");
        Alert.alert("Permission required", "Microphone permission is needed to record audio.");
        return;
      }
      t.step("microphone allowed");

      await enterRecordingAudioMode();
      t.step("audio session ready");

      const recording = new Audio.Recording();
      // Use custom options to try to get MP3 format
      // Note: iOS will always be m4a, but Android might support MP3 with different settings
      await recording.prepareToRecordAsync({
        android: {
          extension: '.mp3',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a', // iOS limitation - cannot record as MP3 natively
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MEDIUM,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        web: {
          mimeType: 'audio/mpeg',
          bitsPerSecond: 128000,
        },
      });
      t.step("recorder prepared");
      await recording.startAsync();

      recordingRef.current = recording;
      setRecordingElapsed(0);
      setIsRecordingActive(true);
      t.done("now recording");
    } catch (err) {
      t.fail("could not start", err);
      logSafeError("Failed to start recording", err);
      Alert.alert("Error", "Failed to start recording.");
    } finally {
      setIsAudioRequesting(false);
      isPreparingRef.current = false;
      setCountdownSeconds(recordingDuration);
    }
  };

  const stopRecordingAsync = async () => {
    if (!recordingRef.current) {
      setIsRecordingActive(false);
      setRecordingElapsed(0);
      setCountdownSeconds(recordingDuration);
      return;
    }
    const activeRecording = recordingRef.current;
    recordingRef.current = null;
    setIsAudioRequesting(true);
    const t = track("STOP RECORDING");

    try {
      await activeRecording.stopAndUnloadAsync();
      t.step("recorder closed");
      await exitRecordingAudioMode();

      // Try to compute duration (best‑effort)
      let durationMs = 0;
      try {
        const { sound, status } = await activeRecording.createNewLoadedSoundAsync();
        durationMs = (status as any)?.durationMillis ?? 0;
        await sound.unloadAsync();
      } catch (soundErr) {
        logSafeWarn("Failed to compute recording duration", soundErr);
      }
      t.step("length measured");

      const uri = activeRecording.getURI() ?? "";
      const now = new Date();
      const formattedDate = formatDateTime(now);
      const timestampISO = now.toISOString();
      const referenceNumber = (
        defaultFiles.length + bundles.length + notes.length + 241
      ).toString();

      // Build a unique .mp3 filename for verify()
      const uniqueName = buildUniqueMp3Name(now);

      const newRecordingItem: FileItem = {
        id: now.getTime(),
        name: uniqueName,            // e.g., voice_2025-11-12_18-55-03_ab12.mp3
        date: formattedDate,
        type: "Audio",               // show as Audio in your UI / filters
        typeColor: "red",
        number: referenceNumber,
        createdAt: timestampISO,
        creator: currentUserEmail ?? "me",
        url: uri,                    // local file:// URI (used by upload step in App.tsx)
        uri,                         // added for compatibility with App.tsx (recordingItem?.uri)
        content: "",
        durationMs,
        mediaType: "audio",
      };

      t.done(`${Math.round(durationMs / 1000)}s clip handed to the app`);
      onRecordingSaved?.(newRecordingItem);
    } catch (err) {
      t.fail("could not save", err);
      logSafeError("Failed to stop recording", err);
      Alert.alert("Error", "Failed to save the recording.");
    } finally {
      setIsRecordingActive(false);
      setRecordingElapsed(0);
      setCountdownSeconds(recordingDuration);
      setIsAudioRequesting(false);
    }
  };

  const cancelCountdown = () => {
    clearCountdown();
  };

  const handleMicrophonePress = async () => {
    if (isAudioRequesting) return;

    if (isRecordingActive) {
      await stopRecordingAsync();
      return;
    }
    if (isCountdownActive) {
      cancelCountdown();
      return;
    }
    if (recordingDuration <= 0) {
      await startRecordingAsync();
      return;
    }
    beginCountdown();
  };

  useEffect(() => {
    if (isRecordingActive) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingElapsed((prev) => Number((prev + 0.1).toFixed(1)));
      }, 100);
    } else if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [isRecordingActive]);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (recordingRef.current) {
        try {
          recordingRef.current.stopAndUnloadAsync();
        } catch (err) {
          logSafeWarn("Failed to cleanup recording on unmount", err);
        }
      }
    };
  }, []);

  return {
    handleMicrophonePress,
    isRecordingActive,
    isCountdownActive,
    countdownSeconds,
    recordingElapsed,
    isAudioRequesting,
  };
};

export const VoiceRecord = useVoiceRecord;