# 🎥 Contact - Video Chat Application

**Contact** is a modern web application for video communication with random people and friends. The app allows users to meet new people through video calls, chat in real-time, and add friends.

## 🌟 **KEY FEATURES**

### 🎲 **Random Video Chat**
- Random video calls with strangers from all over the world
- Filter by country and city
- Skip current call option
- Connection waiting system

### 💬 **Regular Chat**
- Text chat with friends
- File sharing (images, videos, audio, documents)
- Message reactions (emojis)
- Edit and delete messages
- Chat search

### 🎥 **Video Calls**
- Real-time WebRTC video calls
- Camera and microphone control
- Chat during calls
- Add friends during calls

### 👥 **Friends System**
- Add and remove friends
- Friend requests
- Search users by name, country, city
- View user profiles

### 🔍 **Search & Filtering**
- Global user search
- Filter by country, city, chat type
- Autocomplete while typing
- Chat search

## 🛠 **TECHNOLOGIES**

- **Frontend:** React.js, CSS3, HTML5
- **Backend:** Firebase (Firestore, Authentication, Storage)
- **Video Calls:** WebRTC API
- **Styling:** CSS Modules, Responsive Design
- **Icons:** React Icons
- **Routing:** React Router

## 🚀 **QUICK START**

### 1. **Install dependencies:**
```bash
npm install
```

### 2. **Run HTTP version (without camera/microphone):**
```bash
npm start
```
Open: http://localhost:3000

### 3. **Run HTTPS version (with camera/microphone):**
```bash
node src/utils/https-server.js
```
Open: https://localhost:3443

### 4. **For access from other devices:**
```bash
# HTTP
http://YOUR_IP:3000

# HTTPS  
https://YOUR_IP:3443
```

## ⚙️ **FIREBASE SETUP**

1. **Create project on Firebase Console:**
   - https://console.firebase.google.com/
   - Create new project

2. **Configure Firestore Database:**
   - Rules → replace with:
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

3. **Update configuration:**
   - Replace data in `src/utils/firebase.js`

## 📱 **HOW TO USE**

### **Registration:**
1. Enter name, email, password
2. Select country and city
3. Choose chat type (video/audio/text)
4. Upload avatar

### **Random Video Chat:**
1. Go to "Random Chat" tab
2. Click "Start Random Video Chat"
3. Wait for partner connection
4. Chat via video

### **Regular Chat:**
1. Find user through search
2. Click "Chat" to start conversation
3. Send messages, files, emojis
4. Initiate video calls

## 🔧 **PROJECT STRUCTURE**

```
src/
├── components/          # React components
│   ├── ChatInterface/   # Chat interface
│   ├── RandomChat/      # Random video chat
│   ├── VideoCallInterface/ # WebRTC video calls
│   └── ...
├── pages/              # Application pages
├── utils/              # Utilities and configuration
└── App.js              # Main component
```

## 📚 **DOCUMENTATION**

- `CODE_DOCUMENTATION.md` - Detailed code documentation
- `backend_setup.md` - Backend setup
- `create-ssl.sh` - SSL certificates script

## 🌐 **BROWSER SUPPORT**

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 📄 **LICENSE**

MIT License - free use for personal and commercial projects.

---

**Made with ❤️ for communication and meeting new people** 🚀
