import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar, type TabId } from './components/layout/Sidebar';
import { Dashboard } from './components/views/Dashboard';
import { ChatView } from './components/views/ChatView';
import { ContactsView } from './components/views/ContactsView';
import { UsersView } from './components/views/UsersView';
import { WhatsappView } from './components/views/WhatsappView';
import { AutoMessagesView } from './components/views/AutoMessagesView';
import { SettingsView } from './components/views/SettingsView';
import { TagsView } from './components/views/TagsView';
import { CannedView } from './components/views/CannedView';
import { InternalChatView } from './components/views/InternalChatView';
import { GroupsView } from './components/views/GroupsView';
import { useNotifications } from './hooks/useNotifications';
import { useTickets } from './hooks/useData';
import { api } from './lib/api';
import { connectSocket } from './lib/socket';
import { mapMediaType, mapTicket } from './lib/mappers';
import { TransferAcceptModal } from './components/chat/TransferAcceptModal';
import { ContactAvatar } from './components/ContactAvatar';
import type { Ticket } from './types';
import { Loader2 } from 'lucide-react';

const TOAST_BODY_MAX = 120;

function previewClientMessage(message: {
  body?: string | null;
  mediaType?: string | null;
  media_type?: string | null;
}): string {
  const body = (message.body ?? '').trim();
  if (body) {
    return body.length > TOAST_BODY_MAX ? `${body.slice(0, TOAST_BODY_MAX)}…` : body;
  }
  const media = mapMediaType(message.mediaType ?? message.media_type);
  switch (media) {
    case 'image':
      return 'Enviou uma imagem';
    case 'audio':
      return 'Enviou um áudio';
    case 'video':
      return 'Enviou um vídeo';
    case 'sticker':
      return 'Enviou um sticker';
    case 'file':
      return 'Enviou um arquivo';
    default:
      return 'Nova mensagem';
  }
}

function previewInternalMessage(message: {
  body?: string | null;
  type?: string | null;
}): string {
  const body = (message.body ?? '').trim();
  if (body) {
    return body.length > TOAST_BODY_MAX ? `${body.slice(0, TOAST_BODY_MAX)}…` : body;
  }
  if (message.type === 'IMAGE') return 'Enviou uma imagem';
  if (message.type === 'AUDIO') return 'Enviou um áudio';
  return 'Nova mensagem interna';
}

