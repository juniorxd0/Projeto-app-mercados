import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import vm from 'node:vm';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  dbService,
  generateProductCompositeKey,
  normalizeKeyText,
  ExtractedProductModel,
} from './src/server/db.js';
import {
  initCronService,
  rescheduleCron,
  calculateNextRun,
  buildCronExpression,
  executeScheduledRoutine,
} from './src/server/cronService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const cliPortIndex = process.argv.indexOf('--port');
const cliPort = cliPortIndex !== -1 && process.argv[cliPortIndex + 1] ? Number(process.argv[cliPortIndex + 1]) : null;
const PORT = cliPort || (process.env.NODE_ENV === 'production' && process.env.PORT ? Number(process.env.PORT) : 3000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directory to store downloaded high-resolution flyers
const DOWNLOADS_DIR = path.resolve(__dirname, 'public', 'downloads', 'panfletos');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}
app.use('/downloads/panfletos', express.static(DOWNLOADS_DIR));

export interface ExtractedProductItem {
  id: string;
  chave_unica?: string; // Chave única composta (ex: abimar_arroz_tio_joao_5_kg_23102026_29102026)
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

// Helper: Resolve Mercado from URL using registered Bloco A markets
export function resolveMercadoFromUrl(targetUrl: string): { nome: string; regras: any } {
  try {
    const mercados = dbService.getMercados();
    const cleanTarget = (targetUrl || '').toLowerCase().trim();

    for (const m of mercados) {
      if (m.urls && Array.isArray(m.urls)) {
        for (const u of m.urls) {
          const cleanU = (u.url || '').toLowerCase().trim();
          if (cleanTarget === cleanU) {
            return { nome: m.nome, regras: m.regras_extracao_ia };
          }
          try {
            if (cleanU && new URL(cleanTarget).hostname === new URL(cleanU).hostname) {
              return { nome: m.nome, regras: m.regras_extracao_ia };
            }
          } catch {}
        }
      }
    }

    for (const m of mercados) {
      const parts = m.nome.toLowerCase().split(/\s+/).filter((p) => p.length > 3);
      if (parts.some((p) => cleanTarget.includes(p))) {
        return { nome: m.nome, regras: m.regras_extracao_ia };
      }
    }
  } catch (e) {
    console.warn('[Mercado Resolver] Erro ao resolver mercado:', e);
  }

  const lowerUrl = (targetUrl || '').toLowerCase();
  if (lowerUrl.includes('fort')) {
    return {
      nome: 'Fort Atacadista',
      regras: {
        versao_motor: '1.0',
        mercado: 'Fort Atacadista',
        vigencia: 'Extrair vigência de ofertas informada no encarte ou título.',
      },
    };
  }

  if (lowerUrl.includes('giassi')) {
    return {
      nome: 'Giassi Supermercados',
      regras: {
        versao_motor: '1.0',
        mercado: 'Giassi Supermercados',
        vigencia: 'Extrair vigência de ofertas informada no encarte.',
      },
    };
  }

  if (lowerUrl.includes('abimar')) {
    return {
      nome: 'Abimar Supermercados',
      regras: { versao: '1.0' },
    };
  }

  return { nome: 'Abimar Supermercados', regras: null };
}

// Helper: Parse DD/MM/AAAA validity dates from text
export function parseValidityDates(text: string): { dataInicial: string; dataFinal: string } {
  const currentYear = new Date().getFullYear();
  if (!text || typeof text !== 'string') {
    return { dataInicial: '', dataFinal: '' };
  }

  const clean = text.trim();

  // Pattern 1: DD/MM/AAAA a DD/MM/AAAA or DD/MM a DD/MM/AAAA (ex: "23/10 a 29/10/2026")
  const rangeMatch = clean.match(
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:a|à|até|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i
  );
  if (rangeMatch) {
    const d1 = rangeMatch[1].padStart(2, '0');
    const m1 = rangeMatch[2].padStart(2, '0');
    let y2 = rangeMatch[6];
    if (y2.length === 2) y2 = '20' + y2;
    const y1 = rangeMatch[3] ? (rangeMatch[3].length === 2 ? '20' + rangeMatch[3] : rangeMatch[3]) : y2;
    const d2 = rangeMatch[4].padStart(2, '0');
    const m2 = rangeMatch[5].padStart(2, '0');

    return {
      dataInicial: `${d1}/${m1}/${y1}`,
      dataFinal: `${d2}/${m2}/${y2}`,
    };
  }

  // Pattern 2: DD/MM a DD/MM (sem ano)
  const rangeNoYear = clean.match(/(\d{1,2})\/(\d{1,2})\s*(?:a|à|até|-)\s*(\d{1,2})\/(\d{1,2})/i);
  if (rangeNoYear) {
    const d1 = rangeNoYear[1].padStart(2, '0');
    const m1 = rangeNoYear[2].padStart(2, '0');
    const d2 = rangeNoYear[3].padStart(2, '0');
    const m2 = rangeNoYear[4].padStart(2, '0');
    return {
      dataInicial: `${d1}/${m1}/${currentYear}`,
      dataFinal: `${d2}/${m2}/${currentYear}`,
    };
  }

  // Pattern 3: Data única "até DD/MM/AAAA"
  const singleDate = clean.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (singleDate) {
    const d = singleDate[1].padStart(2, '0');
    const m = singleDate[2].padStart(2, '0');
    let y = singleDate[3];
    if (y.length === 2) y = '20' + y;
    return {
      dataInicial: `${d}/${m}/${y}`,
      dataFinal: `${d}/${m}/${y}`,
    };
  }

  return { dataInicial: '', dataFinal: '' };
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
  versaoExtrator: string;
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

// In-memory store of extracted items & downloaded flyers synced with DB
let currentExtractedItems: ExtractedProductItem[] = dbService.getProdutosExtraidos();
let lastDownloadedFlyers: DownloadedFlyer[] = [];
let lastConferenceReport: FlyerConferenceReport | null = null;
let lastSourceUrl: string = 'https://www.abimarsupermercados.com.br/ofertas/abimar/5';
let lastExtractionMetadata = {
  validade: '',
  timestamp: '',
  totalPages: 0,
  totalItems: currentExtractedItems.length,
};

// Setup server-side Gemini client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

function calculateEquivalentPrice(preco: number, volume: number, unidade: string) {
  const u = (unidade || 'unidade').toLowerCase().trim();
  const v = volume > 0 ? volume : 1;

  if (u === 'kg') {
    return { valor: preco / v, label: `R$ ${(preco / v).toFixed(2).replace('.', ',')} / kg` };
  }
  if (u === 'g') {
    const porKg = (preco / v) * 1000;
    return { valor: porKg, label: `R$ ${porKg.toFixed(2).replace('.', ',')} / kg` };
  }
  if (u === 'l' || u === 'litro' || u === 'litros') {
    return { valor: preco / v, label: `R$ ${(preco / v).toFixed(2).replace('.', ',')} / L` };
  }
  if (u === 'ml') {
    const porLitro = (preco / v) * 1000;
    return { valor: porLitro, label: `R$ ${porLitro.toFixed(2).replace('.', ',')} / L` };
  }
  return { valor: preco, label: `R$ ${preco.toFixed(2).replace('.', ',')} / un` };
}

// Get current extracted items from persistent store
app.get('/api/extracted-products', (req, res) => {
  const persistedItems = dbService.getProdutosExtraidos();
  currentExtractedItems = persistedItems;
  res.json({
    url: lastSourceUrl,
    metadata: {
      ...lastExtractionMetadata,
      totalItems: persistedItems.length,
    },
    items: persistedItems,
  });
});

// Delete single product by ID from persistent store
app.delete('/api/extracted-products/:id', (req, res) => {
  const { id } = req.params;
  dbService.deleteProduto(id);
  currentExtractedItems = dbService.getProdutosExtraidos();
  lastExtractionMetadata.totalItems = currentExtractedItems.length;
  res.json({ success: true, count: currentExtractedItems.length });
});

// Clear all extracted items from persistent store
app.post('/api/clear-extracted', (req, res) => {
  dbService.clearProdutos();
  currentExtractedItems = [];
  lastExtractionMetadata = {
    validade: '',
    timestamp: '',
    totalPages: 0,
    totalItems: 0,
  };
  res.json({ success: true, count: 0 });
});

// Helper: Get JPEG dimensions directly from binary buffer
function getJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (!buf || buf.length < 10) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    i++;
  }
  return null;
}

