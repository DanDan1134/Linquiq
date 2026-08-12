/**
 * CameraModal Component
 *
 * Full-screen capture surface:
 * - Asks for camera permission as soon as it opens
 * - Takes a photo and hands the uri back to the caller
 * - Closes back to the home screen
 *
 * Uses RN Modal so the camera surface cannot leave a ghost touch layer
 * over the dashboard after close.
 */
import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Alert, StyleSheet, Modal } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { FontAwesomeIcon } from "./AppIcon";
import { faXmark, faCamera, faRotate } from "@fortawesome/free-solid-svg-icons";
import { track } from "../utils/perfLog";
import "../global.css";

interface CameraModalProps {
  isVisible: boolean;
  onClose: () => void;
  onPhotoTaken: (photoUri: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isVisible,
  onClose,
  onPhotoTaken,
}) => {
  const [facing, setFacing] = useState<"front" | "back">("back");
  const [isReady, setIsReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    if (isVisible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission().catch((e) =>
        console.warn("[camera] permission request failed", e)
      );
    }
  }, [isVisible, permission, requestPermission]);

  // A reopened camera has to report ready again before capture is safe.
  useEffect(() => {
    if (!isVisible) setIsReady(false);
  }, [isVisible]);

  const takePicture = async () => {
    if (!cameraRef.current || !isReady || isCapturing) return;
    setIsCapturing(true);
    const t = track("TAKE PHOTO");
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      if (!photo?.uri) throw new Error("Camera returned no image");
      t.done();
      onPhotoTaken(photo.uri);
      onClose();
    } catch (error) {
      t.fail("capture", error);
      Alert.alert("Error", "Failed to take picture");
    } finally {
      setIsCapturing(false);
    }
  };

  const switchCamera = () =>
    setFacing((current) => (current === "back" ? "front" : "back"));

  let body: React.ReactNode = <View className="flex-1 bg-black" />;
  if (isVisible) {
    if (!permission || !permission.granted) {
      body = (
        <View className="flex-1 bg-black items-center justify-center px-6">
          <Text className="text-white text-lg text-center mb-4">
            We need your permission to show the camera
          </Text>
          {permission ? (
            <TouchableOpacity
              onPress={requestPermission}
              className="bg-button-outline rounded-md py-3 px-6"
              style={{ minHeight: 48, justifyContent: "center" }}
              delayPressIn={0}
              accessibilityRole="button"
            >
              <Text className="text-black font-semibold">Grant Permission</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={onClose}
            style={styles.cancelButton}
            delayPressIn={0}
            accessibilityRole="button"
          >
            <Text className="text-gray-400">Cancel</Text>
          </TouchableOpacity>
        </View>
      );
    } else {
      body = (
        <View className="flex-1 bg-black">
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing={facing}
            onCameraReady={() => setIsReady(true)}
          >
            <View className="absolute top-12 left-0 right-0 flex-row justify-between items-center px-6">
              <TouchableOpacity
                onPress={onClose}
                style={styles.iconButton}
                delayPressIn={0}
                accessibilityRole="button"
                accessibilityLabel="Close camera"
              >
                <FontAwesomeIcon icon={faXmark} size={20} color="white" />
              </TouchableOpacity>

              <Text className="text-white text-lg font-semibold">Camera</Text>

              <TouchableOpacity
                onPress={switchCamera}
                style={styles.iconButton}
                delayPressIn={0}
                accessibilityRole="button"
                accessibilityLabel="Switch camera"
              >
                <FontAwesomeIcon icon={faRotate} size={20} color="white" />
              </TouchableOpacity>
            </View>

            <View className="absolute bottom-12 left-0 right-0 items-center">
              <TouchableOpacity
                onPress={takePicture}
                disabled={!isReady || isCapturing}
                className={`w-20 h-20 rounded-full border-4 border-white items-center justify-center ${
                  isReady ? "bg-white" : "bg-gray-400"
                }`}
                style={isCapturing ? styles.captureBusy : undefined}
                delayPressIn={0}
                accessibilityRole="button"
                accessibilityLabel="Take a photo"
              >
                <FontAwesomeIcon
                  icon={faCamera}
                  size={30}
                  color={isReady ? "black" : "white"}
                />
              </TouchableOpacity>
            </View>
          </CameraView>
        </View>
      );
    }
  }

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      supportedOrientations={["portrait", "landscape"]}
    >
      {body}
    </Modal>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureBusy: {
    opacity: 0.6,
  },
  cancelButton: {
    marginTop: 16,
    minHeight: 48,
    justifyContent: "center",
  },
});
