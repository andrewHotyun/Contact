import React, { useEffect, useRef } from 'react';
import './IncomingCallModal.css';

function IncomingCallModal({ isVisible, caller, onAccept, onDecline }) {
  // console.log('IncomingCallModal render:', { isVisible, caller: caller ? {
  //   name: caller.name,
  //   avatar: caller.avatar,
  //   hasName: !!caller.name,
  //   hasAvatar: !!caller.avatar
  // } : null });

  // Audio disabled for now
  // const audioCtxRef = useRef(null);
  // const gainRef = useRef(null);
  // const intervalRef = useRef(null);

  // useEffect(() => {
  //   // Audio code commented out
  // }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className={`incoming-call-overlay ${isVisible ? 'visible' : ''}`}>
      <div className="incoming-call-modal">
        <div className="incoming-header">
          <div className="incoming-avatar">
            {caller?.avatar ? (
              <img src={caller.avatar} alt="Caller Avatar" />
            ) : (
              <div className="avatar-placeholder">
                {caller?.name ? caller.name[0].toUpperCase() : 'U'}
              </div>
            )}
          </div>
          <h3 className="incoming-name">{caller?.name || 'Unknown User'}</h3>
          <p className="incoming-text">Incoming video call</p>
        </div>
        <div className="incoming-actions">
          <button className="accept-btn" onClick={onAccept}>
            <span className="btn-icon" aria-hidden>📞</span>
            Accept
          </button>
          <button className="decline-btn" onClick={onDecline}>
            <span className="btn-icon" aria-hidden>✖️</span>
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}

export default IncomingCallModal;


