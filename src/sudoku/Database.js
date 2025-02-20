import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getDatabase, ref, set, get, child } from "firebase/database";
import { initializeApp } from 'firebase/app';


// TODO: Replace the following with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDRjIzCoEJpa7CW_BBFrvaGjYexHxg_w6s",
  authDomain: "personalsite-sudoku.firebaseapp.com",
  databaseURL: "https://personalsite-sudoku-default-rtdb.firebaseio.com",
  projectId: "personalsite-sudoku",
  storageBucket: "personalsite-sudoku.firebasestorage.app",
  messagingSenderId: "751374588681",
  appId: "1:751374588681:web:523786a9b65adaad79d1d8",
  measurementId: "G-ZE7W1PL9ED"
};
const app = initializeApp(firebaseConfig);

const awaitTimeout = (delay, reason) =>
  new Promise((resolve, reject) =>
    setTimeout(
      () => (reason === undefined ? resolve() : reject(reason)),
      delay
    )
  );

const wrapPromise = (promise, delay, reason) => Promise.race([promise, awaitTimeout(delay, reason)]);
const interactWithDb = promise => {
  return wrapPromise(promise, 3_000, "FirebaseError: database timeout")
};

const getUserId = () => getAuth()?.currentUser?.uid;

export const signInUser = async () => {
  const auth = getAuth();
  const user = auth.currentUser;

  if (user && user !== undefined && user?.uid) return user.uid;

  const provider = new GoogleAuthProvider();
  return interactWithDb(signInWithPopup(auth, provider));
}

export const writeBoard = async (boardStr) => {
  const uid = getUserId();
  if (!uid) return "Error: failed to authenticate user";
  const dbRef = ref(getDatabase(app), `boards/${uid}`);
  return interactWithDb(set(dbRef, String(boardStr)));
}

export const getBoard = async () => {
  const uid = getUserId();
  if (!uid) return "Error: failed to authenticate user";
  const dbRef = ref(getDatabase(app));
  return interactWithDb(get(child(dbRef, `boards/${uid}`)));
}