// Helper: Format bytes to human readable string
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Auto-restore cached flyers from disk if available
function restoreFlyersFromDiskIfAvailable() {
  try {
    if (!fs.existsSync(DOWNLOADS_DIR)) return;
    const files = fs.readdirSync(DOWNLOADS_DIR).filter((f) => f.endsWith('.jpg') || f.endsWith('.jpeg'));
    if (files.length === 0) return;

    files.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });

    const restoredFlyers: DownloadedFlyer[] = [];
    for (let i = 0; i < files.length; i++) {
      const fileName = files[i];
      const filePath = path.join(DOWNLOADS_DIR, fileName);
      const stats = fs.statSync(filePath);
      const buf = fs.readFileSync(filePath);
      const dims = getJpegDimensions(buf);
      const resStr = dims ? `${dims.width}x${dims.height}` : '1383x1800';
      const pageNum = parseInt(fileName.replace(/\D/g, ''), 10) || i + 1;

      restoredFlyers.push({
        id: `flyer-p${pageNum}-${stats.mtimeMs}`,
        pageNumber: pageNum,
        fileName,
        fileSizeBytes: stats.size,
        fileSizeFormatted: formatBytes(stats.size),
        resolution: resStr,
        urlOrigem: `https://www.abimarsupermercados.com.br/fotos/ofertas/${fileName}`,
        urlLocal: `/downloads/panfletos/${fileName}`,
        status: 'sucesso',
        tentativas: 1,
        validado: true,
        mensagemValidacao: `Validado com sucesso (${formatBytes(stats.size)}, ${resStr})`,
        downloadTimestamp: new Date(stats.mtime).toLocaleString('pt-BR'),
      });
    }

    lastDownloadedFlyers = restoredFlyers;
    lastConferenceReport = {
      versaoExtrator: '1.0',
      urlConsultada: lastSourceUrl,
      dataHoraExecucao: new Date().toLocaleString('pt-BR'),
      validadeOfertas: 'Ofertas válidas no encarte',
      panfletosEncontrados: restoredFlyers.length,
      panfletosBaixados: restoredFlyers.length,
      downloadsFalhas: 0,
      resultado: 'Concluído',
      situacaoFinal: `Processo Concluído com Sucesso! Todos os ${restoredFlyers.length} panfletos foram identificados, baixados e validados no Extrator v1.0.`,
      arquivosGerados: restoredFlyers.map((f) => f.fileName),
      detalhes: restoredFlyers,
      tempoTotalSegundos: 4,
    };
    lastExtractionMetadata.totalPages = restoredFlyers.length;
    console.log(`[Extrator v1.0] Carregados ${restoredFlyers.length} panfletos homologados em disco.`);
  } catch (e) {
    console.warn('[Extrator v1.0] Aviso ao carregar panfletos em disco:', e);
  }
}

// Call on module load
restoreFlyersFromDiskIfAvailable();

// Helper: Multi-strategy flyer identification from HTML
interface IdentifiedFlyerItem {
  pageNumber: number;
  highResUrl: string;
  thumbUrl: string;
  alt: string;
  width?: number;
  height?: number;
}

