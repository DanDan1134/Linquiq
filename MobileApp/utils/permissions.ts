/**
 * Permission + native-module warm-up.
 *
 * The "first tap does nothing" reports come from work that only happens on the
 * very first press: loading the native module, checking permission status, and
 * (on iOS) configuring the audio session. Each is a native round trip, so the
 * first tap spends its time there instead of on the action the user wanted.
 *
 * `prewarmCaptureModules` runs those round trips once after the home screen
 * mounts, and the results are cached here so later taps act immediately.
 * Nothing in this file shows a permission dialog — only `ensure*` does, and it
 * is called from a real user tap so the prompt still has context.
 */
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { track } from "./perfLog";

let mediaLibraryGranted: boolean | null = null;
let microphoneGranted: boolean | null = null;
let recordingAudioModeReady = false;
let prewarmStarted = false;

/** Audio session used while recording. Must be re-applied before each record. */
const RECORDING_AUDIO_MODE = {
  allowsRecordingIOS: true,
  playsInSilentModeIOS: true,
  interruptionModeIOS: InterruptionModeIOS.DoNotMix,
  interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
  shouldDuckAndroid: true,
  staysActiveInBackground: false,
  playThroughEarpieceAndroid: false,
} as const;

/** Audio session used for playback once recording stops. */
export const PLAYBACK_AUDIO_MODE = {
  ...RECORDING_AUDIO_MODE,
  allowsRecordingIOS: false,
} as const;

/**
 * Check (never request) permissions and load the native audio module so the
 * first mic / photo tap is not the thing that pays for it.
 */
export async function prewarmCaptureModules(): Promise<void> {
  if (prewarmStarted) return;
  prewarmStarted = true;

  const t = track("WARM UP", "camera roll + mic");
  await Promise.all([
    ImagePicker.getMediaLibraryPermissionsAsync()
      .then((p) => {
        mediaLibraryGranted = p.granted;
      })
      .catch(() => undefined),
    Audio.getPermissionsAsync()
      .then((p) => {
        microphoneGranted = p.granted;
      })
      .catch(() => undefined),
  ]);
  t.done(
    `photos ${mediaLibraryGranted ? "allowed" : "not yet"} · mic ${
      microphoneGranted ? "allowed" : "not yet"
    }`
  );
}

/** True when the photo library can be opened. Prompts only if status unknown. */
export async function ensureMediaLibraryPermission(): Promise<boolean> {
  if (mediaLibraryGranted) return true;
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) {
    mediaLibraryGranted = true;
    return true;
  }
  if (!current.canAskAgain) {
    mediaLibraryGranted = false;
    return false;
  }
  const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
  mediaLibraryGranted = asked.granted;
  return asked.granted;
}

/** True when the mic can be used. Prompts only if status unknown. */
export async function ensureMicrophonePermission(): Promise<boolean> {
  if (microphoneGranted) return true;
  const current = await Audio.getPermissionsAsync();
  if (current.granted) {
    microphoneGranted = true;
    return true;
  }
  if (!current.canAskAgain) {
    microphoneGranted = false;
    return false;
  }
  const asked = await Audio.requestPermissionsAsync();
  microphoneGranted = asked.granted;
  return asked.granted;
}

/**
 * Put the audio session into recording mode.
 * Skipped when already applied and not invalidated by playback.
 */
export async function enterRecordingAudioMode(): Promise<void> {
  if (recordingAudioModeReady) return;
  await Audio.setAudioModeAsync(RECORDING_AUDIO_MODE);
  recordingAudioModeReady = true;
}

/** Release the recording session so playback and other apps behave normally. */
export async function exitRecordingAudioMode(): Promise<void> {
  recordingAudioModeReady = false;
  await Audio.setAudioModeAsync(PLAYBACK_AUDIO_MODE);
}

/** Called on logout so a different account re-checks from scratch. */
export function resetPermissionCache(): void {
  mediaLibraryGranted = null;
  microphoneGranted = null;
  recordingAudioModeReady = false;
  prewarmStarted = false;
}
