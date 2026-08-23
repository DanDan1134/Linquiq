import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { getClerkInstance, useSignUp } from "@clerk/clerk-expo";
import "../global.css";

interface WaitlistScreenProps {
  onBackPress: () => void;
}

function clerkErrorMessage(err: unknown): string {
  const first = (err as { errors?: Array<{ longMessage?: string; message?: string }> })
    ?.errors?.[0];
  return first?.longMessage || first?.message || "Could not join waitlist. Try again.";
}

async function joinClerkWaitlist(emailAddress: string): Promise<void> {
  const clerk = getClerkInstance() as {
    joinWaitlist?: (p: { emailAddress: string }) => Promise<unknown>;
    client?: {
      createWaitlist?: (p: { emailAddress: string }) => Promise<unknown>;
      waitlist?: { join?: (p: { emailAddress: string }) => Promise<unknown> };
    };
    frontendApi?: string;
  };

  if (typeof clerk.joinWaitlist === "function") {
    await clerk.joinWaitlist({ emailAddress });
    return;
  }
  if (typeof clerk.client?.createWaitlist === "function") {
    await clerk.client.createWaitlist({ emailAddress });
    return;
  }
  if (typeof clerk.client?.waitlist?.join === "function") {
    await clerk.client.waitlist.join({ emailAddress });
    return;
  }

  const host = String(clerk.frontendApi ?? "")
    .replace(/^https?:\/\//, "")
    .trim();
  if (!host) {
    throw new Error("Clerk waitlist is not available in this app build.");
  }
  const res = await fetch(`https://${host}/v1/client/waitlist_entries`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `email_address=${encodeURIComponent(emailAddress)}`,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let msg = "Could not join waitlist.";
    try {
      const json = JSON.parse(text) as { errors?: Array<{ message?: string }> };
      msg = json.errors?.[0]?.message || msg;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
}

export const WaitlistScreen: React.FC<WaitlistScreenProps> = ({ onBackPress }) => {
  const { isLoaded } = useSignUp();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  const onSubmit = async () => {
    const emailAddress = email.trim().toLowerCase();
    if (!emailAddress || !emailAddress.includes("@")) {
      Alert.alert("Email", "Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      if (!isLoaded) throw new Error("Waitlist is not ready yet.");
      await joinClerkWaitlist(emailAddress);
      setJoined(true);
    } catch (e: unknown) {
      const msg = clerkErrorMessage(e);
      if (/already/i.test(msg)) {
        setJoined(true);
        return;
      }
      Alert.alert("Waitlist", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background px-6 items-center">
      <StatusBar style="light" />
      <View className="w-full max-w-md mt-24">
        <Text className="text-2xl text-button-outline font-extrabold mb-3 text-center">
          Waitlist
        </Text>
        {joined ? (
          <>
            <Text className="text-gray-300 text-center mb-8">
              You are on the waitlist. We will email you when you are approved,
              then you can Log In.
            </Text>
            <TouchableOpacity
              onPress={onBackPress}
              className="bg-button-outline rounded-md py-3 items-center justify-center min-h-[52px]"
            >
              <Text className="text-black font-semibold">Back to Log In</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text className="text-gray-300 text-center mb-6">
              Enter your email to join to waitlist for Linquiq.
            </Text>
            <Text className="text-gray-300 mb-2">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete={Platform.OS === "android" ? "email" : "email"}
              className="bg-card-bg rounded px-4 py-3 text-white mb-6"
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity
              onPress={() => void onSubmit()}
              disabled={busy}
              className="bg-button-outline rounded-md py-3 items-center justify-center mb-4 min-h-[52px]"
            >
              {busy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text className="text-black font-semibold">Join waitlist</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onBackPress}
              className="min-h-[52px] w-full items-center justify-center"
            >
              <Text className="text-gray-400">Back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};
