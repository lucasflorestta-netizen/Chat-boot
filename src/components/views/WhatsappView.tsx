import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWhatsappConnection } from '../../hooks/useData';
import { supabase } from '../../lib/supabase';
import { QrCode, RefreshCw, Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';

export function WhatsappView() {
  const { connection, loading, refetch } = useWhatsappConnection();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeWarning, setBridgeWarning] = useState(false);

  useEffect(() => {
    if (connection?.status !== 'syncing') {
      setBridgeWarning(false);
      return;
    }
    const timer = setTimeout(() => {
      if (connection?.status === 'syncing' && !connection?.qr_code) {
        setBridgeWarning(true);
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [connection?.status, connection?.qr_code]);

  const handleGenerateQR = async () => {
    setGenerating(true);
    setError(null);
    setBridgeWarning(false);

    const { data: row } = await supabase.from('whatsapp_connection').select('id').maybeSingle();
    if (!row?.id) {
      setError('Registro de conexão não encontrado. Execute as migrations do Supabase.');
      setGenerating(false);
      return;
    }

    const { error: updateError } = await supabase.from('whatsapp_connection').update({
      qr_code: null,
      status: 'syncing',
    }).eq('id', row.id);

    if (updateError) {
      setError(updateError.message);
    }
    setGenerating(false);
    refetch();
  };

  const handleDisconnect = async () => {
    if (!connection?.id) return;
    setError(null);
    const { error: updateError } = await supabase.from('whatsapp_connection').update({
      status: 'disconnected',
      qr_code: null,
      phone_number: null,
    }).eq('id', connection.id);
    if (updateError) setError(updateError.message);
    refetch();
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
        <p className="text-sm text-ink-300">Conecte seu WhatsApp Web ao sistema via WhatsApp Bridge</p>
      </div>

      {error && (
        <div className="card p-4 border-danger-500/30 bg-danger-500/10 text-sm text-danger-400">
          {error}
        </div>
      )}

      {bridgeWarning && (
        <div className="card p-4 border-warning-500/30 bg-warning-500/10 text-sm text-warning-400 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium text-white">WhatsApp Bridge não detectado</p>
            <p className="mt-1 text-ink-300">
              Inicie o serviço bridge em outro terminal com{' '}
              <code className="text-brand-300">npm run whatsapp:bridge:dev</code> e confira o arquivo{' '}
              <code className="text-brand-300">services/whatsapp-bridge/.env</code>.
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
          {status === 'connected' ? (
            <button onClick={handleDisconnect} className="btn-danger text-sm">
              Desconectar
            </button>
          ) : (
            <button onClick={handleGenerateQR} disabled={generating || status === 'syncing'} className="btn-primary text-sm">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Gerar QR Code
            </button>
          )}
        </div>
      </div>

      {status !== 'connected' && (
        <div className="card p-8 flex flex-col items-center">
          <div className="w-64 h-64 bg-white rounded-2xl flex items-center justify-center mb-4 p-4">
            {status === 'syncing' && connection?.qr_code ? (
              <QRCodeSVG value={connection.qr_code} size={224} level="M" />
            ) : status === 'syncing' ? (
              <div className="flex flex-col items-center text-ink-400">
                <Loader2 className="w-10 h-10 animate-spin mb-2" />
                <p className="text-sm text-center">Aguardando QR do bridge...</p>
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
            <p>O WhatsApp Bridge (serviço Node.js com Baileys) mantém a conexão ativa com o WhatsApp Web.</p>
            <p>Mensagens recebidas viram tickets automaticamente. Mensagens enviadas pelos agentes são entregues ao cliente via WhatsApp.</p>
            <p className="text-xs text-ink-300 pt-1">
              O bridge deve estar rodando em paralelo ao frontend. Veja o README para instruções de deploy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
