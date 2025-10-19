import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// Track user's online status
export const trackUserOnlineStatus = (userId) => {
  if (!userId) return null;

  const userRef = doc(db, 'users', userId);
  let heartbeatInterval;
  
  // Set user as online
  const setOnline = async () => {
    try {
      // console.log(`[Online Status] Setting user ${userId} online`);
      await updateDoc(userRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
      });
    } catch (error) {
      console.error('Error setting user online:', error);
    }
  };

  // Set user as offline
  const setOffline = async () => {
    try {
      // console.log(`[Online Status] Setting user ${userId} offline`);
      await updateDoc(userRef, {
        isOnline: false,
        lastSeen: serverTimestamp()
      });
      // console.log(`[Online Status] User ${userId} set offline successfully`);
    } catch (error) {
      console.error('Error setting user offline:', error);
    }
  };

  // Heartbeat to keep user online
  const startHeartbeat = () => {
    setOnline(); // Set online immediately
    heartbeatInterval = setInterval(() => {
      setOnline(); // Update lastSeen every 30 seconds
    }, 30000); // Збільшено до 30 секунд
  };

  // Stop heartbeat
  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  // Set up online status tracking
  startHeartbeat();

  // Auto-offline timer - set user offline if no activity for 2 minutes
  let lastActivity = Date.now();
  const autoOfflineInterval = setInterval(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivity;
    
    // If no activity for 2 minutes, set offline
    if (timeSinceLastActivity > 120000) { // 2 minutes
      // console.log(`[Online Status] Auto-setting user ${userId} offline due to inactivity`);
      stopHeartbeat();
      setOffline();
    }
  }, 30000); // Check every 30 seconds

  // Track user activity
  const trackActivity = () => {
    lastActivity = Date.now();
  };

  // Add activity listeners
  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  activityEvents.forEach(event => {
    document.addEventListener(event, trackActivity, true);
  });

  // Set offline when page is about to unload
  const handleBeforeUnload = () => {
    // console.log(`[Online Status] Page unloading, setting user ${userId} offline`);
    stopHeartbeat();
    clearInterval(autoOfflineInterval);
    setOffline();
  };

  // Set offline when visibility changes to hidden
  const handleVisibilityChange = () => {
    if (document.hidden) {
      // console.log(`[Online Status] Page hidden, setting user ${userId} offline`);
      stopHeartbeat();
      setOffline();
    } else {
      // console.log(`[Online Status] Page visible, setting user ${userId} online`);
      startHeartbeat();
    }
  };

  // Add event listeners
  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Cleanup function
  const cleanup = () => {
    // console.log(`[Online Status] Cleaning up for user ${userId}`);
    stopHeartbeat();
    clearInterval(autoOfflineInterval);
    setOffline();
    
    // Remove activity listeners
    activityEvents.forEach(event => {
      document.removeEventListener(event, trackActivity, true);
    });
    
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };

  return cleanup;
};

// Get real-time online status for a user
export const getUserOnlineStatus = (userId, callback) => {
  if (!userId) return null;

  const userRef = doc(db, 'users', userId);
  
  return onSnapshot(userRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      const now = new Date();
      const lastSeen = data.lastSeen ? data.lastSeen.toDate() : null;
      
      // Consider user online ONLY if lastSeen was less than 1 minute ago
      let isOnline = false;
      if (lastSeen) {
        const diffMs = now - lastSeen;
        const diffMins = Math.floor(diffMs / 60000);
        const diffSecs = Math.floor((diffMs % 60000) / 1000);
        // console.log(`[Online Status] User ${userId}: lastSeen=${lastSeen.toISOString()}, diffMins=${diffMins}, diffSecs=${diffSecs}, isOnline=${diffMins < 1}`);
        if (diffMins < 1) { // Зменшено до 1 хвилини
          isOnline = true;
        }
      } else {
        // console.log(`[Online Status] User ${userId}: no lastSeen data, setting offline`);
      }
      
      // If no lastSeen data, consider offline
      if (!lastSeen) {
        isOnline = false;
      }
      
      callback({
        isOnline: isOnline,
        lastSeen: data.lastSeen
      });
    } else {
      callback({
        isOnline: false,
        lastSeen: null
      });
    }
  });
};

// Format last seen timestamp
export const formatLastSeen = (timestamp) => {
  if (!timestamp) return null; // Не показуємо нічого, якщо немає даних
  
  const now = new Date();
  const lastSeen = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diffMs = now - lastSeen;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Якщо менше 1 хвилини - повертаємо null (показуємо тільки індикатор)
  if (diffMins < 1) return null;
  
  // Якщо сьогодні - показуємо час
  if (diffDays === 0) {
    return `was online today at ${lastSeen.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}`;
  }
  
  // Якщо вчора - показуємо дату і час
  if (diffDays === 1) {
    return `was online yesterday at ${lastSeen.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}`;
  }
  
  // Якщо більше дня - показуємо повну дату і час
  return `was online on ${lastSeen.toLocaleDateString('en-US')} at ${lastSeen.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })}`;
};
