import React, { useState, useEffect } from 'react';
import {
  Building2,
  Calendar,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Loader2,
  Play,
  CheckCircle2,
  Sparkles,
  Link2,
  ExternalLink,
  Power,
  RefreshCw,
  Terminal,
  FileCheck,
  Globe,
  Sliders,
  X,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import AiUsageCard from './AiUsageCard.tsx';

export interface MercadoUrl {
  id?: string;
  mercado_id?: string;
  descricao: string;
  url: string;
  ativo?: boolean;
}

export interface Mercado {
  id: string;
  nome: string;
  ativo: boolean;
  regras_extracao_ia: any | null;
  criado_em: string;
  atualizado_em: string;
  urls: MercadoUrl[];
}

export interface ConfiguracaoRotina {
  id: string;
  dias_semana: number[];
  horario_execucao: string;
  frequencia_cron: string;
  ativo: boolean;
  ultima_execucao: string | null;
  status_ultima_execucao: 'SUCESSO' | 'FALHA' | 'PROCESSANDO' | null;
  log_ultima_execucao: string | null;
  proxima_execucao?: string | null;
  contagem_regressiva?: string;
}

export interface UrlValidationState {
  isValidating: boolean;
  totalEncontrados?: number;
  validade?: string;
  timestamp?: string;
  tempoResposta?: string;
  error?: string | null;
  status: 'idle' | 'loading' | 'success' | 'warning' | 'error';
}

const DIAS_SEMANA_MAP = [
  { valor: 0, sigla: 'D', nome: 'Domingo' },
  { valor: 1, sigla: 'S', nome: 'Segunda-feira' },
  { valor: 2, sigla: 'T', nome: 'Terça-feira' },
  { valor: 3, sigla: 'Q', nome: 'Quarta-feira' },
  { valor: 4, sigla: 'Q', nome: 'Quinta-feira' },
  { valor: 5, sigla: 'S', nome: 'Sexta-feira' },
  { valor: 6, sigla: 'S', nome: 'Sábado' },
];

interface AdminPanelProps {
  onSwitchToInspector?: () => void;
  onRefreshCatalog?: () => void;
}

export default function AdminPanel({ onSwitchToInspector, onRefreshCatalog }: AdminPanelProps) {
  // Navigation tabs within Admin Module
  const [activeTab, setActiveTab] = useState<'mercados' | 'automacao' | 'ia'>('mercados');

  // URL test/validation states map
  const [urlValidationMap, setUrlValidationMap] = useState<Record<string, UrlValidationState>>({});

  // Markets state
  const [mercados, setMercados] = useState<Mercado[]>([]);
  const [isLoadingMercados, setIsLoadingMercados] = useState<boolean>(true);
  const [mercadosError, setMercadosError] = useState<string | null>(null);

  // Form modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingMercadoId, setEditingMercadoId] = useState<string | null>(null);
  const [formNome, setFormNome] = useState<string>('');
  const [formAtivo, setFormAtivo] = useState<boolean>(true);
  const [formRegrasIa, setFormRegrasIa] = useState<string>('');
  const [formUrls, setFormUrls] = useState<Array<{ id?: string; descricao: string; url: string; ativo: boolean }>>([
    { descricao: 'Ofertas Gerais', url: '', ativo: true },
  ]);
  const [formErrors, setFormErrors] = useState<string | null>(null);
  const [isSavingMercado, setIsSavingMercado] = useState<boolean>(false);

  // Automation / Routine state
  const [configRotina, setConfigRotina] = useState<ConfiguracaoRotina | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(true);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [configSuccessMessage, setConfigSuccessMessage] = useState<string | null>(null);

  // Editable config state
  const [selectedDias, setSelectedDias] = useState<number[]>([1, 3, 5]);
  const [selectedHorario, setSelectedHorario] = useState<string>('06:00');
  const [isAutomacaoAtiva, setIsAutomacaoAtiva] = useState<boolean>(true);

  // Immediate execution state
  const [isExecutingNow, setIsExecutingNow] = useState<boolean>(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  // Log viewer toggle
  const [showLogViewer, setShowLogViewer] = useState<boolean>(true);

  // Load Markets and Automation Config on mount
  useEffect(() => {
    fetchMercados();
    fetchConfig();
  }, []);

  const fetchMercados = async () => {
    setIsLoadingMercados(true);
    setMercadosError(null);
    try {
      const res = await fetch('/api/mercados');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao carregar mercados');
      setMercados(data.mercados || []);
    } catch (err: any) {
      setMercadosError(err.message || 'Falha ao carregar lista de mercados');
    } finally {
      setIsLoadingMercados(false);
    }
  };

  const fetchConfig = async () => {
    setIsLoadingConfig(true);
    try {
      const res = await fetch('/api/automacao/config');
      const data = await res.json();
      if (res.ok && data.success && data.config) {
        setConfigRotina(data.config);
        setSelectedDias(data.config.dias_semana || [1, 3, 5]);
        setSelectedHorario(data.config.horario_execucao || '06:00');
        setIsAutomacaoAtiva(data.config.ativo !== false);
      }
    } catch (err) {
      console.error('Falha ao carregar configuração de automação:', err);
    } finally {
      setIsLoadingConfig(false);
    }
  };

  // Test / Validate flyer URL in real time
  const handleValidateUrl = async (urlKey: string, urlToTest: string) => {
    if (!urlToTest || !urlToTest.trim()) return;

    setUrlValidationMap((prev) => ({
      ...prev,
      [urlKey]: {
        isValidating: true,
        status: 'loading',
        error: null,
      },
    }));

    try {
      const res = await fetch('/api/validar-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToTest.trim() }),
      });

      const data = await res.json();

      if (data.success) {
        setUrlValidationMap((prev) => ({
          ...prev,
          [urlKey]: {
            isValidating: false,
            totalEncontrados: data.totalEncontrados,
            validade: data.validade,
            timestamp: data.timestamp,
            tempoResposta: data.tempoResposta,
            status: data.totalEncontrados > 0 ? 'success' : 'warning',
            error: data.totalEncontrados === 0 ? 'Nenhum encarte JPEG encontrado' : null,
          },
        }));
      } else {
        setUrlValidationMap((prev) => ({
          ...prev,
          [urlKey]: {
            isValidating: false,
            totalEncontrados: 0,
            timestamp: data.timestamp,
            error: data.error || 'Falha ao validar URL',
            status: 'error',
          },
        }));
      }
    } catch (err: any) {
      setUrlValidationMap((prev) => ({
        ...prev,
        [urlKey]: {
          isValidating: false,
          totalEncontrados: 0,
          error: err.message || 'Erro de conexão',
          status: 'error',
        },
      }));
    }
  };

  // Open modal for new market
  const handleOpenCreateModal = () => {
    setEditingMercadoId(null);
    setFormNome('');
    setFormAtivo(true);
    setFormRegrasIa('');
    setFormUrls([{ descricao: 'Ofertas Gerais', url: '', ativo: true }]);
    setFormErrors(null);
    setIsModalOpen(true);
  };

  // Open modal for editing market
  const handleOpenEditModal = (mercado: Mercado) => {
    setEditingMercadoId(mercado.id);
    setFormNome(mercado.nome);
    setFormAtivo(mercado.ativo);
    setFormRegrasIa(
      mercado.regras_extracao_ia
        ? typeof mercado.regras_extracao_ia === 'string'
          ? mercado.regras_extracao_ia
          : JSON.stringify(mercado.regras_extracao_ia, null, 2)
        : ''
    );
    setFormUrls(
      mercado.urls && mercado.urls.length > 0
        ? mercado.urls.map((u) => ({
            id: u.id,
            descricao: u.descricao || 'Ofertas Gerais',
            url: u.url || '',
            ativo: u.ativo !== false,
          }))
        : [{ descricao: 'Ofertas Gerais', url: '', ativo: true }]
    );
    setFormErrors(null);
    setIsModalOpen(true);
  };

  // Form: Add URL input row
  const handleAddUrlRow = () => {
    setFormUrls((prev) => [
      ...prev,
      { descricao: `Ofertas ${prev.length + 1}`, url: '', ativo: true },
    ]);
  };

  // Form: Remove URL row
  const handleRemoveUrlRow = (index: number) => {
    setFormUrls((prev) => {
      if (prev.length <= 1) {
        return [{ descricao: 'Ofertas Gerais', url: '', ativo: true }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Form: Update URL field
  const handleUpdateUrlRow = (
    index: number,
    field: 'descricao' | 'url' | 'ativo',
    value: any
  ) => {
    setFormUrls((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Form: Submit save market
  const handleSaveMercado = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors(null);

    if (!formNome.trim()) {
      setFormErrors('O nome do mercado é obrigatório.');
      return;
    }

    const validUrls = formUrls.filter((u) => u.url.trim().length > 0);
    if (validUrls.length === 0) {
      setFormErrors('Adicione pelo menos uma URL válida para o encarte do mercado.');
      return;
    }

    setIsSavingMercado(true);

    try {
      let parsedRegrasIa: any = null;
      if (formRegrasIa.trim()) {
        try {
          parsedRegrasIa = JSON.parse(formRegrasIa.trim());
        } catch {
          parsedRegrasIa = { observacoes: formRegrasIa.trim() };
        }
      }

      const payload = {
        nome: formNome.trim(),
        ativo: formAtivo,
        regras_extracao_ia: parsedRegrasIa,
        urls: validUrls.map((u) => ({
          id: u.id,
          descricao: u.descricao.trim() || 'Ofertas Gerais',
          url: u.url.trim(),
          ativo: u.ativo !== false,
        })),
      };

      const url = editingMercadoId ? `/api/mercados/${editingMercadoId}` : '/api/mercados';
      const method = editingMercadoId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao salvar mercado.');
      }

      setIsModalOpen(false);
      await fetchMercados();
    } catch (err: any) {
      setFormErrors(err.message || 'Erro ao salvar mercado');
    } finally {
      setIsSavingMercado(false);
    }
  };

  // Toggle market active state quickly
  const handleToggleMercadoAtivo = async (mercado: Mercado) => {
    try {
      const res = await fetch(`/api/mercados/${mercado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !mercado.ativo }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMercados((prev) =>
          prev.map((m) => (m.id === mercado.id ? { ...m, ativo: !m.ativo } : m))
        );
      }
    } catch (err) {
      console.error('Erro ao alternar status do mercado:', err);
    }
  };

  // Delete market
  const handleDeleteMercado = async (mercado: Mercado) => {
    if (!confirm(`Deseja realmente remover o mercado "${mercado.nome}" e todas as suas URLs cadastradas?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/mercados/${mercado.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setMercados((prev) => prev.filter((m) => m.id !== mercado.id));
      } else {
        alert(data.error || 'Erro ao excluir mercado.');
      }
    } catch (err: any) {
      alert('Erro de conexão ao excluir mercado: ' + err.message);
    }
  };

  // Toggle Day selection for Automation
  const handleToggleDia = (diaValor: number) => {
    setSelectedDias((prev) => {
      if (prev.includes(diaValor)) {
        if (prev.length <= 1) {
          return prev; // Keep at least one day
        }
        return prev.filter((d) => d !== diaValor);
      } else {
        return [...prev, diaValor].sort((a, b) => a - b);
      }
    });
  };

  // Save Automation Routine Config
  const handleSaveConfigRotina = async () => {
    setIsSavingConfig(true);
    setConfigSuccessMessage(null);

    try {
      const res = await fetch('/api/automacao/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dias_semana: selectedDias,
          horario_execucao: selectedHorario,
          ativo: isAutomacaoAtiva,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha ao salvar configuração');
      }

      setConfigRotina(data.config);
      setConfigSuccessMessage('Configurações salvas e cron reprogramado com sucesso!');
      setTimeout(() => setConfigSuccessMessage(null), 4000);
    } catch (err: any) {
      alert('Erro ao salvar configuração: ' + err.message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Immediate manual execution
  const handleExecuteNow = async () => {
    if (isExecutingNow) return;
    setIsExecutingNow(true);
    setExecutionMessage('Iniciando rotina de download e conferência em segundo plano...');

    try {
      const res = await fetch('/api/automacao/executar-agora', {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro durante a execução imediata');
      }

      setConfigRotina(data.config);
      setExecutionMessage(
        `Rotina concluída com sucesso! ${data.result?.urlsProcessadas || 0} URL(s) processadas.`
      );
      if (onRefreshCatalog) {
        onRefreshCatalog();
      }
      setTimeout(() => setExecutionMessage(null), 5000);
    } catch (err: any) {
      setExecutionMessage('Erro na execução: ' + (err.message || 'Falha'));
    } finally {
      setIsExecutingNow(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Title & Tab Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Painel de Automação & Mercados</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Módulo Administrativo
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Gerencie seus mercados, múltiplas URLs de encartes e configure rotinas periódicas de download automático com orquestração resiliente.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onSwitchToInspector && (
              <button
                onClick={onSwitchToInspector}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
              >
                <FileCheck className="w-4 h-4 text-emerald-600" />
                <span>Ver Encarte Atual (Extrator v1.0)</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <button
            onClick={() => setActiveTab('mercados')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'mercados'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Bloco A: Mercados & URLs ({mercados.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('automacao')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'automacao'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Bloco B: Rotina Automática & Agendador</span>
            {configRotina?.ativo && (
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ia')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'ia'
                ? 'bg-purple-700 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Consumo & Limites da IA</span>
            <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full font-bold">
              Gemini Flash
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================================= */}
      {/* BLOCO A: CADASTRO E GESTÃO DE MERCADOS & URLs (1:N) */}
      {/* ========================================================================================= */}
      {activeTab === 'mercados' && (
        <section className="space-y-6">
          {/* Top Actions for Markets */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Total de <strong>{mercados.length}</strong> mercado(s) cadastrado(s) com suporte a 1:N URLs de encartes.
              </span>
            </div>

            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Novo Mercado</span>
            </button>
          </div>

          {/* Loading / Error States */}
          {isLoadingMercados && (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Carregando mercados...</p>
            </div>
          )}

          {mercadosError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{mercadosError}</span>
              </div>
              <button
                onClick={fetchMercados}
                className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 text-xs"
              >
                Tentar Novamente
              </button>
            </div>
          )}

          {/* List of Markets (Cards) */}
          {!isLoadingMercados && mercados.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <Building2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Nenhum mercado cadastrado</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Cadastre o primeiro mercado para gerenciar as páginas de encartes que serão lidas periodicamente pelo extrator.
              </p>
              <button
                onClick={handleOpenCreateModal}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-2 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Mercado Agora</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {mercados.map((mercado) => {
              const urlsAtivas = (mercado.urls || []).filter((u) => u.ativo);
              const totalUrls = mercado.urls?.length || 0;

              return (
                <div
                  key={mercado.id}
                  className={`bg-white rounded-2xl border transition-all shadow-2xs overflow-hidden ${
                    mercado.ativo ? 'border-slate-200 hover:border-emerald-500' : 'border-slate-200/60 opacity-75'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-2xs ${
                          mercado.ativo
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        <Building2 className="w-5 h-5" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-900 text-base">{mercado.nome}</h3>
                          <button
                            onClick={() => handleToggleMercadoAtivo(mercado)}
                            className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border transition-colors cursor-pointer flex items-center gap-1 ${
                              mercado.ativo
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
                                : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                            }`}
                            title="Clique para alternar status ativo/inativo"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                mercado.ativo ? 'bg-emerald-600' : 'bg-slate-400'
                              }`}
                            ></span>
                            <span>{mercado.ativo ? 'Ativo' : 'Inativo'}</span>
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>Cadastrado em {new Date(mercado.criado_em).toLocaleDateString('pt-BR')}</span>
                          <span>•</span>
                          <span className="font-bold text-slate-700">
                            {urlsAtivas.length} de {totalUrls} URL(s) ativa(s)
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => handleOpenEditModal(mercado)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                        title="Editar Mercado e URLs"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                        <span>Editar</span>
                      </button>

                      <button
                        onClick={() => handleDeleteMercado(mercado)}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 text-xs font-bold flex items-center gap-1.5 border border-slate-200 hover:border-rose-200 transition-colors shadow-2xs cursor-pointer"
                        title="Excluir Mercado"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </div>

                  {/* Card Body: URLs List */}
                  <div className="p-4 sm:p-5 space-y-3">
                    <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Link2 className="w-4 h-4 text-emerald-600" />
                        <span>URLs de Encartes Vinculadas ({totalUrls}):</span>
                      </span>
                    </div>

                    <div className="space-y-2">
                      {mercado.urls && mercado.urls.length > 0 ? (
                        mercado.urls.map((urlItem, idx) => {
                          const urlKey = `${mercado.id}_${urlItem.id || idx}`;
                          const valState = urlValidationMap[urlKey];

                          return (
                            <div
                              key={urlItem.id || idx}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs transition-all hover:bg-slate-50/80"
                            >
                              <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${
                                    urlItem.ativo !== false
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : 'bg-slate-200 text-slate-600 border-slate-300'
                                  }`}
                                >
                                  {urlItem.descricao || 'Ofertas'}
                                </span>

                                <a
                                  href={urlItem.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono text-slate-700 hover:text-emerald-700 hover:underline truncate text-[11px] flex items-center gap-1"
                                  title={urlItem.url}
                                >
                                  <span className="truncate">{urlItem.url}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
                                </a>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0 self-start md:self-center">
                                {/* Status badge */}
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                    urlItem.ativo !== false
                                      ? 'text-emerald-700 bg-emerald-100/60'
                                      : 'text-slate-500 bg-slate-200/60'
                                  }`}
                                >
                                  {urlItem.ativo !== false ? 'Ativa no Agendador' : 'Desativada'}
                                </span>

                                {/* Badge de resultado da validação */}
                                {valState && !valState.isValidating && (
                                  <div
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all shadow-2xs ${
                                      valState.status === 'success'
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                        : valState.status === 'warning'
                                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                                        : 'bg-rose-50 border-rose-300 text-rose-900'
                                    }`}
                                    title={
                                      valState.validade && valState.validade !== 'Não especificada'
                                        ? `Vigência: ${valState.validade} • Verificado às ${valState.timestamp} (${valState.tempoResposta || ''})`
                                        : valState.error || `Verificado às ${valState.timestamp}`
                                    }
                                  >
                                    {valState.status === 'success' ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    ) : (
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                    <span>
                                      {valState.status === 'success'
                                        ? `${valState.totalEncontrados} encarte(s) encontrado(s)`
                                        : valState.status === 'warning'
                                        ? '0 encartes encontrados'
                                        : valState.error || 'Erro ao validar'}
                                    </span>
                                    {valState.timestamp && (
                                      <span className="text-[10px] opacity-70 font-mono font-normal">
                                        ({valState.timestamp})
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Botão Valida URL */}
                                <button
                                  type="button"
                                  onClick={() => handleValidateUrl(urlKey, urlItem.url)}
                                  disabled={valState?.isValidating}
                                  className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 active:bg-sky-200 text-sky-800 border border-sky-300 hover:border-sky-400 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                  title="Validar URL manualmente e contar encartes disponíveis agora (ao clicar novamente, atualiza o número)"
                                >
                                  {valState?.isValidating ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                                      <span>Validando...</span>
                                    </>
                                  ) : (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                                      <span>Valida URL</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-slate-400 italic">Nenhuma URL vinculada.</p>
                      )}
                    </div>

                    {/* Regras IA Nota Visual */}
                    <div className="mt-3 p-3 rounded-xl bg-sky-50/70 border border-sky-100 flex items-start gap-2.5 text-xs text-sky-900">
                      <Sparkles className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Regras de Extração IA (Preparado para Futuras Regras):</span>{' '}
                        {mercado.regras_extracao_ia ? (
                          <span className="font-mono text-[11px] text-sky-800">
                            {typeof mercado.regras_extracao_ia === 'string'
                              ? mercado.regras_extracao_ia
                              : JSON.stringify(mercado.regras_extracao_ia)}
                          </span>
                        ) : (
                          <span className="text-sky-700">
                            Este mercado utilizará as regras globais do Extrator v1.0. Você poderá adicionar prompts e seletores específicos na edição.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================================= */}
      {/* BLOCO B: CONFIGURAÇÃO DA ROTINA AUTOMÁTICA & CRON */}
      {/* ========================================================================================= */}
      {activeTab === 'automacao' && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Form Configuration */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-6">
              <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-emerald-600" />
                    <span>Configuração da Rotina Automática</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Defina os dias da semana e horário fixo em que o servidor disparará o download e conferência de todos os encartes ativos.
                  </p>
                </div>
              </div>

              {/* General Toggle */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                      isAutomacaoAtiva
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    <Power className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">
                      Habilitar Download Automático
                    </span>
                    <span className="text-xs text-slate-500">
                      Liga ou desliga o agendador de tarefas em segundo plano no servidor
                    </span>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAutomacaoAtiva}
                    onChange={(e) => setIsAutomacaoAtiva(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Day Selector (Domingo a Sábado: D, S, T, Q, Q, S, S) */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                  Dias da Semana para Execução:
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {DIAS_SEMANA_MAP.map((dia) => {
                    const isSelected = selectedDias.includes(dia.valor);
                    return (
                      <button
                        key={dia.valor}
                        type="button"
                        onClick={() => handleToggleDia(dia.valor)}
                        className={`w-11 h-11 rounded-xl font-black text-sm flex flex-col items-center justify-center transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-400/30'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        }`}
                        title={dia.nome}
                      >
                        <span>{dia.sigla}</span>
                        <span className="text-[9px] font-bold opacity-80 uppercase leading-none">
                          {dia.nome.substring(0, 3)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">
                  Dias selecionados:{' '}
                  <strong>
                    {selectedDias.map((v) => DIAS_SEMANA_MAP.find((d) => d.valor === v)?.nome).join(', ')}
                  </strong>
                </p>
              </div>

              {/* Time Picker / Fixed Hour */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                  Horário Fixo de Disparo (Horário de Brasília):
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative w-44">
                    <Clock className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="time"
                      value={selectedHorario}
                      onChange={(e) => setSelectedHorario(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs font-mono"
                    />
                  </div>
                  <span className="text-xs text-slate-500">
                    Sugestão: <strong>06:00</strong> da manhã para pegar encartes recém-publicados.
                  </span>
                </div>
              </div>

              {/* Resulting Cron Expression */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-600">Expressão Cron Gerada no Servidor:</span>
                <span className="font-mono font-bold bg-white px-2.5 py-1 rounded border border-slate-300 text-emerald-800">
                  {configRotina?.frequencia_cron || '0 6 * * 1,3,5'}
                </span>
              </div>

              {/* Feedback Alert if saved */}
              {configSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{configSuccessMessage}</span>
                </div>
              )}

              {/* Save Button */}
              <div className="pt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSaveConfigRotina}
                  disabled={isSavingConfig}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {isSavingConfig ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Salvando e Reprogramando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Salvar Configuração da Rotina</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right 1 Col: Feedback Card & Immediate Trigger */}
            <div className="space-y-4">
              {/* Feedback Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2.5">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>Card de Feedback da Rotina</span>
                </h4>

                <div className="space-y-3 text-xs">
                  {/* Status da última execução */}
                  <div>
                    <span className="text-slate-500 block text-[11px]">Status da Última Execução:</span>
                    <div className="mt-1">
                      {configRotina?.status_ultima_execucao === 'SUCESSO' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>SUCESSO</span>
                        </span>
                      ) : configRotina?.status_ultima_execucao === 'FALHA' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>FALHA</span>
                        </span>
                      ) : configRotina?.status_ultima_execucao === 'PROCESSANDO' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-200">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                          <span>PROCESSANDO AGORA</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          <span>Aguardando 1ª execução</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Data / Hora da última execução */}
                  <div>
                    <span className="text-slate-500 block text-[11px]">Data/Hora da Última Execução:</span>
                    <span className="font-mono text-slate-800 font-bold text-xs">
                      {configRotina?.ultima_execucao
                        ? new Date(configRotina.ultima_execucao).toLocaleString('pt-BR')
                        : 'Nenhuma execução registrada'}
                    </span>
                  </div>

                  {/* Próxima execução & Contador regressivo */}
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
                    <span className="text-emerald-900 font-bold block text-[11px]">
                      Próxima Execução Agendada:
                    </span>
                    <div className="text-xs font-black text-emerald-950">
                      {configRotina?.proxima_execucao || 'Automação pausada'}
                    </div>
                    {configRotina?.contagem_regressiva && (
                      <div className="text-[11px] font-mono font-bold text-emerald-700">
                        Contador: {configRotina.contagem_regressiva}
                      </div>
                    )}
                  </div>
                </div>

                {/* BOTÃO AUXILIAR: Executar Automação Agora */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleExecuteNow}
                    disabled={isExecutingNow}
                    className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    {isExecutingNow ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>Executando Todos os Mercados...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                        <span>Executar Automação Agora</span>
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-400 text-center mt-1">
                    Dispara o fluxo imediatamente sem esperar o cron.
                  </p>
                </div>

                {executionMessage && (
                  <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-900 text-xs">
                    {executionMessage}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Execution Logs Terminal */}
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-5 shadow-lg space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-200">Terminal de Logs da Rotina</span>
                <span className="text-[10px] bg-slate-800 text-emerald-400 px-2 py-0.5 rounded border border-slate-700">
                  Extrator v1.0 Service
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowLogViewer(!showLogViewer)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  {showLogViewer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {showLogViewer && (
              <pre className="p-3 bg-slate-950/80 rounded-xl overflow-x-auto text-[11px] leading-relaxed text-emerald-400 whitespace-pre-wrap max-h-72">
                {configRotina?.log_ultima_execucao || 'Nenhum log registrado ainda.'}
              </pre>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================================= */}
      {/* BLOCO C: CONSUMO & LIMITES DA IA (GEMINI FLASH) */}
      {/* ========================================================================================= */}
      {activeTab === 'ia' && (
        <section className="space-y-6">
          <AiUsageCard />
        </section>
      )}

      {/* ========================================================================================= */}
      {/* MODAL: CADASTRO / EDIÇÃO DE MERCADO COM MÚLTIPLAS URLs (1:N) */}
      {/* ========================================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-base text-slate-900">
                  {editingMercadoId ? 'Editar Mercado' : 'Cadastrar Novo Mercado'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveMercado} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {formErrors && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formErrors}</span>
                </div>
              )}

              {/* Nome do Mercado */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                  Nome do Mercado *
                </label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Ex: Abimar Supermercados, Supermercado Central..."
                  required
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs"
                />
              </div>

              {/* Ativo Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-bold text-slate-800">Mercado Ativo na Automação:</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAtivo}
                    onChange={(e) => setFormAtivo(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Lista Dinâmica de URLs (1:N) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                    URLs de Encartes / Ofertas (1:N) *
                  </label>
                  <button
                    type="button"
                    onClick={handleAddUrlRow}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Adicionar outra URL</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {formUrls.map((urlItem, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 relative group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-600">
                          URL #{idx + 1}
                        </span>
                        {formUrls.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveUrlRow(idx)}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                            title="Remover esta URL"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Descrição / Rótulo
                          </label>
                          <input
                            type="text"
                            value={urlItem.descricao}
                            onChange={(e) => handleUpdateUrlRow(idx, 'descricao', e.target.value)}
                            placeholder="Ex: Ofertas Gerais, Hortifrúti"
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-emerald-600"
                          />
                        </div>

                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            URL do Encarte (HTTP/HTTPS)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="url"
                              value={urlItem.url}
                              onChange={(e) => handleUpdateUrlRow(idx, 'url', e.target.value)}
                              placeholder="https://exemplo.com.br/ofertas"
                              className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-600"
                            />
                            <button
                              type="button"
                              onClick={() => handleValidateUrl(`modal_${idx}`, urlItem.url)}
                              disabled={!urlItem.url?.trim() || urlValidationMap[`modal_${idx}`]?.isValidating}
                              className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40 transition-colors shadow-2xs"
                              title="Testar URL e verificar se encontra encartes JPEG nesta página"
                            >
                              {urlValidationMap[`modal_${idx}`]?.isValidating ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" />
                                  <span>Validando...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                                  <span>Valida URL</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Modal validation feedback pill */}
                          {urlValidationMap[`modal_${idx}`] && !urlValidationMap[`modal_${idx}`].isValidating && (
                            <div
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border mt-1 shadow-2xs ${
                                urlValidationMap[`modal_${idx}`].status === 'success'
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                  : urlValidationMap[`modal_${idx}`].status === 'warning'
                                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                                  : 'bg-rose-50 text-rose-900 border-rose-300'
                              }`}
                            >
                              {urlValidationMap[`modal_${idx}`].status === 'success' ? (
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3 h-3 shrink-0" />
                              )}
                              <span>
                                {urlValidationMap[`modal_${idx}`].status === 'success'
                                  ? `${urlValidationMap[`modal_${idx}`].totalEncontrados} encarte(s) encontrado(s)`
                                  : urlValidationMap[`modal_${idx}`].status === 'warning'
                                  ? '0 encartes encontrados'
                                  : urlValidationMap[`modal_${idx}`].error}
                              </span>
                              {urlValidationMap[`modal_${idx}`].timestamp && (
                                <span className="font-normal opacity-70 font-mono text-[10px]">
                                  ({urlValidationMap[`modal_${idx}`].timestamp})
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Regras de Extração IA (Preparado para Futuras Regras) */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <label className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                    Regras de Extração IA Personalizadas (Futuro Gemini Flash):
                  </label>
                </div>
                <p className="text-[11px] text-slate-500">
                  Campo preparado para armazenar prompts dedicados, seletores CSS específicos ou instruções sobre encartes complexos deste mercado.
                </p>
                <textarea
                  value={formRegrasIa}
                  onChange={(e) => setFormRegrasIa(e.target.value)}
                  rows={2}
                  placeholder='Ex: { "observacoes": "Galeria PhotoSwipe", "regras": ["Ignorar carrossel de cabeçalho"] }'
                  className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-600 shadow-2xs"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingMercado}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {isSavingMercado ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{editingMercadoId ? 'Atualizar Mercado' : 'Salvar Mercado'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
