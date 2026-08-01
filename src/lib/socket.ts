import { io, type Socket } from 'socket.io-client';
import { getToken, notifySessionExpired } from './api';
import { resolveWsUrl } from './runtime-urls';

let socket: Socket | null = null;
let lastToken: string | null = null;

function bindSessionGuard(s: Socket) {
  s.off('auth.session_replaced');
  s.on('auth.session_replaced', () => {
    notifySessionExpired(
      'Sessão encerrada — este usuário entrou em outro navegador ou aba',
    );
  });
}

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  const token = getToken();

  if (socket) {
    socket.auth = { token };
    bindSessionGuard(socket);
    if (lastToken !== token) {
      lastToken = token;
      // Troca de sessão: derruba e reconecta com o token novo.
      socket.disconnect();
      socket.connect();
      return socket;
    }
    lastToken = token;
    // Mesmo token, mas socket caiu (restart da API, rede, etc.) — reconectar.
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  socket = io(resolveWsUrl(), {
    autoConnect: true,
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });
  bindSessionGuard(socket);
  lastToken = token;
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.off('auth.session_replaced');
    socket.disconnect();
    socket = null;
    lastToken = null;
  }
}

export function reconnectSocketWithToken() {
  disconnectSocket();
  if (getToken()) connectSocket();
}
