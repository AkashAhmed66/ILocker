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

export default function SetPasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSetPassword = async () => {
    if (password.length < 6) {
      Alert.alert(
        "Weak Password",
        "Password must be at least 6 characters long",
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await SecurityService.setPassword(password);
      // Verify and authenticate immediately after setting password
      const isValid = await SecurityService.verifyPassword(password);
      if (isValid) {
        setLoading(false);
        router.replace("/home");
      } else {
        throw new Error("Password verification failed");
      }
    } catch (error: any) {
      console.error("Set password error:", error);
      const errorMessage =
        error?.message || "Failed to set password. Please try again.";
      Alert.alert("Error", errorMessage);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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
              <Text style={styles.title}>Secure Your Files</Text>
              <Text style={styles.subtitle}>
                Create a strong master password
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Master Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.requirements}>
                <Text style={styles.requirementText}>
                  • Minimum 6 characters
                </Text>
                <Text style={styles.requirementText}>
                  • Use mix of letters & numbers
                </Text>
                <Text style={styles.requirementText}>
                  • Keep it memorable but strong
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSetPassword}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <ActivityIndicator color="#fff" />
                    <Text style={[styles.buttonText, { marginLeft: 8 }]}>
                      Setting up...
                    </Text>
                  </>
                ) : (
                  <Text style={styles.buttonText}>Set Password & Continue</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>⚠️ Remember this password!</Text>
              <Text style={styles.footerSubtext}>
                This password cannot be recovered if forgotten.
              </Text>
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
  requirements: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "#2a2a3e",
  },
  requirementText: {
    color: "#888",
    fontSize: 13,
    marginBottom: 4,
  },
  button: {
    backgroundColor: "#4a90e2",
    borderRadius: 12,
    padding: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
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
  footer: {
    marginTop: 32,
    alignItems: "center",
  },
  footerText: {
    color: "#ff6b6b",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  footerSubtext: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
  },
});
