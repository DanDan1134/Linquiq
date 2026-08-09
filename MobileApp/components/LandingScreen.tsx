/**
 * LandingScreen Component
 * - App title & description
 * - Social SSO (Apple/Google) right here
 * - Email flows still accessible via Log In / Sign Up buttons
 */
import React from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import "../global.css";
import { SocialButtons } from "./SocialButtons";

interface LandingScreenProps {
  onLoginPress: () => void;
  onSignUpPress: () => void;
  onSocialSuccess: () => void; // <-- NEW
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  onLoginPress,
  onSignUpPress,
  onSocialSuccess,
}) => {
  return (
    <SafeAreaView className="flex-1 bg-background items-center justify-center px-6">
      <StatusBar style="light" />
      <View className="w-full max-w-md">
        {/* Title */}
        <View className="items-center mb-4">
          <Image
            source={require("../assets/linquiq-title.png")}
            style={{ height: 64, width: 185, maxWidth: "100%" }}
            resizeMode="contain"
            accessibilityLabel="Linquiq"
          />
        </View>

        {/* Description */}
        <Text className="text-gray-300 text-sm mb-6">
          Create your personalized layout of information from conferences and
          expo events that has links, business cards, photos, and detailed
          description of your links such as date, location, and type.
        </Text>

        {/* Social sign-in (one tap) */}
        <SocialButtons onSuccess={onSocialSuccess} />

        {/* Divider */}
        <View className="flex-row items-center my-6">
          <View className="flex-1 h-[1px] bg-gray-700" />
          <Text className="mx-3 text-gray-400 text-xs">OR CONTINUE WITH EMAIL</Text>
          <View className="flex-1 h-[1px] bg-gray-700" />
        </View>

        {/* Email flows */}
        <TouchableOpacity
          onPress={onLoginPress}
          className="border-2 border-button-outline rounded-md py-3 min-h-[52px] mb-4 items-center justify-center"
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          delayPressIn={0}
        >
          <Text className="text-button-outline font-semibold">Log In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSignUpPress}
          className="border-2 border-button-outline rounded-md py-3 min-h-[52px] items-center justify-center"
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          delayPressIn={0}
        >
          <Text className="text-button-outline font-semibold">Sign Up</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};