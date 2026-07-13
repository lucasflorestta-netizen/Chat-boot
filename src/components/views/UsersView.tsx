import { useState } from 'react';
import { useProfiles } from '../../hooks/useData';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Profile, Department, UserRole } from '../../types';
import { DEPARTMENT_LABELS } from '../../types';
import { UserPlus, Trash2, Shield, Loader2, Save, X, Clock, Pencil, Calendar } from 'lucide-react';

export function UsersView() {
  const { profiles, loading, refetch } = useProfiles();
  const { profile: currentUser } = useAuth();
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
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-lg font-bold text-white">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                  {p.role === 'admin' && <Shield className="w-3.5 h-3.5 text-warning-400 flex-shrink-0" />}
                  {p.id === currentUser?.id && (
                    <span className="badge bg-brand-500/20 text-brand-300 text-[10px]">Você</span>
                  )}
                </div>
                <p className="text-xs text-ink-300 truncate">{p.email}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className={`badge text-xs ${p.role === 'admin' ? 'bg-warning-500/20 text-warning-400' : 'bg-brand-500/20 text-brand-300'}`}>
                    {p.role === 'admin' ? 'Administrador' : 'Agente'}
                  </span>
                  <span className="badge bg-ink-700 text-ink-200 text-xs">
                    {DEPARTMENT_LABELS[p.department]}
                  </span>
                </div>
              </div>
            </div>

            {/* Schedule summary */}
            <div className="mt-3 pt-3 border-t border-ink-700 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-300 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Expediente
                </span>
                <span className="text-white font-medium">
                  {p.work_start?.slice(0, 5)} - {p.work_end?.slice(0, 5)}
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
                <span className="text-ink-300">Status</span>
                <span className={`font-medium ${p.is_active ? 'text-success-500' : 'text-danger-400'}`}>
                  {p.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
            </div>

            {/* Visual schedule bar */}
            <ScheduleBar
              workStart={p.work_start || '09:00'}
              workEnd={p.work_end || '18:00'}
              lunchStart={p.lunch_start}
              lunchEnd={p.lunch_end}
            />

            <div className="flex gap-2 mt-3">
              <button onClick={() => setEditing(p)} className="btn-secondary text-xs flex-1">
                <Pencil className="w-3 h-3" />
                Editar
              </button>
              {p.id !== currentUser?.id && (
                <button
                  onClick={async () => {
                    if (confirm(`Remover ${p.name}?`)) {
                      await supabase.from('profiles').delete().eq('id', p.id);
                      refetch();
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
          onSaved={() => { setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// VISUAL SCHEDULE BAR
// Shows a 24h timeline with work hours (blue) and lunch (yellow)
// ============================================================
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

  return (
    <div className="mt-3">
      <div className="relative h-5 bg-ink-800 rounded-md overflow-hidden">
        {/* Work hours bar */}
        <div
          className="absolute h-full bg-brand-600/40 border-x border-brand-500/50"
          style={{ left: `${workLeft}%`, width: `${workWidth}%` }}
        />
        {/* Lunch break bar */}
        {ls !== null && le !== null && (
          <div
            className="absolute h-full bg-warning-500/50 border-x border-warning-400/60"
            style={{ left: `${lunchLeft}%`, width: `${lunchWidth}%` }}
          />
        )}
        {/* Hour markers */}
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

// ============================================================
// CREATE USER FORM
// ============================================================
function CreateUserForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('agent');
  const [department, setDepartment] = useState<Department>('support');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    const { data, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name, role, department },
    });
    if (signUpError) {
      const { error: err2 } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name, role, department } },
      });
      if (err2) setError(err2.message);
      else onCreated();
    } else {
      if (data.user) {
        await supabase.from('profiles').update({ role, department }).eq('id', data.user.id);
      }
      onCreated();
    }
    setLoading(false);
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
          <label className="label">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="email@exemplo.com" />
        </div>
        <div>
          <label className="label">Senha</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Mínimo 6 caracteres" />
        </div>
        <div>
          <label className="label">Nível de Acesso</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="input">
            <option value="agent">Agente</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div>
          <label className="label">Setor</label>
          <select value={department} onChange={(e) => setDepartment(e.target.value as Department)} className="input">
            <option value="support">Suporte</option>
            <option value="sales">Comercial</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-danger-400 mt-2">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={handleCreate} disabled={loading || !name || !email || !password} className="btn-primary">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Criar
        </button>
        <button onClick={onClose} className="btn-ghost">Cancelar</button>
      </div>
    </div>
  );
}

// ============================================================
// EDIT USER MODAL
// ============================================================
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

function EditUserModal({ user, onClose, onSaved }: { user: Profile; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [department, setDepartment] = useState(user.department);
  const [maxChats, setMaxChats] = useState(user.max_concurrent_chats);
  const [workStart, setWorkStart] = useState(user.work_start || '09:00');
  const [workEnd, setWorkEnd] = useState(user.work_end || '18:00');
  const [lunchStart, setLunchStart] = useState(user.lunch_start || '');
  const [lunchEnd, setLunchEnd] = useState(user.lunch_end || '');
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    if (workEnd <= workStart) {
      setError('O fim do expediente deve ser depois do início.');
      return;
    }
    if (lunchStart && lunchEnd) {
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
    const { error: updateError } = await supabase.from('profiles').update({
      name,
      role,
      department,
      max_concurrent_chats: maxChats,
      work_start: workStart,
      work_end: workEnd,
      lunch_start: lunchStart || null,
      lunch_end: lunchEnd || null,
      is_active: isActive,
    }).eq('id', user.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-sm font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <h3 className="text-sm font-semibold text-white">Editar Usuário</h3>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>

        {/* Dados pessoais */}
        <div className="space-y-3 mb-5">
          <p className="text-xs font-semibold text-ink-200 uppercase tracking-wide">Dados Pessoais</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input value={user.email || ''} disabled className="input opacity-60" />
            </div>
          </div>
        </div>

        {/* Permissões */}
        <div className="space-y-3 mb-5">
          <p className="text-xs font-semibold text-ink-200 uppercase tracking-wide">Permissões</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nível de Acesso</label>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="input">
                <option value="agent">Agente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <label className="label">Setor</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value as Department)} className="input">
                <option value="support">Suporte</option>
                <option value="sales">Comercial</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <label className="label">Máx. Conversas Simultâneas</label>
              <input type="number" value={maxChats} onChange={(e) => setMaxChats(parseInt(e.target.value) || 0)} className="input" min={1} max={50} />
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

        {/* Horário de Atendimento */}
        <div className="space-y-3 mb-5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-400" />
            <p className="text-xs font-semibold text-ink-200 uppercase tracking-wide">Horário de Atendimento</p>
          </div>

          {/* Visual preview */}
          <div className="card p-3 bg-ink-800">
            <ScheduleBar
              workStart={workStart}
              workEnd={workEnd}
              lunchStart={lunchStart || null}
              lunchEnd={lunchEnd || null}
            />
            <div className="flex items-center gap-4 mt-2 text-[10px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-brand-600/60" />
                <span className="text-ink-300">Expediente</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-warning-500/60" />
                <span className="text-ink-300">Almoço</span>
              </span>
            </div>
          </div>

          {/* Work hours */}
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

          {/* Lunch break */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Início do Almoço</label>
              <select value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} className="input">
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

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setWorkStart('08:00'); setWorkEnd('17:00'); setLunchStart('12:00'); setLunchEnd('13:00'); }}
              className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
            >
              08h-17h (Almoço 12h-13h)
            </button>
            <button
              onClick={() => { setWorkStart('09:00'); setWorkEnd('18:00'); setLunchStart('12:00'); setLunchEnd('13:00'); }}
              className="text-xs px-2.5 py-1 rounded-md bg-ink-700 text-ink-200 hover:bg-ink-600 hover:text-white transition-colors"
            >
              09h-18h (Almoço 12h-13h)
            </button>
            <button
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
