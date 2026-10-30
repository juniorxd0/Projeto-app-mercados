import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  GraduationCap,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  Code2,
  Brain,
  Sliders,
} from 'lucide-react';
import { Market, FewShotExample } from '../types';

interface MarketTrainerStudioProps {
  markets: Market[];
  onSaveMarketRules: (
    marketId: string,
    updatedRules: {
      customRules: string;
      rulesList: any[];
      fewShotExamples: FewShotExample[];
    }
  ) => Promise<void>;
}

export const MarketTrainerStudio: React.FC<MarketTrainerStudioProps> = ({
  markets,
  onSaveMarketRules,
}) => {
  const [selectedMarketId, setSelectedMarketId] = useState<string>('abimar');
  const market = markets.find((m) => m.id === selectedMarketId) || markets[0];

  // Editable state
  const [customRulesText, setCustomRulesText] = useState<string>(market.customRules);
  const [fewShotList, setFewShotList] = useState<FewShotExample[]>(market.fewShotExamples || []);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'regras' | 'exemplos' | 'prompt-completo'>('regras');

  // Modal for new few-shot example
  const [showAddExampleModal, setShowAddExampleModal] = useState<boolean>(false);
  const [newExampleTitle, setNewExampleTitle] = useState<string>('');
  const [newExampleVisualCue, setNewExampleVisualCue] = useState<string>('');
  const [newExampleRawText, setNewExampleRawText] = useState<string>('');
  const [newExampleProduct, setNewExampleProduct] = useState<string>('');
  const [newExampleBrand, setNewExampleBrand] = useState<string>('');
  const [newExamplePrice, setNewExamplePrice] = useState<number>(0);
  const [newExamplePromoPrice, setNewExamplePromoPrice] = useState<number | null>(null);
  const [newExamplePromoType, setNewExamplePromoType] = useState<string>('CLUBE_FIDELIDADE');

  const handleMarketChange = (newMarketId: string) => {
    setSelectedMarketId(newMarketId);
    const m = markets.find((item) => item.id === newMarketId) || markets[0];
    setCustomRulesText(m.customRules);
    setFewShotList(m.fewShotExamples || []);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveMarketRules(selectedMarketId, {
        customRules: customRulesText,
        rulesList: market.rulesList,
        fewShotExamples: fewShotList,
      });

      setSaveSuccess(true);
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 },
      });
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddExample = () => {
    if (!newExampleTitle || !newExampleProduct) return;

    const newEx: FewShotExample = {
      id: `ex-${Date.now()}`,
      title: newExampleTitle,
      visualCue: newExampleVisualCue,
      rawTextInput: newExampleRawText,
      expectedOutput: {
        nome_produto: newExampleProduct,
        marca: newExampleBrand,
        quantidade_volume: 1,
        unidade_medida: 'unidade',
        preco_regular: newExamplePrice,
        preco_promocional: newExamplePromoPrice,
        tipo_promocao: newExamplePromoType,
        condicao_detalhes: 'Exemplo treinado pelo usuário',
        categoria_sugerida: 'mercearia',
      },
    };

    setFewShotList([...fewShotList, newEx]);
    setShowAddExampleModal(false);
    setNewExampleTitle('');
    setNewExampleVisualCue('');
    setNewExampleRawText('');
    setNewExampleProduct('');
    setNewExampleBrand('');
    setNewExamplePrice(0);
    setNewExamplePromoPrice(null);
  };

  const handleDeleteExample = (id: string) => {
    setFewShotList(fewShotList.filter((e) => e.id !== id));
  };

  const assembledPrompt = `Você é um especialista sênior em extração e catalogação de encartes de supermercados brasileiros.
Analise a página do encarte com atenção aos preços e selos.

CADERNO DE REGRAS ESPECÍFICO DESTE MERCADO (${market.name.toUpperCase()}):
${customRulesText}

EXEMPLOS DE APRENDIZADO (FEW-SHOT LEARNING):
${fewShotList
  .map(
    (ex, idx) => `
