// ========================================
// STREAMTRACKER - ТРЕКЕР МЕДІА ПОТОКІВ
// ========================================
// Цей файл реалізує централізоване управління медіа потоками
// ВИКОРИСТОВУЄТЬСЯ В: VideoCallInterface.js, RandomChat.js, ChatInterface.js
//
// ПРОБЛЕМА, ЯКУ ВИРІШУЄ:
// - Камера продовжувала працювати після завершення дзвінків
// - Витоки пам'яті через неочищені медіа потоки
// - Складність управління потоками в різних компонентах
//
// ОСНОВНІ ФУНКЦІЇ:
// 1. 📊 Відстеження всіх активних медіа потоків
// 2. 🛑 Централізована зупинка всіх потоків
// 3. 🧹 Очищення ресурсів для запобігання витокам пам'яті
// 4. 📈 Моніторинг кількості активних потоків
//
// КЛЮЧОВІ МЕТОДИ:
// - addStream(): додати потік до трекера
// - removeStream(): видалити потік з трекера
// - stopAllStreams(): зупинити всі потоки
// - getActiveStreamCount(): отримати кількість активних потоків

// Клас для управління медіа потоками
class StreamTracker {
  constructor() {
    // Set для зберігання всіх активних потоків
    this.activeStreams = new Set();
  }

  // Додати потік до трекера
  addStream(stream) {
    if (stream && stream.getTracks) {
      this.activeStreams.add(stream);
      // console.log('StreamTracker: Added stream, total active:', this.activeStreams.size);
    }
  }

  // Видалити потік з трекера
  removeStream(stream) {
    if (stream) {
      this.activeStreams.delete(stream);
      // console.log('StreamTracker: Removed stream, total active:', this.activeStreams.size);
    }
  }

  // Зупинити всі активні потоки
  stopAllStreams() {
    // console.log('StreamTracker: Stopping all active streams, count:', this.activeStreams.size);
    
    // Перебираємо всі потоки та зупиняємо їх треки
    this.activeStreams.forEach(stream => {
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(track => {
          track.stop(); // Зупиняємо кожен трек (відео/аудіо)
          // console.log('StreamTracker: Stopped track:', track.kind);
        });
      }
    });
    
    // Очищуємо Set після зупинки всіх потоків
    this.activeStreams.clear();
    // console.log('StreamTracker: All streams stopped and cleared');
  }

  // Отримати кількість активних потоків
  getActiveStreamCount() {
    return this.activeStreams.size;
  }
}

// Глобальний екземпляр трекера (Singleton pattern)
const streamTracker = new StreamTracker();

// Експортуємо єдиний екземпляр для використання в інших файлах
export default streamTracker;
