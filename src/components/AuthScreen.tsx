import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Headphones, Loader2, Mail, Lock, User, AlertCircle, RefreshCw } from 'lucide-react';

export function AuthScreen() {
  const { signIn, signUp, session, profileError, refreshProfile } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, name);
    setLoading(false);
    if (result.error) setError(result.error);
  };

  const handleRetryProfile = async () => {
    setRetrying(true);
    await refreshProfile();
    setRetrying(false);
  };

  if (session && profileError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-950 px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-warning-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Problema ao carregar perfil</h2>
          <p className="text-sm text-ink-300 mb-4">{profileError}</p>
          <button onClick={handleRetryProfile} disabled={retrying} className="btn-primary w-full">
            {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-800/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="card p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center mb-4 shadow-lg shadow-brand-900/50">
              <Headphones className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">HelpDesk CRM</h1>
            <p className="text-sm text-ink-300 mt-1">Atendimento WhatsApp Integrado</p>
          </div>

          <div className="flex gap-1 p-1 bg-ink-800 rounded-lg mb-6">
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'signin' ? 'bg-brand-600 text-white' : 'text-ink-300 hover:text-white'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'signup' ? 'bg-brand-600 text-white' : 'text-ink-300 hover:text-white'
              }`}
            >
              Cadastrar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label">Nome</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input pl-10"
                    placeholder="Seu nome"
                    required
                  />
                </div>
              </div>
            )}
            <div>
              <label className="label">Email ou usuário</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-10"
                  placeholder="seu@email.com ou usuário"
                  required
                />
              </div>
            </div>
            <div>
              <label className="label">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-300" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-danger-500/10 border border-danger-500/30 rounded-lg text-sm text-danger-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mode === 'signin' ? 'Entrar' : 'Criar Conta'}
            </button>
          </form>

          <p className="text-xs text-ink-300 text-center mt-6">
            {mode === 'signin'
              ? 'O primeiro usuário cadastrado se torna administrador automaticamente.'
              : 'Após o cadastro, faça login para acessar o sistema.'}
          </p>
        </div>
      </div>
    </div>
  );
}
