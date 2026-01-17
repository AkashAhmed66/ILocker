import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";
import "react-native-get-random-values";
import SecurityService, { FileMetadata } from "./SecurityService";

class FileService {
  private readonly SECURE_DIR = `${FileSystem.documentDirectory || "file:///"}secure/`;

  // Initialize secure directory
  async initializeSecureStorage(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.SECURE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.SECURE_DIR, {
          intermediates: true,
        });
      }

      // Create .nomedia file for Android
      const nomediaPath = `${this.SECURE_DIR}.nomedia`;
      const nomediaInfo = await FileSystem.getInfoAsync(nomediaPath);
      if (!nomediaInfo.exists) {
        await FileSystem.writeAsStringAsync(nomediaPath, "");
      }
    } catch (error) {
      console.warn("Failed to initialize secure storage:", error);
    }
  }

  // Generate unique file ID
  private generateFileId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // Pick document
  async pickDocument(): Promise<FileMetadata | null> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return null;
      }

      const file = result.assets[0];
      return await this.secureFile(
        file.uri,
        file.name,
        file.mimeType || "application/octet-stream",
        file.size || 0,
      );
    } catch (error) {
      console.error("Document picker error:", error);
      return null;
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
        const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        
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

  // Encrypt and store file securely
  private async secureFile(
    sourceUri: string,
    originalName: string,
    fileType: string,
    size: number,
  ): Promise<FileMetadata> {
    await this.initializeSecureStorage();

    const fileId = this.generateFileId();
    const encryptedFileName = `${fileId}.enc`;
    const encryptedPath = `${this.SECURE_DIR}${encryptedFileName}`;

    // Read file content
    const fileContent = await FileSystem.readAsStringAsync(sourceUri, {
      encoding: "base64" as any,
    });

    // Encrypt file content
    const encryptedContent = SecurityService.encryptData(fileContent, fileId);

    // Write encrypted file
    await FileSystem.writeAsStringAsync(encryptedPath, encryptedContent, {
      encoding: "utf8" as any,
    });

    // Generate encrypted thumbnail if image
    let encryptedThumbnail: string | undefined;
    if (fileType.startsWith("image/")) {
      // Use first 1000 chars as thumbnail placeholder
      encryptedThumbnail = encryptedContent.substring(0, 1000);
    }

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

    return metadata;
  }

  // Decrypt and read file
  async readSecureFile(fileId: string): Promise<string | null> {
    try {
      const metadata = SecurityService.getAllFileMetadata().find(
        (f) => f.id === fileId,
      );
      if (!metadata) {
        throw new Error("File not found");
      }

      // Read encrypted file
      const encryptedContent = await FileSystem.readAsStringAsync(
        metadata.encryptedPath,
        {
          encoding: "utf8" as any,
        },
      );

      // Decrypt content
      const decryptedContent = SecurityService.decryptData(
        encryptedContent,
        fileId,
      );

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
  // Download file to device storage
  async downloadFile(
    fileId: string,
  ): Promise<{ success: boolean; message: string; fileName?: string }> {
    try {
      const metadata = SecurityService.getAllFileMetadata().find(
        (f) => f.id === fileId,
      );
      if (!metadata) {
        return { success: false, message: "File not found" };
      }

      // Decrypt the file
      const decryptedContent = await this.readSecureFile(fileId);
      if (!decryptedContent) {
        return { success: false, message: "Failed to decrypt file" };
      }

      // For images and videos, save to media library
      if (
        metadata.fileType.startsWith("image/") ||
        metadata.fileType.startsWith("video/")
      ) {
        // Request permissions
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          return {
            success: false,
            message: "Please grant media library permissions to download files",
          };
        }

        // Create temporary file
        const tempPath = `${FileSystem.cacheDirectory}${metadata.originalName}`;
        await FileSystem.writeAsStringAsync(tempPath, decryptedContent, {
          encoding: "base64" as any,
        });

        // Save to media library
        await MediaLibrary.createAssetAsync(tempPath);

        // Delete temp file
        await FileSystem.deleteAsync(tempPath, { idempotent: true });

        return {
          success: true,
          message: `${metadata.originalName} has been saved to your gallery`,
          fileName: metadata.originalName,
        };
      } else {
        // For other files, save to Downloads directory
        const downloadPath =
          Platform.OS === "android"
            ? `${FileSystem.documentDirectory}../Download/${metadata.originalName}`
            : `${FileSystem.documentDirectory}${metadata.originalName}`;

        await FileSystem.writeAsStringAsync(downloadPath, decryptedContent, {
          encoding: "base64" as any,
        });

        return {
          success: true,
          message: `${metadata.originalName} has been saved to Downloads`,
          fileName: metadata.originalName,
        };
      }
    } catch (error) {
      console.error("Download file error:", error);
      return {
        success: false,
        message: "Failed to download file. Please try again.",
      };
    }
  }
}

export default new FileService();