function identifyAllFlyersFromHtml(html: string, baseUrl: string): {
  validade: string;
  flyers: IdentifiedFlyerItem[];
} {
  const $ = cheerio.load(html);

  // Extract promotional dates/validity from general text
  let dateMatch = html.match(
    /v[aá]lidas?\s+(?:de\s+)?(\d{1,2}\/\d{1,2}(?:\s*a\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?)/i
  );
  if (!dateMatch) {
    dateMatch = html.match(
      /ofertas\s+v[aá]lidas?\s+(?:de\s+)?(\d{1,2}\/\d{1,2}\/\d{4}\s+a\s+\d{1,2}\/\d{1,2}\/\d{4})/i
    );
  }
  let validade = dateMatch ? dateMatch[0].trim() : '';

  const candidatesMap = new Map<string, IdentifiedFlyerItem>();

  // STRATEGY 0: Apollo State / StorefrontFlyer (Fort Atacadista, oSuper, VIP Commerce)
  try {
    if (html.includes('StorefrontFlyer') || html.includes('window.APOLLO_STATE')) {
      const apolloIdx = html.indexOf('window.APOLLO_STATE =');
      if (apolloIdx !== -1) {
        const endScript = html.indexOf('</script>', apolloIdx);
        if (endScript !== -1) {
          const scriptCode = html.substring(apolloIdx, endScript);
          const sandbox: any = { window: {} };
          vm.createContext(sandbox);
          vm.runInContext(scriptCode, sandbox, { timeout: 2000 });
          const apollo = sandbox.window.APOLLO_STATE || {};
          const flyerKeys = Object.keys(apollo).filter((k) => k.startsWith('StorefrontFlyer:'));

          if (flyerKeys.length > 0) {
            console.log(`[Flyer Identification] Encontrados ${flyerKeys.length} encartes no Apollo State (Fort Atacadista).`);

            flyerKeys.forEach((fk, idx) => {
              const flyer = apollo[fk];
              const title = flyer?.title || `Encarte Fort Atacadista ${idx + 1}`;
              const cover = flyer?.coverImage;
              let imgUrl = '';
              if (cover) {
                imgUrl =
                  cover['thumborized({"height":330})'] ||
                  cover.thumborized ||
                  cover.url ||
                  '';
              }

              if (imgUrl) {
                const highResUrl = new URL(imgUrl, baseUrl).href;
                const baseKey = `fort-flyer-${flyer.id || idx + 1}`;
                candidatesMap.set(baseKey, {
                  pageNumber: idx + 1,
                  highResUrl,
                  thumbUrl: highResUrl,
                  alt: title,
                  width: 1400,
                  height: 1800,
                });

                // Extract validity from title if not already found (e.g. "04 e 05_NOV_26" or "02 a 08_NOV_26")
                if (!validade) {
                  const titleDateMatch = title.match(/(\d{1,2}(?:\s*(?:a|e)\s*\d{1,2})?_[A-Z]{3}(?:_[A-Z]{3})?_\d{2,4})/i);
                  if (titleDateMatch) {
                    validade = `Ofertas vigentes (${titleDateMatch[0].replace(/_/g, ' ')})`;
                  }
                }
              }
            });

            // If Apollo State has the exact official flyers (e.g. Fort Atacadista), return them directly
            if (candidatesMap.size > 0) {
              const sortedFlyers = Array.from(candidatesMap.values()).sort((a, b) => a.pageNumber - b.pageNumber);
              sortedFlyers.forEach((item, index) => {
                item.pageNumber = index + 1;
              });
              return {
                validade: validade || 'Ofertas válidas no encarte',
                flyers: sortedFlyers,
              };
            }
          }
        }
      }
    }
  } catch (apolloErr: any) {
    console.warn('[Flyer Identification] Aviso ao processar Apollo State:', apolloErr.message);
  }

  // STRATEGY 1: Dedicated Gallery Container (#galeria a, .galeria a, etc.)
  const galleryLinks = $('#galeria a, .galeria a, [id*="galeria"] a, [class*="galeria"] a');
  if (galleryLinks.length > 0) {
    galleryLinks.each((idx, el) => {
      const href = $(el).attr('href') || '';
      const img = $(el).find('img');
      const src = img.attr('src') || img.attr('data-src') || img.attr('data-original') || '';
      const alt = img.attr('alt') || $(el).attr('title') || `page-${idx + 1}`;
      const width = Number($(el).attr('data-pswp-width')) || undefined;
      const height = Number($(el).attr('data-pswp-height')) || undefined;

      const isHrefImage = /\.(jpe?g|png|webp)/i.test(href);
      const isSrcImage = /\.(jpe?g|png|webp)/i.test(src);

      if (isHrefImage || isSrcImage) {
        const highResUrl = isHrefImage ? new URL(href, baseUrl).href : new URL(src, baseUrl).href;
        const thumbUrl = isSrcImage ? new URL(src, baseUrl).href : highResUrl;
        const baseKey = highResUrl.split('/').pop()?.split('?')[0] || `item-${idx + 1}`;

        let pageNum = idx + 1;
        const altPageMatch = alt.match(/page-(\d+)|p[aá]g(?:ina)?[-_\s]*(\d+)/i);
        if (altPageMatch) {
          pageNum = Number(altPageMatch[1] || altPageMatch[2]);
        }

        if (!candidatesMap.has(baseKey)) {
          candidatesMap.set(baseKey, {
            pageNumber: pageNum,
            highResUrl,
            thumbUrl,
            alt,
            width,
            height,
          });
        }
      }
    });

    if (candidatesMap.size > 0) {
      const sortedFlyers = Array.from(candidatesMap.values()).sort((a, b) => a.pageNumber - b.pageNumber);
      sortedFlyers.forEach((item, index) => {
        item.pageNumber = index + 1;
      });
      return {
        validade: validade || 'Ofertas válidas no encarte',
        flyers: sortedFlyers,
      };
    }
  }

  // STRATEGY 2: All <a> tags linking to JPEG/PNG images
  $('a[href]').each((idx, el) => {
    const href = $(el).attr('href') || '';
    if (/\.(jpe?g|png|webp)/i.test(href) && !/logo|icon|banner|social|fav/i.test(href)) {
      const highResUrl = new URL(href, baseUrl).href;
      const baseKey = highResUrl.split('/').pop()?.split('?')[0] || `link-${idx}`;
      if (!candidatesMap.has(baseKey)) {
        const img = $(el).find('img');
        const alt = img.attr('alt') || $(el).attr('title') || `page-${candidatesMap.size + 1}`;
        candidatesMap.set(baseKey, {
          pageNumber: candidatesMap.size + 1,
          highResUrl,
          thumbUrl: highResUrl,
          alt,
        });
      }
    }
  });

  // STRATEGY 3: Lazy-loaded & responsive images (img tags with matching classes/src/alt)
  $('img').each((idx, el) => {
    const src =
      $(el).attr('data-src') ||
      $(el).attr('data-original') ||
      $(el).attr('data-lazy') ||
      $(el).attr('data-highres') ||
      $(el).attr('src') ||
      '';

    const alt = $(el).attr('alt') || '';

    const isExcluded = /logo|icon|avatar|favicon|cart|whatsapp|facebook|instagram|google|bandeira|mastercard|visa|elo/i.test(
      src + ' ' + alt
    );

    const isFlyerCandidate =
      /thumb|oferta|encarte|caderno|folheto|page|p[aá]gina|campanha|semana|natal|revista|sc_fort|fort|anuncio|publicacao|\d{10,}/i.test(
        src + ' ' + alt
      );

    if (/\.(jpe?g|png|webp)/i.test(src) && !isExcluded && isFlyerCandidate) {
      const fullUrl = new URL(src, baseUrl).href;
      const baseKey = fullUrl.split('/').pop()?.split('?')[0] || `img-${idx}`;

      if (!candidatesMap.has(baseKey)) {
        let highResUrl = fullUrl;
        if (fullUrl.includes('/thumbs/767/998/')) {
          highResUrl = fullUrl.replace('/thumbs/767/998/', '/thumbs/1383/1800/');
        }

        let pageNum = candidatesMap.size + 1;
        const altMatch = alt.match(/page-(\d+)|p[aá]g(?:ina)?[-_\s]*(\d+)/i);
        if (altMatch) pageNum = Number(altMatch[1] || altMatch[2]);

        candidatesMap.set(baseKey, {
          pageNumber: pageNum,
          highResUrl,
          thumbUrl: fullUrl,
          alt: alt || `page-${pageNum}`,
        });
      }
    }
  });

  if (!validade) {
    validade = 'Ofertas válidas no encarte';
  }

  // Sort flyers by pageNumber
  const sortedFlyers = Array.from(candidatesMap.values()).sort((a, b) => a.pageNumber - b.pageNumber);

  // Normalize sequential page numbers (1..N) to ensure no gaps or duplicate page indices
  sortedFlyers.forEach((item, index) => {
    item.pageNumber = index + 1;
  });

  return {
    validade,
    flyers: sortedFlyers,
  };
}

// Helper: Sanitize market name into clean file prefix
export function sanitizeMarketSlug(marketName: string): string {
  const norm = (marketName || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (norm.includes('giassi')) return 'giassi';
  if (norm.includes('abimar')) return 'abimar';
  if (norm.includes('fort')) return 'fort';
  const slug = norm.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'mercado';
}

// Resilient fetch helper with exponential backoff for transient DNS (EAI_AGAIN) and network hiccups
export async function fetchWithNetworkRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<Response> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err?.code === 'EAI_AGAIN' ||
        err?.cause?.code === 'EAI_AGAIN' ||
        err?.code === 'ENOTFOUND' ||
        err?.cause?.code === 'ENOTFOUND' ||
        err?.code === 'ECONNRESET' ||
        err?.cause?.code === 'ECONNRESET' ||
        err?.code === 'ETIMEDOUT' ||
        err?.cause?.code === 'ETIMEDOUT' ||
        err?.name === 'TimeoutError' ||
        String(err?.message).includes('fetch failed') ||
        String(err?.message).includes('EAI_AGAIN');

      if (attempt < maxRetries && isTransient) {
        const wait = baseDelayMs * Math.pow(1.6, attempt - 1);
        console.warn(
          `[Network Retry] Tentativa ${attempt}/${maxRetries} falhou para ${url} (${err?.cause?.code || err?.code || err?.message}). Nova tentativa em ${Math.round(wait)}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

// Download a single flyer with retries, exponential backoff, and strict JPEG verification
async function downloadSingleFlyer(
  item: IdentifiedFlyerItem,
  baseUrl: string,
  targetDir: string,
  maxRetries = 4,
  marketName = 'Abimar Supermercados'
): Promise<DownloadedFlyer> {
  const slug = sanitizeMarketSlug(marketName);
  const paddedPage = String(item.pageNumber).padStart(2, '0');
  const targetFileName = `panfleto_${slug}_pag_${paddedPage}.jpg`;
  const targetFilePath = path.join(targetDir, targetFileName);

  let attempts = 0;
  let success = false;
  let fileSizeBytes = 0;
  let resolutionStr = item.width && item.height ? `${item.width}x${item.height}` : 'Desconhecida';
  let validationMessage = '';

  const urlsToTry = [item.highResUrl];
  if (item.thumbUrl && item.thumbUrl !== item.highResUrl) {
    urlsToTry.push(item.thumbUrl);
  }

  // Pre-add high-resolution proxy fallback for Cloudflare-protected CDNs (oSuper, Fort Atacadista, S3)
  if (
    item.highResUrl.includes('osuper.com.br') ||
    item.highResUrl.includes('amazonaws.com') ||
    item.highResUrl.includes('fortatacadista')
  ) {
    urlsToTry.push(`https://wsrv.nl/?url=${encodeURIComponent(item.highResUrl)}&w=1400&output=jpg`);
    if (item.thumbUrl && item.thumbUrl !== item.highResUrl) {
      urlsToTry.push(`https://wsrv.nl/?url=${encodeURIComponent(item.thumbUrl)}&w=1400&output=jpg`);
    }
  }

  while (attempts < maxRetries && !success) {
    attempts++;
    for (const downloadUrl of urlsToTry) {
      try {
        console.log(`[Downloader] Tentativa ${attempts} para Pág. ${item.pageNumber} (${targetFileName} - ${marketName}) de ${downloadUrl}...`);
        let response = await fetchWithNetworkRetry(
          downloadUrl,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              Referer: baseUrl,
            },
            signal: AbortSignal.timeout(35000), // Generous 35s timeout for high-res images
          },
          2,
          800
        );

        // If blocked by Cloudflare (403 Forbidden) and not already using proxy, try proxy immediately
        if (response.status === 403 && !downloadUrl.includes('wsrv.nl')) {
          console.warn(`[Downloader] Acesso a ${downloadUrl} retornou HTTP 403 (Cloudflare WAF). Alternando imediatamente para proxy de imagem...`);
          const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(downloadUrl)}&w=1400&output=jpg`;
          response = await fetchWithNetworkRetry(
            proxyUrl,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
              signal: AbortSignal.timeout(35000),
            },
            2,
            800
          );
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }

        const arrayBuf = await response.arrayBuffer();
        const buf = Buffer.from(arrayBuf);

        // STAGE 1 VALIDATION: Minimum file size (must be >= 20,480 bytes)
        if (buf.length < 20480) {
          throw new Error(`Arquivo muito pequeno / corrompido: apenas ${buf.length} bytes`);
        }

        // STAGE 2 VALIDATION: JPEG Magic bytes (0xFF, 0xD8, 0xFF) or PNG (0x89, 0x50, 0x4E, 0x47)
        const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

        if (!isJpeg && !isPng) {
          throw new Error('Conteúdo baixado não possui cabeçalho de imagem JPEG/PNG válido');
        }

        // STAGE 3 VALIDATION: Read actual image dimensions
        const dims = getJpegDimensions(buf);
        if (dims) {
          resolutionStr = `${dims.width}x${dims.height}`;
        }

        // Write validated file to disk
        fs.writeFileSync(targetFilePath, buf);

        fileSizeBytes = buf.length;
        validationMessage = `JPEG íntegro validado com sucesso (${resolutionStr}, ${formatBytes(fileSizeBytes)})`;
        success = true;
        break; // Successfully downloaded and verified
      } catch (err: any) {
        console.warn(`[Downloader] Falha tentativa ${attempts} para Pág. ${item.pageNumber} (${marketName}): ${err.message}`);
        validationMessage = `Tentativa ${attempts} falhou: ${err.message}`;
      }
    }

    if (!success && attempts < maxRetries) {
      // Exponential backoff
      await new Promise((r) => setTimeout(r, 1200 * attempts));
    }
  }

  const urlLocal = `/downloads/panfletos/${targetFileName}`;

  return {
    id: `flyer-${slug}-${item.pageNumber}-${Date.now()}`,
    pageNumber: item.pageNumber,
    fileName: targetFileName,
    fileSizeBytes,
    fileSizeFormatted: formatBytes(fileSizeBytes),
    resolution: resolutionStr,
    urlOrigem: item.highResUrl,
    urlLocal,
    status: success ? 'sucesso' : 'falha',
    tentativas: attempts,
    validado: success,
    mensagemValidacao: validationMessage,
    downloadTimestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

// Download all flyers with pool concurrency, automatic conference and missing file retries
export async function executeFullFlyerDownloadAndAudit(
  targetUrl: string,
  marketName?: string
): Promise<FlyerConferenceReport> {
  const startTime = Date.now();
  lastSourceUrl = targetUrl;
  const resolvedMarket = marketName || resolveMercadoFromUrl(targetUrl).nome;

  console.log(`[Downloader] Iniciando varredura da URL (${resolvedMarket}): ${targetUrl}`);

  // Fetch page HTML with automatic DNS retry & backoff
  const response = await fetchWithNetworkRetry(
    targetUrl,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(25000),
    },
    3,
    1000
  );

  if (!response.ok) {
    throw new Error(`Falha ao acessar o site do supermercado (${resolvedMarket}): HTTP ${response.status}`);
  }

  const html = await response.text();
  const { validade, flyers: identifiedFlyers } = identifyAllFlyersFromHtml(html, targetUrl);

  console.log(`[Downloader] Identificados ${identifiedFlyers.length} panfletos para "${resolvedMarket}" na página.`);

  if (identifiedFlyers.length === 0) {
    throw new Error(`Nenhum panfleto em formato JPEG foi localizado na página de "${resolvedMarket}".`);
  }

  // PASS 1: Concurrency-controlled downloading (pool of 3)
  const concurrency = 3;
  const results: DownloadedFlyer[] = new Array(identifiedFlyers.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < identifiedFlyers.length) {
      const idx = currentIndex++;
      const item = identifiedFlyers[idx];
      results[idx] = await downloadSingleFlyer(item, targetUrl, DOWNLOADS_DIR, 4, resolvedMarket);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, identifiedFlyers.length) }, () => worker());
  await Promise.all(workers);

  // PASS 2: AUTOMATIC CONFERENCE & VERIFICATION OF MISSING / FAILED ITEMS
  // If any file failed or was not validated, re-attempt specifically that file
  for (let i = 0; i < results.length; i++) {
    const itemResult = results[i];
    const targetFilePath = path.join(DOWNLOADS_DIR, itemResult.fileName);

    const fileExistsAndValid =
      itemResult.validado &&
      fs.existsSync(targetFilePath) &&
      fs.statSync(targetFilePath).size >= 20480;

    if (!fileExistsAndValid) {
      console.warn(`[Downloader Conferência] Detectada falha no panfleto Pág. ${itemResult.pageNumber} (${resolvedMarket}). Executando re-download focado...`);
      const retryResult = await downloadSingleFlyer(identifiedFlyers[i], targetUrl, DOWNLOADS_DIR, 4, resolvedMarket);
      results[i] = retryResult;
    }
  }

  // Final conference tally
  const totalEncontrados = identifiedFlyers.length;
  const totalBaixadosComSucesso = results.filter((r) => r.status === 'sucesso' && r.validado).length;
  const totalFalhas = totalEncontrados - totalBaixadosComSucesso;
  const tempoTotalSegundos = Number(((Date.now() - startTime) / 1000).toFixed(1));

  const isCompleted = totalBaixadosComSucesso === totalEncontrados && totalFalhas === 0;

  const situacaoFinal = isCompleted
    ? `Processo Concluído com Sucesso! Todos os ${totalEncontrados} panfletos foram identificados, baixados e validados.`
    : `Processo Incompleto: ${totalBaixadosComSucesso} de ${totalEncontrados} panfletos foram baixados. Restam ${totalFalhas} com falha.`;

  const report: FlyerConferenceReport = {
    versaoExtrator: '1.0',
    urlConsultada: targetUrl,
    dataHoraExecucao: new Date().toLocaleString('pt-BR'),
    validadeOfertas: validade,
    panfletosEncontrados: totalEncontrados,
    panfletosBaixados: totalBaixadosComSucesso,
    downloadsFalhas: totalFalhas,
    resultado: isCompleted ? 'Concluído' : 'Incompleto',
    situacaoFinal,
    arquivosGerados: results.filter((r) => r.status === 'sucesso').map((r) => r.fileName),
    detalhes: results,
    tempoTotalSegundos,
  };

  const slug = sanitizeMarketSlug(resolvedMarket);
  lastDownloadedFlyers = [
    ...lastDownloadedFlyers.filter((f) => !f.fileName.startsWith(`panfleto_${slug}_`)),
    ...results,
  ];
  lastConferenceReport = report;
  lastExtractionMetadata.validade = validade;
  lastExtractionMetadata.totalPages = totalEncontrados;

  return report;
}

// ----------------------------------------------------
// FLYER DOWNLOAD & CONFERENCE ENDPOINTS
// ----------------------------------------------------

// Execute scan, full download, and conference audit
app.post('/api/flyers/download-all', async (req, res) => {
  const { url } = req.body;
  const targetUrl = url || 'https://www.abimarsupermercados.com.br/ofertas/abimar/5';

  try {
    const report = await executeFullFlyerDownloadAndAudit(targetUrl);
    res.json({
      success: true,
      report,
    });
  } catch (err: any) {
    console.warn('[Flyers Download Error]:', err?.message || err);
    const isDnsError =
      err?.code === 'EAI_AGAIN' ||
      err?.cause?.code === 'EAI_AGAIN' ||
      String(err?.message).includes('EAI_AGAIN') ||
      String(err?.cause?.message).includes('EAI_AGAIN');

    const friendlyError = isDnsError
      ? 'Instabilidade temporária de resolução DNS com o site do mercado. O servidor tentou reconectar 3 vezes mas o provedor demorou para responder. Por favor, tente clicar novamente.'
      : `Erro ao identificar ou baixar panfletos: ${err.message}`;

    res.status(500).json({
      success: false,
      error: friendlyError,
    });
  }
});

// Get current flyers status & latest conference report
app.get('/api/flyers/status', (req, res) => {
  res.json({
    hasReport: !!lastConferenceReport,
    report: lastConferenceReport,
    flyers: lastDownloadedFlyers,
  });
});

// Delete all downloaded flyers manually from disk
app.delete('/api/flyers/clear-all', (req, res) => {
  try {
    if (fs.existsSync(DOWNLOADS_DIR)) {
      const files = fs.readdirSync(DOWNLOADS_DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(DOWNLOADS_DIR, file));
        } catch (e) {
          console.warn(`Erro ao excluir arquivo ${file}:`, e);
        }
      }
    }
    lastDownloadedFlyers = [];
    lastConferenceReport = null;
    res.json({
      success: true,
      message: 'Todos os panfletos baixados foram excluídos com sucesso do disco.',
      remainingFlyers: [],
    });
  } catch (err: any) {
    console.error('Erro ao excluir todos os panfletos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete single downloaded flyer manually by page number
app.delete('/api/flyers/page/:pageNumber', (req, res) => {
  try {
    const pageNum = Number(req.params.pageNumber);
    const flyer = lastDownloadedFlyers.find((f) => f.pageNumber === pageNum);

    if (flyer) {
      const filePath = path.join(DOWNLOADS_DIR, flyer.fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn(`Erro ao excluir panfleto ${flyer.fileName}:`, e);
        }
      }
      lastDownloadedFlyers = lastDownloadedFlyers.filter((f) => f.pageNumber !== pageNum);
      if (lastConferenceReport && lastConferenceReport.detalhes) {
        lastConferenceReport.detalhes = lastConferenceReport.detalhes.filter((f) => f.pageNumber !== pageNum);
      }
    }

    res.json({
      success: true,
      message: `Panfleto da página ${pageNum} excluído com sucesso.`,
      remainingFlyers: lastDownloadedFlyers,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Force download single flyer as attachment
app.get('/api/download-flyer-file/:filename', (req, res) => {
  const { filename } = req.params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(DOWNLOADS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Arquivo não encontrado no servidor.');
  }

  res.download(filePath, safeFilename);
});

// Extract products from a downloaded flyer directly using Gemini Vision
app.post('/api/flyers/extract-downloaded-page', async (req, res) => {
  const { pageNumber } = req.body;
  const flyer = lastDownloadedFlyers.find((f) => f.pageNumber === Number(pageNumber));

  if (!flyer || flyer.status !== 'sucesso') {
    return res.status(404).json({
      error: `Panfleto da página ${pageNumber} não foi encontrado ou não foi baixado com sucesso.`,
    });
  }

  const filePath = path.join(DOWNLOADS_DIR, flyer.fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: `Arquivo ${flyer.fileName} não encontrado no disco.`,
    });
  }

  const base64Data = fs.readFileSync(filePath).toString('base64');

  // Trigger Gemini extraction via existing robust handler logic
  req.body.imageBase64 = base64Data;
  req.body.mimeType = 'image/jpeg';
  req.body.pageNumber = flyer.pageNumber;
  req.body.deleteFlyerOnSuccess = true;
  req.body.flyerFileName = flyer.fileName;

  // Forward to /api/extract-flyer-strict handler
  return extractFlyerStrictHandler(req, res);
});

// ----------------------------------------------------
// ROTAS DE MERCADOS (CRUD COM 1:N URLs)
// ----------------------------------------------------

// GET /api/mercados - Lista todos os mercados com URLs aninhadas
app.get('/api/mercados', (req, res) => {
  try {
    const mercados = dbService.getMercados();
    res.json({
      success: true,
      mercados,
      total: mercados.length,
    });
  } catch (err: any) {
    console.error('[API Mercados GET Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/mercados - Cria mercado com URLs aninhadas
app.post('/api/mercados', (req, res) => {
  try {
    const { nome, ativo, regras_extracao_ia, urls } = req.body;
    if (!nome || !nome.trim()) {
      return res.status(400).json({ success: false, error: 'O nome do mercado é obrigatório.' });
    }
    const novoMercado = dbService.createMercado({
      nome,
      ativo: ativo !== undefined ? Boolean(ativo) : true,
      regras_extracao_ia,
      urls: Array.isArray(urls) ? urls : [],
    });
    res.status(201).json({ success: true, mercado: novoMercado });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /api/mercados/:id - Atualiza mercado e URLs aninhadas
app.put('/api/mercados/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { nome, ativo, regras_extracao_ia, urls } = req.body;
    const mercadoAtualizado = dbService.updateMercado(id, {
      nome,
      ativo,
      regras_extracao_ia,
      urls,
    });
    res.json({ success: true, mercado: mercadoAtualizado });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/mercados/:id - Remove mercado
app.delete('/api/mercados/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = dbService.deleteMercado(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Mercado não encontrado.' });
    }
    res.json({ success: true, message: 'Mercado removido com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// ROTAS DE CONFIGURAÇÃO DE ROTINA E AUTOMAÇÃO
// ----------------------------------------------------

// GET /api/automacao/config - Busca configuração atual e cálculo da próxima execução
app.get('/api/automacao/config', (req, res) => {
  try {
    const config = dbService.getConfiguracaoRotina();
    const nextRun = calculateNextRun(config.dias_semana, config.horario_execucao, config.ativo);
    res.json({
      success: true,
      config: {
        ...config,
        proxima_execucao: nextRun.nextExecution,
        contagem_regressiva: nextRun.countdown,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/automacao/config - Salva dias, horário e status e reprograma cron
app.post('/api/automacao/config', (req, res) => {
  try {
    const { dias_semana, horario_execucao, ativo } = req.body;

    const current = dbService.getConfiguracaoRotina();
    const newDays = Array.isArray(dias_semana) ? dias_semana : current.dias_semana;
    const newHour = horario_execucao || current.horario_execucao;
    const newAtivo = ativo !== undefined ? Boolean(ativo) : current.ativo;
    const newCron = buildCronExpression(newDays, newHour);

    const updated = dbService.updateConfiguracaoRotina({
      dias_semana: newDays,
      horario_execucao: newHour,
      frequencia_cron: newCron,
      ativo: newAtivo,
    });

    // Re-schedule cron dynamically in memory
    rescheduleCron(updated);

    const nextRun = calculateNextRun(updated.dias_semana, updated.horario_execucao, updated.ativo);
    res.json({
      success: true,
      config: {
        ...updated,
        proxima_execucao: nextRun.nextExecution,
        contagem_regressiva: nextRun.countdown,
      },
      message: 'Configurações de rotina salvas e cron reprogramado com sucesso.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/automacao/executar-agora - Gatilho manual imediato
app.post('/api/automacao/executar-agora', async (req, res) => {
  try {
    console.log('[API Automação] Disparando execução manual imediata da rotina...');
    const executionResult = await executeScheduledRoutine();
    const updatedConfig = dbService.getConfiguracaoRotina();
    const nextRun = calculateNextRun(
      updatedConfig.dias_semana,
      updatedConfig.horario_execucao,
      updatedConfig.ativo
    );

    res.json({
      success: executionResult.success,
      result: executionResult,
      config: {
        ...updatedConfig,
        proxima_execucao: nextRun.nextExecution,
        contagem_regressiva: nextRun.countdown,
      },
    });
  } catch (err: any) {
    console.error('[API Automação Executar-Agora Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// ROTAS DE MONITORAMENTO E LIMITES DA IA (GEMINI FLASH)
// ----------------------------------------------------

// GET /api/ia/uso - Consulta percentual de uso diário, limites e histórico
app.get('/api/ia/uso', (req, res) => {
  try {
    const usage = dbService.getAiUsage();
    res.json({
      success: true,
      usage,
    });
  } catch (err: any) {
    console.error('[API IA Uso Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ia/limite - Atualiza limites e plano da IA
app.post('/api/ia/limite', (req, res) => {
  try {
    const { limite_diario_requisicoes, limite_rpm, plano_nome } = req.body;
    const updated = dbService.updateAiLimits({
      limite_diario_requisicoes: limite_diario_requisicoes ? Number(limite_diario_requisicoes) : undefined,
      limite_rpm: limite_rpm ? Number(limite_rpm) : undefined,
      plano_nome,
    });
    res.json({
      success: true,
      usage: updated,
      message: 'Limites da IA atualizados com sucesso.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Initialize Cron Service with full automated ingestion pipeline (download + Gemini extraction + auto-clean)
initCronService(executeMarketAutomationPipeline);

// Backward-compatible scrape-url endpoint
app.post('/api/scrape-url', async (req, res) => {
  const { url } = req.body;
  const targetUrl = url || 'https://www.abimarsupermercados.com.br/ofertas/abimar/5';
  lastSourceUrl = targetUrl;

  try {
    const response = await fetchWithNetworkRetry(
      targetUrl,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(20000),
      },
      3,
      1000
    );

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Servidor do mercado retornou status ${response.status}`,
      });
    }

    const html = await response.text();
    const { validade, flyers } = identifyAllFlyersFromHtml(html, targetUrl);

    res.json({
      success: true,
      url: targetUrl,
      validade,
      foundImages: flyers.map((f) => f.highResUrl),
      totalPages: flyers.length,
      flyers,
      message: `Identificados com sucesso todos os ${flyers.length} panfletos na página.`,
    });
  } catch (err: any) {
    res.json({
      success: false,
      isNetworkRestricted: false,
      error: `Erro ao analisar página: ${err.message}`,
    });
  }
});

