// IMPORTANT: Import polyfill FIRST before any crypto operations
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import 'react-native-get-random-values';
import * as Keychain from 'react-native-keychain';
import Crypto from 'react-native-quick-crypto';

// Import MMKV with error handling
let MMKV: any;
let storage: any;

try {
  MMKV = require('react-native-mmkv').MMKV;
  storage = new MMKV({
    id: 'ilocker-secure-storage',
    encryptionKey: 'SD*k3kGhSgfSgli@hkf#fg£gk&w',
  });
  console.log('Using MMKV for storage');
} catch (error) {
  console.warn('MMKV not available, using AsyncStorage fallback');
  // Fallback to AsyncStorage - note: methods are still sync but AsyncStorage operations happen in background
  storage = {
    set: (key: string, value: any) => {
      const strValue = typeof value === 'string' ? value : String(value);
      AsyncStorage.setItem(key, strValue);
    },
    getString: (key: string) => {
      // Return cached value synchronously if available
      return (storage._cache && storage._cache[key]) || null;
    },
    getBoolean: (key: string) => {
      const val = storage.getString(key);
      return val === 'true';
    },
    delete: (key: string) => {
      AsyncStorage.removeItem(key);
      if (storage._cache) delete storage._cache[key];
    },
    clearAll: () => {
      AsyncStorage.clear();
      storage._cache = {};
    },
    _cache: {} as Record<string, string>,
    _initialized: false,
    // Initialize cache from AsyncStorage
    _init: async () => {
      if (storage._initialized) return;
      try {
        const keys = await AsyncStorage.getAllKeys();
        const items = await AsyncStorage.multiGet(keys);
        items.forEach(([key, value]) => {
          if (value) storage._cache[key] = value;
        });
        storage._initialized = true;
        console.log('AsyncStorage cache initialized with', Object.keys(storage._cache).length, 'items');
      } catch (error) {
        console.error('Failed to initialize AsyncStorage cache:', error);
      }
    },
  };
  // Initialize cache immediately and wait for it
  (async () => {
    await storage._init();
  })();
}

// Import JailMonkey with error handling
let JailMonkey: any;
try {
  JailMonkey = require('jail-monkey').default;
} catch (error) {
  console.warn('JailMonkey not available, skipping device security checks');
  // Fallback for development/web
  JailMonkey = {
    isJailBroken: () => false,
    canMockLocation: () => false,
    isOnExternalStorage: () => false,
  };
}

export interface FileMetadata {
  id: string;
  originalName: string;
  encryptedPath: string;
  fileType: string;
  size: number;
  encryptedThumbnail?: string;
  timestamp: number;
  version?: number;
}

class SecurityService {
  private masterKey: Buffer | null = null;
  private failedAttempts: number = 0;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // Check if device is compromised
  async checkDeviceSecurity(): Promise<{ isSecure: boolean; reason?: string }> {
    try {
      if (JailMonkey.isJailBroken()) {
        return { isSecure: false, reason: 'Device is jailbroken/rooted' };
      }
      if (JailMonkey.canMockLocation()) {
        return { isSecure: false, reason: 'Mock location is enabled' };
      }
      if (JailMonkey.isOnExternalStorage()) {
        return { isSecure: false, reason: 'App is running on external storage' };
      }
      return { isSecure: true };
    } catch (error) {
      // JailMonkey not available (Expo Go or web)
      console.warn('JailMonkey security checks not available:', error);
      return { isSecure: true }; // Assume secure in development
    }
  }

  // Check if password is set
  async isPasswordSet(): Promise<boolean> {
    try {
      // Check Keychain first (persists across app restarts)
      let credentials;
      try {
        credentials = await Keychain.getGenericPassword({
          service: 'com.ilocker.password',
        });
      } catch {
        credentials = await Keychain.getGenericPassword();
      }

      if (credentials && credentials.password) {
        // Password exists in Keychain, update storage flag
        storage.set('password_set', true);
        return true;
      }

      return false;
    } catch (error) {
      console.warn('Failed to check password:', error);
      return storage.getBoolean('password_set') || false;
    }
  }

