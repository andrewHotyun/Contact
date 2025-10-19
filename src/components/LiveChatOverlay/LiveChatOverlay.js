import React, { useState, useEffect, useRef } from 'react';
import './LiveChatOverlay.css';

const LiveChatOverlay = ({ messages, currentUserId }) => {
  const [isVisible, setIsVisible] = useState(true);
  const messagesEndRef = useRef(null);

  const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xFF;
      color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
  };

  useEffect(() => {
    if (isVisible && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isVisible]);

  if (!messages || messages.length === 0) {
    return null;
  }

  return (
    <div className={`live-chat-overlay-container ${isVisible ? 'visible-container' : 'hidden-container'}`}>
      <button 
        className="live-chat-overlay-toggle-btn"
        onClick={() => setIsVisible(!isVisible)}
      >
        {isVisible ? '↓' : '↑'}
      </button>
      <div className={`live-chat-overlay-messages-list ${!isVisible ? 'hidden' : ''}`}>
        {messages.map((msg) => (
          <div key={msg.id} className={`live-chat-overlay-message-block ${msg.senderId === currentUserId ? 'own-message' : ''}`}>
            <span className="live-chat-overlay-sender-name" style={{ color: stringToColor(msg.senderId) }}>
              {msg.senderName || 'Anonymous'}:
            </span>
            <span className="live-chat-overlay-message-text">{msg.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default LiveChatOverlay;
