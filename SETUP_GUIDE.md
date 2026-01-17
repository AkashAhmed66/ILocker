# 🚀 ILocker Setup & Run Guide

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm start
```

### 3. Run on Your Device

#### Option A: Using Expo Go (Quick Test)
1. Install Expo Go from App Store (iOS) or Play Store (Android)
2. Scan the QR code shown in terminal
3. App will load on your device

⚠️ **Note**: Some native features (biometrics, keychain) may not work in Expo Go

#### Option B: Development Build (Recommended for Full Features)
```bash
# For Android
npx expo run:android

# For iOS (Mac only)
npx expo run:ios
```

## 📱 Testing the App

### Initial Setup Flow
1. **First Launch**: App shows "Set Password" screen
2. Enter a strong password (minimum 6 characters)
3. Confirm the password
4. Tap "Set Password & Continue"
5. You'll be redirected to the home screen

### Main Features to Test

#### 1. File Upload
- Tap the **+ button** (bottom right)
- Choose from:
  - 📄 **Document**: Pick any file (PDF, DOC, etc.)
  - 🖼️ **Photo Library**: Select image from gallery
  - 📸 **Take Photo**: Capture new photo

#### 2. File Management
- **View File**: Tap on any file card
- **Delete File**: Long-press file or tap trash icon
- **Pull to Refresh**: Drag down to refresh file list

#### 3. Security Features
- **Lock App**: Tap lock icon (top right)
- **Change Password**: Tap settings icon → Change Password section
- **Biometric Login**: Available on login screen if device supports it

#### 4. Auto-Lock Testing
- Press home button (app goes to background)
- Return to app → Should show login screen
- Or wait 5 minutes of inactivity → Auto-lock triggers

## 🔧 Development Commands

```bash
# Start dev server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Clear cache and restart
npm start --clear

# Lint code
npm run lint
```

## 🐛 Common Issues & Solutions

### Issue: "Cannot find module '@/services/SecurityService'"
**Solution**: 
- Check that files are in `services/` folder
- Restart Metro bundler: `npm start --clear`

### Issue: Biometric authentication not working
**Solution**:
- On Android: Enable fingerprint in device settings
- On iOS: Enable Face ID/Touch ID in Settings → Face ID & Passcode
- For Expo Go: Build development build as biometrics don't work in Expo Go

### Issue: "Password not persisting" or "App forgets password"
**Solution**:
- This is expected in Expo Go for testing
- Build a development build for full keychain support
- Use: `npx expo run:android` or `npx expo run:ios`

### Issue: Camera/Photo permissions denied
**Solution**:
- Go to device Settings → Apps → ILocker → Permissions
- Enable Camera and Storage permissions

### Issue: Files not visible after upload
**Solution**:
- Check console for encryption errors
- Verify SecurityService is initialized
- Try restarting app and re-authenticating

## 📱 Building for Production

### Android APK
```bash
# Using EAS Build (Recommended)
npm install -g eas-cli
eas login
eas build --platform android --profile production

# Or using local build
npx expo run:android --variant release
```

### iOS IPA
```bash
# Using EAS Build (Requires Apple Developer Account)
eas build --platform ios --profile production

# Or using local build
npx expo run:ios --configuration Release
```

## 🔐 Security Testing Checklist

- [ ] Password is required on first launch
- [ ] Password is validated (minimum 6 chars)
- [ ] Login screen shows after setting password
- [ ] Biometric authentication works (if available)
- [ ] Files are encrypted after upload
- [ ] Original files are deleted after encryption
- [ ] File preview works for images
- [ ] File deletion works
- [ ] Change password functionality works
- [ ] App locks on background
- [ ] Auto-lock after 5 minutes inactivity
- [ ] App wipes keys after 5 failed attempts (⚠️ Test carefully!)
- [ ] Screenshots are blocked (Android only)
- [ ] No files visible in Gallery/Photos app

## 📊 Testing Different Scenarios

### Scenario 1: New User
1. Launch app for first time
2. Set password: "SecurePass123"
3. Add 3-5 files (documents and images)
4. Lock and unlock with password
5. Test biometric if available

### Scenario 2: Password Change
1. Login to app
2. Go to Settings
3. Change password from old to new
4. Lock app
5. Try logging in with OLD password (should fail)
6. Login with NEW password (should work)

### Scenario 3: File Operations
1. Upload various file types:
   - PDF document
   - Image (JPG/PNG)
   - Take photo with camera
2. Preview each file
3. Delete files one by one
4. Verify files removed from storage

### Scenario 4: Security
1. Lock app
2. Try entering wrong password 4 times (NOT 5!)
3. Enter correct password
4. Background the app
5. Return - should be locked
6. Login again

## 🎨 UI Testing

### Color Theme
- Background: Dark (#0f0f0f, #1a1a2e)
- Cards: Dark blue (#1a1a2e)
- Borders: Subtle dark (#2a2a3e)
- Primary action: Blue (#4a90e2)
- Text: White (#fff) and Gray (#888, #666)

### Components to Check
- ✅ Login screen gradient
- ✅ Password input fields
- ✅ Rounded buttons with shadows
- ✅ File cards with icons
- ✅ Modal overlays
- ✅ Loading indicators
- ✅ Empty state message

## 📝 Development Tips

### Hot Reload
- Saving files triggers automatic reload
- Press `r` in terminal to manually reload
- Press `shift + r` to restart Metro bundler

### Debugging
- Press `j` to open debugger
- Use `console.log()` in code
- Check Expo DevTools in browser

### Testing on Physical Device
1. Ensure phone and computer on same WiFi
2. Scan QR code from terminal
3. Or enter URL manually in Expo Go

## 🚀 Next Steps

1. **Test All Features**: Go through testing checklist above
2. **Customize UI**: Modify colors in screen files
3. **Add Features**: Extend functionality as needed
4. **Build for Production**: Create release builds
5. **Deploy**: Publish to App Store / Play Store

## 📞 Support

If you encounter issues:
1. Check console logs
2. Review error messages
3. Clear cache: `npm start --clear`
4. Reinstall dependencies: `rm -rf node_modules && npm install`
5. Check Expo documentation: https://docs.expo.dev

---

**Ready to go! Start with `npm start` and scan the QR code!** 🎉