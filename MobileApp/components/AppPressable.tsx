/**
 * Shared pressable with a reliable hit area.
 *
 * Prefer a real minWidth/minHeight over huge hitSlop — large overlapping
 * hitSlops between neighbors make taps intermittently miss.
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

/** Modest slop only; keep adjacent buttons from fighting over the same pixels. */
export const SAFE_HIT_SLOP = {
  top: 6,
  bottom: 6,
  left: 6,
  right: 6,
} as const;

type AppPressableProps = PressableProps & {
  /** Extra style applied on top of the default min touch box. */
  style?: StyleProp<ViewStyle>;
  /** Skip the default 52×52 minimum when the parent already fills the area. */
  fillParent?: boolean;
};

export function AppPressable({
  style,
  hitSlop,
  fillParent = false,
  children,
  ...rest
}: AppPressableProps) {
  return (
    <Pressable
      hitSlop={hitSlop ?? SAFE_HIT_SLOP}
      pressRetentionOffset={hitSlop ?? SAFE_HIT_SLOP}
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
