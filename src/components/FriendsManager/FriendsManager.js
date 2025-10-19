import React, { useState, useEffect } from 'react';
import { db, auth } from '../../utils/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, onSnapshot, orderBy, getDoc, serverTimestamp } from 'firebase/firestore';
import { getUserOnlineStatus } from '../../utils/onlineStatus';
import './FriendsManager.css';

function FriendsManager({ searchResults, onUserSelect, activeTab, setFriendRequestsCount, setFriendsCount, currentUser }) {
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userProfiles, setUserProfiles] = useState({}); // Cache for fallback profile fields
  const [onlineStatus, setOnlineStatus] = useState({}); // Track online status for users
  const [showOnlineOnly, setShowOnlineOnly] = useState(false); // Toggle for showing only online friends

  useEffect(() => {
    // console.log('[Data Listeners] useEffect triggered. currentUser prop:', currentUser ? currentUser.uid : 'null');
    
    if (!currentUser) {
      // console.log('[Data Listeners] User is null. Clearing data and skipping listener setup.');
      setFriends([]);
      setFriendRequests([]);
      setSentRequests([]);
      if (setFriendsCount) setFriendsCount(0);
      if (setFriendRequestsCount) setFriendRequestsCount(0);
      return;
    }

    // console.log(`[Data Listeners] Setting up listeners for user: ${currentUser.uid}`);

    // Real-time listener for friends
    const friendsRef = collection(db, 'friends');
    const friendsQuery = query(friendsRef, where('userId', '==', currentUser.uid));
    
    const unsubscribeFriends = onSnapshot(friendsQuery, (snap) => {
      // console.log(`[Data Listeners] FRIENDS snapshot received. Size: ${snap.size}`);
      const friendsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFriends(friendsData);
      if (setFriendsCount) {
        setFriendsCount(friendsData.length);
      }
    });

    // Real-time listener for incoming friend requests
    const incomingRequestsQuery = query(
      collection(db, 'friendRequests'),
      where('toUserId', '==', currentUser.uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeIncoming = onSnapshot(incomingRequestsQuery, (snap) => {
      // console.log(`[Data Listeners] INCOMING requests snapshot received. Size: ${snap.size}`);
      const requestsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // console.log('[Data Listeners] INCOMING requests data:', requestsData);
      setFriendRequests(requestsData);
      if (setFriendRequestsCount) {
        setFriendRequestsCount(requestsData.length);
      }
    }, (error) => {
      console.error('[Data Listeners] Error in INCOMING requests listener:', error);
    });

    // Real-time listener for sent friend requests
    const sentRequestsQuery = query(
      collection(db, 'friendRequests'),
      where('fromUserId', '==', currentUser.uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeSent = onSnapshot(sentRequestsQuery, (snap) => {
      // console.log(`[Data Listeners] SENT requests snapshot received. Size: ${snap.size}`);
      const sentData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // console.log('[Data Listeners] SENT requests data:', sentData);
      setSentRequests(sentData);
    }, (error) => {
      console.error('[Data Listeners] Error in SENT requests listener:', error);
    });

    return () => {
      // console.log(`[Data Listeners] Cleaning up listeners for user: ${currentUser.uid}`);
      unsubscribeFriends();
      unsubscribeIncoming();
      unsubscribeSent();
    };
  }, [currentUser, setFriendRequestsCount, setFriendsCount]);

  // Track online status for friends
  useEffect(() => {
    if (!currentUser || friends.length === 0) return;

    const unsubscribers = [];

    friends.forEach(friend => {
      const unsubscribe = getUserOnlineStatus(friend.friendId, (status) => {
        setOnlineStatus(prev => {
          const newStatus = {
            ...prev,
            [friend.friendId]: status
          };
          return newStatus;
        });
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [friends, currentUser]);

  // Track online status for search results
  useEffect(() => {
    if (!currentUser || !searchResults || searchResults.length === 0) return;

    const unsubscribers = [];

    searchResults.forEach(user => {
      const unsubscribe = getUserOnlineStatus(user.uid, (status) => {
        setOnlineStatus(prev => {
          const newStatus = {
            ...prev,
            [user.uid]: status
          };
          return newStatus;
        });
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [searchResults, currentUser]);

  // Backfill location for friends that miss friendCity/friendCountry
  useEffect(() => {
    if (!currentUser || friends.length === 0) return;

    const friendIdsNeedingProfile = friends
      .filter(f => !(f.friendCity && f.friendCountry) && !userProfiles[f.friendId])
      .map(f => f.friendId);

    if (friendIdsNeedingProfile.length === 0) return;

    (async () => {
      try {
        const results = await Promise.all(friendIdsNeedingProfile.map(async (uid) => {
          const snap = await getDoc(doc(db, 'users', uid));
          const data = snap.exists() ? snap.data() : {};
          return [uid, { city: data.city || '', country: data.country || '' }];
        }));
        setUserProfiles(prev => {
          const next = { ...prev };
          results.forEach(([uid, profile]) => { next[uid] = profile; });
          return next;
        });
      } catch (e) {
        console.error('Failed to backfill friend profiles:', e);
      }
    })();
  }, [friends, currentUser, userProfiles]);

  const sendFriendRequest = async (user) => {
    if (!currentUser || user.uid === currentUser.uid) return;

    setLoading(true);
    try {
      // Fetch fresh sender data
      const senderDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const senderData = senderDoc.data() || {};

      // Fetch fresh recipient data
      const recipientDoc = await getDoc(doc(db, 'users', user.uid));
      if (!recipientDoc.exists()) throw new Error(`User ${user.uid} not found.`);
      const recipientData = recipientDoc.data() || {};

      // Check for existing relationship
      const existing = await getDocs(query(collection(db, 'friendRequests'), where('fromUserId', '==', currentUser.uid), where('toUserId', '==', user.uid)));
      if (!existing.empty) return;

      // Create request with correct fields
      const requestData = {
        fromUserId: currentUser.uid,
        fromUserName: senderData.name || 'Unknown',
        fromUserAvatar: senderData.avatar || '',
        fromUserCity: senderData.city || '', // Додаємо місто відправника
        fromUserCountry: senderData.country || '', // Додаємо країну відправника
        toUserId: user.uid,
        toUserName: recipientData.name || 'Unknown',
        toUserAvatar: recipientData.avatar || '',
        toUserCity: recipientData.city || '',
        toUserCountry: recipientData.country || '',
        status: 'pending',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'friendRequests'), requestData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const acceptFriendRequest = async (request) => {
    if (!currentUser) return;

    setLoading(true);
    try {
      // Fetch fresh data for both users
      const fromUserDoc = await getDoc(doc(db, 'users', request.fromUserId));
      const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
      
      const fromUserData = fromUserDoc.data() || {};
      const currentUserData = currentUserDoc.data() || {};

      // Create friendship for current user
      await addDoc(collection(db, 'friends'), {
        userId: currentUser.uid,
        friendId: request.fromUserId,
        friendName: fromUserData.name || 'Unknown User',
        friendAvatar: fromUserData.avatar || '',
        friendCity: fromUserData.city || '',
        friendCountry: fromUserData.country || '',
        addedAt: serverTimestamp()
      });

      // Create friendship for the other user
      await addDoc(collection(db, 'friends'), {
        userId: request.fromUserId,
        friendId: currentUser.uid,
        friendName: currentUserData.name || 'Unknown User',
        friendAvatar: currentUserData.avatar || '',
        friendCity: currentUserData.city || '',
        friendCountry: currentUserData.country || '',
        addedAt: serverTimestamp()
      });

      // Delete the friend request
      await deleteDoc(doc(db, 'friendRequests', request.id));
    } catch (error) {
      console.error('Error accepting friend request:', error);
    } finally {
      setLoading(false);
    }
  };

  const rejectFriendRequest = async (requestId) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'friendRequests', requestId));
    } catch (error) {
      console.error('Error rejecting friend request:', error);
    } finally {
      setLoading(false);
    }
  };

  const cancelFriendRequest = async (requestId) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'friendRequests', requestId));
    } catch (error) {
      console.error('Error cancelling friend request:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFriend = async (friendId) => {
    if (!currentUser) return;
    
    if (!window.confirm('Are you sure you want to remove this friend?')) {
      return;
    }
    
    setLoading(true);
    try {
      // Remove friendship from current user's side
      const friendsRef = collection(db, 'friends');
      const friendQuery = query(
        friendsRef, 
        where('userId', '==', currentUser.uid),
        where('friendId', '==', friendId)
      );
      
      const friendSnapshot = await getDocs(friendQuery);
      if (!friendSnapshot.empty) {
        await deleteDoc(doc(db, 'friends', friendSnapshot.docs[0].id));
      }

      // Remove friendship from the other user's side
      const reverseFriendQuery = query(
        friendsRef,
        where('userId', '==', friendId),
        where('friendId', '==', currentUser.uid)
      );
      
      const reverseFriendSnapshot = await getDocs(reverseFriendQuery);
      if (!reverseFriendSnapshot.empty) {
        await deleteDoc(doc(db, 'friends', reverseFriendSnapshot.docs[0].id));
      }
    } catch (error) {
      console.error('Error removing friend:', error);
    } finally {
      setLoading(false);
    }
  };

  const isFriend = (userId) => {
    return friends.some(friend => friend.friendId === userId);
  };

  const hasSentRequest = (userId) => {
    return sentRequests.some(req => req.toUserId === userId);
  };

  const hasIncomingRequest = (userId) => {
    return friendRequests.some(req => req.fromUserId === userId);
  };

  // Calculate unique friend status for each user to force re-render
  const getFriendStatus = (userId) => {
    if (isFriend(userId)) return 'friend';
    if (hasSentRequest(userId)) return 'sent';
    if (hasIncomingRequest(userId)) return 'incoming';
    return 'none';
  };

  return (
    <div className="friends-manager">
      {activeTab === 'friends' && (
        <>
          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="search-results-section">
              <h3>Search Results</h3>
              <div className="search-results">
                {searchResults.filter(user => {
                  // Додаткова перевірка: виключаємо поточного користувача
                  return user.uid !== currentUser?.uid && user.id !== currentUser?.uid;
                }).map(user => {
                  const friendStatus = getFriendStatus(user.uid);
                  return (
                    <div key={`${user.uid}-${friendStatus}`} className="user-card search-result-item">
                      {/* Top part: Avatar and Info */}
                      <div className="card-top">
                        <div className="avatar-wrapper">
                          <div className="user-avatar">
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.name} />
                            ) : (
                              <div className="avatar-placeholder">
                                {(user.name || 'U').charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          {onlineStatus[user.uid]?.isOnline && <div className="online-dot"></div>}
                        </div>
                        <div className="user-info">
                          <div className="user-name">{user.name || 'Unknown User'}</div>
                          {user.city && user.country && <div className="user-location">{`${user.city}, ${user.country}`}</div>}
                        </div>
                      </div>

                      {/* Bottom part: Actions */}
                      <div className="card-bottom">
                        {isFriend(user.uid) ? (
                          <button 
                            className="action-btn friend-btn"
                            disabled
                          >
                            ✓ Friend
                          </button>
                        ) : hasSentRequest(user.uid) ? (
                          <button 
                            className="action-btn sent-btn"
                            disabled
                          >
                            ✓ Request Sent
                          </button>
                        ) : hasIncomingRequest(user.uid) ? (
                          <button
                            className="action-btn incoming-btn"
                            onClick={() => {
                              const request = friendRequests.find(req => req.fromUserId === user.uid);
                              if (request) {
                                acceptFriendRequest(request);
                              }
                            }}
                            disabled={loading}
                          >
                            ⏳ Accept Request
                          </button>
                        ) : (
                          <button 
                            className="action-btn add-btn"
                            onClick={() => sendFriendRequest(user)}
                            disabled={loading}
                          >
                            + Send Request
                          </button>
                        )}
                        <button 
                          className="action-btn chat-btn"
                          onClick={() => onUserSelect(user)}
                        >
                          💬 Chat
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Friends List */}
          <div className="friends-section">
            <div className="friends-header">
              <h3>My Friends ({showOnlineOnly ? friends.filter(friend => onlineStatus[friend.friendId]?.isOnline).length : friends.length})</h3>
              <div className="online-toggle">
                <div className="toggle-container">
                  <input
                    type="checkbox"
                    id="online-toggle"
                    checked={showOnlineOnly}
                    onChange={(e) => setShowOnlineOnly(e.target.checked)}
                    className="toggle-input"
                  />
                  <label htmlFor="online-toggle" className="toggle-switch">
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="toggle-label-text">Online only</span>
                </div>
              </div>
            </div>
            {friends.length > 0 ? (
              <div className="friends-list">
                {friends
                  .filter(friend => {
                    if (!showOnlineOnly) return true;
                    return onlineStatus[friend.friendId]?.isOnline;
                  })
                  .map(friend => (
                  <div key={friend.id} className="user-card friend-item">
                    <div className="card-top">
                      <div className="avatar-wrapper">
                        <div className="user-avatar">
                          {friend.friendAvatar ? (
                            <img src={friend.friendAvatar} alt={friend.friendName} />
                          ) : (
                            <div className="avatar-placeholder">
                              {(friend.friendName || 'U').charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        {onlineStatus[friend.friendId]?.isOnline && <div className="online-dot"></div>}
                      </div>
                      <div className="user-info">
                        <div className="user-name">{friend.friendName || 'Unknown User'}</div>
                        {(() => {
                          const city = friend.friendCity || (userProfiles[friend.friendId] && userProfiles[friend.friendId].city);
                          const country = friend.friendCountry || (userProfiles[friend.friendId] && userProfiles[friend.friendId].country);
                          return city && country ? (
                            <div className="user-location">{`${city}, ${country}`}</div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <div className="card-bottom">
                      <button 
                        className="action-btn chat-btn"
                        onClick={() => onUserSelect({ uid: friend.friendId, name: friend.friendName, avatar: friend.friendAvatar })}
                      >
                        💬 Chat
                      </button>
                      <button 
                        className="action-btn remove-btn"
                        onClick={() => removeFriend(friend.friendId)}
                        disabled={loading}
                      >
                        ✕ Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-friends">
                <p>No friends yet. Search for users to add them as friends!</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'requests' && (
        <div className="requests-section">
          {/* Incoming Friend Requests */}
          <div className="incoming-requests">
            <h3>Friends Requests ({friendRequests.length})</h3>
            {friendRequests.length > 0 ? (
              <div className="requests-list">
                {friendRequests.map(request => (
                  <div key={request.id} className="user-card request-item">
                    {/* Top part: Avatar and Info */}
                    <div className="card-top">
                      <div className="request-avatar">
                        {request.fromUserAvatar ? (
                          <img src={request.fromUserAvatar} alt={request.fromUserName} />
                        ) : (
                          <div className="avatar-placeholder">
                            {(request.fromUserName || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="request-info">
                        <div className="request-name">{request.fromUserName || 'Unknown User'}</div>
                        {request.fromUserCity && request.fromUserCountry && <div className="user-location">{`${request.fromUserCity}, ${request.fromUserCountry}`}</div>}
                      </div>
                    </div>

                    {/* Bottom part: Actions */}
                    <div className="card-bottom">
                      <button
                        onClick={() => acceptFriendRequest(request)}
                        className="accept-btn"
                        disabled={loading}
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => rejectFriendRequest(request.id)}
                        className="reject-btn"
                        disabled={loading}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-requests">
                <p>No Friend Requests</p>
              </div>
            )}
          </div>

          {/* Sent Friend Requests */}
          <div className="sent-requests">
            <h3>Sent Requests ({sentRequests.length})</h3>
            {sentRequests.length > 0 ? (
              <div className="requests-list">
                {sentRequests.map(request => (
                  <div key={request.id} className="user-card sent-request-item">
                    {/* Top part: Avatar and Info */}
                    <div className="card-top">
                      <div className="request-avatar">
                        {request.toUserAvatar ? (
                          <img src={request.toUserAvatar} alt={request.toUserName} />
                        ) : (
                          <div className="avatar-placeholder">
                            {(request.toUserName || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="request-info">
                        <div className="request-name">{request.toUserName || 'Unknown User'}</div>
                        {request.toUserCity && request.toUserCountry && <div className="user-location">{`${request.toUserCity}, ${request.toUserCountry}`}</div>}
                      </div>
                    </div>
                    
                    {/* Bottom part: Actions */}
                    <div className="card-bottom">
                      <button
                        onClick={() => cancelFriendRequest(request.id)}
                        className="cancel-btn"
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-requests">
                <p>No Sent Requests</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FriendsManager;
