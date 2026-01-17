import SplashScreen from "@/components/SplashScreen";
import SecurityService from "@/services/SecurityService";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const isPasswordSet = await SecurityService.isPasswordSet();
      const isAuthenticated = SecurityService.isAuthenticated();

      // Check device security
      const { isSecure, reason } = await SecurityService.checkDeviceSecurity();
      if (!isSecure) {
        // In production, you might want to block access
        console.warn("Device security compromised:", reason);
      }

      const inAuthGroup =
        segments[0] === "login" || segments[0] === "set-password";

      if (!isPasswordSet && segments[0] !== "set-password") {
        router.replace("/set-password");
      } else if (isPasswordSet && !isAuthenticated && segments[0] !== "login") {
        router.replace("/login");
      } else if (isPasswordSet && isAuthenticated && inAuthGroup) {
        router.replace("/home");
      }

      setIsReady(true);
    };

    checkAuth();
  }, [segments]);

  return isReady;
}

export default function RootLayout() {
  const isReady = useProtectedRoute();
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  if (!isReady) {
    return null;
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="set-password" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="home" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
