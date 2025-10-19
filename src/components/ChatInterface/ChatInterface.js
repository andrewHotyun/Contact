// ========================================
// КОМПОНЕНТ CHATINTERFACE - ІНТЕРФЕЙС ЧАТУ
// ========================================
// Цей файл є основним інтерфейсом для спілкування між користувачами
// ВИКОРИСТОВУЄТЬСЯ В: App.js (компонент Home)
// 
// ОСНОВНІ ФУНКЦІЇ:
// 1. 💬 Відправка та отримання повідомлень (текст, файли, емодзі)
// 2. 🎥 Ініціація та прийом відеодзвінків через WebRTC
// 3. 😊 Реакції на повідомлення (лайки, емодзі)
// 4. ✏️ Редагування та видалення повідомлень
// 5. 🔍 Пошук повідомлень в чаті
// 6. 📎 Відправка файлів (зображення, відео, аудіо, документи)
// 7. 💬 Відповіді на повідомлення (система цитування)
// 8. 👤 Перегляд профілю співрозмовника
// 9. 📱 Адаптивний дизайн для мобільних пристроїв
//
// КЛЮЧОВІ ЗАЛЕЖНОСТІ:
// - Firebase Firestore для збереження повідомлень
// - WebRTC для відеодзвінків
// - React Icons для іконок
// - Toast для сповіщень

import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../../utils/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, deleteDoc, getDoc, getDocs, deleteField } from 'firebase/firestore';
import UserProfileModal from '../UserProfileModal/UserProfileModal';
import AvatarZoomModal from '../AvatarZoomModal/AvatarZoomModal';
import CallWaitingModal from '../CallWaitingModal/CallWaitingModal';
import VideoCallInterface from '../VideoCallInterface/VideoCallInterface';
import { getUserOnlineStatus, formatLastSeen } from '../../utils/onlineStatus';
import { IoAttach } from 'react-icons/io5';
import { BsEmojiSmile } from 'react-icons/bs';
import Toast from '../Toast/Toast';
import './ChatInterface.css';

// Доступні реакції для повідомлень
const availableReactions = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

// ========================================
// ОСНОВНА ФУНКЦІЯ КОМПОНЕНТА
// ========================================
// Параметри:
// - selectedUser: об'єкт вибраного користувача для чату
// - onClose: функція закриття чату
// - currentUser: поточний авторизований користувач
// - onRemoveFriend: функція видалення з друзів
// - activeCall: активний відеодзвінок
// - setActiveCall: функція встановлення активного дзвінка
// - setActiveCallDebug: функція для debug інформації

