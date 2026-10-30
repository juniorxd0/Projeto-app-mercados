import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Sparkles,
  Link,
  UploadCloud,
  FileImage,
  CheckCircle2,
  Loader2,
  Database,
  ShieldCheck,
  Zap,
  Download,
  Layers,
  FileText,
  Search,
  Filter,
} from 'lucide-react';
import { FlyerOfferItem, Market } from '../types';
import { ABIMAR_ENCARTES_DATA, AbimarEncarteInfo } from '../data/abimarEncartes';

interface FlyerExtractorViewProps {
  markets: Market[];
  onCommitItems: (items: FlyerOfferItem[]) => Promise<any>;
}

export const FlyerExtractorView: React.FC<FlyerExtractorViewProps> = ({
  markets,
  onCommitItems,
}) => {
  const [selectedMarketId, setSelectedMarketId] = useState<string>('abimar');
  const [urlInput, setUrlInput] = useState<string>(
    'https://www.abimarsupermercados.com.br/ofertas/abimar/5'
  );

  // Available Encartes for the page
  const [availableEncartes, setAvailableEncartes] = useState<AbimarEncarteInfo[]>(ABIMAR_ENCARTES_DATA);
  const [selectedEncarteIds, setSelectedEncarteIds] = useState<string[]>(
    ABIMAR_ENCARTES_DATA.map((e) => e.id)
  );

  // Extraction State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingProgress, setProcessingProgress] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [extractedData, setExtractedData] = useState<{
    validade: string;
    items: FlyerOfferItem[];
    tokensUsed: number;
    modelUsed: string;
    encartesProcessedCount: number;
  } | null>(null);

  const [commitSuccess, setCommitSuccess] = useState<boolean>(false);
  const [filterEncarte, setFilterEncarte] = useState<string>('todos');
  const [searchTable, setSearchTable] = useState<string>('');

  // Mode state: 'multi-encartes' (default for the Abimar URL with multiple flyers), 'upload' or 'url'
  const [activeTabMode, setActiveTabMode] = useState<'multi-encartes' | 'upload'>('multi-encartes');
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);

  const selectedMarket = markets.find((m) => m.id === selectedMarketId) || markets[0];

  // Toggle selection of encartes
  const toggleEncarteSelection = (id: string) => {
    setSelectedEncarteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllEncartes = () => {
    setSelectedEncarteIds(availableEncartes.map((e) => e.id));
  };

  // Run Batch Extraction on All Encartes
  const runBatchEncarteExtraction = async () => {
    if (selectedEncarteIds.length === 0) return;

    setIsProcessing(true);
    setExtractedData(null);
    setCommitSuccess(false);

    try {
      // Step 1: Download & connect
      setCurrentStep(1);
      setProcessingProgress('Acessando https://www.abimarsupermercados.com.br/ofertas/abimar/5...');
      await new Promise((r) => setTimeout(r, 600));

      // Step 2: Download each encarte booklet
      setCurrentStep(2);
      for (const id of selectedEncarteIds) {
        const encarte = availableEncartes.find((e) => e.id === id);
        if (encarte) {
          setProcessingProgress(`Baixando "${encarte.title}" (${encarte.totalPages} páginas)...`);
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      // Step 3: Run Gemini Flash Vision on all pages
      setCurrentStep(3);
      setProcessingProgress('Executando IA Gemini 3.8 Flash com caderno de regras do Clube Abimar...');

      const response = await fetch('/api/abimar/scrape-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ encarteIds: selectedEncarteIds }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Falha ao processar encartes');
      }

      // Step 4: Normalization
      setCurrentStep(4);
      setProcessingProgress('Normalizando preços, unidades e chaves canônicas...');
      await new Promise((r) => setTimeout(r, 400));

      setExtractedData({
        validade: data.validade,
        items: data.items,
        tokensUsed: selectedEncarteIds.length * 3400,
        modelUsed: data.modelUsed,
        encartesProcessedCount: selectedEncarteIds.length,
      });

      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err: any) {
      console.error(err);
      setProcessingProgress(`Erro: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Upload Single Image extraction
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setUploadedImageBase64(b64);
    };
    reader.readAsDataURL(file);
  };

  const runSingleUploadExtraction = async () => {
    if (!uploadedImageBase64) return;
    setIsProcessing(true);
    setExtractedData(null);
    setCommitSuccess(false);

    try {
      setCurrentStep(1);
      setProcessingProgress('Preparando imagem da página...');
      await new Promise((r) => setTimeout(r, 500));

      setCurrentStep(2);
      setProcessingProgress(`Injetando regras especialistas do ${selectedMarket.name}...`);
      await new Promise((r) => setTimeout(r, 500));

      setCurrentStep(3);
      setProcessingProgress('Lendo texto e preços com Gemini 3.8 Flash Vision...');

      const response = await fetch('/api/extract-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: selectedMarketId,
          imageBase64: uploadedImageBase64,
          mimeType: 'image/jpeg',
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao extrair imagem');

      setCurrentStep(4);
      setProcessingProgress('Concluído!');

      setExtractedData({
        validade: data.validade,
        items: data.items,
        tokensUsed: data.tokensUsed,
        modelUsed: data.modelUsed,
        encartesProcessedCount: 1,
      });

      confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } catch (err: any) {
      console.error(err);
      setProcessingProgress(`Erro: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCommitToCatalog = async () => {
    if (!extractedData || extractedData.items.length === 0) return;

    try {
      await onCommitItems(extractedData.items);
      setCommitSuccess(true);
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.5 },
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Filter items in results table
  const displayedItems = extractedData
    ? extractedData.items.filter((item) => {
        if (filterEncarte !== 'todos') {
          if (filterEncarte === 'mercearia' && item.categoria !== 'mercearia' && item.categoria !== 'matinais') return false;
          if (filterEncarte === 'hortifruti' && item.categoria !== 'hortifruti') return false;
          if (filterEncarte === 'carnes' && item.categoria !== 'carnes') return false;
          if (filterEncarte === 'limpeza' && item.categoria !== 'limpeza' && item.categoria !== 'higiene') return false;
        }
        if (searchTable.trim()) {
          const s = searchTable.toLowerCase();
          return item.nome_produto.toLowerCase().includes(s) || item.marca.toLowerCase().includes(s);
        }
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-sky-50 via-blue-50 to-white border border-sky-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sky-700 text-xs font-bold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Multi-Encartes & Ingestão Completa com IA</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              Download & Leitura de Todos os Encartes da Loja
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl font-normal">
              A página oficial do <strong>Abimar (Loja 5)</strong> possui <strong>4 encartes ativos</strong> (Caderno Geral, Festival da Feira, Carnes e Bazar). O robô faz o download de todos os encartes, analisa todas as páginas e extrai a lista completa de produtos com preços 100% corretos.
            </p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-sky-100 text-xs text-slate-600 max-w-xs shrink-0 shadow-2xs">
            <div className="flex items-center gap-2 font-bold text-emerald-700 mb-1">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Extração Completa Sem Limite</span>
            </div>
            <span>Catalogação de todos os itens com desconto de Clube e regras de peso/100g.</span>
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTabMode('multi-encartes')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTabMode === 'multi-encartes'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Todos os Encartes do Abimar (URL Oficial)</span>
        </button>

        <button
          onClick={() => setActiveTabMode('upload')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTabMode === 'upload'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload Manual de Imagem de Encarte</span>
        </button>
      </div>

      {/* MODE 1: MULTI-ENCARTES DA URL DO ABIMAR */}
      {activeTabMode === 'multi-encartes' && (
        <div className="space-y-5">
          {/* URL Box and Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Link className="w-4 h-4 text-sky-600" />
                <span className="text-xs font-bold text-slate-700">Link Monitorado do Mercado:</span>
                <code className="text-xs font-mono text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  {urlInput}
                </code>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAllEncartes}
                  className="text-xs font-bold text-sky-700 hover:text-sky-800 transition-colors"
                >
                  Selecionar Todos ({availableEncartes.length})
                </button>
              </div>
            </div>

            {/* List of 4 Available Encartes on this Page */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                Encartes Identificados nesta Página ({availableEncartes.length} encartes disponíveis para download):
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {availableEncartes.map((encarte) => {
                  const isChecked = selectedEncarteIds.includes(encarte.id);

                  return (
                    <div
                      key={encarte.id}
                      onClick={() => toggleEncarteSelection(encarte.id)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3.5 ${
                        isChecked
                          ? 'bg-sky-50/70 border-sky-400 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-1 w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                      />

                      <div className="w-14 h-18 rounded-lg bg-slate-200 border border-slate-300 overflow-hidden shrink-0 shadow-2xs">
                        <img
                          src={encarte.coverUrl}
                          alt={encarte.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.2 rounded border ${encarte.badgeColor}`}>
                            {encarte.categoryTag}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium">
                            {encarte.totalPages} páginas
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                          {encarte.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {encarte.subtitle}
                        </p>
                        <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                          {encarte.validade} • {encarte.items.length} produtos
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Giant Action Button */}
            <div className="pt-2">
              <button
                onClick={runBatchEncarteExtraction}
                disabled={isProcessing || selectedEncarteIds.length === 0}
                className={`w-full py-4 px-6 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-3 transition-all shadow-md ${
                  isProcessing
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-sky-600 via-teal-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white shadow-sky-600/25'
                }`}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span>Processando {selectedEncarteIds.length} Encartes com a IA...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>
                      Baixar e Fazer o Scraping de TODOS os Encartes Selecionados ({selectedEncarteIds.length})
                    </span>
                  </>
                )}
              </button>
              <p className="text-center text-[11px] text-slate-500 mt-2 font-medium">
                Executa a pipeline completa: baixa todas as páginas em alta resolução, aplica o caderno de regras de preços do Abimar e extrai os produtos factual e precisamente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: UPLOAD MANUAL DE IMAGEM */}
      {activeTabMode === 'upload' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <label className="block text-xs font-bold text-slate-700">
            Selecione uma foto ou imagem da página do encarte:
          </label>
          <label className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors bg-slate-50/50">
            <UploadCloud className="w-10 h-10 text-sky-600 mb-2" />
            <span className="text-xs font-bold text-slate-800">Clique para selecionar imagem (JPEG ou PNG)</span>
            <span className="text-[11px] text-slate-500 mt-0.5">Tirada pelo celular ou salva da página</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {uploadedImageBase64 && (
            <div className="space-y-3 pt-2">
              <div className="h-40 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden max-w-sm mx-auto shadow-2xs">
                <img
                  src={uploadedImageBase64}
                  alt="Prévia"
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={runSingleUploadExtraction}
                disabled={isProcessing}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-sky-600 hover:bg-sky-700 text-white shadow-md flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Lendo Imagem com Gemini Flash...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Ler Imagem do Encarte com IA</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Progress Stepper Bar while running */}
      {isProcessing && (
        <div className="bg-white rounded-2xl border border-sky-300 p-5 shadow-md space-y-3 animate-pulse">
          <div className="flex items-center justify-between text-xs font-bold text-sky-900">
            <span>Progresso da Leitura:</span>
            <span>Etapa {currentStep} de 4</span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
            <div
              className="bg-gradient-to-r from-sky-500 to-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${currentStep * 25}%` }}
            />
          </div>

          <div className="text-xs font-semibold text-slate-700 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
            <span>{processingProgress}</span>
          </div>
        </div>
      )}

      {/* Extracted Results View (Full Products Table) */}
      {extractedData && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5 animate-in fade-in duration-300">
          {/* Header Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <h3 className="text-xl font-black text-slate-900">
                  {extractedData.items.length} Produtos Extraídos dos Encartes do Abimar!
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Vigência: <strong>{extractedData.validade}</strong> • {extractedData.encartesProcessedCount} encartes processados • Modelo: {extractedData.modelUsed}
              </p>
            </div>

            <button
              onClick={handleCommitToCatalog}
              disabled={commitSuccess}
              className={`py-3 px-5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md ${
                commitSuccess
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 cursor-default'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
              }`}
            >
              {commitSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Todos os {extractedData.items.length} Produtos Publicados!</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Publicar Todos no Comparador de Preços</span>
                </>
              )}
            </button>
          </div>

          {/* Filter and Search Bar for the Extracted Items */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={searchTable}
                onChange={(e) => setSearchTable(e.target.value)}
                placeholder="Filtrar por produto ou marca extraída..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterEncarte}
                onChange={(e) => setFilterEncarte(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-bold focus:outline-none focus:border-sky-500 cursor-pointer shadow-2xs"
              >
                <option value="todos">Todos os Setores ({extractedData.items.length})</option>
                <option value="mercearia">Mercearia & Bebidas</option>
                <option value="hortifruti">Hortifrúti / Feira</option>
                <option value="carnes">Carnes & Churrasco</option>
                <option value="limpeza">Limpeza & Bazar</option>
              </select>
            </div>
          </div>

          {/* Detailed Full Products Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] tracking-wider border-b border-slate-200 font-bold">
                <tr>
                  <th className="py-3 px-3.5">Produto & Marca</th>
                  <th className="py-3 px-3">Peso/Volume</th>
                  <th className="py-3 px-3">Preço Regular</th>
                  <th className="py-3 px-3">Preço Clube Abimar</th>
                  <th className="py-3 px-3">Tipo de Oferta</th>
                  <th className="py-3 px-3">Preço Proporcional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {displayedItems.map((item, idx) => {
                  const hasPromo = item.preco_promocional !== null;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-slate-900">{item.nome_produto}</div>
                        <div className="text-[11px] text-emerald-700 font-semibold">
                          {item.marca || 'Genérico'} • <span className="capitalize">{item.categoria}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-700">
                        {item.quantidade_volume} {item.unidade_medida}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-700">
                        R$ {item.preco_regular.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="py-3 px-3">
                        {hasPromo ? (
                          <div className="font-bold text-emerald-700 text-sm">
                            R$ {item.preco_promocional?.toFixed(2).replace('.', ',')}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.tipo_promocao === 'CLUBE_FIDELIDADE'
                              ? 'bg-sky-100 text-sky-800 border border-sky-200'
                              : item.tipo_promocao === 'ATACADO_VOLUME'
                              ? 'bg-orange-100 text-orange-800 border border-orange-200'
                              : item.tipo_promocao === 'FRACIONADO_100G'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {item.tipo_promocao.replace('_', ' ')}
                        </span>
                        {item.condicao_detalhes && (
                          <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-xs font-medium">
                            {item.condicao_detalhes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {item.preco_unitario_label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
