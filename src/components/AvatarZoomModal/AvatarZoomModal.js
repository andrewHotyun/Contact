import React, { useState } from 'react';
import './AvatarZoomModal.css';

function AvatarZoomModal({ avatarUrl, originalAvatarUrl, userName, onClose, simple }) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  
  // Використовуємо оригінальне зображення, якщо воно є, інакше fallback на звичайне
  const imageUrl = originalAvatarUrl || avatarUrl;
  
  // Діагностика для перевірки якості зображення
  // console.log('[AvatarZoomModal] Image URLs:', {
  //   avatarUrl,
  //   originalAvatarUrl,
  //   finalImageUrl: imageUrl,
  //   hasOriginal: !!originalAvatarUrl
  // });
  
  if (!imageUrl) return null;

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  if (simple) {
    return (
      <div className="avatar-zoom-overlay" onClick={onClose}>
        <div className="avatar-zoom-modal simple" onClick={(e) => e.stopPropagation()}>
          <button className="close-btn floating" onClick={onClose}>✕</button>
          <div className="avatar-zoom-image-container">
            {imageLoading && (
              <div className="image-loading">
                <div className="loading-spinner"></div>
                <span>Loading...</span>
              </div>
            )}
            {imageError ? (
              <div className="image-error">
                <div className="error-icon">📷</div>
                <span>Failed to load image</span>
              </div>
            ) : (
              <img 
                src={imageUrl} 
                alt="Image preview" 
                className="avatar-zoom-image"
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{ display: imageLoading ? 'none' : 'block' }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="avatar-zoom-overlay" onClick={onClose}>
      <div className="avatar-zoom-modal" onClick={(e) => e.stopPropagation()}>
        <div className="avatar-zoom-header">
          <h3>Profile Photo</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        
        <div className="avatar-zoom-content">
          <div className="avatar-zoom-image-container">
            {imageLoading && (
              <div className="image-loading">
                <div className="loading-spinner"></div>
                <span>Loading...</span>
              </div>
            )}
            {imageError ? (
              <div className="image-error">
                <div className="error-icon">📷</div>
                <span>Failed to load image</span>
              </div>
            ) : (
              <img 
                src={imageUrl} 
                alt={userName || 'Аватарка користувача'} 
                className="avatar-zoom-image"
                onLoad={handleImageLoad}
                onError={handleImageError}
                style={{ display: imageLoading ? 'none' : 'block' }}
              />
            )}
          </div>
          
          {userName && (
            <div className="avatar-zoom-name">
              {userName}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AvatarZoomModal;
