import React from 'react';
import {
  TrendingDown,
  ShoppingCart,
  Bell,
  CheckCircle2,
} from 'lucide-react';
import { CanonicalProduct } from '../types';

interface ProductCardProps {
  product: CanonicalProduct;
  onAddToBasket: (product: CanonicalProduct) => void;
  onCreateAlert: (product: CanonicalProduct) => void;
  inBasketCount?: number;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToBasket,
  onCreateAlert,
  inBasketCount = 0,
}) => {
  const formatBRL = (val: number) =>
    `R$ ${val.toFixed(2).replace('.', ',')}`;

  const hasMultipleOffers = product.offers.length > 1;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 transition-all shadow-xs hover:shadow-md flex flex-col overflow-hidden group">
      {/* Top Banner / Category & Savings Tag */}
      <div className="p-4 pb-0 flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
          {product.category}
        </span>

        {hasMultipleOffers && product.maxSavingsAmount > 0 && (
          <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold shadow-2xs">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>
              Economize até {formatBRL(product.maxSavingsAmount)} ({product.maxSavingsPercent}%)
            </span>
          </div>
        )}
      </div>

      {/* Main Product Info */}
      <div className="p-4 flex gap-4">
        {/* Product Image */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 relative flex items-center justify-center">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <span className="text-2xl">🛒</span>
          )}
        </div>

        {/* Name and brand */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold mb-0.5">
            <span>{product.brand}</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500 font-medium">{product.volumeLabel}</span>
          </div>

          <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors">
            {product.name}
          </h3>

          {/* Lowest Price Big Display */}
          <div className="mt-2.5 flex items-baseline gap-1.5 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">A partir de</span>
            <span className="text-2xl font-black text-emerald-600 tracking-tight">
              {formatBRL(product.lowestPrice)}
            </span>
            <span className="text-xs text-slate-400 font-medium">no</span>
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {product.cheapestMarketName.split(' ')[0]}
            </span>
          </div>
        </div>
      </div>

      {/* Side-by-side store price comparison table */}
      <div className="px-4 pb-3 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center justify-between">
          <span>Comparativo por Mercado:</span>
          <span className="text-slate-400 font-normal">
            {product.offers.length} {product.offers.length === 1 ? 'mercado' : 'mercados'}
          </span>
        </div>

        <div className="space-y-1.5">
          {product.offers
            .slice()
            .sort((a, b) => (a.preco_promocional ?? a.preco_regular) - (b.preco_promocional ?? b.preco_regular))
            .map((offer, idx) => {
              const effectivePrice = offer.preco_promocional ?? offer.preco_regular;
              const isCheapest = effectivePrice === product.lowestPrice;

              return (
                <div
                  key={offer.id || idx}
                  className={`p-2 rounded-xl text-xs flex items-center justify-between transition-all ${
                    isCheapest
                      ? 'bg-emerald-50/90 border border-emerald-300 text-emerald-950 font-medium shadow-2xs'
                      : 'bg-slate-50 border border-slate-200/80 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isCheapest ? (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-xs">
                        1º
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {idx + 1}º
                      </span>
                    )}

                    <div className="truncate">
                      <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                        <span>{offer.marketName}</span>
                        {offer.tipo_promocao === 'CLUBE_FIDELIDADE' && (
                          <span className="text-[10px] bg-sky-100 text-sky-800 border border-sky-200 px-1 rounded font-bold">
                            Clube
                          </span>
                        )}
                        {offer.tipo_promocao === 'ATACADO_VOLUME' && (
                          <span className="text-[10px] bg-orange-100 text-orange-800 border border-orange-200 px-1 rounded font-bold">
                            Atacado
                          </span>
                        )}
                        {offer.tipo_promocao === 'FRACIONADO_100G' && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200 px-1 rounded font-bold">
                            100g
                          </span>
                        )}
                      </div>

                      {offer.condicao_detalhes && (
                        <div className="text-[10px] text-slate-500 truncate">
                          {offer.condicao_detalhes}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 ml-2">
                    <div className="font-bold text-sm text-slate-900">
                      {formatBRL(effectivePrice)}
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      {offer.preco_unitario_label}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Card Action Buttons */}
      <div className="p-3 bg-slate-50 border-t border-slate-200/90 flex items-center gap-2">
        <button
          onClick={() => onAddToBasket(product)}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs ${
            inBasketCount > 0
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
              : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-200'
          }`}
        >
          {inBasketCount > 0 ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
              <span>Na Cesta ({inBasketCount})</span>
            </>
          ) : (
            <>
              <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
              <span>Adicionar à Cesta</span>
            </>
          )}
        </button>

        <button
          onClick={() => onCreateAlert(product)}
          title="Criar alerta se este produto baixar de preço"
          className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 hover:text-amber-600 transition-colors border border-slate-200 shadow-2xs"
        >
          <Bell className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
