import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db } from '../../utils/firebase';
import { signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import './LoginPage.css';
import { MdEmail } from 'react-icons/md';
import { RiKey2Fill } from 'react-icons/ri';

function LoginPage() {
  const navigate = useNavigate();

  // Local state for email/password inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [userToRecover, setUserToRecover] = useState(null);

  // Handle login with Firebase Auth
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      // Встановлюємо displayName якщо він не встановлений
      if (userDoc.exists() && !user.displayName) {
        const userData = userDoc.data();
        if (userData.name) {
          await updateProfile(user, {
            displayName: userData.name
          });
        }
      }

      if (userDoc.exists() && userDoc.data().deletionInfo?.status === 'pending_deletion') {
        setUserToRecover(user);
        setShowRecoveryModal(true);
        setLoading(false);
      } else {
        navigate('/home');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
      setLoading(false);
    }
  };

  const handleRecoverAccount = async () => {
    if (!userToRecover) return;
    try {
      const userDocRef = doc(db, 'users', userToRecover.uid);
      await updateDoc(userDocRef, {
        deletionInfo: null
      });
      setShowRecoveryModal(false);
      navigate('/home');
    } catch (error) {
      setError('Failed to recover account. Please try again.');
      setShowRecoveryModal(false);
    }
  };

  const handleLogoutAndCancel = async () => {
    await auth.signOut();
    setShowRecoveryModal(false);
    setUserToRecover(null);
  };

  return (
    <div className="auth-container">
      <div className="auth-card-login">
        <h2 className="auth-title-login">Login</h2>
        <form onSubmit={handleLogin}>
          <div className="form-group-login">
            <label className="form-label-login">Email</label>
            <div className="input-wrap-login">
              <span className="input-icon" aria-hidden><MdEmail size={18} color="#7b8a97" /></span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="form-input-login"
              />
            </div>
          </div>
          <div className="form-group-login">
            <label className="form-label-login">Password</label>
            <div className="input-wrap-login">
              <span className="input-icon" aria-hidden><RiKey2Fill size={18} color="#7b8a97" /></span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                required
                className="form-input-login"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="form-submit-login btn-pressable btn-small">
            {loading ? 'Sign In' : 'Sign In'}
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}

        <p className="not-account">
          You don't have an account?
        </p>
        <div className="link-btn-row-login">
          <Link to="/register" className="link-btn-login btn-pressable">Sign Up</Link>
        </div>
      </div>
      {showRecoveryModal && (
        <div className="recovery-modal-overlay">
          <div className="recovery-modal">
            <h2>Account Recovery</h2>
            <p>Your account is scheduled for deletion. Would you like to recover it?</p>
            <div className="recovery-modal-buttons">
              <button onClick={handleRecoverAccount} className="recover-btn">Recover Account</button>
              <button onClick={handleLogoutAndCancel} className="cancel-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LoginPage;


