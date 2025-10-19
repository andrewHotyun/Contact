import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { auth } from '../firebase';
import './MessagesList.css';

function MessagesList({ onUserSelect }) {
  const [messages, setMessages] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);

    // Завантажуємо всі повідомлення користувача
    const messagesRef = collection(db, 'messages');
    const messagesQuery = query(
      messagesRef,
      where('receiverId', '==', currentUser.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(messagesQuery, async (snapshot) => {
      const messagesData = [];
      const unreadData = [];

      for (const messageDoc of snapshot.docs) {
        const messageData = messageDoc.data();
        
        // Отримуємо дані про відправника
        try {
          const usersRef = collection(db, 'users');
          const userQuery = query(usersRef, where('uid', '==', messageData.senderId));
          const userSnapshot = await getDocs(userQuery);
          
          if (!userSnapshot.empty) {
            const senderData = userSnapshot.docs[0].data();
            const messageWithSender = {
              id: messageDoc.id,
              ...messageData,
              sender: senderData
            };
            
            messagesData.push(messageWithSender);
            
            // Додаємо до непрочитаних, якщо не прочитано
            if (!messageData.read) {
              unreadData.push(messageWithSender);
            }
          }
        } catch (error) {
          console.error('Error fetching sender data:', error);
        }
      }

      setMessages(messagesData);
      setUnreadMessages(unreadData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

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
        // Показуємо і дату, і час для старих повідомлень
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

  if (loading) {
    return (
      <div className="messages-list-container">
        <div className="loading">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="messages-list-container">
      <div className="messages-header">
        <h3>Messages ({unreadMessages.length} unread)</h3>
      </div>
      
      {unreadMessages.length > 0 ? (
        <div className="messages-list">
          {unreadMessages.map((message) => (
            <div 
              key={message.id} 
              className="message-item unread"
              onClick={() => onUserSelect(message.sender)}
            >
              <div className="message-avatar">
                {message.sender?.avatar ? (
                  <img src={message.sender.avatar} alt={message.sender.name} />
                ) : (
                  <div className="avatar-placeholder">
                    {message.sender?.name ? message.sender.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
              </div>
              <div className="message-content">
                <div className="message-header">
                  <div className="sender-name">{message.sender?.name || 'Unknown User'}</div>
                  <div className="message-time">{formatTime(message.timestamp)}</div>
                </div>
                <div className="message-preview">{message.text}</div>
              </div>
              <div className="unread-indicator"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-messages">
          <h4>No unread messages</h4>
          <p>All your messages have been read!</p>
        </div>
      )}
    </div>
  );
}

export default MessagesList;

