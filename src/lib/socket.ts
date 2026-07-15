import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

let socket: Socket | null = null;
let lastToken: string | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  const token = getToken();
  if (socket?.connected && lastToken === token) return socket;

  if (socket) {
    socket.auth = { token };
    if (lastToken !== token) {
      socket.disconnect();
      socket.connect();
    }
    lastToken = token;
    return socket;
  }

  socket = io(WS_URL, {
    autoConnect: true,
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  lastToken = token;
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    lastToken = null;
  }
}

export function reconnectSocketWithToken() {
  disconnectSocket();
  if (getToken()) connectSocket();
}
