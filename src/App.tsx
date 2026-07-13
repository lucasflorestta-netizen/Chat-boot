import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import { useNotifications } from './hooks/useNotifications';
import { Loader2, Bell } from 'lucide-react';

function AppContent() {
  const { session, profile, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [preselectedTicket, setPreselectedTicket] = useState<string | null>(null);
  const { notifications, notify, soundEnabled, setSoundEnabled } = useNotifications();

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

  // Guard admin-only tabs
  const guardedTab = (tab: TabId): TabId => {
    if ((tab === 'users' || tab === 'auto-messages') && profile.role !== 'admin') {
      return 'dashboard';
    }
    return tab;
  };

  const handleNavigate = (tab: TabId) => {
    setActiveTab(guardedTab(tab));
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
        unreadCount={0}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        notifications={notificationBell}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'dashboard' && <Dashboard onNavigateToChat={() => setActiveTab('chat')} />}
        {activeTab === 'chat' && (
          <ChatView
            preselectedTicketId={preselectedTicket}
            onConsumePreselect={() => setPreselectedTicket(null)}
            onNotify={notify}
          />
        )}
        {activeTab === 'contacts' && <ContactsView onStartConversation={handleStartConversation} />}
        {activeTab === 'users' && profile.role === 'admin' && <UsersView />}
        {activeTab === 'whatsapp' && <WhatsappView />}
        {activeTab === 'auto-messages' && profile.role === 'admin' && <AutoMessagesView />}
        {activeTab === 'tags' && <TagsView />}
        {activeTab === 'canned' && <CannedView />}
      </main>

      {/* Toast notifications */}
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
