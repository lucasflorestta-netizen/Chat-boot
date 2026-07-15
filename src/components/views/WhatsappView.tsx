import { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWhatsappConnection } from '../../hooks/useData';
import { api } from '../../lib/api';
import { QrCode, RefreshCw, Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';

export function WhatsappView() {
  const { connection, loading, refetch } = useWhatsappConnection();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState(false);
  const generateLock = useRef(false);

  useEffect(() => {
    if (connection?.status !== 'syncing' || connection?.qr_code) return;
    const interval = setInterval(() => {
      void refetch();
    }, 2000);
    return () => clearInterval(interval);
  }, [connection?.status, connection?.qr_code, refetch]);

  useEffect(() => {
    if (connection?.status !== 'syncing') {
      setApiWarning(false);
      return;
    }
    if (connection?.qr_code) {
      setApiWarning(false);
      return;
    }
    const timer = setTimeout(() => {
      setApiWarning(true);
    }, 20000);
    return () => clearTimeout(timer);
  }, [connection?.status, connection?.qr_code]);

  const handleGenerateQR = async () => {
    if (generateLock.current) return;
    generateLock.current = true;
    setGenerating(true);
    setError(null);
    setApiWarning(false);

    try {
      await api('/whatsapp/connect', { method: 'POST' });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao conectar WhatsApp');
    } finally {
      setGenerating(false);
      generateLock.current = false;
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      await api('/whatsapp/disconnect', { method: 'POST' });
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao desconectar');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const status = connection?.status || 'disconnected';

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-white">Conexão WhatsApp</h2>
        <p className="text-sm text-ink-300">Conecte seu WhatsApp via API NestJS (Baileys)</p>
      </div>

      {error && (
        <div className="card p-4 border-danger-500/30 bg-danger-500/10 text-sm text-danger-400">
          {error}
        </div>
      )}

      {apiWarning && (
        <div className="card p-4 border-warning-500/30 bg-warning-500/10 text-sm text-warning-400 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium text-white">API WhatsApp offline</p>
            <p className="mt-1 text-ink-300">
              Verifique se a API Nest está rodando e se o módulo WhatsApp iniciou corretamente.
            </p>
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
            status === 'connected' ? 'bg-success-500/20' :
            status === 'syncing' ? 'bg-warning-500/20' : 'bg-danger-500/20'
          }`}>
            {status === 'connected' ? <Wifi className="w-7 h-7 text-success-500" /> :
             status === 'syncing' ? <Loader2 className="w-7 h-7 text-warning-400 animate-spin" /> :
             <WifiOff className="w-7 h-7 text-danger-400" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">
              {status === 'connected' ? 'Conectado' : status === 'syncing' ? 'Aguardando QR Code...' : 'Desconectado'}
            </p>
            <p className="text-xs text-ink-300">
              {status === 'connected' && connection?.phone_number ? `Número: ${connection.phone_number}` :
               status === 'syncing' ? 'Escaneie o QR Code com seu WhatsApp' :
               'Gere um QR Code para conectar'}
            </p>
            {connection?.last_connected_at && (
              <p className="text-xs text-ink-300 mt-0.5">
                Última conexão: {new Date(connection.last_connected_at).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status === 'syncing' && (
              <button onClick={handleDisconnect} className="btn-danger text-sm" disabled={generating}>
                Cancelar
              </button>
            )}
            {status === 'connected' ? (
              <button onClick={handleDisconnect} className="btn-danger text-sm">
                Desconectar
              </button>
            ) : (
              <button onClick={handleGenerateQR} disabled={generating} className="btn-primary text-sm">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {status === 'syncing' ? 'Atualizar QR' : 'Gerar QR Code'}
              </button>
            )}
          </div>
        </div>
      </div>

      {status !== 'connected' && (
        <div className="card p-8 flex flex-col items-center">
          <div className="w-64 h-64 bg-white rounded-2xl flex items-center justify-center mb-4 p-4">
            {status === 'syncing' && connection?.qr_code ? (
              <QRCodeSVG value={connection.qr_code} size={224} level="M" includeMargin={false} />
            ) : status === 'syncing' ? (
              <div className="flex flex-col items-center text-ink-400">
                <Loader2 className="w-10 h-10 animate-spin mb-2" />
                <p className="text-sm text-center">Aguardando QR da API...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-ink-300">
                <QrCode className="w-24 h-24 mb-2" />
                <p className="text-sm text-center">Clique em &quot;Gerar QR Code&quot;</p>
              </div>
            )}
          </div>

          {status === 'syncing' && connection?.qr_code && (
            <>
              <p className="text-sm text-white font-medium mb-1">Escaneie o QR Code com seu WhatsApp</p>
              <p className="text-xs text-ink-300 text-center">
                Abra o WhatsApp → Menu → Aparelhos conectados → Conectar um aparelho
              </p>
            </>
          )}
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink-200 space-y-1">
            <p className="font-medium text-white">Como funciona a integração?</p>
            <p>A API NestJS mantém a sessão Baileys e expõe status/QR via HTTP e Socket.IO.</p>
            <p>Mensagens recebidas viram tickets automaticamente. Mensagens dos agentes são entregues via WhatsApp.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
