import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { WhatsappConnectionProvider } from './context/WhatsappConnectionContext';
import { useWhatsappConnection } from './context/useWhatsappConnection';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar, type TabId } from './components/layout/Sidebar';
import { Dashboard } from './components/views/Dashboard';
import { ChatView } from './components/views/ChatView';
import { ContactsView } from './components/views/ContactsView';
import { UsersView } from './components/views/UsersView';
import { WhatsappView } from './components/views/WhatsappView';
import { AutoMessagesView } from './components/views/AutoMessagesView';
import { TagsView } from './components/views/TagsView';
import { CannedView } from './components/views/CannedView';
import { InternalChatView } from './components/views/InternalChatView';
import { GroupsView } from './components/views/GroupsView';
import { MuralView } from './components/views/MuralView';
import { useNotifications } from './hooks/useNotifications';
import { useTickets } from './hooks/useData';
import { api } from './lib/api';
import {
  fireMuralReminder,
  notifyMuralAssigned,
  scheduleMuralReminder,
  setMuralReminderHandler,
} from './lib/muralReminders';
import { connectSocket } from './lib/socket';
import { mapMediaType, mapProfile, mapTicket } from './lib/mappers';
import { TransferAcceptModal } from './components/chat/TransferAcceptModal';
import {
  MuralReminderModal,
  type MuralReminderPopup,
} from './components/mural/MuralReminderModal';
import { LunchReturnModal } from './components/LunchReturnModal';
import { ContactAvatar } from './components/ContactAvatar';
import type { Ticket } from './types';
import { AlertCircle, Loader2, WifiOff } from 'lucide-react';

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
  if (message.type === 'FILE') return 'Enviou um arquivo';
  return 'Nova mensagem interna';
}

const AGENT_BLOCKED_TABS: TabId[] = [
  'dashboard',
  'whatsapp',
  'tags',
  'canned',
  'users',
  'auto-messages',
];

function AppContent() {
  const { session, profile, loading } = useAuth();

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

  return (
    <WhatsappConnectionProvider>
      <AuthenticatedApp />
    </WhatsappConnectionProvider>
  );
}

