import { Buffer } from 'buffer';
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import BackgroundService from "react-native-background-actions";
import * as RNFS from 'react-native-fs';
import "react-native-get-random-values";
import BackgroundTaskManager from "./BackgroundTaskManager";
import SecurityService, { FileMetadata } from "./SecurityService";

// Task names
const BACKGROUND_UPLOAD_TASK = "background-upload-task";
const BACKGROUND_DOWNLOAD_TASK = "background-download-task";
const CHUNK_SIZE = 512 * 1024; // 512KB

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
  // Use RNFS paths for main storage to allow seek/append
  private readonly SECURE_DIR = `${RNFS.DocumentDirectoryPath}/secure/`;
  private readonly THUMBNAIL_DIR = `${RNFS.DocumentDirectoryPath}/thumbnails/`;
  private readonly CACHE_DIR = `${RNFS.CachesDirectoryPath}/decrypted/`;

  private activeOperations: Map<string, FileOperation> = new Map();
  private operationListeners: Map<string, (op: FileOperation) => void> = new Map();
  private backgroundServiceRunning = false;
  private activeBackgroundOperations = 0;
  private cancelledOperations: Set<string> = new Set();

  // Initialize secure directory
  async initializeSecureStorage(): Promise<void> {
    try {
      if (!(await RNFS.exists(this.SECURE_DIR))) {
        await RNFS.mkdir(this.SECURE_DIR);
      }
      if (!(await RNFS.exists(this.THUMBNAIL_DIR))) {
        await RNFS.mkdir(this.THUMBNAIL_DIR);
      }
      if (!(await RNFS.exists(this.CACHE_DIR))) {
        await RNFS.mkdir(this.CACHE_DIR);
      } else {
        // Clean cache on init
        await RNFS.unlink(this.CACHE_DIR);
        await RNFS.mkdir(this.CACHE_DIR);
      }

      // .nomedia for Android
      const nomediaPath = `${this.SECURE_DIR}.nomedia`;
      if (!(await RNFS.exists(nomediaPath))) {
        await RNFS.writeFile(nomediaPath, "", 'utf8');
      }

      await this.requestNotificationPermissions();
      await BackgroundTaskManager.registerBackgroundTask();
    } catch (error) {
      console.warn("Failed to initialize secure storage:", error);
    }
  }

  private async requestNotificationPermissions(): Promise<void> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
    } catch (error) {
      console.warn('Failed to request notification permissions:', error);
    }
  }

  subscribeToOperation(operationId: string, callback: (op: FileOperation) => void): () => void {
    this.operationListeners.set(operationId, callback);
    // Immediate callback with current state
    const op = this.activeOperations.get(operationId);
    if (op) callback(op);
    return () => this.operationListeners.delete(operationId);
  }

  getActiveOperations(): FileOperation[] {
    return Array.from(this.activeOperations.values());
  }

  private updateOperation(operationId: string, updates: Partial<FileOperation>): void {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      Object.assign(operation, updates);
      const listener = this.operationListeners.get(operationId);
      if (listener) listener(operation);
    }
  }

  cancelOperation(operationId: string) {
    if (this.activeOperations.has(operationId)) {
      this.cancelledOperations.add(operationId);
      this.updateOperation(operationId, { status: 'failed', error: 'Cancelled by user' });
      // Clean up after short delay
      setTimeout(() => {
        this.activeOperations.delete(operationId);
        this.cancelledOperations.delete(operationId);
      }, 2000);
    }
  }

  isCancelled(operationId: string): boolean {
    return this.cancelledOperations.has(operationId);
  }

  private async startBackgroundService(): Promise<void> {
    if (this.backgroundServiceRunning) return;
    try {
      await BackgroundService.start(this.backgroundTask, {
        taskName: 'ILocker File Processing',
        taskTitle: 'Processing Files',
        taskDesc: 'Securing your data...',
        taskIcon: { name: 'ic_launcher', type: 'mipmap' },
        color: '#4a90e2',
        linkingURI: 'ilocker://',
        progressBar: { max: 100, value: 0, indeterminate: false },
      });
      this.backgroundServiceRunning = true;
    } catch (error) {
      console.warn('Background service fail:', error);
    }
  }

  private backgroundTask = async () => {
    await new Promise(async (resolve) => {
      while (this.activeBackgroundOperations > 0) {
        const operations = Array.from(this.activeOperations.values()).filter(op => op.status === 'processing');
        if (operations.length > 0) {
          const avgProgress = operations.reduce((sum, op) => sum + op.progress, 0) / operations.length;
          await BackgroundService.updateNotification({
            taskTitle: `${operations.length} Active Operations`,
            taskDesc: `Processing... ${Math.round(avgProgress)}%`,
            progressBar: { max: 100, value: avgProgress, indeterminate: false },
          });
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      resolve(undefined);
    });
  };

  private async stopBackgroundService(): Promise<void> {
    if (!this.backgroundServiceRunning) return;
    try {
      await BackgroundService.stop();
      this.backgroundServiceRunning = false;
    } catch (e) {
      console.warn('Stop bg service fail', e);
    }
  }

  private generateFileId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  // Pick Document
  async pickDocument(): Promise<FileMetadata[]> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return [];

      const files: FileMetadata[] = [];
      for (const file of result.assets) {
        // For Expo Document Picker, uri might be content:// on Android
        // RNFS can read content:// uris on Android usually.
        // Or we might need to copy to cache first (Expo does this 'copyToCacheDirectory: true' -> cache uri).
        files.push(await this.secureFile(file.uri, file.name, file.mimeType || "application/octet-stream", file.size || 0));
      }
      return files;
    } catch (error) {
      console.error("Document picker error:", error);
      return [];
    }
  }

  // Pick Image
  async pickImage(): Promise<FileMetadata[]> {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") throw new Error("Permission denied");

    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 1,
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.All,
    });
    if (result.canceled) return [];

    const files: FileMetadata[] = [];
    for (const asset of result.assets) {
      const fileName = asset.uri.split("/").pop() || "image.jpg";
      const mimeType = asset.mimeType || (asset.type === "video" ? "video/mp4" : "image/jpeg");
      // Get file size if not provided
      let size = asset.fileSize || 0;
      if (size === 0) {
        // Try to get size
        try {
          const stat = await RNFS.stat(asset.uri); // Might fail if it's content:// without copy
          size = stat.size;
        } catch { } // Ignore
      }

      files.push(await this.secureFile(asset.uri, fileName, mimeType, size));
    }
    return files;
  }

  // Take Photo
  async takePhoto(): Promise<FileMetadata | null> {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") throw new Error("Permission denied");

    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (result.canceled) return null;

    const asset = result.assets[0];
    const fileName = `photo_${Date.now()}.jpg`;
    return await this.secureFile(asset.uri, fileName, "image/jpeg", asset.fileSize || 0);
  }

  // Core Encryption Logic (Streamed)
  private async secureFile(sourceUri: string, originalName: string, fileType: string, size: number): Promise<FileMetadata> {
    await this.initializeSecureStorage();
    const fileId = this.generateFileId();
    const operationId = fileId;

    // Start tracking
    const operation: FileOperation = {
      id: operationId,
      type: 'upload',
      fileName: originalName,
      progress: 0,
      status: 'processing',
    };
    this.activeOperations.set(operationId, operation);
    this.activeBackgroundOperations++;
    this.startBackgroundService();

    try {
      const destPath = `${this.SECURE_DIR}${fileId}.enc`;

      // We might need to handle content:// URIs by copying to a temp file first if RNFS read fails
      // But typically RNFS.readFile works with valid file URIs.
      // Expo cache URIs are file://.

      let readPath = sourceUri;
      if (sourceUri.startsWith('content://')) {
        // Copy to temp for stable reading
        const tempPath = `${RNFS.CachesDirectoryPath}/${fileId}_temp`;
        // Expo FileSystem copy works with content:// better
        await FileSystem.copyAsync({ from: sourceUri, to: tempPath });
        readPath = tempPath;
      } else if (sourceUri.startsWith('file://')) {
        // Determine if we need to decode URI
        readPath = sourceUri.replace('file://', '');
        readPath = decodeURIComponent(readPath);
      }

      // Check file stats
      const stat = await RNFS.stat(readPath);
      const fileSize = parseInt(stat.size.toString()); // Ensure number

      let offset = 0;
      let chunkIndex = 0;

      // Create file
      await RNFS.writeFile(destPath, '', 'utf8');

      while (offset < fileSize) {
        if (this.isCancelled(operationId)) throw new Error('Cancelled');

        const length = Math.min(CHUNK_SIZE, fileSize - offset);

        // Read chunk as base64
        const chunkBase64 = await RNFS.read(readPath, length, offset, 'base64');
        const chunkBuffer = Buffer.from(chunkBase64, 'base64');

        // Encrypt (chunkIndex is key to deterministic IV)
        // Note: Using unique ID per chunk for IV derivation
        const encryptedBuffer = SecurityService.encryptBuffer(chunkBuffer, `${fileId}_chunk_${chunkIndex}`);

        // Format: [4 bytes length][Encrypted Data]
        const lengthHeader = Buffer.alloc(4);
        lengthHeader.writeUInt32BE(encryptedBuffer.length, 0);

        // Combine header + encrypted data
        const packet = Buffer.concat([lengthHeader, encryptedBuffer]);

        // Append to file (RNFS append expects base64 for binary write)
        await RNFS.appendFile(destPath, packet.toString('base64'), 'base64');

        offset += length;
        chunkIndex++;

        const progress = Math.min(95, (offset / fileSize) * 100);
        this.updateOperation(operationId, { progress });

        // Yield to UI
        await new Promise(r => setTimeout(r, 0));
      }

      // Generate thumbnail if image/video
      let encryptedThumbnail: string | undefined;
      // Handle Image/Video thumbnail generation... (omitted for brevity, can keep old logic mostly)
      // Actually let's try to grab a thumbnail from original file if it's small or use expo-video-thumbnails
      if (fileType.startsWith('image/')) {
        try {
          // Read small chunk for thumb
          const thumbData = await RNFS.read(readPath, 50000, 0, 'base64');
          const encryptedThumb = SecurityService.encryptData(thumbData, `${fileId}_thumb`);
          await RNFS.writeFile(`${this.THUMBNAIL_DIR}${fileId}.thumb`, encryptedThumb, 'utf8');
          encryptedThumbnail = 'stored';
        } catch (e) { }
      }

      // Clean up temp
      if (sourceUri !== readPath) {
        await RNFS.unlink(readPath);
      }

      const metadata: FileMetadata = {
        id: fileId,
        originalName,
        encryptedPath: destPath,
        fileType,
        size: fileSize,
        encryptedThumbnail,
        timestamp: Date.now(),
        version: 2 // Mark as Streaming Version
      };

      SecurityService.storeFileMetadata(metadata);

      this.updateOperation(operationId, { progress: 100, status: 'completed' });
      await Notifications.scheduleNotificationAsync({
        content: { title: "File Secured ✓", body: originalName },
        trigger: null,
      });

      return metadata;

    } catch (error: any) {
      this.updateOperation(operationId, { status: 'failed', error: error.message });
      throw error;
    } finally {
      this.activeBackgroundOperations--;
      if (this.activeBackgroundOperations === 0) this.stopBackgroundService();
      setTimeout(() => this.activeOperations.delete(operationId), 5000);
    }
  }

  // Decrypt to Temp File (for Preview/Sharing)
  async getSecureFileUri(fileId: string, onProgress?: (p: number) => void): Promise<string | null> {
    const metadata = SecurityService.getAllFileMetadata().find(f => f.id === fileId);
    if (!metadata) throw new Error("File not found");

    const destPath = `${this.CACHE_DIR}${fileId}_decrypted.${this.getExtension(metadata.originalName)}`;

    // Check if already decrypted
    if (await RNFS.exists(destPath)) {
      if (onProgress) onProgress(100);
      return `file://${destPath}`;
    }

    try {
      if (metadata.version === 2) {
        // V2: Streaming format [Length][Chunk]...
        const fileStat = await RNFS.stat(metadata.encryptedPath);
        const totalSize = parseInt(fileStat.size.toString());
        let offset = 0;
        let chunkIndex = 0;

        await RNFS.writeFile(destPath, '', 'utf8'); // Empty file

        while (offset < totalSize) {
          // Read 4 bytes length
          const headerBase64 = await RNFS.read(metadata.encryptedPath, 4, offset, 'base64');
          const headerBuf = Buffer.from(headerBase64, 'base64');
          const chunkLen = headerBuf.readUInt32BE(0);
          offset += 4;

          // Read chunk
          const chunkBase64 = await RNFS.read(metadata.encryptedPath, chunkLen, offset, 'base64');
          const chunkBuf = Buffer.from(chunkBase64, 'base64');

          // Decrypt
          const decryptedBuf = SecurityService.decryptBuffer(chunkBuf, `${fileId}_chunk_${chunkIndex}`);

          // Append
          await RNFS.appendFile(destPath, decryptedBuf.toString('base64'), 'base64');

          offset += chunkLen;
          chunkIndex++;

          if (onProgress) onProgress((offset / totalSize) * 100);
          // Yield to UI
          await new Promise(r => setTimeout(r, 0));
        }
      } else {
        // V1: Legacy
        if (onProgress) onProgress(10);
        const content = await RNFS.readFile(metadata.encryptedPath, 'utf8');
        if (onProgress) onProgress(50);
        const decryptedString = await SecurityService.decryptDataChunked(content, fileId);
        if (onProgress) onProgress(90);
        await RNFS.writeFile(destPath, decryptedString, 'base64');
      }

      if (onProgress) onProgress(100);
      return `file://${destPath}`;
    } catch (error) {
      console.error("Decryption failed:", error);
      return null;
    }
  }

  // Read Secure File (Legacy Compat - returns string)
  // WARNING: Will crash on large files. Use only for small files/thumbnails
  async readSecureFile(fileId: string, onProgress?: (p: number) => void): Promise<string | null> {
    const uri = await this.getSecureFileUri(fileId);
    if (!uri) return null;
    if (onProgress) onProgress(100);
    // Read back as base64 string
    return await RNFS.readFile(uri.replace('file://', ''), 'base64');
  }

  // Delete
  async deleteSecureFile(fileId: string): Promise<boolean> {
    const metadata = SecurityService.getAllFileMetadata().find(f => f.id === fileId);
    if (!metadata) return false;
    try {
      if (await RNFS.exists(metadata.encryptedPath)) await RNFS.unlink(metadata.encryptedPath);
      const thumbPath = `${this.THUMBNAIL_DIR}${fileId}.thumb`;
      if (await RNFS.exists(thumbPath)) await RNFS.unlink(thumbPath);
      SecurityService.deleteFileMetadata(fileId);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Download (restore)
  async downloadFile(fileId: string): Promise<{ success: boolean; message: string }> {
    try {
      const uri = await this.getSecureFileUri(fileId);
      if (!uri) throw new Error("Decryption failed");

      const metadata = SecurityService.getAllFileMetadata().find(f => f.id === fileId);

      if (Platform.OS === 'android') {
        // Save to Download folder
        // Need permission? modern android uses MediaStore or SAF. 
        // RNFS.DownloadDirectoryPath works usually.
        const dest = `${RNFS.DownloadDirectoryPath}/${metadata?.originalName}`;
        await RNFS.copyFile(uri.replace('file://', ''), dest);
        return { success: true, message: `Saved to ${dest}` };
      } else {
        // Share sheet
        // expo-sharing or save to media lib
        if (await MediaLibrary.getPermissionsAsync().then(r => r.granted)) {
          await MediaLibrary.saveToLibraryAsync(uri);
          return { success: true, message: "Saved to Photos" };
        }
        return { success: false, message: "Permission denied" };
      }
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Helpers
  async getThumbnail(fileId: string): Promise<string | null> {
    try {
      const path = `${this.THUMBNAIL_DIR}${fileId}.thumb`;
      if (await RNFS.exists(path)) {
        const enc = await RNFS.readFile(path, 'utf8');
        return SecurityService.decryptData(enc, `${fileId}_thumb`);
      }
    } catch { }
    return null;
  }

  getFileIcon(fileType: string): string {
    if (fileType.startsWith("image/")) return "image-outline";
    if (fileType.startsWith("video/")) return "videocam-outline";
    if (fileType.startsWith("audio/")) return "musical-notes-outline";
    if (fileType.includes("pdf")) return "document-text-outline";
    if (fileType.includes("word") || fileType.includes("document")) return "document-outline";
    if (fileType.includes("excel") || fileType.includes("sheet")) return "grid-outline";
    if (fileType.includes("zip") || fileType.includes("rar")) return "archive-outline";
    return "folder-outline";
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  private getExtension(filename: string): string {
    return filename.split('.').pop() || 'dat';
  }
}

export default new FileService();
