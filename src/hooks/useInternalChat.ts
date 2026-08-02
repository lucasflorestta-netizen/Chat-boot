import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import type { Message, MessageType, Profile } from '../types';

export type InternalChatMediaType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'FILE'
  | 'VIDEO'
  | 'STICKER';

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
  mediaName?: string | null;
  replyToId?: string | null;
  isEdited?: boolean;
  originalBody?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  sender?: InternalChatPeer;
  replyTo?: InternalChatMessage | null;
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
    mediaName?: string | null;
    senderId: string;
    createdAt: string;
    deletedAt?: string | null;
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

function normalizeDate(value: unknown): string {
  if (typeof value === 'string') return value;
  return new Date(value as string).toISOString();
}

function normalizeMessage(m: InternalChatMessage): InternalChatMessage {
  return {
    ...m,
    createdAt: normalizeDate(m.createdAt),
    deletedAt: m.deletedAt ? normalizeDate(m.deletedAt) : m.deletedAt,
    replyTo: m.replyTo
      ? {
          ...m.replyTo,
          createdAt: m.replyTo.createdAt
            ? normalizeDate(m.replyTo.createdAt)
            : m.replyTo.createdAt,
        }
      : m.replyTo,
  };
}

function toMediaType(type: InternalChatMediaType): MessageType {
  switch (type) {
    case 'IMAGE':
      return 'image';
    case 'AUDIO':
      return 'audio';
    case 'FILE':
      return 'file';
    case 'VIDEO':
      return 'video';
    case 'STICKER':
      return 'sticker';
    default:
      return 'text';
  }
}

function peerToProfile(peer?: InternalChatPeer | null): Profile | null {
  if (!peer) return null;
  return {
    id: peer.id,
    name: peer.name?.trim() || peer.username,
    username: peer.username,
    email: null,
    role: 'agent',
    apiRole: peer.role ?? 'OPERATOR',
    department: 'support',
    sectorIds: [],
    sectors: [],
    max_concurrent_chats: 0,
    ramal: null,
    work_start: null,
    work_end: null,
    lunch_start: null,
    lunch_end: null,
    lunch_return_required: false,
    status: 'DISPONIVEL',
    avatar_url: peer.avatarUrl,
    is_active: peer.isActive ?? true,
    created_at: '',
  };
}

