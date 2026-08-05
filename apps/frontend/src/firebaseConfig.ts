// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// IMPORTANT: Replace these with your actual Firebase project configuration.
const firebaseConfig = {
  apiKey: "AIzaSyBNubXGVv6aHykbdFsB4kR0BNDZkoyCewI",
  authDomain: "beike-e6301.firebaseapp.com",
  databaseURL: "https://beike-e6301-default-rtdb.firebaseio.com",
  projectId: "beike-e6301",
  storageBucket: "beike-e6301.firebasestorage.app",
  messagingSenderId: "889627047453",
  appId: "1:889627047453:web:f4f27acf754f8cff05b8f4",
  measurementId: "G-B92HLJ8J15"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
