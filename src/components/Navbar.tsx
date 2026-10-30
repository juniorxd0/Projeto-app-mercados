import React from 'react';
import {
  Tag,
  ShoppingCart,
  Sparkles,
  GraduationCap,
  Bell,
  Clock,
  Store,
  MapPin,
  TrendingDown,
} from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  basketCount: number;
  triggeredAlertsCount: number;
  selectedCity: string;
  setSelectedCity: (city: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  basketCount,
  triggeredAlertsCount,
  selectedCity,
  setSelectedCity,
}) => {
  const tabs = [
    { id: 'comparador', label: 'Comparador de Preços', icon: Tag },
    { id: 'carrinho', label: 'Cesta Econômica', icon: ShoppingCart, badge: basketCount > 0 ? basketCount : null },
    { id: 'extrator', label: 'Ler Encarte (IA)', icon: Sparkles, highlight: true },
    { id: 'treinador', label: 'Treinar Especialista', icon: GraduationCap },
    { id: 'alertas', label: 'Alertas de Preço', icon: Bell, badge: triggeredAlertsCount > 0 ? triggeredAlertsCount : null, badgeColor: 'bg-amber-500' },
    { id: 'automacao', label: 'Automação & Grátis', icon: Clock },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      {/* Top micro bar */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 px-4 py-1.5 text-xs text-white font-medium">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-3.5 h-3.5 animate-pulse" />
            <span>
              Encartes atualizados hoje: <strong>Abimar</strong>, <strong>SuperMax</strong> e <strong>Atacadão</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-emerald-100">Inteligência Artificial:</span>
            <span className="bg-white/20 text-white px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide backdrop-blur-xs">
              Gemini 3.8 Flash • Custo Zero
            </span>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center justify-between">
          <div
            onClick={() => setActiveTab('comparador')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform text-white">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-900 group-hover:text-emerald-600 transition-colors">
                  SuperCompara
                </span>
                <span className="text-[10px] uppercase font-extrabold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  IA Flash
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">Comparador de encartes da sua cidade</p>
            </div>
          </div>

          {/* Mobile City Selector */}
          <div className="md:hidden flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-700">
            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="bg-transparent text-slate-800 text-xs font-semibold focus:outline-none"
            >
              <option value="Tubarão / Região Sul (SC)">Tubarão - SC</option>
              <option value="Criciúma - SC">Criciúma - SC</option>
              <option value="Içara - SC">Içara - SC</option>
            </select>
          </div>
        </div>

        {/* Desktop City Selector */}
        <div className="hidden md:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-sm shadow-2xs">
          <MapPin className="w-4 h-4 text-emerald-600" />
          <span className="text-xs text-slate-500 font-medium">Sua Cidade:</span>
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="bg-transparent text-slate-800 text-xs font-bold focus:outline-none cursor-pointer"
          >
            <option value="Tubarão / Região Sul (SC)">Tubarão / Região Sul (SC)</option>
            <option value="Criciúma - SC">Criciúma (SC)</option>
            <option value="Içara - SC">Içara (SC)</option>
          </select>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto gap-1 border-t border-slate-100 scrollbar-none py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              } ${tab.highlight ? 'relative font-bold' : ''}`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-slate-500'}`} />
              <span>{tab.label}</span>

              {tab.badge !== null && tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold text-white ${
                    tab.badgeColor || 'bg-emerald-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}

              {tab.highlight && !isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping absolute top-2 right-2" />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
};
