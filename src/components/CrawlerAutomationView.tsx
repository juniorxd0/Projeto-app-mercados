import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Clock,
  Play,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { CrawlerLogEntry } from '../types';

interface CrawlerAutomationViewProps {
  logs: CrawlerLogEntry[];
  dailyRequestsCount: number;
  dailyTokensCount: number;
  onRunBatchCrawler: () => Promise<void>;
}

export const CrawlerAutomationView: React.FC<CrawlerAutomationViewProps> = ({
  logs,
  dailyRequestsCount,
  dailyTokensCount,
  onRunBatchCrawler,
}) => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const FREE_TIER_LIMIT = 1500;
  const usagePercent = Math.min(100, Number(((dailyRequestsCount / FREE_TIER_LIMIT) * 100).toFixed(1)));

  const handleRun = async () => {
    setIsRunning(true);
    try {
      await onRunBatchCrawler();
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-br from-teal-50 via-emerald-50 to-white border border-teal-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-teal-700 text-xs font-bold uppercase tracking-wider mb-1">
              <Clock className="w-4 h-4" />
              <span>Automação em Segundo Plano (Servidor)</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              Agendamento Diário & Custo Zero
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl font-normal">
              A IA roda apenas <strong>1 vez por dia</strong> no servidor (às 06:00 da manhã). O aplicativo do usuário apenas lê o banco de dados em milissegundos. Assim você aproveita a cota gratuita do Gemini Flash sem gastar 1 centavo!
            </p>
          </div>

          <button
            onClick={handleRun}
            disabled={isRunning}
            className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm shrink-0 ${
              isRunning
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
            }`}
          >
            <Play className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'Executando Varredura...' : 'Executar Varredura das 06:00 Agora'}</span>
          </button>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Daily Requests Meter */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1 font-medium">
            <span>Requisições Hoje (RPD)</span>
            <span className="font-bold text-emerald-700">{usagePercent}% da cota</span>
          </div>
          <div className="text-2xl font-black text-slate-900">
            {dailyRequestsCount}{' '}
            <span className="text-xs font-normal text-slate-400">/ 1.500 grátis</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 mt-3 overflow-hidden border border-slate-200/60">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(4, usagePercent)}%` }}
            />
          </div>
        </div>

        {/* Card 2: Tokens Consumed */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1 font-medium">Tokens de Imagem & Texto</div>
          <div className="text-2xl font-black text-slate-900">
            {dailyTokensCount.toLocaleString('pt-BR')}
          </div>
          <p className="text-[11px] text-slate-500 mt-2 font-medium">
            Média de ~1.800 tokens por página de encarte.
          </p>
        </div>

        {/* Card 3: Financial Cost */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1 font-medium">Custo Estimado da IA</div>
          <div className="text-2xl font-black text-emerald-700">R$ 0,00</div>
          <p className="text-[11px] text-emerald-800 mt-2 font-bold">
            100% coberto pelo Free Tier do Google AI Studio.
          </p>
        </div>

        {/* Card 4: Next Run */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1 font-medium">Próxima Execução Automática</div>
          <div className="text-2xl font-black text-slate-900">Amanhã, 06:00</div>
          <p className="text-[11px] text-slate-500 mt-2 font-medium">
            Cron job diário programado no servidor Node.js.
          </p>
        </div>
      </div>

      {/* Execution Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-slate-900 text-sm">Histórico de Varreduras do Servidor</h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">{logs.length} execuções registradas</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {logs.map((log) => (
            <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{log.marketName}</span>
                  <span className="text-[10px] text-slate-500 font-normal">({log.timestamp})</span>
                </div>
                <div className="text-slate-600 mt-0.5 truncate font-normal">{log.message}</div>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-slate-700">
                <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[11px] font-bold text-slate-800 border border-slate-200">
                  {log.pagesScanned} págs • {log.itemsExtracted} itens
                </span>
                <span className="text-emerald-700 font-mono text-[11px] font-bold">
                  {log.tokensUsed.toLocaleString('pt-BR')} tokens
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
