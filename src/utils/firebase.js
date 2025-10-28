// ========================================
// КОНФІГУРАЦІЯ FIREBASE - firebase.js
// ========================================
// Цей файл налаштовує підключення до Firebase сервісів
// ВИКОРИСТОВУЄТЬСЯ В: Всіх компонентах, що працюють з базою даних
//
// ОСНОВНІ ФУНКЦІЇ:
// 1. 🔧 Ініціалізація Firebase проекту
// 2. 🔐 Налаштування Authentication (авторизація користувачів)
// 3. 🗄️ Налаштування Firestore (база даних)
// 4. 📁 Налаштування Storage (збереження файлів)
//
// ЕКСПОРТУЄ:
// - auth: об'єкт для авторизації користувачів
// - db: об'єкт для роботи з базою даних Firestore
// - storage: об'єкт для збереження файлів

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Конфігурація Firebase проекту
const firebaseConfig = {
  
};

// Ініціалізація Firebase додатку
const app = initializeApp(firebaseConfig);

// Отримання сервісів Firebase
const auth = getAuth(app);        // Сервіс авторизації
const db = getFirestore(app);     // База даних Firestore
const storage = getStorage(app);  // Сервіс збереження файлів

// Експорт сервісів для використання в інших файлах
export { auth, db, storage };
