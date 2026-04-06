window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// No-login cloud sync note:
// 1) Fill FIREBASE_CONFIG values from Firebase project settings.
// 2) Enable Firestore in Native mode.
// 3) Temporarily allow read/write (or restrict by your own rules) for collection: proxy_history_shared
