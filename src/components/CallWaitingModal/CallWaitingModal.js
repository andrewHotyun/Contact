import React, { useEffect, useRef } from 'react';
import './CallWaitingModal.css';

function CallWaitingModal({ isVisible, callee, onCancel }) {
  // Audio disabled for now
  // const audioCtxRef = useRef(null);
  // const gainRef = useRef(null);
  // const intervalRef = useRef(null);

  // useEffect(() => {
  //   // Audio code commented out
  // }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="call-waiting-modal-overlay">
      <div className="call-waiting-modal">
        <div className="call-waiting-header">
          <div className="caller-avatar">
            {callee?.avatar ? (
              <img src={callee.avatar} alt="User Avatar" />
            ) : (
              <div className="avatar-placeholder">
                {callee?.name ? callee.name[0].toUpperCase() : 'U'}
              </div>
            )}
          </div>
          <h3 className="caller-name">{callee?.name || 'Unknown User'}</h3>
          <p className="waiting-message">Waiting for user to accept the call...</p>
        </div>
        <div className="call-waiting-actions">
          <button className="cancel-call-btn" onClick={onCancel}>Cancel Call</button>
        </div>
      </div>
    </div>
  );
}

export default CallWaitingModal;


