# 📱 Native Setup Instructions

## Important Note About Native Files

The Android native files (MainActivity.java, AndroidManifest.xml) are pre-configured but will show errors until you build the project for the first time.

## Android Setup

### Option 1: Using Expo (Recommended for Quick Start)
```bash
npm start
# Press 'a' for Android
```
This will automatically handle the native configuration.

### Option 2: Building Native Android Project
```bash
npx expo run:android
```
This command will:
1. Generate the native Android project
2. Install dependencies
3. Apply the native configurations
4. Launch on emulator/device

### Manual Android Setup (Advanced)

If you need to manually configure Android:

1. **Generate Android folder**:
   ```bash
   npx expo prebuild --platform android
   ```

2. **MainActivity.java** location:
   ```
   android/app/src/main/java/com/ilocker/secure/MainActivity.java
   ```

3. **Key configurations**:
   - FLAG_SECURE: Prevents screenshots
   - allowBackup="false": Prevents Android backup
   - Permissions: Camera, Storage, Biometric

## iOS Setup

### Option 1: Using Expo (Recommended)
```bash
npm start
# Press 'i' for iOS (Mac only)
```

### Option 2: Building Native iOS Project
```bash
npx expo run:ios
```

### Manual iOS Setup (Advanced)

1. **Generate iOS folder**:
   ```bash
   npx expo prebuild --platform ios
   ```

2. **Info.plist** configurations:
   - NSFaceIDUsageDescription
   - NSCameraUsageDescription
   - NSPhotoLibraryUsageDescription

## Testing Native Features

### Features That Work in Expo Go
- ✅ Basic UI
- ✅ Navigation
- ✅ File picker (limited)
- ⚠️ Some encryption features

### Features That Need Development Build
- ✅ Full biometric authentication
- ✅ Secure Keychain
- ✅ Hardware-backed key storage
- ✅ FLAG_SECURE (screenshot prevention)
- ✅ Full file encryption

## Building Development Build

For full feature testing, build a development build:

### Android Development Build
```bash
npx expo run:android
```
This will:
- Create native Android project
- Install on device/emulator
- Enable all native features

### iOS Development Build (Mac only)
```bash
npx expo run:ios
```
This will:
- Create native iOS project
- Install on simulator
- Enable all native features

## Common Issues

### Issue: Java/Android Errors in VS Code
**Status**: Expected before first build
**Solution**: These errors will disappear after running:
```bash
npx expo run:android
```

### Issue: "Cannot find MainActivity"
**Status**: Normal - native code not generated yet
**Solution**: Run `npx expo prebuild` or `npx expo run:android`

### Issue: Biometric Not Working
**Status**: Expo Go limitation
**Solution**: Build development build with `npx expo run:android`

### Issue: Screenshot Prevention Not Working
**Status**: Needs native build
**Solution**: Run `npx expo run:android` to enable FLAG_SECURE

## Verification Checklist

After building, verify these work:

### Android
- [ ] FLAG_SECURE enabled (screenshots blocked)
- [ ] allowBackup="false" (no Android backup)
- [ ] Biometric prompt works
- [ ] Keystore integration active
- [ ] Camera permissions granted
- [ ] File picker works

### iOS
- [ ] Face ID/Touch ID prompt works
- [ ] Keychain integration active
- [ ] Camera permissions granted
- [ ] File picker works
- [ ] Secure Enclave active

## Production Build

When ready for production:

### Using EAS Build (Recommended)
```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure
eas build:configure

# Build
eas build --platform all --profile production
```

### Using Local Build
```bash
# Android
npx expo run:android --variant release

# iOS (requires Mac + Xcode)
npx expo run:ios --configuration Release
```

## Package Names

The app uses these package identifiers:
- **Android**: com.ilocker.secure
- **iOS**: com.ilocker.secure

These are configured in app.json.

## Permissions Required

### Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

### iOS (Info.plist - configured in app.json)
- NSFaceIDUsageDescription
- NSCameraUsageDescription
- NSPhotoLibraryUsageDescription

## Development Workflow

### Quick Testing (Expo Go)
```bash
npm start
# Scan QR code
```
✅ Fast iteration
❌ Limited native features

### Full Testing (Development Build)
```bash
npx expo run:android  # or run:ios
```
✅ All native features
✅ Full security features
❌ Slower iteration

### Production Testing
```bash
eas build --platform android --profile preview
```
✅ Production-like
✅ Installable APK/IPA

## Next Steps

1. **Start with Expo Go** for UI testing
2. **Build development build** for security features
3. **Test thoroughly** on real devices
4. **Build production** when ready
5. **Submit to stores**

---

**The native code is ready! Just needs to be compiled.** 🚀

Run `npx expo run:android` to get started with full features!