[Exemplo ${idx + 1}: ${ex.title}]
Dica visual: ${ex.visualCue}
Texto na imagem: "${ex.rawTextInput}"
JSON correto esperado:
${JSON.stringify(ex.expectedOutput, null, 2)}`
  )
  .join('\n')}`;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-white border border-indigo-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-1">
              <Brain className="w-4 h-4" />
              <span>Estúdio de Treinamento Contínuo por Mercado</span>
            </div>
            <h2 className="text-2xl font-black text-slate-900">
              Especialize a IA no Encarte de Cada Mercado
            </h2>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl font-normal">
              Cada rede de supermercados possui sua própria diagramação, selos de clube e pegadinhas de preço. Personalize as regras e forneça exemplos visuais (*Few-Shot Learning*). Tudo fica salvo no banco e a IA nunca mais erra aquele padrão!
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`py-2.5 px-5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-sm ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20'
              }`}
            >
              {isSaving ? (
                <span>Salvando...</span>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Salvo com Sucesso!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Salvar Regras no Banco</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Market Selector Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 shrink-0 mr-2">
          Mercado em Treinamento:
        </span>
        {markets.map((m) => {
          const isSelected = m.id === selectedMarketId;
          return (
            <button
              key={m.id}
              onClick={() => handleMarketChange(m.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                isSelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{m.name}</span>
              {m.fewShotExamples?.length > 0 && (
                <span className={`ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isSelected ? 'bg-indigo-800 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {m.fewShotExamples.length} ex.
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Studio Workspace */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Studio Sub-tabs */}
        <div className="flex items-center border-b border-slate-200 px-6 pt-3 gap-2 bg-slate-50/70">
          <button
            onClick={() => setActiveTab('regras')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'regras'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>1. Caderno de Regras Visuais</span>
          </button>

          <button
            onClick={() => setActiveTab('exemplos')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'exemplos'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>2. Exemplos de Aprendizado ({fewShotList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('prompt-completo')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'prompt-completo'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>3. Inspetor de Prompt (Gemini Flash)</span>
          </button>
        </div>

        {/* Studio Content */}
        <div className="p-6">
          {/* TAB 1: Caderno de Regras */}
          {activeTab === 'regras' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Instruções Específicas para {market.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Escreva orientações em linguagem natural sobre selos, cores e peculiaridades do encarte desta loja.
                </p>
              </div>

              <textarea
                value={customRulesText}
                onChange={(e) => setCustomRulesText(e.target.value)}
                rows={8}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-4 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors leading-relaxed shadow-2xs"
                placeholder="Exemplo de regra: O selo azul com carrinho sempre indica preço do Clube Abimar..."
              />

              {/* Quick Preset Buttons for Rules */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-600 font-bold mr-1">Inserir Regra Rápida:</span>
                <button
                  onClick={() =>
                    setCustomRulesText(
                      (prev) =>
                        prev +
                        '\n- Selo de fidelidade: valores menores em destaque com logotipo do app/clube exigem cadastro.'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-medium shadow-2xs"
                >
                  + Preço de Clube / Cartão
                </button>
                <button
                  onClick={() =>
                    setCustomRulesText(
                      (prev) =>
                        prev +
                        '\n- Frios fatiados (100g): quando houver indicação de 100g, normalizar unidade_medida para "g" e quantidade para 100.'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-medium shadow-2xs"
                >
                  + Regra dos 100g em Frios
                </button>
                <button
                  onClick={() =>
                    setCustomRulesText(
                      (prev) =>
                        prev +
                        '\n- Carnes a granel: carnes bovinas e suínas sem embalagem fechada devem ter unidade_medida = "kg" e quantidade = 1.0.'
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-medium shadow-2xs"
                >
                  + Carnes a Granel (kg)
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Exemplos de Aprendizado (Few-Shot) */}
          {activeTab === 'exemplos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Galeria de Exemplos (*Few-Shot Learning*)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ensine a IA mostrando a foto/texto do produto difícil e o JSON exato que você quer que ela gere.
                  </p>
                </div>

                <button
                  onClick={() => setShowAddExampleModal(true)}
                  className="py-2 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Novo Exemplo</span>
                </button>
              </div>

              {fewShotList.length === 0 ? (
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center max-w-md mx-auto">
                  <GraduationCap className="w-8 h-8 text-indigo-600 mx-auto mb-2 opacity-70" />
                  <p className="text-xs text-slate-800 font-bold">Nenhum exemplo gravado para {market.name}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Adicione exemplos de produtos complexos para calibrar a leitura da IA.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {fewShotList.map((ex) => (
                    <div
                      key={ex.id}
                      className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2.5 relative group shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-slate-900 text-sm">{ex.title}</div>
                        <button
                          onClick={() => handleDeleteExample(ex.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-[11px] space-y-1">
                        <div>
                          <strong className="text-indigo-700">Dica Visual:</strong>{' '}
                          <span className="text-slate-700">{ex.visualCue}</span>
                        </div>
                        <div>
                          <strong className="text-emerald-700">Texto no Encarte:</strong>{' '}
                          <span className="text-slate-700">"{ex.rawTextInput}"</span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                          JSON que a IA aprendeu a responder:
                        </span>
                        <pre className="bg-white p-2.5 rounded-lg border border-slate-200 text-[10px] text-slate-800 overflow-x-auto font-mono">
                          {JSON.stringify(ex.expectedOutput, null, 2)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Prompt Completo Injetado no Gemini */}
          {activeTab === 'prompt-completo' && (
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Prompt Final Montado Dinamicamente para {market.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Este é exatamente o texto de sistema que é enviado à API do Gemini 3.8 Flash ao analisar cada página do encarte deste mercado.
                </p>
              </div>

              <pre className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 shadow-md">
                {assembledPrompt}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Add New Few-Shot Example */}
      {showAddExampleModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  Ensinar Novo Padrão para {market.name}
                </h3>
              </div>
              <button
                onClick={() => setShowAddExampleModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Título do Caso:</label>
                <input
                  type="text"
                  value={newExampleTitle}
                  onChange={(e) => setNewExampleTitle(e.target.value)}
                  placeholder="Ex: Queijo Prato Fatiado 100g"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Dica Visual / Layout no Encarte:
                </label>
                <input
                  type="text"
                  value={newExampleVisualCue}
                  onChange={(e) => setNewExampleVisualCue(e.target.value)}
                  placeholder="Ex: Preço grande em amarelo com aviso minúsculo 'cada 100g'"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Texto Literal Escrito no Encarte:
                </label>
                <input
                  type="text"
                  value={newExampleRawText}
                  onChange={(e) => setNewExampleRawText(e.target.value)}
                  placeholder="Ex: Queijo Prato Fatiado Tirolez - R$ 5,99 a cada 100g"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome do Produto:</label>
                  <input
                    type="text"
                    value={newExampleProduct}
                    onChange={(e) => setNewExampleProduct(e.target.value)}
                    placeholder="Queijo Prato Fatiado"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Marca:</label>
                  <input
                    type="text"
                    value={newExampleBrand}
                    onChange={(e) => setNewExampleBrand(e.target.value)}
                    placeholder="Tirolez"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preço Normal (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newExamplePrice}
                    onChange={(e) => setNewExamplePrice(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Preço Promocional (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newExamplePromoPrice ?? ''}
                    onChange={(e) => setNewExamplePromoPrice(e.target.value ? Number(e.target.value) : null)}
                    placeholder="Opcional"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowAddExampleModal(false)}
                className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddExample}
                className="py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs"
              >
                Adicionar à Memória da IA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
