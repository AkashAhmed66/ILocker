import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import BackgroundService from "react-native-background-actions";
import "react-native-get-random-values";
import BackgroundTaskManager from "./BackgroundTaskManager";
import SecurityService, { FileMetadata } from "./SecurityService";

// Task names for background operations
const BACKGROUND_UPLOAD_TASK = "background-upload-task";
const BACKGROUND_DOWNLOAD_TASK = "background-download-task";

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

// Set up notification channel for Android
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('file-operations', {
    name: 'File Operations',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4a90e2',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    showBadge: true,
  });
}

export interface FileOperation {
  id: string;
  type: 'upload' | 'download';
  fileName: string;
  progress: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

class FileService {
  private readonly SECURE_DIR = `${FileSystem.documentDirectory || "file:///"}secure/`;
  private readonly THUMBNAIL_DIR = `${FileSystem.documentDirectory || "file:///"}thumbnails/`;
  private activeOperations: Map<string, FileOperation> = new Map();
  private operationListeners: Map<string, (op: FileOperation) => void> = new Map();
  private backgroundNotificationIds: Map<string, string> = new Map();
  private keepAliveTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastNotificationUpdate: Map<string, number> = new Map();
  private readonly NOTIFICATION_UPDATE_THROTTLE = 2000; // Update notification max every 2 seconds
  private backgroundServiceRunning = false;
  private activeBackgroundOperations = 0;

  // Initialize secure directory
  async initializeSecureStorage(): Promise<void> {
    try {
      // Create secure directory
      const dirInfo = await FileSystem.getInfoAsync(this.SECURE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.SECURE_DIR, {
          intermediates: true,
        });
      }

      // Create thumbnail directory
      const thumbInfo = await FileSystem.getInfoAsync(this.THUMBNAIL_DIR);
      if (!thumbInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.THUMBNAIL_DIR, {
          intermediates: true,
        });
      }

      // Create .nomedia file for Android
      const nomediaPath = `${this.SECURE_DIR}.nomedia`;
      const nomediaInfo = await FileSystem.getInfoAsync(nomediaPath);
      if (!nomediaInfo.exists) {
        await FileSystem.writeAsStringAsync(nomediaPath, "");
      }

      // Request notification permissions
      await this.requestNotificationPermissions();
      
