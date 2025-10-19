import React from 'react';
import { IoVideocam, IoNotifications, IoChatbubbles, IoPeople, IoPersonAdd } from 'react-icons/io5';
import './NavigationBar.css';

function NavigationBar({ activeTab, onTabChange, friendRequestsCount, friendsCount, unreadMessagesCount, unreadChatsCount, notificationsCount, isLoadingCounts }) {
  const handleTabChange = (tab) => {
    onTabChange(tab);
  };

  return (
    <div className="navigation-bar">
      <button 
        className={`nav-item ${activeTab === 'chats' ? 'active' : ''}`}
        onClick={() => handleTabChange('chats')}
        title="All Chats"
      >
        <span className="nav-icon"><IoChatbubbles /></span>
        {!isLoadingCounts && unreadChatsCount > 0 && (
          <span className="nav-badge chats-badge">{unreadChatsCount}</span>
        )}
      </button>
      
      <button 
        className={`nav-item ${activeTab === 'friends' ? 'active' : ''}`}
        onClick={() => onTabChange('friends')}
        title="Friends"
      >
        <span className="nav-icon"><IoPeople /></span>
        {friendsCount > 0 && (
          <span className="nav-badge">{friendsCount}</span>
        )}
      </button>
      
      <button 
        className={`nav-item ${activeTab === 'requests' ? 'active' : ''}`}
        onClick={() => onTabChange('requests')}
        title="Friend Requests"
      >
        <span className="nav-icon"><IoPersonAdd /></span>
        {friendRequestsCount > 0 && (
          <span className="nav-badge requests-badge">{friendRequestsCount}</span>
        )}
      </button>
      
      <button 
        className={`nav-item ${activeTab === 'notifications' ? 'active' : ''}`}
        onClick={() => onTabChange('notifications')}
      >
        <span className="nav-icon"><IoNotifications /></span>
        {!isLoadingCounts && notificationsCount > 0 && (
          <span className="nav-badge notifications-badge">{notificationsCount}</span>
        )}
      </button>
      
      <button 
        className={`nav-item ${activeTab === 'videochat' ? 'active' : ''}`}
        onClick={() => onTabChange('videochat')}
        title="Random Video Chat"
      >
        <span className="nav-icon"><IoVideocam /></span>
      </button>
    </div>
  );
}

export default NavigationBar;