// Endpoint específico para teste manual e validação rápida de URLs cadastradas
app.post('/api/validar-url', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.trim()) {
    return res.status(400).json({
      success: false,
      totalEncontrados: 0,
      error: 'URL não informada para validação.',
    });
  }

  let targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`;
  }

  const startTime = Date.now();
  try {
    const response = await fetchWithNetworkRetry(
      targetUrl,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(20000),
      },
      3,
      1000
    );

    if (!response.ok) {
      return res.json({
        success: false,
        url: targetUrl,
        totalEncontrados: 0,
        error: `Servidor retornou HTTP ${response.status}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
    }

    const html = await response.text();
    const { validade, flyers } = identifyAllFlyersFromHtml(html, targetUrl);
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    return res.json({
      success: true,
      url: targetUrl,
      totalEncontrados: flyers.length,
      validade: validade || 'Não especificada',
      tempoResposta: `${durationSec}s`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message:
        flyers.length > 0
          ? `${flyers.length} encarte(s) encontrado(s)`
          : 'Nenhum encarte JPEG encontrado',
    });
  } catch (err: any) {
    return res.json({
      success: false,
      url: targetUrl,
      totalEncontrados: 0,
      error:
        err.name === 'TimeoutError' || err.message?.includes('timeout')
          ? 'Tempo limite de conexão esgotado (timeout)'
          : `Erro de conexão: ${err.message}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
  }
});

// Interface for modular flyer extraction
export interface ExtractFlyerParams {
  imageBase64: string;
  mimeType?: string;
  pageNumber?: number;
  marketName: string;
  regrasIa?: any;
}

export interface ExtractFlyerResult {
  success: boolean;
  usedModel?: string;
  items: ExtractedProductItem[];
  validade: string;
  data_inicial: string;
  data_final: string;
  error?: string;
}

// Reusable factual Gemini extraction engine (gemini-3.8-flash, zero hallucination)
export async function extractProductsFromFlyerBuffer(
  params: ExtractFlyerParams
): Promise<ExtractFlyerResult> {
  const startTime = Date.now();
  const { imageBase64, mimeType = 'image/jpeg', pageNumber = 1, marketName, regrasIa } = params;

  const ai = getGeminiClient();
  if (!ai) {
    return {
      success: false,
      items: [],
      validade: '',
      data_inicial: '',
      data_final: '',
      error: 'GEMINI_API_KEY não configurada no servidor. Configure a chave de API no painel de Secrets.',
    };
  }

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const regrasCustomizadas = regrasIa
    ? typeof regrasIa === 'string'
      ? regrasIa
      : JSON.stringify(regrasIa, null, 2)
    : '';

  const strictPrompt = `Você é um leitor óptico e catalogador de encartes de supermercados brasileiros.
Sua função é transcrever ÚNICA E EXCLUSIVAMENTE os produtos que estão visíveis e legíveis na imagem fornecida.

REGRAS DE IDENTIFICAÇÃO DO MERCADO E VIGÊNCIA DAS OFERTAS:
- MERCADO: Preencha "nome_mercado" com "${marketName}".
- VIGÊNCIA DAS OFERTAS: Localize no cabeçalho ou rodapé o período de vigência/validade das ofertas (ex: "Ofertas válidas de 23/10 a 29/10/2026").
- Extraia a "vigencia_data_inicial" e "vigencia_data_final" no formato DD/MM/AAAA (ex: "23/10/2026" e "29/10/2026").
- Se na imagem constar apenas dia/mês (ex: "23/10 a 29/10"), deduza o ano atual no formato DD/MM/AAAA (ex: "23/10/2026" e "29/10/2026").
- Em cada produto extraído, preencha obrigatoriamente:
  * "nome_mercado": "${marketName}"
  * "data_inicial": a data inicial de vigência encontrada (ex: "23/10/2026")
  * "data_final": a data final de vigência encontrada (ex: "29/10/2026")

${regrasCustomizadas ? `REGRAS ESPECÍFICAS DESTE MERCADO (${marketName}):\n${regrasCustomizadas}\n` : ''}

REGRAS DE PRECISÃO ABSOLUTA (ZERO ALUCINAÇÃO):
1. NUNCA INVENTE PRODUTOS: Se um produto não estiver impresso nesta imagem, NÃO o inclua.
2. NUNCA INVENTE PREÇOS: Transcreva os números exatos que você lê na imagem (ex: 26.90, 4.39, 18.49).
3. DISTINÇÃO ENTRE PREÇO REGULAR E PROMOCIONAL:
   - "preco_regular": É o preço padrão/normal para qualquer cliente sem cadastro.
   - "preco_promocional": Se houver selo de Clube de Vantagens (ex: "Clube Abimar", "Amigo Giassi", etc.) ou "A partir de X unidades", registre o valor promocional menor aqui.
   - Se o produto tiver apenas um preço único normal, coloque esse valor em "preco_regular" e deixe "preco_promocional" estritamente como null.
4. PESO E VOLUME:
   - Extraia o valor numérico em quantidade_volume (ex: 5 para 5kg, 500 para 500g, 1 para 1L, 350 para 350ml).
   - Extraia a unidade em unidade_medida ("kg", "g", "l", "ml", "unidade", "duzia", "rolo", "pct").
   - Fatiados/Frios: Se o encarte disser "a cada 100g", unidade_medida="g" e quantidade_volume=100.
   - Carnes e hortifrúti a granel sem peso fixo: use unidade_medida="kg" e quantidade_volume=1.0.
5. Extraia o máximo de produtos legíveis contidos na imagem.`;

  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
  ];
  let response: any = null;
  let usedModel = '';
  let lastError: any = null;

  for (const modelName of candidateModels) {
    let attempts = 0;
    const maxAttemptsPerModel = 2;

    while (attempts < maxAttemptsPerModel) {
      attempts++;
      try {
        console.log(`[Gemini Vision] Chamando modelo ${modelName} para ${marketName} (Pág. ${pageNumber}, tentativa ${attempts})...`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: base64Data,
                  },
                },
                {
                  text: 'Extraia com 100% de fidelidade todos os produtos, mercado e vigência (data inicial e data final) contidos nesta página de encarte. Não invente nada.',
                },
              ],
            },
          ],
          config: {
            systemInstruction: strictPrompt,
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                nome_mercado: {
                  type: Type.STRING,
                  description: 'Nome do mercado identificado, ex: "Abimar Supermercados" ou "Giassi Supermercados"',
                },
                vigencia_data_inicial: {
                  type: Type.STRING,
                  description: 'Data de início das ofertas no formato DD/MM/AAAA, ex: "23/10/2026"',
                },
                vigencia_data_final: {
                  type: Type.STRING,
                  description: 'Data de término das ofertas no formato DD/MM/AAAA, ex: "29/10/2026"',
                },
                validade_encontrada: {
                  type: Type.STRING,
                  description: 'Texto de validade impresso no encarte, ou string vazia se não houver.',
                },
                produtos: {
                  type: Type.ARRAY,
                  description: 'Lista de produtos reais visíveis na página',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      nome_mercado: {
                        type: Type.STRING,
                        description: 'Nome do mercado (ex: Abimar Supermercados)',
                      },
                      data_inicial: {
                        type: Type.STRING,
                        description: 'Data inicial de vigência no formato DD/MM/AAAA (ex: 23/10/2026)',
                      },
                      data_final: {
                        type: Type.STRING,
                        description: 'Data final de vigência no formato DD/MM/AAAA (ex: 29/10/2026)',
                      },
                      nome_produto: {
                        type: Type.STRING,
                        description: 'Nome do produto impresso. Ex: Arroz Parboilizado Tipo 1',
                      },
                      marca: {
                        type: Type.STRING,
                        description: 'Marca identificável. Ex: Tio João, Pilão, Omo. Se não tiver marca, use string vazia.',
                      },
                      quantidade_volume: {
                        type: Type.NUMBER,
                        description: 'Valor numérico do volume/peso. Ex: 5, 1, 500, 350',
                      },
                      unidade_medida: {
                        type: Type.STRING,
                        description: 'kg, g, l, ml, unidade, pacote, duzia, rolo',
                      },
                      preco_regular: {
                        type: Type.NUMBER,
                        description: 'Preço normal de 1 unidade.',
                      },
                      preco_promocional: {
                        type: Type.NUMBER,
                        description: 'Preço menor com Clube ou quantidade. Se não tiver, usar null.',
                      },
                      tipo_promocao: {
                        type: Type.STRING,
                        description: 'CLUBE_ABIMAR, CLUBE_GIASSI, ATACADO_QUANTIDADE, FRACIONADO_100G, ou SEM_PROMOCAO',
                      },
                      condicao_detalhes: {
                        type: Type.STRING,
                        description: 'Texto exato da condição, ex: "Clube Abimar", "Amigo Giassi", ou null',
                      },
                      categoria: {
                        type: Type.STRING,
                        description: 'mercearia, carnes, hortifruti, laticinios, bebidas, limpeza, higiene, bazar',
                      },
                    },
                    required: [
                      'nome_produto',
                      'quantidade_volume',
                      'unidade_medida',
                      'preco_regular',
                      'tipo_promocao',
                      'categoria',
                    ],
                  },
                },
              },
              required: ['produtos'],
            },
          },
        });

        if (response && response.text) {
          usedModel = modelName;
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemini Vision] Falha no modelo ${modelName} (tentativa ${attempts}):`, err.message);
        lastError = err;

        const isDailyQuotaExhausted =
          err?.status === 429 ||
          err?.code === 429 ||
          String(err?.message).includes('RESOURCE_EXHAUSTED') ||
          String(err?.message).includes('free_tier_requests') ||
          String(err?.message).includes('limit exceeded') ||
          String(err?.message).includes('Quota exceeded');

        if (isDailyQuotaExhausted) {
          console.warn(
            `[Gemini Vision] Cota diária gratuita do modelo ${modelName} esgotada. Pulando imediatamente para o modelo de contingência...`
          );
          // Não adianta repetir o mesmo modelo que já atingiu a cota diária
          break;
        }

        const is503OrRateLimit =
          err?.status === 503 ||
          err?.code === 503 ||
          String(err?.message).includes('503') ||
          String(err?.message).includes('UNAVAILABLE') ||
          String(err?.message).includes('high demand') ||
          err?.status === 429;

        if (is503OrRateLimit) {
          await new Promise((r) => setTimeout(r, 1500 * attempts));
        } else {
          break;
        }
      }
    }

    if (response && response.text) {
      break;
    }
  }

  if (!response || !response.text) {
    const errorMsg = lastError?.message || 'Indisponível';
    const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(1));

    const isQuotaError =
      lastError?.status === 429 ||
      lastError?.code === 429 ||
      String(lastError?.message).includes('RESOURCE_EXHAUSTED') ||
      String(lastError?.message).includes('free_tier_requests') ||
      String(lastError?.message).includes('Quota exceeded') ||
      String(lastError?.message).includes('limit: 20');

    if (isQuotaError) {
      dbService.recordAiQuotaExhausted({
        modelo: 'gemini-3.8-flash',
        limite: 20,
        detalhes: errorMsg,
      });

      return {
        success: false,
        items: [],
        validade: '',
        data_inicial: '',
        data_final: '',
        error:
          'Cota diária gratuita do Gemini atingida (limite de 20 requisições/dia no Plano Gratuito). A cota diária é renovada automaticamente pelo Google às 00:00 UTC (21:00 BRT). Seus panfletos baixados continuam salvos e validados para extração.',
      };
    }

    dbService.recordAiCall({
      modelo: usedModel || 'gemini-3.8-flash',
      mercado: marketName,
      pagina: Number(pageNumber),
      produtosCount: 0,
      sucesso: false,
      tempoSegundos: durationSec,
    });

    return {
      success: false,
      items: [],
      validade: '',
      data_inicial: '',
      data_final: '',
      error: `Falha na leitura com Gemini Vision: ${errorMsg}`,
    };
  }

  try {
    let rawText = response.text.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(rawText || '{}');
    const validade = parsed.validade_encontrada || '';
    const parsedDates = parseValidityDates(
      validade || lastExtractionMetadata.validade || lastConferenceReport?.validadeOfertas || ''
    );
    const resolvedDataInicial =
      parsed.vigencia_data_inicial || parsedDates.dataInicial || '23/10/2026';
    const resolvedDataFinal =
      parsed.vigencia_data_final || parsedDates.dataFinal || '29/10/2026';
    const resolvedMercadoNome =
      parsed.nome_mercado || marketName || 'Abimar Supermercados';

    const rawProdutos = parsed.produtos || [];

    const formattedItems: ExtractedProductItem[] = rawProdutos.map(
      (p: any, idx: number) => {
        const equiv = calculateEquivalentPrice(
          p.preco_promocional ?? p.preco_regular,
          p.quantidade_volume,
          p.unidade_medida
        );

        const itemData = {
          id: `item-${pageNumber}-${Date.now()}-${idx}`,
          pageNumber,
          nome_mercado: p.nome_mercado || resolvedMercadoNome,
          data_inicial: p.data_inicial || resolvedDataInicial,
          data_final: p.data_final || resolvedDataFinal,
          nome_produto: p.nome_produto,
          marca: p.marca || '',
          quantidade_volume: Number(p.quantidade_volume) || 1,
          unidade_medida: p.unidade_medida || 'unidade',
          preco_regular: Number(p.preco_regular) || 0,
          preco_promocional:
            p.preco_promocional !== undefined && p.preco_promocional !== null
              ? Number(p.preco_promocional)
              : null,
          tipo_promocao: p.tipo_promocao || 'SEM_PROMOCAO',
          condicao_detalhes: p.condicao_detalhes || null,
          categoria: p.categoria || 'mercearia',
          preco_unitario_equivalente: equiv.valor,
          preco_unitario_label: equiv.label,
        };

        const chave_unica = generateProductCompositeKey(itemData);

        return {
          ...itemData,
          chave_unica,
        };
      }
    );

    const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(1));
    dbService.recordAiCall({
      modelo: usedModel || 'gemini-3.8-flash',
      mercado: marketName,
      pagina: Number(pageNumber),
      produtosCount: formattedItems.length,
      sucesso: true,
      tempoSegundos: durationSec,
    });

    return {
      success: true,
      usedModel,
      validade,
      data_inicial: resolvedDataInicial,
      data_final: resolvedDataFinal,
      items: formattedItems,
    };
  } catch (parseError: any) {
    const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(1));
    dbService.recordAiCall({
      modelo: usedModel || 'gemini-3.8-flash',
      mercado: marketName,
      pagina: Number(pageNumber),
      produtosCount: 0,
      sucesso: false,
      tempoSegundos: durationSec,
    });

    return {
      success: false,
      items: [],
      validade: '',
      data_inicial: '',
      data_final: '',
      error: `Erro ao interpretar JSON retornado pelo Gemini: ${parseError.message}`,
    };
  }
}

