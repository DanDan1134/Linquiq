/**
 * Shared pressable with a reliable hit area.
 *
 * Real minWidth/minHeight only — no hitSlop. hitSlop extends the tappable
 * area beyond what's drawn, so neighboring buttons' slop zones can overlap
 * and steal each other's taps, or a native touch-handler bug (RN Modal
 * stacking on iOS) can leave a stale slop rect that no longer lines up with
 * the visible button. A real 52×52+ box has none of those failure modes.
 *
 * Uses RN Pressable (not gesture-handler TouchableOpacity) so flex/NativeWind
 * children layout correctly (dates, labels, icons stay visible).
 */
import React from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { MIN_TOUCH_SIZE } from "../utils/helpers";

type AppPressableProps = PressableProps & {
  /** Extra style applied on top of the default min touch box. */
  style?: StyleProp<ViewStyle>;
  /** Skip the default 52×52 minimum when the parent already fills the area. */
  fillParent?: boolean;
};

export function AppPressable({
  style,
  fillParent = false,
  children,
  ...rest
}: AppPressableProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        fillParent
          ? undefined
          : {
              minWidth: MIN_TOUCH_SIZE,
              minHeight: MIN_TOUCH_SIZE,
              alignItems: "center" as const,
              justifyContent: "center" as const,
            },
        { opacity: pressed ? 0.65 : 1 },
        style,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
