import { useState } from 'react';
import { useWhatsappConnection } from '../../hooks/useData';
import { supabase } from '../../lib/supabase';
import { QrCode, RefreshCw, Wifi, WifiOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function WhatsappView() {
  const { connection, loading, refetch } = useWhatsappConnection();
  const [generating, setGenerating] = useState(false);

  const handleGenerateQR = async () => {
    setGenerating(true);
    // Simulate QR code generation - in production this calls the WhatsApp Baileys API
    await new Promise((r) => setTimeout(r, 2000));
    const fakeQr = `whatsapp-web-qr-${Date.now()}`;
    await supabase.from('whatsapp_connection').update({
      qr_code: fakeQr,
      status: 'syncing',
    }).eq('id', connection?.id || '');
    setGenerating(false);
    refetch();
  };

  const handleDisconnect = async () => {
    await supabase.from('whatsapp_connection').update({
      status: 'disconnected',
      qr_code: null,
      phone_number: null,
    }).eq('id', connection?.id || '');
    refetch();
  };

  const handleConnect = async () => {
    // Simulate successful connection after QR scan
    await supabase.from('whatsapp_connection').update({
      status: 'connected',
      qr_code: null,
      phone_number: '+55 11 99999-9999',
      last_connected_at: new Date().toISOString(),
    }).eq('id', connection?.id || '');
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
        <p className="text-sm text-ink-300">Conecte seu WhatsApp Web ao sistema</p>
      </div>

      {/* Status card */}
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
              {status === 'connected' ? 'Conectado' : status === 'syncing' ? 'Sincronizando...' : 'Desconectado'}
            </p>
            <p className="text-xs text-ink-300">
              {status === 'connected' && connection?.phone_number ? `Número: ${connection.phone_number}` :
               status === 'syncing' ? 'Aguardando leitura do QR Code...' :
               'Escaneie o QR Code para conectar'}
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
            <button onClick={handleGenerateQR} disabled={generating} className="btn-primary text-sm">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Gerar QR Code
            </button>
          )}
        </div>
      </div>

      {/* QR Code display */}
      {status !== 'connected' && (
        <div className="card p-8 flex flex-col items-center">
          <div className="w-64 h-64 bg-white rounded-2xl flex items-center justify-center mb-4 relative overflow-hidden">
            {status === 'syncing' && connection?.qr_code ? (
              <>
                {/* Simulated QR code visual */}
                <div className="absolute inset-4 grid grid-cols-12 gap-0.5">
                  {Array.from({ length: 144 }).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-sm ${(i * 7 + 3) % 3 === 0 ? 'bg-ink-950' : 'bg-white'}`}
                    />
                  ))}
                </div>
                <div className="absolute top-2 left-2 w-12 h-12 border-4 border-ink-950 rounded-md" />
                <div className="absolute top-2 right-2 w-12 h-12 border-4 border-ink-950 rounded-md" />
                <div className="absolute bottom-2 left-2 w-12 h-12 border-4 border-ink-950 rounded-md" />
              </>
            ) : (
              <div className="flex flex-col items-center text-ink-300">
                <QrCode className="w-24 h-24 mb-2" />
                <p className="text-sm">Clique em "Gerar QR Code"</p>
              </div>
            )}
          </div>

          {status === 'syncing' ? (
            <>
              <p className="text-sm text-white font-medium mb-1">Escaneie o QR Code com seu WhatsApp</p>
              <p className="text-xs text-ink-300 mb-4 text-center">
                Abra o WhatsApp → Menu → Aparelhos conectados → Conectar um aparelho
              </p>
              <button onClick={handleConnect} className="btn-primary">
                <CheckCircle className="w-4 h-4" />
                Simular Conexão (Demo)
              </button>
            </>
          ) : (
            <p className="text-sm text-ink-300 text-center">
              O QR Code aparecerá aqui após a geração
            </p>
          )}
        </div>
      )}

      {/* Info card */}
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-ink-200 space-y-1">
            <p className="font-medium text-white">Como funciona a integração?</p>
            <p>O sistema utiliza a biblioteca Baileys/Venom para conectar ao WhatsApp Web via API.</p>
            <p>Após escanear o QR Code, todas as mensagens recebidas serão automaticamente convertidas em tickets de atendimento.</p>
            <p className="text-xs text-ink-300 pt-1">
              Em ambiente de produção, um webhook da edge function processa as mensagens em tempo real.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
