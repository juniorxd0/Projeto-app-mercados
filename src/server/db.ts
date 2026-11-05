import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type StatusExecucao = 'SUCESSO' | 'FALHA' | 'PROCESSANDO';

export interface MercadoUrlModel {
  id: string;
  mercado_id: string;
  descricao: string;
  url: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface MercadoModel {
  id: string;
  nome: string;
  ativo: boolean;
  regras_extracao_ia: any | null; // Configuração futura para prompts e seletores customizados
  criado_em: string;
  atualizado_em: string;
  urls: MercadoUrlModel[];
}

export interface ConfiguracaoRotinaModel {
  id: string;
  dias_semana: number[]; // 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado
  horario_execucao: string; // Formato HH:mm
  frequencia_cron: string; // Ex: "0 6 * * 1,3,5"
  ativo: boolean;
  ultima_execucao: string | null;
  status_ultima_execucao: StatusExecucao | null;
  log_ultima_execucao: string | null;
  criado_em: string;
  atualizado_em: string;
}

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

export interface AiUsageModel {
  limite_diario_requisicoes: number; // 20 RPD no Free Tier do Google AI Studio para Gemini 3.8 Flash
  limite_rpm: number; // 15 RPM
  modelo_ativo: string;
  plano_nome: string;
  data_referencia: string; // YYYY-MM-DD
  requisicoes_hoje: number;
  requisicoes_sucesso: number;
  requisicoes_falhas: number;
  total_paginas_extraidas_hoje: number;
  total_produtos_extraidos_hoje: number;
  ultima_requisicao: string | null;
  cota_esgotada_hoje?: boolean;
  mensagem_cota?: string | null;
  historico_recente: AiRecentCall[];
}

export interface AiUsageReport extends AiUsageModel {
  percentual_usado: number;
  requisicoes_restantes: number;
  tempo_ate_reset: string;
}

export interface ExtractedProductModel {
  id: string;
  chave_unica: string; // Ex: abimar_arroz_parboilizado_tipo_1_tio_joao_5_kg_23102026_29102026
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
  criado_em?: string;
  atualizado_em?: string;
}

export interface EncarteProcessadoModel {
  id: string;
  mercado_nome: string;
  url_origem: string;
  validade: string;
  chaves_imagens: string[];
  total_produtos: number;
  processado_em: string;
}

export interface UpsertResult {
  updatedList: ExtractedProductModel[];
  novosInseridos: number;
  duplicadosEvitados: number;
  atualizados: number;
}

// Normalizador de texto para chaves únicas livres de acentos e caracteres especiais
export function normalizeKeyText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Gerador da Chave Única Composta (Natural Key) para prevenção factual de duplicação
export function generateProductCompositeKey(item: {
  nome_mercado: string;
  nome_produto: string;
  marca?: string | null;
  quantidade_volume: number;
  unidade_medida: string;
  data_inicial: string;
  data_final: string;
  tipo_promocao?: string | null;
}): string {
  const mercado = normalizeKeyText(item.nome_mercado || 'mercado');
  const produto = normalizeKeyText(item.nome_produto || 'produto');
  const marca = normalizeKeyText(item.marca || '');
  const volNum = Number(item.quantidade_volume) || 1;
  const volStr = String(volNum).replace('.', '_');
  const unid = normalizeKeyText(item.unidade_medida || 'un');
  const dtIni = (item.data_inicial || '').replace(/\D/g, '');
  const dtFim = (item.data_final || '').replace(/\D/g, '');
  const tipo = normalizeKeyText(item.tipo_promocao || 'sem_promocao');

  const parts = [
    mercado,
    produto,
    marca ? marca : null,
    `${volStr}_${unid}`,
    dtIni && dtFim ? `${dtIni}_${dtFim}` : null,
    tipo && tipo !== 'sem_promocao' ? tipo : null,
  ].filter(Boolean);

  return parts.join('_');
}

interface DatabaseSchema {
  mercados: MercadoModel[];
  configuracao_rotina: ConfiguracaoRotinaModel;
  ia_uso?: AiUsageModel;
  produtos_extraidos?: ExtractedProductModel[];
  encartes_processados?: EncarteProcessadoModel[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDefaultDatabase(): DatabaseSchema {
  const now = new Date().toISOString();
  const mercadoAbimarId = crypto.randomUUID();

  return {
    mercados: [
      {
        id: mercadoAbimarId,
        nome: 'Abimar Supermercados',
        ativo: true,
        regras_extracao_ia: {
          versao_motor: '1.0',
          mercado: 'Abimar Supermercados',
          vigencia: 'Extrair obrigatoriamente a data inicial e data final de vigência impressas no panfleto (ex: "Ofertas válidas de 23/10 a 29/10/2026") e preencher os campos data_inicial e data_final de cada produto.',
          regras_especificas: [
            'Identificar data de vigência no cabeçalho ou rodapé e registrar data_inicial (DD/MM/AAAA) e data_final (DD/MM/AAAA) em todos os produtos.',
            'Preencher o campo nome_mercado obrigatoriamente com "Abimar Supermercados".',
            'Registrar preco_promocional com desconto exclusivo Clube Abimar quando houver.',
            'Precisão factual 100% sem alucinações de produtos ou valores.',
          ],
        },
        criado_em: now,
        atualizado_em: now,
        urls: [
          {
            id: crypto.randomUUID(),
            mercado_id: mercadoAbimarId,
            descricao: 'Ofertas Gerais da Semana (Matriz & Filiais)',
            url: 'https://www.abimarsupermercados.com.br/ofertas/abimar/5',
            ativo: true,
            criado_em: now,
            atualizado_em: now,
          },
        ],
      },
      {
        id: crypto.randomUUID(),
        nome: 'Giassi Supermercados',
        ativo: true,
        regras_extracao_ia: {
          versao_motor: '1.0',
          mercado: 'Giassi Supermercados',
          vigencia: 'Extrair obrigatoriamente a data inicial e data final de vigência impressas no panfleto e preencher os campos data_inicial e data_final de cada produto.',
          regras_especificas: [
            'Identificar data de vigência no cabeçalho ou rodapé e registrar data_inicial (DD/MM/AAAA) e data_final (DD/MM/AAAA) em todos os produtos.',
            'Preencher o campo nome_mercado obrigatoriamente com "Giassi Supermercados".',
            'Registrar preco_promocional com desconto exclusivo Amigo Giassi quando houver.',
            'Precisão factual 100% sem alucinações de produtos ou valores.',
          ],
        },
        criado_em: now,
        atualizado_em: now,
        urls: [
          {
            id: crypto.randomUUID(),
            mercado_id: 'giassi',
            descricao: 'Ofertas e Encartes da Semana',
            url: 'https://www.giassi.com.br/ofertas',
            ativo: true,
            criado_em: now,
            atualizado_em: now,
          },
        ],
      },
    ],
    configuracao_rotina: {
      id: crypto.randomUUID(),
      dias_semana: [1, 3, 5], // Seg, Qua, Sex
      horario_execucao: '06:00',
      frequencia_cron: '0 6 * * 1,3,5',
      ativo: true,
      ultima_execucao: null,
      status_ultima_execucao: null,
      log_ultima_execucao: 'Sistema inicializado. Nenhuma rotina executada automaticamente ainda.',
      criado_em: now,
      atualizado_em: now,
    },
  };
}

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.mercados) && parsed.configuracao_rotina) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Database] Erro ao ler database.json, restaurando padrões:', e);
    }

    const defaultDb = getDefaultDatabase();
    this.saveDirect(defaultDb);
    return defaultDb;
  }

  private save(): void {
    this.saveDirect(this.data);
  }

  private saveDirect(dataToSave: DatabaseSchema): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Database] Erro ao salvar database.json:', err);
    }
  }

  // --- MERCADOS ---
  public getMercados(): MercadoModel[] {
    return this.data.mercados;
  }

  public getMercadoById(id: string): MercadoModel | undefined {
    return this.data.mercados.find((m) => m.id === id);
  }

  public createMercado(payload: {
    nome: string;
    ativo?: boolean;
    regras_extracao_ia?: any;
    urls?: Array<{ descricao: string; url: string; ativo?: boolean }>;
  }): MercadoModel {
    const trimmedNome = payload.nome.trim();
    if (!trimmedNome) {
      throw new Error('O nome do mercado é obrigatório.');
    }

    const existing = this.data.mercados.find(
      (m) => m.nome.toLowerCase() === trimmedNome.toLowerCase()
    );
    if (existing) {
      throw new Error(`Já existe um mercado cadastrado com o nome "${trimmedNome}".`);
    }

    const now = new Date().toISOString();
    const mercadoId = crypto.randomUUID();

    const nestedUrls: MercadoUrlModel[] = (payload.urls || []).map((u) => ({
      id: crypto.randomUUID(),
      mercado_id: mercadoId,
      descricao: u.descricao?.trim() || 'Ofertas Gerais',
      url: u.url?.trim() || '',
      ativo: u.ativo !== false,
      criado_em: now,
      atualizado_em: now,
    }));

    const newMercado: MercadoModel = {
      id: mercadoId,
      nome: trimmedNome,
      ativo: payload.ativo !== false,
      regras_extracao_ia: payload.regras_extracao_ia || null,
      criado_em: now,
      atualizado_em: now,
      urls: nestedUrls,
    };

    this.data.mercados.push(newMercado);
    this.save();
    return newMercado;
  }

  public updateMercado(
    id: string,
    payload: {
      nome?: string;
      ativo?: boolean;
      regras_extracao_ia?: any;
      urls?: Array<{ id?: string; descricao: string; url: string; ativo?: boolean }>;
    }
  ): MercadoModel {
    const index = this.data.mercados.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error('Mercado não encontrado.');
    }

    const current = this.data.mercados[index];
    const now = new Date().toISOString();

    if (payload.nome !== undefined) {
      const trimmed = payload.nome.trim();
      if (!trimmed) throw new Error('O nome do mercado não pode ser vazio.');

      const existingOther = this.data.mercados.find(
        (m) => m.id !== id && m.nome.toLowerCase() === trimmed.toLowerCase()
      );
      if (existingOther) {
        throw new Error(`Já existe outro mercado com o nome "${trimmed}".`);
      }
      current.nome = trimmed;
    }

    if (payload.ativo !== undefined) {
      current.ativo = Boolean(payload.ativo);
    }

    if (payload.regras_extracao_ia !== undefined) {
      current.regras_extracao_ia = payload.regras_extracao_ia;
    }

    if (payload.urls !== undefined) {
      // Re-map URLs
      current.urls = payload.urls
        .filter((u) => u.url && u.url.trim().length > 0)
        .map((u) => ({
          id: u.id || crypto.randomUUID(),
          mercado_id: current.id,
          descricao: u.descricao?.trim() || 'Ofertas Gerais',
          url: u.url.trim(),
          ativo: u.ativo !== false,
          criado_em: current.urls.find((old) => old.id === u.id)?.criado_em || now,
          atualizado_em: now,
        }));
    }

    current.atualizado_em = now;
    this.data.mercados[index] = current;
    this.save();
    return current;
  }

  public deleteMercado(id: string): boolean {
    const initialLength = this.data.mercados.length;
    this.data.mercados = this.data.mercados.filter((m) => m.id !== id);
    if (this.data.mercados.length !== initialLength) {
      this.save();
      return true;
    }
    return false;
  }

  // --- CONFIGURAÇÃO DE ROTINA ---
  public getConfiguracaoRotina(): ConfiguracaoRotinaModel {
    return this.data.configuracao_rotina;
  }

  public updateConfiguracaoRotina(
    payload: Partial<ConfiguracaoRotinaModel>
  ): ConfiguracaoRotinaModel {
    const current = this.data.configuracao_rotina;
    const now = new Date().toISOString();

    if (payload.dias_semana !== undefined) {
      current.dias_semana = payload.dias_semana;
    }
    if (payload.horario_execucao !== undefined) {
      current.horario_execucao = payload.horario_execucao;
    }
    if (payload.frequencia_cron !== undefined) {
      current.frequencia_cron = payload.frequencia_cron;
    }
    if (payload.ativo !== undefined) {
      current.ativo = Boolean(payload.ativo);
    }
    if (payload.ultima_execucao !== undefined) {
      current.ultima_execucao = payload.ultima_execucao;
    }
    if (payload.status_ultima_execucao !== undefined) {
      current.status_ultima_execucao = payload.status_ultima_execucao;
    }
    if (payload.log_ultima_execucao !== undefined) {
      current.log_ultima_execucao = payload.log_ultima_execucao;
    }

    current.atualizado_em = now;
    this.data.configuracao_rotina = current;
    this.save();
    return current;
  }

  // --- USO E LIMITES DA IA (GEMINI FLASH) ---
  public getAiUsage(): AiUsageReport {
    const today = new Date().toISOString().split('T')[0];
    if (!this.data.ia_uso) {
      this.data.ia_uso = {
        limite_diario_requisicoes: 20,
        limite_rpm: 15,
        modelo_ativo: 'gemini-3.8-flash',
        plano_nome: 'Gratuito (Google AI Studio - 20 RPD)',
        data_referencia: today,
        requisicoes_hoje: 0,
        requisicoes_sucesso: 0,
        requisicoes_falhas: 0,
        total_paginas_extraidas_hoje: 0,
        total_produtos_extraidos_hoje: 0,
        ultima_requisicao: null,
        cota_esgotada_hoje: false,
        mensagem_cota: null,
        historico_recente: [],
      };
      this.save();
    }

    // Se o limite armazenado ainda for o antigo 1500 fictício, atualiza para 20 RPD real
    if (this.data.ia_uso.limite_diario_requisicoes === 1500) {
      this.data.ia_uso.limite_diario_requisicoes = 20;
      this.data.ia_uso.plano_nome = 'Gratuito (Google AI Studio - 20 RPD)';
      this.save();
    }

    // Rollover diário automático
    if (this.data.ia_uso.data_referencia !== today) {
      this.data.ia_uso.data_referencia = today;
      this.data.ia_uso.requisicoes_hoje = 0;
      this.data.ia_uso.requisicoes_sucesso = 0;
      this.data.ia_uso.requisicoes_falhas = 0;
      this.data.ia_uso.total_paginas_extraidas_hoje = 0;
      this.data.ia_uso.total_produtos_extraidos_hoje = 0;
      this.data.ia_uso.cota_esgotada_hoje = false;
      this.data.ia_uso.mensagem_cota = null;
      this.save();
    }

    const current = this.data.ia_uso;
    const limite = current.limite_diario_requisicoes || 20;
    const percentual = Number(((current.requisicoes_hoje / limite) * 100).toFixed(1));
    const restantes = Math.max(0, limite - current.requisicoes_hoje);

    // Contagem regressiva até meia-noite (reset de cota diária do Google)
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diffMs = Math.max(0, midnight.getTime() - now.getTime());
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const tempo_ate_reset = `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}min`;

    return {
      ...current,
      percentual_usado: percentual,
      requisicoes_restantes: restantes,
      tempo_ate_reset,
    };
  }

  public recordAiQuotaExhausted(params: {
    modelo: string;
    limite?: number;
    detalhes?: string;
  }): AiUsageReport {
    this.getAiUsage();
    const current = this.data.ia_uso!;
    const limite = params.limite || 20;
    current.cota_esgotada_hoje = true;
    current.limite_diario_requisicoes = limite;
    current.requisicoes_hoje = Math.max(current.requisicoes_hoje, limite);
    current.requisicoes_falhas += 1;
    current.plano_nome = `Gratuito (Google AI Studio - ${limite} RPD)`;
    current.mensagem_cota = `Limite de ${limite} requisições diárias gratuitas atingido para o modelo ${params.modelo}.`;
    current.ultima_requisicao = new Date().toLocaleString('pt-BR');
    this.save();
    return this.getAiUsage();
  }

  public recordAiCall(params: {
    modelo: string;
    mercado: string;
    pagina: number;
    produtosCount: number;
    sucesso: boolean;
    tempoSegundos: number;
  }): AiUsageReport {
    this.getAiUsage(); // Garante inicialização e verificação de rollover
    const current = this.data.ia_uso!;
    const now = new Date();

    current.requisicoes_hoje += 1;
    if (params.sucesso) {
      current.requisicoes_sucesso += 1;
      current.total_paginas_extraidas_hoje += 1;
      current.total_produtos_extraidos_hoje += params.produtosCount;
    } else {
      current.requisicoes_falhas += 1;
    }

    current.ultima_requisicao = now.toLocaleString('pt-BR');
    current.modelo_ativo = params.modelo || current.modelo_ativo;

    const newCall: AiRecentCall = {
      id: crypto.randomUUID(),
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      modelo: params.modelo,
      mercado: params.mercado,
      pagina: params.pagina,
      produtosExtraidos: params.produtosCount,
      sucesso: params.sucesso,
      tempoSegundos: params.tempoSegundos,
    };

    current.historico_recente = [newCall, ...(current.historico_recente || [])].slice(0, 30);
    this.save();
    return this.getAiUsage();
  }

  public updateAiLimits(payload: {
    limite_diario_requisicoes?: number;
    limite_rpm?: number;
    plano_nome?: string;
  }): AiUsageReport {
    this.getAiUsage();
    const current = this.data.ia_uso!;

    if (payload.limite_diario_requisicoes && payload.limite_diario_requisicoes > 0) {
      current.limite_diario_requisicoes = payload.limite_diario_requisicoes;
    }
    if (payload.limite_rpm && payload.limite_rpm > 0) {
      current.limite_rpm = payload.limite_rpm;
    }
    if (payload.plano_nome) {
      current.plano_nome = payload.plano_nome;
    }

    this.save();
    return this.getAiUsage();
  }

  // --- PRODUTOS EXTRAÍDOS (UPSERT E DESDUPLICAÇÃO FACTUAL) ---
  public getProdutosExtraidos(): ExtractedProductModel[] {
    if (!this.data.produtos_extraidos) {
      this.data.produtos_extraidos = [];
    }
    return this.data.produtos_extraidos;
  }

  public upsertProdutos(incomingList: ExtractedProductModel[]): UpsertResult {
    if (!this.data.produtos_extraidos) {
      this.data.produtos_extraidos = [];
    }

    const itemMap = new Map<string, ExtractedProductModel>();
    for (const item of this.data.produtos_extraidos) {
      const key = item.chave_unica || generateProductCompositeKey(item);
      itemMap.set(key, { ...item, chave_unica: key });
    }

    let novosInseridos = 0;
    let duplicadosEvitados = 0;
    let atualizados = 0;
    const now = new Date().toISOString();

    for (const incoming of incomingList) {
      const key = incoming.chave_unica || generateProductCompositeKey(incoming);
      const existing = itemMap.get(key);

      if (!existing) {
        itemMap.set(key, {
          ...incoming,
          chave_unica: key,
          criado_em: incoming.criado_em || now,
          atualizado_em: now,
        });
        novosInseridos++;
      } else {
        duplicadosEvitados++;
        const precoMudou =
          existing.preco_regular !== incoming.preco_regular ||
          existing.preco_promocional !== incoming.preco_promocional;

        if (precoMudou) {
          atualizados++;
          itemMap.set(key, {
            ...existing,
            preco_regular: incoming.preco_regular,
            preco_promocional: incoming.preco_promocional,
            preco_unitario_equivalente: incoming.preco_unitario_equivalente,
            preco_unitario_label: incoming.preco_unitario_label,
            atualizado_em: now,
          });
        }
      }
    }

    this.data.produtos_extraidos = Array.from(itemMap.values());
    this.save();

    return {
      updatedList: this.data.produtos_extraidos,
      novosInseridos,
      duplicadosEvitados,
      atualizados,
    };
  }

  public deleteProduto(id: string): boolean {
    if (!this.data.produtos_extraidos) return false;
    const initialLen = this.data.produtos_extraidos.length;
    this.data.produtos_extraidos = this.data.produtos_extraidos.filter((p) => p.id !== id);
    if (this.data.produtos_extraidos.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  public clearProdutos(): void {
    this.data.produtos_extraidos = [];
    this.save();
  }

  // --- CONTROLE DE ENCARTES PROCESSADOS (PROTEÇÃO DE COTA IA) ---
  public isEncarteAlreadyProcessed(
    mercadoNome: string,
    validade: string,
    chavesImagens: string[]
  ): EncarteProcessadoModel | null {
    if (!this.data.encartes_processados || chavesImagens.length === 0) {
      return null;
    }

    const normMercado = normalizeKeyText(mercadoNome);
    const normValidade = normalizeKeyText(validade);

    const match = this.data.encartes_processados.find((enc) => {
      if (normalizeKeyText(enc.mercado_nome) !== normMercado) return false;
      // Se tiver a mesma vigência identificada
      if (normValidade && normValidade !== 'ofertas_validas_no_encarte' && normalizeKeyText(enc.validade) === normValidade) {
        return true;
      }
      // Ou se todas as imagens encontradas na página atual já foram processadas
      const todasContidas = chavesImagens.length > 0 && chavesImagens.every((img) => enc.chaves_imagens.includes(img));
      return todasContidas;
    });

    return match || null;
  }

  public recordEncarteProcessado(encarte: {
    mercado_nome: string;
    url_origem: string;
    validade: string;
    chaves_imagens: string[];
    total_produtos: number;
  }): void {
    if (!this.data.encartes_processados) {
      this.data.encartes_processados = [];
    }

    const novo: EncarteProcessadoModel = {
      id: crypto.randomUUID(),
      mercado_nome: encarte.mercado_nome,
      url_origem: encarte.url_origem,
      validade: encarte.validade || 'Ofertas válidas no encarte',
      chaves_imagens: encarte.chaves_imagens,
      total_produtos: encarte.total_produtos,
      processado_em: new Date().toLocaleString('pt-BR'),
    };

    // Remove registro antigo do mesmo mercado e mesma vigência se houver
    this.data.encartes_processados = [
      novo,
      ...this.data.encartes_processados.filter(
        (e) =>
          normalizeKeyText(e.mercado_nome) !== normalizeKeyText(encarte.mercado_nome) ||
          normalizeKeyText(e.validade) !== normalizeKeyText(encarte.validade)
      ),
    ].slice(0, 50);

    this.save();
  }
}

export const dbService = new Database();
