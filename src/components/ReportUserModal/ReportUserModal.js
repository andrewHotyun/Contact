import React, { useState, useEffect } from 'react';
import emailjs from '@emailjs/browser';
import './ReportUserModal.css';
import { db } from '../../utils/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const ReportUserModal = ({ isOpen, onClose, user, currentUser }) => {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    emailjs.init(process.env.REACT_APP_EMAILJS_PUBLIC_KEY);
  }, []);

  const reasons = [
    'Inappropriate behavior',
    'Spam or advertisement',
    'Nudity or sexual content',
    'Hate speech',
    'Underage user',
    'Other',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // Clear previous errors
    if (!reason) {
      setError('Please select a reason for the report.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const templateParams = {
        from_name: currentUser.name || 'Anonymous User',
        from_id: currentUser.uid,
        reported_user_name: user.name,
        reported_user_id: user.id,
        reason: reason,
        details: details,
      };

      const emailPromise = emailjs.send(
        process.env.REACT_APP_EMAILJS_SERVICE_ID,
        process.env.REACT_APP_EMAILJS_TEMPLATE_ID,
        templateParams
      );

      const firestorePromise = addDoc(collection(db, 'reports'), {
        reporterId: currentUser.uid,
        reporterName: currentUser.name || currentUser.displayName || 'Anonymous',
        reportedUserId: user.id,
        reportedUserName: user.name,
        reason: reason,
        details: details, // Also save details to Firestore
        timestamp: serverTimestamp(),
      });

      await Promise.all([emailPromise, firestorePromise]);
      
      onClose();
    } catch (error) {
      console.error('Error submitting report:', error);
      setError('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason('');
    setDetails('');
    setError('');
    onClose();
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="report-modal-overlay" onClick={handleClose}>
      <div className="report-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="report-modal-close" onClick={handleClose}>&times;</button>
        <h2>Report User</h2>
        <p>You are reporting <strong>{user?.name || 'this user'}</strong>.</p>
        <p>Please select a reason for your report:</p>
        <form onSubmit={handleSubmit}>
          <div className="report-reasons">
            {reasons.map((r) => (
              <label key={r} className="report-reason-label">
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={reason === r}
                  onChange={(e) => setReason(e.target.value)}
                />
                {r}
              </label>
            ))}
          </div>
          {reason === 'Other' && (
            <textarea
              className="report-details-textarea"
              placeholder="Please provide more details..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              disabled={isSubmitting}
            />
          )}
          {error && <p className="report-error">{error}</p>}
          <div className="report-modal-actions">
            <button type="submit" className="report-btn submit" disabled={!reason || isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Report'}
            </button>
            <button type="button" className="report-btn cancel" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReportUserModal;