const AGENT_BLOCKED_TABS: TabId[] = [
  'dashboard',
  'whatsapp',
  'tags',
  'canned',
  'users',
  'auto-messages',
  'settings',
];

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [preselectedTicket, setPreselectedTicket] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [internalUnread, setInternalUnread] = useState(0);
  const [pendingTransfer, setPendingTransfer] = useState<Ticket | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const selectedTicketIdRef = useRef<string | null>(null);
  const activeTabRef = useRef<TabId>('chat');
  const { notifications, notify, dismiss, soundEnabled, setSoundEnabled } = useNotifications();
  const { tickets } = useTickets();
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;
  selectedTicketIdRef.current = selectedTicketId;
  activeTabRef.current = activeTab;

  const handleSelectedTicketChange = useCallback((ticketId: string | null) => {
    setSelectedTicketId(ticketId);
  }, []);

  const refreshInternalUnread = useCallback(async () => {
    try {
      const data = await api<{ totalUnread: number }>('/internal-chat/conversations');
      setInternalUnread(data.totalUnread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    void refreshInternalUnread();
  }, [profile, refreshInternalUnread]);

  useEffect(() => {
    if (!profile) return;
    const forMe = tickets.find(
      (t) => t.pending_transfer_to === profile.id && t.status !== 'finished',
    );
    setPendingTransfer((prev) => {
      if (forMe) return forMe;
      if (prev && prev.pending_transfer_to === profile.id) return null;
      return prev;
    });
  }, [tickets, profile]);

  useEffect(() => {
    if (!profile) return;
    const socket = connectSocket();

    const onTransferRequested = (payload: { ticket?: any }) => {
      if (!payload?.ticket) return;
      const ticket = mapTicket(payload.ticket);
      if (ticket.pending_transfer_to !== profile.id) return;
      setPendingTransfer(ticket);
      const fromName =
        ticket.pending_transfer_from_agent?.name?.trim() || 'Um agente';
      const contactName = ticket.contact?.name?.trim() || 'Cliente';
      notify(
        'ticket',
        'Transferência recebida',
        `${fromName} quer transferir ${contactName} para você`,
        {
          avatarUrl: ticket.contact?.profile_pic_url ?? null,
          ticketId: ticket.id,
          label: 'HelpDesk',
        },
      );
    };

    const onTransferResolved = (payload: { ticket?: any }) => {
      if (!payload?.ticket) return;
      const ticket = mapTicket(payload.ticket);
      setPendingTransfer((prev) =>
        prev && prev.id === ticket.id ? null : prev,
      );
    };

    socket.on('ticket.transfer.requested', onTransferRequested);
    socket.on('ticket.transfer.accepted', onTransferResolved);
    socket.on('ticket.transfer.rejected', onTransferResolved);
    socket.on('ticket.transfer.cancelled', onTransferResolved);
    return () => {
      socket.off('ticket.transfer.requested', onTransferRequested);
      socket.off('ticket.transfer.accepted', onTransferResolved);
      socket.off('ticket.transfer.rejected', onTransferResolved);
      socket.off('ticket.transfer.cancelled', onTransferResolved);
    };
  }, [profile, notify]);

  const handleAcceptTransfer = async () => {
    if (!pendingTransfer) return;
    setTransferBusy(true);
    try {
      await api(`/tickets/${pendingTransfer.id}/transfer/accept`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      setPendingTransfer(null);
      setPreselectedTicket(pendingTransfer.id);
      setActiveTab('chat');
    } catch (err) {
      console.error('Erro ao aceitar transferência:', err);
    } finally {
      setTransferBusy(false);
    }
  };

  const handleRejectTransfer = async () => {
    if (!pendingTransfer) return;
    setTransferBusy(true);
    try {
      await api(`/tickets/${pendingTransfer.id}/transfer/reject`, {
        method: 'PATCH',
      });
      setPendingTransfer(null);
    } catch (err) {
      console.error('Erro ao recusar transferência:', err);
    } finally {
      setTransferBusy(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    const socket = connectSocket();

    const onMessage = (payload: {
      message?: {
        sender?: string;
        ticketId?: string;
        body?: string | null;
        mediaType?: string | null;
        media_type?: string | null;
      };
      ticket?: { id?: string; assigneeId?: string | null; assigned_to?: string | null };
    }) => {
      const message = payload?.message;
      const ticket = payload?.ticket;
      if (!message) return;

      const sender = message.sender;
      if (sender !== 'CONTATO' && sender !== 'client') return;

      const assigneeId = ticket?.assigneeId ?? ticket?.assigned_to ?? null;
      if (!assigneeId || assigneeId !== profile.id) return;

      const tid = message.ticketId ?? ticket?.id;
      if (!tid) return;
      if (activeTabRef.current === 'chat' && tid === selectedTicketIdRef.current) return;

      const listed = ticketsRef.current.find((t) => t.id === tid);
      const contactName = listed?.contact?.name?.trim() || 'Cliente';
      notify('message', contactName, previewClientMessage(message), {
        avatarUrl: listed?.contact?.profile_pic_url ?? null,
        ticketId: tid,
        label: 'WhatsApp',
      });
    };

    const onInternal = (payload: {
      message?: {
        senderId?: string;
        body?: string | null;
        type?: string | null;
        sender?: {
          name?: string | null;
          username?: string;
          avatarUrl?: string | null;
          avatar_url?: string | null;
        };
      };
    }) => {
      const message = payload?.message;
      if (!message) return;
      if (message.senderId === profile.id) return;
      if (activeTabRef.current === 'comunicador-interno') {
        void refreshInternalUnread();
        return;
      }
      const title =
        message.sender?.name?.trim() ||
        message.sender?.username ||
        'Comunicador Interno';
      notify('message', title, previewInternalMessage(message), {
        avatarUrl: message.sender?.avatarUrl ?? message.sender?.avatar_url ?? null,
        label: 'Comunicador',
      });
      void refreshInternalUnread();
    };

    socket.on('message.created', onMessage);
    socket.on('internal.message.created', onInternal);
    return () => {
      socket.off('message.created', onMessage);
      socket.off('internal.message.created', onInternal);
    };
  }, [profile, notify, refreshInternalUnread]);

  useEffect(() => {
    if (activeTab === 'comunicador-interno') {
      void refreshInternalUnread();
    }
  }, [activeTab, refreshInternalUnread]);

  const unreadCount = useMemo(() => {
    if (!profile) return 0;
    const visible = profile.role === 'admin'
      ? tickets
      : tickets.filter(
          (t) =>
            t.status === 'triage' ||
            (profile.sectorId != null && t.sectorId === profile.sectorId) ||
            t.assigned_to === profile.id ||
            t.pending_transfer_to === profile.id,
        );
    return visible
      .filter((t) => t.status !== 'finished')
      .reduce((sum, t) => sum + (t.unread_count || 0), 0);
  }, [tickets, profile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-ink-950">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!session || !profile) {
    return <AuthScreen />;
  }

  const guardedTab = (tab: TabId): TabId => {
    if (profile.role !== 'admin' && AGENT_BLOCKED_TABS.includes(tab)) {
      return 'chat';
    }
    return tab;
  };

  const handleNavigate = (tab: TabId) => {
    const next = guardedTab(tab);
    if (next !== 'chat') {
      setSelectedTicketId(null);
    }
    setActiveTab(next);
  };

  const handleStartConversation = (ticketId: string) => {
    setPreselectedTicket(ticketId);
    setActiveTab('chat');
  };

  const handleToastClick = (n: (typeof notifications)[number]) => {
    if (n.ticketId) {
      setPreselectedTicket(n.ticketId);
      setActiveTab('chat');
    } else if (n.label === 'Comunicador') {
      setActiveTab('comunicador-interno');
    }
    dismiss(n.id);
  };

  const notificationBell = notifications.length > 0 && (
    <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger-500 rounded-full flex items-center justify-center text-[10px] text-white">
      {notifications.length}
    </span>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">
      {pendingTransfer && pendingTransfer.pending_transfer_to === profile.id && (
        <TransferAcceptModal
          ticket={pendingTransfer}
          busy={transferBusy}
          onAccept={() => void handleAcceptTransfer()}
          onReject={() => void handleRejectTransfer()}
        />
      )}
      <Sidebar
        active={activeTab}
        onNavigate={handleNavigate}
        unreadCount={unreadCount}
        internalUnreadCount={internalUnread}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        notifications={notificationBell}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'dashboard' && profile.role === 'admin' && (
          <Dashboard onNavigateToChat={() => setActiveTab('chat')} />
        )}
        {activeTab === 'chat' && (
          <ChatView
            preselectedTicketId={preselectedTicket}
            onConsumePreselect={() => setPreselectedTicket(null)}
            onSelectedTicketChange={handleSelectedTicketChange}
          />
        )}
        {activeTab === 'contacts' && (
          <div className="flex-1 min-h-0">
            <ContactsView onStartConversation={handleStartConversation} />
          </div>
        )}
        {activeTab === 'users' && profile.role === 'admin' && <UsersView />}
        {activeTab === 'whatsapp' && profile.role === 'admin' && <WhatsappView />}
        {activeTab === 'auto-messages' && profile.role === 'admin' && <AutoMessagesView />}
        {activeTab === 'settings' && profile.role === 'admin' && <SettingsView />}
        {activeTab === 'tags' && profile.role === 'admin' && <TagsView />}
        {activeTab === 'canned' && profile.role === 'admin' && <CannedView />}
        {activeTab === 'comunicador-interno' && <InternalChatView />}
        {activeTab === 'grupos' && <GroupsView />}
      </main>

      <div className="fixed bottom-4 right-4 space-y-3 z-50">
        {notifications.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => handleToastClick(n)}
            className="w-[360px] max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.28)] animate-slide-in flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors cursor-pointer border border-black/5"
          >
            <ContactAvatar
              name={n.title}
              profilePicUrl={n.avatarUrl}
              size="md"
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[11px] font-medium text-[#25D366] leading-none mb-1">
                {n.label ?? (n.type === 'ticket' ? 'HelpDesk' : 'WhatsApp')}
              </p>
              <p className="text-[15px] font-semibold text-gray-900 truncate leading-tight">
                {n.title}
              </p>
              <p className="text-[13px] text-gray-500 line-clamp-2 mt-0.5 leading-snug">
                {n.body}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
