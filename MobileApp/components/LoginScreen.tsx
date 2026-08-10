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
import { useSignIn } from '@clerk/clerk-expo'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import '../global.css'

interface LoginScreenProps {
  onLoginSuccess: (email: string) => void
  onBackPress: () => void
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onBackPress }) => {
  const { isLoaded, signIn, setActive } = useSignIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const onSubmit = async () => {
    if (!isLoaded) return
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.')
      return
    }
    setBusy(true)
    try {
      const res = await signIn!.create({ identifier: email, password })
      // If your Clerk instance doesn’t require additional steps, this will be complete:
      if (res.status === 'complete' && res.createdSessionId) {
        await setActive!({ session: res.createdSessionId })
        onLoginSuccess(email)
      } else {
        // MFA or other next steps if configured in Clerk
        Alert.alert('Additional step required', 'Please complete the verification step.')
      }
    } catch (e: any) {
      const msg = e?.errors?.[0]?.message ?? 'Login failed. Please try again.'
      Alert.alert('Login error', msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background px-6 items-center">
      <StatusBar style="light" />
      <View className="w-full max-w-md mt-24">
        <Text className="text-2xl text-button-outline font-extrabold mb-6 text-center">
          Log In
        </Text>

        <View>
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

        <TouchableOpacity
          onPress={onSubmit}
          disabled={busy}
          className="bg-button-outline rounded-md py-3 items-center justify-center mb-4 min-h-[52px]"
        >
          {busy ? <ActivityIndicator color="#000" /> : (
            <Text className="text-black font-semibold">Submit</Text>
          )}
        </TouchableOpacity>

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