      // Register background task
      await BackgroundTaskManager.registerBackgroundTask();
    } catch (error) {
      console.warn("Failed to initialize secure storage:", error);
    }
  }

  // Request notification permissions
  private async requestNotificationPermissions(): Promise<void> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.warn('Notification permissions not granted');
      }
    } catch (error) {
      console.warn('Failed to request notification permissions:', error);
    }
  }

  // Subscribe to operation updates
  subscribeToOperation(operationId: string, callback: (op: FileOperation) => void): () => void {
    this.operationListeners.set(operationId, callback);
    return () => this.operationListeners.delete(operationId);
  }

  // Update operation status
  private updateOperation(operationId: string, updates: Partial<FileOperation>): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      Object.assign(operation, updates);
      
      // Background service notification will show progress automatically
      // this.updatePersistentNotification(operationId, operation);
      
      const listener = this.operationListeners.get(operationId);
      if (listener) {
        listener(operation);
      }
    }
  }

  // Create persistent notification for background operation
  private async createPersistentNotification(
    operationId: string,
    operation: FileOperation
  ): Promise<void> {
    try {
      const identifier = `file-operation-${operationId}`;
      
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: operation.type === 'upload' ? '🔒 Encrypting File' : '🔓 Decrypting File',
          body: operation.fileName,
          sound: false,
          sticky: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { operationId, progress: 0 },
          ...(Platform.OS === 'android' && {
            categoryIdentifier: 'file-operations',
          }),
        },
        trigger: null,
      });
      
      this.backgroundNotificationIds.set(operationId, identifier);
      this.lastNotificationUpdate.set(operationId, Date.now());
    } catch (error) {
      console.warn('Failed to create persistent notification:', error);
    }
  }

  // Update persistent notification with progress (throttled)
  private async updatePersistentNotification(
    operationId: string,
    operation: FileOperation
  ): Promise<void> {
    try {
      const identifier = this.backgroundNotificationIds.get(operationId);
      if (!identifier || operation.status !== 'processing') return;
      
      // Throttle updates - only update if enough time has passed
      const lastUpdate = this.lastNotificationUpdate.get(operationId) || 0;
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdate;
      
      // Only update if 2 seconds have passed OR progress is at key milestones
      const isKeyMilestone = operation.progress % 25 === 0 || operation.progress >= 95;
      if (timeSinceLastUpdate < this.NOTIFICATION_UPDATE_THROTTLE && !isKeyMilestone) {
        return;
      }
      
      this.lastNotificationUpdate.set(operationId, now);
      
      // Update the same notification in place
      await Notifications.scheduleNotificationAsync({
        identifier, // Reuse same identifier to update in place
        content: {
          title: operation.type === 'upload' ? '🔒 Encrypting File' : '🔓     File',
          body: `${operation.fileName} - ${Math.round(operation.progress)}%`,
          sound: false,
          sticky: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { operationId, progress: operation.progress },
          ...(Platform.OS === 'android' && {
            categoryIdentifier: 'file-operations',
          }),
        },
        trigger: null,
      });
    } catch (error) {
      console.warn('Failed to update persistent notification:', error);
    }
  }

  // Remove persistent notification
  private async removePersistentNotification(operationId: string): Promise<void> {
    try {
      const identifier = this.backgroundNotificationIds.get(operationId);
      if (identifier) {
        await Notifications.dismissNotificationAsync(identifier);
        this.backgroundNotificationIds.delete(operationId);
        this.lastNotificationUpdate.delete(operationId);
      }
    } catch (error) {
      console.warn('Failed to remove persistent notification:', error);
    }
  }

  // Start background service to keep operations running
  private async startBackgroundService(): Promise<void> {
    if (this.backgroundServiceRunning) {
      return;
    }

    try {
      const options = {
        taskName: 'ILocker File Processing',
        taskTitle: 'Processing Files',
        taskDesc: 'Encrypting or decrypting your files securely',
        taskIcon: {
          name: 'ic_launcher',
          type: 'mipmap',
        },
        color: '#4a90e2',
        linkingURI: 'ilocker://',
        progressBar: {
          max: 100,
          value: 0,
          indeterminate: false,
        },
        parameters: {
          delay: 1000,
        },
      };

      await BackgroundService.start(this.backgroundTask, options);
      this.backgroundServiceRunning = true;
      console.log('[BackgroundService] Started');
    } catch (error) {
      console.warn('[BackgroundService] Failed to start:', error);
    }
  }

  // Background task that keeps running
  private backgroundTask = async (taskData: any) => {
    await new Promise(async (resolve) => {
      // Keep running while there are active operations
      while (this.activeBackgroundOperations > 0) {
        const operations = Array.from(this.activeOperations.values());
        const processingOps = operations.filter(op => op.status === 'processing');
        
        let taskTitle = 'Processing';
        let taskDesc = '';
        
        if (processingOps.length === 1) {
          const op = processingOps[0];
          const action = op.type === 'upload' ? 'Encrypting' : 'Decrypting';
          const percentage = Math.round(op.progress);
          taskTitle = `${percentage}% ${action}`;
          taskDesc = op.fileName;
        } else if (processingOps.length > 1) {
          const percentage = Math.round(this.getAverageProgress());
          taskTitle = `${percentage}% Processing`;
          taskDesc = `${processingOps.length} files`;
        }
        
        await BackgroundService.updateNotification({
          taskTitle,
          taskDesc,
          progressBar: {
            max: 100,
            value: this.getAverageProgress(),
            indeterminate: false,
          },
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      resolve(undefined);
    });
  };

  // Get average progress of all operations
  private getAverageProgress(): number {
    const operations = Array.from(this.activeOperations.values());
    if (operations.length === 0) return 0;
    
    const total = operations.reduce((sum, op) => sum + op.progress, 0);
    return Math.round(total / operations.length);
  }

  // Stop background service
  private async stopBackgroundService(): Promise<void> {
    if (!this.backgroundServiceRunning) {
      return;
    }

    try {
      await BackgroundService.stop();
      this.backgroundServiceRunning = false;
      console.log('[BackgroundService] Stopped');
    } catch (error) {
      console.warn('[BackgroundService] Failed to stop:', error);
    }
  }

  // Show notification
  private async showNotification(title: string, body: string): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
        },
        trigger: null, // Show immediately
      });
    } catch (error) {
      console.warn('Failed to show notification:', error);
    }
  }

  // Generate unique file ID
  private generateFileId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // Pick document(s)
  async pickDocument(): Promise<FileMetadata[]> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled) {
        return [];
      }

      const files: FileMetadata[] = [];
      for (const file of result.assets) {
        const metadata = await this.secureFile(
          file.uri,
          file.name,
          file.mimeType || "application/octet-stream",
          file.size || 0,
        );
        files.push(metadata);
      }
      return files;
    } catch (error) {
      console.error("Document picker error:", error);
      return [];
    }
  }

  // Pick image(s)
  async pickImage(): Promise<FileMetadata[]> {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Permission denied");
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 1,
        allowsMultipleSelection: true,
        mediaTypes: ImagePicker.MediaTypeOptions.All,
      });

      if (result.canceled) {
        return [];
      }

      const files: FileMetadata[] = [];
      for (const asset of result.assets) {
        const fileName = asset.uri.split("/").pop() || "image.jpg";
        const fileSize = asset.fileSize || 0;
        const mimeType =
          asset.mimeType ||
          (asset.type === "video" ? "video/mp4" : "image/jpeg");

        const metadata = await this.secureFile(
          asset.uri,
          fileName,
          mimeType,
          fileSize,
        );
        files.push(metadata);
      }

      return files;
    } catch (error) {
      console.error("Image picker error:", error);
      return [];
    }
  }

  // Take photo
  async takePhoto(): Promise<FileMetadata | null> {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Permission denied");
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
      });

      if (result.canceled) {
        return null;
      }

      const asset = result.assets[0];
      const fileName = `photo_${Date.now()}.jpg`;
      const fileSize = asset.fileSize || 0;

      return await this.secureFile(asset.uri, fileName, "image/jpeg", fileSize);
    } catch (error) {
      console.error("Camera error:", error);
      return null;
    }
  }

  // Encrypt and store file securely (with progress tracking)
  private async secureFile(
    sourceUri: string,
    originalName: string,
    fileType: string,
    size: number,
  ): Promise<FileMetadata> {
    await this.initializeSecureStorage();

    const fileId = this.generateFileId();
    const operationId = fileId;
    
    // Create operation tracker
    const operation: FileOperation = {
      id: operationId,
      type: 'upload',
      fileName: originalName,
      progress: 0,
      status: 'processing',
    };
    this.activeOperations.set(operationId, operation);
    
    // Start background service (will show progress notification)
    // await this.createPersistentNotification(operationId, operation);
    this.activeBackgroundOperations++;
    await this.startBackgroundService();

    try {
      const encryptedFileName = `${fileId}.enc`;
      const encryptedPath = `${this.SECURE_DIR}${encryptedFileName}`;

      // Update progress: Reading file
      this.updateOperation(operationId, { progress: 10 });

      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(sourceUri, {
        encoding: "base64" as any,
      });

      // Update progress: Encrypting
      this.updateOperation(operationId, { progress: 30 });

      // Encrypt file content with progress (use chunked for large files)
      let encryptedContent: string;
      if (fileContent.length > 1000000) { // > 1MB use chunked
        encryptedContent = await SecurityService.encryptDataChunked(
          fileContent,
          fileId,
          (chunkProgress) => {
            this.updateOperation(operationId, { 
              progress: 30 + (chunkProgress * 0.5) // 30-80%
            });
          }
        );
      } else {
        encryptedContent = SecurityService.encryptData(fileContent, fileId);
      }

      // Update progress: Writing file
      this.updateOperation(operationId, { progress: 85 });

      // Write encrypted file
      await FileSystem.writeAsStringAsync(encryptedPath, encryptedContent, {
        encoding: "utf8" as any,
      });

      // Generate and store thumbnail if image
      let encryptedThumbnail: string | undefined;
      if (fileType.startsWith("image/")) {
        await this.generateThumbnail(fileContent, fileId, fileType);
        encryptedThumbnail = 'stored'; // Flag that thumbnail exists
      }

      // Update progress: Finalizing
      this.updateOperation(operationId, { progress: 95 });

      const metadata: FileMetadata = {
        id: fileId,
        originalName,
        encryptedPath,
        fileType,
        size,
        encryptedThumbnail,
        timestamp: Date.now(),
      };

      // Store metadata
      SecurityService.storeFileMetadata(metadata);

      // Delete original file if it was copied to cache
      try {
        if (sourceUri.includes("cache")) {
          await FileSystem.deleteAsync(sourceUri, { idempotent: true });
        }
      } catch (error) {
        console.warn("Could not delete cached file:", error);
      }

      // Complete operation
      this.updateOperation(operationId, { progress: 100, status: 'completed' });
      
      // Stop background service if no more operations
      // await this.removePersistentNotification(operationId);
      this.activeBackgroundOperations--;
      if (this.activeBackgroundOperations === 0) {
        await this.stopBackgroundService();
      }
      
      // Show completion notification
      await this.showNotification(
        "File Secured ✓",
        `${originalName} has been encrypted and stored securely`
      );

      // Clean up operation after delay
      setTimeout(() => this.activeOperations.delete(operationId), 3000);

      return metadata;
    } catch (error) {
      this.updateOperation(operationId, { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Stop background service if no more operations
      // await this.removePersistentNotification(operationId);
      this.activeBackgroundOperations--;
      if (this.activeBackgroundOperations === 0) {
        await this.stopBackgroundService();
      }
      
      await this.showNotification(
        "Upload Failed ✗",
        `Failed to secure ${originalName}`
      );
      
      throw error;
    }
  }

  // Generate thumbnail for images (stored separately)
  private async generateThumbnail(
    base64Data: string,
    fileId: string,
    fileType: string
  ): Promise<void> {
    try {
      // Take first 50KB as thumbnail data (rough compression)
      const thumbnailData = base64Data.substring(0, 50000);
      const thumbnailPath = `${this.THUMBNAIL_DIR}${fileId}.thumb`;
      
      // Encrypt thumbnail
      const encryptedThumb = SecurityService.encryptData(thumbnailData, `${fileId}_thumb`);
      
      // Store thumbnail
      await FileSystem.writeAsStringAsync(thumbnailPath, encryptedThumb, {
        encoding: "utf8" as any,
      });
    } catch (error) {
      console.warn('Failed to generate thumbnail:', error);
    }
  }

  // Get thumbnail for file
  async getThumbnail(fileId: string): Promise<string | null> {
    try {
      const thumbnailPath = `${this.THUMBNAIL_DIR}${fileId}.thumb`;
      const thumbInfo = await FileSystem.getInfoAsync(thumbnailPath);
      
      if (!thumbInfo.exists) return null;
      
      const encryptedThumb = await FileSystem.readAsStringAsync(thumbnailPath, {
        encoding: "utf8" as any,
      });
      
      return SecurityService.decryptData(encryptedThumb, `${fileId}_thumb`);
    } catch (error) {
      console.warn('Failed to get thumbnail:', error);
      return null;
    }
  }

  // Decrypt and read file (with progress tracking)
  async readSecureFile(
    fileId: string,
    onProgress?: (progress: number) => void
  ): Promise<string | null> {
    try {
      const metadata = SecurityService.getAllFileMetadata().find(
        (f) => f.id === fileId,
      );
      if (!metadata) {
        throw new Error("File not found");
      }

      if (onProgress) onProgress(10);

      // Read encrypted file
      const encryptedContent = await FileSystem.readAsStringAsync(
        metadata.encryptedPath,
        {
          encoding: "utf8" as any,
        },
      );

      if (onProgress) onProgress(30);

      // Decrypt content with progress for large files
      let decryptedContent: string;
      if (encryptedContent.length > 1000000) { // > 1MB
        decryptedContent = await SecurityService.decryptDataChunked(
          encryptedContent,
          fileId,
          (chunkProgress) => {
            if (onProgress) onProgress(30 + (chunkProgress * 0.6)); // 30-90%
          }
        );
      } else {
        decryptedContent = SecurityService.decryptData(encryptedContent, fileId);
      }

      if (onProgress) onProgress(100);

      return decryptedContent;
    } catch (error) {
      console.error("Read secure file error:", error);
      return null;
    }
  }

  // Delete secure file
  async deleteSecureFile(fileId: string): Promise<boolean> {
    try {
      const metadata = SecurityService.getAllFileMetadata().find(
        (f) => f.id === fileId,
      );
      if (!metadata) {
        return false;
      }

      // Delete encrypted file
      await FileSystem.deleteAsync(metadata.encryptedPath, {
        idempotent: true,
      });

      // Remove metadata
      SecurityService.deleteFileMetadata(fileId);

      return true;
    } catch (error) {
      console.error("Delete secure file error:", error);
      return false;
    }
  }

  // Get file icon based on type (returns Ionicons name)
  getFileIcon(fileType: string): string {
    if (fileType.startsWith("image/")) return "image-outline";
    if (fileType.startsWith("video/")) return "videocam-outline";
    if (fileType.startsWith("audio/")) return "musical-notes-outline";
    if (fileType.includes("pdf")) return "document-text-outline";
    if (fileType.includes("word") || fileType.includes("document"))
      return "document-outline";
    if (fileType.includes("excel") || fileType.includes("sheet"))
      return "grid-outline";
    if (fileType.includes("zip") || fileType.includes("rar"))
      return "archive-outline";
    return "folder-outline";
  }

  // Format file size
  formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }
  // Download file to device storage (with background processing)
  async downloadFile(
    fileId: string,
  ): Promise<{ success: boolean; message: string; fileName?: string; operationId?: string }> {
    const metadata = SecurityService.getAllFileMetadata().find(
      (f) => f.id === fileId,
    );
    if (!metadata) {
      return { success: false, message: "File not found" };
    }

    const operationId = `download_${fileId}_${Date.now()}`;
    
    // Create operation tracker
    const operation: FileOperation = {
      id: operationId,
      type: 'download',
      fileName: metadata.originalName,
      progress: 0,
      status: 'processing',
    };
    this.activeOperations.set(operationId, operation);
    
    // Start background service (will show progress notification)
    // await this.createPersistentNotification(operationId, operation);
    this.activeBackgroundOperations++;
    await this.startBackgroundService();

    // Run download in background-style async operation
    this.performDownload(fileId, operationId).catch(error => {
      console.error('Background download failed:', error);
    });

    return {
      success: true,
      message: `Downloading ${metadata.originalName}...`,
      fileName: metadata.originalName,
      operationId,
    };
  }

  // Perform download operation (runs in background)
  private async performDownload(fileId: string, operationId: string): Promise<void> {
    try {
      const metadata = SecurityService.getAllFileMetadata().find(
        (f) => f.id === fileId,
      );
      if (!metadata) {
        throw new Error("File not found");
      }

      // Decrypt the file with progress
      this.updateOperation(operationId, { progress: 5 });
      
      const decryptedContent = await this.readSecureFile(fileId, (progress) => {
        this.updateOperation(operationId, { progress: 5 + (progress * 0.7) }); // 5-75%
      });
      
      if (!decryptedContent) {
        throw new Error("Failed to decrypt file");
      }

      this.updateOperation(operationId, { progress: 80 });

      // For images and videos, save to media library
      if (
        metadata.fileType.startsWith("image/") ||
        metadata.fileType.startsWith("video/")
      ) {
        // Request permissions
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          throw new Error("Media library permissions not granted");
        }

        this.updateOperation(operationId, { progress: 85 });

        // Create temporary file
        const tempPath = `${FileSystem.cacheDirectory}${metadata.originalName}`;
        await FileSystem.writeAsStringAsync(tempPath, decryptedContent, {
          encoding: "base64" as any,
        });

        this.updateOperation(operationId, { progress: 92 });

        // Save to media library
        await MediaLibrary.createAssetAsync(tempPath);

        // Delete temp file
        await FileSystem.deleteAsync(tempPath, { idempotent: true });

        this.updateOperation(operationId, { progress: 100, status: 'completed' });
        
        // Stop background service if no more operations
        // await this.removePersistentNotification(operationId);
        this.activeBackgroundOperations--;
        if (this.activeBackgroundOperations === 0) {
          await this.stopBackgroundService();
        }
        
        await this.showNotification(
          "Download Complete ✓",
          `${metadata.originalName} saved to gallery`
        );
      } else {
        // For other files, save to Downloads directory
        const downloadPath =
          Platform.OS === "android"
            ? `${FileSystem.documentDirectory}../Download/${metadata.originalName}`
            : `${FileSystem.documentDirectory}${metadata.originalName}`;

        this.updateOperation(operationId, { progress: 90 });

        await FileSystem.writeAsStringAsync(downloadPath, decryptedContent, {
          encoding: "base64" as any,
        });

        this.updateOperation(operationId, { progress: 100, status: 'completed' });
        
        // Stop background service if no more operations
        // await this.removePersistentNotification(operationId);
        this.activeBackgroundOperations--;
        if (this.activeBackgroundOperations === 0) {
          await this.stopBackgroundService();
        }
        
        await this.showNotification(
          "Download Complete ✓",
          `${metadata.originalName} saved to Downloads`
        );
      }

      // Clean up operation after delay
      setTimeout(() => this.activeOperations.delete(operationId), 3000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.updateOperation(operationId, { 
        status: 'failed', 
        error: errorMsg 
      });
      
      // Stop background service if no more operations
      // await this.removePersistentNotification(operationId);
      this.activeBackgroundOperations--;
      if (this.activeBackgroundOperations === 0) {
        await this.stopBackgroundService();
      }
      
      await this.showNotification(
        "Download Failed ✗",
        `Failed to download file: ${errorMsg}`
      );
    }
  }

  // Get all active operations
  getActiveOperations(): FileOperation[] {
    return Array.from(this.activeOperations.values());
  }

  // Get specific operation
  getOperation(operationId: string): FileOperation | undefined {
    return this.activeOperations.get(operationId);
  }

  // Cancel operation (if supported)
  cancelOperation(operationId: string): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.status = 'failed';
      operation.error = 'Cancelled by user';
      this.activeOperations.delete(operationId);
    }
  }
}

export default new FileService();
