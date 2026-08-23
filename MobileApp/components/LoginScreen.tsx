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
import { useSignIn } from "@clerk/clerk-expo";
import { FontAwesomeIcon } from "./AppIcon";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import "../global.css";

interface LoginScreenProps {
  onLoginSuccess: (email: string) => void;
  onBackPress: () => void;
}

type FirstFactor = {
  strategy: string;
  emailAddressId?: string;
};

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLoginSuccess,
  onBackPress,
}) => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"credentials" | "code">("credentials");
  const [codeKind, setCodeKind] = useState<"first" | "second">("first");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const finishIfSession = async (sessionId?: string | null) => {
    const id = sessionId ?? signIn?.createdSessionId;
    if (!id) return false;
    await setActive({ session: id });
    onLoginSuccess(email.trim());
    return true;
  };

  const startEmailCode = async (
    kind: "first" | "second",
    emailAddressId?: string
  ) => {
    if (kind === "first") {
      await signIn!.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: emailAddressId as string,
      });
    } else {
      await signIn!.prepareSecondFactor({ strategy: "email_code" });
    }
    setCode("");
    setCodeKind(kind);
    setPhase("code");
  };

  const onSubmit = async () => {
    if (!isLoaded || !signIn) return;
    if (!email || !password) {
      Alert.alert("Missing info", "Please enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const identifier = email.trim();
      let res = await signIn.create({ identifier, password });

      if (await finishIfSession(res.createdSessionId)) return;

      if (res.status === "needs_first_factor") {
        const factors = (res.supportedFirstFactors ?? []) as FirstFactor[];
        const passwordOk = factors.some((f) => f.strategy === "password");
        if (passwordOk) {
          try {
            res = await signIn.attemptFirstFactor({
              strategy: "password",
              password,
            });
            if (await finishIfSession(res.createdSessionId)) return;
          } catch {
            /* password already applied, or not allowed */
          }
        }

        const emailFactor = ((res.supportedFirstFactors ??
          signIn.supportedFirstFactors ??
          []) as FirstFactor[]).find((f) => f.strategy === "email_code");

        if (res.status === "needs_first_factor" && emailFactor?.emailAddressId) {
          await startEmailCode("first", emailFactor.emailAddressId);
          return;
        }
      }

      if (res.status === "needs_second_factor") {
        await startEmailCode("second");
        return;
      }

      Alert.alert(
        "Login error",
        "Could not start a session. Try again, or use the same email on the website first."
      );
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        "Login failed. Please try again.";
      Alert.alert("Login error", msg);
    } finally {
      setBusy(false);
    }
  };

  const onVerifyCode = async () => {
    if (!signIn) return;
    if (!code.trim()) {
      Alert.alert("Code", "Enter the code from your email.");
      return;
    }
    setBusy(true);
    try {
      const res =
        codeKind === "second"
          ? await signIn.attemptSecondFactor({
              strategy: "email_code",
              code: code.trim(),
            })
          : await signIn.attemptFirstFactor({
              strategy: "email_code",
              code: code.trim(),
            });
      if (await finishIfSession(res.createdSessionId)) return;
      Alert.alert("Login error", "Code did not start a session. Try again.");
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ??
        e?.errors?.[0]?.message ??
        "Invalid code. Try again.";
      Alert.alert("Login error", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background px-6 items-center">
      <StatusBar style="light" />
      <View className="w-full max-w-md mt-24">
        <Text className="text-2xl text-button-outline font-extrabold mb-6 text-center">
          Log In
        </Text>

        {phase === "code" ? (
          <>
            <Text className="text-gray-300 text-center mb-4">
              Enter the code sent to {email.trim()}
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              className="bg-card-bg rounded px-4 py-3 text-white mb-6"
              placeholder="123456"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity
              onPress={() => void onVerifyCode()}
              disabled={busy}
              className="bg-button-outline rounded-md py-3 items-center justify-center mb-4 min-h-[52px]"
            >
              {busy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text className="text-black font-semibold">Verify</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text className="text-gray-300 mb-2">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete={Platform.OS === "android" ? "username" : "email"}
              importantForAutofill="yes"
              className="bg-card-bg rounded px-4 py-3 text-white mb-4"
              placeholder="you@example.com"
              placeholderTextColor="#9CA3AF"
            />

            <Text className="text-gray-300 mb-2">Password</Text>
            <View className="flex-row items-center bg-card-bg rounded overflow-hidden mb-6">
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete={
                  Platform.OS === "android" ? "current-password" : "password"
                }
                importantForAutofill="yes"
                className="flex-1 px-4 py-3 text-white"
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                className="items-center justify-center"
                style={{ minWidth: 48, minHeight: 48 }}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              >
                <FontAwesomeIcon
                  icon={showPassword ? faEyeSlash : faEye}
                  size={20}
                  color="#9CA3AF"
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => void onSubmit()}
              disabled={busy}
              className="bg-button-outline rounded-md py-3 items-center justify-center mb-4 min-h-[52px]"
            >
              {busy ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text className="text-black font-semibold">Submit</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          onPress={onBackPress}
          className="min-h-[52px] w-full items-center justify-center"
        >
          <Text className="text-gray-400">Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};
