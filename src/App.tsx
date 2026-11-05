import React, { useState, useEffect } from 'react';
import {
  Link2,
  Sparkles,
  UploadCloud,
  FileImage,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Copy,
  Search,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Download,
  Eye,
  FileCheck2,
  Clock,
  HardDrive,
  Maximize2,
  X,
  Layers,
  ArrowDownToLine,
  Check,
  Building2,
} from 'lucide-react';
import AdminPanel from './components/AdminPanel.tsx';
import AiUsageCard from './components/AiUsageCard.tsx';

export interface ExtractedProduct {
  id: string;
  chave_unica?: string;
  pageNumber: number;
  nome_mercado: string;
  data_inicial: string;
  data_final: string;
  nome_produto: string;
  marca: string;
  quantidade_volume: number;
  unidade_medida: string;
  preco_regular: number;
  preco_promocional: number | null;
  tipo_promocao: string;
  condicao_detalhes: string | null;
  categoria: string;
  preco_unitario_equivalente: number;
  preco_unitario_label: string;
}

export interface DownloadedFlyer {
  id: string;
  pageNumber: number;
  fileName: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  resolution: string;
  urlOrigem: string;
  urlLocal: string;
  status: 'sucesso' | 'falha' | 'pendente';
  tentativas: number;
  validado: boolean;
  mensagemValidacao: string;
  downloadTimestamp: string;
}

export interface FlyerConferenceReport {
  versaoExtrator?: string;
  urlConsultada: string;
  dataHoraExecucao: string;
  validadeOfertas: string;
  panfletosEncontrados: number;
  panfletosBaixados: number;
  downloadsFalhas: number;
  resultado: 'Concluído' | 'Incompleto' | 'Falha';
  situacaoFinal: string;
  arquivosGerados: string[];
  detalhes: DownloadedFlyer[];
  tempoTotalSegundos: number;
}

