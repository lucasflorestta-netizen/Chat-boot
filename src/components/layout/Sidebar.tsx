import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  MessageSquare,
  Contact,
  Users,
  QrCode,
  Settings,
  Tag,
  Zap,
  LogOut,
  Headphones,
  Bell,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { AvatarUploadButton } from '../AvatarUploadButton';

export type TabId =
  | 'dashboard'
  | 'chat'
  | 'contacts'
  | 'users'
  | 'whatsapp'
  | 'auto-messages'
  | 'tags'
  | 'canned';

interface NavItem {
  id: TabId;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'chat', label: 'Chat / Tickets', icon: <MessageSquare className="w-5 h-5" /> },
  { id: 'contacts', label: 'Contatos', icon: <Contact className="w-5 h-5" /> },
  { id: 'users', label: 'Usuários', icon: <Users className="w-5 h-5" />, adminOnly: true },
  { id: 'whatsapp', label: 'Conexão WhatsApp', icon: <QrCode className="w-5 h-5" /> },
  { id: 'auto-messages', label: 'Mensagens Automáticas', icon: <Settings className="w-5 h-5" />, adminOnly: true },
  { id: 'tags', label: 'Etiquetas', icon: <Tag className="w-5 h-5" /> },
  { id: 'canned', label: 'Respostas Rápidas', icon: <Zap className="w-5 h-5" /> },
];

interface SidebarProps {
  active: TabId;
  onNavigate: (tab: TabId) => void;
  unreadCount: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  notifications: ReactNode;
}

export function Sidebar({
  active,
  onNavigate,
  unreadCount,
  soundEnabled,
  onToggleSound,
  notifications,
}: SidebarProps) {
  const { profile, signOut, refreshProfile, patchProfile } = useAuth();
  const items = navItems.filter((item) => !item.adminOnly || profile?.role === 'admin');

  return (
    <aside className="w-64 bg-ink-900 border-r border-ink-700 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-ink-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-900/40">
            <Headphones className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">HelpDesk CRM</h1>
            <p className="text-xs text-ink-300">WhatsApp</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-900/30'
                  : 'text-ink-200 hover:bg-ink-700 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.id === 'chat' && unreadCount > 0 && (
                <span className="badge bg-danger-500 text-white px-1.5 min-w-[20px] justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-ink-700 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleSound}
            className="btn-ghost px-2.5 py-2 flex-1"
            title={soundEnabled ? 'Som ativado' : 'Som desativado'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <div className="relative">
            <button className="btn-ghost px-2.5 py-2">
              <Bell className="w-4 h-4" />
              {notifications}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 p-2 rounded-lg bg-ink-800">
          {profile ? (
            <AvatarUploadButton
              profileId={profile.id}
              name={profile.name}
              avatarUrl={profile.avatar_url}
              size="sm"
              onUploaded={(url) => {
                patchProfile({ avatar_url: url });
                void refreshProfile();
              }}
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
              ?
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{profile?.name}</p>
            <p className="text-xs text-ink-300 capitalize">
              {profile?.role === 'admin' ? 'Administrador' : 'Agente'}
              {profile?.department && ` · ${profile.department}`}
            </p>
          </div>
          <button onClick={signOut} className="text-ink-300 hover:text-danger-400 transition-colors" title="Sair">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
