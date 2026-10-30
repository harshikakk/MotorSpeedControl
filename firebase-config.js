// ============================================================================
// SPARK DRIVES & AUTOMATION - INDUSTRIAL IoT PLATFORM
// Firebase Configuration & Initialization
// ============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyDO0rx7hqD3LhcWKnmQT2MLaAlxQKhNZvc",
  authDomain: "harshini-feb82.firebaseapp.com",
  databaseURL: "https://harshini-feb82-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "harshini-feb82",
  storageBucket: "harshini-feb82.firebasestorage.app",
  messagingSenderId: "793321449920",
  appId: "1:793321449920:web:a8f50f15d6db63b33d8025",
  measurementId: "G-ZZFV881LVW"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Export references to global scope
const auth = firebase.auth();
const rtdb = firebase.database();

window.SparkFirebase = {
  app: firebase.app(),
  auth: auth,
  rtdb: rtdb,
  config: firebaseConfig
};