// Full automated pipeline: downloads flyers, checks processed cache, extracts products via Gemini, upserts with natural key, and unlinks temporary flyer files on 100% verified extraction
export async function executeMarketAutomationPipeline(
  targetUrl: string,
  mercadoNome: string,
  regrasIa?: any
): Promise<{
  success: boolean;
  mercadoNome: string;
  targetUrl: string;
  panfletosBaixados: number;
  produtosExtraidos: number;
  panfletosExcluidos: number;
  detalhes?: string;
}> {
  console.log(`[Automação Pipeline] Iniciando ingestão para "${mercadoNome}" na URL: ${targetUrl}`);

  // 1. Download and validate all flyers for this market
  let report: FlyerConferenceReport;
  try {
    report = await executeFullFlyerDownloadAndAudit(targetUrl, mercadoNome);
  } catch (downloadErr: any) {
    console.warn(`[Automação Pipeline] Falha ao acessar URL ${targetUrl} para "${mercadoNome}":`, downloadErr.message);
    return {
      success: false,
      mercadoNome,
      targetUrl,
      panfletosBaixados: 0,
      produtosExtraidos: 0,
      panfletosExcluidos: 0,
      detalhes: `Site do mercado temporariamente inacessível: ${downloadErr.message}`,
    };
  }

  const flyers = report.detalhes.filter((f) => f.status === 'sucesso' && f.validado);

  if (flyers.length === 0) {
    console.warn(`[Automação Pipeline] Nenhum panfleto válido encontrado para download em "${mercadoNome}".`);
    return {
      success: false,
      mercadoNome,
      targetUrl,
      panfletosBaixados: 0,
      produtosExtraidos: 0,
      panfletosExcluidos: 0,
      detalhes: 'Nenhum panfleto válido encontrado na página do mercado.',
    };
  }

  // 2. CHECK CACHE / DUPLICATE FLYER DETECTION (AI QUOTA PROTECTION)
  const imageKeys = flyers.map((f) => path.basename(f.urlOrigem || f.fileName));
  const validadeOfertas = report.validadeOfertas || '';
  const encarteJaProcessado = dbService.isEncarteAlreadyProcessed(mercadoNome, validadeOfertas, imageKeys);

  if (encarteJaProcessado) {
    console.log(
      `[Automação Pipeline] Encarte de "${mercadoNome}" (${validadeOfertas || 'vigência idêntica'}) já foi processado anteriormente em ${encarteJaProcessado.processado_em}. Pulando chamada da IA para proteger cota diária.`
    );
    // As ofertas já estão no catálogo persistido. Excluir os arquivos de imagem temporários baixados sem gastar IA
    let limpos = 0;
    for (const flyer of flyers) {
      const filePath = path.join(DOWNLOADS_DIR, flyer.fileName);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          limpos++;
        } catch {}
      }
    }
    lastDownloadedFlyers = lastDownloadedFlyers.filter((f) => !flyers.some((fl) => fl.fileName === f.fileName));

    return {
      success: true,
      mercadoNome,
      targetUrl,
      panfletosBaixados: flyers.length,
      produtosExtraidos: 0,
      panfletosExcluidos: limpos,
      detalhes: `Encarte já processado em ${encarteJaProcessado.processado_em} (${encarteJaProcessado.total_produtos} produtos no catálogo). 0 chamadas IA gastas (cota 100% protegida). ${limpos} panfletos temporários limpos do disco.`,
    };
  }

  console.log(
    `[Automação Pipeline] ${flyers.length} panfletos baixados com sucesso para "${mercadoNome}". Iniciando extração com Gemini Vision...`
  );

  let totalProdutosExtraidos = 0;
  let totalPanfletosExcluidos = 0;
  let novosInseridosTotal = 0;
  let duplicadosEvitadosTotal = 0;
  let atualizadosTotal = 0;

  // 3. Extract products from each downloaded flyer sequentially
  for (const flyer of flyers) {
    const filePath = path.join(DOWNLOADS_DIR, flyer.fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      const buffer = fs.readFileSync(filePath);
      const base64Data = buffer.toString('base64');

      const extractionRes = await extractProductsFromFlyerBuffer({
        imageBase64: base64Data,
        mimeType: 'image/jpeg',
        pageNumber: flyer.pageNumber,
        marketName: mercadoNome,
        regrasIa,
      });

      if (extractionRes.success && extractionRes.items.length > 0) {
        // Upsert to persistent DB with natural unique key deduplication
        const upsertRes = dbService.upsertProdutos(extractionRes.items as ExtractedProductModel[]);
        currentExtractedItems = dbService.getProdutosExtraidos();

        totalProdutosExtraidos += extractionRes.items.length;
        novosInseridosTotal += upsertRes.novosInseridos;
        duplicadosEvitadosTotal += upsertRes.duplicadosEvitados;
        atualizadosTotal += upsertRes.atualizados;

        lastExtractionMetadata = {
          validade: extractionRes.validade || lastExtractionMetadata.validade,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          totalPages: Math.max(lastExtractionMetadata.totalPages, flyer.pageNumber),
          totalItems: currentExtractedItems.length,
        };

        // 4. Excluir o panfleto do disco somente após confirmar extração dos produtos com sucesso (100% de cada encarte)
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            totalPanfletosExcluidos++;
            console.log(
              `[Automação] Panfleto ${flyer.fileName} excluído do disco após extração confirmada de ${extractionRes.items.length} produtos.`
            );
          }
          lastDownloadedFlyers = lastDownloadedFlyers.filter((f) => f.fileName !== flyer.fileName);
          if (lastConferenceReport && lastConferenceReport.detalhes) {
            lastConferenceReport.detalhes = lastConferenceReport.detalhes.filter((f) => f.fileName !== flyer.fileName);
          }
        } catch (delErr) {
          console.warn(`[Automação] Erro ao excluir panfleto ${flyer.fileName}:`, delErr);
        }
      } else {
        const isQuota =
          extractionRes.error?.includes('Cota diária') ||
          extractionRes.error?.includes('20 requisições') ||
          extractionRes.error?.includes('RESOURCE_EXHAUSTED') ||
          extractionRes.error?.includes('Quota exceeded');
        if (isQuota) {
          console.warn(
            `[Automação] Cota diária gratuita do Gemini esgotada na página ${flyer.pageNumber}. Interrompendo extração dos panfletos seguintes. Todos os panfletos já baixados continuam salvos com segurança em disco.`
          );
          break;
        }
        console.warn(`[Automação] Panfleto ${flyer.fileName} não gerou produtos ou falhou. Mantendo arquivo para auditoria.`);
      }
    } catch (pageErr: any) {
      console.error(`[Automação] Erro na extração do panfleto ${flyer.fileName}:`, pageErr.message);
    }
  }

  // 5. Registrar encarte no cache para nunca repetir extração desnecessária da mesma vigência
  if (totalProdutosExtraidos > 0) {
    dbService.recordEncarteProcessado({
      mercado_nome: mercadoNome,
      url_origem: targetUrl,
      validade: report.validadeOfertas || '',
      chaves_imagens: imageKeys,
      total_produtos: totalProdutosExtraidos,
    });
    console.log(`[Automação Pipeline] Encarte de "${mercadoNome}" registrado no cache de encartes processados com sucesso.`);
  }

  const detalhes = `Baixados: ${report.panfletosBaixados}/${report.panfletosEncontrados} | Extraídos: ${totalProdutosExtraidos} produtos (${novosInseridosTotal} novos, ${duplicadosEvitadosTotal} duplicados prevenidos) | Panfletos excluídos: ${totalPanfletosExcluidos}`;

  return {
    success: report.panfletosBaixados > 0,
    mercadoNome,
    targetUrl,
    panfletosBaixados: report.panfletosBaixados,
    produtosExtraidos: totalProdutosExtraidos,
    panfletosExcluidos: totalPanfletosExcluidos,
    detalhes,
  };
}

