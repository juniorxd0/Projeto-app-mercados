import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Bell,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import { PriceAlert, CanonicalProduct } from '../types';

interface AlertsViewProps {
  alerts: PriceAlert[];
  products: CanonicalProduct[];
  onCreateAlert: (newAlert: {
    productName: string;
    canonicalId?: string;
    targetMaxPrice: number;
    userEmail: string;
  }) => Promise<void>;
  onDeleteAlert: (id: string) => Promise<void>;
  onTestTriggerAlert: (id: string) => Promise<void>;
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  alerts,
  products,
  onCreateAlert,
  onDeleteAlert,
  onTestTriggerAlert,
}) => {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [customName, setCustomName] = useState<string>('');
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [email, setEmail] = useState<string>('juniorxd2555@gmail.com');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const formatBRL = (val: number) =>
    `R$ ${val.toFixed(2).replace('.', ',')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPrice) return;

    let prodName = customName;
    if (selectedProductId) {
      const p = products.find((prod) => prod.id === selectedProductId);
      if (p) prodName = `${p.name} (${p.volumeLabel})`;
    }

    if (!prodName) return;

    setIsSubmitting(true);
    try {
      await onCreateAlert({
        productName: prodName,
        canonicalId: selectedProductId || undefined,
        targetMaxPrice: Number(targetPrice),
        userEmail: email,
      });

      setShowModal(false);
      setCustomName('');
      setSelectedProductId('');
      setTargetPrice('');
      confetti({
        particleCount: 50,
        spread: 50,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggeredCount = alerts.filter((a) => a.matchedOffer).length;

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-white border border-amber-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-700 text-xs font-bold uppercase tracking-wider mb-1">
              <Bell className="w-4 h-4" />
              <span>Monitoramento em Tempo Real</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              Radar de Preços & Alertas Automáticos
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl font-normal">
              Defina o valor máximo que você aceita pagar por cada item (como café, leite ou sabão em pó). Assim que o robô ler um novo encarte que atinja seu preço, você recebe o aviso instantaneamente!
            </p>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-amber-500/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Novo Alerta de Preço</span>
          </button>
        </div>
      </div>

      {/* Triggered Alerts Highlights */}
      {triggeredCount > 0 && (
        <div className="bg-emerald-50/90 border border-emerald-300 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm mb-3">
            <Zap className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span>{triggeredCount} Ofertas Bateram sua Meta de Preço Hoje!</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {alerts
              .filter((a) => a.matchedOffer)
              .map((alert) => (
                <div
                  key={alert.id}
                  className="bg-white border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs shadow-2xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate">{alert.productName}</div>
                    <div className="text-emerald-700 font-bold mt-0.5">
                      Encontrado no {alert.matchedOffer?.marketName} por {formatBRL(alert.matchedOffer!.price)}!
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                      Sua meta era {formatBRL(alert.targetMaxPrice)} • {alert.matchedOffer?.validade}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Disparado Hoje
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* All Alerts List */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h3 className="font-bold text-slate-900 text-sm mb-4 flex items-center justify-between">
          <span>Seus Alertas Salvos ({alerts.length})</span>
          <span className="text-xs text-slate-500 font-normal">
            Verificados a cada novo encarte processado
          </span>
        </h3>

        {alerts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs font-medium">
            Nenhum alerta cadastrado ainda. Clique em "Criar Novo Alerta de Preço" para começar.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span>{alert.productName}</span>
                    {alert.matchedOffer ? (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Preço Atingido
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        Monitorando
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5 font-medium">
                    Avisar quando ficar abaixo de <strong className="text-amber-700 font-bold">{formatBRL(alert.targetMaxPrice)}</strong> • Notificar: {alert.userEmail}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onTestTriggerAlert(alert.id)}
                    title="Simular disparo de notificação"
                    className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] border border-slate-200 transition-colors"
                  >
                    Testar Disparo
                  </button>
                  <button
                    onClick={() => onDeleteAlert(alert.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Create Alert */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">Criar Alerta de Preço</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Selecione um Produto do Catálogo:
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    if (e.target.value) {
                      const p = products.find((prod) => prod.id === e.target.value);
                      if (p) setTargetPrice(p.lowestPrice.toFixed(2));
                    }
                  }}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="">-- Ou digite um nome livre abaixo --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.volumeLabel}) - Menor hoje: {formatBRL(p.lowestPrice)}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedProductId && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Ou Nome Livre do Produto / Marca:
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Ex: Leite Moça, Cerveja Heineken, Arroz Tio João"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Preço Máximo Desejado (R$):
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="Ex: 18.00"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  E-mail para Notificação:
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold shadow-xs"
                >
                  Salvar Alerta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
