import React, { useState, useEffect } from 'react';
import { db } from '../../utils/firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { getUserOnlineStatus } from '../../utils/onlineStatus';
import './ChatsList.css';

function ChatsList({ onUserSelect, currentUser, onUnreadCountChange, onUnreadChatsCountChange, onNotificationsCountChange, activeCall }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sentMessages, setSentMessages] = useState([]);
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [onlineStatus, setOnlineStatus] = useState({});

  // Listener for sent messages
  useEffect(() => {
    if (!currentUser || !currentUser.uid) {
      setSentMessages([]);
      return;
    }
    const sentQuery = query(
      collection(db, 'messages'),
      where('senderId', '==', currentUser.uid),
      orderBy('timestamp', 'desc'),
      limit(100) // Limit for performance
    );
    const unsubscribe = onSnapshot(sentQuery, (snapshot) => {
      setSentMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching sent messages:", error));
    return () => unsubscribe();
  }, [currentUser]);

  // Listener for received messages
  useEffect(() => {
    if (!currentUser || !currentUser.uid) {
      setReceivedMessages([]);
      return;
    }
    const receivedQuery = query(
      collection(db, 'messages'),
      where('receiverId', '==', currentUser.uid),
      orderBy('timestamp', 'desc'),
      limit(100) // Limit for performance
    );
    const unsubscribe = onSnapshot(receivedQuery, (snapshot) => {
      setReceivedMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => console.error("Error fetching received messages:", error));
    return () => unsubscribe();
  }, [currentUser]);

  // Processor for combining messages into chats
  useEffect(() => {
    const processMessages = async () => {
      if (!currentUser || !currentUser.uid) {
        setChats([]);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      const allMessages = [...sentMessages, ...receivedMessages];
      const chatPartners = new Map();

      for (const message of allMessages) {
        const otherUserId = message.senderId === currentUser.uid 
          ? message.receiverId 
          : message.senderId;

        // Keep only the latest message for each chat partner
        if (!chatPartners.has(otherUserId) || message.timestamp > chatPartners.get(otherUserId).lastMessage.timestamp) {
          chatPartners.set(otherUserId, {
            lastMessage: message,
            unreadCount: 0 // initialize
          });
        }
      }
      
      // Calculate unread counts from received messages
      const unreadMessages = receivedMessages.filter(m => !m.read);
      for (const message of unreadMessages) {
          const partnerId = message.senderId;
          if (chatPartners.has(partnerId)) {
              chatPartners.get(partnerId).unreadCount++;
          }
      }

      const chatList = [];
      for (const [userId, chatData] of chatPartners.entries()) {
        if (!userId) {
          continue;
        }
        const usersRef = collection(db, 'users');
        const userQuery = query(usersRef, where('uid', '==', userId));
        const userSnapshot = await getDocs(userQuery);

        if (!userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          chatList.push({
            id: userId,
            user: userData,
            lastMessage: chatData.lastMessage,
            unreadCount: chatData.unreadCount
          });
        }

      }

      // Sort chats by the timestamp of the last message
      chatList.sort((a, b) => {
        const aTime = a.lastMessage.timestamp?.seconds || 0;
        const bTime = b.lastMessage.timestamp?.seconds || 0;
        return bTime - aTime;
      });

      setChats(chatList);
      
      // Calculate total unread messages count
      const totalUnreadCount = chatList.reduce((total, chat) => total + chat.unreadCount, 0);
      if (onUnreadCountChange) {
        onUnreadCountChange(totalUnreadCount);
      }
      
      // Note: unreadChatsCount and notificationsCount are now handled by App.js in real-time
      // This prevents duplicate calculations and ensures real-time updates
      
      setLoading(false);
    };

    processMessages();
  }, [sentMessages, receivedMessages, currentUser, onUnreadCountChange]);

  // Track online status for chat users
  useEffect(() => {
    if (!currentUser || chats.length === 0) return;

    const unsubscribers = [];

    chats.forEach(chat => {
      const unsubscribe = getUserOnlineStatus(chat.user.uid, (status) => {
        setOnlineStatus(prev => {
          const newStatus = {
            ...prev,
            [chat.user.uid]: status
          };
          return newStatus;
        });
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [chats, currentUser]);

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
      <div className="chats-list-container">
        <div className="loading">Loading chats...</div>
      </div>
    );
  }

  return (
    <div className="chats-list-container">
      <div className="chats-header">
        <h3>All Chats ({chats.length})</h3>
      </div>
      
      {chats.length > 0 ? (
        <div className="chats-list">
          {chats.map((chat) => {
            return (
            <div 
              key={chat.user.uid} 
              className="chat-item"
              onClick={() => onUserSelect(chat.user)}
            >
              <div className="chat-avatar-wrapper">
                <div className="chat-avatar">
                  {chat.user.avatar ? (
                    <img src={chat.user.avatar} alt={chat.user.name} />
                  ) : (
                    <div className="avatar-placeholder">
                      {chat.user.name ? chat.user.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
                {onlineStatus[chat.user.uid]?.isOnline && <div className="online-dot-avatar"></div>}
              </div>
              <div className="chat-content">
                <div className="chat-header">
                  <div className="chat-name">{chat.user.name}</div>
                </div>
                <div className="chat-preview">
                  <div className="chat-preview-text">
                    {chat.lastMessage.senderId === currentUser?.uid ? 'You: ' : ''}
                    {chat.lastMessage.text}
                  </div>
                  <div className="chat-time">{formatTime(chat.lastMessage.timestamp)}</div>
                </div>
              </div>
              {chat.unreadCount > 0 && (
                <div className="unread-badge">{chat.unreadCount}</div>
              )}
            </div>
            );
          })}
        </div>
      ) : (
        <div className="no-chats">
          <h4>No chats yet</h4>
          <p>Start a conversation with your friends!</p>
        </div>
      )}
    </div>
  );
}

export default ChatsList;


