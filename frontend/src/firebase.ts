// Firebase is exclusively the live-chat transport. Marketplace identity belongs to FastAPI.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import * as API from './api';
import type { Message } from './model';
const config = { apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID };
export const configured = Boolean(config.apiKey && config.projectId && config.appId);
const app = configured ? initializeApp(config) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
export async function connect() {
    if (!auth)
        throw new Error('Firebase chat configuration is missing. Marketplace features remain available.');
    const result = await API.request<{
        token: string;
    }>('/chat/token', 'POST');
    await signInWithCustomToken(auth, result.token);
}
export async function disconnect() { if (auth)
    await signOut(auth); }
export function listenMessages(userId: string, next: (messages: Message[]) => void, error: (e: Error) => void) {
    if (!db)
        return () => { };
    return onSnapshot(query(collection(db, 'messages'), where('participants', 'array-contains', userId)), snapshot => next(snapshot.docs.filter(d => d.data().sentAt).map(d => { const value = d.data(); return { id: d.id, senderId: value.senderId, recipientId: value.recipientId, text: value.text, date: value.sentAt.toDate().toISOString() }; })), error);
}
export function listenConversations(userId: string, next: (contacts: {
    id: string;
    name: string;
}[]) => void, error: (e: Error) => void) {
    if (!db)
        return () => { };
    return onSnapshot(query(collection(db, 'conversations'), where('participants', 'array-contains', userId)), snapshot => next(snapshot.docs.map(d => { const v = d.data(); const id = v.participants.find((p: string) => p !== userId); return { id, name: v.names[id] || 'Marketplace member' }; })), error);
}
export async function send(message: Message) {
    if (!db || !auth?.currentUser)
        throw new Error('Connect live chat before sending a message.');
    const conversation = await API.request<{
        id: string;
    }>('/chat/conversations', 'POST', { recipientId: message.recipientId });
    await setDoc(doc(db, 'messages', message.id), { id: message.id, conversationId: conversation.id, senderId: message.senderId, recipientId: message.recipientId, participants: [message.senderId, message.recipientId], text: message.text, sentAt: serverTimestamp() });
}
