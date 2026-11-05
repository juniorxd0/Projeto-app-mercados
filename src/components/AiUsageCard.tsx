import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Sparkles,
  Gauge,
  Zap,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  Info,
} from 'lucide-react';

export interface AiRecentCall {
  id: string;
  timestamp: string;
  modelo: string;
  mercado: string;
  pagina: number;
  produtosExtraidos: number;
  sucesso: boolean;
  tempoSegundos: number;
}

export interface AiUsageData {
  limite_diario_requisicoes: number;
  limite_rpm: number;
  modelo_ativo: string;
  plano_nome: string;
  data_referencia: string;
  requisicoes_hoje: number;
  requisicoes_sucesso: number;
  requisicoes_falhas: number;
  total_paginas_extraidas_hoje: number;
  total_produtos_extraidos_hoje: number;
  ultima_requisicao: string | null;
  cota_esgotada_hoje?: boolean;
  mensagem_cota?: string | null;
  historico_recente: AiRecentCall[];
  percentual_usado: number;
  requisicoes_restantes: number;
  tempo_ate_reset: string;
}

interface AiUsageCardProps {
  compact?: boolean;
  onRefresh?: () => void;
}

export default function AiUsageCard({ compact = false, onRefresh }: AiUsageCardProps) {
  const [usage, setUsage] = useState<AiUsageData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isEditingLimits, setIsEditingLimits] = useState<boolean>(false);
  const [customDailyLimit, setCustomDailyLimit] = useState<number>(20);
  const [customRpm, setCustomRpm] = useState<number>(15);
  const [customPlanName, setCustomPlanName] = useState<string>('Gratuito (Google AI Studio - 20 RPD)');
  const [isSavingLimits, setIsSavingLimits] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  const fetchUsage = async (silent = false) => {
    if (!silent) setIsLoading(true);
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const res = await fetch('/api/ia/uso');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.usage) {
            setUsage(data.usage);
            setCustomDailyLimit(data.usage.limite_diario_requisicoes || 20);
            setCustomRpm(data.usage.limite_rpm || 15);
            setCustomPlanName(data.usage.plano_nome || 'Gratuito (Google AI Studio - 20 RPD)');
            break;
          }
        }
      } catch (err) {
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 800));
        } else {
          console.warn('Serviço de métricas de IA temporariamente indisponível no momento:', err);
        }
      }
    }

    if (!silent) setIsLoading(false);
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchUsage();
    // Poll every 30 seconds for live synchronization
    const interval = setInterval(() => {
      fetchUsage(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchUsage(true);
    if (onRefresh) onRefresh();
  };

  const applyPresetPlan = (rpd: number, rpm: number, nome: string) => {
    setCustomDailyLimit(rpd);
    setCustomRpm(rpm);
    setCustomPlanName(nome);
  };

  const handleSaveLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingLimits(true);
    setSaveSuccessMsg(null);
    try {
      const res = await fetch('/api/ia/limite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limite_diario_requisicoes: customDailyLimit,
          limite_rpm: customRpm,
          plano_nome: customPlanName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsage(data.usage);
        setIsEditingLimits(false);
        setSaveSuccessMsg('Limites de IA atualizados com sucesso!');
        setTimeout(() => setSaveSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      alert('Erro ao salvar limites: ' + err.message);
    } finally {
      setIsSavingLimits(false);
    }
  };

  if (isLoading && !usage) {
    return (
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-center gap-2 text-xs text-slate-500">
        <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
        <span>Carregando consumo e limites da IA...</span>
      </div>
    );
  }

  if (!usage) return null;

  const percentual = usage.percentual_usado || 0;
  const progressColor =
    percentual >= 90
      ? 'bg-rose-500'
      : percentual >= 70
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  const progressBg =
    percentual >= 90
      ? 'bg-rose-100'
      : percentual >= 70
      ? 'bg-amber-100'
      : 'bg-emerald-100';

  const badgeColor =
    percentual >= 90
      ? 'text-rose-700 bg-rose-50 border-rose-200'
      : percentual >= 70
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-emerald-700 bg-emerald-50 border-emerald-200';

  // Compact bar widget mode
  if (compact) {
    return (
      <div className={`rounded-xl border p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs ${
        usage.cota_esgotada_hoje ? 'bg-amber-50/80 border-amber-300' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
            usage.cota_esgotada_hoje ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {usage.cota_esgotada_hoje ? <AlertCircle className="w-4 h-4 text-amber-700" /> : <Cpu className="w-4 h-4" />}
          </div>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <span>IA: {usage.modelo_ativo}</span>
              <span className={`text-[10px] font-black px-1.5 py-0.2 rounded border ${
                usage.cota_esgotada_hoje ? 'text-amber-800 bg-amber-100 border-amber-300' : badgeColor
              }`}>
                {usage.cota_esgotada_hoje ? 'Cota Diária Esgotada' : `${percentual}% do limite diário`}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {usage.cota_esgotada_hoje
                ? `Limite diário do Free Tier atingido (${usage.requisicoes_hoje}/${usage.limite_diario_requisicoes} reqs). Reset em ${usage.tempo_ate_reset}`
                : `${usage.requisicoes_hoje} de ${usage.limite_diario_requisicoes.toLocaleString('pt-BR')} reqs usadas hoje (${usage.requisicoes_restantes.toLocaleString('pt-BR')} restantes)`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-32 sm:w-44 bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${usage.cota_esgotada_hoje ? 'bg-amber-500' : progressColor}`}
              style={{ width: `${Math.min(100, Math.max(2, percentual))}%` }}
            ></div>
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Atualizar métricas de uso da IA"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>
    );
  }

  // Full detailed panel mode
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>Consumo & Limites da IA (Gemini Vision)</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 uppercase">
                  {usage.modelo_ativo}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Acompanhamento em tempo real da cota diária de requisições, taxa por minuto e histórico de extrações.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
            title="Atualizar consumo agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-600' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={() => setIsEditingLimits(!isEditingLimits)}
            className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-purple-200"
            title="Ajustar limite diário"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Ajustar Limites</span>
          </button>
        </div>
      </div>

      {/* Quota Exhausted Alert Banner */}
      {usage.cota_esgotada_hoje && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900 shadow-2xs">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-sm">Cota Diária Gratuita do Gemini Esgotada (20/20 requisições)</span>
              <span className="bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                Renovação em {usage.tempo_ate_reset} (21:00 BRT)
              </span>
            </div>
            <p className="text-amber-800 leading-relaxed">
              O modelo Gemini atingiu o limite de 20 requisições diárias (RPD) do plano gratuito. <strong>Todos os panfletos já baixados permanecem intactos e salvos no disco</strong>, prontos para a extração continuar sem perda de dados assim que a cota for renovada.
            </p>
            <div className="pt-1 text-[11px] text-amber-700 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Dica: Caso utilize uma chave com plano pago ativado (Pay-as-you-go), clique em "Ajustar Limites" para definir o limite para 1.500 RPD.</span>
            </div>
          </div>
        </div>
      )}

      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Percentual Diário */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>Uso Diário</span>
            <Gauge className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{percentual}%</span>
            <span className="text-[11px] text-slate-500 font-medium">da cota diária</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
              style={{ width: `${Math.min(100, Math.max(2, percentual))}%` }}
            ></div>
          </div>
          <p className="text-[10px] text-slate-500">
            {usage.requisicoes_restantes.toLocaleString('pt-BR')} requisições ainda disponíveis hoje
          </p>
        </div>

        {/* Card 2: Requisições Hoje */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>Requisições Hoje</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{usage.requisicoes_hoje}</span>
            <span className="text-xs text-slate-400">/ {usage.limite_diario_requisicoes.toLocaleString('pt-BR')} max</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-emerald-700 font-bold flex items-center gap-0.5">
              <Check className="w-3 h-3" /> {usage.requisicoes_sucesso} ok
            </span>
            {usage.requisicoes_falhas > 0 && (
              <span className="text-rose-600 font-bold flex items-center gap-0.5">
                <AlertCircle className="w-3 h-3" /> {usage.requisicoes_falhas} falhas
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Taxas e Limites */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>Limites da API</span>
            <Sparkles className="w-4 h-4 text-purple-500" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Taxa por Minuto (RPM):</span>
              <span className="font-black text-slate-800">{usage.limite_rpm} RPM</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Limite Diário (RPD):</span>
              <span className="font-black text-slate-800">{usage.limite_diario_requisicoes.toLocaleString('pt-BR')} req/dia</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 truncate" title={usage.plano_nome}>
            {usage.plano_nome}
          </p>
        </div>

        {/* Card 4: Produção & Reset */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold">
            <span>Produção Hoje</span>
            <Clock className="w-4 h-4 text-sky-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-slate-900">{usage.total_produtos_extraidos_hoje}</span>
            <span className="text-xs text-slate-500">produtos</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{usage.total_paginas_extraidas_hoje} páginas lidas</span>
            <span className="text-sky-700 font-bold" title="Reset diário à meia-noite">
              Reset em {usage.tempo_ate_reset}
            </span>
          </div>
        </div>
      </div>

      {/* Edit Limits Form Accordion */}
      {isEditingLimits && (
        <form onSubmit={handleSaveLimits} className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-700" />
              <span className="text-xs font-bold text-purple-900">Configurar Limites da Chave Gemini:</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[11px] text-slate-500 font-medium">Predefinições:</span>
              <button
                type="button"
                onClick={() => applyPresetPlan(20, 15, 'Gratuito (Google AI Studio - 20 RPD)')}
                className="px-2 py-0.5 rounded bg-white hover:bg-purple-100 text-purple-800 text-[11px] font-bold border border-purple-300 transition-colors cursor-pointer"
              >
                Gratuito (20 RPD)
              </button>
              <button
                type="button"
                onClick={() => applyPresetPlan(1500, 15, 'Pay-as-you-go (1.500 RPD)')}
                className="px-2 py-0.5 rounded bg-white hover:bg-purple-100 text-purple-800 text-[11px] font-bold border border-purple-300 transition-colors cursor-pointer"
              >
                Pay-as-you-go (1.500 RPD)
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Limite Diário de Requisições (RPD)
              </label>
              <input
                type="number"
                min="5"
                max="1000000"
                value={customDailyLimit}
                onChange={(e) => setCustomDailyLimit(Number(e.target.value))}
                className="w-full bg-white border border-purple-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-600"
              />
              <span className="text-[10px] text-slate-500">Padrão Gratuito: 20 req/dia</span>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Limite por Minuto (RPM)
              </label>
              <input
                type="number"
                min="1"
                max="5000"
                value={customRpm}
                onChange={(e) => setCustomRpm(Number(e.target.value))}
                className="w-full bg-white border border-purple-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-600"
              />
              <span className="text-[10px] text-slate-500">Padrão Gratuito: 15 RPM</span>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Identificação do Plano / Nível
              </label>
              <input
                type="text"
                value={customPlanName}
                onChange={(e) => setCustomPlanName(e.target.value)}
                placeholder="Ex: Gratuito, Pay-as-you-go, Tier 1..."
                className="w-full bg-white border border-purple-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-purple-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditingLimits(false)}
              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer border border-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavingLimits}
              className="px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              {isSavingLimits ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Salvar Limites</span>
            </button>
          </div>
        </form>
      )}

      {/* Recent Extractions Toggle */}
      <div className="pt-2">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="text-xs font-bold text-slate-700 hover:text-purple-700 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span>Histórico Recente de Extrações da IA ({usage.historico_recente?.length || 0})</span>
        </button>

        {showHistory && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            {usage.historico_recente && usage.historico_recente.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Horário</th>
                    <th className="px-3 py-2">Mercado</th>
                    <th className="px-3 py-2">Página</th>
                    <th className="px-3 py-2">Modelo</th>
                    <th className="px-3 py-2">Produtos</th>
                    <th className="px-3 py-2">Tempo</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usage.historico_recente.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60 font-medium">
                      <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">{item.timestamp}</td>
                      <td className="px-3 py-2 font-bold text-slate-900">{item.mercado}</td>
                      <td className="px-3 py-2 text-slate-700">Pág. {item.pagina}</td>
                      <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{item.modelo}</td>
                      <td className="px-3 py-2 text-slate-900 font-bold">{item.produtosExtraidos} un</td>
                      <td className="px-3 py-2 text-slate-500">{item.tempoSegundos ? `${item.tempoSegundos}s` : '—'}</td>
                      <td className="px-3 py-2">
                        {item.sucesso ? (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Sucesso
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Falha
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-4 text-center text-xs text-slate-400 italic">Nenhuma extração registrada hoje ainda.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
