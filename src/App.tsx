import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import { useNotifications } from './hooks/useNotifications';
import { useTickets } from './hooks/useData';
import { api } from './lib/api';
import { connectSocket } from './lib/socket';
import { mapMediaType } from './lib/mappers';
import { Loader2, Bell } from 'lucide-react';

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
  const selectedTicketIdRef = useRef<string | null>(null);
  const activeTabRef = useRef<TabId>('chat');
  const { notifications, notify, soundEnabled, setSoundEnabled } = useNotifications();
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
      notify('message', contactName, previewClientMessage(message));
    };

    const onInternal = (payload: {
      message?: {
        senderId?: string;
        body?: string | null;
        type?: string | null;
        sender?: { name?: string | null; username?: string };
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
      notify('message', title, previewInternalMessage(message));
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
            t.assigned_to === profile.id,
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

  const notificationBell = notifications.length > 0 && (
    <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger-500 rounded-full flex items-center justify-center text-[10px] text-white">
      {notifications.length}
    </span>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">
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
        {activeTab === 'contacts' && <ContactsView onStartConversation={handleStartConversation} />}
        {activeTab === 'users' && profile.role === 'admin' && <UsersView />}
        {activeTab === 'whatsapp' && profile.role === 'admin' && <WhatsappView />}
        {activeTab === 'auto-messages' && profile.role === 'admin' && <AutoMessagesView />}
        {activeTab === 'settings' && profile.role === 'admin' && <SettingsView />}
        {activeTab === 'tags' && profile.role === 'admin' && <TagsView />}
        {activeTab === 'canned' && profile.role === 'admin' && <CannedView />}
        {activeTab === 'comunicador-interno' && <InternalChatView />}
      </main>

      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {notifications.map((n) => (
          <div key={n.id} className="card p-3 shadow-2xl animate-slide-in flex items-start gap-2 max-w-xs bg-ink-800">
            <Bell className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">{n.title}</p>
              <p className="text-xs text-ink-300">{n.body}</p>
            </div>
          </div>
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
