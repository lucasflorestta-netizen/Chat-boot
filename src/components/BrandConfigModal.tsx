import { useEffect, useState } from 'react';
import { AlertCircle, Check, Image as ImageIcon, Loader2, Lock, Save, X } from 'lucide-react';
import { api, uploadFile } from '../lib/api';
import {
  DEFAULT_BRAND_NAME,
  resolveBrandLogoSrc,
  writeStoredBrand,
} from '../lib/brand';
import { mapAppearanceSettings } from '../lib/mappers';
import type { AppearanceSettings, AutoMessageSettings } from '../types';

const BRAND_SUPER_PASSWORD = '260598';

type Step = 'password' | 'form';

interface BrandConfigModalProps {
  open: boolean;
  onClose: () => void;
  appearance: AppearanceSettings | null;
  autoSettings: AutoMessageSettings | null;
  onSaved?: () => void;
}

export function BrandConfigModal({
  open,
  onClose,
  appearance,
  autoSettings,
  onSaved,
}: BrandConfigModalProps) {
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [brandName, setBrandName] = useState(DEFAULT_BRAND_NAME);
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [protocolName, setProtocolName] = useState('CC');

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('password');
    setPassword('');
    setPasswordError(null);
    setFeedback(null);
    setBrandName(appearance?.brandName?.trim() || DEFAULT_BRAND_NAME);
    setBrandLogoUrl(appearance?.brandLogoUrl ?? null);
    setProtocolName(autoSettings?.protocol_name?.trim() || 'CC');
  }, [open, appearance, autoSettings]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  if (!open) return null;

  const handleUnlock = () => {
    if (password === BRAND_SUPER_PASSWORD) {
      setStep('form');
      setPassword('');
      setPasswordError(null);
    } else {
      setPasswordError('Super senha inválida.');
    }
  };

  const handleLogoChange = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setFeedback(null);
    try {
      const url = await uploadFile(file);
      setBrandLogoUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao enviar imagem.';
      setFeedback({ type: 'error', message });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const name = brandName.trim();
    const protocol = protocolName.trim();
    if (!name) {
      setFeedback({ type: 'error', message: 'Informe o nome exibido na tela.' });
      return;
    }
    if (!protocol) {
      setFeedback({ type: 'error', message: 'Informe o nome do protocolo.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const brandData = await api<any>('/appearance-settings/brand', {
        method: 'PUT',
        body: JSON.stringify({
          brandName: name,
          brandLogoUrl,
          superPassword: BRAND_SUPER_PASSWORD,
        }),
      });
      const mappedBrand = mapAppearanceSettings(brandData);
      writeStoredBrand(mappedBrand.brandName, mappedBrand.brandLogoUrl);

      await api<any>('/auto-message-settings', {
        method: 'PUT',
        body: JSON.stringify({ protocolName: protocol }),
      });

      setBrandName(mappedBrand.brandName);
      setBrandLogoUrl(mappedBrand.brandLogoUrl);
      setProtocolName(protocol);
      setFeedback({ type: 'success', message: 'Configurações salvas com sucesso.' });
      onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao salvar.';
      setFeedback({ type: 'error', message });
    } finally {
      setSaving(false);
    }
  };

  const logoPreview = resolveBrandLogoSrc(brandLogoUrl);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="brand-config-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="brand-config-title" className="text-lg font-bold text-white">
              {step === 'password' ? 'Acesso restrito' : 'Configuração do sistema'}
            </h2>
            <p className="text-xs text-ink-300 mt-0.5">
              {step === 'password'
                ? 'Digite a super senha para continuar.'
                : 'Nome, logo e protocolo enviados ao cliente.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
              feedback.type === 'success'
                ? 'bg-success-500/15 text-success-400'
                : 'bg-red-500/15 text-red-400'
            }`}
          >
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {feedback.message}
          </div>
        )}

        {step === 'password' ? (
          <div className="space-y-3">
            <div>
              <label className="label">Super senha</label>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnlock();
                }}
                className="input"
                placeholder="Digite a super senha"
              />
              {passwordError && (
                <p className="mt-1.5 text-xs text-red-400">{passwordError}</p>
              )}
            </div>
            <button type="button" onClick={handleUnlock} className="btn-primary w-full">
              <Lock className="w-4 h-4" />
              Desbloquear
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Nome na tela</label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="input"
                placeholder={DEFAULT_BRAND_NAME}
              />
              <p className="mt-1 text-xs text-ink-400">
                Aparece ao lado da logo no menu e na tela de login.
              </p>
            </div>

            <div>
              <label className="label">Logo</label>
              <div className="flex items-center gap-3">
                <img
                  src={logoPreview}
                  alt=""
                  className="h-14 w-14 rounded-lg object-contain object-top bg-ink-800"
                />
                <div className="flex-1 space-y-2">
                  <label className="btn-secondary inline-flex cursor-pointer items-center gap-2 text-sm">
                    <ImageIcon className="w-4 h-4" />
                    {uploading ? 'Enviando…' : 'Escolher imagem'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading || saving}
                      onChange={(e) => {
                        void handleLogoChange(e.target.files?.[0] ?? null);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {uploading && (
                    <p className="text-xs text-ink-300 flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Enviando imagem…
                    </p>
                  )}
                  {brandLogoUrl && (
                    <button
                      type="button"
                      className="block text-xs text-ink-300 hover:text-white"
                      onClick={() => setBrandLogoUrl(null)}
                    >
                      Restaurar logo padrão
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="label">Nome do protocolo</label>
              <input
                type="text"
                value={protocolName}
                onChange={(e) => setProtocolName(e.target.value)}
                className="input"
                placeholder="CC"
              />
              <p className="mt-1 text-xs text-ink-400">
                Prefixo do número do protocolo (ex.: NewGen → NewGen20260720-0001).
                Também usado em {'{{protocolName}}'} nas mensagens.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || uploading}
              className="btn-primary w-full"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salvar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