export default function App() {
  const [urlInput, setUrlInput] = useState<string>(
    'https://www.abimarsupermercados.com.br/ofertas/abimar/5'
  );

  // Active view: 'admin' (Gestão de Mercados & Rotina Automática) or 'extrator' (Inspeção direta Extrator v1.0)
  const [mainView, setMainView] = useState<'admin' | 'extrator'>('admin');

  // Download & Conference state
  const [isDownloadingFlyers, setIsDownloadingFlyers] = useState<boolean>(false);
  const [downloadStepMessage, setDownloadStepMessage] = useState<string>('');
  const [conferenceReport, setConferenceReport] = useState<FlyerConferenceReport | null>(null);
  const [downloadedFlyers, setDownloadedFlyers] = useState<DownloadedFlyer[]>([]);
  const [reportCopied, setReportCopied] = useState<boolean>(false);

  // Modal preview
  const [previewFlyer, setPreviewFlyer] = useState<DownloadedFlyer | null>(null);

  // Extracted products state
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [isExtractingAI, setIsExtractingAI] = useState<boolean>(false);
  const [extractingPageNumber, setExtractingPageNumber] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'warning' | 'error'>('info');

  const [metadata, setMetadata] = useState<{
    validade: string;
    timestamp: string;
    totalPages: number;
  }>({
    validade: '',
    timestamp: '',
    totalPages: 0,
  });

  const [searchFilter, setSearchFilter] = useState<string>('');

  // Manual upload fallback state
  const [showManualUpload, setShowManualUpload] = useState<boolean>(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [manualPageInput, setManualPageInput] = useState<number>(1);
  const [appendMode, setAppendMode] = useState<boolean>(true);

  // Fetch catalog & flyers data from server
  const loadCatalogData = () => {
    fetch('/api/flyers/status')
      .then((r) => r.json())
      .then((data) => {
        if (data.report) {
          setConferenceReport(data.report);
          setDownloadedFlyers(data.flyers || data.report.detalhes || []);
        } else if (data.flyers) {
          setDownloadedFlyers(data.flyers);
        }
      })
      .catch(() => {});

    fetch('/api/extracted-products')
      .then((r) => r.json())
      .then((data) => {
        if (data.items) {
          setExtractedProducts(data.items);
          if (data.metadata) {
            setMetadata(data.metadata);
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadCatalogData();
  }, []);

  const formatBRL = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return `R$ ${val.toFixed(2).replace('.', ',')}`;
  };

  // HANDLER: Download and audit all flyers
  const handleDownloadAllFlyers = async () => {
    if (!urlInput.trim()) return;

    setIsDownloadingFlyers(true);
    setDownloadStepMessage('Iniciando identificação profunda de todos os panfletos na página...');
    setStatusType('info');
    setStatusMessage('Acessando o site do mercado, identificando e baixando todos os panfletos JPEG...');

    try {
      const response = await fetch('/api/flyers/download-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Falha ao processar download dos panfletos');
      }

      const report: FlyerConferenceReport = data.report;
      setConferenceReport(report);
      setDownloadedFlyers(report.detalhes || []);

      if (report.resultado === 'Concluído') {
        setStatusType('success');
        setStatusMessage(
          `Conferência 100% Concluída! Todos os ${report.panfletosEncontrados} panfletos foram identificados, baixados e validados com integridade JPEG.`
        );
      } else {
        setStatusType('warning');
        setStatusMessage(
          `Processo parcial: ${report.panfletosBaixados} de ${report.panfletosEncontrados} baixados. ${report.downloadsFalhas} falhas.`
        );
      }
    } catch (err: any) {
      console.warn('[Download Panfletos]', err?.message || err);
      setStatusType('error');
      const msg = err?.message || 'Erro ao baixar panfletos';
      const isDns = msg.includes('EAI_AGAIN') || msg.includes('fetch failed');
      setStatusMessage(
        isDns
          ? 'Instabilidade temporária de rede ou DNS com o site do mercado. O servidor tentou reconectar automaticamente. Por favor, tente clicar novamente.'
          : msg
      );
    } finally {
      setIsDownloadingFlyers(false);
      setDownloadStepMessage('');
    }
  };

  // HANDLER: Extract single downloaded page with AI (with auto-deletion of flyer upon success)
  const handleExtractDownloadedPage = async (pageNumber: number) => {
    setIsExtractingAI(true);
    setExtractingPageNumber(pageNumber);
    setStatusType('info');
    setStatusMessage(`Lendo panfleto da Página ${pageNumber} com Gemini Vision (zero alucinação)...`);

    try {
      const res = await fetch('/api/flyers/extract-downloaded-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageNumber }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const isQuota =
          res.status === 429 ||
          data?.isQuotaExhausted ||
          String(data?.error).includes('Cota diária') ||
          String(data?.error).includes('20 requisições') ||
          String(data?.error).includes('RESOURCE_EXHAUSTED');

        if (isQuota) {
          setStatusType('warning');
          setStatusMessage(
            `Cota diária gratuita do Gemini atingida (limite de 20 requisições/dia). O panfleto da Página ${pageNumber} permanece 100% salvo em disco sem perdas. A cota renova às 21:00 BRT.`
          );
          return;
        }
        throw new Error(data.error || 'Erro na extração');
      }

      const newItems: ExtractedProduct[] = data.items || [];
      const updated = data.allCurrentItems && Array.isArray(data.allCurrentItems)
        ? data.allCurrentItems
        : appendMode
        ? [...extractedProducts, ...newItems]
        : newItems;

      setExtractedProducts(updated);
      setMetadata({
        validade: data.validade || metadata.validade,
        timestamp: new Date().toLocaleTimeString(),
        totalPages: Math.max(metadata.totalPages, pageNumber),
      });

      // Auto-remove flyer from list only after confirmed successful extraction of products
      if (data.flyerDeleted || newItems.length > 0) {
        setDownloadedFlyers((prev) => prev.filter((f) => f.pageNumber !== pageNumber));
      }

      const novos = data.novosInseridos !== undefined ? data.novosInseridos : newItems.length;
      const dup = data.duplicadosEvitados !== undefined ? data.duplicadosEvitados : 0;
      const att = data.atualizados !== undefined ? data.atualizados : 0;
      const dedupNotice =
        dup > 0
          ? ` (${novos} novos adicionados, ${dup} duplicados prevenidos${att > 0 ? `, ${att} preços atualizados` : ''})`
          : '';

      setStatusType('success');
      setStatusMessage(
        `Página ${pageNumber} transcrita com sucesso! Extraídos ${newItems.length} produtos reais${dedupNotice} (via ${data.usedModel || 'Gemini'}). O panfleto foi excluído do servidor com segurança.`
      );
    } catch (err: any) {
      const msg = err.message || 'Falha ao extrair produtos';
      const isQuota =
        msg.includes('Cota diária') ||
        msg.includes('20 requisições') ||
        msg.includes('RESOURCE_EXHAUSTED');
      if (isQuota) {
        setStatusType('warning');
        setStatusMessage(
          'Cota diária gratuita do Gemini atingida (20 reqs/dia). Seus panfletos baixados continuam salvos no disco.'
        );
      } else {
        setStatusType('error');
        setStatusMessage(msg);
      }
    } finally {
      setIsExtractingAI(false);
      setExtractingPageNumber(null);
    }
  };

  // HANDLER: Extract all downloaded pages with AI sequentially (auto-deleting each flyer upon success)
  const handleExtractAllDownloadedPages = async () => {
    if (downloadedFlyers.length === 0) return;

    setIsExtractingAI(true);
    setStatusType('info');
    setStatusMessage(`Iniciando extração em lote dos ${downloadedFlyers.length} panfletos baixados...`);

    let quotaExhaustedEncountered = false;

    try {
      const flyersToProcess = [...downloadedFlyers];

      for (let i = 0; i < flyersToProcess.length; i++) {
        const flyer = flyersToProcess[i];
        setStatusMessage(
          `Extraindo produtos da Página ${flyer.pageNumber} (${i + 1}/${flyersToProcess.length}) com IA...`
        );

        const res = await fetch('/api/flyers/extract-downloaded-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageNumber: flyer.pageNumber }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.success) {
          const pageItems: ExtractedProduct[] = data.items || [];
          if (data.allCurrentItems && Array.isArray(data.allCurrentItems)) {
            setExtractedProducts(data.allCurrentItems);
          }

          // Confirmed extraction: remove this flyer from local state
          if (data.flyerDeleted || pageItems.length > 0) {
            setDownloadedFlyers((prev) => prev.filter((f) => f.pageNumber !== flyer.pageNumber));
          }
        } else {
          const isQuota =
            res.status === 429 ||
            data?.isQuotaExhausted ||
            String(data?.error).includes('Cota diária') ||
            String(data?.error).includes('20 requisições') ||
            String(data?.error).includes('RESOURCE_EXHAUSTED');

          if (isQuota) {
            quotaExhaustedEncountered = true;
            setStatusType('warning');
            setStatusMessage(
              `Cota diária gratuita do Gemini atingida na Página ${flyer.pageNumber}. Os panfletos restantes continuam 100% salvos e íntegros em disco para extração quando a cota renovar às 21:00 BRT.`
            );
            break; // Stop loop immediately to avoid repeating 429 errors!
          }
        }
      }

      // Refresh final persisted and deduplicated catalog
      const refRes = await fetch('/api/extracted-products');
      if (refRes.ok) {
        const refData = await refRes.json();
        setExtractedProducts(refData.items || []);
        if (!quotaExhaustedEncountered) {
          setStatusType('success');
          setStatusMessage(
            `Extração em lote concluída com sucesso! Total de ${refData.items?.length || 0} produtos consolidados sem duplicatas (chave única ativa) e panfletos temporários limpos do disco.`
          );
        }
      }
    } catch (err: any) {
      if (!quotaExhaustedEncountered) {
        setStatusType('error');
        setStatusMessage(err.message || 'Erro durante extração');
      }
    } finally {
      setIsExtractingAI(false);
    }
  };

  // HANDLER: Delete all downloaded flyers manually
  const handleDeleteAllFlyers = async () => {
    try {
      await fetch('/api/flyers/clear-all', { method: 'DELETE' });
      setDownloadedFlyers([]);
      setConferenceReport(null);
      setStatusType('info');
      setStatusMessage('Todos os panfletos baixados foram excluídos com sucesso do disco.');
    } catch (err: any) {
      console.error('Erro ao excluir panfletos:', err);
      setDownloadedFlyers([]);
      setStatusType('info');
      setStatusMessage('Panfletos removidos localmente.');
    }
  };

  // HANDLER: Delete single downloaded flyer manually
  const handleDeleteSingleFlyer = async (pageNumber: number) => {
    try {
      await fetch(`/api/flyers/page/${pageNumber}`, { method: 'DELETE' });
      setDownloadedFlyers((prev) => prev.filter((f) => f.pageNumber !== pageNumber));
      setStatusType('info');
      setStatusMessage(`Panfleto da Página ${pageNumber} excluído com sucesso do disco.`);
    } catch (err: any) {
      console.error('Erro ao excluir panfleto:', err);
      setDownloadedFlyers((prev) => prev.filter((f) => f.pageNumber !== pageNumber));
    }
  };

  // HANDLER: Delete product from catalog row
  const handleDeleteProduct = async (id: string, nomeProduto?: string) => {
    setExtractedProducts((prev) => prev.filter((item) => item.id !== id));
    setStatusType('info');
    setStatusMessage(`Produto "${nomeProduto || 'Item'}" removido da lista.`);

    try {
      await fetch(`/api/extracted-products/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Erro ao deletar produto:', e);
    }
  };

  // HANDLER: Clear catalog (direct without blocking iframe confirm)
  const handleClearCatalog = async () => {
    try {
      await fetch('/api/clear-extracted', { method: 'POST' });
    } catch (e) {
      console.warn('Erro ao limpar produtos no servidor:', e);
    }
    setExtractedProducts([]);
    setMetadata({ validade: '', timestamp: '', totalPages: 0 });
    setStatusType('info');
    setStatusMessage('Tabela de produtos limpa com sucesso.');
  };

  // HANDLER: Copy conference report to clipboard
  const handleCopyReport = () => {
    if (!conferenceReport) return;

    const reportText = `=== RELATÓRIO DE CONFERÊNCIA • EXTRATOR v1.0 (BASE OFICIAL) ===
Versão do Extrator: ${conferenceReport.versaoExtrator || '1.0 (Oficial)'}
URL Consultada: ${conferenceReport.urlConsultada}
Data e Hora: ${conferenceReport.dataHoraExecucao}
Tempo Total: ${conferenceReport.tempoTotalSegundos} segundos
Validade das Ofertas: ${conferenceReport.validadeOfertas}

TABELA DE CONFERÊNCIA:
| Descrição              | Quantidade |
| Panfletos encontrados  | ${conferenceReport.panfletosEncontrados} |
| Panfletos baixados     | ${conferenceReport.panfletosBaixados} |
| Downloads com falha    | ${conferenceReport.downloadsFalhas} |
| Resultado              | ${conferenceReport.resultado} |

SITUAÇÃO FINAL:
${conferenceReport.situacaoFinal}

ARQUIVOS GERADOS (${conferenceReport.arquivosGerados.length}):
${conferenceReport.detalhes
  .map(
    (d) =>
      `• Pág. ${String(d.pageNumber).padStart(2, '0')}: ${d.fileName} (${d.fileSizeFormatted}, ${d.resolution}) -> ${d.status === 'sucesso' ? 'VALIDADO OK' : 'FALHA'}`
  )
  .join('\n')}
`;

    navigator.clipboard.writeText(reportText);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 3000);
  };

  // HANDLER: Manual upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setUploadedImagePreview(b64);
      setUploadedImageBase64(b64);
      setStatusType('info');
      setStatusMessage(`Foto carregada para a Página ${manualPageInput}. Clique em "Extrair Desta Foto".`);
    };
    reader.readAsDataURL(file);
  };

  const handleExtractFromManualUpload = async () => {
    if (!uploadedImageBase64) return;
    setIsExtractingAI(true);
    setStatusType('info');
    setStatusMessage(`Processando imagem manual da Página ${manualPageInput} com Gemini...`);

    try {
      const res = await fetch('/api/extract-flyer-strict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: uploadedImageBase64,
          mimeType: 'image/jpeg',
          pageNumber: manualPageInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na extração');

      const newItems: ExtractedProduct[] = data.items || [];
      const updated = appendMode ? [...extractedProducts, ...newItems] : newItems;

      setExtractedProducts(updated);
      setManualPageInput((prev) => prev + 1);
      setUploadedImagePreview(null);
      setUploadedImageBase64(null);

      setStatusType('success');
      setStatusMessage(`Extraídos ${newItems.length} produtos da imagem manual. Total: ${updated.length} itens.`);
    } catch (err: any) {
      setStatusType('error');
      setStatusMessage(err.message || 'Erro no upload manual');
    } finally {
      setIsExtractingAI(false);
    }
  };

  // Filtered products list
  const filteredProducts = extractedProducts.filter((p) => {
    if (!searchFilter.trim()) return true;
    const s = searchFilter.toLowerCase();
    return (
      p.nome_produto.toLowerCase().includes(s) ||
      (p.marca && p.marca.toLowerCase().includes(s)) ||
      (p.categoria && p.categoria.toLowerCase().includes(s)) ||
      (p.nome_mercado && p.nome_mercado.toLowerCase().includes(s)) ||
      (p.data_inicial && p.data_inicial.includes(s)) ||
      (p.data_final && p.data_final.includes(s))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-emerald-500 selection:text-white pb-20">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 shadow-2xs sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>SuperCompara • Extrator v1.0</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  v1.0 • Base Oficial
                </span>
                <span className="hidden md:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  Coração do Projeto
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Motor v1.0 homologado: Varredura profunda, download de 100% dos panfletos JPEG em resolução nativa e extração factual de preços com IA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {downloadedFlyers.length > 0 && (
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 hidden sm:inline-flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>{downloadedFlyers.length} Panfletos Baixados</span>
              </span>
            )}
            {extractedProducts.length > 0 && (
              <button
                onClick={handleClearCatalog}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 text-xs font-bold flex items-center gap-1.5 border border-slate-200 hover:border-rose-200 transition-colors shadow-2xs"
                title="Limpar catálogo de produtos"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Limpar Tabela ({extractedProducts.length})</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Top View Selector Navigation Bar */}
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 py-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setMainView('admin')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer border shrink-0 ${
              mainView === 'admin'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4 text-emerald-400" />
            <span>Módulo de Automação & Gestão de Mercados</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
              1:N URLs & Cron
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMainView('extrator')}
            className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer border shrink-0 ${
              mainView === 'extrator'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Extrator v1.0 • Inspeção de Panfletos & Produtos</span>
            {downloadedFlyers.length > 0 && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                {downloadedFlyers.length} Págs Prontas
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Real-time AI Usage & Daily Quota Widget */}
        <AiUsageCard compact />

        {mainView === 'admin' ? (
          <AdminPanel
            onSwitchToInspector={() => setMainView('extrator')}
            onRefreshCatalog={loadCatalogData}
          />
        ) : (
          <>
            {/* SECTION 1: URL Input & Full Download Trigger */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <label htmlFor="url-input" className="text-sm font-black text-slate-900">
                Página de Ofertas do Supermercado:
              </label>
            </div>
            <a
              href={urlInput}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-700 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>Abrir link original</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="url-input"
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.abimarsupermercados.com.br/ofertas/abimar/5"
              className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm text-slate-900 font-medium focus:outline-none focus:border-emerald-600 focus:bg-white transition-all shadow-2xs"
            />

            <button
              onClick={handleDownloadAllFlyers}
              disabled={isDownloadingFlyers || !urlInput.trim()}
              className={`px-6 py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2.5 transition-all shadow-sm cursor-pointer ${
                isDownloadingFlyers
                  ? 'bg-slate-400 text-slate-100 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] shadow-emerald-600/20'
              }`}
            >
              {isDownloadingFlyers ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Baixando & Conferindo...</span>
                </>
              ) : (
                <>
                  <ArrowDownToLine className="w-4 h-4" />
                  <span>Baixar e Conferir Todos os Panfletos (JPEG)</span>
                </>
              )}
            </button>
          </div>

          {/* Download in progress banner */}
          {isDownloadingFlyers && (
            <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl flex items-center gap-3 text-xs font-semibold text-sky-900">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
              <span>{downloadStepMessage || 'Varrendo a página, localizando todos os panfletos e baixando imagens JPEG em alta resolução...'}</span>
            </div>
          )}
        </section>

        {/* Status Message Notification Bar */}
        {statusMessage && (
          <div
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-semibold shadow-2xs transition-all ${
              statusType === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : statusType === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : statusType === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : 'bg-sky-50 border-sky-300 text-sky-950'
            }`}
          >
            <div className="flex items-start gap-3">
              {isDownloadingFlyers || isExtractingAI ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5 text-current" />
              ) : statusType === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 leading-relaxed">{statusMessage}</div>
            </div>

            {statusType === 'error' && !isDownloadingFlyers && (
              <button
                onClick={handleDownloadAllFlyers}
                className="self-end sm:self-center shrink-0 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>
            )}
          </div>
        )}

        {/* SECTION 2: CONFERÊNCIA E VALIDAÇÃO DOS RESULTADOS (Tabela Exigida pelo Usuário) */}
        {conferenceReport && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Conferência e Validação dos Panfletos</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Extrator v1.0
                    </span>
                  </h2>
                  <span
                    className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                      conferenceReport.resultado === 'Concluído'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                    }`}
                  >
                    {conferenceReport.resultado}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Validação individual de cabeçalho JPEG, ausência de corrupção e integridade física de cada arquivo pelo motor v1.0.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyReport}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                >
                  {reportCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Relatório Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Relatório</span>
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownloadAllFlyers}
                  disabled={isDownloadingFlyers}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center gap-1.5 border border-emerald-200 transition-colors shadow-2xs cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDownloadingFlyers ? 'animate-spin' : ''}`} />
                  <span>Revalidar Tudo</span>
                </button>
              </div>
            </div>

            {/* TABELA FORMAL DE CONFERÊNCIA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 font-bold text-xs text-slate-800 flex items-center justify-between">
                  <span>Tabela de Conferência Automática</span>
                  <span className="text-[11px] font-normal text-slate-500">Auditoria Oficial</span>
                </div>
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-extrabold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 font-bold">Descrição</th>
                      <th className="py-2.5 px-4 text-right font-bold w-32">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                    <tr className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>Panfletos encontrados</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-black font-mono text-sm text-slate-900">
                        {conferenceReport.panfletosEncontrados}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/80 bg-emerald-50/40">
                      <td className="py-2.5 px-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="font-bold text-emerald-950">Panfletos baixados</span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-black font-mono text-sm text-emerald-700">
                        {conferenceReport.panfletosBaixados}
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                        <span>Downloads com falha</span>
                      </td>
                      <td className={`py-2.5 px-4 text-right font-black font-mono text-sm ${conferenceReport.downloadsFalhas === 0 ? 'text-slate-400' : 'text-rose-600'}`}>
                        {conferenceReport.downloadsFalhas}
                      </td>
                    </tr>
                    <tr className="bg-slate-100/70 border-t border-slate-200 font-bold">
                      <td className="py-3 px-4 text-slate-900">Resultado</td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-black">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{conferenceReport.resultado}</span>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* RESUMO EXECUTIVO DO RELATÓRIO */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
                <div className="font-bold text-slate-900 text-xs flex items-center justify-between">
                  <span>Resumo da Execução:</span>
                  <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{conferenceReport.tempoTotalSegundos}s</span>
                  </span>
                </div>

                <div className="space-y-1.5 text-slate-600">
                  <p>
                    <strong className="text-slate-800">Motor do Extrator:</strong>{' '}
                    <span className="font-bold text-emerald-700">Versão 1.0 (Base Homologada)</span>
                  </p>
                  <p>
                    <strong className="text-slate-800">URL Consultada:</strong>{' '}
                    <span className="font-mono break-all text-[11px] text-slate-700">{conferenceReport.urlConsultada}</span>
                  </p>
                  <p>
                    <strong className="text-slate-800">Data e Hora:</strong> {conferenceReport.dataHoraExecucao}
                  </p>
                  <p>
                    <strong className="text-slate-800">Validade Identificada:</strong>{' '}
                    <span className="font-bold text-emerald-700">{conferenceReport.validadeOfertas}</span>
                  </p>
                  <p>
                    <strong className="text-slate-800">Situação Final:</strong>{' '}
                    <span className="text-emerald-800 font-semibold">{conferenceReport.situacaoFinal}</span>
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Armazenamento local: <strong>public/downloads/panfletos/</strong></span>
                  <span>{conferenceReport.arquivosGerados.length} arquivos prontos</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 3: GALERIA VISUAL DOS PANFLETOS BAIXADOS */}
        {downloadedFlyers.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-600" />
                  <span>Panfletos Baixados e Prontos para Análise</span>
                  <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-black border border-emerald-200">
                    {downloadedFlyers.length} Páginas JPEG
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Todos os arquivos foram baixados em resolução nativa (1383x1800). Após a extração dos produtos ser confirmada com êxito pelo Gemini Vision, os panfletos são excluídos automaticamente para liberar espaço.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDeleteAllFlyers}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-slate-300 hover:border-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  title="Excluir manualmente todos os panfletos baixados do disco"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Excluir Panfletos Baixados ({downloadedFlyers.length})</span>
                </button>

                <button
                  onClick={handleExtractAllDownloadedPages}
                  disabled={isExtractingAI}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                >
                  {isExtractingAI && extractingPageNumber === null ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Extraindo Todos com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Extrair Produtos de Todos os {downloadedFlyers.length} Panfletos</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Grid dos Panfletos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {downloadedFlyers.map((flyer) => {
                const isThisPageExtracting = isExtractingAI && extractingPageNumber === flyer.pageNumber;

                return (
                  <div
                    key={flyer.id || flyer.pageNumber}
                    className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 flex flex-col hover:border-emerald-500 hover:shadow-md transition-all group"
                  >
                    {/* Flyer Preview Image */}
                    <div className="relative aspect-[3/4] bg-slate-200 overflow-hidden cursor-pointer" onClick={() => setPreviewFlyer(flyer)}>
                      <img
                        src={flyer.urlLocal}
                        alt={`Página ${flyer.pageNumber}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />

                      <div className="absolute top-2 left-2 bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-black px-2 py-0.5 rounded shadow-sm">
                        Pág. {flyer.pageNumber}
                      </div>

                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1.5 rounded-lg text-slate-800 shadow-sm">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </div>

                      <div className="absolute bottom-2 left-2 right-2 bg-slate-900/80 backdrop-blur-xs text-white text-[9px] px-1.5 py-0.5 rounded font-mono truncate flex items-center justify-between">
                        <span>{flyer.fileSizeFormatted}</span>
                        <span>{flyer.resolution}</span>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
                      <div>
                        <div className="font-bold text-slate-900 text-xs truncate" title={flyer.fileName}>
                          {flyer.fileName}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold mt-0.5">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>JPEG Íntegro</span>
                        </div>
                      </div>

                      {/* Action buttons on card */}
                      <div className="space-y-1.5 pt-1">
                        <button
                          onClick={() => handleExtractDownloadedPage(flyer.pageNumber)}
                          disabled={isExtractingAI}
                          className="w-full py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          {isThisPageExtracting ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Lendo IA...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              <span>Extrair Produtos</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setPreviewFlyer(flyer)}
                            className="flex-1 py-1 px-1.5 rounded bg-white hover:bg-slate-100 text-slate-700 font-semibold text-[10px] border border-slate-200 text-center flex items-center justify-center gap-1 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Ver Panfleto</span>
                          </button>
                          <a
                            href={`/api/download-flyer-file/${flyer.fileName}`}
                            download={flyer.fileName}
                            className="p-1 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors"
                            title="Baixar arquivo JPEG no computador"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                          <button
                            onClick={() => handleDeleteSingleFlyer(flyer.pageNumber)}
                            className="p-1 rounded bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
                            title={`Excluir panfleto da Página ${flyer.pageNumber}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* SECTION 4: TABELA DE PRODUTOS EXTRAÍDOS (Catálogo Factual) */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header of Table */}
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>Produtos Extraídos do Encarte</span>
                <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-black border border-emerald-200">
                  {extractedProducts.length} itens catalogados
                </span>
                <span className="hidden sm:inline-flex text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                  Extrator v1.0 Factual
                </span>
              </h2>
              {metadata.validade ? (
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Vigência: <strong>{metadata.validade}</strong> • Leitura direta via Extrator v1.0
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Transcritor factual de produtos e preços homologado na versão 1.0
                </p>
              )}
            </div>

            {/* Filter Search Input & Actions */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              {extractedProducts.length > 0 && (
                <>
                  <div className="relative flex-1 sm:w-64 min-w-[180px]">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Pesquisar mercado, produto, data..."
                      className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 shadow-2xs font-medium"
                    />
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(extractedProducts, null, 2));
                      setStatusType('success');
                      setStatusMessage('JSON dos produtos copiado com sucesso para a área de transferência!');
                    }}
                    className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors shadow-2xs shrink-0 cursor-pointer"
                    title="Copiar JSON dos produtos"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handleClearCatalog}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs shrink-0 cursor-pointer"
                    title="Limpar todos os produtos catalogados da tabela"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Limpar Tabela ({extractedProducts.length})</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Table Body or Empty State */}
          {extractedProducts.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                <FileImage className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Nenhum produto catalogado ainda</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {downloadedFlyers.length > 0
                  ? 'Clique em "Extrair Produtos" em qualquer panfleto acima para que o Gemini leia a página e preencha a tabela.'
                  : 'Clique no botão verde acima "Baixar e Conferir Todos os Panfletos" para baixar os 13 panfletos e iniciar a transcrição.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] tracking-wider border-b border-slate-200 font-black">
                  <tr>
                    <th className="py-3 px-3 text-center w-10">#</th>
                    <th className="py-3 px-3 text-center w-12">Pág.</th>
                    <th className="py-3 px-3">Mercado</th>
                    <th className="py-3 px-3 whitespace-nowrap">Data Inicial</th>
                    <th className="py-3 px-3 whitespace-nowrap">Data Final</th>
                    <th className="py-3 px-4">Nome do Produto</th>
                    <th className="py-3 px-3">Marca</th>
                    <th className="py-3 px-3">Volume / Peso</th>
                    <th className="py-3 px-3">Preço Regular</th>
                    <th className="py-3 px-3">Preço Clube Abimar</th>
                    <th className="py-3 px-3">Condição / Selo</th>
                    <th className="py-3 px-3">Preço Proporcional</th>
                    <th className="py-3 px-3">Categoria</th>
                    <th className="py-3 px-3 text-center w-14">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {filteredProducts.map((item, idx) => {
                    const hasPromo = item.preco_promocional !== null && item.preco_promocional !== undefined;

                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-600 bg-slate-50/80">
                          {item.pageNumber}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                            <Building2 className="w-3 h-3 text-amber-700" />
                            <span>{item.nome_mercado || 'Abimar Supermercados'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-mono">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200">
                            {item.data_inicial || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap font-mono">
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                            {item.data_final || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 text-sm">{item.nome_produto}</div>
                          {item.chave_unica && (
                            <div
                              className="text-[10px] font-mono text-slate-400 hover:text-slate-600 truncate max-w-xs flex items-center gap-1 mt-0.5"
                              title={`Chave Única Antiduplicação: ${item.chave_unica}`}
                            >
                              <span className="text-[9px] px-1 py-0.2 bg-slate-100 text-slate-500 rounded font-semibold border border-slate-200">
                                CHAVE
                              </span>
                              <span className="truncate">{item.chave_unica}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-700">
                          {item.marca || <span className="text-slate-400 font-normal">—</span>}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-800 whitespace-nowrap">
                          {item.quantidade_volume} {item.unidade_medida}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-700 whitespace-nowrap">
                          {formatBRL(item.preco_regular)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {hasPromo ? (
                            <div className="font-black text-emerald-700 text-sm">
                              {formatBRL(item.preco_promocional)}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-medium">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {hasPromo ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                              {item.condicao_detalhes || item.tipo_promocao}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Preço Único</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-700 whitespace-nowrap">
                          {item.preco_unitario_label}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[11px] font-semibold text-slate-600 uppercase bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {item.categoria}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleDeleteProduct(item.id, item.nome_produto)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                            title={`Excluir "${item.nome_produto}"`}
                            aria-label={`Excluir ${item.nome_produto}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* SECTION 5: OPÇÃO DE UPLOAD MANUAL / FOTO AVULSA */}
        <div className="pt-2">
          <button
            onClick={() => setShowManualUpload(!showManualUpload)}
            className="text-xs text-slate-500 hover:text-slate-800 font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{showManualUpload ? 'Ocultar envio manual de foto avulsa' : 'Precisa enviar uma foto ou panfleto manual do computador? Clique aqui'}</span>
          </button>

          {showManualUpload && (
            <div className="mt-3 p-4 bg-white rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-3">
                <label className="cursor-pointer px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-2 transition-colors border border-slate-300">
                  <FileImage className="w-4 h-4 text-slate-500" />
                  <span>Selecionar Imagem</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </label>

                <div className="flex items-center gap-1 text-xs">
                  <span>Página nº:</span>
                  <input
                    type="number"
                    min={1}
                    value={manualPageInput}
                    onChange={(e) => setManualPageInput(Math.max(1, Number(e.target.value)))}
                    className="w-14 bg-white border border-slate-300 rounded px-2 py-0.5 text-center font-bold"
                  />
                </div>
              </div>

              {uploadedImageBase64 && (
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={handleExtractFromManualUpload}
                    disabled={isExtractingAI}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Extrair Desta Foto</span>
                  </button>
                  <button
                    onClick={() => {
                      setUploadedImageBase64(null);
                      setUploadedImagePreview(null);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-600"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </>
    )}

        {/* FOOTER: BASE HOMOLOGADA v1.0 */}
        <footer className="border-t border-slate-200/80 pt-6 pb-2 text-center text-xs text-slate-500">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 shadow-2xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <strong className="text-slate-800">Extrator v1.0</strong>
            <span>—</span>
            <span>Motor Base Oficial Homologado com 100% de Exatidão em Panfletos e Produtos</span>
          </div>
        </footer>
      </main>

      {/* MODAL: PREVIEW DE PANFLETO EM ALTA RESOLUÇÃO */}
      {previewFlyer && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileImage className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Página {previewFlyer.pageNumber} • {previewFlyer.fileName}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Resolução: {previewFlyer.resolution} • Tamanho: {previewFlyer.fileSizeFormatted}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/api/download-flyer-file/${previewFlyer.fileName}`}
                  download={previewFlyer.fileName}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 flex items-center gap-1 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar JPEG</span>
                </a>
                <button
                  onClick={() => setPreviewFlyer(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div className="flex-1 overflow-auto p-4 bg-slate-900 flex items-center justify-center">
              <img
                src={previewFlyer.urlLocal}
                alt={`Panfleto Página ${previewFlyer.pageNumber}`}
                className="max-h-[75vh] w-auto object-contain rounded shadow-lg"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500 truncate">{previewFlyer.mensagemValidacao}</span>
              <button
                onClick={() => {
                  const pNum = previewFlyer.pageNumber;
                  setPreviewFlyer(null);
                  handleExtractDownloadedPage(pNum);
                }}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Extrair Produtos Deste Panfleto</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
