import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';

export type InternalChatMediaType = 'TEXT' | 'IMAGE' | 'AUDIO';

export interface InternalChatPeer {
  id: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  status?: string;
  role?: string;
  isActive?: boolean;
}

export interface InternalChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: InternalChatMediaType;
  mediaUrl: string | null;
  createdAt: string;
  sender?: InternalChatPeer;
  _optimistic?: boolean;
  _failed?: boolean;
}

export interface InternalConversationItem {
  id: string | null;
  kind: 'GENERAL' | 'DIRECT';
  title: string;
  peer: InternalChatPeer | null;
  lastMessage: {
    id: string;
    body: string;
    type: InternalChatMediaType;
    mediaUrl: string | null;
    senderId: string;
    createdAt: string;
    sender?: InternalChatPeer;
  } | null;
  unreadCount: number;
  online: boolean;
}

interface ConversationsResponse {
  conversations: InternalConversationItem[];
  onlineUserIds: string[];
  totalUnread: number;
}

function selectionKey(c: InternalConversationItem): string {
  if (c.kind === 'GENERAL') return 'general';
  return `peer:${c.peer?.id ?? c.id ?? ''}`;
}

export function useInternalChat(myUserId: string | undefined) {
  const [conversations, setConversations] = useState<InternalConversationItem[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [totalUnread, setTotalUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<InternalChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>('general');
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const selectedRef = useRef(selectedKey);
  const conversationsRef = useRef(conversations);
  selectedRef.current = selectedKey;
  conversationsRef.current = conversations;

  const selected = conversations.find((c) => selectionKey(c) === selectedKey) ?? null;

  const refetchConversations = useCallback(async () => {
    const data = await api<ConversationsResponse>('/internal-chat/conversations');
    setConversations(data.conversations);
    setOnlineUserIds(new Set(data.onlineUserIds ?? []));
    setTotalUnread(data.totalUnread ?? 0);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refetchConversations()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refetchConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const data = await api<{ messages: InternalChatMessage[] }>(
        `/internal-chat/messages?conversationId=${encodeURIComponent(conversationId)}`,
      );
      setMessages(
        data.messages.map((m) => ({
          ...m,
          createdAt:
            typeof m.createdAt === 'string'
              ? m.createdAt
              : new Date(m.createdAt as unknown as string).toISOString(),
        })),
      );
      await api(`/internal-chat/conversations/${conversationId}/read`, {
        method: 'POST',
      });
      await refetchConversations();
    } finally {
      setMessagesLoading(false);
    }
  }, [refetchConversations]);

  useEffect(() => {
    if (!selected?.id) {
      setMessages([]);
      return;
    }
    const socket = connectSocket();
    socket.emit('joinInternal', selected.id);
    void loadMessages(selected.id);
    return () => {
      socket.emit('leaveInternal', selected.id);
    };
  }, [selected?.id, loadMessages]);

  useEffect(() => {
    if (!myUserId) return;
    const socket = connectSocket();

    const onMessage = (payload: {
      conversation?: { id: string; kind: string; pairKey: string };
      message?: InternalChatMessage;
    }) => {
      const msg = payload.message;
      const conv = payload.conversation;
      if (!msg || !conv) return;

      const createdAt =
        typeof msg.createdAt === 'string'
          ? msg.createdAt
          : new Date(msg.createdAt as unknown as string).toISOString();
      const normalized = { ...msg, createdAt, conversationId: conv.id };

      const sel = conversationsRef.current.find(
        (c) => selectionKey(c) === selectedRef.current,
      );
      const isActive =
        sel?.id === conv.id ||
        (sel?.kind === 'GENERAL' && conv.kind === 'GENERAL') ||
        (sel?.kind === 'DIRECT' &&
          sel.peer &&
          conv.pairKey.includes(sel.peer.id) &&
          conv.pairKey.includes(myUserId));

      if (isActive) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === normalized.id)) return prev;
          const withoutOptimistic = prev.filter(
            (m) =>
              !(
                m._optimistic &&
                m.senderId === normalized.senderId &&
                m.body === normalized.body &&
                m.type === normalized.type
              ),
          );
          return [...withoutOptimistic, normalized];
        });
        void api(`/internal-chat/conversations/${conv.id}/read`, {
          method: 'POST',
        }).then(() => refetchConversations());
      } else {
        void refetchConversations();
      }
    };

    const onPresence = (payload: { userId?: string; online?: boolean }) => {
      if (!payload.userId) return;
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (payload.online) next.add(payload.userId!);
        else next.delete(payload.userId!);
        return next;
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.peer?.id === payload.userId
            ? { ...c, online: Boolean(payload.online) }
            : c,
        ),
      );
    };

    const onTyping = (payload: {
      conversationId?: string;
      userId?: string;
      typing?: boolean;
    }) => {
      if (!payload.conversationId || !payload.userId) return;
      if (payload.userId === myUserId) return;
      const sel = conversationsRef.current.find(
        (c) => selectionKey(c) === selectedRef.current,
      );
      if (sel?.id !== payload.conversationId) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (payload.typing) next[payload.userId!] = payload.userId!;
        else delete next[payload.userId!];
        return next;
      });
    };

    socket.on('internal.message.created', onMessage);
    socket.on('internal.presence', onPresence);
    socket.on('internal.typing', onTyping);

    return () => {
      socket.off('internal.message.created', onMessage);
      socket.off('internal.presence', onPresence);
      socket.off('internal.typing', onTyping);
    };
  }, [myUserId, refetchConversations]);

  const selectConversation = (item: InternalConversationItem) => {
    setSelectedKey(selectionKey(item));
    setTypingUsers({});
  };

  const emitTyping = useCallback(
    (typing: boolean) => {
      if (!selected?.id) return;
      connectSocket().emit('internal.typing', {
        conversationId: selected.id,
        typing,
      });
    },
    [selected?.id],
  );

  const sendMessage = async (input: {
    body?: string;
    type?: InternalChatMediaType;
    mediaUrl?: string;
  }) => {
    if (!myUserId) return;

    const tempId = `opt-${Date.now()}`;
    const type = input.type ?? 'TEXT';
    const optimistic: InternalChatMessage = {
      id: tempId,
      conversationId: selected?.id ?? '',
      senderId: myUserId,
      body: input.body ?? '',
      type,
      mediaUrl: input.mediaUrl ?? null,
      createdAt: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const body: Record<string, unknown> = {
        type,
        body: input.body ?? '',
        mediaUrl: input.mediaUrl,
      };
      if (selected?.id) {
        body.conversationId = selected.id;
      } else if (selected?.peer?.id) {
        body.peerUserId = selected.peer.id;
      }

      const res = await api<{
        conversation: { id: string; kind: string; pairKey: string };
        message: InternalChatMessage;
      }>('/internal-chat/messages', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const createdAt =
        typeof res.message.createdAt === 'string'
          ? res.message.createdAt
          : new Date(res.message.createdAt as unknown as string).toISOString();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...res.message, createdAt, conversationId: res.conversation.id }
            : m,
        ),
      );

      await refetchConversations();
      if (!selected?.id && res.conversation.id) {
        setSelectedKey(
          res.conversation.kind === 'GENERAL'
            ? 'general'
            : `peer:${selected?.peer?.id ?? ''}`,
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, _failed: true } : m)),
      );
      throw new Error('Falha ao enviar');
    }
  };

  return {
    conversations,
    onlineUserIds,
    totalUnread,
    loading,
    messages,
    messagesLoading,
    selected,
    typingUserIds: Object.keys(typingUsers),
    selectConversation,
    sendMessage,
    emitTyping,
    refetchConversations,
  };
}
