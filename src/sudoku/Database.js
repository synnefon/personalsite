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
const interactWithDb = promise => wrapPromise(promise, 3_000, "FirebaseError: database timeout");

export const signInUser = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (user && user !== undefined) return user.uid;

  const provider = new GoogleAuthProvider();
  return wrapPromise(signInWithPopup(auth, provider),)
    .then(result => result.user.uid);
}

export const writeBoard = async (userId, boardStr) => {
  const dbRef = ref(getDatabase(app), `boards/${userId}`);
  return interactWithDb(set(dbRef, String(boardStr)))
    .then(result => result.user.uid);
}

export const getBoard = async (userId) => {
  const dbRef = ref(getDatabase(app));
  return interactWithDb(get(child(dbRef, `boards/${userId}`)))
    .then((snapshot) => snapshot.val());
}