  // Hash password with salt using native PBKDF2
  private hashPassword(password: string, salt: string): string {
    // Original CryptoJS.PBKDF2 uses SHA1 by default, keySize 256/32 = 32 bytes
    const key = Crypto.pbkdf2Sync(
      password,
      salt,
      5000,
      32, // 256 bits = 32 bytes
      'sha1'
    );
    return key.toString('hex');
  }

  // Generate random salt
  private generateSalt(): string {
    return Crypto.randomBytes(16).toString('hex'); // 16 bytes = 128 bits
  }

  // Set initial password
  async setPassword(password: string): Promise<void> {
    try {
      const salt = this.generateSalt();
      const hashedPassword = this.hashPassword(password, salt);

      // Store password in keychain
      try {
        await Keychain.setGenericPassword('ilocker_user', hashedPassword, {
          service: 'com.ilocker.password',
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch (keychainError) {
        // Fallback: try without options
        console.warn('Keychain with options failed, using basic storage');
        await Keychain.setGenericPassword('ilocker_user', hashedPassword);
      }

      // Store salt in keychain as well (for persistence)
      try {
        await Keychain.setGenericPassword('ilocker_salt', salt, {
          service: 'com.ilocker.salt',
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch {
        // Fallback without options
        await Keychain.setInternetCredentials('ilocker_salt', 'ilocker_salt', salt);
      }

      storage.set('password_salt', salt);
      storage.set('password_set', true);

      // Generate and store master key
      await this.generateMasterKey(password);
    } catch (error) {
      console.error('Failed to set password:', error);
      throw new Error('Failed to set password. Please try again.');
    }
  }

  // Change password
  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    const isValid = await this.verifyPassword(oldPassword);
    if (!isValid) {
      return false;
    }

    await this.setPassword(newPassword);
    return true;
  }

  // Verify password
  async verifyPassword(password: string): Promise<boolean> {
    try {
      // Get password from keychain
      let credentials;
      try {
        credentials = await Keychain.getGenericPassword({
          service: 'com.ilocker.password',
        });
      } catch {
        credentials = await Keychain.getGenericPassword();
      }

      if (!credentials) {
        return false;
      }

      // Get salt from keychain with fallback to storage
      let salt = storage.getString('password_salt');
      if (!salt) {
        try {
          const saltCreds = await Keychain.getGenericPassword({
            service: 'com.ilocker.salt',
          });
          if (saltCreds) {
            salt = saltCreds.password;
            storage.set('password_salt', salt); // Cache it
          }
        } catch {
          try {
            const internetCreds = await Keychain.getInternetCredentials('ilocker_salt');
            if (internetCreds) {
              salt = internetCreds.password;
              storage.set('password_salt', salt); // Cache it
            }
          } catch {
            // Salt not found
          }
        }
      }

      if (!salt) {
        return false;
      }

      // Replicate legacy hash with QuickCrypto for compatibility
      // Original: CryptoJS.PBKDF2(password, salt, { keySize: 256/32, iterations: 5000 }).toString()
      // CryptoJS PBKDF2 uses SHA1 by default.
      const hashedPassword = this.hashPassword(password, salt);

      if (hashedPassword === credentials.password) {
        this.failedAttempts = 0;
        await this.generateMasterKey(password);
        this.startInactivityTimer();
        return true;
      } else {
        this.failedAttempts++;
        if (this.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
          await this.wipeAllKeys();
        }
        return false;
      }
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  // Generate master key
  private async generateMasterKey(password: string): Promise<void> {
    try {
      // Check if we already have a cached master key
      if (this.masterKey) {
        console.log('Master key already cached, skipping regeneration');
        return;
      }

      // Generate a strong master key using password (5K iterations for faster login)
      // Original: CryptoJS.PBKDF2(password, 'ilocker-master-key-salt', { keySize: 256/32, iterations: 5000 })
      // CryptoJS PBKDF2 uses SHA1 by default.
      const masterKeyBuffer = Crypto.pbkdf2Sync(
        password,
        'ilocker-master-key-salt',
        5000,
        32, // 256 bits = 32 bytes
        'sha1'
      );

      this.masterKey = masterKeyBuffer;
      const masterKeyHex = masterKeyBuffer.toString('hex');
      console.log('Master key generated and cached successfully');

      // Try to store master key in secure keychain for session persistence
      try {
        await Keychain.setGenericPassword('ilocker_master', masterKeyHex, {
          service: 'com.ilocker.masterkey',
          accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch {
        // Fallback: store without options
        await Keychain.setGenericPassword('ilocker_master', masterKeyHex);
      }
    } catch (error) {
      console.error('Failed to generate master key:', error);
      throw error;
    }
  }

  // Try to restore master key from keychain (avoids regeneration)
  async restoreMasterKey(): Promise<boolean> {
    try {
      let credentials;
      try {
        credentials = await Keychain.getGenericPassword({
          service: 'com.ilocker.masterkey',
        });
      } catch {
        credentials = await Keychain.getGenericPassword();
      }

      if (credentials && credentials.password) {
        this.masterKey = Buffer.from(credentials.password, 'hex');
        console.log('Master key restored from keychain');
        this.startInactivityTimer();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to restore master key:', error);
      return false;
    }
  }

  // Derive file-specific encryption key
  private deriveFileKey(fileId: string): Buffer {
    if (!this.masterKey) {
      console.error('Master key not available! Auth status:', this.isAuthenticated());
      throw new Error('Master key not available. Please authenticate first.');
    }
    // Original: CryptoJS.HmacSHA256(fileId, this.masterKey);
    // We must pass the key as buffer
    return Crypto.createHmac('sha256', this.masterKey).update(fileId).digest();
  }

  // Generate deterministic IV from fileId (so same file always has same IV)
  private generateDeterministicIV(fileId: string): Buffer {
    // Original: CryptoJS.HmacSHA256(fileId, 'ilocker-iv-salt'), then take first 16 bytes
    const hash = Crypto.createHmac('sha256', 'ilocker-iv-salt').update(fileId).digest();
    return hash.subarray(0, 16); // Take first 16 bytes for IV
  }

  // Encrypt string data (returns Base64) - Legacy compatibility
  encryptData(data: string, fileId: string): string {
    const buffer = Buffer.from(data, 'utf8');
    const encrypted = this.encryptBuffer(buffer, fileId);
    return encrypted.toString('base64');
  }

  // Decrypt string data (expects Base64, returns string) - Legacy compatibility
  decryptData(encryptedBase64: string, fileId: string): string {
    const buffer = Buffer.from(encryptedBase64, 'base64');
    const decrypted = this.decryptBuffer(buffer, fileId);
    return decrypted.toString('utf8');
  }

  // Encrypt Buffer (Native)
  encryptBuffer(data: Buffer, fileId: string): Buffer {
    this.resetInactivityTimer(); // Keep session active
    const key = this.deriveFileKey(fileId);
    const iv = this.generateDeterministicIV(fileId);

    const cipher = Crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return encrypted;
  }

  // Decrypt Buffer (Native)
  decryptBuffer(encryptedData: Buffer, fileId: string): Buffer {
    this.resetInactivityTimer(); // Keep session active
    const key = this.deriveFileKey(fileId);
    const iv = this.generateDeterministicIV(fileId);

    const decipher = Crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    return decrypted;
  }

  // Encrypt large data in chunks (non-blocking with progress callback)
  async encryptDataChunked(
    data: string,
    fileId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    this.resetInactivityTimer();
    const CHUNK_SIZE = 500000; // 500KB chunks for better performance
    const dataBuffer = Buffer.from(data, 'utf8');
    const totalChunks = Math.ceil(dataBuffer.length / CHUNK_SIZE);
    const encryptedChunks: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      // Yield to main thread between chunks to keep UI responsive
      await new Promise(resolve => setTimeout(resolve, 0));

      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, dataBuffer.length);
      const chunk = dataBuffer.subarray(start, end);

      // Each chunk is encrypted independently with a unique fileId for its key/IV derivation
      const encryptedChunk = this.encryptBuffer(chunk, `${fileId}_chunk_${i}`);
      encryptedChunks.push(encryptedChunk.toString('base64')); // Store as base64 string

      if (onProgress) {
        onProgress(((i + 1) / totalChunks) * 100);
      }
    }

    // Combine chunks with delimiter
    return encryptedChunks.join('|||CHUNK|||');
  }

  // Decrypt large data in chunks (non-blocking with progress callback)
  async decryptDataChunked(
    encryptedData: string,
    fileId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    this.resetInactivityTimer();

    // Check if data is chunked
    if (!encryptedData.includes('|||CHUNK|||')) {
      // Old format or small file - decrypt directly
      return this.decryptData(encryptedData, fileId);
    }

    const chunks = encryptedData.split('|||CHUNK|||');
    const decryptedBuffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      // Yield to main thread between chunks
      await new Promise(resolve => setTimeout(resolve, 0));

      // Each chunk is decrypted independently using its unique fileId
      const encryptedChunkBuffer = Buffer.from(chunks[i], 'base64');
      const decryptedChunk = this.decryptBuffer(encryptedChunkBuffer, `${fileId}_chunk_${i}`);
      decryptedBuffers.push(decryptedChunk);

      if (onProgress) {
        onProgress(((i + 1) / chunks.length) * 100);
      }
    }

    return Buffer.concat(decryptedBuffers).toString('utf8');
  }

  // Store file metadata
  storeFileMetadata(metadata: FileMetadata): void {
    const allFiles = this.getAllFileMetadata();
    allFiles.push(metadata);
    const filesJson = JSON.stringify(allFiles);
    storage.set('files', filesJson);
    // Update cache immediately
    if (storage._cache) {
      storage._cache['files'] = filesJson;
    }
  }

  // Get all file metadata
  getAllFileMetadata(): FileMetadata[] {
    const filesJson = storage.getString('files');
    return filesJson ? JSON.parse(filesJson) : [];
  }

  // Delete file metadata
  deleteFileMetadata(fileId: string): void {
    const allFiles = this.getAllFileMetadata();
    const filtered = allFiles.filter((f) => f.id !== fileId);
    const filesJson = JSON.stringify(filtered);
    storage.set('files', filesJson);
    // Update cache immediately
    if (storage._cache) {
      storage._cache['files'] = filesJson;
    }
  }

  // Lock the app
  lock(): void {
    console.log('Locking app and clearing master key');
    this.masterKey = null;
    this.clearInactivityTimer();
  }

  // Start inactivity timer
  private startInactivityTimer(): void {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      this.lock();
    }, this.INACTIVITY_TIMEOUT);
  }

  // Clear inactivity timer
  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  // Reset inactivity timer (call on user interaction)
  resetInactivityTimer(): void {
    if (this.masterKey) {
      this.startInactivityTimer();
    }
  }

  // Wipe all keys (after max failed attempts)
  private async wipeAllKeys(): Promise<void> {
    try {
      try {
        await Keychain.resetGenericPassword({ service: 'com.ilocker.password' });
      } catch {
        await Keychain.resetGenericPassword();
      }
      try {
        try {
          await Keychain.resetGenericPassword({ service: 'com.ilocker.masterkey' });
        } catch {
          // Already reset or not available
        }
      } catch {
        // Safe to ignore
      }
      storage.clearAll();
      this.masterKey = null;
      this.failedAttempts = 0;
    } catch (error) {
      console.error('Failed to wipe keys:', error);
    }
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const isAuth = this.masterKey !== null;
    console.log('isAuthenticated check:', isAuth, 'masterKey exists:', !!this.masterKey);
    return isAuth;
  }
}

export default new SecurityService();
