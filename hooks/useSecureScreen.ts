import { useEffect } from 'react';
import { Platform } from 'react-native';

// For Android FLAG_SECURE is handled natively in MainActivity.java
// For iOS, we can use a native module or expo-screen-capture

export function useSecureScreen() {
  useEffect(() => {
    if (Platform.OS === 'ios') {
      // On iOS, you would need to add expo-screen-capture
      // import * as ScreenCapture from 'expo-screen-capture';
      // ScreenCapture.preventScreenCaptureAsync();
      
      // For now, log that iOS needs additional setup
      console.log('iOS: Add expo-screen-capture for screenshot prevention');
    }
    
    return () => {
      // Cleanup if needed
    };
  }, []);
}

export default useSecureScreen;