function ChatInterface({ selectedUser, onClose, currentUser, onRemoveFriend, activeCall, setActiveCall, setActiveCallDebug }) {
  
  // ===== ОСНОВНІ СТАНИ ДЛЯ ПОВІДОМЛЕНЬ =====
  const [messages, setMessages] = useState([]);                    // Список всіх повідомлень в чаті
  const [newMessage, setNewMessage] = useState('');                // Текст нового повідомлення
  const [loading, setLoading] = useState(false);                   // Стан завантаження (при відправці)
  const [editingMessage, setEditingMessage] = useState(null);      // ID повідомлення, яке редагується
  const [editText, setEditText] = useState('');                    // Текст для редагування повідомлення

  // ===== СТАНИ ДЛЯ ІНТЕРФЕЙСУ =====
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);       // Чи показувати меню емодзі
  const [showProfileModal, setShowProfileModal] = useState(false); // Чи показувати модальне вікно профілю
  const [showDropdown, setShowDropdown] = useState(false);         // Чи показувати випадаюче меню
  const [showImageModal, setShowImageModal] = useState(false);     // Чи показувати модальне вікно зображення
  const [selectedImageSrc, setSelectedImageSrc] = useState('');    // URL зображення для перегляду
  const [showAvatarZoom, setShowAvatarZoom] = useState(false);     // Чи показувати збільшену аватарку
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);    // URL для попереднього перегляду
  const [isWaitingCall, setIsWaitingCall] = useState(false);
  const [userOnlineStatus, setUserOnlineStatus] = useState({ isOnline: false, lastSeen: null });
  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [overlayRect, setOverlayRect] = useState(null);
  const waitingCallIdRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const [canScroll, setCanScroll] = useState(false);
  const scrollTimeoutRef = useRef(null);
  const [toast, setToast] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [userCache, setUserCache] = useState({});

  useEffect(() => {
    // When messages change, check for users in reactions that we need to fetch
    const fetchReactionUsers = async () => {
        const userIdsToFetch = new Set();
        messages.forEach(message => {
            if (message.reactions) {
                Object.keys(message.reactions).forEach(userId => {
                    if (!userCache[userId] && currentUser?.uid !== userId && selectedUser?.uid !== userId) {
                        userIdsToFetch.add(userId);
                    }
                });
            }
        });

        if (userIdsToFetch.size === 0) return;

        const newUsers = {};
        for (const userId of userIdsToFetch) {
            try {
                const userDoc = await getDoc(doc(db, 'users', userId));
                if (userDoc.exists()) {
                    newUsers[userId] = { id: userDoc.id, ...userDoc.data() };
                }
            } catch (e) {
                console.error("Error fetching user for reaction", e);
            }
        }

        if (Object.keys(newUsers).length > 0) {
            setUserCache(prev => ({...prev, ...newUsers}));
        }
    };

    fetchReactionUsers();
  }, [messages, currentUser, selectedUser, userCache]);

  const getUserFromCache = (userId) => {
    if (currentUser?.uid === userId) return currentUser;
    if (selectedUser?.uid === userId) return selectedUser;
    return userCache[userId] || null;
  };

  const getReactionsForDisplay = (reactions) => {
    if (!reactions || Object.keys(reactions).length === 0) {
        return [];
    }
    // This will return an array like: [{ userId: 'uid1', emoji: '❤️' }, { userId: 'uid2', emoji: '👍' }]
    return Object.entries(reactions).map(([userId, emoji]) => ({ userId, emoji }));
  };

  const handleReaction = async (message, emoji) => {
    // console.log('[handleReaction] Triggered', { message, emoji });
    if (!message?.id || !currentUser?.uid) {
      console.error('[handleReaction] Missing message ID or user ID');
      return;
    }

    const messageRef = doc(db, 'messages', message.id);
    const currentUserId = currentUser.uid;
    const reactionPath = `reactions.${currentUserId}`;
    // console.log('[handleReaction] Path:', reactionPath);

    try {
        const messageDoc = await getDoc(messageRef);
        if (!messageDoc.exists()) {
            console.error("[handleReaction] Message document not found");
            return;
        }
        const currentReaction = messageDoc.data().reactions?.[currentUserId];
        // console.log('[handleReaction] Current user reaction:', currentReaction);

        if (currentReaction === emoji) {
            // User is removing their reaction
            // console.log('[handleReaction] Removing reaction...');
            await updateDoc(messageRef, {
                [reactionPath]: deleteField()
            });
            // console.log('[handleReaction] Reaction removed.');
        } else {
            // User is adding or changing their reaction
            // console.log('[handleReaction] Adding/changing reaction...');
            await updateDoc(messageRef, {
                [reactionPath]: emoji
            });
            // console.log('[handleReaction] Reaction added/changed.');
        }
    } catch (error) {
        console.error("[handleReaction] Error updating reaction: ", error);
    }
    
    if (contextMenu) {
      closeContextMenu();
    }
  };

  // Refs for each menu item for direct event listeners
  const replyButtonRef = useRef(null);
  const copyButtonRef = useRef(null);
  const editButtonRef = useRef(null);
  const deleteButtonRef = useRef(null);
  const reactionBarRef = useRef(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);


  // Close emoji menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEmojiMenu && !event.target.closest('.emoji-menu')) {
        setShowEmojiMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiMenu]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (contextMenu) {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu]);

  // Function to open image in full size
  const openImageModal = (imageSrc) => {
    setSelectedImageSrc(imageSrc);
    setShowImageModal(true);
  };

  // Function to close image modal
  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedImageSrc('');
  };

  // This single useEffect now handles all context menu logic reliably.
  useEffect(() => {
    if (!contextMenu) return;

    const menu = contextMenuRef.current;
    const replyBtn = replyButtonRef.current;
    const copyBtn = copyButtonRef.current;
    const editBtn = editButtonRef.current;
    const deleteBtn = deleteButtonRef.current;
    const reactionBar = reactionBarRef.current;

    const createHandler = (handler) => (e) => {
      e.stopPropagation();
      handler(contextMenu.message);
      closeContextMenu();
    };
    
    const handleDeleteWrapper = async (e) => {
        e.stopPropagation();
        const shouldClose = await handleDelete(contextMenu.message);
        if (shouldClose) {
            closeContextMenu();
        }
    };

    // Handler for reaction emojis
    const createReactionHandler = (emoji) => (e) => {
        e.stopPropagation();
        handleReaction(contextMenu.message, emoji);
        // `handleReaction` already closes the menu
    };

    if (replyBtn) replyBtn.addEventListener('mousedown', createHandler(handleReply));
    if (copyBtn) copyBtn.addEventListener('mousedown', createHandler(handleCopy));
    if (editBtn) editBtn.addEventListener('mousedown', createHandler(handleEdit));
    if (deleteBtn) deleteBtn.addEventListener('mousedown', handleDeleteWrapper);

    // Attach listeners to reaction emojis
    const emojiElements = reactionBar ? reactionBar.querySelectorAll('.reaction-emoji') : [];
    const reactionHandlers = []; // To store handlers for cleanup
    emojiElements.forEach(element => {
        const emoji = element.dataset.emoji;
        if (emoji) {
            const handler = createReactionHandler(emoji);
            reactionHandlers.push({ element, handler });
            element.addEventListener('mousedown', handler);
        }
    });

    const handleOutsideClick = (e) => {
      if (menu && !menu.contains(e.target)) {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);

    return () => {
      if (replyBtn) replyBtn.removeEventListener('mousedown', createHandler(handleReply));
      if (copyBtn) copyBtn.removeEventListener('mousedown', createHandler(handleCopy));
      if (editBtn) editBtn.removeEventListener('mousedown', createHandler(handleEdit));
      if (deleteBtn) deleteBtn.removeEventListener('mousedown', handleDeleteWrapper);
      
      // Cleanup reaction handlers
      reactionHandlers.forEach(({ element, handler }) => {
          element.removeEventListener('mousedown', handler);
      });

      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [contextMenu]);

  // Track user's online status
  useEffect(() => {
    if (!selectedUser?.uid) {
      setUserOnlineStatus({ isOnline: false, lastSeen: null });
      return;
    }

    const unsubscribe = getUserOnlineStatus(selectedUser.uid, (status) => {
      setUserOnlineStatus(status);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [selectedUser?.uid]);


  const initiateVideoCall = async (user) => {
    if (!user || !currentUser) return;
    
    // console.log('[initiateVideoCall] Starting video call initiation');
    // console.log('[initiateVideoCall] Current activeCall before call:', activeCall);
    // console.log('[initiateVideoCall] Current isWaitingCall before call:', isWaitingCall);
    
    // console.log('Current user data:', {
    //   uid: currentUser.uid,
    //   name: currentUser.name,
    //   displayName: currentUser.displayName,
    //   avatar: currentUser.avatar
    // });
    
    // console.log('Selected user data:', {
    //   uid: user.uid,
    //   name: user.name,
    //   avatar: user.avatar
    // });
    
    // Отримуємо дані користувача з Firestore
    const getUserData = async (userId) => {
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          return userDoc.data();
        }
        return null;
      } catch (error) {
        console.error('Error fetching user data:', error);
        return null;
      }
    };
    
    const callerData = await getUserData(currentUser.uid);
    const calleeData = await getUserData(user.uid);
    
    // console.log('Caller data from Firestore:', callerData);
    // console.log('Callee data from Firestore:', calleeData);
    
    const callData = {
      callerId: currentUser.uid,
      callerName: callerData?.name || currentUser.displayName || 'Unknown User',
      callerAvatar: callerData?.avatar || null,
      calleeId: user.uid,
      calleeName: calleeData?.name || user.name || 'Unknown User',
      calleeAvatar: calleeData?.avatar || user.avatar || null,
      type: 'video',
      status: 'ringing',
      createdAt: serverTimestamp()
    };
    
    // console.log('Creating call with data:', callData);
    
    let callDoc;
    try {
      const callsRef = collection(db, 'calls');
      // Ensure both participants are stored for cross-device syncing
      callDoc = await addDoc(callsRef, {
        ...callData,
        participants: [currentUser.uid, selectedUser.uid]
      });
      // console.log('Call created with ID:', callDoc.id);
      
      // НЕ встановлюємо activeCall одразу - тільки показуємо CallWaitingModal
      // console.log('Call created, showing waiting modal for caller');
    } catch (error) {
      console.error('Error creating call:', error);
      return;
    }
    
    // Додаємо повідомлення про початок відеодзвінка
    try {
      const chatId = getChatId(currentUser.uid, user.uid);
      await addDoc(collection(db, 'messages'), {
        chatId: chatId,
        senderId: currentUser.uid,
        receiverId: user.uid,
        text: `📞 Started a video call`,
        timestamp: serverTimestamp(),
        read: false,
        type: 'call',
        callId: callDoc.id,
        callType: 'video'
      });
      // console.log('Video call message added to chat');
    } catch (error) {
      console.error('Error adding video call message:', error);
    }
    
    setIsWaitingCall(true);
    waitingCallIdRef.current = callDoc.id;
    
    // console.log('[Call] Call initiated, isWaitingCall set to true, activeCall should be null');
    // console.log('[Call] Current activeCall:', activeCall);

    // Listen for accept/decline
    const unsub = onSnapshot(doc(db, 'calls', callDoc.id), (d) => {
      const data = d.data();
      if (!data) return;
      // console.log('[Call] Call status update:', {
      //   status: data.status,
      //   callId: d.id,
      //   callerId: data.callerId,
      //   calleeId: data.calleeId,
      //   currentUserId: currentUser.uid,
      //   isWaitingCall: isWaitingCall
      // });
      
      if (data.status === 'accepted') {
        // console.log('[Call] Call accepted, setting activeCall for caller');
        // console.log('[Call] Call data:', data);
        // console.log('[Call] Call ID:', d.id);
        setIsWaitingCall(false);
        // Встановлюємо activeCall з правильним статусом
        const callData = { id: d.id, ...data, status: 'accepted' };
        // console.log('[Call] Setting activeCall with data:', callData);
        setActiveCallDebug(callData);
        unsub();
      } else if (data.status === 'declined' || data.status === 'ended') {
        // console.log('[Call] Call declined/ended');
        setIsWaitingCall(false);
        setActiveCallDebug(null);
        unsub();
      }
    });
  };

  // Завершення активного дзвінка з оновленням Firestore та очищенням стану
  const endActiveCallNow = async () => {
    try {
      if (!activeCall?.id) {
        // console.log('[Call] No active call to end');
        setActiveCallDebug(null);
        return;
      }
      // console.log('[Call] Ending call from ChatInterface, callId:', activeCall.id);
      
      // Логіка зупинки потоків тепер повністю в VideoCallInterface
      
      await updateDoc(doc(db, 'calls', activeCall.id), {
        status: 'ended',
        endedAt: serverTimestamp(),
        endedBy: currentUser?.uid || 'manual_end_in_chat_interface'
      });

      // Додаємо системне повідомлення в чат про завершення дзвінка
      try {
        const chatId = `${activeCall.callerId}_${activeCall.calleeId}`;
        await addDoc(collection(db, 'messages'), {
          chatId: chatId,
          senderId: currentUser?.uid,
          receiverId: activeCall.callerId === currentUser?.uid ? activeCall.calleeId : activeCall.callerId,
          text: `📞 Video call ended`,
          timestamp: serverTimestamp(),
          read: false,
          type: 'call',
          callId: activeCall.id,
          callType: 'video'
        });
      } catch (msgErr) {
        console.warn('[Call] Failed to add call ended message:', msgErr);
      }

      // Delete the call document after a delay to allow other user to receive the update
      setTimeout(async () => {
        try {
          await deleteDoc(doc(db, 'calls', activeCall.id));
          // console.log('[Call] Call document deleted after delay');
        } catch (delErr) {
          console.warn('[Call] Failed to delete call document (may be fine):', delErr);
        }
      }, 2000); // 2 second delay
    } catch (error) {
      console.error('[Call] Error ending call from ChatInterface:', error);
    } finally {
      setActiveCallDebug(null);
      
      // Миттєво переходимо до кінця чату після завершення дзвінка
      setTimeout(() => {
        scrollToBottom('auto');
        // console.log('[Call] Jumped to bottom after call ended');
      }, 100);
    }
  };

  // Локальний слухач поточного дзвінка: якщо статус змінився на ended/declined або документ видалено — закриваємо інтерфейс
  useEffect(() => {
    if (!activeCall?.id) return;
    const callRef = doc(db, 'calls', activeCall.id);
    const unsub = onSnapshot(callRef, (snap) => {
      if (!snap.exists()) {
        // console.log('[Call] Call doc deleted, clearing activeCall');
        setActiveCallDebug(null);
        
        // Миттєво переходимо до кінця чату після завершення дзвінка
        setTimeout(() => {
          scrollToBottom('auto');
          // console.log('[Call] Jumped to bottom after call doc deleted');
        }, 100);
        return;
      }
      const data = snap.data();
      if (data.status === 'ended' || data.status === 'declined') {
        // console.log('[Call] Call status changed to', data.status, '— clearing activeCall');
        setActiveCallDebug(null);
        
        // Миттєво переходимо до кінця чату після завершення дзвінка
        setTimeout(() => {
          scrollToBottom('auto');
          // console.log('[Call] Jumped to bottom after call status changed');
        }, 100);
      }
    }, (err) => {
      console.warn('[Call] Call doc listener error:', err);
    });
    return () => unsub();
  }, [activeCall?.id, setActiveCallDebug]);

  const cancelOutgoingCall = async () => {
    setIsWaitingCall(false);
    try {
      const id = waitingCallIdRef.current;
      if (id) {
        await updateDoc(doc(db, 'calls', id), { status: 'ended' });
        
        // Додаємо повідомлення про скасування відеодзвінка
        try {
          const chatId = getChatId(currentUser.uid, selectedUser.uid);
          await addDoc(collection(db, 'messages'), {
            chatId: chatId,
            senderId: currentUser.uid,
            receiverId: selectedUser.uid,
            text: `📞 Video call cancelled`,
            timestamp: serverTimestamp(),
            read: false,
            type: 'call',
            callId: id,
            callType: 'video'
          });
          // console.log('Video call cancelled message added to chat');
        } catch (error) {
          console.error('Error adding video call cancelled message:', error);
        }
      }
    } catch (_) {}
    waitingCallIdRef.current = null;
  };




  // Call status changes are handled in App.js to avoid duplicates

  // Call status is now handled by global listener in App.js

  // Active call management is now handled by global listener in App.js

  // Перевірка та завершення дзвінків при завантаженні сторінки
  useEffect(() => {
    const checkAndEndCalls = async () => {
      try {
        // Перевіряємо, чи є дзвінки для завершення
        const callToEnd = localStorage.getItem('callToEnd');
        if (callToEnd) {
          const callData = JSON.parse(callToEnd);
          // console.log('[Call] Found call to end from previous session:', callData);
          
          // Завершуємо дзвінок
          await updateDoc(doc(db, 'calls', callData.callId), { 
            status: 'ended',
            endedAt: serverTimestamp(),
            endedBy: callData.endedBy || 'page_reload'
          });
          
          // Видаляємо з localStorage
          localStorage.removeItem('callToEnd');
          // console.log('[Call] Call ended from previous session');
        }
        
        // Перевіряємо, чи є активний дзвінок, який потрібно завершити
        const activeCallData = localStorage.getItem('activeCall');
        if (activeCallData) {
          const callInfo = JSON.parse(activeCallData);
          const callAge = Date.now() - callInfo.timestamp;
          
          // Якщо дзвінок старший за 5 хвилин, завершуємо його
          if (callAge > 5 * 60 * 1000) {
            // console.log('[Call] Ending stale call from previous session:', callInfo.callId);
            await updateDoc(doc(db, 'calls', callInfo.callId), { 
              status: 'ended',
              endedAt: serverTimestamp(),
              endedBy: 'stale_call_cleanup'
            });
            localStorage.removeItem('activeCall');
          }
        }
      } catch (error) {
        console.error('[Call] Error checking calls on page load:', error);
      }
    };
    
    checkAndEndCalls();
  }, []); // Запускаємо тільки при завантаженні сторінки

  // Heartbeat механізм для відстеження активності під час дзвінка
  useEffect(() => {
    if (!activeCall?.id) return;
    
    const heartbeatInterval = setInterval(async () => {
      try {
        // Оновлюємо timestamp активного дзвінка
        localStorage.setItem('activeCall', JSON.stringify({
          callId: activeCall.id,
          callerId: activeCall.callerId,
          calleeId: activeCall.calleeId,
          timestamp: Date.now()
        }));
        
        // Оновлюємо статус дзвінка в Firestore
        await updateDoc(doc(db, 'calls', activeCall.id), { 
          lastHeartbeat: serverTimestamp()
        });
        
        // console.log('[Call] Heartbeat sent for call:', activeCall.id);
      } catch (error) {
        console.error('[Call] Heartbeat failed:', error);
      }
    }, 10000); // Кожні 10 секунд
    
    return () => clearInterval(heartbeatInterval);
  }, [activeCall?.id]);

  // Збереження активного дзвінка в localStorage для відновлення
  useEffect(() => {
    if (activeCall?.id) {
      localStorage.setItem('activeCall', JSON.stringify({
        callId: activeCall.id,
        callerId: activeCall.callerId,
        calleeId: activeCall.calleeId,
        timestamp: Date.now()
      }));
      // console.log('[Call] Active call saved to localStorage:', activeCall.id);
    } else {
      localStorage.removeItem('activeCall');
      // console.log('[Call] Active call removed from localStorage');
    }
  }, [activeCall?.id]);

  // Завершити дзвінок при перезавантаженні/закритті вкладки
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (activeCall?.id) {
        // console.log('[Call] Page unloading, marking call to end:', activeCall.id);
        
        // Зберігаємо інформацію про завершення в localStorage
        localStorage.setItem('callToEnd', JSON.stringify({
          callId: activeCall.id,
          endedBy: 'page_unload',
          timestamp: Date.now(),
          userId: currentUser?.uid
        }));
        
        // console.log('[Call] Call marked for ending on next page load');
      }
    };

    const handleUnload = () => {
      if (activeCall?.id) {
        // console.log('[Call] Page unloaded, call should be ended:', activeCall.id);
      }
    };

    // Обробник для випадку, коли сторінка приховується (закриття вкладки/браузера)
    const handlePageHide = async () => {
      if (activeCall?.id) {
        // console.log('[Call] Page hidden, ending call:', activeCall.id, 'Stack trace:', new Error().stack);
        try {
          // console.log('[Call] Updating call status to ended from page_hidden');
          await updateDoc(doc(db, 'calls', activeCall.id), { 
            status: 'ended',
            endedAt: serverTimestamp(),
            endedBy: 'page_hidden'
          });
          // console.log('[Call] Call status updated to ended from page_hidden');
          
          // Повідомлення про закінчення дзвінка додається в App.js
        } catch (error) {
          console.error('[Call] Error ending call on page hidden:', error);
        }
      }
    };

    // Обробник для випадку, коли користувач натискає кнопку "Назад" в браузері
    const handlePopState = async () => {
      if (activeCall?.id) {
        // console.log('[Call] Browser back button pressed, ending call:', activeCall.id, 'Stack trace:', new Error().stack);
        try {
          // console.log('[Call] Updating call status to ended from browser_back');
          await updateDoc(doc(db, 'calls', activeCall.id), { 
            status: 'ended',
            endedAt: serverTimestamp(),
            endedBy: 'browser_back'
          });
          // console.log('[Call] Call status updated to ended from browser_back');
        } catch (error) {
          // console.log('[Call] Firestore update failed on popstate (expected):', error);
        }
      }
    };

    // Додаємо всі обробники для максимальної надійності
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeCall?.id, currentUser?.uid, selectedUser?.uid]);

  // Відстежуємо геометрію області повідомлень для коректного позиціонування кнопки (fixed по центру чату)
  useEffect(() => {
    const updateRect = () => {
      if (!messagesAreaRef.current) return;
      const r = messagesAreaRef.current.getBoundingClientRect();
      setOverlayRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // console.log('Click detected, showDropdown:', showDropdown);
      // console.log('Target:', event.target);
      // console.log('Closest dropdown-container:', event.target.closest('.dropdown-container'));
      // console.log('Closest header:', event.target.closest('.header'));
      
      if (showDropdown && !event.target.closest('.dropdown-container')) {
        // console.log('Closing dropdown due to outside click');
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      // Add a small delay to prevent immediate closing
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDropdown]);

  // Function to group messages by date
  const groupMessagesByDate = (messages) => {
    const grouped = [];
    let currentDate = null;
    
    messages.forEach((message, index) => {
      const messageDate = new Date(message.timestamp?.toDate() || message.timestamp);
      const dateString = messageDate.toDateString();
      
      if (currentDate !== dateString) {
        currentDate = dateString;
        grouped.push({
          type: 'date',
          date: messageDate,
          id: `date-${dateString}`
        });
      }
      
      grouped.push({
        ...message,
        type: 'message'
      });
    });
    
    return grouped;
  };

  useEffect(() => {
    if (!selectedUser || !currentUser) return;

    const uidA = currentUser?.uid;
    const uidB = selectedUser?.uid;
    if (!uidA || !uidB) return;

    const chatId = getChatId(uidA, uidB);
    if (!chatId) return;

    const messagesRef = collection(db, 'messages');

    // 1) За chatId (нові повідомлення мають chatId)
    const byChatIdQ = query(messagesRef, where('chatId', '==', chatId));
    // 2) Старі варіанти без chatId: напрямок A->B
    const bySenderAReceiverBQ = query(
      messagesRef,
      where('senderId', '==', uidA),
      where('receiverId', '==', uidB)
    );
    // 3) І зворотній напрямок B->A
    const bySenderBReceiverAQ = query(
      messagesRef,
      where('senderId', '==', uidB),
      where('receiverId', '==', uidA)
    );

    const allUnsubs = [];
    const results = { byChatId: [], a2b: [], b2a: [] };

    const processAndCommit = () => {
      // Об'єднуємо і видаляємо дублікати за id
      const map = new Map();
      [...results.byChatId, ...results.a2b, ...results.b2a].forEach((m) => {
        if (!m) return;
        map.set(m.id, m);
      });
      const merged = Array.from(map.values());

      // Сортуємо локально, враховуючи різні типи timestamp
      merged.sort((a, b) => {
        const aTime = a.timestamp?.toDate?.()?.getTime?.() || (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0);
        const bTime = b.timestamp?.toDate?.()?.getTime?.() || (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0);
        return aTime - bTime;
      });

      // Add senderName to each message for the context menu reply feature
      const augmentedMessages = merged.map(msg => ({
          ...msg,
          senderName: msg.senderId === currentUser.uid 
              ? (currentUser.name || currentUser.displayName) 
              : (selectedUser.name || 'User')
      }));

      setMessages(augmentedMessages);
      markMessagesAsRead(augmentedMessages);
    };

    const makeListener = (q, key) =>
      onSnapshot(q, (snapshot) => {
        const arr = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        results[key] = arr;
        processAndCommit();
      }, (err) => console.error('Messages listener error:', err));

    allUnsubs.push(makeListener(byChatIdQ, 'byChatId'));
    allUnsubs.push(makeListener(bySenderAReceiverBQ, 'a2b'));
    allUnsubs.push(makeListener(bySenderBReceiverAQ, 'b2a'));

    return () => allUnsubs.forEach((u) => u && u());
  }, [selectedUser, currentUser]);

  // Автоматичне прокручування до останнього повідомлення
  // This hook is too aggressive and causes scrolling on edit/delete.
  // We will replace it with a more intelligent version.
  
  const messagesLenRef = useRef(messages.length);
  const inputRef = useRef(null); // Ref for the message input field

  useEffect(() => {
      // Only scroll to bottom if new messages were ADDED, not on edit or delete.
      const shouldScroll = messages.length > messagesLenRef.current;
      
      // AND only scroll if the user is already near the bottom.
      const messagesArea = messagesAreaRef.current;
      if (messagesArea && shouldScroll) {
          const isScrolledToBottom = messagesArea.scrollHeight - messagesArea.scrollTop <= messagesArea.clientHeight + 100; // 100px tolerance
          if (isScrolledToBottom) {
              scrollToBottom('auto'); // Use 'auto' for instant scroll if already at bottom
          }
      }

      // Update the ref for the next render.
      messagesLenRef.current = messages.length;
  }, [messages]);

  // Combined effect for all scroll-related logic
  useEffect(() => {
    const messagesArea = messagesAreaRef.current;
    if (!messagesArea) return;

    const handleScroll = () => {
      // 1. Check if scrolling is possible
      const canScrollNow = messagesArea.scrollHeight > messagesArea.clientHeight;
      setCanScroll(canScrollNow);

      if (!canScrollNow) {
        setShowScrollButton(false);
        return;
      }

      // 2. Show buttons and set a timer to hide them
      setShowScrollButton(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setShowScrollButton(false);
      }, 1500); // Hide after 1.5 seconds of inactivity

      // 3. Determine scroll direction (for future use, if needed)
      const { scrollTop } = messagesArea;
      lastScrollTopRef.current = scrollTop;
    };

    // Initial check when the chat loads
    const initialCheck = () => {
      const canScrollNow = messagesArea.scrollHeight > messagesArea.clientHeight;
      setCanScroll(canScrollNow);
      setShowScrollButton(false); // Buttons are hidden initially
    };
    
    const checkTimeout = setTimeout(initialCheck, 100);
    messagesArea.addEventListener('scroll', handleScroll);

    // Cleanup function
    return () => {
      messagesArea.removeEventListener('scroll', handleScroll);
      clearTimeout(checkTimeout);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [messages, selectedUser]); // Re-run when chat content or user changes

  useEffect(() => {
    // This effect ensures that when you open a chat, it scrolls to the bottom.
    if (selectedUser) {
      setTimeout(() => {
        scrollToBottom('auto');
      }, 150); // A small delay to allow messages to render
    }
  }, [selectedUser]); // It runs only when you switch to a different user.

  // Миттєво переходимо до кінця чату коли дзвінок закінчується (activeCall стає null)
  useEffect(() => {
    if (!activeCall && selectedUser) {
      // Дзвінок закінчився, миттєво переходимо до кінця чату
      setTimeout(() => {
        scrollToBottom('auto');
        // console.log('[Call] Jumped to bottom after call ended (activeCall became null)');
      }, 200);
    }
  }, [activeCall, selectedUser]);

  const getChatId = (uid1, uid2) => {
    if (!uid1 || !uid2) {
      // console.log('getChatId: missing uid1 or uid2', { uid1, uid2 });
      return null;
    }
    return [uid1, uid2].sort().join('_');
  };


  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Контекстне меню для повідомлень
  const handleMessageRightClick = (e, message) => {
    e.preventDefault();

    if (message.type === 'call' || message.text?.includes('📞')) {
      return;
    }

    const messageElement = e.currentTarget;
    const rect = messageElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const isOwnMessage = message.senderId === currentUser?.uid;

    // --- Intelligent Position Calculation ---

    // 1. Calculate X position (horizontal centering)
    let centerX;
    if (isOwnMessage) {
      // For own messages, shift the menu slightly to the left from the center
      centerX = rect.left + rect.width / 2 - 40;
    } else {
      const messageContent = messageElement.querySelector('.message-content');
      if (messageContent) {
        const contentRect = messageContent.getBoundingClientRect();
        centerX = contentRect.left + contentRect.width / 2;
      } else {
        // Fallback for unexpected structure
        centerX = rect.left + (rect.width - 60) / 2 + 30;
      }
    }

    // 2. Calculate Y position (vertical placement)
    const ITEM_HEIGHT = 38; // Estimated height of one item
    const MENU_VERTICAL_PADDING = 12;
    const MENU_OFFSET = 8; // Space between message and menu
    const reactionBarHeight = 45; // Estimated height of the reaction bar
    const itemCount = isOwnMessage ? 4 : 2;
    const estimatedMenuHeight = (itemCount * ITEM_HEIGHT) + MENU_VERTICAL_PADDING + reactionBarHeight;

    let y;
    // Check if there's enough space below
    if (rect.bottom + estimatedMenuHeight + MENU_OFFSET > viewportHeight) {
      // Not enough space below, so place it above
      y = rect.top - estimatedMenuHeight - MENU_OFFSET;
    } else {
      // Enough space, place it below (default)
      y = rect.bottom + MENU_OFFSET;
    }

    setContextMenu({
      x: centerX,
      y: y,
      message: message,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // This effect for repositioning is no longer needed and will be removed.

  const handleReply = (message) => {
    setReplyingToMessage(message);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleCopy = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text);
      // console.log('Text copied successfully!');
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleEdit = (message) => {
    // This now correctly triggers the INLINE editing UI
    setEditingMessage(message.id);
    setEditText(message.text);
  };

  const handleDelete = async (message) => {
    // This now correctly triggers the INLINE editing UI
    try {
      await deleteMessage(message.id);
      return true; // Close menu on success
    } catch (error) {
      console.error('Error deleting message:', error);
      return true; // Still close menu on error
    }
  };

  const handleQuotedReplyClick = (messageId) => {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight the message briefly
      messageElement.classList.add('highlighted-message');
      setTimeout(() => {
        messageElement.classList.remove('highlighted-message');
      }, 2000);
    }
  };

  // The new combined useEffect replaces all previous context menu handlers.

  // Функції пошуку в чаті
  const handleSearch = (query) => {
    setSearchQuery(query);
    if (query.trim() === '') {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    const results = messages
      .map((message, index) => ({ ...message, index }))
      .filter(message => 
        message.text && message.text.toLowerCase().includes(query.toLowerCase())
      );
    
    
    setSearchResults(results);
    setCurrentSearchIndex(0);
    
    // Якщо є результати, прокручуємо до першого
    if (results.length > 0) {
      // Додаємо невелику затримку, щоб DOM встиг оновитися
      setTimeout(() => {
        scrollToSearchResult(0);
      }, 100);
    }
  };

  const scrollToSearchResult = (index) => {
    if (searchResults.length === 0) return;
    
    const message = searchResults[index];
    
    // Спробуємо знайти елемент за ID повідомлення
    let messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    
    // Якщо не знайшли за ID, спробуємо за індексом
    if (!messageElement) {
      messageElement = document.querySelector(`[data-message-index="${message.index}"]`);
    }
    
    // Якщо все ще не знайшли, спробуємо знайти за текстом
    if (!messageElement) {
      const allMessages = document.querySelectorAll('.message');
      messageElement = Array.from(allMessages).find(el => 
        el.textContent.includes(message.text)
      );
    }
    
    if (messageElement) {
      // Прокручуємо до повідомлення
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Підсвічуємо повідомлення
      messageElement.style.backgroundColor = '#fff3cd';
      messageElement.style.border = '2px solid #ffc107';
      
      // Прибираємо підсвічування через 3 секунди
      setTimeout(() => {
        messageElement.style.backgroundColor = '';
        messageElement.style.border = '';
      }, 3000);
      
    }
  };

  const nextSearchResult = () => {
    if (searchResults.length === 0) return;
    const nextIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(nextIndex);
    scrollToSearchResult(nextIndex);
  };

  const prevSearchResult = () => {
    if (searchResults.length === 0) return;
    const prevIndex = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1;
    setCurrentSearchIndex(prevIndex);
    scrollToSearchResult(prevIndex);
  };


  const markMessagesAsRead = async (messagesData) => {
    if (!currentUser) return;
    
    const unreadMessages = messagesData.filter(
      msg => msg.receiverId === currentUser.uid && !msg.read
    );

    for (const message of unreadMessages) {
      try {
        await updateDoc(doc(db, 'messages', message.id), {
          read: true,
          readAt: serverTimestamp()
        });
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const text = newMessage.trim();
    if (!text || !selectedUser || !currentUser) {
      return;
    }

    setLoading(true);

    // NOTE: All editing logic has been removed from here and is now handled
    // by the inline `saveEdit` function. This function only sends new messages.

    // Handle SENDING a NEW message
    try {
      const chatId = getChatId(currentUser.uid, selectedUser.uid);
      if (!chatId) {
        console.error("Could not generate chatId.");
        setLoading(false);
        return;
      }
      
      // Live message logic for active calls
      if (activeCall?.id) {
        // console.log('[LiveMessages] Sending live message during call.');
        const liveMessageData = {
            callId: activeCall.id,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.name || 'Anonymous',
            receiverId: selectedUser.uid,
            text: text,
            timestamp: serverTimestamp(),
            type: 'live_message',
            isLive: true
        };
        await addDoc(collection(db, 'liveMessages'), liveMessageData);
      }

      const messageData = {
        chatId: chatId,
        senderId: currentUser.uid,
        receiverId: selectedUser.uid,
        text: text,
        timestamp: serverTimestamp(),
        read: false,
        type: 'text'
      };

      if (replyingToMessage) {
        messageData.replyTo = {
          messageId: replyingToMessage.id,
          senderName: replyingToMessage.senderName,
          text: replyingToMessage.text,
        };
      }

      await addDoc(collection(db, 'messages'), messageData);
      setNewMessage('');
      setReplyingToMessage(null); // Clear reply state after sending
      // The useEffect that watches messages length will handle scrolling
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendEmoji = (emoji) => {
    setNewMessage(prev => prev + emoji);
  };

  const sendEmojiMessage = async (emoji) => {
    if (!selectedUser || !currentUser) return;
    
    setLoading(true);
    try {
      const chatId = getChatId(currentUser.uid, selectedUser.uid);
      
      await addDoc(collection(db, 'messages'), {
        chatId: chatId,
        senderId: currentUser.uid,
        receiverId: selectedUser.uid,
        text: emoji,
        timestamp: serverTimestamp(),
        read: false,
        type: 'emoji'
      });
      
      setShowEmojiMenu(false); // Close emoji menu after sending
    } catch (error) {
      console.error('Error sending emoji:', error);
    } finally {
      setLoading(false);
    }
  };

  // old startVideoCall removed (now using Firestore signalling initiateVideoCall)

  const startVoiceCall = (user) => {
    if (!user) return;
    
    // Створюємо URL для голосового дзвінка
    const callId = `${currentUser.uid}_${user.uid}_${Date.now()}`;
    
    // Відправляємо повідомлення про початок дзвінка
    const sendCallMessage = async () => {
      try {
        const chatId = getChatId(currentUser.uid, user.uid);
        
        await addDoc(collection(db, 'messages'), {
          chatId: chatId,
          senderId: currentUser.uid,
          receiverId: user.uid,
          text: `📞 Started a voice call`,
          timestamp: serverTimestamp(),
          read: false,
          type: 'call',
          callId: callId,
          callType: 'voice'
        });
        
        // Відкриваємо голосовий дзвінок в новому вікні
        const callUrl = `/voice-call/${callId}`;
        window.open(callUrl, '_blank', 'width=600,height=400');
        
      } catch (error) {
        console.error('Error starting voice call:', error);
      }
    };
    
    sendCallMessage();
  };

  const deleteMessage = async (messageId) => {
    try {
      await deleteDoc(doc(db, 'messages', messageId));
      // console.log('Message deleted successfully');
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const startEdit = (message) => {
    setEditingMessage(message.id);
    setEditText(message.text);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
  };

  const saveEdit = async (messageId) => {
    if (!editText.trim()) {
      return;
    }

    try {
      await updateDoc(doc(db, 'messages', messageId), {
        text: editText.trim(),
        edited: true,
        editedAt: serverTimestamp()
      });
      setEditingMessage(null);
      setEditText('');
      // console.log('Message edited successfully');
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };

  const handleFileUpload = async (e) => {
    // console.log('File upload triggered');
    const file = e.target.files[0];
    // console.log('Selected file:', file);
    
    if (!file) {
      // console.log('No file selected');
      return;
    }
    
    if (!selectedUser) {
      // console.log('No selected user');
      return;
    }
    
    if (!currentUser) {
      // console.log('No current user');
      return;
    }

    // Перевіряємо розмір файлу (максимум 1MB для Firebase Firestore)
    const maxSize = 1024 * 1024; // 1MB в байтах
    if (file.size > maxSize) {
      setToast({
        message: `File too large! Maximum size: ${Math.round(maxSize / 1024)}KB. Your file size: ${Math.round(file.size / 1024)}KB. Please try a smaller file.`,
        type: 'error'
      });
      return;
    }

    // console.log('Starting file upload process...');
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target.result;
        const fileType = file.type.split('/')[0]; // image, video, audio, etc.
        
        // Визначаємо тип файлу
        let messageText = '';
        let messageType = 'file';
        
        if (fileType === 'image') {
          messageText = `📷 ${file.name}`;
          messageType = 'image';
        } else if (fileType === 'video') {
          messageText = `🎥 ${file.name}`;
          messageType = 'video';
        } else if (fileType === 'audio') {
          messageText = `🎵 ${file.name}`;
          messageType = 'audio';
        } else {
          messageText = `📎 ${file.name}`;
          messageType = 'file';
        }
        
        const chatId = getChatId(currentUser.uid, selectedUser.uid);
        
        // Відправляємо повідомлення з медіа
        const messageData = {
          chatId: chatId,
          senderId: currentUser.uid,
          receiverId: selectedUser.uid,
          text: messageText,
          timestamp: serverTimestamp(),
          read: false,
          type: messageType,
          fileName: file.name,
          fileSize: file.size,
          fileData: base64,
          mimeType: file.type
        };
        
        // console.log('Saving message with file data:', {
        //   fileName: file.name,
        //   fileSize: file.size,
        //   mimeType: file.type,
        //   dataLength: base64?.length,
        //   dataStart: base64?.substring(0, 50),
        //   dataEnd: base64?.substring(base64.length - 50),
        //   isValidBase64: base64?.startsWith('data:')
        // });
        
        // Додаткова перевірка розміру base64 даних
        if (base64.length > 1048487) { // 1MB в байтах для Firebase
          setToast({
            message: 'File too large after encoding! Please try a smaller file.',
            type: 'error'
          });
          return;
        }
        
        await addDoc(collection(db, 'messages'), messageData);
        
        // Показуємо успішне повідомлення
        setToast({
          message: `File "${file.name}" sent successfully!`,
          type: 'success'
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      let errorMessage = 'Error uploading file.';
      
      if (error.message && error.message.includes('longer than 1048487 bytes')) {
        errorMessage = 'File too large! Maximum size: 1MB. Please try a smaller file.';
      } else if (error.message && error.message.includes('quota')) {
        errorMessage = 'Storage quota exceeded. Please try again later.';
      } else {
        errorMessage = 'Error uploading file. Please check your connection and try again.';
      }
      
      setToast({
        message: errorMessage,
        type: 'error'
      });
    } finally {
      // console.log('File upload process finished');
      setLoading(false);
    }
  };

  const formatTime = (timestamp) => {
    try {
      // console.log('Formatting timestamp:', timestamp);
      
      // Перевіряємо, чи це Firestore Timestamp
      let date;
      if (timestamp && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
        // console.log('Converted Firestore timestamp to date:', date);
      } else if (timestamp instanceof Date) {
        date = timestamp;
        // console.log('Using Date object:', date);
      } else if (timestamp && timestamp.seconds) {
        // Якщо це Firestore timestamp object
        date = new Date(timestamp.seconds * 1000);
        // console.log('Converted Firestore seconds to date:', date);
      } else {
        console.error('Invalid timestamp:', timestamp);
        return 'Invalid time';
      }
      
      const now = new Date();
      const diff = now - date;
      
      if (diff < 60000) { // Менше хвилини
        return 'Just now';
      } else if (diff < 3600000) { // Менше години
        return `${Math.floor(diff / 60000)}m ago`;
      } else if (diff < 86400000) { // Менше дня
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
      console.error('Error formatting time:', error);
      return 'Invalid time';
    }
  };

  if (!selectedUser) {
    return (
      <div className="chat-interface">
        <div className="no-chat-selected">
          <h3>Select a user to start chatting</h3>
          <p>Choose someone from your friends list or search for users</p>
        </div>
      </div>
    );
  }

  

  return (
    <div className="chat-interface">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-user-info">
          <div 
            className="chat-user-avatar clickable-avatar"
            onClick={() => {
              if (selectedUser.avatar) {
                setImagePreviewUrl(null); // ensure avatar modal shows avatar, not last image
                setShowAvatarZoom(true);
              } else {
                setShowProfileModal(true);
              }
            }}
            title={selectedUser.avatar ? "Zoom photo" : "View profile"}
          >
            {selectedUser.avatar ? (
              <img src={selectedUser.avatar} alt={selectedUser.name} />
            ) : (
              <div className="avatar-placeholder">
                {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
          </div>
          <div className="chat-user-details">
            <div className="chat-user-name">{selectedUser.name}</div>
            <div className={`chat-user-status ${userOnlineStatus.isOnline ? 'online' : 'offline'}`}>
              {userOnlineStatus.isOnline ? 'Online' : (formatLastSeen(userOnlineStatus.lastSeen) || 'Offline')}
            </div>
          </div>
        </div>
        <div className="chat-actions">
          <button 
            className={`chat-action-btn ${!userOnlineStatus.isOnline ? 'disabled' : ''}`}
            title={!userOnlineStatus.isOnline ? "User is offline" : "Start Call"}
            onClick={() => {
              if (userOnlineStatus.isOnline) {
                initiateVideoCall(selectedUser);
              }
            }}
            disabled={!userOnlineStatus.isOnline}
          >
            📞
          </button>
          <div className={`dropdown-container ${!showDropdown ? 'inactive' : ''}`}>
            <button 
              className="chat-action-btn" 
              title="More"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // console.log('Menu button clicked, current showDropdown:', showDropdown);
                setShowDropdown(!showDropdown);
                // console.log('Setting showDropdown to:', !showDropdown);
              }}
            >
              ⋯
            </button>
          <div className={`dropdown-menu ${!showDropdown ? 'hidden' : ''}`}>
                <button 
                  className="dropdown-item"
                  onClick={() => {
                    // console.log('View Profile clicked');
                    setShowProfileModal(true);
                    setShowDropdown(false);
                    // console.log('setShowProfileModal(true) called');
                  }}
                >
                  View Profile
                </button>
                <button 
                  className="dropdown-item remove-item"
                  onClick={() => {
                    onRemoveFriend(selectedUser.uid);
                    onClose();
                    setShowDropdown(false);
                  }}
                >
                  Remove from Friends
                </button>
              </div>
          </div>
          <button className="chat-action-btn close-btn-chat" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      {/* Chat Search Bar - приховуємо під час відеозвінка */}
      {!(activeCall && activeCall.status === 'accepted') && (
        <div className="chat-search-bar">
          <div className="chat-search-container">
            <input
              type="text"
              placeholder="Search in chat..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="chat-search-input"
            />
            {searchQuery && (
              <div className="chat-search-controls">
                <span className="search-counter">{currentSearchIndex + 1} з {searchResults.length}</span>
                <button 
                  className="search-nav-btn" 
                  onClick={prevSearchResult} 
                  disabled={searchResults.length === 0}
                  title="Попередній результат"
                >
                  ↑
                </button>
                <button 
                  className="search-nav-btn" 
                  onClick={nextSearchResult} 
                  disabled={searchResults.length === 0}
                  title="Наступний результат"
                >
                  ↓
                </button>
                <button 
                  className="search-clear-btn" 
                  onClick={() => handleSearch('')}
                  title="Очистити пошук"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* Площа повідомлень або відеодзвінок */}
      <div ref={messagesAreaRef} className={`messages-area ${activeCall && activeCall.status === 'accepted' ? 'has-video-call' : ''}`}>
        {activeCall && activeCall.status === 'accepted' ? (
          // Показуємо VideoCallInterface замість повідомлень
          <VideoCallInterface
            onEnd={endActiveCallNow}
            isCaller={activeCall.callerId === currentUser?.uid}
            callId={activeCall.id}
            currentUserId={currentUser?.uid}
            remoteUserId={activeCall.callerId === currentUser?.uid ? activeCall.calleeId : activeCall.callerId}
            remoteUserName={
              activeCall.callerId === currentUser?.uid
                ? activeCall.calleeName
                : activeCall.callerName
            }
          />
        ) : messages.length === 0 ? (
          <div className="no-messages">
            <h4>Start a conversation with {selectedUser.name}</h4>
            <p>Send a message, emoji, or share a file!</p>
          </div>
        ) : (
          <div className="messages-list">
            {groupMessagesByDate(messages).map((item) => {
              if (item.type === 'date') {
                return (
                  <div key={item.id} className="chat-date-divider">
                    <span className="chat-date-text">
                      {item.date.toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                );
              }
              
              const message = item;
              const isOwnMessage = message.senderId === currentUser?.uid;
              const isEditing = editingMessage === message.id;
              const reactionsForDisplay = getReactionsForDisplay(message.reactions);
              
              // Діагностика для перевірки відступів
              // console.log('[Message Debug]', {
              //   messageId: message.id,
              //   senderId: message.senderId,
              //   currentUserId: currentUser?.uid,
              //   isOwnMessage,
              //   type: message.type,
              //   hasFileData: !!message.fileData,
              //   fileName: message.fileName,
              //   text: message.text?.substring(0, 20) + '...',
              //   fullMessage: message
              // });
              
              return (
                <div
                  key={message.id}
                  className={`message ${isOwnMessage ? 'sent' : 'received'}`}
                  data-message-id={message.id}
                  data-message-index={messages.indexOf(message)}
                  onContextMenu={(e) => handleMessageRightClick(e, message)}
                >
                  {!isOwnMessage && (
                    <div 
                      className="message-avatar clickable-avatar"
                      onClick={(e) => {
                        e.stopPropagation(); // Запобігаємо конфлікту з контекстним меню
                        if (selectedUser.avatar) {
                          setImagePreviewUrl(null); // ensure avatar modal shows avatar, not last image
                          setShowAvatarZoom(true);
                        }
                      }}
                      title={selectedUser.avatar ? "Збільшити фото" : ""}
                      style={{ cursor: selectedUser.avatar ? 'pointer' : 'default' }}
                    >
                      {selectedUser.avatar ? (
                        <img src={selectedUser.avatar} alt={selectedUser.name} />
                      ) : (
                        <div className="avatar-placeholder">
                          {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="message-bubble-wrapper">
                    <div className="message-content">
                      {isEditing ? (
                        <div className="message-edit-form">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="message-edit-input"
                            autoFocus
                          />
                          <div className="message-edit-buttons">
                            <button
                              onClick={() => saveEdit(message.id)}
                              className="message-edit-save"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="message-edit-cancel"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="message-inner">
                            {message.replyTo && (
                              <div 
                                className="quoted-reply"
                                onClick={() => handleQuotedReplyClick(message.replyTo.messageId)}
                              >
                                <div className="quoted-reply-sender">{message.replyTo.senderName}</div>
                                <div className="quoted-reply-text">{message.replyTo.text}</div>
                              </div>
                            )}
                            <div className="message-text-content">
                              {(
                                // treat as image if any of these conditions are true
                                message.type === 'image' ||
                                  (typeof message.mimeType === 'string' && message.mimeType.startsWith('image/')) ||
                                  (typeof message.fileData === 'string' && message.fileData.startsWith('data:image/')) ||
                                  (typeof message.text === 'string' && message.text.startsWith('data:image/')) ||
                                  (/\.(png|jpe?g|gif|webp|bmp|svg)$/i).test(String(message.fileName || message.text || ''))
                                ) ? (
                                  <div className="media-message">
                                    <div className="image-container">
                                      <img 
                                        src={
                                          message.fileData && message.fileData.startsWith('data:')
                                            ? message.fileData
                                            : (typeof message.text === 'string' && message.text.startsWith('data:image/'))
                                              ? message.text
                                              : (typeof message.fileData === 'string' && (message.fileData.startsWith('http://') || message.fileData.startsWith('https://')))
                                                ? message.fileData
                                                : String(message.text || '')
                                        } 
                                        alt={message.fileName || 'image'} 
                                        className="message-image"
                                        onClick={() => openImageModal(
                                          message.fileData && message.fileData.startsWith('data:')
                                            ? message.fileData
                                            : (typeof message.text === 'string' && message.text.startsWith('data:image/'))
                                              ? message.text
                                              : (typeof message.fileData === 'string' && (message.fileData.startsWith('http://') || message.fileData.startsWith('https://')))
                                                ? message.fileData
                                                : String(message.text || '')
                                        )}
                                        onError={(e) => {
                                          console.error('Image load error:', e);
                                          // console.log('File data length:', message.fileData?.length);
                                          // console.log('File data start:', message.fileData?.substring(0, 100));
                                          // console.log('File name:', message.fileName);
                                          // console.log('MIME type:', message.mimeType);
                                          // console.log('Image src:', e.target.src);
                                          // Показуємо fallback якщо зображення не завантажилося
                                          e.target.style.display = 'none';
                                          e.target.nextSibling.style.display = 'block';
                                        }}
                                        onLoad={(e) => {
                                          // console.log('Image loaded successfully:', message.fileName);
                                          // console.log('Image dimensions:', e.target.naturalWidth, 'x', e.target.naturalHeight);
                                        }}
                                      />
                                      <div className="image-fallback" style={{display: 'none'}}>
                                        <div className="file-icon">📷</div>
                                        <div className="file-name">{message.fileName}</div>
                                      </div>
                                    </div>
                                  </div>
                                ) : message.type === 'video' && message.fileData ? (
                                  <div className="media-message">
                                    <video 
                                      controls 
                                      className="message-video"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(message.fileData, '_blank');
                                      }}
                                    >
                                      <source src={message.fileData} type={message.mimeType} />
                                      Your browser does not support the video tag.
                                    </video>
                                    <div className="message-text">
                                      {message.text}
                                      {message.edited && (
                                        <span className="message-edited"> (edited)</span>
                                      )}
                                    </div>
                                  </div>
                                ) : message.type === 'audio' && message.fileData ? (
                                  <div className="media-message audio-message">
                                    <div className="audio-player-container">
                                      <audio controls className="message-audio">
                                        <source src={message.fileData} type={message.mimeType} />
                                        Ваш браузер не підтримує аудіо тег.
                                      </audio>
                                      <div className="audio-info">
                                        <div className="audio-filename">{message.fileName || 'Аудіофайл'}</div>
                                        <div className="audio-size">
                                          {message.fileSize ? `${Math.round(message.fileSize / 1024)}KB` : ''}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="message-text">
                                      {message.text}
                                      {message.edited && (
                                        <span className="message-edited"> (edited)</span>
                                      )}
                                    </div>
                                  </div>
                                ) : message.type === 'emoji' ? (
                                  <div className="emoji-message">
                                    <span className="emoji-text">{message.text}</span>
                                  </div>
                                ) : message.type === 'call' ? (
                                  <div className="call-message">
                                    <div className="call-info">
                                      <span className="call-icon">
                                        📞
                                      </span>
                                      <span className="call-text">{message.text}</span>
                                    </div>
                                    <button 
                                      className="accept-call-btn"
                                      onClick={async () => {
                                        // console.log('Accepting call from message:', message.callId);
                                        try {
                                          const callRef = doc(db, 'calls', message.callId);
                                          
                                          // 1. Оновити статус дзвінка
                                          await updateDoc(callRef, {
                                            status: 'accepted',
                                            acceptedAt: serverTimestamp()
                                          });
                                          
                                          // 2. Отримати повні дані дзвінка
                                          const callSnap = await getDoc(callRef);
                                          if (!callSnap.exists()) {
                                            console.error("Call document does not exist after update!");
                                            return;
                                          }
                                          
                                          // 3. Встановити активний дзвінок з повними даними
                                          const fullCallData = { id: callSnap.id, ...callSnap.data() };
                                          // console.log('Setting activeCall for receiver with full data:', fullCallData);
                                          setActiveCallDebug(fullCallData);
                                          
                                          // console.log('Call accepted and activeCall set from message');
                                        } catch (error) {
                                          console.error('Error accepting call from message:', error);
                                        }
                                      }}
                                    >
                                      Accept Call
                                    </button>
                                  </div>
                                ) : (
                                  <div className="message-text">
                                    {message.text}
                                    {message.edited && (
                                      <span className="message-edited"> (edited)</span>
                                    )}
                                  </div>
                                )}
                            </div>
                          </div>
                          {/* New footer for reactions and time */}
                          <div className="message-footer">
                            {reactionsForDisplay.length > 0 ? (
                                <div className={`reactions-display ${isOwnMessage ? 'sent' : 'received'}`}>
                                    {reactionsForDisplay.map(({ userId, emoji }) => {
                                        const user = getUserFromCache(userId);
                                        return (
                                            <div 
                                                key={userId} 
                                                className="reaction-pill"
                                                onClick={() => handleReaction(message, emoji)}
                                                title={user ? user.name : '...'}
                                            >
                                                {user?.avatar && <img src={user.avatar} alt="" className="reaction-avatar" />}
                                                {emoji}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                              <div className="reactions-display-placeholder" />
                            )}
                            <div className="message-time">
                              {formatTime(message.timestamp)}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Кнопки прокрутки */}
        <div 
          className={`scroll-buttons-container ${canScroll && showScrollButton ? 'visible' : ''}`}
          style={overlayRect ? { left: `${overlayRect.left + overlayRect.width / 2}px` } : undefined}
        >
          <button
            onClick={() => {
              if (messagesAreaRef.current) {
                messagesAreaRef.current.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
            className="scroll-button scroll-to-top"
            title="Scroll to top"
          >
            ↑
          </button>
          <button
            onClick={() => {
              if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="scroll-button scroll-to-bottom"
            title="Scroll to bottom"
          >
            ↓
          </button>
        </div>
      </div>

      <div className="message-input-area">
        {replyingToMessage && (
          <div className="reply-preview">
            <div className="reply-preview-content">
              <div className="reply-preview-header">Replying to {replyingToMessage.senderName}</div>
              <div className="reply-preview-text">{replyingToMessage.text}</div>
            </div>
            <button onClick={() => setReplyingToMessage(null)} className="reply-preview-close">
              &times;
            </button>
          </div>
        )}
        <form onSubmit={sendMessage} className="message-form">
          <div className="input-actions">
            {/* Показуємо атач тільки якщо НЕ активний відеозвінок */}
            {!(activeCall && activeCall.status === 'accepted') && (
              <button
                type="button"
                className="input-action-btn"
                onClick={(e) => {
                  e.preventDefault();
                  // console.log('File button clicked');
                  // console.log('File input ref:', fileInputRef.current);
                  if (fileInputRef.current) {
                    fileInputRef.current.click();
                  } else {
                    console.error('File input ref is null');
                  }
                }}
                title="Attach File"
              >
                <IoAttach />
              </button>
            )}
            <div className="emoji-menu">
              <button
                type="button"
                className="input-action-btn emoji-btn"
                title="Emoji"
                onClick={() => setShowEmojiMenu(!showEmojiMenu)}
              >
                <BsEmojiSmile />
              </button>
              {showEmojiMenu && (
                <div className="emoji-picker">
                  <button onClick={() => { sendEmoji('😀'); setShowEmojiMenu(false); }} className="emoji-option">😀</button>
                  <button onClick={() => { sendEmoji('😂'); setShowEmojiMenu(false); }} className="emoji-option">😂</button>
                  <button onClick={() => { sendEmoji('❤️'); setShowEmojiMenu(false); }} className="emoji-option">❤️</button>
                  <button onClick={() => { sendEmoji('👍'); setShowEmojiMenu(false); }} className="emoji-option">👍</button>
                  <button onClick={() => { sendEmoji('👎'); setShowEmojiMenu(false); }} className="emoji-option">👎</button>
                  <button onClick={() => { sendEmoji('🎉'); setShowEmojiMenu(false); }} className="emoji-option">🎉</button>
                  <button onClick={() => { sendEmoji('😢'); setShowEmojiMenu(false); }} className="emoji-option">😢</button>
                  <button onClick={() => { sendEmoji('😡'); setShowEmojiMenu(false); }} className="emoji-option">😡</button>
                  <button onClick={() => { sendEmoji('🤔'); setShowEmojiMenu(false); }} className="emoji-option">🤔</button>
                  <button onClick={() => { sendEmoji('👏'); setShowEmojiMenu(false); }} className="emoji-option">👏</button>
                  <button onClick={() => { sendEmoji('🔥'); setShowEmojiMenu(false); }} className="emoji-option">🔥</button>
                  <button onClick={() => { sendEmoji('💯'); setShowEmojiMenu(false); }} className="emoji-option">💯</button>
                </div>
              )}
            </div>
            {/* Показуємо file input тільки якщо НЕ активний відеозвінок */}
            {!(activeCall && activeCall.status === 'accepted') && (
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileUpload}
                onClick={(e) => {
                  // console.log('File input clicked');
                  e.target.value = ''; // Reset input to allow selecting the same file
                }}
                onFocus={() => {/* console.log('File input focused') */}}
                style={{ display: 'none' }}
                accept="image/*,video/*,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.pdf,.doc,.docx"
              />
            )}
          </div>
          
          <input
            ref={inputRef} // Assign ref to the input
            type="text"
            value={newMessage}
            onChange={(e) => {
            // console.log('Input changed:', e.target.value);
            setNewMessage(e.target.value);
          }}
            placeholder={`Message ${selectedUser.name}...`}
            className="message-input"
            disabled={loading}
          />
          
          <button
            type="submit"
            className="send-btn"
            disabled={loading || !newMessage.trim()}
            onClick={(e) => {
              e.preventDefault();
              sendMessage(e);
            }}
          >
            {loading ? '⏳' : 'Send'}
          </button>
        </form>
      </div>
      
      {/* User Profile Modal */}
      {showProfileModal && (
        <UserProfileModal
          user={selectedUser}
          isVisible={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          onRemoveFriend={onRemoveFriend}
        />
      )}

      {/* Avatar Zoom Modal */}
      {/* Call Modals */}
      <CallWaitingModal
        isVisible={isWaitingCall && !activeCall}
        callee={selectedUser}
        onCancel={cancelOutgoingCall}
      />
      
      {/* Video Call Interface тепер глобальний в App.js */}
      {showAvatarZoom && (
        <AvatarZoomModal
          avatarUrl={imagePreviewUrl ? imagePreviewUrl : selectedUser.avatar}
          originalAvatarUrl={imagePreviewUrl ? imagePreviewUrl : selectedUser.originalAvatarUrl}
          userName={selectedUser.name}
          simple={!!imagePreviewUrl}
          onClose={() => { setShowAvatarZoom(false); setImagePreviewUrl(null); }}
        />
      )}

      {/* Image Modal for full-size viewing */}
      {showImageModal && (
        <div className="image-modal" onClick={closeImageModal}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-modal-close" onClick={closeImageModal}>
              ×
            </button>
            <img src={selectedImageSrc} alt="Full size image" />
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div className="context-menu-overlay">
          <div 
            ref={contextMenuRef}
            className="context-menu" 
            style={{
              left: contextMenu.x,
              top: contextMenu.y
            }}
          >
            <div ref={reactionBarRef} className="reaction-bar">
              {availableReactions.map(emoji => (
                  <div 
                      key={emoji} 
                      className="reaction-emoji" 
                      data-emoji={emoji}
                  >
                      {emoji}
                  </div>
              ))}
            </div>
            <div ref={replyButtonRef} className="context-menu-item" data-action="reply">
              💬 Reply
            </div>
            <div ref={copyButtonRef} className="context-menu-item" data-action="copy">
              📋 Copy
            </div>
            {contextMenu.message.senderId === currentUser?.uid && (
              <>
                <div ref={editButtonRef} className="context-menu-item" data-action="edit">
                  ✏️ Edit
                </div>
                <div ref={deleteButtonRef} className="context-menu-item" data-action="delete">
                  🗑️ Delete
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default ChatInterface;
