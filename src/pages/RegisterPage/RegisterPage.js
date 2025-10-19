import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, db, storage } from '../../utils/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import './RegisterPage.css';
import { MdEmail, MdPerson, MdFlag, MdLocationCity } from 'react-icons/md';
import { RiKey2Fill } from 'react-icons/ri';
import { Country, City } from 'country-state-city';
import { FaVenusMars } from 'react-icons/fa';

function RegisterPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Controlled inputs for required fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [countrySuggestions, setCountrySuggestions] = useState([]);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [chatType, setChatType] = useState('normal');
  const [gender, setGender] = useState('man');
  const [avatarFile, setAvatarFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle select of avatar file
  const handleAvatarChange = (e) => {
    const file = e.target.files && e.target.files[0];
    setAvatarFile(file || null);
  };

  const handleAvatarClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleCountryChange = (value) => {
    setCountry(value);
    if (!value.trim()) {
      setCountrySuggestions([]);
      return;
    }
    
    // Дебаунс для кращої продуктивності
    clearTimeout(window.countryTimeout);
    window.countryTimeout = setTimeout(() => {
      try {
        const all = Country.getAllCountries();
        const v = value.trim().toLowerCase();
        const match = all.filter(c => c.name.toLowerCase().includes(v)).slice(0, 3); // Ще менше результатів
        setCountrySuggestions(match);
      } catch (error) {
        console.error('Country filter error:', error);
        setCountrySuggestions([]);
      }
    }, 1000); // Максимальна затримка
    
    // Reset city suggestions on country change
    setCity('');
    setCitySuggestions([]);
  };

  const handleCityChange = (value) => {
    setCity(value);
    if (!value.trim()) {
      setCitySuggestions([]);
      return;
    }
    
    // Дебаунс для кращої продуктивності
    clearTimeout(window.cityTimeout);
    window.cityTimeout = setTimeout(() => {
      try {
        const selectedCountry = Country.getAllCountries().find(c => c.name.toLowerCase() === country.trim().toLowerCase());
        if (!selectedCountry) {
          setCitySuggestions([]);
          return;
        }
        const cities = City.getCitiesOfCountry(selectedCountry.isoCode) || [];
        const v = value.trim().toLowerCase();
        const match = cities.filter(ci => ci.name.toLowerCase().includes(v)).slice(0, 3); // Ще менше результатів
        setCitySuggestions(match);
      } catch (error) {
        console.error('City filter error:', error);
        setCitySuggestions([]);
      }
    }, 1000); // Максимальна затримка
  };

  const hideSuggestions = () => {
    setCountrySuggestions([]);
    setCitySuggestions([]);
  };

  // On submit: create auth user, upload avatar to Storage, create Firestore profile, then redirect
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Basic validation to fail fast
      if (!name || !email || !password || !gender) {
        throw new Error('Заповніть name, email, password та gender');
      }
      if (password.length < 6) {
        throw new Error('Пароль має містити щонайменше 6 символів');
      }

      // console.log('[Register] Creating user with Firebase Auth...');
      // 1) Create the user with email & password
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const { user } = cred;
      // console.log('[Register] User created successfully:', user.uid);

      // 1.5) Встановлюємо displayName для Firebase Auth
      await updateProfile(user, {
        displayName: name.trim()
      });
      // console.log('[Register] Display name set successfully');

      // 2) Створюємо профіль у Firestore
      const profile = {
        uid: user.uid,
        name: name.trim(),
        email: user.email || email,
        country: country.trim(),
        city: city.trim(),
        chatType,
        gender,
        avatar: '', // Спочатку пустий, оновиться пізніше
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      };

      // console.log('[Register] Creating profile in Firestore:', profile);
      await setDoc(doc(db, 'users', user.uid), profile);
      // console.log('[Register] Profile created successfully');

      // 3) Переходимо на /home
      // console.log('[Register] Navigating to /home...');
      navigate('/home');

      // 4) Фоново оновлюємо аватарку (якщо є)

      // 4) Фоново завантажуємо аватарку як стиснене base64 (якщо є) і оновлюємо профіль
      if (avatarFile) {
        (async () => {
          try {
            // console.log('=== REGISTER AVATAR UPLOAD (COMPRESSED BASE64) ===');
            // console.log('File details:', {
            //   name: avatarFile.name,
            //   size: avatarFile.size,
            //   type: avatarFile.type
            // });
            // console.log('User UID:', user.uid);
            
            // Стискаємо зображення
            const compressImage = (file, maxWidth = 150, maxHeight = 150, quality = 0.7) => {
              return new Promise((resolve) => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = () => {
                  let { width, height } = img;
                  if (width > height) {
                    if (width > maxWidth) {
                      height = (height * maxWidth) / width;
                      width = maxWidth;
                    }
                  } else {
                    if (height > maxHeight) {
                      width = (width * maxHeight) / height;
                      height = maxHeight;
                    }
                  }
                  
                  canvas.width = width;
                  canvas.height = height;
                  ctx.drawImage(img, 0, 0, width, height);
                  const base64 = canvas.toDataURL('image/jpeg', quality);
                  resolve(base64);
                };
                
                img.src = URL.createObjectURL(file);
              });
            };
            
            // Завантажуємо оригінальне зображення в Firebase Storage
            // console.log('[Register/bg] Uploading original to Storage...');
            const originalRef = ref(storage, `avatars/${user.uid}/original.jpg`);
            await uploadBytes(originalRef, avatarFile);
            const originalUrl = await getDownloadURL(originalRef);
            // console.log('[Register/bg] Original uploaded, URL:', originalUrl);
            
            // console.log('[Register/bg] Compressing image...');
            const compressedBase64 = await compressImage(avatarFile, 150, 150, 0.7);
            // console.log('[Register/bg] Compression completed, length:', compressedBase64.length);
            
            // Оновлюємо профіль з обома версіями аватарки
            await setDoc(doc(db, 'users', user.uid), {
              avatar: compressedBase64,
              originalAvatarUrl: originalUrl
            }, { merge: true });
            
            // console.log('[Register/bg] Profile updated with compressed base64 avatar.');
          } catch (uploadErr) {
            console.error('[Register/bg] Avatar upload failed:', uploadErr);
          }
        })();
      }
    } catch (err) {
      console.error('[Register] Failed:', err);
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card-register">
      <h2 className="auth-title-register">Register</h2>
      
      {/* Avatar picker centered at top */}
      <div className="avatar-picker" onClick={handleAvatarClick} role="button" aria-label="Upload avatar">
        {avatarFile ? (
          <img src={URL.createObjectURL(avatarFile)} alt="avatar preview" />
        ) : (
          <span className="avatar-plus">+</span>
        )}
      </div>
      
      {/* Hidden file input triggered by clicking the avatar circle */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarChange}
        style={{ display: 'none' }}
      />
      
      <form onSubmit={handleSubmit}>
        <div className="horizontal-form-layout">
          {/* Left column - Name, Email, Password */}
          <div className="form-column left-column">
            <div className="form-group-register">
              <label className="form-label-register">Name</label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden><MdPerson size={18} color="#7b8a97" /></span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="form-input-register" placeholder="Full Name" />
              </div>
            </div>
            <div className="form-group-register">
              <label className="form-label-register">Email</label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden><MdEmail size={18} color="#7b8a97" /></span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="form-input-register" placeholder="you@example.com" />
              </div>
            </div>
            <div className="form-group-register">
              <label className="form-label-register">Password</label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden><RiKey2Fill size={18} color="#7b8a97" /></span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="form-input-register" placeholder="Password" />
              </div>
            </div>
            <div className="form-group-register">
              <label className="form-label-register">Gender</label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden><FaVenusMars size={18} color="#7b8a97" /></span>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="form-select">
                  <option value="man">Man</option>
                  <option value="woman">Woman</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right column - Country, City, Chat Type */}
          <div className="form-column right-column">
            <div className="form-group-register">
              <label className="form-label-register">Country</label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden><MdFlag size={18} color="#7b8a97" /></span>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  onBlur={() => setTimeout(hideSuggestions, 150)}
                  className="form-input-register"
                  placeholder="Country"
                  autoComplete="off"
                />
                {countrySuggestions.length > 0 && (
                  <ul className="suggestion-list" onMouseDown={(e) => e.preventDefault()}>
                    {countrySuggestions.map((c) => (
                      <li key={c.isoCode} className="suggestion-item" onMouseDown={() => { setCountry(c.name); setCountrySuggestions([]); }}>
                        {c.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="form-group-register">
              <label className="form-label-register">City</label>
              <div className="input-wrap">
                <span className="input-icon" aria-hidden><MdLocationCity size={18} color="#7b8a97" /></span>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => handleCityChange(e.target.value)}
                  onBlur={() => setTimeout(hideSuggestions, 150)}
                  className="form-input-register"
                  placeholder="City"
                  autoComplete="off"
                />
                {citySuggestions.length > 0 && (
                  <ul className="suggestion-list" onMouseDown={(e) => e.preventDefault()}>
                    {citySuggestions.map((ci) => (
                      <li key={ci.name} className="suggestion-item" onMouseDown={() => { setCity(ci.name); setCitySuggestions([]); }}>
                        {ci.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="form-group-register">
              <label className="form-label-register">Chat type</label>
              <select value={chatType} onChange={(e) => setChatType(e.target.value)} className="form-select">
                <option value="normal">Normal communication</option>
                <option value="18+">Communication 18+</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bottom section - buttons and links centered */}
        <div className="form-bottom-section">
          <button type="submit" disabled={loading} className="form-submit-register btn-pressable">
            {loading ? 'Creating account and uploading data...' : 'Sign Up'}
          </button>
          
          {error && <p className="error-text">{error}</p>}
          <p className="have-account">Already have an account?</p>
          <div className="link-btn-row-register">
            <Link to="/login" className="link-btn-register btn-pressable">Sign In</Link>
          </div>
        </div>
      </form>
    </div>
  );
}

export default RegisterPage;


