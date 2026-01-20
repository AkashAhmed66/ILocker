import SimpleIcon from "@/components/SimpleIcon";
import SecurityService from "@/services/SecurityService";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!password) {
      Alert.alert("Error", "Please enter your password");
      return;
    }

    setLoading(true);
    try {
      // Try to restore master key first (fast path)
      const restored = await SecurityService.restoreMasterKey();

      // Verify password
      const isValid = await SecurityService.verifyPassword(password);
      if (isValid) {
        // Master key is now set, navigate immediately
        router.replace("/home");
      } else {
        Alert.alert("Error", "Incorrect password. Please try again.");
        setPassword("");
      }
    } catch (error) {
      Alert.alert("Error", "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <LinearGradient
        colors={["#0f0f0f", "#1a1a2e", "#16213e"]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <SimpleIcon
                name="lock-closed"
                size={64}
                color="#4a90e2"
                style={{ marginBottom: 16 }}
              />
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Enter your password to unlock</Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handleLogin}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Unlock</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <SimpleIcon name="lock-closed" size={20} color="#4a90e2" />
              <Text style={styles.footerText}>Your files are secure</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f0f",
  },
  gradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 48,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#888",
  },
  form: {
    width: "100%",
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: "#aaa",
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#2a2a3e",
  },
  button: {
    backgroundColor: "#4a90e2",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    shadowColor: "#4a90e2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonDisabled: {
    backgroundColor: "#2a4a6e",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#2a2a3e",
  },
  dividerText: {
    color: "#666",
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: "600",
  },
  biometricButton: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a3e",
  },
  biometricIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  biometricText: {
    color: "#4a90e2",
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
  },
  footerText: {
    color: "#666",
    fontSize: 14,
  },
});
