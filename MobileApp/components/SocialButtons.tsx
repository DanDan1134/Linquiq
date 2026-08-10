import React from 'react';
import { Platform, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useSSO, useSignInWithApple } from '@clerk/clerk-expo';
import * as AppleAuthentication from 'expo-apple-authentication';

/** Official Google "G" logo as SVG (no PNG asset — fixes AAPT build) */
function GoogleGLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

export function useWarmUpBrowser() {
  React.useEffect(() => {
    // don't return the promise
    void WebBrowser.warmUpAsync();

    // cleanup must return void
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}


type Props = {
  onSuccess?: () => void;
  onError?: (e: unknown) => void;
};

export const SocialButtons: React.FC<Props> = ({ onSuccess, onError }) => {
  useWarmUpBrowser();

  // Google via Clerk SSO
  const { startSSOFlow } = useSSO(); // modern Clerk hook
  const handleGoogle = React.useCallback(async () => {
    try {
      const redirectUrl = Linking.createURL('/sso-callback', { scheme: 'connectwork' });
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl,
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        onSuccess?.();
      }
    } catch (e) {
      onError?.(e);
      console.error('Google SSO error', e);
    }
  }, [onSuccess, onError, startSSOFlow]);

  // Apple (native) via Clerk’s Apple helper + expo-apple-authentication
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const handleApple = React.useCallback(async () => {
    try {
      // Redirect URL optional for Apple helper; include if you whitelisted a specific path
      const { createdSessionId, setActive } = await startAppleAuthenticationFlow();
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        onSuccess?.();
      }
    } catch (e: any) {
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
      onError?.(e);
      console.error('Apple Sign-In error', e);
    }
  }, [onSuccess, onError, startAppleAuthenticationFlow]);

  return (
    <View style={styles.container}>
      {/* Apple (iOS only). Prefer the native SIWA button */}
      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={6}
          style={styles.appleBtn}
          onPress={handleApple}
        />
      ) : null}

      {/* Google */}
      {/* <TouchableOpacity style={styles.googleBtn} onPress={handleGoogle}>
        <Text style={styles.googleText}>Continue with Google</Text>
      </TouchableOpacity> */}

        <TouchableOpacity
        style={styles.googleBtn}
        onPress={handleGoogle}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel="Sign in with Google"
        activeOpacity={0.9}
        >
        <View style={styles.row}>
            <View style={styles.googleIcon}>
              <GoogleGLogo size={20} />
            </View>
            <Text style={styles.googleText}>Sign in with Google</Text>
        </View>
        </TouchableOpacity>

    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: 16, gap: 12 },
  appleBtn: { width: '100%', height: 52, borderRadius: 6 },

  googleBtn: {
    height: 52,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#DADCE0',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleText: {
    color: '#3C4043',
    fontWeight: '600',
  },
});