/** Map internal message → shared Message shape for MessageBubble / Composer. */
export function toUiMessage(
  m: InternalChatMessage,
  myUserId: string | undefined,
): Message {
  const mine = m.senderId === myUserId;
  const deleted = Boolean(m.deletedAt);
  return {
    id: m.id,
    ticket_id: m.conversationId,
    sender_type: mine ? 'agent' : 'client',
    sender_id: m.senderId,
    body: deleted ? null : m.body || null,
    media_type: toMediaType(m.type),
    media_url: deleted ? null : m.mediaUrl,
    media_name: deleted
      ? null
      : m.mediaName || (m.type === 'FILE' ? m.body || null : null),
    is_deleted: deleted,
    deleted_by_client: false,
    deleted_for_client: false,
    is_edited: Boolean(m.isEdited) && !deleted,
    original_body: m.originalBody ?? null,
    whatsapp_delivered: true,
    whatsapp_message_id: null,
    reply_to_message_id: m.replyToId ?? m.replyTo?.id ?? null,
    created_at: m.createdAt,
    sender: peerToProfile(m.sender),
    reply_to: m.replyTo ? toUiMessage(m.replyTo, myUserId) : null,
    _localStatus: m._failed ? 'failed' : m._optimistic ? 'sending' : undefined,
  };
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

  const loadMessages = useCallback(
    async (conversationId: string) => {
      setMessagesLoading(true);
      try {
        const data = await api<{ messages: InternalChatMessage[] }>(
          `/internal-chat/messages?conversationId=${encodeURIComponent(conversationId)}`,
        );
        setMessages(data.messages.map(normalizeMessage));
        await api(`/internal-chat/conversations/${conversationId}/read`, {
          method: 'POST',
        });
        await refetchConversations();
      } finally {
        setMessagesLoading(false);
      }
    },
    [refetchConversations],
  );

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

  const isActiveConversation = useCallback(
    (conv: { id: string; kind: string; pairKey: string }) => {
      const sel = conversationsRef.current.find(
        (c) => selectionKey(c) === selectedRef.current,
      );
      return (
        sel?.id === conv.id ||
        (sel?.kind === 'GENERAL' && conv.kind === 'GENERAL') ||
        (sel?.kind === 'DIRECT' &&
          !!sel.peer &&
          !!myUserId &&
          conv.pairKey.includes(sel.peer.id) &&
          conv.pairKey.includes(myUserId))
      );
    },
    [myUserId],
  );

  useEffect(() => {
    if (!myUserId) return;
    const socket = connectSocket();

    const onMessageCreated = (payload: {
      conversation?: { id: string; kind: string; pairKey: string };
      message?: InternalChatMessage;
    }) => {
      const msg = payload.message;
      const conv = payload.conversation;
      if (!msg || !conv) return;
      const normalized = {
        ...normalizeMessage(msg),
        conversationId: conv.id,
      };

      if (isActiveConversation(conv)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === normalized.id)) return prev;
          const withoutOptimistic = prev.filter(
            (m) =>
              !(
                m._optimistic &&
                m.senderId === normalized.senderId &&
                m.body === normalized.body &&
                m.type === normalized.type &&
                m.mediaUrl === normalized.mediaUrl
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

    const onMessageUpdated = (payload: {
      conversation?: { id: string; kind: string; pairKey: string };
      message?: InternalChatMessage;
    }) => {
      const msg = payload.message;
      const conv = payload.conversation;
      if (!msg || !conv) return;
      const normalized = {
        ...normalizeMessage(msg),
        conversationId: conv.id,
      };
      if (isActiveConversation(conv)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === normalized.id ? normalized : m)),
        );
      }
      void refetchConversations();
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

    socket.on('internal.message.created', onMessageCreated);
    socket.on('internal.message.updated', onMessageUpdated);
    socket.on('internal.presence', onPresence);
    socket.on('internal.typing', onTyping);

    return () => {
      socket.off('internal.message.created', onMessageCreated);
      socket.off('internal.message.updated', onMessageUpdated);
      socket.off('internal.presence', onPresence);
      socket.off('internal.typing', onTyping);
    };
  }, [myUserId, refetchConversations, isActiveConversation]);

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
    mediaName?: string;
    replyToMessageId?: string | null;
  }) => {
    if (!myUserId) return;

    const tempId = `opt-${Date.now()}`;
    const type = input.type ?? 'TEXT';
    const fileLabel =
      input.mediaName?.trim() ||
      (type === 'FILE' ? input.body?.trim() || '' : '');
    // APIs antigas usam `body` como nome do arquivo e rejeitam `mediaName`
    // (ValidationPipe forbidNonWhitelisted).
    const bodyText =
      type === 'FILE'
        ? input.body?.trim() || fileLabel || ''
        : input.body ?? '';

    const optimistic: InternalChatMessage = {
      id: tempId,
      conversationId: selected?.id ?? '',
      senderId: myUserId,
      body: bodyText,
      type,
      mediaUrl: input.mediaUrl ?? null,
      mediaName: fileLabel || null,
      replyToId: input.replyToMessageId ?? null,
      createdAt: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const payload: Record<string, unknown> = {
        type,
        body: bodyText,
      };
      if (input.mediaUrl) payload.mediaUrl = input.mediaUrl;
      if (fileLabel) payload.mediaName = fileLabel;
      if (selected?.id) {
        payload.conversationId = selected.id;
      } else if (selected?.peer?.id) {
        payload.peerUserId = selected.peer.id;
      }
      if (input.replyToMessageId) {
        payload.replyToMessageId = input.replyToMessageId;
      }

      const postMessage = (body: Record<string, unknown>) =>
        api<{
          conversation: { id: string; kind: string; pairKey: string };
          message: InternalChatMessage;
        }>('/internal-chat/messages', {
          method: 'POST',
          body: JSON.stringify(body),
        });

      let res: {
        conversation: { id: string; kind: string; pairKey: string };
        message: InternalChatMessage;
      };
      try {
        res = await postMessage(payload);
      } catch (firstErr) {
        const msg =
          firstErr instanceof Error ? firstErr.message : String(firstErr);
        const whitelistReject =
          /mediaName|replyToMessageId|should not exist|whitelist|property/i.test(
            msg,
          );
        const canStrip =
          whitelistReject &&
          (payload.mediaName != null || payload.replyToMessageId != null);
        if (!canStrip) throw firstErr;
        // APIs antigas (forbidNonWhitelisted) rejeitam mediaName/replyTo.
        const retry = { ...payload };
        delete retry.mediaName;
        delete retry.replyToMessageId;
        res = await postMessage(retry);
      }

      const normalized = {
        ...normalizeMessage(res.message),
        conversationId: res.conversation.id,
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? normalized : m)),
      );

      await refetchConversations();
      if (!selected?.id && res.conversation.id) {
        setSelectedKey(
          res.conversation.kind === 'GENERAL'
            ? 'general'
            : `peer:${selected?.peer?.id ?? ''}`,
        );
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, _failed: true } : m)),
      );
      throw new Error(
        err instanceof Error && err.message
          ? err.message
          : 'Falha ao enviar',
      );
    }
  };

  const editMessage = async (messageId: string, body: string) => {
    const res = await api<{ message: InternalChatMessage }>(
      `/internal-chat/messages/${messageId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      },
    );
    const normalized = normalizeMessage(res.message);
    setMessages((prev) =>
      prev.map((m) => (m.id === normalized.id ? { ...m, ...normalized } : m)),
    );
    await refetchConversations();
  };

  const deleteMessage = async (messageId: string) => {
    const res = await api<{ message: InternalChatMessage }>(
      `/internal-chat/messages/${messageId}`,
      { method: 'DELETE' },
    );
    const normalized = normalizeMessage(res.message);
    setMessages((prev) =>
      prev.map((m) => (m.id === normalized.id ? { ...m, ...normalized } : m)),
    );
    await refetchConversations();
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
    editMessage,
    deleteMessage,
    emitTyping,
    refetchConversations,
  };
}
