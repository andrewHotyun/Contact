import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../../utils/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import './Header.css';

function Header() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  // Load profile data when user changes
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }

    const loadProfile = async () => {
      try {
        const profileDoc = await getDoc(doc(db, 'users', user.uid));
        if (profileDoc.exists()) {
          setUserProfile(profileDoc.data());
        } else {
          setUserProfile(null);
        }
      } catch (error) {
        console.error('Header profile load error:', error);
        setUserProfile(null);
      }
    };

    loadProfile();
  }, [user]);

  // Listen for avatar updates from ProfilePage
  useEffect(() => {
    const handleAvatarUpdate = (event) => {
      // console.log('Header received avatar update:', event.detail);
      setUserProfile(prev => ({
        ...prev,
        avatar: event.detail.avatar
      }));
    };

    window.addEventListener('avatarUpdated', handleAvatarUpdate);
    return () => window.removeEventListener('avatarUpdated', handleAvatarUpdate);
  }, []);

  const handleLogout = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // console.log('Logout button clicked');
    try {
      await signOut(auth);
      setShowDropdown(false);
      // The auth state change will handle redirecting to login
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const toggleDropdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // console.log('Header avatar clicked, current showDropdown:', showDropdown);
    setShowDropdown(!showDropdown);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDropdown && !event.target.closest('.header-avatar-container')) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  if (!user) return null;

  return (
    <header className="header">
      <div className="header-content">
        <Link to="/home" className="header-logo">
          <img 
            src={process.env.PUBLIC_URL + "/logo.png"} 
            alt="Contact Logo" 
            className="header-logo-img"
            onError={(e) => {
              // console.log('Logo failed to load, showing text fallback');
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'block';
            }}
          />
          <h1 className="header-title-fallback" style={{ display: 'none' }}>Contact</h1>
        </Link>
        <div className="header-avatar-container">
          <div className="header-avatar" onClick={toggleDropdown}>
            {userProfile?.avatar && userProfile.avatar.trim() !== '' ? (
              <img 
                src={userProfile.avatar} 
                alt="Profile" 
                onError={(e) => {
                  // console.log('Avatar image failed to load, showing placeholder');
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div 
              className="header-avatar-placeholder"
              style={{ display: userProfile?.avatar && userProfile.avatar.trim() !== '' ? 'none' : 'flex' }}
            >
              {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
          {showDropdown && (
            <div className="header-dropdown">
              <Link 
                to="/profile" 
                className="dropdown-item" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // console.log('Profile button clicked');
                  setShowDropdown(false);
                  navigate('/profile');
                }}
              >
                Profile
              </Link>
              <button className="dropdown-item" onClick={handleLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;