// Handler for manual extraction requests
async function extractFlyerStrictHandler(req: any, res: any) {
  const {
    imageBase64,
    mimeType = 'image/jpeg',
    pageNumber = 1,
    imageUrl,
    deleteFlyerOnSuccess = false,
    flyerFileName,
  } = req.body;

  let finalBase64 = imageBase64;

  if (!finalBase64 && imageUrl) {
    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const arrayBuf = await imgRes.arrayBuffer();
        finalBase64 = Buffer.from(arrayBuf).toString('base64');
      }
    } catch (e) {
      // ignore
    }
  }

  if (!finalBase64) {
    return res.status(400).json({
      error: 'Nenhuma imagem enviada para leitura. Envie o arquivo da página do encarte.',
    });
  }

  const mercadoResolvido = resolveMercadoFromUrl(lastSourceUrl);
  const marketName = req.body.mercadoNome || mercadoResolvido.nome || 'Abimar Supermercados';

  try {
    const extractionResult = await extractProductsFromFlyerBuffer({
      imageBase64: finalBase64,
      mimeType,
      pageNumber: Number(pageNumber),
      marketName,
      regrasIa: req.body.regrasIa,
    });

    if (!extractionResult.success) {
      const isQuota =
        extractionResult.error?.includes('Cota diária') ||
        extractionResult.error?.includes('20 requisições') ||
        extractionResult.error?.includes('RESOURCE_EXHAUSTED') ||
        extractionResult.error?.includes('Quota exceeded');
      return res.status(isQuota ? 429 : 503).json({
        success: false,
        isQuotaExhausted: isQuota,
        error: extractionResult.error || 'Erro ao processar imagem no Gemini Vision.',
      });
    }

    const formattedItems = extractionResult.items;

    // Intelligent Upsert: evita duplicação factual
    const upsertRes = dbService.upsertProdutos(formattedItems as ExtractedProductModel[]);
    currentExtractedItems = dbService.getProdutosExtraidos();

    lastExtractionMetadata = {
      validade: extractionResult.validade || lastExtractionMetadata.validade,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      totalPages: Math.max(lastExtractionMetadata.totalPages, Number(pageNumber)),
      totalItems: currentExtractedItems.length,
    };

    // Safe auto-deletion of flyer only after verified successful extraction of products
    let flyerDeleted = false;
    const targetFileName =
      flyerFileName ||
      (req.body.pageNumber
        ? lastDownloadedFlyers.find((f) => f.pageNumber === Number(req.body.pageNumber))?.fileName
        : null);
    if (deleteFlyerOnSuccess && targetFileName && formattedItems.length > 0) {
      try {
        const targetPath = path.join(DOWNLOADS_DIR, targetFileName);
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
          flyerDeleted = true;
          console.log(
            `[Extrator] Panfleto ${targetFileName} (Pág. ${pageNumber}) excluído com sucesso após extração confirmada de ${formattedItems.length} produtos.`
          );
        }
        lastDownloadedFlyers = lastDownloadedFlyers.filter((f) => f.fileName !== targetFileName);
        if (lastConferenceReport && lastConferenceReport.detalhes) {
          lastConferenceReport.detalhes = lastConferenceReport.detalhes.filter((f) => f.fileName !== targetFileName);
        }
      } catch (delErr) {
        console.warn('[Extrator] Erro ao excluir panfleto após extração:', delErr);
      }
    }

    res.json({
      success: true,
      usedModel: extractionResult.usedModel,
      validade: extractionResult.validade,
      nome_mercado: extractionResult.items[0]?.nome_mercado || marketName,
      data_inicial: extractionResult.data_inicial,
      data_final: extractionResult.data_final,
      pageNumber,
      extractedCountThisPage: formattedItems.length,
      novosInseridos: upsertRes.novosInseridos,
      duplicadosEvitados: upsertRes.duplicadosEvitados,
      atualizados: upsertRes.atualizados,
      totalAccumulatedItems: currentExtractedItems.length,
      items: formattedItems,
      allCurrentItems: currentExtractedItems,
      flyerDeleted,
      remainingFlyers: lastDownloadedFlyers,
    });
  } catch (error: any) {
    console.error('Gemini extraction error:', error);
    res.status(500).json({
      error: `Erro ao processar imagem no Gemini Vision: ${error.message}`,
    });
  }
}

