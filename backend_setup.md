# Налаштування Cloud Function для перманентного видалення акаунтів

Цей документ пояснює, як налаштувати серверну функцію (Cloud Function) у вашому Firebase проекті для автоматичного та перманентного видалення акаунтів, які були помічені для видалення.

## Крок 1: Налаштування Firebase CLI та ініціалізація функцій

Якщо ви ще не встановили Firebase CLI, зробіть це:
```bash
npm install -g firebase-tools
```

Увійдіть у свій Firebase акаунт:
```bash
firebase login
```

Перейдіть до кореневої папки вашого проекту та ініціалізуйте Cloud Functions:
```bash
firebase init functions
```
-   Оберіть існуючий проект (Use an existing project).
-   Оберіть мову `JavaScript`.
-   Погодьтеся на встановлення залежностей.

Після ініціалізації у вас з'явиться папка `functions` з файлами `index.js` та `package.json`.

## Крок 2: Додавання коду Cloud Function

Відкрийте файл `functions/index.js` і замініть його вміст наступним кодом:

```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

/**
 * Ця функція запускається автоматично кожні 24 години.
 * Вона шукає користувачів, у яких:
 * 1. Статус видалення `pending_deletion`.
 * 2. Дата запланованого видалення (`scheduledDeletionAt`) вже минула.
 *
 * Для знайдених користувачів вона перманентно видаляє:
 * - Запис з Firebase Authentication.
 * - Документ з колекції 'users' у Firestore.
 */
exports.cleanupDeletedUsers = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();

    // Запит для пошуку акаунтів, які потрібно видалити
    const query = db.collection('users')
        .where('deletionInfo.status', '==', 'pending_deletion')
        .where('deletionInfo.scheduledDeletionAt', '<=', now);

    const usersToDelete = await query.get();

    if (usersToDelete.empty) {
        console.log("No users to permanently delete.");
        return null;
    }

    const promises = [];

    usersToDelete.forEach(doc => {
        const uid = doc.id;
        console.log(`Permanently deleting user: ${uid}`);

        // Видалення з Firebase Authentication
        const deleteAuthPromise = admin.auth().deleteUser(uid)
            .catch(err => console.error(`Failed to delete auth user ${uid}:`, err));

        // Видалення з Firestore
        const deleteFirestorePromise = doc.ref.delete()
            .catch(err => console.error(`Failed to delete firestore user ${uid}:`, err));

        promises.push(deleteAuthPromise, deleteFirestorePromise);
    });

    await Promise.all(promises);
    console.log(`Permanently deleted ${usersToDelete.size} users.`);
    return null;
});
```

## Крок 3: Оновлення правил безпеки Firestore (Рекомендовано)

Щоб користувач не міг сам скасувати своє видалення, оновіть правила безпеки Firestore (`firestore.rules`). Додайте перевірку, що поле `deletionInfo` не може бути змінено користувачем.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId
        && !(request.resource.data.keys().hasAny(['deletionInfo'])); // Забороняємо користувачу змінювати поле deletionInfo
    }
    // ... ваші інші правила
  }
}
```

**Увага:** Це базове правило. Вам може знадобитися адаптувати його під вашу поточну логіку.

## Крок 4: Деплой функції

Після збереження файлу `index.js`, завантажте функцію на сервери Firebase:

```bash
firebase deploy --only functions
```

Після успішного деплою функція буде автоматично перевіряти та видаляти акаунти раз на добу.

**Важливо:** Для роботи Cloud Functions ваш Firebase проект повинен бути оновлений до плану "Blaze" (Pay-as-you-go). Однак, безкоштовного ліміту Cloud Functions, як правило, більш ніж достатньо для таких завдань, і ви не будете платити, якщо не перевищите його.
