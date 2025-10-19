# Contact App - Налаштування

## Швидкий запуск

### Локальний запуск:
```bash
# macOS/Linux
./start.sh

# Windows
start.bat
```

### Віддалений запуск (192.168.50.125:3443):
```bash
# ПРОСТИЙ СПОСІБ (рекомендовано)
./start-simple.sh          # macOS/Linux - HTTPS з автоматичним SSL
start-simple.bat           # Windows - HTTPS з автоматичним SSL

# Альтернативні способи
./start-remote.sh          # HTTP версія
./start-https.sh           # HTTPS версія
./create-ssl.sh            # Створити новий SSL сертифікат
```

### Ручний запуск:
```bash
npm install
npm start
```

## Проблема: Не працює пошук та не відображаються дані

### Рішення: Налаштуйте правила Firestore

1. **Відкрийте Firebase Console:**
   - https://console.firebase.google.com/
   - Виберіть проект "contact-18"

2. **Перейдіть до Firestore Database:**
   - Ліве меню → "Firestore Database"
   - Вкладка "Rules"

3. **Замініть правила на:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

4. **Натисніть "Publish"**

### Після налаштування:
- Зареєструйте двох користувачів
- Спробуйте пошук на головній сторінці
- Перевірте профіль користувача

### Якщо не працює:
- Відкрийте консоль браузера (F12)
- Подивіться чи є помилки "Permission denied"
- Перевірте чи є користувачі в Firebase Console → Firestore → Data

## Додаткові файли

- `SETUP_INSTRUCTIONS.md` - Детальні інструкції для налаштування на новому пристрої
- `REMOTE_SETUP.md` - Інструкції для запуску на віддаленому пристрої (192.168.50.125:3443)
- `start.sh` - Скрипт локального запуску для macOS/Linux
- `start.bat` - Скрипт локального запуску для Windows
- `start-remote.sh` - Скрипт віддаленого запуску (HTTP) для macOS/Linux
- `start-remote.bat` - Скрипт віддаленого запуску (HTTP) для Windows
- `start-https.sh` - Скрипт віддаленого запуску (HTTPS) для macOS/Linux
- `start-simple.sh` - **ПРОСТИЙ** скрипт запуску (HTTPS) для macOS/Linux
- `start-simple.bat` - **ПРОСТИЙ** скрипт запуску (HTTPS) для Windows
- `create-ssl.sh` - Скрипт створення SSL сертифіката
- `SSL_INSTRUCTIONS.md` - Інструкції для роботи з SSL сертифікатом
- `src/utils/https-server.js` - HTTPS сервер з автоматичним SSL

## Останні зміни

✅ **Виправлено стилі відеозвінку в RandomChat:**
- Видалено дублювання компонента VideoCallInterface
- Покращено стилі чату для кращого відображення
- Додано правильне позиціонування елементів інтерфейсу

✅ **Додано скрипти для швидкого запуску:**
- Автоматична перевірка залежностей
- Перевірка конфігурації Firebase
- Простий запуск одним скриптом

✅ **Додано підтримку віддаленого запуску:**
- Запуск на IP 192.168.50.125:3443
- HTTP та HTTPS версії
- Автоматичне створення SSL сертифікатів
- Детальні інструкції для налаштування мережі

✅ **Виправлено проблему з SSL сертифікатом:**
- Створено правильний SSL сертифікат з Subject Alternative Name
- Додано інструкції для обходу попередження браузера
- Створено скрипт для створення нового сертифіката

✅ **Додано ПРОСТИЙ спосіб запуску:**
- Використовується існуючий `https-server.js`
- Автоматичне створення SSL сертифіката
- Один скрипт для запуску: `./start-simple.sh`
- Підтримка Windows: `start-simple.bat`