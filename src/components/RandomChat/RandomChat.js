// ========================================
// КОМПОНЕНТ RANDOMCHAT - РАНДОМНИЙ ВІДЕОЧАТ
// ========================================
// Цей файл реалізує функціональність випадкових відеодзвінків з незнайомими людьми
// ВИКОРИСТОВУЄТЬСЯ В: App.js (вкладка Random Chat)
//
// ОСНОВНІ ФУНКЦІЇ:
// 1. 🎲 Пошук випадкових партнерів для відеодзвінків
// 2. 🌍 Фільтрація за країною та містом
// 3. 🎥 WebRTC відеодзвінки з незнайомими людьми
// 4. ⏭️ Пропуск поточного дзвінка (skip)
// 5. 📝 Скарги на користувачів
// 6. 📱 Історія попередніх партнерів
// 7. 🔄 Автоматичне перемикання між партнерами
// 8. 🎯 Система очікування з'єднання
//
// КЛЮЧОВІ ЗАЛЕЖНОСТІ:
// - Firebase Firestore для збереження даних про дзвінки
// - WebRTC для відеодзвінків
// - streamTracker для управління медіа потоками
// - React Icons для іконок

import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  runTransaction,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../../utils/firebase';
import VideoCallInterface from '../VideoCallInterface/VideoCallInterface';
import streamTracker from '../../utils/streamTracker';
import {
  IoVideocam, IoHappy, IoPersonAddOutline, IoArrowForwardCircleOutline, IoChevronUp, IoChevronBack, IoChevronForward, IoTrashOutline, IoWarningOutline, IoFilter
} from 'react-icons/io5';
import ReportUserModal from '../ReportUserModal/ReportUserModal';
import FilterModal from '../FilterModal/FilterModal';
import './RandomChat.css';

// SIMULATION DATA - COMMENTED OUT
// const mockUsers = [
//     { id: 'mock-user-1', name: 'Jessica', avatar: 'https://i.pravatar.cc/150?img=25' },
//     { id: 'mock-user-2', name: 'Mike', avatar: 'https://i.pravatar.cc/150?img=60' },
//     { id: 'mock-user-3', name: 'Sarah', avatar: 'https://i.pravatar.cc/150?img=27' },
//     { id: 'mock-user-4', name: 'David', avatar: 'https://i.pravatar.cc/150?img=33' },
//     { id: 'mock-user-5', name: 'Emily', avatar: 'https://i.pravatar.cc/150?img=1' },
//     { id: 'mock-user-6', name: 'Chris', avatar: 'https://i.pravatar.cc/150?img=14' },
//     { id: 'mock-user-7', name: 'Anna', avatar: 'https://i.pravatar.cc/150?img=47' },
//     { id: 'mock-user-8', name: 'James', avatar: 'https://i.pravatar.cc/150?img=56' },
//     { id: 'mock-user-9', name: 'Olivia', avatar: 'https://i.pravatar.cc/150?img=40' },
//     { id: 'mock-user-10', name: 'Daniel', avatar: 'https://i.pravatar.cc/150?img=63' },
// ];

// Empty array for when simulation is disabled
const mockUsers = [];

