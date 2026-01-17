# 🔐 ILocker - Ultra Secure File Vault

A highly secure React Native application for encrypting and storing sensitive files with military-grade security.

## 🛡️ Security Features

### Core Security Architecture
- ✅ **AES-256-GCM Encryption** - Military-grade authenticated encryption
- ✅ **Hardware-Backed Key Storage** - Secure Enclave (iOS) / Android Keystore
- ✅ **Biometric Authentication** - Fingerprint & Face ID support
- ✅ **Per-File Encryption Keys** - Derived using HMAC from master key
- ✅ **Password Hashing** - PBKDF2 with 10,000+ iterations
- ✅ **No Cloud Backup** - All data stays on device
- ✅ **Screenshot Prevention** - FLAG_SECURE on Android
- ✅ **Root/Jailbreak Detection** - Jail-monkey integration
- ✅ **Auto-Lock** - On background, screen off, or inactivity
- ✅ **Self-Wipe** - After 5 failed authentication attempts

### Data Protection
- ❌ No AsyncStorage usage
- ❌ No plain filesystem storage
- ❌ No authentication tokens in memory
- ❌ Files never stored in Gallery/DCIM
- ✅ Encrypted metadata storage (MMKV)
- ✅ Original files deleted after encryption
- ✅ .nomedia file for Android privacy

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ or 22+
- Expo CLI
- iOS Simulator (Mac) or Android Emulator

### Installation

1. **Clone and Install Dependencies**
   ```bash
   cd ILocker
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm start
   ```

3. **Run on Device**
   - For iOS: Press `i` or `npm run ios`
   - For Android: Press `a` or `npm run android`

### First Time Setup
1. App will prompt you to create a master password
2. Choose a strong password (minimum 6 characters)
3. ⚠️ **This password cannot be recovered if forgotten**
4. Biometric authentication will be automatically enabled if available

## 📱 Features

### Authentication
- **Initial Setup**: Mandatory password creation on first launch
- **Login**: Password or biometric authentication
- **Change Password**: Update master password from settings
- **Auto-Lock**: App locks automatically on:
  - App backgrounding
  - Screen off
  - 5 minutes of inactivity

### File Management
- **Upload Documents**: Pick any file type
- **Add Photos**: From gallery or camera
- **Secure Storage**: All files encrypted with unique keys
- **File Preview**: View images and file info
- **Delete Files**: Long-press or tap delete button

### User Interface
- **Dark Theme**: Professional dark mode interface
- **Smooth Animations**: Native-feeling interactions
- **Pull to Refresh**: Update file list
- **Empty State**: Helpful onboarding

## 🔧 Technical Stack

### Core Libraries
```json
{
  "react-native": "0.81.5",
  "expo": "~54.0",
  "expo-router": "~6.0",
  "react-native-keychain": "^8.x",
  "react-native-biometrics": "^3.x",
  "react-native-mmkv": "^2.x",
  "crypto-js": "^4.x",
  "jail-monkey": "^3.x"
}
```

### Security Services
- **SecurityService.ts**: Authentication, encryption, key management
- **FileService.ts**: Secure file operations and storage

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│         User Interface Layer            │
│  (SetPassword, Login, Home screens)     │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Security Service                │
│  - Master Key Management                │
│  - Password Hashing (PBKDF2)           │
│  - Biometric Authentication            │
│  - Auto-Lock & Inactivity Timer        │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Encryption Layer                │
│  - AES-256-GCM Encryption              │
│  - HMAC Key Derivation                 │
│  - Per-File Encryption Keys            │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Storage Layer                   │
│  - Secure Enclave / Keystore           │
│  - MMKV Encrypted Storage              │
│  - App Sandbox File System             │
└─────────────────────────────────────────┘
```

## 🔒 Security Flow

```
User Authentication
      ↓
Unlock Master Key (from Secure Hardware)
      ↓
Derive File-Specific Key (HMAC)
      ↓
Decrypt File Content (AES-256-GCM)
      ↓
Display in Memory Only (never cache)
      ↓
Auto-Lock on Exit
```

## 📝 File Operations

### Encryption Process
1. User selects file
2. File read as Base64
3. Unique file ID generated
4. File-specific key derived from master key
5. Content encrypted with AES-256-GCM
6. Encrypted file saved in app sandbox
7. Original file deleted
8. Metadata stored in MMKV

### Decryption Process
1. User taps encrypted file
2. Master key verified (user must be authenticated)
3. File-specific key re-derived
4. Content decrypted in memory
5. Displayed to user
6. Content cleared on close

## ⚙️ Configuration

### Android Security (AndroidManifest.xml)
```xml
<application android:allowBackup="false">
  <!-- Prevents Android backup -->
</application>
```

### iOS Security (app.json)
```json
{
  "ios": {
    "infoPlist": {
      "NSFaceIDUsageDescription": "Unlock secure files",
      "UIBackgroundModes": ["fetch"]
    }
  }
}
```

## 🚨 Security Warnings

### ⚠️ Important Notes
1. **Password Recovery**: There is NO way to recover a forgotten password
2. **Failed Attempts**: App wipes all keys after 5 failed login attempts
3. **Rooted Devices**: App warns but doesn't block (configurable)
4. **Backup**: No cloud backup - all data is local only
5. **Screenshots**: Blocked on Android, manual on iOS

### 🔴 DO NOT
- Store password in plain text anywhere
- Modify encryption algorithms
- Enable cloud backup
- Share encryption keys
- Run on compromised devices

## 📦 Building for Production

### Android
```bash
eas build --platform android --profile production
```

### iOS
```bash
eas build --platform ios --profile production
```

## 🐛 Troubleshooting

### Common Issues
1. **"Master key not available"**: User needs to re-authenticate
2. **Biometric not working**: Check device permissions
3. **Files not loading**: Verify MMKV encryption key
4. **App crashes on background**: Check auto-lock implementation

## 📄 License

Private and Confidential - All Rights Reserved

## 👨‍💻 Developer Notes

### Code Structure
```
ILocker/
├── app/
│   ├── _layout.tsx          # Root navigation & auth flow
│   ├── index.tsx            # Entry point redirect
│   ├── set-password.tsx     # Initial password setup
│   ├── login.tsx            # Authentication screen
│   └── home.tsx             # Main file management UI
├── services/
│   ├── SecurityService.ts   # Core security logic
│   └── FileService.ts       # File operations
├── android/                 # Native Android config
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       └── java/.../MainActivity.java
└── app.json                 # Expo configuration
```

### Adding New Features
1. Always maintain encryption standards
2. Test on both iOS and Android
3. Verify auto-lock functionality
4. Check biometric fallback
5. Test with rooted/jailbroken devices

## 🎨 UI/UX Principles

- **Dark Theme**: Reduces eye strain, professional look
- **Minimal Design**: Focus on security, not distractions
- **Clear Actions**: Every button has obvious purpose
- **Feedback**: Loading states, success/error alerts
- **Accessibility**: Large touch targets, readable text

---

**Built with 🔒 Security First**
