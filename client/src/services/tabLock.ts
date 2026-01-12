/**
 * Tab Lock Service
 * Prevents multiple browser tabs from connecting to the server simultaneously.
 * Uses BroadcastChannel API for cross-tab communication.
 */

const CHANNEL_NAME = "gamehub_tab_lock";
const LOCK_KEY = "gamehub_active_tab";
const HEARTBEAT_INTERVAL = 2000; // 2 seconds

let channel: BroadcastChannel | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isActiveTab = false;
let tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;

// Check if another tab is already active
export const checkForExistingTab = (): boolean => {
  const existingTab = localStorage.getItem(LOCK_KEY);
  if (existingTab) {
    try {
      const { timestamp, id } = JSON.parse(existingTab);
      // If the lock is less than 5 seconds old and not our tab, another tab is active
      if (Date.now() - timestamp < 5000 && id !== tabId) {
        return true;
      }
    } catch {
      // Invalid data, clear it
      localStorage.removeItem(LOCK_KEY);
    }
  }
  return false;
};

// Acquire the tab lock
export const acquireTabLock = (): boolean => {
  if (checkForExistingTab()) {
    return false;
  }

  // Set our lock
  localStorage.setItem(
    LOCK_KEY,
    JSON.stringify({ id: tabId, timestamp: Date.now() })
  );

  // Start heartbeat to maintain lock
  startHeartbeat();

  // Setup BroadcastChannel for cross-tab communication
  setupChannel();

  isActiveTab = true;
  return true;
};

// Start heartbeat to maintain the lock
const startHeartbeat = () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  heartbeatTimer = setInterval(() => {
    if (isActiveTab) {
      localStorage.setItem(
        LOCK_KEY,
        JSON.stringify({ id: tabId, timestamp: Date.now() })
      );
    }
  }, HEARTBEAT_INTERVAL);
};

// Setup BroadcastChannel for cross-tab communication
const setupChannel = () => {
  if (channel) return;

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);

    // Listen for new tabs trying to connect
    channel.onmessage = (event) => {
      if (event.data.type === "NEW_TAB_CHECK" && isActiveTab) {
        // Respond that we're already active
        channel?.postMessage({ type: "TAB_ACTIVE", tabId });
      }
    };
  } catch {
    // BroadcastChannel not supported, rely on localStorage only
    console.warn("BroadcastChannel not supported");
  }
};

// Check if we can become the active tab (with timeout for response)
export const canBecomeActiveTab = (): Promise<boolean> => {
  return new Promise((resolve) => {
    // Quick check via localStorage
    if (checkForExistingTab()) {
      resolve(false);
      return;
    }

    // If BroadcastChannel is supported, send a check message
    try {
      const tempChannel = new BroadcastChannel(CHANNEL_NAME);
      let responded = false;

      tempChannel.onmessage = (event) => {
        if (event.data.type === "TAB_ACTIVE") {
          responded = true;
          tempChannel.close();
          resolve(false);
        }
      };

      // Send check message
      tempChannel.postMessage({ type: "NEW_TAB_CHECK" });

      // Wait a short time for response
      setTimeout(() => {
        if (!responded) {
          tempChannel.close();
          resolve(true);
        }
      }, 200);
    } catch {
      // BroadcastChannel not supported, use localStorage check only
      resolve(!checkForExistingTab());
    }
  });
};

// Release the tab lock (call on page unload)
export const releaseTabLock = () => {
  isActiveTab = false;

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // Only remove if it's our lock
  try {
    const existingTab = localStorage.getItem(LOCK_KEY);
    if (existingTab) {
      const { id } = JSON.parse(existingTab);
      if (id === tabId) {
        localStorage.removeItem(LOCK_KEY);
      }
    }
  } catch {
    // Ignore errors during cleanup
  }

  if (channel) {
    channel.close();
    channel = null;
  }
};

// Setup cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", releaseTabLock);
  window.addEventListener("unload", releaseTabLock);
}