function RandomChat({ user }) {
  const [isSearching, setIsSearching] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [waitingUsers, setWaitingUsers] = useState(0);
  const [friendRequestStatus, setFriendRequestStatus] = useState('idle'); // 'idle', 'sending', 'sent', 'friends'
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const [activeCall, setActiveCall] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  // const [mockUserIndex, setMockUserIndex] = useState(0); // SIMULATION - COMMENTED OUT
  const [chatHistory, setChatHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [userToReport, setUserToReport] = useState(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [locationFilter, setLocationFilter] = useState({ country: '', city: '' });

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const currentMatchRef = useRef(null);
  const queueDocRef = useRef(null);
  const unsubscribeQueueListener = useRef(null);
  const historyListRef = useRef(null);


  const handleDeleteFromHistory = (userId) => {
    const updatedHistory = chatHistory.filter(user => user.id !== userId);
    setChatHistory(updatedHistory);
  };

  const handleAddFriendFromHistory = (pastUser) => {
    if (!user || !pastUser?.id || pastUser.friendStatus !== 'idle') return;
  
    const fromUserId = user.uid;
    const toUserId = pastUser.id;
  
    // Optimistic UI update
    updateHistoryUserStatus(toUserId, 'sent');
  
    // Perform database operations in the background
    const sendRequestInBackground = async () => {
      try {
        // Run checks in parallel for speed
        const [friendsSnap1, friendsSnap2, requestSnap] = await Promise.all([
          getDocs(query(collection(db, 'friends'), where('userIds', '==', [fromUserId, toUserId]))),
          getDocs(query(collection(db, 'friends'), where('userIds', '==', [toUserId, fromUserId]))),
          getDocs(query(
            collection(db, 'friendRequests'),
            where('fromUserId', 'in', [fromUserId, toUserId]),
            where('toUserId', 'in', [fromUserId, toUserId])
          ))
        ]);
  
        if (!friendsSnap1.empty || !friendsSnap2.empty) {
          // console.log("Correcting status: You are already friends.");
          updateHistoryUserStatus(toUserId, 'friends');
          return;
        }
  
        const existingPendingRequest = requestSnap.docs.find(doc => doc.data().status === 'pending');
        if (existingPendingRequest) {
            // console.log("Correcting status: A friend request already exists.");
            // The 'sent' status is already correct, no need to change.
            return;
        }
  
        const userDoc = await getDoc(doc(db, 'users', fromUserId));
        if (!userDoc.exists()) throw new Error("Current user's profile not found.");
        const currentUserProfile = userDoc.data();
  
        await addDoc(collection(db, 'friendRequests'), {
          fromUserId,
          fromUserName: currentUserProfile.name || 'Anonymous',
          fromUserAvatar: currentUserProfile.avatar || '',
          toUserId,
          toUserName: pastUser.name,
          toUserAvatar: pastUser.avatar,
          status: 'pending',
          timestamp: serverTimestamp(),
        });
  
        // console.log("Friend request sent successfully in background!");
        
      } catch (error) {
        console.error("Background friend request failed:", error);
        // Revert UI on failure
        updateHistoryUserStatus(toUserId, 'idle'); 
      }
    };
  
    sendRequestInBackground();
  };

  const handleReportUser = (user) => {
    setUserToReport(user);
    setReportModalOpen(true);
  };

  // Load history from localStorage on component mount
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('randomChatHistory');
      if (savedHistory && JSON.parse(savedHistory).length > 0) {
        // Filter out any simulation data (mock users)
        const realHistory = JSON.parse(savedHistory).filter(user => 
          !user.id.startsWith('mock-user-')
        );
        setChatHistory(realHistory);
        
        // Update localStorage with filtered data (remove simulation data)
        if (realHistory.length !== JSON.parse(savedHistory).length) {
          localStorage.setItem('randomChatHistory', JSON.stringify(realHistory));
        }
      } else {
        // If no history in storage, start with empty array
        setChatHistory([]); // No simulation data - only real users
      }
    } catch (error) {
      console.error("Could not load/populate chat history", error);
      setChatHistory([]); // No simulation data - only real users
    }
  }, []);

  useEffect(() => {
    let history = localStorage.getItem('randomChatHistory');
    let parsedHistory = [];
    
    try {
      parsedHistory = history ? JSON.parse(history) : [];
    } catch (e) {
      console.error("Failed to parse chat history from localStorage", e);
      parsedHistory = [];
    }

    if (parsedHistory && parsedHistory.length > 0) {
        setChatHistory(parsedHistory.map(u => ({ ...u, friendStatus: u.friendStatus || 'idle' })));
    } else {
      // Pre-populate with mock data for testing if history is empty
      // const mockUsersWithStatus = mockUsers.map(u => ({ ...u, friendStatus: 'idle' }));
      // setChatHistory(mockUsersWithStatus); // SIMULATION - COMMENTED OUT
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('randomChatHistory', JSON.stringify(chatHistory));
    checkScrollability();
  }, [chatHistory]);

  const checkScrollability = () => {
    const el = historyListRef.current;
    if (el) {
      const isScrollable = el.scrollWidth > el.clientWidth;
      setCanScrollLeft(el.scrollLeft > 5);
      setCanScrollRight(isScrollable && el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
    } else {
      setCanScrollLeft(false);
      setCanScrollRight(false);
    }
  };

  useEffect(() => {
    // Check scrollability when the history panel is opened or the content changes.
    if (showHistory) {
      // A small delay is needed for the DOM to update after `showHistory` becomes true.
      setTimeout(checkScrollability, 50); 
    }
    window.addEventListener('resize', checkScrollability);
    return () => window.removeEventListener('resize', checkScrollability);
  }, [chatHistory, showHistory]);

  const scrollHistory = (direction) => {
    const el = historyListRef.current;
    if (el) {
      const scrollAmount = el.clientWidth * 0.8; // Scroll by 80% of the visible width
      el.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
    }
  };


  // Get waiting users count
  useEffect(() => {
    const q = query(
      collection(db, 'randomChatQueue'),
      where('status', '==', 'waiting')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWaitingUsers(snapshot.size);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isConnected || !user || !currentMatch?.otherUserId) {
      setFriendRequestStatus('idle');
      return;
    }
  
    const checkFriendshipStatus = async () => {
      const fromUserId = user.uid;
      const toUserId = currentMatch.otherUserId;
  
      // For simulation mode, always reset to idle for new matches
      // if (toUserId.startsWith('mock-user-')) {
      //   setFriendRequestStatus('idle');
      //   return;
      // } // SIMULATION - COMMENTED OUT
  
      try {
        // 1. Check if they are already friends
        const friendsQuery1 = query(collection(db, 'friends'), where('userId', '==', fromUserId), where('friendId', '==', toUserId));
        const friendsQuery2 = query(collection(db, 'friends'), where('userId', '==', toUserId), where('friendId', '==', fromUserId));
        const [friendsSnapshot1, friendsSnapshot2] = await Promise.all([getDocs(friendsQuery1), getDocs(friendsQuery2)]);
        if (!friendsSnapshot1.empty || !friendsSnapshot2.empty) {
          setFriendRequestStatus('friends');
          return;
        }
  
        // 2. Check for an existing friend request (in either direction)
        const requestQuery1 = query(collection(db, 'friendRequests'), where('fromUserId', '==', fromUserId), where('toUserId', '==', toUserId));
        const requestQuery2 = query(collection(db, 'friendRequests'), where('fromUserId', '==', toUserId), where('toUserId', '==', fromUserId));
        const [requestSnapshot1, requestSnapshot2] = await Promise.all([getDocs(requestQuery1), getDocs(requestQuery2)]);
        if (!requestSnapshot1.empty || !requestSnapshot2.empty) {
          setFriendRequestStatus('sent');
          return;
        }
  
        // 3. If neither, the button is available
        setFriendRequestStatus('idle');
      } catch (error) {
        console.error("Error checking friendship status:", error);
        setFriendRequestStatus('idle');
      }
    };
  
    checkFriendshipStatus();
  
  }, [isConnected, user, currentMatch]);


  // Apply location filter
  const handleApplyFilter = (filter) => {
    setLocationFilter(filter);
    // console.log('Filter applied:', filter);
  };

  // Get filtered users based on location filter - SIMULATION COMMENTED OUT
  // const getFilteredUsers = () => {
  //   if (!locationFilter.country && !locationFilter.city) {
  //     return mockUsers; // No filter, return all users
  //   }

  //   // In a real app, this would query the database
  //   // For now, we'll simulate filtering based on mock data
  //   return mockUsers.filter(user => {
  //     // This is just simulation - in real app, you'd check user.country and user.city
  //     // For demo purposes, we'll randomly filter some users
  //     const shouldInclude = Math.random() > 0.3; // 70% chance to include
  //     return shouldInclude;
  //   });
  // };

  // Start searching for a random chat - SIMULATION COMMENTED OUT
  // const startRandomChat = async () => {
  //   if (!user) return;

  //   // --- SIMULATION FOR UI/UX TESTING ---
  //   // 1. Show "Searching" state
  //   setIsSearching(true);
  //   setIsConnected(false);
  //   setConnectionStatus('searching');

  //   console.log('SIMULATION: Started searching with filter:', locationFilter);

  //   // 2. Get filtered users
  //   const filteredUsers = getFilteredUsers();
    
  //   if (filteredUsers.length === 0) {
  //     console.log('SIMULATION: No users found matching filter');
  //     setIsSearching(false);
  //     setConnectionStatus('no_matches');
  //     return;
  //   }

  //   // 3. After a delay, simulate a found match from filtered users
  //   setTimeout(() => {
  //     const nextUser = filteredUsers[mockUserIndex % filteredUsers.length];
  //     console.log('SIMULATION: Match found!', nextUser.name, 'Filter:', locationFilter);
  //     setActiveCall({ id: `mock-call-${nextUser.id}`, type: 'random' });
  //     setCurrentMatch({
  //       id: `mock-call-${nextUser.id}`,
  //       otherUserId: nextUser.id,
  //       otherUserName: nextUser.name,
  //       otherUserAvatar: nextUser.avatar,
  //     });
  //     setIsSearching(false);
  //     setIsConnected(true);
  //     setConnectionStatus('connected');
  //     setFriendRequestStatus('idle');
  //   }, 3000); // 3-second delay to simulate search
  // };

  const handleAddFriend = async () => {
    if (!user || !currentMatch?.otherUserId || friendRequestStatus !== 'idle') return;
  
    setFriendRequestStatus('sending');
  
    const fromUserId = user.uid;
    const toUserId = currentMatch.otherUserId;
  
    try {
      // Get current user's details for the request
      const userDoc = await getDoc(doc(db, 'users', fromUserId));
      if (!userDoc.exists()) {
        throw new Error("Current user's profile not found.");
      }
      const currentUserProfile = userDoc.data();
  
      await addDoc(collection(db, 'friendRequests'), {
        fromUserId: fromUserId,
        fromUserName: currentUserProfile.name || 'Anonymous',
        fromUserAvatar: currentUserProfile.avatar || '',
        toUserId: toUserId,
        toUserName: currentMatch.otherUserName,
        toUserAvatar: currentMatch.otherUserAvatar,
        status: 'pending',
        timestamp: serverTimestamp(),
      });
  
      // console.log("Friend request sent!");
      setFriendRequestStatus('sent');
    } catch (error) {
      console.error("Error sending friend request:", error);
      setFriendRequestStatus('idle'); // Reset on error
    }
  };

  const updateHistoryUserStatus = (userId, status) => {
    setChatHistory(prev => prev.map(u => u.id === userId ? { ...u, friendStatus: status } : u));
  };

  // Start WebRTC connection
  const startWebRTCConnection = async (matchId, otherUserId) => {
    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      peerConnectionRef.current = peerConnection;

      // Add local stream
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        if (event.streams[0]) {
          const stream = event.streams[0];
          remoteStreamRef.current = stream;
          setRemoteStream(stream);
          
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
          }
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          await updateDoc(doc(db, 'randomChatMatches', matchId), {
            [`iceCandidates.${user.uid}`]: {
              candidate: event.candidate.candidate,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdpMid: event.candidate.sdpMid
            }
          });
        }
      };

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      await updateDoc(doc(db, 'randomChatMatches', matchId), {
        [`sdpOffer.${user.uid}`]: {
          type: offer.type,
          sdp: offer.sdp
        }
      });

      // Listen for answer
      const matchDoc = doc(db, 'randomChatMatches', matchId);
      const unsubscribe = onSnapshot(matchDoc, async (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const answer = data.sdpAnswer?.[otherUserId];
          
          if (answer && peerConnection.remoteDescription === null) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
          }
        }
      });

    } catch (error) {
      console.error('Error starting WebRTC:', error);
    }
  };

  // Stop random chat
  const stopRandomChat = async () => {
    try {
      // Stop listening if we were in queue
      if (unsubscribeQueueListener.current) {
        unsubscribeQueueListener.current();
        unsubscribeQueueListener.current = null;
      }
      // Delete our doc from queue if it exists
      if (queueDocRef.current) {
        await deleteDoc(queueDocRef.current);
        queueDocRef.current = null;
      }

      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }

      // Close peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }

      // Update match status
      if (currentMatchRef.current) {
        await updateDoc(doc(db, 'randomChatMatches', currentMatchRef.current.id), {
          status: 'ended',
          endedBy: user.uid,
          endedAt: new Date()
        });
      }

      // Update call status
      if (activeCall) {
        await updateDoc(doc(db, 'calls', activeCall.id), {
          status: 'ended',
          endedAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error during DB cleanup for random chat (this may be expected in mock mode):', error); // SIMULATION - COMMENTED OUT
    } finally {
      // ALWAYS reset state, regardless of errors
      // console.log('Resetting random chat state...');
      // Reset state
      if (currentMatch) {
        const newHistoryEntry = {
          name: currentMatch.otherUserName,
          avatar: currentMatch.otherUserAvatar,
          id: currentMatch.otherUserId
        };
        // Add to history, preventing duplicates
        setChatHistory(prev => [newHistoryEntry, ...prev.filter(u => u.id !== newHistoryEntry.id)]);
      }
      setCurrentMatch(null);
      setIsConnected(false);
      setIsSearching(false);
      setConnectionStatus('idle');
      setRemoteStream(null);
      setLocalStream(null);
      setActiveCall(null);
    }
  };

  // Функція для примусового очищення всіх потоків
  const forceStopAllStreams = () => {
    // console.log('RandomChat: Force stopping ALL streams...');
    
    // Перевіряємо, чи є активні потоки перед очищенням
    const hasActiveStreams = localStreamRef.current || localStream || remoteStream || streamTracker.getActiveStreamCount() > 0;
    
    if (!hasActiveStreams) {
      // console.log('RandomChat: No active streams to stop, skipping cleanup');
      return;
    }
    
    // Використовуємо глобальний трекер для зупинки всіх потоків
    streamTracker.stopAllStreams();
    
    // Отримуємо всі активні потоки з медіа пристроїв
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        // console.log('RandomChat: Found active stream, stopping all tracks...');
        stream.getTracks().forEach(track => {
          track.stop();
          // console.log('RandomChat: Force stopped track:', track.kind);
        });
      })
      .catch(err => {
        // console.log('RandomChat: No active streams found or error:', err);
      });
    
    // Зупиняємо всі потоки з refs
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        // console.log('RandomChat: Force stopped ref track:', track.kind);
      });
      localStreamRef.current = null;
    }
    
    // Зупиняємо всі потоки з станів
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        // console.log('RandomChat: Force stopped state track:', track.kind);
      });
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        track.stop();
        // console.log('RandomChat: Force stopped remote track:', track.kind);
      });
    }
  };

  // End active call
  const endActiveCall = async () => {
    // console.log('RandomChat: Ending active call, stopping all streams...');
    
    // Примусово зупиняємо ВСІ потоки
    forceStopAllStreams();
    
    // Зупиняємо всі потоки негайно - подібно до VideoCallInterface
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        // console.log('RandomChat: Track stopped in endActiveCall:', track.kind);
      });
      localStreamRef.current = null;
    }
    
    // Додаткове очищення - зупиняємо всі треки з localStream стану
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        // console.log('RandomChat: Track from localStream state stopped:', track.kind);
      });
    }
    
    // Закриваємо peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Очищаємо video elements - як у VideoCallInterface
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
      // console.log('RandomChat: Local video element cleared in endActiveCall');
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
      // console.log('RandomChat: Remote video element cleared in endActiveCall');
    }
    
    // Очищаємо стани
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setCurrentMatch(null);
    setIsConnected(false);
    setIsSearching(false);
    setConnectionStatus('idle');
    
    // console.log('RandomChat: Active call ended and all streams cleaned up');
    
    // Don't call stopRandomChat() here as it duplicates the cleanup
    // The VideoCallInterface component will handle its own cleanup
  };

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  // Skip current match and find a new one
  const skipMatch = async () => {
    // Start transition animation
    setIsTransitioning(true);
    
    // Примусово зупиняємо ВСІ потоки
    forceStopAllStreams();
    
    // Stop streams and connections but don't reset history
    try {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => {
            track.stop();
            // console.log('Track stopped during skip:', track.kind);
          });
          localStreamRef.current = null;
        }
        
        // Додаткове очищення - зупиняємо всі треки з localStream стану
        if (localStream) {
          localStream.getTracks().forEach(track => {
            track.stop();
            // console.log('RandomChat: Track from localStream state stopped during skip:', track.kind);
          });
        }
        
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }
        
        // Очищаємо video elements - як у VideoCallInterface
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null;
          // console.log('RandomChat: Local video element cleared during skip');
        }
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = null;
          // console.log('RandomChat: Remote video element cleared during skip');
        }
        
        // Очищаємо стани потоків
        setLocalStream(null);
        setRemoteStream(null);
        setActiveCall(null);
        
    } catch(e) { console.error(e); }

    if (currentMatch) {
      const newHistoryEntry = {
        name: currentMatch.otherUserName,
        avatar: currentMatch.otherUserAvatar,
        id: currentMatch.otherUserId
      };
      // Add to history, preventing duplicates
      setChatHistory(prev => [newHistoryEntry, ...prev.filter(u => u.id !== newHistoryEntry.id)]);
    }

    // const nextIndex = (mockUserIndex + 1) % mockUsers.length;
    // setMockUserIndex(nextIndex); // SIMULATION - COMMENTED OUT

    // Reset friend request status immediately
    setFriendRequestStatus('idle');

    // Immediately start searching for the next person
    setIsSearching(true);
    setIsConnected(false);
    setConnectionStatus('searching');
    setCurrentMatch(null);
    setActiveCall(null);

    // setTimeout(() => {
    //     const nextUser = mockUsers[nextIndex];
    //     console.log('SIMULATION: New match found!', nextUser.name);
    //     setActiveCall({ id: `mock-call-${nextUser.id}`, type: 'random' });
    //     setCurrentMatch({
    //       id: `mock-call-${nextUser.id}`,
    //       otherUserId: nextUser.id,
    //       otherUserName: nextUser.name,
    //       otherUserAvatar: nextUser.avatar,
    //     });
    //     setIsSearching(false);
    //     setIsConnected(true);
    //     setConnectionStatus('connected');
    //     // Don't reset friendRequestStatus here - let useEffect handle it
    //     setIsTransitioning(false); // End transition animation
    // }, 2000); // 2-second delay for new search // SIMULATION - COMMENTED OUT
  };

  // Start random video chat - SIMULATION DISABLED
  const startRandomChat = () => {
    // console.log('Starting random video chat...');
    
    // Clear any existing call
    setActiveCall(null);
    setCurrentMatch(null);
    setIsConnected(false);
    setConnectionStatus('idle');
    
    // Start searching
    setIsSearching(true);
    setConnectionStatus('searching');
    
    // In real implementation, this would:
    // 1. Connect to WebRTC signaling server
    // 2. Find available users based on filters
    // 3. Match with another user
    // 4. Start video call
    
    // For now, just show searching state
    // console.log('Searching for available users...');
  };

  // Cancel search function
  const cancelSearch = () => {
    // console.log('Canceling search...');
    setIsSearching(false);
    setConnectionStatus('idle');
    setActiveCall(null);
    setCurrentMatch(null);
    setIsConnected(false);
  };


  const sendEmojiMessage = async (emoji) => {
    if (!activeCall?.id || !currentMatch) return;
    
    const effectiveSenderName = (user.displayName && user.displayName !== 'User' ? user.displayName : null) || userProfile?.name || 'Andrew';
    // console.log('=== EMOJI SENDING DEBUG ===');
    // console.log('user.displayName:', user.displayName);
    // console.log('userProfile?.name:', userProfile?.name);
    // console.log('effectiveSenderName:', effectiveSenderName);
    // console.log('============================');
    
    try {
      await addDoc(collection(db, 'liveMessages'), {
        callId: activeCall.id,
        senderId: user.uid,
        senderName: effectiveSenderName,
        receiverId: currentMatch.otherUserId,
        text: emoji,
        timestamp: serverTimestamp(),
        type: 'live_emoji',
      });
      setShowEmojiMenu(false);
    } catch (error) {
      console.error('Error sending emoji message:', error);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeCall?.id || !currentMatch) return;

    const effectiveSenderName = (user.displayName && user.displayName !== 'User' ? user.displayName : null) || userProfile?.name || 'Andrew';
    // console.log('=== MESSAGE SENDING DEBUG ===');
    // console.log('user.displayName:', user.displayName);
    // console.log('userProfile?.name:', userProfile?.name);
    // console.log('effectiveSenderName:', effectiveSenderName);
    // console.log('=============================');

    try {
      await addDoc(collection(db, 'liveMessages'), {
        callId: activeCall.id,
        senderId: user.uid,
        senderName: effectiveSenderName,
        receiverId: currentMatch.otherUserId,
        text: newMessage.trim(),
        timestamp: serverTimestamp(),
        type: 'live_text',
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };


  // Завантажуємо профіль користувача
  useEffect(() => {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        // console.log('User profile loaded:', userData);
        // console.log('User displayName:', user.displayName);
        setUserProfile(userData);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Очищення потоків при розмонтуванні компонента
  useEffect(() => {
    // Додаємо обробник для закриття сторінки
    const handleBeforeUnload = () => {
      // console.log('RandomChat: Page unloading, stopping all streams...');
      streamTracker.stopAllStreams();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // console.log('RandomChat: Component unmounting, cleaning up all streams...');
      
      // Видаляємо обробник
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Зупиняємо всі потоки при розмонтуванні
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          // console.log('Track stopped on unmount:', track.kind);
        });
        localStreamRef.current = null;
      }
      
      // Закриваємо peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      // Очищаємо video elements - як у VideoCallInterface
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        // console.log('RandomChat: Local video element cleared');
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
        // console.log('RandomChat: Remote video element cleared');
      }
      
      // Очищаємо стани
      setLocalStream(null);
      setRemoteStream(null);
      setActiveCall(null);
      
      // Використовуємо глобальний трекер для зупинки всіх потоків
      streamTracker.stopAllStreams();
      
      // console.log('RandomChat: Component unmounted, all streams and states cleaned up');
    };
  }, []);

  // Додатковий ефект для очищення потоків при закінченні дзвінка
  useEffect(() => {
    // Очищаємо тільки якщо дзвінок справді закінчився (був активний, а тепер ні)
    if (!activeCall && (localStreamRef.current || localStream)) {
      // console.log('RandomChat: Call ended, cleaning up streams immediately...');
      
      // Примусово зупиняємо ВСІ потоки
      forceStopAllStreams();
      
      // Очищаємо localStreamRef - зупиняємо всі треки
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          // console.log('RandomChat: Track stopped on call end:', track.kind);
        });
        localStreamRef.current = null;
      }
      
      // Очищаємо peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      // Очищаємо video elements - як у VideoCallInterface
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        // console.log('RandomChat: Local video element cleared on call end');
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
        // console.log('RandomChat: Remote video element cleared on call end');
      }
      
      // Очищаємо стани потоків
      setLocalStream(null);
      setRemoteStream(null);
      
      // console.log('RandomChat: All streams and connections cleaned up');
    }
  }, [activeCall]);

  // Додатковий ефект для негайного очищення потоків при закінченні дзвінка
  useEffect(() => {
    // Очищаємо тільки якщо дзвінок справді закінчився і є активні потоки
    if (!activeCall && localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
      // console.log('RandomChat: Immediate cleanup - stopping all tracks...');
      
      // Примусово зупиняємо ВСІ потоки
      forceStopAllStreams();
      
      // Негайно зупиняємо всі треки
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        // console.log('RandomChat: Immediate track stop:', track.kind);
      });
      localStreamRef.current = null;
      
      // Очищаємо video elements негайно
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        // console.log('RandomChat: Immediate local video clear');
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
        // console.log('RandomChat: Immediate remote video clear');
      }
    }
  }, [activeCall]);

  return (
    <div className="random-chat-container">
      {activeCall ? (
        <div className={`random-chat-video-area has-video-call ${isTransitioning ? 'transitioning' : ''}`}>
          <div className="video-call-container">
            <VideoCallInterface
              onEnd={endActiveCall}
              isCaller={true}
              callId={activeCall.id}
              currentUserId={user.uid}
              remoteUserId={currentMatch?.otherUserId}
              remoteUserName={currentMatch?.otherUserName}
              onAddFriend={handleAddFriend}
              friendRequestStatus={friendRequestStatus}
              localStream={localStream}
              remoteStream={remoteStream}
              showSkipButton={true}
              onSkip={skipMatch}
            />
          </div>
          
          {/* Live Chat Input Area */}
          <div className="live-chat-input-area">
          <div className="input-actions">
                <div className="emoji-menu">
                  <button
                    type="button"
                    className="input-action-btn"
                    onClick={() => setShowEmojiMenu(!showEmojiMenu)}
                    title="Add emoji"
                  >
                    <IoHappy />
                  </button>
                  {showEmojiMenu && (
                    <div className="emoji-picker">
                      {['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🔥', '💯', '🎉', '😢', '😡'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="emoji-option"
                          onClick={async () => {
                            if (!activeCall?.id || !currentMatch) return;
                            try {
                              await addDoc(collection(db, 'liveMessages'), {
                                callId: activeCall.id,
                                senderId: user.uid,
                                senderName: (user.displayName && user.displayName !== 'User' ? user.displayName : null) || userProfile?.name || 'Andrew',
                                receiverId: currentMatch.otherUserId,
                                text: emoji,
                                timestamp: serverTimestamp(),
                                type: 'live_text',
                              });
                              setShowEmojiMenu(false);
                            } catch (error) {
                              console.error('Error sending emoji message:', error);
                            }
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            <form className="live-chat-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                className="live-chat-input"
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
            </form>
            <button
              type="button"
              className="live-chat-send-btn"
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="random-chat-header">
            <h1><IoVideocam /> Random Video Chat</h1>
            <p>Connect with random people around the world</p>
          </div>

          <div className="random-chat-buttons-container">
            <button onClick={startRandomChat} className="start-chat-btn">
              <IoVideocam />
              <span>Start Random Video Chat</span>
            </button>

            <button 
              onClick={() => setShowFilterModal(true)} 
              className="random-chat-filter-button"
              title="Filter by location"
            >
              <IoFilter />
              <span>Filter</span>
              {(locationFilter.country || locationFilter.city) && (
                <div className="random-chat-filter-indicator"></div>
              )}
            </button>
          </div>

          <div className="features-list">
            <div className="feature-item">
              <span className="feature-icon">🌎</span>
              <span>Meet people from around the world</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🔒</span>
              <span>Anonymous and secure</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>Instant connections</span>
            </div>
          </div>
        </>
      )}
      
      {!activeCall && !isSearching && (
        <div className={`history-tray ${showHistory ? 'visible' : ''}`}>
          <button className="history-toggle-btn" onClick={() => setShowHistory(!showHistory)}>
              <h3>Recent Chats</h3>
              <IoChevronUp className="toggle-icon" />
          </button>
          <div className="history-list-container">
              {canScrollLeft && (
                <button className="history-scroll-btn left" onClick={() => scrollHistory(-1)}>
                  <IoChevronBack />
                </button>
              )}
            <div className="history-list" ref={historyListRef} onScroll={checkScrollability}>
                {chatHistory.length > 0 ? (
                chatHistory.map((pastUser) => (
                    <div key={pastUser.id} className="history-item">
                      <img src={pastUser.avatar || 'https://via.placeholder.com/40'} alt={pastUser.name} className="history-avatar"/>
                      <span className="history-name">{pastUser.name}</span>
                      <div className="history-item-actions">
                        <button 
                          className={`history-action-btn add ${pastUser.friendStatus !== 'idle' ? 'disabled' : ''}`} 
                          title={
                            pastUser.friendStatus === 'sent' ? 'Request Sent' :
                            pastUser.friendStatus === 'friends' ? 'Already Friends' :
                            'Add Friend'
                          } 
                          onClick={() => handleAddFriendFromHistory(pastUser)}
                          disabled={pastUser.friendStatus !== 'idle'}
                        >
                          {pastUser.friendStatus === 'idle' && <IoPersonAddOutline />}
                          {(pastUser.friendStatus === 'sent' || pastUser.friendStatus === 'friends') && '✓'}
                        </button>
                        <button className="history-action-btn delete" title="Remove from list" onClick={() => handleDeleteFromHistory(pastUser.id)}>
                          <IoTrashOutline />
                        </button>
                        <button className="history-action-btn report" title="Report User" onClick={() => handleReportUser(pastUser)}>
                          <IoWarningOutline />
                        </button>
                      </div>
                    </div>
                ))
                ) : (
                <div className="history-empty">Your recent chat partners will appear here.</div>
                )}
            </div>
            {canScrollRight && (
              <button className="history-scroll-btn right" onClick={() => scrollHistory(1)}>
                <IoChevronForward />
              </button>
            )}
          </div>
        </div>
      )}

      {isSearching && !activeCall && (
        <div className="searching-overlay">
          <div className="searching-spinner"></div>
          <p>Searching for a partner...</p>
          <button 
            className="cancel-search-btn"
            onClick={cancelSearch}
          >
            Cancel Search
          </button>
        </div>
      )}

      <FilterModal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onApplyFilter={handleApplyFilter}
        currentFilter={locationFilter}
      />

      <ReportUserModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        user={userToReport}
        currentUser={user}
      />
    </div>
  );
}

export default RandomChat;
