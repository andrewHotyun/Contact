import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import './UserProfileModal.css';

function UserProfileModal({ user, isVisible, onClose, onRemoveFriend, onAvatarClick }) {
  const [showAvatarZoom, setShowAvatarZoom] = useState(false);
  const [fullUserProfile, setFullUserProfile] = useState(null);

  useEffect(() => {
    if (isVisible && user?.uid) {
      const fetchUserProfile = async () => {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setFullUserProfile(userDoc.data());
        }
      };
      fetchUserProfile();
    }
  }, [isVisible, user]);
  
  if (!isVisible || !user) return null;

  const displayUser = fullUserProfile || user;

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return 'Unknown';
    }
  };

  const getChatTypeDisplay = (chatType) => {
    if (chatType === 'normal') {
      return 'Normal communication';
    } else if (chatType === '18+') {
      return 'Communication 18+';
    }
    return 'Not specified';
  };

  const getGenderDisplay = (gender) => {
    if (gender === 'man') {
      return 'Man';
    } else if (gender === 'woman') {
      return 'Woman';
    }
    return 'Not specified';
  };

  return (
    <div className="user-profile-modal-overlay" onClick={onClose}>
      <div className="user-profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>User Profile</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          <div className="profile-avatar-section">
            <div 
              className={`profile-avatar-large ${showAvatarZoom ? 'avatar-zoomed' : ''}`}
              onClick={() => setShowAvatarZoom(!showAvatarZoom)}
            >
              {displayUser.avatar ? (
                <img src={displayUser.avatar} alt="User Avatar" />
              ) : (
                <div className="avatar-placeholder-large">
                  {displayUser.name ? displayUser.name.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
            </div>
            {showAvatarZoom && (
              <div className="avatar-zoom-overlay" onClick={() => setShowAvatarZoom(false)}>
                <div className="avatar-zoom-content" onClick={(e) => e.stopPropagation()}>
                  <button 
                    className="avatar-zoom-close" 
                    onClick={() => setShowAvatarZoom(false)}
                    title="Close"
                  >
                    ×
                  </button>
                  {displayUser.avatar ? (
                    <img src={displayUser.avatar} alt="User Avatar" />
                  ) : (
                    <div className="avatar-placeholder-zoom">
                      {displayUser.name ? displayUser.name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="profile-info">
            <div className="info-field">
              <label>Name</label>
              <span>{displayUser.name || 'Unknown User'}</span>
            </div>
            
            {displayUser.city && displayUser.country && (
              <div className="info-field">
                <label>Location</label>
                <span>{`${displayUser.city}, ${displayUser.country}`}</span>
              </div>
            )}
            
            <div className="info-field">
              <label>Chat Type</label>
              <span>{getChatTypeDisplay(displayUser.chatType)}</span>
            </div>

            <div className="info-field">
              <label>Gender</label>
              <span>{getGenderDisplay(displayUser.gender)}</span>
            </div>
            
            <div className="info-field">
              <label>Registration Date</label>
              <span>{formatDate(displayUser.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UserProfileModal;