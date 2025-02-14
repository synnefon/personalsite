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

export const signInUser = async () => {
  const provider = new GoogleAuthProvider();
  const auth = getAuth();
  return await signInWithPopup(auth, provider)
    .then((result) => result.user.uid)
    .catch((error) => console.log(error));
}

export const writeBoard = async (userId, boardStr) => {
  const db = getDatabase(app);
  await set(ref(db, `boards/${userId}`), String(boardStr))
    .catch(e => console.log(e));
}

export const getBoard = async (userId) => {
  const dbRef = ref(getDatabase());
  return await get(child(dbRef, `boards/${userId}`)).then((snapshot) => {
    if (snapshot.exists()) {
      return snapshot.val();
    } else {
      console.log("No data available");
    }
  }).catch((error) => {
    console.error(error);
  });
}
