// ========================================
// КОМПОНЕНТ VIDEOCALLINTERFACE - ІНТЕРФЕЙС ВІДЕОДЗВІНКА
// ========================================
// Цей файл реалізує WebRTC відеодзвінки між користувачами
// ВИКОРИСТОВУЄТЬСЯ В: App.js, ChatInterface.js, RandomChat.js
//
// ОСНОВНІ ФУНКЦІЇ:
// 1. 🎥 WebRTC з'єднання peer-to-peer для відеодзвінків
// 2. 📡 Signaling через Firebase для обміну даними з'єднання
// 3. 🎤 Управління мікрофоном (включення/вимкнення)
// 4. 📹 Управління камерою (включення/вимкнення)
// 5. 🔄 Обробка ICE кандидатів для встановлення з'єднання
// 6. 📞 Завершення дзвінка та очищення ресурсів
// 7. 💬 Чат під час дзвінка (LiveChatOverlay)
// 8. 👥 Додавання в друзі під час дзвінка
//
// КЛЮЧОВІ ЗАЛЕЖНОСТІ:
// - WebRTC API для відеодзвінків
// - Firebase Firestore для signaling
// - streamTracker для управління медіа потоками
// - STUN/TURN сервери для NAT traversal

import React, { useEffect, useRef, useState } from 'react';
import { db } from '../../utils/firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import streamTracker from '../../utils/streamTracker';
import LiveChatOverlay from '../LiveChatOverlay/LiveChatOverlay';
import './VideoCallInterface.css';
import { IoPersonAddOutline } from 'react-icons/io5';

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
     {
      urls: 'turn:numb.viagenie.ca',
      username: 'webrtc@live.com',
      credential: 'muazkh',
    },
  ],
  iceCandidatePoolSize: 10,
};

