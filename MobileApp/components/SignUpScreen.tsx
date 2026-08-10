import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useSignUp } from '@clerk/clerk-expo'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import '../global.css'

interface SignUpScreenProps {
  onSignUpSuccess: (email: string) => void
  onBackPress: () => void
}

export const SignUpScreen: React.FC<SignUpScreenProps> = ({ onSignUpSuccess, onBackPress }) => {
  const { isLoaded, signUp, setActive } = useSignUp()
  const [phase, setPhase] = useState<'collect' | 'verify'>('collect')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const startSignUp = async () => {
    if (!isLoaded) return
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter email and password.')
      return
    }
    setBusy(true)
    try {
      const created = await signUp!.create({ emailAddress: email, password })
      // If your instance requires email verification, request the code:
      await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' })
      setPhase('verify')
      // If your Clerk settings do NOT require verification, you might already be complete:
      if (created.status === 'complete' && created.createdSessionId) {
        await setActive!({ session: created.createdSessionId })
        onSignUpSuccess(email)
      }
    } catch (e: any) {
      const msg = e?.errors?.[0]?.message ?? 'Sign up failed. Please try again.'
      Alert.alert('Sign up error', msg)
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async () => {
    if (!code.trim()) {
      Alert.alert('Verification', 'Enter the 6‑digit code sent to your email.')
      return
    }
    setBusy(true)
    try {
      const res = await signUp!.attemptEmailAddressVerification({ code: code.trim() })
      if (res.status === 'complete' && res.createdSessionId) {
        await setActive!({ session: res.createdSessionId })
        onSignUpSuccess(email)
      } else {
        Alert.alert('Verification', 'Please complete the next step shown.')
      }
    } catch (e: any) {
      const msg = e?.errors?.[0]?.message ?? 'Verification failed. Please try again.'
      Alert.alert('Verification error', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background px-6 items-center">
      <StatusBar style="light" />
      <View className="w-full max-w-md mt-24 items-center">
        <Text className="text-2xl text-button-outline font-extrabold mb-6">Sign Up</Text>

        {phase === 'collect' ? (
          <>
            <View style={{ width: "100%" }}>
              <View className="w-full mb-4">
                <Text className="text-gray-300 mb-2">Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete={Platform.OS === "android" ? "username" : "email"}
                  importantForAutofill="yes"
                  className="bg-card-bg rounded px-4 py-3 text-white"
                  placeholder="you@example.com"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View className="w-full mb-6">
                <Text className="text-gray-300 mb-2">Password</Text>
                <View className="flex-row items-center bg-card-bg rounded overflow-hidden">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    autoComplete={Platform.OS === "android" ? "new-password" : "password-new"}
                    importantForAutofill="yes"
                    passwordRules={
                      Platform.OS === 'ios'
                        ? 'minlength: 8; allowed: ascii-printable;'
                        : undefined
                    }
                    className="flex-1 px-4 py-3 text-white"
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((v) => !v)}
                    className="items-center justify-center"
                    style={{ minWidth: 48, minHeight: 48 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <FontAwesomeIcon
                      icon={showPassword ? faEyeSlash : faEye}
                      size={20}
                      color="#9CA3AF"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <TouchableOpacity
              onPress={startSignUp}
              disabled={busy}
              className="bg-button-outline rounded-md py-3 items-center justify-center min-h-[52px] w-full mb-4"
            >
              {busy ? <ActivityIndicator color="#000" /> : (
                <Text className="text-black font-semibold">Create Account</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text className="text-gray-300 mb-2">Enter code sent to {email}</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              importantForAutofill="yes"
              className="bg-card-bg rounded px-4 py-3 text-white w-full mb-6"
              placeholder="123456"
              placeholderTextColor="#9CA3AF"
            />
            <TouchableOpacity
              onPress={verifyCode}
              disabled={busy}
              className="bg-button-outline rounded-md py-3 items-center justify-center min-h-[52px] w-full mb-4"
            >
              {busy ? <ActivityIndicator color="#000" /> : (
                <Text className="text-black font-semibold">Verify</Text>
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
  )
}