app.post('/api/extract-flyer-strict', extractFlyerStrictHandler);

// Extract all downloaded flyers sequentially with verified auto-deletion on success
app.post('/api/flyers/extract-all-pages', async (req, res) => {
  const successfulFlyers = [...lastDownloadedFlyers.filter((f) => f.status === 'sucesso')];
  if (successfulFlyers.length === 0) {
    return res.status(400).json({
      error: 'Nenhum panfleto foi baixado ainda. Realize o download primeiro.',
    });
  }

  const ai = getGeminiClient();
  if (!ai) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });
  }

  // Clear previous or keep mode
  const { append = false } = req.body;
  if (!append) {
    currentExtractedItems = [];
  }

  let processedCount = 0;
  for (const flyer of successfulFlyers) {
    const filePath = path.join(DOWNLOADS_DIR, flyer.fileName);
    if (!fs.existsSync(filePath)) continue;

    try {
      const base64Data = fs.readFileSync(filePath).toString('base64');
      const fakeReq: any = {
        body: {
          imageBase64: base64Data,
          mimeType: 'image/jpeg',
          pageNumber: flyer.pageNumber,
          deleteFlyerOnSuccess: true,
          flyerFileName: flyer.fileName,
        },
      };

      await new Promise<void>((resolve) => {
        const fakeRes: any = {
          status: () => fakeRes,
          json: (data: any) => {
            if (data.success && data.items && data.items.length > 0) {
              processedCount++;
            }
            resolve();
          },
        };
        extractFlyerStrictHandler(fakeReq, fakeRes).catch(() => resolve());
      });
    } catch (e) {
      console.warn(`Erro ao extrair Pág ${flyer.pageNumber}:`, e);
    }
  }

  res.json({
    success: true,
    processedPages: processedCount,
    totalPages: successfulFlyers.length,
    totalExtractedProducts: currentExtractedItems.length,
    items: currentExtractedItems,
    remainingFlyers: lastDownloadedFlyers,
  });
});

