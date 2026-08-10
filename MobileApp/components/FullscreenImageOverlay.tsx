import React from "react";
import {
  Image,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";

type FullscreenImageOverlayProps = {
  imageUri: string | null;
  visible: boolean;
  onClose: () => void;
};

export const FullscreenImageOverlay: React.FC<FullscreenImageOverlayProps> = ({
  imageUri,
  visible,
  onClose,
}) => {
  const { width, height } = useWindowDimensions();
  const shortestSide = Math.min(width, height);
  const closeButtonSize = Math.max(56, Math.min(64, shortestSide * 0.14));
  const closeIconSize = Math.round(closeButtonSize * 0.62);
  const topInset = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
  const suggestedTop = Math.round(height * 0.15);
  const maxTop = Math.round(height * 0.5 - closeButtonSize - 8);
  const closeButtonTop = Math.max(topInset + 12, Math.min(suggestedTop, maxTop));
  const closeButtonRight = Math.max(10, Math.round(width * 0.03));

  if (!visible || !imageUri) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close fullscreen image"
        />

        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.8}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          delayPressIn={0}
          accessibilityRole="button"
          accessibilityLabel="Close image preview"
          style={[
            styles.closeButton,
            {
              width: closeButtonSize,
              height: closeButtonSize,
              borderRadius: closeButtonSize / 2,
              top: closeButtonTop,
              right: closeButtonRight,
            },
          ]}
        >
          <Text style={{ color: "#fff", fontSize: closeIconSize, lineHeight: closeIconSize }}>
            ×
          </Text>
        </TouchableOpacity>

        <TouchableWithoutFeedback>
          <Image
            source={{ uri: imageUri }}
            resizeMode="contain"
            style={{
              width: Math.min(width * 0.94, 1000),
              height: Math.min(height * 0.9, 1000),
            }}
          />
        </TouchableWithoutFeedback>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.92)",
  },
  closeButton: {
    position: "absolute",
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
});
