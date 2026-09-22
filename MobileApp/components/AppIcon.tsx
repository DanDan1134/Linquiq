/**
 * FontAwesome → SVG on RN. On iOS New Arch / TestFlight, SVG views can steal
 * taps from the parent Pressable/TouchableOpacity (works around the glyph,
 * dead on the glyph). Wrap in a View with pointerEvents="none" so the button
 * owns the hit (Svg's own pointerEvents is unreliable on Fabric iOS).
 */
import React from "react";
import { View } from "react-native";
import {
  FontAwesomeIcon as FontAwesomeIconBase,
  type Props,
} from "@fortawesome/react-native-fontawesome";

export function FontAwesomeIcon(props: Props) {
  return (
    <View pointerEvents="none">
      <FontAwesomeIconBase {...props} />
    </View>
  );
}