function VideoCallInterface({ onEnd, isCaller, callId, currentUserId, remoteUserName, onAddFriend, friendRequestStatus, showSkipButton, onSkip, localStream, remoteStream }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pc = useRef(null);

  const [muted, setMuted] = useState(false);
  const [liveMessages, setLiveMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    if (!callId || !currentUserId) return;

    pc.current = new RTCPeerConnection(servers);
    const peerConnection = pc.current;
    
    let localStream = null;
    const unsubscribers = [];
    const remoteCandidates = [];

    const setupMedia = async () => {
      // console.log('[WebRTC] 1. Setting up media...');
      
      // Використовуємо переданий localStream замість створення нового
      if (localStream) {
        // console.log('[WebRTC] 1a. Using provided local stream');
        
        // Додаємо потік до глобального трекера
        streamTracker.addStream(localStream);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
        localStream.getTracks().forEach((track) => {
          // console.log('[WebRTC] 1b. Adding local track:', track.kind);
          peerConnection.addTrack(track, localStream);
        });
      } else {
        // console.log('[WebRTC] 1a. No local stream provided, creating new one');
        const newLocalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream = newLocalStream; // Store the created stream for cleanup
        
        // Додаємо потік до глобального трекера
        streamTracker.addStream(newLocalStream);
        
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = newLocalStream;
        }
        newLocalStream.getTracks().forEach((track) => {
          // console.log('[WebRTC] 1b. Adding local track:', track.kind);
          peerConnection.addTrack(track, newLocalStream);
        });
      }

      // Використовуємо переданий remoteStream або створюємо новий
      const currentRemoteStream = remoteStream || new MediaStream();
      if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = currentRemoteStream;
      }

      peerConnection.ontrack = (event) => {
        // console.log('[WebRTC] 4. Received remote track:', event.track.kind, 'Stream:', event.streams[0].id);
        const remoteStream = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        // console.log('[WebRTC] 4a. Remote stream set to video element');
      };
    };
    
    const setupSignaling = async () => {
      // console.log('[WebRTC] 2. Setting up signaling...');
      const callDocRef = doc(db, 'calls', callId);
      const offerCandidatesRef = collection(callDocRef, 'offerCandidates');
      const answerCandidatesRef = collection(callDocRef, 'answerCandidates');

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          // console.log('[WebRTC] 2a. Generated ICE candidate.');
          addDoc(isCaller ? offerCandidatesRef : answerCandidatesRef, event.candidate.toJSON());
        }
      };
      
      peerConnection.oniceconnectionstatechange = () => {
        // console.log(`[WebRTC] 5. ICE Connection State changed: ${peerConnection.iceConnectionState}`);
        setConnectionStatus(peerConnection.iceConnectionState);
      };

      if (isCaller) {
        // console.log('[WebRTC] 3. Role: Caller. Creating offer...');
        const offerDescription = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offerDescription);
        await updateDoc(callDocRef, { offer: { sdp: offerDescription.sdp, type: offerDescription.type } });

        const unsubAnswer = onSnapshot(callDocRef, async (snapshot) => {
          const data = snapshot.data();
          if (!peerConnection.currentRemoteDescription && data?.answer) {
            // console.log('[WebRTC] 3c. Received answer. Setting remote description...');
            try {
                const answerDescription = new RTCSessionDescription(data.answer);
                await peerConnection.setRemoteDescription(answerDescription);
                // console.log('[WebRTC] 3d. Remote description set successfully.');

                // console.log(`[WebRTC] 3e. Processing ${remoteCandidates.length} buffered candidates.`);
                remoteCandidates.forEach(candidate => {
                    // console.log('[WebRTC] 3f. Adding buffered ICE candidate.');
                    peerConnection.addIceCandidate(candidate)
                });
                remoteCandidates.length = 0; // Clear buffer
            } catch (e) {
                console.error("[WebRTC] Error setting remote description or adding candidates:", e);
            }
          }
        });
        
        const unsubAnswerCandidates = onSnapshot(answerCandidatesRef, (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
              const candidate = new RTCIceCandidate(change.doc.data());
              if (peerConnection.currentRemoteDescription) {
                // console.log('[WebRTC] 3b. Received and adding answer candidate immediately.');
                await peerConnection.addIceCandidate(candidate);
              } else {
                 // console.log('[WebRTC] 3a. Buffering answer candidate.');
                 remoteCandidates.push(candidate);
              }
            }
          });
        });

        unsubscribers.push(unsubAnswer, unsubAnswerCandidates);
      } else { // Callee
        // console.log('[WebRTC] 3. Role: Callee. Waiting for offer...');

        const unsubCallDoc = onSnapshot(callDocRef, async (snapshot) => {
            // We only want to process the offer once.
            if (snapshot.exists() && snapshot.data()?.offer && !peerConnection.currentRemoteDescription) {
                // console.log('[WebRTC] 3a. Received offer. Setting remote description...');
                
                // Stop listening to the call document once we have the offer.
                const unsub = unsubscribers.find(u => u === unsubCallDoc);
                if (unsub) unsub();

                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(snapshot.data().offer));

                    // console.log('[WebRTC] 3b. Creating answer...');
                    const answerDescription = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answerDescription);
                    await updateDoc(callDocRef, { answer: { sdp: answerDescription.sdp, type: answerDescription.type } });
                    // console.log('[WebRTC] 3c. Answer created and sent.');

                    // Now that the connection is established, listen for the caller's candidates.
                    const unsubOfferCandidates = onSnapshot(offerCandidatesRef, (snapshot) => {
                        snapshot.docChanges().forEach(async (change) => {
                            if (change.type === 'added') {
                                // console.log('[WebRTC] 3d. Received and adding offer candidate.');
                                try {
                                    await peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                                } catch (e) {
                                    console.error("Error adding received ICE candidate", e);
                                }
                            }
                        });
                    });
                    unsubscribers.push(unsubOfferCandidates);
                } catch (e) {
                    console.error("[WebRTC] Error in callee signaling flow:", e);
                    setConnectionStatus('failed');
                }
            }
        }, (error) => {
            console.error("[WebRTC] Callee snapshot listener error:", error);
            setConnectionStatus('failed');
        });

        unsubscribers.push(unsubCallDoc);
      }
    };

    const start = async () => {
        try {
            await setupMedia();
            await setupSignaling();
        } catch (err) {
            console.error("[WebRTC] Initialization failed:", err);
            setConnectionStatus('failed');
        }
    }

    start();

    return () => {
      // console.log('[WebRTC] 6. Cleaning up connection...');
      unsubscribers.forEach((unsub) => unsub());
      
      // Зупиняємо всі потоки, незалежно від того, чи вони передані ззовні чи створені тут
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          track.stop();
          // console.log('[WebRTC] 6a. Local track stopped:', track.kind);
        });
        // console.log('[WebRTC] 6a. Local stream stopped.');
        
        // Видаляємо потік з глобального трекера
        streamTracker.removeStream(localStream);
      }
      
      // Використовуємо глобальний трекер для зупинки всіх потоків
      streamTracker.stopAllStreams();
      
      if (pc.current) {
        pc.current.close();
        // console.log('[WebRTC] 6b. Peer connection closed.');
      }
      // Also ensure video elements are cleared
      if(localVideoRef.current) localVideoRef.current.srcObject = null;
      if(remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };
  }, [callId, currentUserId, isCaller]);

  useEffect(() => {
    if (!callId) return;
    const q = query(collection(db, 'liveMessages'), where('callId', '==', callId), orderBy('timestamp'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      // console.log('Live messages updated:', messages);
      setLiveMessages(messages);
    });
    return unsubscribe;
  }, [callId]);

  const toggleMute = () => {
    if (!localVideoRef.current.srcObject) return;
    localVideoRef.current.srcObject.getAudioTracks().forEach((track) => {
      track.enabled = !track.enabled;
      setMuted(!track.enabled);
    });
  };


  
  const renderStatusOverlay = () => {
    switch(connectionStatus) {
      case 'connecting':
      case 'new':
      case 'checking':
        return (
          <div className="spinner-container">
            <h3>Connecting...</h3>
            <div className="spinner"></div>
          </div>
        );
      case 'connected':
      case 'completed':
        return null; // Hide overlay when connected
      case 'disconnected':
        return <h3>Connection Lost...</h3>;
      case 'failed':
        return <h3>Call Failed.</h3>;
      case 'closed':
        return <h3>Call Ended.</h3>;
      default:
        return <h3>{connectionStatus}...</h3>;
    }
  };

  return (
    <div className="video-call-container">
      <div className="remote-video-container">
        <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
        <div className="status-overlay">{renderStatusOverlay()}</div>
      </div>
      <div className="local-video-container">
        <video ref={localVideoRef} autoPlay muted playsInline className="local-video" />
      </div>
      <LiveChatOverlay messages={liveMessages} currentUserId={currentUserId} />
      <div className="video-controls">
        <button className={`control-btn ${muted ? 'muted' : ''}`} onClick={toggleMute}>
          {muted ? '🔇' : '🎤'}
        </button>
        {onAddFriend && (
            <button
              className={`control-btn add-friend ${friendRequestStatus !== 'idle' ? 'disabled' : ''}`}
              onClick={onAddFriend}
              disabled={friendRequestStatus !== 'idle'}
              title={
                friendRequestStatus === 'sent' ? 'Request Sent' :
                friendRequestStatus === 'friends' ? 'You are already friends' :
                'Add Friend'
              }
            >
              {friendRequestStatus === 'idle' && <IoPersonAddOutline size={24} />}
              {friendRequestStatus === 'sending' && <div className="btn-spinner"></div>}
              {friendRequestStatus === 'sent' && '✓'}
              {friendRequestStatus === 'friends' && '✓'}
            </button>
        )}
        {showSkipButton && onSkip && (
          <button className="control-btn skip" onClick={() => {
            // Очищаємо video elements перед пропуском
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = null;
              // console.log('[WebRTC] Local video element cleared before skip');
            }
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = null;
              // console.log('[WebRTC] Remote video element cleared before skip');
            }
            
            // Зупиняємо всі потоки через глобальний трекер
            streamTracker.stopAllStreams();
            
            onSkip();
          }} title="Next User">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 18L14 12L4 6V18Z" fill="currentColor"/>
              <path d="M16 6V18H18V6H16Z" fill="currentColor"/>
            </svg>
          </button>
        )}
        <button className="control-btn end-call" onClick={() => {
          // Очищаємо video elements перед закінченням дзвінка
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
            // console.log('[WebRTC] Local video element cleared before call end');
          }
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
            // console.log('[WebRTC] Remote video element cleared before call end');
          }
          
          // Зупиняємо всі потоки через глобальний трекер
          streamTracker.stopAllStreams();
          
          onEnd();
        }}>
          📞
        </button>
      </div>
    </div>
  );
}

export default VideoCallInterface;