function LoginSessionBanner() {
  const { loginNotice, clearLoginNotice } = useAuth();
  if (!loginNotice) return null;
  return (
    <div className="fixed top-3 left-1/2 z-[100] w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2">
      <div className="flex items-start gap-3 rounded-xl border border-warning-500/40 bg-ink-900/95 px-4 py-3 text-sm text-warning-200 shadow-xl backdrop-blur">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning-400" />
        <p className="flex-1">{loginNotice}</p>
        <button
          type="button"
          onClick={clearLoginNotice}
          className="rounded-md px-2 py-0.5 text-xs text-ink-300 hover:bg-ink-800 hover:text-white"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { profile, patchProfile } = useAuth();
  const { connection, loading: waLoading } = useWhatsappConnection();
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [preselectedTicket, setPreselectedTicket] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [internalUnread, setInternalUnread] = useState(0);
  const [muralUnread, setMuralUnread] = useState(0);
  const [pendingTransfer, setPendingTransfer] = useState<Ticket | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [lunchReturnConfirming, setLunchReturnConfirming] = useState(false);
  const [muralDuePopup, setMuralDuePopup] = useState<MuralReminderPopup | null>(
    null,
  );
  const muralDueQueueRef = useRef<MuralReminderPopup[]>([]);
  const selectedTicketIdRef = useRef<string | null>(null);
  const activeTabRef = useRef<TabId>('chat');
  const { notifications, notify, dismiss, soundEnabled, setSoundEnabled } = useNotifications();
  const { tickets } = useTickets();
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;
  selectedTicketIdRef.current = selectedTicketId;
  activeTabRef.current = activeTab;

  const isWhatsappDisconnected = !waLoading && connection?.status === 'disconnected';
  const isAdmin = profile?.role === 'admin';
  const lockToWhatsapp = isWhatsappDisconnected && isAdmin;
  const lockForAgent = isWhatsappDisconnected && !isAdmin;

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

  const refreshMuralBadge = useCallback(async () => {
    try {
      const data = await api<{ unreadReminders: number }>('/mural/reminders/badge');
      setMuralUnread(data.unreadReminders ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    void refreshInternalUnread();
    void refreshMuralBadge();
  }, [profile, refreshInternalUnread, refreshMuralBadge]);

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
          label: 'Customer Center',
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
      const msg =
        err instanceof Error ? err.message : 'Falha ao aceitar transferência';
      alert(msg);
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

    // Lembrete no horário → popup modal (não só toast).
    setMuralReminderHandler((payload) => {
      void refreshMuralBadge();
      const popup: MuralReminderPopup = {
        taskId: payload.taskId,
        ticketId: payload.ticketId,
        body: payload.body,
        contactName: payload.contactName,
        avatarUrl: payload.avatarUrl,
        title: payload.title ?? 'Lembrete do Mural',
        dueAt: payload.dueAt ?? new Date().toISOString(),
      };
      notify(
        'ticket',
        popup.title ?? 'Lembrete do Mural',
        popup.body?.trim() || 'Lembrete de tarefa',
        {
          avatarUrl: popup.avatarUrl,
          ticketId: popup.ticketId,
          label: 'Mural',
          toast: false,
        },
      );
      setMuralDuePopup((current) => {
        if (!current) return popup;
        if (current.taskId === popup.taskId) return popup;
        muralDueQueueRef.current = [
          ...muralDueQueueRef.current.filter((q) => q.taskId !== popup.taskId),
          popup,
        ];
        return current;
      });
    });

    const onMuralReminder = (payload: {
      taskId?: string;
      ticketId?: string;
      body?: string;
      contactName?: string | null;
      avatarUrl?: string | null;
      dueAt?: string | Date;
    }) => {
      if (!payload.taskId) {
        void refreshMuralBadge();
        setMuralDuePopup({
          taskId: `anon-${Date.now()}`,
          ticketId: payload.ticketId,
          body: payload.body,
          contactName: payload.contactName,
          avatarUrl: payload.avatarUrl,
          title: 'Lembrete do Mural',
          dueAt: payload.dueAt ?? new Date().toISOString(),
        });
        return;
      }
      fireMuralReminder({
        taskId: payload.taskId,
        ticketId: payload.ticketId,
        body: payload.body,
        contactName: payload.contactName,
        avatarUrl: payload.avatarUrl,
        title: 'Lembrete do Mural',
        dueAt: payload.dueAt ?? new Date().toISOString(),
      });
    };

    const onMuralTaskCreated = (payload: {
      task?: {
        id?: string;
        assignedToId?: string;
        createdById?: string;
        ticketId?: string;
        conversaId?: string;
        dueAt?: string | Date;
        body?: string | null;
        clienteNome?: string | null;
        cliente_nome?: string | null;
        createdBy?: { name?: string | null; username?: string };
        created_by?: { name?: string | null; username?: string };
        ticket?: {
          protocolo?: string | null;
          contact?: {
            displayName?: string | null;
            profilePicUrl?: string | null;
          };
        };
      };
    }) => {
      const task = payload?.task;
      if (!task?.id) return;
      // Só o responsável vinculado recebe a notificação na tela principal.
      if (task.assignedToId !== profile.id) return;

      const contactName =
        task.ticket?.contact?.displayName?.trim() ||
        task.clienteNome?.trim() ||
        task.cliente_nome?.trim() ||
        'Cliente';
      const titleLine =
        task.body?.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ||
        'Nova tarefa';
      const ticketId = task.ticketId ?? task.conversaId ?? null;
      const avatarUrl = task.ticket?.contact?.profilePicUrl ?? null;
      const creator =
        task.createdBy?.name?.trim() ||
        task.created_by?.name?.trim() ||
        task.createdBy?.username ||
        task.created_by?.username ||
        null;
      const dueLabel = task.dueAt
        ? new Date(task.dueAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null;
      const bodyParts = [
        creator && task.createdById !== profile.id ? `${creator}` : null,
        contactName,
        dueLabel ? `Lembrete ${dueLabel}` : null,
        titleLine,
      ].filter(Boolean);

      // Toast imediato na criação (self-assign ou outro agente).
      notifyMuralAssigned({
        taskId: task.id,
        ticketId,
        body: bodyParts.join(' · '),
        contactName,
        avatarUrl,
        title: 'Nova tarefa no Mural',
      });
      void refreshMuralBadge();

      // Backup local do lembrete na data (além do cron).
      if (task.dueAt) {
        scheduleMuralReminder({
          taskId: task.id,
          dueAt: task.dueAt,
          ticketId,
          body: titleLine,
          contactName,
          avatarUrl,
          title: 'Lembrete do Mural',
        });
      }
    };

    socket.on('message.created', onMessage);
    socket.on('internal.message.created', onInternal);
    socket.on('mural.reminder', onMuralReminder);
    socket.on('mural.task.created', onMuralTaskCreated);
    socket.on('mural.reminder.read', () => {
      void refreshMuralBadge();
    });
    return () => {
      // Não zera o handler aqui — evita perder toast se o timer disparar
      // entre o cleanup e o próximo setMuralReminderHandler.
      socket.off('message.created', onMessage);
      socket.off('internal.message.created', onInternal);
      socket.off('mural.reminder', onMuralReminder);
      socket.off('mural.task.created', onMuralTaskCreated);
      socket.off('mural.reminder.read');
    };
  }, [profile, notify, refreshInternalUnread, refreshMuralBadge]);

  useEffect(() => {
    if (activeTab === 'comunicador-interno') {
      void refreshInternalUnread();
    }
    if (activeTab === 'mural') {
      void refreshMuralBadge();
    }
  }, [activeTab, refreshInternalUnread, refreshMuralBadge]);

  useEffect(() => {
    if (lockToWhatsapp && activeTab !== 'whatsapp') {
      setActiveTab('whatsapp');
    }
  }, [lockToWhatsapp, activeTab]);

  const myActiveCount = useMemo(
    () =>
      profile
        ? tickets.filter(
            (t) => t.assigned_to === profile.id && t.status === 'attending',
          ).length
        : 0,
    [tickets, profile],
  );
  const transferQueueFull = Boolean(
    profile &&
      profile.max_concurrent_chats > 0 &&
      myActiveCount >= profile.max_concurrent_chats,
  );

  if (!profile) return null;

  const guardedTab = (tab: TabId): TabId => {
    if (lockToWhatsapp) return 'whatsapp';
    if (lockForAgent) return tab;
    if (profile.role !== 'admin' && AGENT_BLOCKED_TABS.includes(tab)) {
      return 'chat';
    }
    return tab;
  };

  const handleNavigate = (tab: TabId) => {
    if (lockForAgent) return;
    const next = guardedTab(tab);
    if (next !== 'chat') {
      setSelectedTicketId(null);
    }
    setActiveTab(next);
  };

  const handleStartConversation = (ticketId: string) => {
    if (isWhatsappDisconnected) return;
    setPreselectedTicket(ticketId);
    setActiveTab('chat');
  };

  const handleToastClick = (n: (typeof notifications)[number]) => {
    if (isWhatsappDisconnected) {
      dismiss(n.id);
      return;
    }
    if (n.label === 'Mural' && !n.ticketId) {
      setActiveTab('mural');
    } else if (n.ticketId) {
      setPreselectedTicket(n.ticketId);
      setActiveTab('chat');
    } else if (n.label === 'Comunicador') {
      setActiveTab('comunicador-interno');
    }
    dismiss(n.id);
  };

  const closeMuralDuePopup = useCallback(() => {
    setMuralDuePopup((current) => {
      if (current?.taskId && !current.taskId.startsWith('anon-')) {
        void api('/mural/reminders/read', {
          method: 'POST',
          body: JSON.stringify({ taskIds: [current.taskId] }),
        })
          .then(() => refreshMuralBadge())
          .catch(() => undefined);
      }
      return muralDueQueueRef.current.shift() ?? null;
    });
  }, [refreshMuralBadge]);

  const confirmLunchReturn = useCallback(async () => {
    if (lunchReturnConfirming) return;
    setLunchReturnConfirming(true);
    try {
      const updated = await api('/users/me/confirm-lunch-return', {
        method: 'POST',
      });
      patchProfile(mapProfile(updated));
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : 'Falha ao confirmar retorno ao atendimento',
      );
    } finally {
      setLunchReturnConfirming(false);
    }
  }, [lunchReturnConfirming, patchProfile]);

  const notificationBell = notifications.length > 0 && (
    <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger-500 rounded-full flex items-center justify-center text-[10px] text-white">
      {notifications.length}
    </span>
  );

  const needsLunchReturn = Boolean(profile.lunch_return_required);

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">
      <LoginSessionBanner />
      {needsLunchReturn && (
        <LunchReturnModal
          confirming={lunchReturnConfirming}
          onConfirm={() => void confirmLunchReturn()}
        />
      )}
      {pendingTransfer &&
        pendingTransfer.pending_transfer_to === profile.id &&
        !isWhatsappDisconnected &&
        !needsLunchReturn && (
        <TransferAcceptModal
          ticket={pendingTransfer}
          busy={transferBusy}
          queueFull={transferQueueFull}
          activeCount={myActiveCount}
          maxConcurrent={profile.max_concurrent_chats}
          onAccept={() => void handleAcceptTransfer()}
          onReject={() => void handleRejectTransfer()}
        />
      )}
      {muralDuePopup && !isWhatsappDisconnected && !needsLunchReturn && (
        <MuralReminderModal
          reminder={muralDuePopup}
          onClose={closeMuralDuePopup}
          onOpenConversation={() => {
            const tid = muralDuePopup.ticketId;
            closeMuralDuePopup();
            if (tid) {
              setPreselectedTicket(tid);
              setActiveTab('chat');
            }
          }}
          onOpenMural={() => {
            closeMuralDuePopup();
            setActiveTab('mural');
          }}
        />
      )}
      <Sidebar
        active={activeTab}
        onNavigate={handleNavigate}
        internalUnreadCount={internalUnread}
        muralUnreadCount={muralUnread}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        notifications={notificationBell}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        {lockForAgent ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-danger-500/15 border border-danger-500/30 flex items-center justify-center">
              <WifiOff className="w-7 h-7 text-danger-400" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-xl font-semibold text-white">WhatsApp desconectado</h2>
              <p className="text-sm text-ink-300 leading-relaxed">
                Aguarde um administrador reconectar
              </p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && profile.role === 'admin' && (
              <Dashboard
                onNavigateToChat={() => setActiveTab('chat')}
                onOpenTicket={handleStartConversation}
              />
            )}
            {!lockToWhatsapp && (
              <div
                className={
                  activeTab === 'chat' ? 'flex-1 min-h-0 h-full flex flex-col' : 'hidden'
                }
              >
                <ChatView
                  preselectedTicketId={preselectedTicket}
                  onConsumePreselect={() => setPreselectedTicket(null)}
                  onSelectedTicketChange={handleSelectedTicketChange}
                />
              </div>
            )}
            {activeTab === 'contacts' && !lockToWhatsapp && (
              <div className="flex-1 min-h-0">
                <ContactsView onStartConversation={handleStartConversation} />
              </div>
            )}
            {activeTab === 'users' && profile.role === 'admin' && !lockToWhatsapp && (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <UsersView />
              </div>
            )}
            {activeTab === 'whatsapp' && profile.role === 'admin' && <WhatsappView />}
            {activeTab === 'auto-messages' && profile.role === 'admin' && !lockToWhatsapp && (
              <AutoMessagesView />
            )}
            {activeTab === 'tags' && profile.role === 'admin' && !lockToWhatsapp && <TagsView />}
            {activeTab === 'canned' && profile.role === 'admin' && !lockToWhatsapp && (
              <CannedView />
            )}
            {activeTab === 'comunicador-interno' && !lockToWhatsapp && <InternalChatView />}
            {activeTab === 'grupos' && !lockToWhatsapp && <GroupsView />}
            {activeTab === 'mural' && !lockToWhatsapp && (
              <div className="flex-1 min-h-0 overflow-hidden">
                <MuralView
                  onOpenTicket={(ticketId) => {
                    setPreselectedTicket(ticketId);
                    setActiveTab('chat');
                  }}
                />
              </div>
            )}
          </>
        )}
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
                {n.label ?? (n.type === 'ticket' ? 'Customer Center' : 'WhatsApp')}
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
