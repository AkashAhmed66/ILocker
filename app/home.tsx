import SimpleIcon from "@/components/SimpleIcon";
import FileService, { FileOperation } from "@/services/FileService";
import SecurityService, { FileMetadata } from "@/services/SecurityService";
import { ResizeMode, Video } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  const router = useRouter();
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileMetadata | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeOperations, setActiveOperations] = useState<FileOperation[]>([]);
  const [previewProgress, setPreviewProgress] = useState(0);
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    // Load files and initialize storage (authentication already verified by _layout.tsx)
    loadFiles();
    FileService.initializeSecureStorage();

    // Poll for active operations
    const interval = setInterval(() => {
      setActiveOperations(FileService.getActiveOperations());
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const loadFiles = () => {
    const allFiles = SecurityService.getAllFileMetadata();
    setFiles(allFiles.sort((a, b) => b.timestamp - a.timestamp));
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFiles();
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const handleAddFile = async (type: "document" | "image" | "camera") => {
    setShowMenu(false);
    try {
      let results: FileMetadata[] = [];

      switch (type) {
        case "document":
          results = await FileService.pickDocument();
          break;
        case "image":
          results = await FileService.pickImage();
          break;
        case "camera":
          const singleResult = await FileService.takePhoto();
          if (singleResult) results = [singleResult];
          break;
      }

      if (results.length > 0) {
        loadFiles();
        // Operations will show progress automatically via activeOperations
      }
    } catch (error: any) {
      console.error("Add file error:", error);
      const errorMsg = error?.message || "Failed to add file";
      Alert.alert("Error", errorMsg);
    }
  };

  const handleFilePress = async (file: FileMetadata) => {
    setSelectedFile(file);
    setLoading(true);
    setShowFilePreview(true);
    setPreviewContent(null);
    setPreviewProgress(0);

    try {
      // For images, try to load thumbnail first for instant preview
      if (file.fileType.startsWith("image/") && file.encryptedThumbnail) {
        const thumbnail = await FileService.getThumbnail(file.id);
        if (thumbnail) {
          setPreviewContent(thumbnail);
          setLoading(false);
        }
      }

      // Load full content with progress
      const uri = await FileService.getSecureFileUri(file.id, (progress) => {
        setPreviewProgress(progress);
      });
      setPreviewContent(uri);
      setPreviewProgress(100);
    } catch (error) {
      Alert.alert("Error", "Failed to decrypt file");
      setShowFilePreview(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClosePreview = () => {
    // Cancel any ongoing decryption
    setLoading(false);
    setPreviewProgress(0);
    setPreviewContent(null);
    setSelectedFile(null);
    setShowFilePreview(false);
  };

  const handleDeleteFile = (file: FileMetadata) => {
    Alert.alert("Delete File", `Delete "${file.originalName}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const success = await FileService.deleteSecureFile(file.id);
          if (success) {
            loadFiles();
            Alert.alert("Deleted", "File deleted successfully");
          } else {
            Alert.alert("Error", "Failed to delete file");
          }
        },
      },
    ]);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const success = await SecurityService.changePassword(
        oldPassword,
        newPassword,
      );
      if (success) {
        Alert.alert("Success", "Password changed successfully");
        setShowSettings(false);
        setOldPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      } else {
        Alert.alert("Error", "Current password is incorrect");
      }
    } catch (error) {
      Alert.alert("Error", "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  const handleLock = () => {
    Alert.alert("Lock App", "Lock ILocker?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Lock",
        onPress: () => {
          SecurityService.lock();
          router.replace("/login");
        },
      },
    ]);
  };

  const handleDownloadFile = async (file: FileMetadata) => {
    try {
      const result = await FileService.downloadFile(file.id);
      if (result.success) {
        // Download started in background - show toast
        Alert.alert("Download Started", result.message);
      } else {
        Alert.alert("Error", result.message);
      }
    } catch (error) {
      console.error("Download error:", error);
      Alert.alert("Error", "Failed to start download");
    }
  };

  const renderFileItem = ({ item }: { item: FileMetadata }) => (
    <TouchableOpacity
      style={styles.fileCard}
      onPress={() => handleFilePress(item)}
      onLongPress={() => handleDeleteFile(item)}
    >
      <View style={styles.fileIconContainer}>
        <SimpleIcon
          name={FileService.getFileIcon(item.fileType) as any}
          size={32}
          color="#4a90e2"
        />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {item.originalName}
        </Text>
        <Text style={styles.fileDetails}>
          {FileService.formatFileSize(item.size)} •{" "}
          {new Date(item.timestamp).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.fileActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={(e) => {
            e.stopPropagation();
            handleDownloadFile(item);
          }}
        >
          <SimpleIcon name="download-outline" size={20} color="#4a90e2" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={(e) => {
            e.stopPropagation();
            handleDeleteFile(item);
          }}
        >
          <SimpleIcon name="trash-outline" size={20} color="#ff4444" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="light" />
      <LinearGradient colors={["#0f0f0f", "#1a1a2e"]} style={styles.gradient}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <SimpleIcon name="lock-closed" size={28} color="#4a90e2" />
            <View>
              <Text style={styles.headerTitle}>ILocker</Text>
              <Text style={styles.headerSubtitle}>
                {files.length} secure files
              </Text>
            </View>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowSettings(true)}
            >
              <SimpleIcon name="settings-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={handleLock}>
              <SimpleIcon name="lock-closed-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Operations Progress */}
        {activeOperations.length > 0 && (
          <View style={styles.operationsContainer}>
            {activeOperations.map((op) => (
              <View key={op.id} style={styles.operationCard}>
                <View style={styles.operationHeader}>
                  <SimpleIcon
                    name={op.type === 'upload' ? 'cloud-upload-outline' : 'cloud-download-outline'}
                    size={20}
                    color="#4a90e2"
                  />
                  <Text style={styles.operationName} numberOfLines={1}>
                    {op.fileName}
                  </Text>
                  <Text style={styles.operationPercent}>
                    {Math.round(op.progress)}%
                  </Text>
                  {op.status === 'processing' && (
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        Alert.alert(
                          'Cancel Operation',
                          `Cancel ${op.type === 'upload' ? 'encrypting' : 'downloading'} ${op.fileName}?`,
                          [
                            { text: 'No', style: 'cancel' },
                            {
                              text: 'Yes, Cancel',
                              style: 'destructive',
                              onPress: () => FileService.cancelOperation(op.id)
                            }
                          ]
                        );
                      }}
                    >
                      <SimpleIcon name="close-circle" size={20} color="#ff4444" />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${op.progress}%`,
                        backgroundColor: op.status === 'failed' ? '#ff4444' : '#4a90e2'
                      }
                    ]}
                  />
                </View>
                {op.status === 'failed' && (
                  <Text style={styles.operationError}>{op.error}</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* File List */}
        {files.length === 0 ? (
          <View style={styles.emptyState}>
            <SimpleIcon name="folder-open-outline" size={64} color="#666" />
            <Text style={styles.emptyTitle}>No Files Yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to add your first secure file
            </Text>
          </View>
        ) : (
          <FlatList
            data={files}
            renderItem={renderFileItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.fileList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#4a90e2"
              />
            }
          />
        )}

        {/* Add Button */}
        <TouchableOpacity style={styles.fab} onPress={() => setShowMenu(true)}>
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>

        {/* Add Menu Modal */}
        <Modal visible={showMenu} transparent animationType="fade">
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowMenu(false)}
          >
            <View style={styles.menuContainer}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleAddFile("document")}
              >
                <SimpleIcon name="document-outline" size={24} color="#4a90e2" />
                <Text style={styles.menuText}>Document</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleAddFile("image")}
              >
                <SimpleIcon name="images-outline" size={24} color="#4a90e2" />
                <Text style={styles.menuText}>Photo Library</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleAddFile("camera")}
              >
                <SimpleIcon name="camera-outline" size={24} color="#4a90e2" />
                <Text style={styles.menuText}>Take Photo</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Settings Modal */}
        <Modal visible={showSettings} animationType="slide">
          <LinearGradient
            colors={["#0f0f0f", "#1a1a2e"]}
            style={styles.modalGradient}
          >
            <View style={styles.settingsHeader}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <SimpleIcon name="settings-outline" size={28} color="#4a90e2" />
                <Text style={styles.settingsTitle}>Settings</Text>
              </View>
              <TouchableOpacity onPress={() => setShowSettings(false)}>
                <SimpleIcon name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.settingsContent}>
              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>Change Password</Text>
                <TextInput
                  style={styles.settingsInput}
                  placeholder="Current Password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={oldPassword}
                  onChangeText={setOldPassword}
                />
                <TextInput
                  style={styles.settingsInput}
                  placeholder="New Password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <TextInput
                  style={styles.settingsInput}
                  placeholder="Confirm New Password"
                  placeholderTextColor="#666"
                  secureTextEntry
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                />
                <TouchableOpacity
                  style={styles.changePasswordButton}
                  onPress={handleChangePassword}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.changePasswordText}>
                      Change Password
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>Security Info</Text>
                <View style={styles.infoCard}>
                  <Text style={styles.infoText}>🔐 AES-256-GCM Encryption</Text>
                  <Text style={styles.infoText}>
                    🔑 Hardware-backed Key Storage
                  </Text>
                  <Text style={styles.infoText}>🚫 No Cloud Backup</Text>
                  <Text style={styles.infoText}>
                    📱 Secure Enclave Protected
                  </Text>
                </View>
              </View>
            </ScrollView>
          </LinearGradient>
        </Modal>

        {/* File Preview Modal */}
        <Modal visible={showFilePreview} animationType="slide">
          <LinearGradient
            colors={["#0f0f0f", "#1a1a2e"]}
            style={styles.modalGradient}
          >
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {selectedFile?.originalName}
              </Text>
              <View
                style={{ flexDirection: "row", gap: 16, alignItems: "center" }}
              >
                <TouchableOpacity
                  onPress={() => {
                    if (selectedFile) {
                      handleDownloadFile(selectedFile);
                    }
                  }}
                >
                  <SimpleIcon
                    name="download-outline"
                    size={24}
                    color="#4a90e2"
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleClosePreview}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.previewContent}>
              {loading ? (
                <View style={styles.loadingContainer}>
                  {/* Decryption Shield Icon */}
                  <View style={styles.decryptionIconContainer}>
                    <View style={styles.iconCircle}>
                      <SimpleIcon name="shield-checkmark" size={48} color="#4a90e2" />
                    </View>
                  </View>

                  {/* Status Text */}
                  <Text style={styles.decryptionTitle}>Decrypting File</Text>
                  <Text style={styles.decryptionSubtitle}>
                    Securely unlocking your content...
                  </Text>

                  {/* Progress Percentage */}
                  <View style={styles.progressPercentContainer}>
                    <Text style={styles.progressPercentText}>
                      {Math.round(previewProgress)}
                    </Text>
                    <Text style={styles.progressPercentSymbol}>%</Text>
                  </View>

                  {/* Progress Bar */}
                  {previewProgress > 0 && (
                    <View style={styles.modernProgressBarContainer}>
                      <View style={styles.modernProgressBarBg}>
                        <View
                          style={[
                            styles.modernProgressBarFill,
                            { width: `${previewProgress}%` }
                          ]}
                        />
                      </View>
                      <Text style={styles.progressStatusText}>
                        {previewProgress < 30 ? 'Reading encrypted data...' :
                          previewProgress < 70 ? 'Decrypting content...' :
                            previewProgress < 95 ? 'Finalizing...' : 'Almost done!'}
                      </Text>
                    </View>
                  )}

                  {/* Security Badge */}
                  <View style={styles.securityBadge}>
                    <SimpleIcon name="lock-closed" size={14} color="#4a90e2" />
                    <Text style={styles.securityBadgeText}>AES-256 Encrypted</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.previewContainer}>
                  {selectedFile?.fileType.startsWith("image/") &&
                    previewContent ? (
                    <Image
                      source={{
                        uri: previewContent.startsWith('file://') ? previewContent : `data:${selectedFile.fileType};base64,${previewContent}`,
                      }}
                      style={styles.previewImage}
                      resizeMode="contain"
                    />
                  ) : selectedFile?.fileType.startsWith("video/") &&
                    previewContent ? (
                    <Video
                      ref={videoRef}
                      source={{
                        uri: previewContent.startsWith('file://') ? previewContent : `data:${selectedFile.fileType};base64,${previewContent}`,
                      }}
                      style={styles.previewVideo}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                      isLooping
                      shouldPlay={false}
                    />
                  ) : (
                    <View style={styles.filePreviewInfo}>
                      <SimpleIcon
                        name={FileService.getFileIcon(selectedFile?.fileType || "") as any}
                        size={80}
                        color="#4a90e2"
                      />
                      <Text style={styles.previewFileName}>
                        {selectedFile?.originalName}
                      </Text>
                      <Text style={styles.previewFileSize}>
                        {FileService.formatFileSize(selectedFile?.size || 0)}
                      </Text>
                      <Text style={styles.previewNote}>
                        📝 Preview not available for this file type
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </LinearGradient>
        </Modal>

        {/* Loading Overlay */}
        {loading && !showFilePreview && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#4a90e2" />
              <Text style={styles.loadingText}>Processing...</Text>
            </View>
          </View>
        )}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
  },
  operationsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  operationCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2a2a3e",
  },
  operationHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  operationName: {
    flex: 1,
    fontSize: 14,
    color: "#fff",
    marginLeft: 8,
  },
  operationPercent: {
    fontSize: 12,
    color: "#4a90e2",
    fontWeight: "bold",
  },
  cancelButton: {
    marginLeft: 8,
    padding: 4,
  },
  operationError: {
    fontSize: 12,
    color: "#ff4444",
    marginTop: 4,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: "#2a2a3e",
    borderRadius: 2,
    overflow: "hidden",
    width: "100%",
    marginTop: 4,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4a90e2",
    borderRadius: 2,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#1a1a2e",
    justifyContent: "center",
    alignItems: "center",
  },
  iconButtonText: {
    fontSize: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
  },
  fileList: {
    padding: 20,
    paddingBottom: 100,
  },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#2a2a3e",
  },
  fileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#16213e",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  fileIcon: {
    fontSize: 24,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 4,
  },
  fileDetails: {
    fontSize: 12,
    color: "#888",
  },
  fileActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  deleteIcon: {
    fontSize: 20,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#4a90e2",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4a90e2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: "#fff",
    fontWeight: "bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#16213e",
    borderRadius: 12,
    marginBottom: 12,
  },
  menuIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  menuText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },
  modalGradient: {
    flex: 1,
  },
  settingsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  settingsTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
  closeButton: {
    fontSize: 28,
    color: "#888",
    fontWeight: "bold",
  },
  settingsContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  settingsSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 16,
  },
  settingsInput: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#2a2a3e",
    marginBottom: 12,
  },
  changePasswordButton: {
    backgroundColor: "#4a90e2",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  changePasswordText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  infoCard: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2a2a3e",
  },
  infoText: {
    color: "#888",
    fontSize: 14,
    marginBottom: 8,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  previewTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    flex: 1,
    marginRight: 16,
  },
  previewContent: {
    flex: 1,
  },
  previewContainer: {
    flex: 1,
  },
  previewImage: {
    width: "100%",
    height: 600,
  },
  previewVideo: {
    width: "100%",
    height: 600,
    backgroundColor: "#000",
  },
  filePreviewInfo: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  previewFileIcon: {
    fontSize: 80,
    marginBottom: 24,
  },
  previewFileName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  previewFileSize: {
    fontSize: 16,
    color: "#888",
    marginBottom: 32,
  },
  previewNote: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
    paddingHorizontal: 40,
  },
  decryptionIconContainer: {
    position: 'relative',
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4a90e2',
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  loadingRing: {
    position: 'absolute',
    width: 120,
    height: 120,
  },
  decryptionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  decryptionSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 24,
    textAlign: 'center',
  },
  progressPercentContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24,
  },
  progressPercentText: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#4a90e2',
    fontVariant: ['tabular-nums'],
  },
  progressPercentSymbol: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4a90e2',
    marginLeft: 4,
  },
  modernProgressBarContainer: {
    width: '100%',
    marginBottom: 32,
  },
  modernProgressBarBg: {
    height: 8,
    backgroundColor: '#1a1a2e',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  modernProgressBarFill: {
    height: '100%',
    backgroundColor: '#4a90e2',
    borderRadius: 4,
    shadowColor: '#4a90e2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  progressStatusText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 226, 0.3)',
    gap: 6,
  },
  securityBadgeText: {
    fontSize: 12,
    color: '#4a90e2',
    fontWeight: '600',
  },
  loadingText: {
    color: "#888",
    fontSize: 16,
    marginTop: 16,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingBox: {
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a2a3e",
  },
});
