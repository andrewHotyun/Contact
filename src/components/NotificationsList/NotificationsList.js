import React, { useState, useEffect } from 'react';
import { db } from '../../utils/firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { getUserOnlineStatus } from '../../utils/onlineStatus';
import './NotificationsList.css';

function NotificationsList({ currentUser, onUserSelect }) {
  const [unreadMessages, setUnreadMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState({});

  // Слухач для непрочитаних повідомлень
  useEffect(() => {
    if (!currentUser || !currentUser.uid) {
      setUnreadMessages([]);
      setLoading(false);
      return;
    }

    const unreadQuery = query(
      collection(db, 'messages'),
      where('receiverId', '==', currentUser.uid),
      where('read', '==', false),
      orderBy('timestamp', 'desc'),
      limit(50) // Обмежуємо для продуктивності
    );

    const unsubscribe = onSnapshot(unreadQuery, async (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Групуємо повідомлення по відправниках
      const messagesBySender = {};
      for (const message of messages) {
        const senderId = message.senderId;
        if (!messagesBySender[senderId]) {
          messagesBySender[senderId] = [];
        }
        messagesBySender[senderId].push(message);
      }

      // Отримуємо інформацію про відправників
      const unreadWithSenders = [];
      for (const [senderId, senderMessages] of Object.entries(messagesBySender)) {
        try {
          const usersRef = collection(db, 'users');
          const userQuery = query(usersRef, where('uid', '==', senderId));
          const userSnapshot = await getDocs(userQuery);

          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data();
            unreadWithSenders.push({
              sender: { uid: senderId, ...userData },
              messages: senderMessages,
              unreadCount: senderMessages.length,
              lastMessage: senderMessages[0] // Найновіше повідомлення
            });
          }
        } catch (error) {
          console.error('Error fetching sender data:', error);
        }
      }

      // Сортуємо по часу останнього повідомлення
      unreadWithSenders.sort((a, b) => {
        const aTime = a.lastMessage.timestamp?.seconds || 0;
        const bTime = b.lastMessage.timestamp?.seconds || 0;
        return bTime - aTime;
      });

      setUnreadMessages(unreadWithSenders);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to unread messages:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Відстежуємо онлайн статус для відправників
  useEffect(() => {
    if (!currentUser || unreadMessages.length === 0) return;

    const unsubscribers = [];

    unreadMessages.forEach(notification => {
      const unsubscribe = getUserOnlineStatus(notification.sender.uid, (status) => {
        setOnlineStatus(prev => ({
          ...prev,
          [notification.sender.uid]: status
        }));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [unreadMessages, currentUser]);

  const formatTime = (timestamp) => {
    try {
      let date;
      if (timestamp && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (timestamp && timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
      } else {
        return 'Invalid time';
      }
      
      const now = new Date();
      const diff = now - date;
      
      if (diff < 60000) {
        return 'Just now';
      } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}m ago`;
      } else if (diff < 86400000) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        const dateStr = date.toLocaleDateString('uk-UA', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
        const timeStr = date.toLocaleTimeString('uk-UA', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        return `${dateStr} ${timeStr}`;
      }
    } catch (error) {
      return 'Invalid time';
    }
  };

  const handleNotificationClick = (notification) => {
    // Відкриваємо чат з відправником
    onUserSelect(notification.sender);
  };

  if (loading) {
    return (
      <div className="notifications-list-container">
        <div className="loading">Loading notifications...</div>
      </div>
    );
  }

  return (
    <div className="notifications-list-container">
      <div className="notifications-header">
        <h3>Missed Messages ({unreadMessages.length})</h3>
        <p className="notifications-subtitle">
          {unreadMessages.length > 0 
            ? 'You have unread messages from these users' 
            : 'No missed messages'
          }
        </p>
      </div>
      
      {unreadMessages.length > 0 ? (
        <div className="notifications-list">
          {unreadMessages.map((notification) => (
            <div 
              key={notification.sender.uid} 
              className="notification-item"
              onClick={() => handleNotificationClick(notification)}
            >
              <div className="notification-avatar-wrapper">
                <div className="notification-avatar">
                  {notification.sender.avatar ? (
                    <img src={notification.sender.avatar} alt={notification.sender.name} />
                  ) : (
                    <div className="avatar-placeholder">
                      {notification.sender.name ? notification.sender.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
                {onlineStatus[notification.sender.uid]?.isOnline && <div className="online-dot-avatar"></div>}
              </div>
              
              <div className="notification-content">
                <div className="notification-header">
                  <div className="notification-sender-name">{notification.sender.name}</div>
                  <div className="notification-time">{formatTime(notification.lastMessage.timestamp)}</div>
                </div>
                
                <div className="notification-preview">
                  <div className="notification-last-message">
                    "{notification.lastMessage.text.length > 50 
                      ? notification.lastMessage.text.substring(0, 50) + '...' 
                      : notification.lastMessage.text
                    }"
                  </div>
                  <div className="notification-text">
                    {notification.unreadCount > 1 
                      ? `${notification.unreadCount} new messages` 
                      : '1 new message'
                    }
                  </div>
                </div>
              </div>
              
              <div className="notification-badge">
                {notification.unreadCount}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-notifications">
          <div className="no-notifications-icon">🎉</div>
          <h4>All caught up!</h4>
          <p>No missed messages</p>
        </div>
      )}
    </div>
  );
}

export default NotificationsList;
