// ========================================
// ГОЛОВНИЙ ФАЙЛ ДОДАТКУ - App.js
// ========================================
// Цей файл є центральним компонентом додатку, який:
// 1. Керує маршрутизацією (роутингом) між сторінками
// 2. Управляє глобальним станом користувача та дзвінків
// 3. Обробляє вхідні відеодзвінки
// 4. Керує пошуком користувачів
// 5. Відстежує онлайн статус користувачів
// 6. Синхронізує дані з Firebase

import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import './App.css';

// Імпорт сторінок додатку
import LoginPage from './pages/LoginPage/LoginPage';           // Сторінка входу в систему
import RegisterPage from './pages/RegisterPage/RegisterPage';   // Сторінка реєстрації
import ProfilePage from './pages/ProfilePage/ProfilePage';     // Сторінка профілю користувача

// Firebase конфігурація та функції
import { auth, db } from './utils/firebase';                   // Підключення до Firebase
import { onAuthStateChanged } from 'firebase/auth';            // Відстеження зміни стану авторизації
import { collection, query, where, getDocs, getDoc, doc, onSnapshot, limit, updateDoc, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'; // Функції для роботи з базою даних

// Бібліотека для роботи з країнами та містами
import { Country, City } from 'country-state-city';

// Компоненти інтерфейсу
import Header from './components/Header/Header';               // Верхня панель з пошуком
import NavigationBar from './components/NavigationBar/NavigationBar'; // Нижня навігаційна панель
import FriendsManager from './components/FriendsManager/FriendsManager'; // Управління друзями
import ChatInterface from './components/ChatInterface/ChatInterface'; // Інтерфейс чату
import ChatsList from './components/ChatsList/ChatList';       // Список чатів
import NotificationsList from './components/NotificationsList/NotificationsList'; // Список сповіщень
import IncomingCallModal from './components/IncomingCallModal/IncomingCallModal'; // Модальне вікно вхідного дзвінка
import VideoCallInterface from './components/VideoCallInterface/VideoCallInterface'; // Інтерфейс відеодзвінка
import RandomChat from './components/RandomChat/RandomChat';   // Рандомний відеочат

// Утиліти
import { trackUserOnlineStatus } from './utils/onlineStatus';  // Відстеження онлайн статусу користувачів

// ========================================
// КОМПОНЕНТ HOME - ГОЛОВНА СТОРІНКА ДОДАТКУ
// ========================================
// Цей компонент є головною сторінкою після авторизації користувача
// ВИКОРИСТОВУЄТЬСЯ В: App.js (головний роутинг)
// ФУНКЦІЇ:
// 1. Керує пошуком користувачів за іменем, країною, містом
// 2. Відображає список чатів, друзів, сповіщень
// 3. Обробляє відкриття чату з вибраним користувачем
// 4. Відстежує кількість непрочитаних повідомлень
// 5. Керує фільтрами пошуку (країна, місто, тип чату)

function Home({ user, activeCall, setActiveCall, setActiveCallDebug }) {
  // React Router хуки для навігації
  const navigate = useNavigate();        // Для програмної навігації між сторінками
  const location = useLocation();        // Для отримання поточної локації
  const { userId } = useParams();        // Для отримання параметрів з URL

  // ===== СТАН ДЛЯ ПОШУКУ КОРИСТУВАЧІВ =====
  const [searchQuery, setSearchQuery] = useState('');           // Поточний запит пошуку
  const [searchResults, setSearchResults] = useState([]);       // Результати пошуку користувачів
  const [selectedUser, setSelectedUser] = useState(null);       // Вибраний користувач для чату
  const [showChat, setShowChat] = useState(false);              // Чи показувати інтерфейс чату

  // ===== СТАН ДЛЯ НАВІГАЦІЇ =====
  const [activeTab, setActiveTab] = useState('chats');          // Поточна активна вкладка (chats/friends/notifications)

  // ===== СТАН ДЛЯ ЛІЧИЛЬНИКІВ =====
  const [friendRequestsCount, setFriendRequestsCount] = useState(0);    // Кількість заявок в друзі
  const [friendsCount, setFriendsCount] = useState(0);                  // Кількість друзів
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);     // Кількість непрочитаних повідомлень
  const [unreadChatsCount, setUnreadChatsCount] = useState(0);          // Кількість чатів з непрочитаними повідомленнями
  const [notificationsCount, setNotificationsCount] = useState(0);      // Кількість сповіщень
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);         // Чи завантажуються лічильники
  
  // ===== СТАН ДЛЯ ФІЛЬТРІВ ПОШУКУ =====
  const [searchFilters, setSearchFilters] = useState({
    city: '',        // Фільтр за містом
    country: '',     // Фільтр за країною
    chatType: ''     // Фільтр за типом чату
  });
  const [showFilters, setShowFilters] = useState(false);        // Чи показувати панель фільтрів
  
  // ===== СТАН ДЛЯ АВТОДОПОВНЕННЯ =====
  const [countrySuggestions, setCountrySuggestions] = useState([]);     // Список країн для автодоповнення
  const [citySuggestions, setCitySuggestions] = useState([]);           // Список міст для автодоповнення
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false); // Чи показувати список країн
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  
  // Auto-hide filters when switching to chats tab
  useEffect(() => {
    if (activeTab === 'chats') {
      setShowFilters(false);
    }
  }, [activeTab]);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/friends')) setActiveTab('friends');
    else if (path.startsWith('/requests')) setActiveTab('requests');
    else if (path.startsWith('/notifications')) setActiveTab('notifications');
    else if (path.startsWith('/videochat')) setActiveTab('videochat');
    else setActiveTab('chats'); // Default to chats for /home and /chat/...
  }, [location.pathname]);

  const loadUserAndOpenChat = useCallback(async (id) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', id));
      if (userDoc.exists()) {
        const userData = { uid: id, ...userDoc.data() };
        setSelectedUser(userData);
        setShowChat(true);
      } else {
        // User not found, navigate home
        navigate('/home', { replace: true });
      }
    } catch (error) {
      console.error('Error loading user for chat:', error);
      navigate('/home', { replace: true });
    }
  }, [navigate]);

  // THIS IS THE NEW SINGLE SOURCE OF TRUTH
  useEffect(() => {
    if (userId) {
      // If we are on a chat URL, load the user
      // Avoid reloading if the user is already selected
      if (!selectedUser || selectedUser.uid !== userId) {
        loadUserAndOpenChat(userId);
      }
    } else {
      // If we are not on a chat URL (e.g. /home), clear the selected user
      setSelectedUser(null);
      setShowChat(false);
    }
  }, [userId, selectedUser, loadUserAndOpenChat]);

  // Track current user's online status
  useEffect(() => {
    if (user && user.uid) {
      // console.log('Starting online status tracking for user:', user.uid);
      // Очищаємо результати пошуку при зміні користувача
      setSearchResults([]);
      const cleanup = trackUserOnlineStatus(user.uid);
      return cleanup;
    }
  }, [user]);

  // Load initial data for indicators
  useEffect(() => {
    if (!user || !user.uid) {
      setFriendsCount(0);
      setFriendRequestsCount(0);
      setUnreadMessagesCount(0);
      setUnreadChatsCount(0);
      setNotificationsCount(0);
      return;
    }

    const loadInitialData = async () => {
      try {
        const [
          friendsSnapshot,
          requestsSnapshot,
          unreadSnapshot
        ] = await Promise.all([
          // Friends count
          getDocs(query(collection(db, 'friends'), where('userId', '==', user.uid))),
          
          // Friend requests count
          getDocs(query(collection(db, 'friendRequests'), where('toUserId', '==', user.uid), where('status', '==', 'pending'))),
          
          // Unread messages count (limited for performance)
          getDocs(query(collection(db, 'messages'), where('receiverId', '==', user.uid), where('read', '==', false), limit(50)))
        ]);

        setFriendsCount(friendsSnapshot.size);
        setFriendRequestsCount(requestsSnapshot.size);
        setUnreadMessagesCount(unreadSnapshot.size);
        setUnreadChatsCount(unreadSnapshot.size);
        setNotificationsCount(unreadSnapshot.size);
        setIsLoadingCounts(false);
        
        // console.log('✅ Initial data loaded:', {
        //   friends: friendsSnapshot.size,
        //   requests: requestsSnapshot.size,
        //   unread: unreadSnapshot.size,
        //   unreadChats: unreadSnapshot.size,
        //   notifications: unreadSnapshot.size
        // });
      } catch (error) {
        console.error('Error loading initial data:', error);
      }
    };

    loadInitialData();
  }, [user]);

  // Real-time listener for unread messages count
  useEffect(() => {
    if (!user || !user.uid) {
      setUnreadMessagesCount(0);
      setUnreadChatsCount(0);
      setNotificationsCount(0);
      setIsLoadingCounts(false);
      return;
    }

    const unreadQuery = query(
      collection(db, 'messages'), 
      where('receiverId', '==', user.uid), 
      where('read', '==', false),
      limit(50) // Limit to 50 unread messages for performance
    );

    const unsubscribe = onSnapshot(unreadQuery, (snapshot) => {
      const unreadCount = snapshot.size;
      setUnreadMessagesCount(unreadCount);
      
      // Show actual count for chats and notifications
      setUnreadChatsCount(unreadCount);
      setNotificationsCount(unreadCount);
      
      // console.log('✅ Real-time update:', {
      //   unreadMessages: unreadCount,
      //   unreadChats: unreadCount,
      //   notifications: unreadCount
      // });
    }, (error) => {
      console.error('Error listening to unread messages:', error);
    });

    return () => unsubscribe();
  }, [user]);


  const selectUser = (user) => {
    // This function now ONLY navigates. The useEffect above will handle the state.
    navigate(`/chat/${user.uid}`);
  };


  const handleTabChange = (tab) => {
    // This function now only navigates, state changes will follow from URL
    if (tab === 'chats') navigate('/home');
    else if (tab === 'friends') navigate('/friends');
    else if (tab === 'requests') navigate('/requests');
    else if (tab === 'notifications') navigate('/notifications');
    else if (tab === 'videochat') navigate('/videochat');
  };

  useEffect(() => {
    // console.log(`[DEBUG] State changed -> showChat: ${showChat}, selectedUser:`, selectedUser);
  }, [showChat, selectedUser]);


  const searchUsers = async (query, filters = searchFilters) => {
    // console.log('searchUsers called with:', { query, filters });
    
    // If no query and no filters, clear results
    if (!query.trim() && !filters.city && !filters.country && !filters.chatType) {
      // console.log('Clearing search results - no query and no filters');
      setSearchResults([]);
      return;
    }

    const loggedInUser = user; // Використовуємо user з props
    if (!loggedInUser || !loggedInUser.uid) {
      setSearchResults([]);
      return;
    }

    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);

      const uniqueUsers = new Map();
      querySnapshot.forEach(doc => {
        const userData = { id: doc.id, uid: doc.id, ...doc.data() };

        // Виключаємо поточного авторизованого користувача
        if (userData.uid && userData.uid !== loggedInUser.uid) {
          // Використовуємо UID для уникнення дублікатів
          if (!uniqueUsers.has(userData.uid)) {
            uniqueUsers.set(userData.uid, userData);
          }
        }
      });

      const allUsers = Array.from(uniqueUsers.values());

      const searchTerm = query.toLowerCase();
      const filteredUsers = allUsers.filter(user => {
        // Строга перевірка: виключаємо поточного користувача
        if (!user.uid || user.uid === loggedInUser.uid) {
          return false;
        }

        // Text search (name or UID)
        const matchesText = !query.trim() || 
          (user.name && user.name.toLowerCase().includes(searchTerm)) ||
          (user.uid && user.uid.toLowerCase().includes(searchTerm));
        
        // City filter
        const matchesCity = !filters.city || 
          (user.city && user.city.toLowerCase().includes(filters.city.toLowerCase()));
        
        // Country filter
        const matchesCountry = !filters.country || 
          (user.country && user.country.toLowerCase().includes(filters.country.toLowerCase()));
        
        // Chat type filter
        const matchesChatType = !filters.chatType || 
          (user.chatType && user.chatType.toLowerCase() === filters.chatType.toLowerCase());
        
        return matchesText && matchesCity && matchesCountry && matchesChatType;
      });

      // Додаткова перевірка: гарантуємо, що поточний користувач не в результатах
      const finalResults = filteredUsers.filter(user => {
        const isCurrentUser = user.uid === loggedInUser.uid || 
                             user.id === loggedInUser.uid ||
                             (user.email && user.email === loggedInUser.email);
        return !isCurrentUser;
      });
      
      // console.log('Final results count:', finalResults.length);
      // console.log('Current user UID:', loggedInUser.uid);
      // console.log('Results UIDs:', finalResults.map(u => u.uid));
      
      setSearchResults(finalResults);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    }
  };

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // Якщо поле порожнє - очищаємо також фільтри
    if (!query.trim()) {
      setSearchFilters({ city: '', country: '', chatType: '' });
      setSearchResults([]);
      return;
    }
    
    searchUsers(query, searchFilters);
  };

  const handleFilterChange = (filterType, value) => {
    const newFilters = { ...searchFilters, [filterType]: value };
    setSearchFilters(newFilters);
    searchUsers(searchQuery, newFilters);
  };

  const clearFilters = () => {
    setSearchFilters({ city: '', country: '', chatType: '' });
    searchUsers(searchQuery, { city: '', country: '', chatType: '' });
  };

  // Country autocomplete
  const handleCountryChange = (value) => {
    setSearchFilters(prev => ({ ...prev, country: value }));
    searchUsers(searchQuery, { ...searchFilters, country: value });
    
    if (!value.trim()) {
      setCountrySuggestions([]);
      setShowCountrySuggestions(false);
      return;
    }
    
    const filtered = Country.getAllCountries()
      .filter(country => 
        country.name.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 10);
    
    setCountrySuggestions(filtered);
    setShowCountrySuggestions(true);
  };

  // City autocomplete
  const handleCityChange = (value) => {
    setSearchFilters(prev => ({ ...prev, city: value }));
    searchUsers(searchQuery, { ...searchFilters, city: value });
    
    if (!value.trim()) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }
    
    const filtered = City.getAllCities()
      .filter(city => 
        city.name.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 10);
    
    setCitySuggestions(filtered);
    setShowCitySuggestions(true);
  };

  const selectCountry = (country) => {
    setSearchFilters(prev => ({ ...prev, country: country.name }));
    searchUsers(searchQuery, { ...searchFilters, country: country.name });
    setShowCountrySuggestions(false);
  };

  const selectCity = (city) => {
    setSearchFilters(prev => ({ ...prev, city: city.name }));
    searchUsers(searchQuery, { ...searchFilters, city: city.name });
    setShowCitySuggestions(false);
  };

  // Video call functionality moved to ChatInterface component


  return (
    <div className="home-page">
      <Header />
      <div className="main-container">
        {/* Left Sidebar - Navigation and Content */}
        <div className="sidebar">
          <div className="search-section">
            <div className="search-bar">
              <input 
                type="text" 
                placeholder="Search by name or user id..." 
                className="search-input"
                value={searchQuery}
                onChange={handleSearch}
              />
              <button className="search-btn" onClick={() => searchUsers(searchQuery, searchFilters)} title="Search users">🔍</button>
              <button 
                className={`filter-btn ${showFilters ? 'active' : ''}`}
                onClick={() => setShowFilters(!showFilters)}
                title="Filters"
              >
                ⚙️
              </button>
            </div>
            
            {/* Search Filters */}
            {showFilters && (
              <div className="search-filters">
                <div className="filter-hint">
                  💡 Use filters to find users by location and chat preferences
                </div>
                <div className="filter-row">
                  <div className="autocomplete-container">
                    <input
                      type="text"
                      placeholder="Country..."
                      className="filter-input"
                      value={searchFilters.country}
                      onChange={(e) => handleCountryChange(e.target.value)}
                      onFocus={() => setShowCountrySuggestions(true)}
                      onBlur={() => setTimeout(() => setShowCountrySuggestions(false), 200)}
                      autoComplete="off"
                    />
                    {showCountrySuggestions && countrySuggestions.length > 0 && (
                      <div className="suggestions-dropdown">
                        {countrySuggestions.map((country) => (
                          <div
                            key={country.name}
                            className="suggestion-item"
                            onMouseDown={() => selectCountry(country)}
                          >
                            {country.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="autocomplete-container">
                    <input
                      type="text"
                      placeholder="City..."
                      className="filter-input"
                      value={searchFilters.city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      onFocus={() => setShowCitySuggestions(true)}
                      onBlur={() => setTimeout(() => setShowCitySuggestions(false), 200)}
                      autoComplete="off"
                    />
                    {showCitySuggestions && citySuggestions.length > 0 && (
                      <div className="suggestions-dropdown">
                        {citySuggestions.map((city) => (
                          <div
                            key={city.name}
                            className="suggestion-item"
                            onMouseDown={() => selectCity(city)}
                          >
                            {city.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="filter-row">
                  <select
                    className="filter-select"
                    value={searchFilters.chatType}
                    onChange={(e) => handleFilterChange('chatType', e.target.value)}
                  >
                    <option value="">All Chat Types</option>
                    <option value="normal">Normal communication</option>
                    <option value="18+">Communication 18+</option>
                  </select>
                  <button className="clear-filters-btn" onClick={clearFilters}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
          
          {/* Navigation Bar */}
          <NavigationBar 
            activeTab={activeTab} 
            onTabChange={handleTabChange}
            friendRequestsCount={friendRequestsCount}
            friendsCount={friendsCount}
            unreadMessagesCount={unreadMessagesCount}
            unreadChatsCount={unreadChatsCount}
            notificationsCount={notificationsCount}
            isLoadingCounts={isLoadingCounts}
          />
          
          {/* Tab Content */}
          {activeTab === 'chats' && (
            <ChatsList 
              onUserSelect={selectUser} 
              currentUser={user} 
              onUnreadCountChange={setUnreadMessagesCount}
              onUnreadChatsCountChange={setUnreadChatsCount}
              onNotificationsCountChange={setNotificationsCount}
              activeCall={activeCall}
            />
          )}
          
          {(activeTab === 'friends' || activeTab === 'requests') && (
            <FriendsManager 
              searchResults={searchResults}
              onUserSelect={selectUser}
              activeTab={activeTab}
              setFriendRequestsCount={setFriendRequestsCount}
              setFriendsCount={setFriendsCount}
              currentUser={user} // Передаємо user далі
            />
          )}
          
          {activeTab === 'notifications' && (
            <NotificationsList 
              currentUser={user}
              onUserSelect={selectUser}
            />
          )}
          
        </div>

        {/* Right Side - Chat Area or Random Chat */}
        {activeTab === 'videochat' ? (
          <RandomChat 
            user={user}
          />
        ) : (
          <>
            {/* console.log('[Home] Rendering ChatInterface with activeCall:', activeCall) */}
            <ChatInterface 
              selectedUser={selectedUser} 
              currentUser={user} // Передаємо поточного користувача
              activeCall={activeCall}
              setActiveCall={setActiveCall}
              setActiveCallDebug={setActiveCallDebug}
              onClose={() => {
                // When closing chat, navigate to home. State will update via useEffect.
                navigate('/home');
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Component to handle calls inside Router context
function CallHandler({ user, incomingCall, setIncomingCall, activeCall, setActiveCall, setActiveCallDebug }) {
  const navigate = useNavigate();
  const [isEndingCall, setIsEndingCall] = useState(false);

  // Handle incoming call functions
  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    // console.log('[Global Call] Accept pressed. Incoming call id:', incomingCall.id);
    
    try {
      const callRef = doc(db, 'calls', incomingCall.id);

      // 1. Update call status
      await updateDoc(callRef, { status: 'accepted' });
      // console.log('[Global Call] Call status updated to accepted');
      
      // 2. Fetch the full, updated call document
      const callSnap = await getDoc(callRef);
      if (!callSnap.exists()) {
        console.error("Call document does not exist after update!");
        setIncomingCall(null);
        return;
      }
      
      // 3. Clear incoming call modal
      setIncomingCall(null);
      
      // 4. Set active call with the complete data
      const fullCallData = { id: callSnap.id, ...callSnap.data() };
      setActiveCallDebug(fullCallData);
      // console.log('[Global Call] Active call set with full data:', fullCallData);
      
      // Navigate to the chat with the caller
      navigate(`/chat/${incomingCall.callerId}`);
      
    } catch (error) {
      console.error('Error accepting call:', error);
    }
  };

  const declineIncomingCall = async () => {
    if (!incomingCall) return;
    
    try {
      await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'declined' });
      setIncomingCall(null);
      
      // Додаємо повідомлення про відміну відеодзвінка
      try {
        const chatId = `${incomingCall.callerId}_${incomingCall.calleeId}`;
        await addDoc(collection(db, 'messages'), {
          chatId: chatId,
          senderId: user.uid,
          receiverId: incomingCall.callerId,
          text: `📞 Video call declined`,
          timestamp: serverTimestamp(),
          read: false,
          type: 'call',
          callId: incomingCall.id,
          callType: 'video'
        });
        // console.log('Video call declined message added to chat');
      } catch (error) {
        console.error('Error adding video call declined message:', error);
      }
      
      // Stop any media streams that might be active
      // stopAllMediaStreams(); // This function is no longer imported
    } catch (error) {
      console.error('Error declining call:', error);
    }
  };

  const endActiveCall = async () => {
    if (activeCall && !isEndingCall) {
      // console.log('[Global Call] Ending active call:', activeCall.id, 'isEndingCall:', isEndingCall, 'Stack trace:', new Error().stack);
      setIsEndingCall(true);
      
      // IMMEDIATE cleanup - stop all media streams right away
      // stopAllMediaStreams(); // This function is no longer imported
      
      try {
        await updateDoc(doc(db, 'calls', activeCall.id), { 
          status: 'ended',
          endedAt: serverTimestamp(),
          endedBy: user.uid
        });
        // console.log('[Global Call] Call status updated to ended');
        
        // Delete the call document after a delay to allow other user to receive the update
        setTimeout(async () => {
          try {
            await deleteDoc(doc(db, 'calls', activeCall.id));
            // console.log('[Global Call] Call document deleted after delay');
          } catch (delErr) {
            console.warn('[Global Call] Failed to delete call doc (may be fine if policy forbids):', delErr);
          }
        }, 2000); // 2 second delay
        
        // Зберігаємо живі повідомлення з дзвінка в загальний чат
        try {
          const chatId = `${activeCall.callerId}_${activeCall.calleeId}`;
          
          // Отримуємо всі живі повідомлення для цього дзвінка
          const liveMessagesRef = collection(db, 'liveMessages');
          const q = query(liveMessagesRef, where('callId', '==', activeCall.id));
          const snapshot = await getDocs(q);
          
          // Додаємо кожне живе повідомлення в загальний чат
          const savePromises = snapshot.docs.map(async (docSnapshot) => {
            const liveMessage = docSnapshot.data();
            return addDoc(collection(db, 'messages'), {
              chatId: chatId,
              senderId: liveMessage.senderId,
              receiverId: liveMessage.receiverId,
              text: liveMessage.text,
              timestamp: liveMessage.timestamp,
              read: false,
              type: 'text',
              fromCall: true,
              callId: activeCall.id
            });
          });
          
          await Promise.all(savePromises);
          // console.log(`Saved ${snapshot.docs.length} live messages to chat`);
          
          // Видаляємо живі повідомлення після збереження
          const deletePromises = snapshot.docs.map(docSnapshot => deleteDoc(docSnapshot.ref));
          await Promise.all(deletePromises);
          // console.log('Live messages cleaned up');
          
        } catch (error) {
          console.error('Error saving live messages to chat:', error);
        }
        
        // Додаємо повідомлення про закінчення відеодзвінка
        try {
          const chatId = `${activeCall.callerId}_${activeCall.calleeId}`;
          // console.log('[Global Call] Adding video call ended message to chat:', chatId, 'Call ID:', activeCall.id);
          await addDoc(collection(db, 'messages'), {
            chatId: chatId,
            senderId: user.uid,
            receiverId: activeCall.callerId === user.uid ? activeCall.calleeId : activeCall.callerId,
            text: `📞 Video call ended`,
            timestamp: serverTimestamp(),
            read: false,
            type: 'call',
            callId: activeCall.id,
            callType: 'video'
          });
          // console.log('[Global Call] Video call ended message added to chat successfully for call:', activeCall.id);
        } catch (error) {
          console.error('[Global Call] Error adding video call ended message:', error);
        }
        
        setActiveCallDebug(null);
        // console.log('[Global Call] Call ended successfully');
        
        // Additional cleanup after a short delay
        setTimeout(() => {
          // stopAllMediaStreams(); // This function is no longer imported
        }, 100);
        
      } catch (error) {
        console.error('Error ending call:', error);
        // Even if database update fails, still cleanup
        // stopAllMediaStreams(); // This function is no longer imported
      } finally {
        setIsEndingCall(false);
      }
    }
  };

  return (
    <>
      {/* Global Incoming Call Modal - Re-enabled with a fix */}
      <IncomingCallModal
        isVisible={!!incomingCall}
        caller={incomingCall ? { 
          name: incomingCall.callerName, 
          avatar: incomingCall.callerAvatar 
        } : null}
        onAccept={acceptIncomingCall}
        onDecline={declineIncomingCall}
      />
      
      {/* Video Call Interface (global overlay) вимкнено, щоб уникнути дублювання у чаті */}
      {activeCall && activeCall.status === 'accepted' && false && (
        <div style={{
          position: 'fixed',
          top: '60px',
          left: '340px', // ЗМІНЕНО: відступ від бічної панелі
          right: '20px', // ЗМІНЕНО: відступ від правого краю
          bottom: '120px', // ЗМІНЕНО: більше місця для інпуту
          background: '#000',
          zIndex: 10,
          width: 'calc(100vw - 360px)', // ЗМІНЕНО: зменшена ширина
          height: 'calc(100vh - 180px)', // ЗМІНЕНО: зменшена висота
          borderRadius: '8px', // Додано: заокруглені кути
          overflow: 'hidden'
        }}>
          <VideoCallInterface 
            onEnd={endActiveCall} 
            isCaller={activeCall?.callerId === user?.uid}
            callId={activeCall?.id}
            currentUserId={user?.uid}
            remoteUserId={activeCall?.callerId === user?.uid ? activeCall?.calleeId : activeCall?.callerId}
          />
        </div>
      )}
      
      {/* Debug info */}
      {/* console.log('[Global Call] Debug info:', {
        hasActiveCall: !!activeCall,
        callStatus: activeCall?.status,
        isCaller: activeCall?.callerId === user?.uid,
        userId: user?.uid
      })}
      
      {/* !activeCall && console.log('[Global Call] No active call, VideoCallInterface not rendered') */}
    </>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  
  // Debug wrapper for setActiveCall
  const setActiveCallDebug = (newCall) => {
    // console.log('[App] setActiveCall called with:', newCall);
    // console.log('[App] Previous activeCall:', activeCall);
    setActiveCall(newCall);
  };

  // Global function to stop all media streams
  const stopAllMediaStreams = useCallback(() => {
    // console.log('[Global Call] Using global media stream tracker...');
    // forceStopAllStreams(); // This function is no longer imported
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser({ ...firebaseUser, ...userDoc.data() });
          } else {
            setUser(firebaseUser);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          setUser(firebaseUser); // Fallback to auth user
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Global incoming call listener
  useEffect(() => {
    if (!user || !user.uid) return;
    
    const callsRef = collection(db, 'calls');
    const unsub = onSnapshot(
      query(callsRef, where('calleeId', '==', user.uid), where('status', '==', 'ringing')),
      (snap) => {
        // console.log('Global incoming call snapshot:', snap.size, 'calls');
        if (!snap.empty) {
          const call = { id: snap.docs[0].id, ...snap.docs[0].data() };
          // console.log('Global incoming call data:', call);
          setIncomingCall(call);
        } else {
          setIncomingCall(null);
        }
      },
      (err) => console.error('Global incoming call listener error:', err)
    );
    return () => unsub();
  }, [user]);

  // Single unified listener for all call status changes
  useEffect(() => {
    if (!user || !user.uid) return;

    const callsRef = collection(db, 'calls');
    const unsubscribe = onSnapshot(
      query(
        callsRef,
        where('participants', 'array-contains', user.uid)
      ),
      (snap) => {
        if (!activeCall && !snap.docs.some(d => d.data().status === 'accepted')) {
            // If we have no active call and no call is trying to be accepted, do nothing.
            return;
        }

        // console.log('[Global] Call status update received, docs count:', snap.docs.length);
        // console.log('[Global] Current activeCall ID:', activeCall?.id, 'Status:', activeCall?.status);

        // Find the document for our currently active call
        const currentCallDoc = activeCall ? snap.docs.find(doc => doc.id === activeCall.id) : undefined;

        if (activeCall && !currentCallDoc) {
            // The active call document was deleted from Firestore.
            // console.log(`[Global] Active call ${activeCall.id} was deleted. Clearing state.`);
            setActiveCallDebug(null);
            return;
        }

        if (currentCallDoc) {
            const data = currentCallDoc.data();
            // If the currently active call's status has changed to ended or declined, clear it.
            if (data.status === 'ended' || data.status === 'declined') {
                // console.log(`[Global] Active call ${activeCall.id} status is now '${data.status}'. Clearing state.`);
                setActiveCallDebug(null);
                return;
            }
        }

        // If there is no active call, look for a new "accepted" call to set as active.
        if (!activeCall) {
            const newAcceptedCallDoc = snap.docs.find(doc => doc.data().status === 'accepted');
            if (newAcceptedCallDoc) {
                // console.log(`[Global] Found new accepted call ${newAcceptedCallDoc.id}. Setting as active.`);
                setActiveCallDebug({ id: newAcceptedCallDoc.id, ...newAcceptedCallDoc.data() });
            }
        }
      },
      (err) => console.error('[Global] Call listener error:', err)
    );

    return () => unsubscribe();
  }, [user, activeCall, stopAllMediaStreams, setActiveCallDebug]);

  // Cleanup when activeCall changes to null
  useEffect(() => {
    if (!activeCall) {
      // console.log('[Global Call] Active call is null, cleaning up media streams');
      // IMMEDIATE cleanup - stop all media streams right away
      // stopAllMediaStreams(); // This function is no longer imported

      // Additional cleanup after a short delay
      setTimeout(() => {
        // console.log('[Global Call] Additional cleanup after 100ms...');
        // stopAllMediaStreams(); // This function is no longer imported
      }, 100);
      
      // Final cleanup after longer delay
      setTimeout(() => {
        // console.log('[Global Call] Final cleanup after 1000ms...');
        // stopAllMediaStreams(); // This function is no longer imported
        
        // Перевірка, чи залишилися активні потоки
        if (typeof window !== 'undefined' && window.mediaStreamTracker) {
          const activeCount = window.mediaStreamTracker.getActiveStreamCount();
          // console.log('[Global Call] Active streams after final cleanup:', activeCount);
          if (activeCount > 0) {
            // console.log('[Global Call] Still have active streams, forcing cleanup again...');
            // stopAllMediaStreams(); // This function is no longer imported
          }
        }
        
        // Додаткова діагностика
        if (typeof window !== 'undefined' && window.debugMediaStreams) {
          // console.log('[Global Call] Debug info after final cleanup:');
          window.debugMediaStreams();
        }
      }, 1000);
    }
  }, [activeCall, stopAllMediaStreams]);

  // Cleanup when page is about to unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      // console.log('[Global Call] Page unloading, cleaning up media streams');
      // stopAllMediaStreams(); // This function is no longer imported
    };

    const handleUnload = () => {
      // console.log('[Global Call] Page unloaded, final cleanup');
      // stopAllMediaStreams(); // This function is no longer imported
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [stopAllMediaStreams]);

  if (loading) {
    return (
      <div className="App">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route 
            path="/home" 
            element={user ? <Home user={user} activeCall={activeCall} setActiveCall={setActiveCall} setActiveCallDebug={setActiveCallDebug} /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/friends" 
            element={user ? <Home user={user} activeCall={activeCall} setActiveCall={setActiveCall} setActiveCallDebug={setActiveCallDebug} /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/requests" 
            element={user ? <Home user={user} activeCall={activeCall} setActiveCall={setActiveCall} setActiveCallDebug={setActiveCallDebug} /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/notifications" 
            element={user ? <Home user={user} activeCall={activeCall} setActiveCall={setActiveCall} setActiveCallDebug={setActiveCallDebug} /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/videochat" 
            element={user ? <Home user={user} activeCall={activeCall} setActiveCall={setActiveCall} setActiveCallDebug={setActiveCallDebug} /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/chat/:userId" 
            element={user ? <Home user={user} activeCall={activeCall} setActiveCall={setActiveCall} setActiveCallDebug={setActiveCallDebug} /> : <Navigate to="/login" replace />} 
          />
          <Route 
            path="/profile" 
            element={user ? <ProfilePage /> : <Navigate to="/login" replace />} 
          />
          <Route path="*" element={<Navigate to={user ? "/home" : "/login"} replace />} />
        </Routes>
        
        {/* Call Handler inside Router context */}
        <CallHandler 
          user={user}
          incomingCall={incomingCall}
          setIncomingCall={setIncomingCall}
          activeCall={activeCall}
          setActiveCall={setActiveCall}
          setActiveCallDebug={setActiveCallDebug}
        />
      </BrowserRouter>
    </div>
  );
}

export default App;
