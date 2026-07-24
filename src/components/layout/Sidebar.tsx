import { useAuth } from '../../context/useAuth';
import {
  LayoutDashboard,
  MessageSquare,
  Contact,
  Users,
  UsersRound,
  QrCode,
  Settings,
  Tag,
  Zap,
  MessageCircleMore,
  LogOut,
  Headphones,
  Bell,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  WifiOff,
  StickyNote,
  ChevronDown,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import {
  AGENT_STATUS_OPTIONS,
  agentStatusBadgeClass,
  agentStatusLabel,
} from '../../lib/agentStatus';
import {
  DEFAULT_BRAND_NAME,
  readStoredBrand,
  resolveBrandLogoSrc,
  writeStoredBrand,
} from '../../lib/brand';
import type { AgentStatus } from '../../types';
import { AvatarUploadButton } from '../AvatarUploadButton';
import { useAppearanceSettings } from '../../hooks/useData';
import { useWhatsappConnection } from '../../context/useWhatsappConnection';
import { NotepadWindow } from '../notepad/NotepadWindow';
import { PresenceMonitorPanel } from './PresenceMonitorPanel';

export type TabId =
  | 'dashboard'
  | 'chat'
  | 'contacts'
  | 'users'
  | 'whatsapp'
  | 'auto-messages'
  | 'settings'
  | 'tags'
  | 'canned'
  | 'comunicador-interno'
  | 'grupos';

interface NavItem {
  id: TabId;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" />, adminOnly: true },
  { id: 'chat', label: 'Chat / Tickets', icon: <MessageSquare className="w-5 h-5" /> },
  { id: 'contacts', label: 'Contatos', icon: <Contact className="w-5 h-5" /> },
  { id: 'users', label: 'Usuários', icon: <Users className="w-5 h-5" />, adminOnly: true },
  { id: 'whatsapp', label: 'Conexão WhatsApp', icon: <QrCode className="w-5 h-5" />, adminOnly: true },
  { id: 'auto-messages', label: 'Mensagens Automáticas', icon: <Settings className="w-5 h-5" />, adminOnly: true },
  { id: 'settings', label: 'Configurações', icon: <SlidersHorizontal className="w-5 h-5" />, adminOnly: true },
  { id: 'tags', label: 'Etiquetas', icon: <Tag className="w-5 h-5" />, adminOnly: true },
  { id: 'canned', label: 'Respostas Rápidas', icon: <Zap className="w-5 h-5" />, adminOnly: true },
  { id: 'comunicador-interno', label: 'Comunicador Interno', icon: <MessageCircleMore className="w-5 h-5" /> },
  { id: 'grupos', label: 'Grupos', icon: <UsersRound className="w-5 h-5" /> },
];

interface SidebarProps {
  active: TabId;
  onNavigate: (tab: TabId) => void;
  unreadCount: number;
  internalUnreadCount?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  notifications: ReactNode;
}

export function Sidebar({
  active,
  onNavigate,
  unreadCount,
  internalUnreadCount = 0,
  soundEnabled,
  onToggleSound,
  notifications,
}: SidebarProps) {
  const { profile, signOut, refreshProfile, patchProfile } = useAuth();
  const { connection, loading: waLoading } = useWhatsappConnection();
  const { settings: appearance } = useAppearanceSettings();
  const storedBrand = readStoredBrand();
  const brandName =
    appearance?.brandName?.trim() || storedBrand.name || DEFAULT_BRAND_NAME;
  const brandLogoSrc = resolveBrandLogoSrc(
    appearance?.brandLogoUrl ?? storedBrand.logo,
  );
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const [notepadWindows, setNotepadWindows] = useState<
    Array<{
      windowKey: string;
      minimized: boolean;
      zIndex: number;
      offset: number;
    }>
  >([]);
  const notepadZRef = useRef(70);
  const notepadOffsetRef = useRef(0);
  const isWhatsappDisconnected = !waLoading && connection?.status === 'disconnected';
  const canManageWhatsapp = profile?.role === 'admin';
  const isAdmin = profile?.apiRole === 'ADMIN';
  const items = navItems.filter((item) => {
    if (isWhatsappDisconnected) {
      if (!canManageWhatsapp) return false;
      return item.id === 'whatsapp';
    }
    return !item.adminOnly || canManageWhatsapp;
  });
  const hasOpenNotepad = notepadWindows.some((n) => !n.minimized);

  useEffect(() => {
    if (!appearance) return;
    writeStoredBrand(appearance.brandName, appearance.brandLogoUrl);
  }, [appearance]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!statusMenuRef.current?.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [statusMenuOpen]);

  const focusNotepad = (windowKey: string) => {
    notepadZRef.current += 1;
    const z = notepadZRef.current;
    setNotepadWindows((prev) =>
      prev.map((n) => (n.windowKey === windowKey ? { ...n, zIndex: z } : n)),
    );
  };

  const openNotepad = () => {
    notepadZRef.current += 1;
    const offset = notepadOffsetRef.current;
    notepadOffsetRef.current += 1;
    setNotepadWindows((prev) => [
      ...prev,
      {
        windowKey: crypto.randomUUID(),
        minimized: false,
        zIndex: notepadZRef.current,
        offset,
      },
    ]);
  };

  const updateStatus = async (status: AgentStatus) => {
    if (!profile || statusSaving) return;
    setStatusMenuOpen(false);
    if (status === profile.status) return;
    const previous = profile.status;
    patchProfile({ status });
    setStatusSaving(true);
    try {
      await api('/users/me/status', {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      patchProfile({ status: previous });
      alert(err instanceof Error ? err.message : 'Falha ao atualizar status');
    } finally {
      setStatusSaving(false);
    }
  };

  return (
    <aside className="w-64 bg-ink-900 border-r border-ink-700 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-ink-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-900/40 overflow-hidden">
            <img
              src={brandLogoSrc}
              alt={brandName}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <Headphones className="w-5 h-5 text-white hidden" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">{brandName}</h1>
            <p className="text-xs text-ink-300">WhatsApp</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        <nav
          className={`overflow-y-auto p-3 space-y-1 ${
            isAdmin && presenceOpen ? 'shrink-0 max-h-[45%]' : 'flex-1'
          }`}
        >
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
                {item.id === 'comunicador-interno' && internalUnreadCount > 0 && (
                  <span className="badge bg-danger-500 text-white px-1.5 min-w-[20px] justify-center">
                    {internalUnreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {isAdmin && (
          <PresenceMonitorPanel
            open={presenceOpen}
            onToggle={() => setPresenceOpen((v) => !v)}
          />
        )}
      </div>

      <div className="p-3 border-t border-ink-700 space-y-2 shrink-0">
        {isWhatsappDisconnected && (
          <button
            type="button"
            onClick={() => {
              if (canManageWhatsapp) onNavigate('whatsapp');
            }}
            className={`w-full flex items-start gap-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-2.5 py-2 text-left ${
              canManageWhatsapp ? 'hover:bg-danger-500/15 cursor-pointer' : 'cursor-default'
            }`}
            title={
              canManageWhatsapp
                ? 'Abrir Conexão WhatsApp'
                : 'Aguarde um administrador reconectar'
            }
          >
            <WifiOff className="w-3.5 h-3.5 text-danger-400 mt-0.5 flex-shrink-0" />
            <span className="text-[11px] leading-snug text-danger-300">
              <span className="font-semibold text-danger-200">WhatsApp desconectado.</span>
              {canManageWhatsapp
                ? ' Clique para reconectar.'
                : ' Aguarde um administrador reconectar.'}
            </span>
          </button>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openNotepad}
            className={`btn-ghost px-2.5 py-2 ${hasOpenNotepad ? 'bg-ink-700 text-white' : ''}`}
            title="Bloco de Notas — clique para abrir nova janela"
            aria-label="Bloco de Notas"
          >
            <StickyNote className="w-4 h-4" />
          </button>
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
              onUploaded={({ displayUrl }) => {
                patchProfile({ avatar_url: displayUrl });
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
              {profile?.apiRole === 'ADMIN'
                ? 'Administrador'
                : profile?.apiRole === 'SUPERVISOR'
                  ? 'Supervisor'
                  : 'Agente'}
              {profile?.department && ` · ${profile.department}`}
            </p>
            {profile && (
              <div className="relative mt-1" ref={statusMenuRef}>
                <button
                  type="button"
                  disabled={statusSaving}
                  onClick={() => setStatusMenuOpen((open) => !open)}
                  className={`w-full flex items-center justify-between gap-1 text-[11px] rounded-md border-0 py-1 pl-2 pr-1.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed ${agentStatusBadgeClass(profile.status)}`}
                  title="Status de atendimento"
                  aria-label="Status de atendimento"
                  aria-haspopup="listbox"
                  aria-expanded={statusMenuOpen}
                >
                  <span className="truncate">{agentStatusLabel(profile.status)}</span>
                  <ChevronDown
                    className={`w-3 h-3 flex-shrink-0 opacity-70 transition-transform ${statusMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {statusMenuOpen && (
                  <ul
                    role="listbox"
                    className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-md border border-ink-600 bg-ink-800 py-0.5 shadow-xl shadow-black/40"
                  >
                    {AGENT_STATUS_OPTIONS.map((opt) => {
                      const selected = opt.value === profile.status;
                      return (
                        <li key={opt.value} role="option" aria-selected={selected}>
                          <button
                            type="button"
                            disabled={statusSaving}
                            onClick={() => void updateStatus(opt.value)}
                            className={`w-full text-left text-[11px] px-2 py-1.5 transition-colors ${
                              selected
                                ? 'bg-brand-600 text-white font-medium'
                                : 'text-ink-100 hover:bg-ink-700 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button onClick={signOut} className="text-ink-300 hover:text-danger-400 transition-colors" title="Sair">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {notepadWindows.map((win) => {
        const dockIndex = notepadWindows
          .filter((n) => n.minimized)
          .findIndex((n) => n.windowKey === win.windowKey);
        return (
          <NotepadWindow
            key={win.windowKey}
            windowKey={win.windowKey}
            minimized={win.minimized}
            zIndex={win.zIndex}
            offset={win.offset}
            dockIndex={dockIndex < 0 ? 0 : dockIndex}
            onFocus={focusNotepad}
            onClose={(windowKey) => {
              setNotepadWindows((prev) =>
                prev.filter((n) => n.windowKey !== windowKey),
              );
            }}
            onMinimize={(windowKey) => {
              setNotepadWindows((prev) =>
                prev.map((n) =>
                  n.windowKey === windowKey ? { ...n, minimized: true } : n,
                ),
              );
            }}
            onRestore={(windowKey) => {
              notepadZRef.current += 1;
              const z = notepadZRef.current;
              setNotepadWindows((prev) =>
                prev.map((n) =>
                  n.windowKey === windowKey
                    ? { ...n, minimized: false, zIndex: z }
                    : n,
                ),
              );
            }}
          />
        );
      })}
    </aside>
  );
}
