import React from 'react';
import confetti from 'canvas-confetti';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Sparkles,
  TrendingDown,
  ShieldCheck,
} from 'lucide-react';
import { BasketItem, CanonicalProduct, Market } from '../types';

interface BasketSimulatorProps {
  basket: BasketItem[];
  products: CanonicalProduct[];
  markets: Market[];
  onUpdateQuantity: (canonicalId: string, delta: number) => void;
  onRemoveItem: (canonicalId: string) => void;
  onClearBasket: () => void;
  onAddQuickBasket: (type: 'cesta-basica' | 'churrasco' | 'limpeza') => void;
}

export const BasketSimulator: React.FC<BasketSimulatorProps> = ({
  basket,
  products,
  markets,
  onUpdateQuantity,
  onRemoveItem,
  onClearBasket,
  onAddQuickBasket,
}) => {
  const formatBRL = (val: number) =>
    `R$ ${val.toFixed(2).replace('.', ',')}`;

  // Calculate market totals
  const marketScores = markets.map((m) => {
    let total = 0;
    let foundCount = 0;
    const itemDetails: Array<{ name: string; price: number; quantity: number }> = [];

    for (const item of basket) {
      const prod = products.find((p) => p.id === item.canonicalId);
      if (!prod) continue;

      const offer = prod.offers.find((o) => o.marketId === m.id);
      if (offer) {
        const unitPrice = offer.preco_promocional ?? offer.preco_regular;
        total += unitPrice * item.quantity;
        foundCount++;
        itemDetails.push({ name: prod.name, price: unitPrice * item.quantity, quantity: item.quantity });
      }
    }

    return {
      marketId: m.id,
      marketName: m.name,
      badgeBg: m.badgeBg,
      color: m.color,
      total,
      foundCount,
      missingCount: basket.length - foundCount,
      itemDetails,
    };
  });

  // Sort by lowest total
  marketScores.sort((a, b) => {
    if (a.missingCount !== b.missingCount) {
      return a.missingCount - b.missingCount;
    }
    return a.total - b.total;
  });

  const bestSingleStore = marketScores[0];
  const worstSingleStore = marketScores[marketScores.length - 1];

  // Optimal mixed purchase strategy
  let optimalTotal = 0;
  for (const item of basket) {
    const prod = products.find((p) => p.id === item.canonicalId);
    if (!prod) continue;

    const lowestPrice = prod.lowestPrice;
    optimalTotal += lowestPrice * item.quantity;
  }

  const maxSavingsVsWorst = worstSingleStore?.total && optimalTotal > 0
    ? worstSingleStore.total - optimalTotal
    : 0;

  const handleCelebrate = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-white border border-emerald-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Simulador de Compra Inteligente</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              Cesta Básica & Comparador de Carrinho
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl font-normal">
              Monte sua lista de compras e descubra instantaneamente em qual mercado da cidade a sua compra total sai mais barata ou quanto você economiza dividindo os itens.
            </p>
          </div>

          {/* Quick preset buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 w-full sm:w-auto font-medium">Carregar Cesta Pronta:</span>
            <button
              onClick={() => {
                onAddQuickBasket('cesta-basica');
                handleCelebrate();
              }}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 border border-slate-200 transition-all flex items-center gap-1.5 shadow-2xs hover:border-emerald-300"
            >
              <span>🛒 Cesta Básica</span>
            </button>
            <button
              onClick={() => {
                onAddQuickBasket('churrasco');
                handleCelebrate();
              }}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 border border-slate-200 transition-all flex items-center gap-1.5 shadow-2xs hover:border-orange-300"
            >
              <span>🥩 Churrasco</span>
            </button>
            <button
              onClick={() => {
                onAddQuickBasket('limpeza');
                handleCelebrate();
              }}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-xs font-bold text-slate-800 border border-slate-200 transition-all flex items-center gap-1.5 shadow-2xs hover:border-sky-300"
            >
              <span>🧼 Limpeza</span>
            </button>
          </div>
        </div>
      </div>

      {basket.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xl mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Sua cesta está vazia</h3>
          <p className="text-sm text-slate-600 mb-6">
            Adicione produtos do comparador ou clique em um dos atalhos acima para carregar uma cesta de exemplo e ver o comparativo de preços entre os supermercados.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                onAddQuickBasket('cesta-basica');
                handleCelebrate();
              }}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-md shadow-emerald-600/20"
            >
              Carregar Cesta Básica com 5 Itens
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Basket Items List */}
          <div className="lg:col-span-1 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col h-fit">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Itens Selecionados ({basket.reduce((acc, i) => acc + i.quantity, 0)})
                </h3>
              </div>
              <button
                onClick={onClearBasket}
                className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1 font-bold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {basket.map((item) => {
                const prod = products.find((p) => p.id === item.canonicalId);
                if (!prod) return null;

                return (
                  <div
                    key={item.canonicalId}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 truncate">{prod.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {prod.brand} • {prod.volumeLabel}
                      </div>
                      <div className="text-[11px] text-emerald-700 font-bold mt-0.5">
                        Melhor preço: {formatBRL(prod.lowestPrice)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs">
                      <button
                        onClick={() => onUpdateQuantity(item.canonicalId, -1)}
                        className="p-0.5 hover:text-emerald-600 text-slate-500 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-bold text-slate-900 w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => onUpdateQuantity(item.canonicalId, 1)}
                        className="p-0.5 hover:text-emerald-600 text-slate-500 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => onRemoveItem(item.canonicalId)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Comparative Totals Across Supermarkets */}
          <div className="lg:col-span-2 space-y-5">
            {/* Recommendation Card */}
            {bestSingleStore && (
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white border-2 border-emerald-500 rounded-2xl p-5 shadow-sm relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Vencedor de Preço na Cidade:</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-900">
                      {bestSingleStore.marketName}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5 font-medium">
                      Para comprar toda a sua lista em um único local, este é o supermercado mais econômico hoje.
                    </p>
                  </div>

                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-xs text-slate-500 block font-medium">Total da sua cesta:</span>
                    <span className="text-3xl font-black text-emerald-700">
                      {formatBRL(bestSingleStore.total)}
                    </span>
                  </div>
                </div>

                {/* Split purchase bonus */}
                {maxSavingsVsWorst > 0 && (
                  <div className="mt-4 pt-3 border-t border-emerald-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="text-slate-700">
                      💡 <strong>Dica de Economia Máxima:</strong> Comprando o melhor item em cada mercado você gasta apenas{' '}
                      <strong className="text-emerald-700">{formatBRL(optimalTotal)}</strong>.
                    </div>
                    <div className="text-emerald-800 font-bold bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 whitespace-nowrap">
                      Economia de {formatBRL(maxSavingsVsWorst)}!
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Markets Ranking List */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center justify-between">
                <span>Classificação Geral por Mercado</span>
                <span className="text-xs text-slate-500 font-normal">
                  Comparativo com base nos encartes vigentes
                </span>
              </h4>

              <div className="space-y-2.5">
                {marketScores.map((score, idx) => {
                  const isFirst = idx === 0;
                  const diffVsBest = score.total - (bestSingleStore?.total || 0);

                  return (
                    <div
                      key={score.marketId}
                      className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                        isFirst
                          ? 'bg-emerald-50/70 border-emerald-300 text-slate-900 shadow-2xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isFirst
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {idx + 1}º
                        </span>

                        <div>
                          <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                            <span>{score.marketName}</span>
                            {isFirst && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                                Mais Barato
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">
                            {score.foundCount} de {basket.length} itens encontrados no encarte atual
                            {score.missingCount > 0 && ` (${score.missingCount} sem promoção direta)`}
                          </div>
                        </div>
                      </div>

                      <div className="text-right sm:shrink-0">
                        <div className="text-lg font-black text-slate-900">
                          {formatBRL(score.total)}
                        </div>
                        {diffVsBest > 0 && (
                          <div className="text-xs text-rose-600 font-bold">
                            +{formatBRL(diffVsBest)} mais caro
                          </div>
                        )}
                        {isFirst && (
                          <div className="text-xs text-emerald-700 font-bold">
                            Melhor preço fechado
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
