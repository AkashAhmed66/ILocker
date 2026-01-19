import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

const BACKGROUND_TASK = 'ilocker-background-task';

// Define the background task
TaskManager.defineTask(BACKGROUND_TASK, async () => {
  try {
    console.log('[BackgroundTask] Running background task to keep operations alive');
    
    // This keeps the JavaScript thread alive
    // The actual file operations are handled by FileService with keep-alive timers
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('[BackgroundTask] Error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

class BackgroundTaskManager {
  private isRegistered = false;

  // Register background task
  async registerBackgroundTask(): Promise<void> {
    if (this.isRegistered) {
      console.log('[BackgroundTask] Already registered');
      return;
    }

    try {
      // Check if task is already registered
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK);
      
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK, {
          minimumInterval: 15 * 60, // 15 minutes minimum (iOS requirement)
          stopOnTerminate: false, // Continue after app is killed
          startOnBoot: true, // Start on device boot (Android)
        });
        
        console.log('[BackgroundTask] Registered successfully');
      }
      
      this.isRegistered = true;

      // For Android, set additional options
      if (Platform.OS === 'android') {
        await BackgroundFetch.setMinimumIntervalAsync(15 * 60);
      }
    } catch (error) {
      console.error('[BackgroundTask] Failed to register:', error);
    }
  }

  // Unregister background task
  async unregisterBackgroundTask(): Promise<void> {
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK);
      this.isRegistered = false;
      console.log('[BackgroundTask] Unregistered successfully');
    } catch (error) {
      console.error('[BackgroundTask] Failed to unregister:', error);
    }
  }

  // Check status
  async getStatus(): Promise<BackgroundFetch.BackgroundFetchStatus> {
    try {
      const status = await BackgroundFetch.getStatusAsync();
      return status ?? BackgroundFetch.BackgroundFetchStatus.Denied;
    } catch (error) {
      console.error('[BackgroundTask] Failed to get status:', error);
      return BackgroundFetch.BackgroundFetchStatus.Denied;
    }
  }
}

export default new BackgroundTaskManager();
