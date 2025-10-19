import React, { useState, useEffect } from 'react';
import { Country, City } from 'country-state-city';
import { IoClose, IoLocationOutline } from 'react-icons/io5';
import './FilterModal.css';

function FilterModal({ isOpen, onClose, onApplyFilter, currentFilter }) {
  const [selectedCountry, setSelectedCountry] = useState(currentFilter?.country || '');
  const [selectedCity, setSelectedCity] = useState(currentFilter?.city || '');
  const [countrySuggestions, setCountrySuggestions] = useState([]);
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [showCountrySuggestions, setShowCountrySuggestions] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  // Завантажуємо поточний фільтр при відкритті
  useEffect(() => {
    if (isOpen && currentFilter) {
      setSelectedCountry(currentFilter.country || '');
      setSelectedCity(currentFilter.city || '');
    }
  }, [isOpen, currentFilter]);

  // Закриваємо модальне вікно клавішею Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleCountryChange = (value) => {
    setSelectedCountry(value);
    setSelectedCity(''); // Скидаємо місто при зміні країни
    
    if (value.trim().length > 0) {
      const suggestions = Country.getAllCountries()
        .filter(c => c.name.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 10);
      setCountrySuggestions(suggestions);
      setShowCountrySuggestions(true);
    } else {
      setCountrySuggestions([]);
      setShowCountrySuggestions(false);
    }
  };

  const handleCityChange = (value) => {
    setSelectedCity(value);
    
    if (value.trim().length > 0 && selectedCountry) {
      const countryCode = Country.getAllCountries().find(c => 
        c.name.toLowerCase() === selectedCountry.toLowerCase()
      )?.isoCode;
      
      if (countryCode) {
        const suggestions = City.getCitiesOfCountry(countryCode)
          .filter(c => c.name.toLowerCase().includes(value.toLowerCase()))
          .slice(0, 10);
        setCitySuggestions(suggestions);
        setShowCitySuggestions(true);
      }
    } else {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    }
  };

  const selectCountry = (country) => {
    setSelectedCountry(country.name);
    setSelectedCity('');
    setShowCountrySuggestions(false);
    setCitySuggestions([]);
    setShowCitySuggestions(false);
  };

  const selectCity = (city) => {
    setSelectedCity(city.name);
    setShowCitySuggestions(false);
  };

  const handleApply = () => {
    const filter = {
      country: selectedCountry.trim(),
      city: selectedCity.trim()
    };
    onApplyFilter(filter);
    onClose();
  };

  const handleClear = () => {
    setSelectedCountry('');
    setSelectedCity('');
    setCountrySuggestions([]);
    setCitySuggestions([]);
    setShowCountrySuggestions(false);
    setShowCitySuggestions(false);
  };

  const handleClose = () => {
    // Відновлюємо початкові значення при закритті
    setSelectedCountry(currentFilter?.country || '');
    setSelectedCity(currentFilter?.city || '');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="random-chat-filter-overlay" onClick={handleClose}>
      <div className="random-chat-filter-modal" onClick={(e) => e.stopPropagation()}>
        <div className="random-chat-filter-header">
          <h3>
            <IoLocationOutline />
            Filter by Location
          </h3>
          <button className="random-chat-filter-close-btn" onClick={handleClose}>
            <IoClose />
          </button>
        </div>

        <div className="random-chat-filter-content">
          <div className="random-chat-filter-field">
            <label>Country</label>
            <div className="random-chat-filter-input-container">
              <input
                type="text"
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                onFocus={() => selectedCountry && setShowCountrySuggestions(true)}
                placeholder="Select country..."
                className="random-chat-filter-input"
              />
              {showCountrySuggestions && countrySuggestions.length > 0 && (
                <ul className="random-chat-filter-suggestions">
                  {countrySuggestions.map((country) => (
                    <li
                      key={country.isoCode}
                      onClick={() => selectCountry(country)}
                      className="random-chat-filter-suggestion-item"
                    >
                      {country.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="random-chat-filter-field">
            <label>City</label>
            <div className="random-chat-filter-input-container">
              <input
                type="text"
                value={selectedCity}
                onChange={(e) => handleCityChange(e.target.value)}
                onFocus={() => selectedCity && setShowCitySuggestions(true)}
                placeholder="Select city..."
                className="random-chat-filter-input"
                disabled={!selectedCountry}
              />
              {showCitySuggestions && citySuggestions.length > 0 && (
                <ul className="random-chat-filter-suggestions">
                  {citySuggestions.map((city) => (
                    <li
                      key={city.id}
                      onClick={() => selectCity(city)}
                      className="random-chat-filter-suggestion-item"
                    >
                      {city.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="random-chat-filter-info">
            <p>
              <strong>How it works:</strong> You'll only match with people from the selected country and city. 
              Leave empty to match with anyone worldwide.
            </p>
          </div>
        </div>

        <div className="random-chat-filter-footer">
          <button className="random-chat-filter-apply-btn" onClick={handleApply}>
            Apply Filter
          </button>
          <button className="random-chat-filter-clear-btn" onClick={handleClear}>
            Clear Filter
          </button>
        </div>
      </div>
    </div>
  );
}

export default FilterModal;
