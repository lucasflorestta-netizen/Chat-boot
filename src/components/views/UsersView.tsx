import { useState } from 'react';
import { useProfiles, useSectors } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import {
  agentStatusBadgeClass,
  agentStatusLabel,
  LUNCH_AUTO_OFFLINE_LEAD_MINUTES,
} from '../../lib/agentStatus';
import { departmentLabel } from '../../lib/mappers';
import type { ApiUserRole, Profile } from '../../types';
import { ContactAvatar } from '../ContactAvatar';
import { AvatarUploadButton } from '../AvatarUploadButton';
import { UserPlus, Trash2, Shield, Loader2, Save, X, Clock, Pencil, Calendar } from 'lucide-react';

function roleLabel(apiRole: string): string {
  if (apiRole === 'ADMIN') return 'Administrador';
  if (apiRole === 'SUPERVISOR') return 'Supervisor';
  return 'Agente';
}

function toApiRole(value: string): ApiUserRole {
  if (value === 'ADMIN' || value === 'SUPERVISOR') return value;
  return 'OPERATOR';
}

function normalizeApiRole(value: string | undefined | null): ApiUserRole {
  if (value === 'ADMIN' || value === 'SUPERVISOR' || value === 'OPERATOR') return value;
  return 'OPERATOR';
}