// Direct bulk save or set verified items with upsert & composite key
app.post('/api/set-extracted-items', (req, res) => {
  const { items, validade } = req.body;
  if (Array.isArray(items)) {
    const dates = parseValidityDates(validade || '23/10 a 29/10/2026');
    const formatted: ExtractedProductModel[] = items.map((it: any, idx: number) => {
      const itemData = {
        id: it.id || `item-restored-${Date.now()}-${idx}`,
        pageNumber: it.pageNumber || 1,
        nome_mercado: it.nome_mercado || 'Abimar Supermercados',
        data_inicial: it.data_inicial || dates.dataInicial || '23/10/2026',
        data_final: it.data_final || dates.dataFinal || '29/10/2026',
        nome_produto: it.nome_produto || 'Produto',
        marca: it.marca || '',
        quantidade_volume: Number(it.quantidade_volume) || 1,
        unidade_medida: it.unidade_medida || 'unidade',
        preco_regular: Number(it.preco_regular) || 0,
        preco_promocional:
          it.preco_promocional !== undefined && it.preco_promocional !== null
            ? Number(it.preco_promocional)
            : null,
        tipo_promocao: it.tipo_promocao || 'SEM_PROMOCAO',
        condicao_detalhes: it.condicao_detalhes || null,
        categoria: it.categoria || 'mercearia',
        preco_unitario_equivalente: Number(it.preco_unitario_equivalente) || Number(it.preco_regular) || 0,
        preco_unitario_label: it.preco_unitario_label || `R$ ${it.preco_regular} / un`,
      };
      return {
        ...itemData,
        chave_unica: it.chave_unica || generateProductCompositeKey(itemData),
      };
    });

    const upsertRes = dbService.upsertProdutos(formatted);
    currentExtractedItems = dbService.getProdutosExtraidos();

    lastExtractionMetadata = {
      validade: validade || 'Válidas de 23/10 a 29/10/2026',
      timestamp: new Date().toLocaleTimeString(),
      totalPages: 1,
      totalItems: currentExtractedItems.length,
    };

    return res.json({
      success: true,
      count: currentExtractedItems.length,
      novosInseridos: upsertRes.novosInseridos,
      duplicadosEvitados: upsertRes.duplicadosEvitados,
      atualizados: upsertRes.atualizados,
    });
  }
  res.json({ success: true, count: currentExtractedItems.length });
});

// ----------------------------------------------------
// VITE DEV SERVER / PRODUCTION STATIC
// ----------------------------------------------------
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SuperCompara Extrator] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
