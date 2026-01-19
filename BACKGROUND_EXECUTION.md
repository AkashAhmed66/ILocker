# Background Execution Implementation

## Overview
This document explains how true background execution has been implemented for file upload/download operations in ILocker using `react-native-background-actions`.

## Problem
Previously, when the app went to the background or the screen turned off, JavaScript timers would suspend and file operations would stop. The app needed true background execution to continue processing files.

## Solution

### 1. react-native-background-actions
Installed `react-native-background-actions` which provides:
- **Android**: Foreground service with persistent notification
- **iOS**: Background task execution using iOS background modes

### 2. Background Service Architecture

#### Starting Background Service
When any file operation (upload/download) starts:
```typescript
this.activeBackgroundOperations++;
await this.startBackgroundService();
```

The service creates a persistent foreground service on Android with:
- Task name and description
- App icon
- Progress bar showing operation progress
- Blue color (#4a90e2)

#### Background Task Loop
The background task runs continuously while operations are active:
```typescript
private backgroundTask = async (taskData: any) => {
  await new Promise(async (resolve) => {
    while (this.activeBackgroundOperations > 0) {
      // Update service notification with progress
      await BackgroundService.updateNotification({
        progressBar: {
          max: 100,
          value: this.getAverageProgress(),
        },
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    resolve(undefined);
  });
};
```

#### Stopping Background Service
When the last operation completes:
```typescript
this.activeBackgroundOperations--;
if (this.activeBackgroundOperations === 0) {
  await this.stopBackgroundService();
}
```

### 3. Operation Counter
- `activeBackgroundOperations`: Tracks how many operations are currently running
- Incremented when operation starts
- Decremented when operation completes or fails
- Background service only stops when counter reaches 0

### 4. Progress Tracking
- Each individual operation has its own progress (0-100%)
- Background service shows average progress of all operations
- Individual notification throttling still in place (2-second intervals)

## How It Works

### Upload Flow
1. User selects file → `secureFile()` called
2. Operation created: `activeBackgroundOperations++`
3. Background service started (if not already running)
4. File encryption begins with chunked processing
5. Progress updates shown in both:
   - Foreground UI (if app is open)
   - Background service notification
6. On completion: `activeBackgroundOperations--`
7. If last operation: service stopped

### Download Flow
1. User taps download → `downloadFile()` called
2. Operation created: `activeBackgroundOperations++`
3. Background service started
4. `performDownload()` runs asynchronously
5. File decryption with progress callbacks
6. Saved to gallery/downloads
7. On completion: `activeBackgroundOperations--`
8. If last operation: service stopped

## Platform Differences

### Android
- Uses foreground service (stays alive even when app is killed)
- Shows persistent notification in status bar
- Progress bar visible in notification
- Requires FOREGROUND_SERVICE permission (already added)

### iOS
- Uses background task API
- Limited to ~30 seconds of background time by default
- "processing" UIBackgroundMode extends this (already added)
- For very long operations, iOS may still suspend

## Testing Instructions

### Test 1: Background with Screen Off
1. Start uploading a large file (>50MB)
2. Turn off screen immediately
3. Wait 30 seconds
4. Turn screen back on
5. ✓ Operation should have continued and show progress

### Test 2: App Backgrounded
1. Start downloading a file
2. Press home button to background app
3. Check notification bar - should see "Processing Files" with progress
4. Wait for completion
5. ✓ Should receive completion notification

### Test 3: Multiple Operations
1. Queue multiple uploads
2. Background the app
3. ✓ All operations should continue
4. ✓ Notification shows average progress

### Test 4: App Killed (Android Only)
1. Start file upload
2. Swipe app away from recent apps (force kill)
3. ✓ On Android: Foreground service continues, operation completes
4. ✓ On iOS: Operation stops (expected iOS behavior)

## Build Requirements

Since we added a native module (`react-native-background-actions`), you need to rebuild:

```bash
# Development build
npx expo prebuild --clean
npx expo run:android  # or run:ios

# Production build
eas build --platform android --profile production
```

## Permissions

### Android (already configured)
- `FOREGROUND_SERVICE` - Required for background service
- `WAKE_LOCK` - Keeps CPU awake during operations
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` - Prevents system from stopping service

### iOS (already configured)
- `processing` in UIBackgroundModes - Extends background time

## Monitoring

Check logs for background service activity:
```
[BackgroundService] Started
[BackgroundService] Stopped
```

Each operation also logs its progress in notifications.

## Limitations

### iOS Limitations
- Background time is limited even with "processing" mode
- Very large files (>500MB) may still timeout
- iOS aggressively suspends apps to save battery

### Android Limitations
- Foreground service notification cannot be dismissed while active
- Battery optimization settings may vary by manufacturer

## Future Improvements

1. **iOS Extended Background**
   - Implement proper background URL sessions for downloads
   - Use `beginBackgroundTask` with expiration handler

2. **Chunked Upload/Download**
   - For very large files, implement resumable uploads
   - Store progress to disk for crash recovery

3. **Network Awareness**
   - Pause operations on cellular if user preference set
   - Auto-retry on network errors

4. **Battery Optimization**
   - Reduce encryption chunk size on low battery
   - Pause operations if battery < 10%
