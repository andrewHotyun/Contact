import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../../utils/firebase';
import { updateEmail } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../utils/firebase';
import Header from '../../components/Header/Header';
import './ProfilePage.css';
import { Country, City } from 'country-state-city';

function ProfilePage() {
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    country: '',
    city: '',
    chatType: 'normal',
    gender: 'man'
  });
  const [countrySuggestions, setCountrySuggestions] = useState([]);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [editError, setEditError] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Load profile data once when component mounts
  useEffect(() => {
    if (!user) {
      // console.log('No user found, clearing profile');
      setUserProfile(null);
      setProfileLoading(false);
      return;
    }

    const loadProfile = async () => {
      try {
        // console.log('=== LOADING PROFILE ===');
        // console.log('User UID:', user.uid);
        // console.log('User email:', user.email);
        // console.log('User displayName:', user.displayName);
        setProfileLoading(true);
        
        const profileDoc = await getDoc(doc(db, 'users', user.uid));
        // console.log('Profile document exists:', profileDoc.exists());
        
        if (profileDoc.exists()) {
          const profileData = profileDoc.data();
          // console.log('=== PROFILE DATA LOADED ===');
          // console.log('Raw profile data:', profileData);
          // console.log('Profile fields check:', {
          //   name: profileData.name,
          //   email: profileData.email,
          //   country: profileData.country,
          //   city: profileData.city,
          //   chatType: profileData.chatType,
          //   hasAvatar: !!profileData.avatar,
          //   uid: profileData.uid
          // });
          setUserProfile(profileData);
          
          // Відправляємо event для Header
          window.dispatchEvent(new CustomEvent('avatarUpdated', {
            detail: { avatar: profileData.avatar }
          }));
        } else {
          // console.log('=== NO PROFILE DOCUMENT FOUND ===');
          // console.log('Creating default profile data from auth user...');
          
          // Створюємо базовий профіль з даних авторизації
          const defaultProfile = {
            name: user.displayName || 'User',
            email: user.email || '',
            country: 'Not specified',
            city: 'Not specified',
            chatType: 'normal',
            uid: user.uid
          };
          
          // console.log('Using default profile:', defaultProfile);
          setUserProfile(defaultProfile);
        }
      } catch (error) {
        console.error('=== ERROR LOADING PROFILE ===');
        console.error('Error details:', error);
        console.error('Error message:', error.message);
        setUserProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  const handleDeleteRequest = () => {
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!user) return;

    const deletionDate = new Date();
    deletionDate.setMonth(deletionDate.getMonth() + 6);

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        deletionInfo: {
          status: 'pending_deletion',
          scheduledDeletionAt: deletionDate,
          initiatedAt: new Date(),
        }
      });

      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error("Error scheduling account deletion:", error);
    }

    setIsDeleteModalOpen(false);
  };

  // Update edit form when profile loads
  useEffect(() => {
    if (userProfile) {
      setEditForm({
        name: userProfile.name || '',
        email: userProfile.email || (user ? user.email : ''),
        country: userProfile.country || '',
        city: userProfile.city || '',
        chatType: userProfile.chatType || 'normal',
        gender: userProfile.gender || 'man'
      });
    }
  }, [userProfile]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isEditing) {
        setShowCountrySuggestions(false);
        setShowCitySuggestions(false);
      }
    };

    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing]);

  const handleAvatarClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    if (!isEditing && userProfile) {
      setEditForm({
        name: userProfile.name || '',
        email: userProfile.email || (user ? user.email : ''),
        country: userProfile.country || '',
        city: userProfile.city || '',
        chatType: userProfile.chatType || 'normal',
        gender: userProfile.gender || 'man'
      });
    }
  };

  const handleEditSave = async () => {
    if (!user || !userProfile) return;
    setEditError('');

    try {
      // console.log('Saving profile updates:', editForm);

      const firestoreUpdates = {
        name: editForm.name.trim(),
        country: editForm.country.trim(),
        city: editForm.city.trim(),
        chatType: editForm.chatType,
        gender: editForm.gender
      };

      if (editForm.email && editForm.email !== user.email) {
        // console.log('Email has changed, updating...');
        try {
          await updateEmail(user, editForm.email.trim());
          // console.log('Firebase Auth email updated successfully.');
          firestoreUpdates.email = editForm.email.trim();
        } catch (error) {
          console.error('Error updating email in Firebase Auth:', error);
          let errorMessage = `An error occurred while updating your email: ${error.message}`;
          if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'This is a sensitive operation. Please log out and log back in again to change your email.';
          } else if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email address is already in use by another account.';
          }
          setEditError(errorMessage);
          return; 
        }
      }

      await updateDoc(doc(db, 'users', user.uid), firestoreUpdates);

      // Update local state
      setUserProfile(prev => ({
        ...prev,
        ...firestoreUpdates
      }));

      setIsEditing(false);
      // console.log('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      setEditError('An unexpected error occurred while saving your profile.');
    }
  };

  const handleCountryChange = (value) => {
    setEditForm(prev => ({ ...prev, country: value }));
    
    if (!value.trim()) {
      setCountrySuggestions([]);
      setShowCountrySuggestions(false);
      return;
    }
    
    const filtered = Country.getAllCountries()
      .filter(country => 
        country.name.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 5);
    
    setCountrySuggestions(filtered);
    setShowCountrySuggestions(true);
  };

  const handleCityChange = (value) => {
    setEditForm(prev => ({ ...prev, city: value }));
    
    if (!value.trim()) {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
      return;
    }
    
    const filtered = City.getAllCities()
      .filter(city => 
        city.name.toLowerCase().includes(value.toLowerCase())
      )
      .slice(0, 5);
    
    setCitySuggestions(filtered);
    setShowCitySuggestions(true);
  };

  const selectCountry = (country) => {
    setEditForm(prev => ({ ...prev, country: country.name }));
    setShowCountrySuggestions(false);
  };

  const selectCity = (city) => {
    setEditForm(prev => ({ ...prev, city: city.name }));
    setShowCitySuggestions(false);
  };


  // Оптимізована функція для стиснення зображення
  const compressImage = (file, maxWidth = 200, maxHeight = 200, quality = 0.8) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      // Оптимізуємо якість для швидшої обробки
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      
      img.onload = () => {
        // Розрахуємо нові розміри (оптимізовано)
        let { width, height } = img;
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        
        if (ratio < 1) {
          width *= ratio;
          height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Малюємо стиснене зображення
        ctx.drawImage(img, 0, 0, width, height);
        
        // Конвертуємо в base64 з оптимізованою якістю
        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
        
        // Очищаємо пам'ять
        URL.revokeObjectURL(img.src);
      };
      
      img.onerror = () => {
        console.error('Error loading image for compression');
        resolve(null);
      };
      
      img.src = URL.createObjectURL(file);
    });
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file || !user) return;

    // Перевірка типу файлу
    if (!file.type.startsWith('image/')) {
      // console.log('Invalid file type:', file.type);
      return;
    }

    // Перевірка розміру файлу (максимум 5MB)
    if (file.size > 5 * 1024 * 1024) {
      // console.log('File too large:', file.size);
      alert('Файл занадто великий. Максимальний розмір: 5MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      // console.log('=== AVATAR UPLOAD (OPTIMIZED) ===');
      // console.log('File details:', {
      //   name: file.name,
      //   size: file.size,
      //   type: file.type
      // });
      
      // Стискаємо зображення для мініатюри (швидше)
      // console.log('Compressing image for thumbnail...');
      const compressedBase64 = await compressImage(file, 150, 150, 0.7);
      // console.log('Compression completed, length:', compressedBase64.length);
      
      // Зберігаємо тільки стиснене зображення в Firestore (швидше)
      // console.log('Saving compressed avatar to Firestore...');
      await updateDoc(doc(db, 'users', user.uid), {
        avatar: compressedBase64
      });
      
      // console.log('Avatar saved successfully');
      
      // Оновлюємо локальний стан
      setUserProfile(prev => ({
        ...prev,
        avatar: compressedBase64
      }));
      
      // Оновлюємо Header
      window.dispatchEvent(new CustomEvent('avatarUpdated', {
        detail: { avatar: compressedBase64 }
      }));
      
      // Фоново завантажуємо оригінальне зображення (не блокуємо UI)
      setTimeout(async () => {
        try {
          // console.log('Background: Uploading original to Storage...');
          const originalRef = ref(storage, `avatars/${user.uid}/original.jpg`);
          await uploadBytes(originalRef, file);
          const originalUrl = await getDownloadURL(originalRef);
          // console.log('Background: Original uploaded, URL:', originalUrl);
          
          // Оновлюємо профіль з URL оригіналу
          await updateDoc(doc(db, 'users', user.uid), {
            originalAvatarUrl: originalUrl
          });
          
          // console.log('Background: Original avatar URL saved');
        } catch (error) {
          console.error('Background upload error:', error);
        }
      }, 100);
      
    } catch (error) {
      console.error('=== AVATAR UPLOAD ERROR ===');
      console.error('Error details:', error);
      console.error('Failed to save avatar:', error.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-page">
        <Header />
        <div className="profile-loading">Loading profile...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-page">
        <Header />
        <div className="profile-error">Please log in to view your profile.</div>
      </div>
    );
  }

  // Show profile even if userProfile is null (fallback to auth data)
  // console.log('=== RENDERING PROFILE ===');
  // console.log('User UID:', user.uid);
  // console.log('Profile data:', userProfile);
  // console.log('Profile loading:', profileLoading);

  return (
    <div className="profile-page">
      <Header />
      <div className="profile-container">
        <div className="profile-card">
          <div className="profile-header">
            <button 
              onClick={() => navigate('/home')} 
              className="back-to-chats-btn"
              title="Back to chats"
            >
              ← Back to Chats
            </button>
            <h2 className="profile-title">Profile</h2>
            <button 
              onClick={handleEditToggle}
              className="edit-profile-btn"
              title={isEditing ? "Cancel editing" : "Edit profile"}
            >
              {isEditing ? "Cancel" : "Edit"}
            </button>
          </div>
          
          {profileLoading && (
            <div className="profile-loading-indicator">
              <div className="loading-spinner"></div>
              <span>Loading profile data...</span>
            </div>
          )}
          
          <div 
            className={`profile-avatar-large ${uploadingAvatar ? 'uploading' : ''}`}
            onClick={handleAvatarClick}
            style={{ cursor: 'pointer' }}
          >
            {uploadingAvatar ? (
              <div className="profile-avatar-uploading">
                <div className="upload-spinner"></div>
                <span>Processing image...</span>
              </div>
            ) : userProfile?.avatar && userProfile.avatar.trim() !== '' ? (
              <img 
                src={userProfile.avatar} 
                alt="Profile" 
                onError={(e) => {
                  // console.log('Profile avatar failed to load, showing placeholder');
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
                onLoad={(e) => {
                  // console.log('Profile avatar loaded successfully');
                }}
              />
            ) : null}
            <div 
              className="profile-avatar-placeholder"
              style={{ display: userProfile?.avatar && userProfile.avatar.trim() !== '' ? 'none' : 'flex' }}
            >
              {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : 'U'}
            </div>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />

          <p className="avatar-hint">Click on avatar to change it</p>

          {uploadingAvatar && (
            <button 
              className="cancel-upload-btn"
              onClick={() => {
                setUploadingAvatar(false);
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                }
              }}
            >
              Cancel Upload
            </button>
          )}
          

          <div className="profile-info">
            {isEditing ? (
              <div className="profile-edit-form">
                {editError && <p className="profile-edit-error">{editError}</p>}
                <div className="profile-columns">
                  <div className="profile-column"> {/* Left Column */}
                    <div className="profile-field">
                      <span className="profile-label">Name:</span>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className="profile-edit-input"
                        placeholder="Enter your name"
                      />
                    </div>
                    
                    <div className="profile-field">
                      <span className="profile-label">Email:</span>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                        className="profile-edit-input"
                        placeholder="Enter your email"
                      />
                    </div>
                    
                    <div className="profile-field">
                      <span className="profile-label">Gender:</span>
                      <select
                        value={editForm.gender}
                        onChange={(e) => setEditForm(prev => ({ ...prev, gender: e.target.value }))}
                        className="profile-edit-select"
                      >
                        <option value="man">Man</option>
                        <option value="woman">Woman</option>
                      </select>
                    </div>
                  </div>
                  <div className="profile-column"> {/* Right Column */}
                    <div className="profile-field">
                      <span className="profile-label">Country:</span>
                      <div className="autocomplete-container">
                        <input
                          type="text"
                          value={editForm.country}
                          onChange={(e) => handleCountryChange(e.target.value)}
                          className="profile-edit-input"
                          placeholder="Enter country"
                          autoComplete="off"
                        />
                        {showCountrySuggestions && countrySuggestions.length > 0 && (
                          <div className="suggestions-dropdown">
                            {countrySuggestions.map((country) => (
                              <div key={country.name} className="suggestion-item" onMouseDown={() => selectCountry(country)}>
                                {country.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="profile-field">
                      <span className="profile-label">City:</span>
                      <div className="autocomplete-container">
                        <input
                          type="text"
                          value={editForm.city}
                          onChange={(e) => handleCityChange(e.target.value)}
                          className="profile-edit-input"
                          placeholder="Enter city"
                          autoComplete="off"
                        />
                        {showCitySuggestions && citySuggestions.length > 0 && (
                          <div className="suggestions-dropdown">
                            {citySuggestions.map((city) => (
                              <div key={city.name} className="suggestion-item" onMouseDown={() => selectCity(city)}>
                                {city.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="profile-field">
                      <span className="profile-label">Chat Type:</span>
                      <select
                        value={editForm.chatType}
                        onChange={(e) => setEditForm(prev => ({ ...prev, chatType: e.target.value }))}
                        className="profile-edit-select"
                      >
                        <option value="normal">Normal communication</option>
                        <option value="18+">Communication 18+</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="profile-edit-buttons">
                  <button onClick={handleEditSave} className="save-profile-btn">
                    Save Changes
                  </button>
                  <button onClick={handleEditToggle} className="cancel-edit-btn">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="profile-columns">
                  <div className="profile-column"> {/* Left Column */}
                    <div className="profile-field">
                      <span className="profile-label">Name:</span>
                      <span className="profile-value">
                        {userProfile?.name && userProfile.name.trim() !== '' ? userProfile.name : (user.displayName || 'User')}
                      </span>
                    </div>
                    
                    <div className="profile-field">
                      <span className="profile-label">Email:</span>
                      <span className="profile-value">
                        {userProfile?.email || user.email || 'Not specified'}
                      </span>
                    </div>

                    <div className="profile-field">
                      <span className="profile-label">Gender:</span>
                      <span className="profile-value">
                        {userProfile?.gender === 'man' ? 'Man' :
                         userProfile?.gender === 'woman' ? 'Woman' :
                         'Not specified'}
                      </span>
                    </div>
                  </div>
                  <div className="profile-column"> {/* Right Column */}
                    <div className="profile-field">
                      <span className="profile-label">Country:</span>
                      <span className="profile-value">
                        {userProfile?.country && userProfile.country.trim() !== '' ? userProfile.country : 'Not specified'}
                      </span>
                    </div>
                    
                    <div className="profile-field">
                      <span className="profile-label">City:</span>
                      <span className="profile-value">
                        {userProfile?.city && userProfile.city.trim() !== '' ? userProfile.city : 'Not specified'}
                      </span>
                    </div>
                    
                    <div className="profile-field">
                      <span className="profile-label">Chat Type:</span>
                      <span className="profile-value">
                        {userProfile?.chatType === 'normal' ? 'Normal communication' : 
                         userProfile?.chatType === '18+' ? 'Communication 18+' : 
                         userProfile?.chatType || 'Normal communication'}
                      </span>
                    </div>

                    <div className="profile-field">
                      <span className="profile-label">User ID:</span>
                      <span className="profile-value profile-id">{user.uid}</span>
                    </div>
                  </div>
                </div>

                <div className="delete-account-section">
                  <button onClick={handleDeleteRequest} className="delete-account-btn">
                    Delete Account
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {isDeleteModalOpen && (
        <div className="delete-modal-overlay">
          <div className="delete-modal">
            <h2>Delete Account</h2>
            <p>Are you sure you want to delete your account? You can recover it for 6 months.</p>
            <p>If not recovered, your account will be permanently deleted.</p>
            <div className="delete-modal-buttons">
              <button onClick={handleConfirmDelete} className="confirm-delete-btn">Confirm Delete</button>
              <button onClick={() => setIsDeleteModalOpen(false)} className="cancel-delete-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
