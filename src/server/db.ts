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
  limite_diario_requisicoes: number; // Padrão 1500 (Free tier do Gemini 3.8 Flash)
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
  historico_recente: AiRecentCall[];
}

export interface AiUsageReport extends AiUsageModel {
  percentual_usado: number;
  requisicoes_restantes: number;
  tempo_ate_reset: string;
}

interface DatabaseSchema {
  mercados: MercadoModel[];
  configuracao_rotina: ConfiguracaoRotinaModel;
  ia_uso?: AiUsageModel;
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
        limite_diario_requisicoes: 1500,
        limite_rpm: 15,
        modelo_ativo: 'gemini-3.8-flash',
        plano_nome: 'Gratuito (Google AI Studio - 1.500 RPD)',
        data_referencia: today,
        requisicoes_hoje: 0,
        requisicoes_sucesso: 0,
        requisicoes_falhas: 0,
        total_paginas_extraidas_hoje: 0,
        total_produtos_extraidos_hoje: 0,
        ultima_requisicao: null,
        historico_recente: [],
      };
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
      this.save();
    }

    const current = this.data.ia_uso;
    const limite = current.limite_diario_requisicoes || 1500;
    const percentual = Number(((current.requisicoes_hoje / limite) * 100).toFixed(1));
    const restantes = Math.max(0, limite - current.requisicoes_hoje);

    // Contagem regressiva até meia-noite (reset de cota diária)
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
}

export const dbService = new Database();
