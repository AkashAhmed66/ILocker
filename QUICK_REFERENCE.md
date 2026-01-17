# 🔐 ILocker - Quick Reference Card

## 🎯 What Is ILocker?
**Ultra-secure file vault** with military-grade encryption for React Native

---

## ⚡ Quick Start
```bash
npm install
npm start
# Press 'a' for Android or 'i' for iOS
```

---

## 🔑 Key Features

### Authentication
- ✅ Mandatory password on first launch
- ✅ Biometric (Face ID/Fingerprint)
- ✅ Auto-lock (background/5min inactivity)
- ✅ Self-wipe after 5 failed attempts

### File Management
- ✅ Upload documents, photos, camera
- ✅ Preview images
- ✅ Delete files
- ✅ Encrypted storage

### Security
- ✅ AES-256-GCM encryption
- ✅ Hardware-backed keys
- ✅ Per-file encryption
- ✅ No screenshots (Android)
- ✅ Root/jailbreak detection

---

## 📱 User Flow

```
App Launch → Set Password (first time)
           → Login
           → Home Screen
              ├→ + Button → Upload File → Encrypt → Save
              ├→ Tap File → Decrypt → Preview
              ├→ Settings → Change Password
              └→ Lock → Back to Login
```

---

## 🎨 UI Colors

| Element | Color | Hex |
|---------|-------|-----|
| Background | Dark Black | #0f0f0f |
| Cards | Dark Blue | #1a1a2e |
| Primary Action | Blue | #4a90e2 |
| Text | White | #ffffff |
| Borders | Subtle | #2a2a3e |

---

## 🔒 Security Stack

```
User Password
    ↓
PBKDF2 (10K iterations)
    ↓
Master Key → Secure Enclave/Keystore
    ↓
HMAC-SHA256 → Per-File Key
    ↓
AES-256-GCM Encryption
    ↓
Encrypted File in App Sandbox
```

---

## 📂 File Structure

```
app/
  ├── _layout.tsx        # Navigation
  ├── set-password.tsx   # First setup
  ├── login.tsx          # Auth
  └── home.tsx           # Main UI

services/
  ├── SecurityService.ts # Security
  └── FileService.ts     # Files
```

---

## 🛠️ Key Commands

| Command | Purpose |
|---------|---------|
| `npm start` | Start dev server |
| `npm run android` | Run Android |
| `npm run ios` | Run iOS |
| `npm run lint` | Check code |

---

## ⚠️ Remember

- ❌ **No password recovery** - Lost password = Lost files
- ❌ **5 failures = Wipe** - Be careful testing
- ❌ **No cloud backup** - All data is local only
- ✅ **Screenshots blocked** - Android only
- ✅ **Auto-lock** - Always on background

---

## 🎯 Test Checklist

- [ ] Set password on first launch
- [ ] Login with password
- [ ] Upload document
- [ ] Upload photo
- [ ] Take camera photo
- [ ] Preview image
- [ ] Delete file
- [ ] Change password
- [ ] Lock app manually
- [ ] Auto-lock (background)
- [ ] Biometric login (if available)

---

## 📞 Help

- **Full Docs**: README.md
- **Setup Guide**: SETUP_GUIDE.md
- **Features**: FEATURES.md
- **Complete**: PROJECT_COMPLETE.md

---

## 🚀 Deploy

```bash
# Build for production
eas build --platform all --profile production

# Or local build
npx expo run:android --variant release
npx expo run:ios --configuration Release
```

---

## 🎉 You Have

✅ Complete secure file vault
✅ Military-grade encryption  
✅ Professional UI
✅ Production-ready code
✅ Full documentation

**Ready to secure your files!** 🔐

---

*Built with React Native • Expo • TypeScript*
*Security First • Privacy Focused • Zero Trust*