export function UsersView() {
  const { profiles, loading, refetch } = useProfiles();
  const { profile: currentUser, refreshProfile } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Gestão de Usuários</h2>
          <p className="text-sm text-ink-300">Gerencie agentes, permissões e horários de atendimento</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <UserPlus className="w-4 h-4" />
          Criar Usuário
        </button>
      </div>

      {showAdd && (
        <CreateUserForm
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); refetch(); }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map((p) => (
          <div key={p.id} className="card p-4 hover:border-ink-600 transition-colors">
            <div className="flex items-start gap-3">
              <ContactAvatar
                name={p.name}
                profilePicUrl={p.avatar_url}
                size="md"
                rounded="lg"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                  {(p.apiRole === 'ADMIN' || p.apiRole === 'SUPERVISOR') && (
                    <Shield className="w-3.5 h-3.5 text-warning-400 flex-shrink-0" />
                  )}
                  {p.id === currentUser?.id && (
                    <span className="badge bg-brand-500/20 text-brand-300 text-[10px]">Você</span>
                  )}
                </div>
                <p className="text-xs text-ink-300 truncate">
                  @{p.username}{p.email ? ` · ${p.email}` : ''}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className={`badge text-xs ${
                    p.apiRole === 'ADMIN'
                      ? 'bg-warning-500/20 text-warning-400'
                      : p.apiRole === 'SUPERVISOR'
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-brand-500/20 text-brand-300'
                  }`}>
                    {roleLabel(p.apiRole)}
                  </span>
                  <span className="badge bg-ink-700 text-ink-200 text-xs">
                    {departmentLabel(p.department)}
                  </span>
                  <span className={`badge text-xs ${agentStatusBadgeClass(p.status)}`}>
                    {agentStatusLabel(p.status)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-ink-700 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-300 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Expediente
                </span>
                <span className={`font-medium ${p.work_start && p.work_end ? 'text-white' : 'text-ink-300'}`}>
                  {p.work_start && p.work_end
                    ? `${p.work_start.slice(0, 5)} - ${p.work_end.slice(0, 5)}`
                    : 'Não configurado'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-300 flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  Almoço
                </span>
                <span className={`font-medium ${p.lunch_start && p.lunch_end ? 'text-white' : 'text-ink-300'}`}>
                  {p.lunch_start && p.lunch_end
                    ? `${p.lunch_start.slice(0, 5)} - ${p.lunch_end.slice(0, 5)}`
                    : 'Não configurado'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-300">Conversas simultâneas</span>
                <span className="text-white font-medium">{p.max_concurrent_chats}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-300">Conta</span>
                <span className={`font-medium ${p.is_active ? 'text-success-500' : 'text-danger-400'}`}>
                  {p.is_active ? 'Ativa' : 'Inativa'}
                </span>
              </div>
            </div>

            {p.work_start && p.work_end ? (
              <ScheduleBar
                workStart={p.work_start}
                workEnd={p.work_end}
                lunchStart={p.lunch_start}
                lunchEnd={p.lunch_end}
              />
            ) : (
              <p className="mt-3 text-[11px] text-ink-400">Configure o expediente na edição do usuário.</p>
            )}

            {p.lunch_start && p.lunch_end && (
              <p className="mt-2 text-[11px] text-ink-400">
                Offline automático {LUNCH_AUTO_OFFLINE_LEAD_MINUTES} min antes do almoço; volta a Disponível ao terminar.
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={() => setEditing(p)} className="btn-secondary text-xs flex-1">
                <Pencil className="w-3 h-3" />
                Editar
              </button>
              {p.id !== currentUser?.id && (
                <button
                  onClick={async () => {
                    if (confirm(`Remover ${p.name}?`)) {
                      try {
                        await api(`/users/${p.id}`, { method: 'DELETE' });
                        refetch();
                      } catch (err) {
                        alert(err instanceof Error ? err.message : 'Falha ao remover');
                      }
                    }
                  }}
                  className="btn-ghost text-xs text-danger-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
            if (editing.id === currentUser?.id) void refreshProfile();
          }}
        />
      )}
    </div>
  );
}

function ScheduleBar({
  workStart,
  workEnd,
  lunchStart,
  lunchEnd,
}: {
  workStart: string;
  workEnd: string;
  lunchStart: string | null;
  lunchEnd: string | null;
}) {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const totalMin = 24 * 60;
  const ws = toMinutes(workStart);
  const we = toMinutes(workEnd);
  const ls = lunchStart ? toMinutes(lunchStart) : null;
  const le = lunchEnd ? toMinutes(lunchEnd) : null;

  const workLeft = (ws / totalMin) * 100;
  const workWidth = ((we - ws) / totalMin) * 100;
  const lunchLeft = ls !== null ? (ls / totalMin) * 100 : 0;
  const lunchWidth = ls !== null && le !== null ? ((le - ls) / totalMin) * 100 : 0;
  const leadStart = ls !== null ? Math.max(0, ls - LUNCH_AUTO_OFFLINE_LEAD_MINUTES) : null;
  const leadLeft = leadStart !== null ? (leadStart / totalMin) * 100 : 0;
  const leadWidth =
    leadStart !== null && ls !== null
      ? ((ls - leadStart) / totalMin) * 100
      : 0;

  return (
    <div className="mt-3">
      <div className="relative h-5 bg-ink-800 rounded-md overflow-hidden">
        <div
          className="absolute h-full bg-brand-600/40 border-x border-brand-500/50"
          style={{ left: `${workLeft}%`, width: `${Math.max(workWidth, 0)}%` }}
        />
        {leadStart !== null && ls !== null && leadWidth > 0 && (
          <div
            className="absolute h-full bg-danger-500/35 border-x border-danger-400/50"
            style={{ left: `${leadLeft}%`, width: `${Math.max(leadWidth, 0)}%` }}
            title={`Offline automático ${LUNCH_AUTO_OFFLINE_LEAD_MINUTES} min antes`}
          />
        )}
        {ls !== null && le !== null && (
          <div
            className="absolute h-full bg-warning-500/50 border-x border-warning-400/60"
            style={{ left: `${lunchLeft}%`, width: `${Math.max(lunchWidth, 0)}%` }}
          />
        )}
        {[0, 6, 12, 18, 24].map((h) => (
          <div
            key={h}
            className="absolute top-0 bottom-0 w-px bg-ink-600/50"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-ink-300 mt-0.5">
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>24h</span>
      </div>
    </div>
  );
}

function CreateUserForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { sectors } = useSectors();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ApiUserRole>('OPERATOR');
  const [sectorId, setSectorId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const trimmedEmail = email.trim();
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          ...(trimmedEmail ? { email: trimmedEmail } : {}),
          password,
          name: name.trim(),
          role: toApiRole(role),
          sectorId: sectorId || undefined,
        }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar usuário');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Criar Novo Usuário</h3>
        <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Nome</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Nome completo" />
        </div>
        <div>
          <label className="label">Usuário (login)</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" placeholder="ex: joao.silva" />
        </div>
        <div>
          <label className="label">E-mail (opcional)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="email@exemplo.com" />
        </div>
        <div>
          <label className="label">Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Mínimo 6 caracteres" />
        </div>
        <div>
          <label className="label">Nível de Acesso</label>
          <select value={role} onChange={(e) => setRole(toApiRole(e.target.value))} className="input">
            <option value="OPERATOR">Agente</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>
        <div>
          <label className="label">Setor</label>
          <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className="input">
            <option value="">Sem setor</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-danger-400 mt-2">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleCreate}
          disabled={loading || !name.trim() || !username.trim() || password.length < 6}
          className="btn-primary"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Criar
        </button>
        <button onClick={onClose} className="btn-ghost">Cancelar</button>
      </div>
    </div>
  );
}

const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function EditUserModal({ user, onClose, onSaved }: { user: Profile; onClose: () => void; onSaved: () => void }) {
  const { sectors } = useSectors();
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ApiUserRole>(normalizeApiRole(user.apiRole));
  const [sectorId, setSectorId] = useState(user.sectorId || '');
  const [maxChats, setMaxChats] = useState(user.max_concurrent_chats);
  const [workStart, setWorkStart] = useState(user.work_start || '09:00');
  const [workEnd, setWorkEnd] = useState(user.work_end || '18:00');
  const [lunchStart, setLunchStart] = useState(user.lunch_start || '');
  const [lunchEnd, setLunchEnd] = useState(user.lunch_end || '');
  const [isActive, setIsActive] = useState(user.is_active);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url);
  const [pendingAvatarRelative, setPendingAvatarRelative] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLunchStartChange = (value: string) => {
    setLunchStart(value);
    if (!value) setLunchEnd('');
  };

  const handleSave = async () => {
    setError(null);

    const trimmedName = name.trim();
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (trimmedName.length < 2) {
      setError('O nome deve ter pelo menos 2 caracteres.');
      return;
    }
    if (trimmedUsername.length < 2) {
      setError('O usuário (login) deve ter pelo menos 2 caracteres.');
      return;
    }
    if (trimmedPassword && trimmedPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (maxChats < 1 || maxChats > 50) {
      setError('O limite de conversas deve ser entre 1 e 50.');
      return;
    }

    if (workEnd <= workStart) {
      setError('O fim do expediente deve ser depois do início.');
      return;
    }
    if (lunchStart || lunchEnd) {
      if (!lunchStart || !lunchEnd) {
        setError('Informe início e fim do almoço, ou deixe ambos vazios.');
        return;
      }
      if (lunchEnd <= lunchStart) {
        setError('O fim do almoço deve ser depois do início.');
        return;
      }
      if (lunchStart < workStart || lunchEnd > workEnd) {
        setError('O horário de almoço deve estar dentro do expediente.');
        return;
      }
    }

    setSaving(true);
    try {
      const hasLunch = Boolean(lunchStart && lunchEnd);
      await api(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          username: trimmedUsername,
          email: trimmedEmail || null,
          ...(trimmedPassword ? { password: trimmedPassword } : {}),
          role: toApiRole(role),
          sectorId: sectorId || null,
          limiteSimultaneo: maxChats,
          workStart,
          workEnd,
          lunchStart: hasLunch ? lunchStart : null,
          lunchEnd: hasLunch ? lunchEnd : null,
          isActive,
          ...(pendingAvatarRelative ? { avatarUrl: pendingAvatarRelative } : {}),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <AvatarUploadButton
              profileId={user.id}
              name={name}
              avatarUrl={avatarUrl}
              size="md"
              rounded="lg"
              persist={false}
              onUploaded={({ relativeUrl, displayUrl }) => {
                setAvatarUrl(displayUrl);
                setPendingAvatarRelative(relativeUrl);
              }}
            />
            <div>
              <h3 className="text-sm font-semibold text-white">Editar Usuário</h3>
              <p className="text-[11px] text-ink-300">Foto só é salva ao clicar em Salvar</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3 mb-5">
          <p className="text-xs font-semibold text-ink-200 uppercase tracking-wide">Dados Pessoais</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Usuário (login)</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="Opcional"
              />
            </div>
            <div className="col-span-2">
              <label className="label">Nova Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Deixe em branco para manter a senha atual"
                autoComplete="new-password"
              />
              <p className="mt-1 text-[11px] text-ink-300">
                Preencha apenas se quiser alterar a senha. Mínimo de 6 caracteres.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          <p className="text-xs font-semibold text-ink-200 uppercase tracking-wide">Permissões</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nível de Acesso</label>
              <select value={role} onChange={(e) => setRole(toApiRole(e.target.value))} className="input">
                <option value="OPERATOR">Agente</option>
                <option value="SUPERVISOR">Supervisor</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
            <div>
              <label className="label">Setor</label>
              <select value={sectorId} onChange={(e) => setSectorId(e.target.value)} className="input">
                <option value="">Sem setor</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Máx. Conversas Simultâneas</label>
              <input
                type="number"
                value={maxChats}
                onChange={(e) => setMaxChats(Math.min(50, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="input"
                min={1}
                max={50}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')} className="input">
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-400" />
            <p className="text-xs font-semibold text-ink-200 uppercase tracking-wide">Horário de Atendimento</p>
          </div>

          <div className="card p-3 bg-ink-800">
            <ScheduleBar
              workStart={workStart}
              workEnd={workEnd}
              lunchStart={lunchStart || null}
              lunchEnd={lunchEnd || null}
            />
            <div className="flex items-center gap-4 mt-2 text-[10px] flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand-600/60" />
                <span className="text-ink-300">Expediente</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-danger-500/50" />
                <span className="text-ink-300">Pré-almoço (offline)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-warning-500/60" />
                <span className="text-ink-300">Almoço</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Início do Expediente</label>
              <select value={workStart} onChange={(e) => setWorkStart(e.target.value)} className="input">
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fim do Expediente</label>
              <select value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} className="input">
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Início do Almoço</label>
              <select value={lunchStart} onChange={(e) => handleLunchStartChange(e.target.value)} className="input">
                <option value="">Sem almoço</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Fim do Almoço</label>
              <select value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} className="input" disabled={!lunchStart}>
                <option value="">Sem almoço</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-[11px] text-ink-400">
            Com almoço configurado, o agente fica Offline automaticamente {LUNCH_AUTO_OFFLINE_LEAD_MINUTES} min
            antes do início e volta a Disponível ao terminar. Atendimentos já atribuídos permanecem com ele.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setWorkStart('08:00'); setWorkEnd('17:00'); setLunchStart('12:00'); setLunchEnd('13:00'); }}
              className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
            >
              08h-17h (Almoço 12h-13h)
            </button>
            <button
              type="button"
              onClick={() => { setWorkStart('09:00'); setWorkEnd('18:00'); setLunchStart('12:00'); setLunchEnd('13:00'); }}
              className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
            >
              09h-18h (Almoço 12h-13h)
            </button>
            <button
              type="button"
              onClick={() => { setWorkStart('14:00'); setWorkEnd('23:00'); setLunchStart(''); setLunchEnd(''); }}
              className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
            >
              Tarde 14h-23h
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-3 p-2.5 bg-danger-500/10 border border-danger-500/30 rounded-lg text-xs text-danger-400">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Alterações
          </button>
          <button onClick={onClose} className="btn-ghost">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
