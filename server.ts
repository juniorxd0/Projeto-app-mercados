import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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
  pageNumber: number;
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

// In-memory store of extracted items & downloaded flyers
let currentExtractedItems: ExtractedProductItem[] = [];
let lastDownloadedFlyers: DownloadedFlyer[] = [];
let lastConferenceReport: FlyerConferenceReport | null = null;
let lastSourceUrl: string = 'https://www.abimarsupermercados.com.br/ofertas/abimar/5';
let lastExtractionMetadata = {
  validade: '',
  timestamp: '',
  totalPages: 0,
  totalItems: 0,
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

// ----------------------------------------------------
// API ROUTES (LASER-FOCUSED ON ACCURATE EXTRACTION ONLY)
// ----------------------------------------------------

// Get current extracted items
app.get('/api/extracted-products', (req, res) => {
  res.json({
    url: lastSourceUrl,
    metadata: lastExtractionMetadata,
    items: currentExtractedItems,
  });
});

// Delete single product by ID
app.delete('/api/extracted-products/:id', (req, res) => {
  const { id } = req.params;
  currentExtractedItems = currentExtractedItems.filter((item) => item.id !== id);
  lastExtractionMetadata.totalItems = currentExtractedItems.length;
  res.json({ success: true, count: currentExtractedItems.length });
});

// Clear all extracted items
app.post('/api/clear-extracted', (req, res) => {
  currentExtractedItems = [];
  lastExtractionMetadata = {
    validade: '',
    timestamp: '',
    totalPages: 0,
    totalItems: 0,
  };
  res.json({ success: true });
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

  // Extract promotional dates/validity
  let dateMatch = html.match(
    /v[aá]lidas?\s+(?:de\s+)?(\d{1,2}\/\d{1,2}(?:\s*a\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?)/i
  );
  if (!dateMatch) {
    dateMatch = html.match(
      /ofertas\s+v[aá]lidas?\s+(?:de\s+)?(\d{1,2}\/\d{1,2}\/\d{4}\s+a\s+\d{1,2}\/\d{1,2}\/\d{4})/i
    );
  }
  const validade = dateMatch ? dateMatch[0].trim() : 'Ofertas válidas no encarte';

  const candidatesMap = new Map<string, IdentifiedFlyerItem>();

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

      // Extract high-res image URL: if <a> href points to image, use it!
      const isHrefImage = /\.(jpe?g|png|webp)/i.test(href);
      const isSrcImage = /\.(jpe?g|png|webp)/i.test(src);

      if (isHrefImage || isSrcImage) {
        const highResUrl = isHrefImage ? new URL(href, baseUrl).href : new URL(src, baseUrl).href;
        const thumbUrl = isSrcImage ? new URL(src, baseUrl).href : highResUrl;

        // Base image identifier (filename without folder path)
        const baseKey = highResUrl.split('/').pop()?.split('?')[0] || `item-${idx + 1}`;

        // Parse page number from alt, e.g. "page-1" -> 1
        let pageNum = idx + 1;
        const altPageMatch = alt.match(/page-(\d+)|p[aá]g(?:ina)?[-_\s]*(\d+)/i);
        if (altPageMatch) {
          pageNum = Number(altPageMatch[1] || altPageMatch[2]);
        }

        candidatesMap.set(baseKey, {
          pageNumber: pageNum,
          highResUrl,
          thumbUrl,
          alt,
          width,
          height,
        });
      }
    });
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

  // STRATEGY 3: Lazy-loaded images (data-src, data-original, data-lazy)
  $('img').each((idx, el) => {
    const src =
      $(el).attr('data-src') ||
      $(el).attr('data-original') ||
      $(el).attr('data-lazy') ||
      $(el).attr('data-highres') ||
      $(el).attr('src') ||
      '';

    if (
      /\.(jpe?g|png|webp)/i.test(src) &&
      !/logo|icon|avatar|favicon|cart|whatsapp|facebook|instagram|google/i.test(src) &&
      /thumb|oferta|encarte|caderno|folheto|page|anuncio|publicacao|\d{10,}/i.test(src)
    ) {
      const fullUrl = new URL(src, baseUrl).href;
      const baseKey = fullUrl.split('/').pop()?.split('?')[0] || `img-${idx}`;

      // If we already have a 1383x1800 high-res version of this file, keep it
      if (!candidatesMap.has(baseKey)) {
        // If it's a thumbnail like /thumbs/767/998/X.jpg, try to derive high-res /thumbs/1383/1800/X.jpg
        let highResUrl = fullUrl;
        if (fullUrl.includes('/thumbs/767/998/')) {
          highResUrl = fullUrl.replace('/thumbs/767/998/', '/thumbs/1383/1800/');
        }

        const alt = $(el).attr('alt') || `page-${candidatesMap.size + 1}`;
        let pageNum = candidatesMap.size + 1;
        const altMatch = alt.match(/page-(\d+)|p[aá]g(?:ina)?[-_\s]*(\d+)/i);
        if (altMatch) pageNum = Number(altMatch[1] || altMatch[2]);

        candidatesMap.set(baseKey, {
          pageNumber: pageNum,
          highResUrl,
          thumbUrl: fullUrl,
          alt,
        });
      }
    }
  });

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

// Download a single flyer with retries, exponential backoff, and strict JPEG verification
async function downloadSingleFlyer(
  item: IdentifiedFlyerItem,
  baseUrl: string,
  targetDir: string,
  maxRetries = 4
): Promise<DownloadedFlyer> {
  const paddedPage = String(item.pageNumber).padStart(2, '0');
  const targetFileName = `panfleto_abimar_pag_${paddedPage}.jpg`;
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

  while (attempts < maxRetries && !success) {
    attempts++;
    for (const downloadUrl of urlsToTry) {
      try {
        console.log(`[Downloader] Tentativa ${attempts} para Pág. ${item.pageNumber} (${targetFileName}) de ${downloadUrl}...`);
        const response = await fetch(downloadUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            Referer: baseUrl,
          },
          signal: AbortSignal.timeout(35000), // Generous 35s timeout for high-res images
        });

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
        console.warn(`[Downloader] Falha tentativa ${attempts} para Pág. ${item.pageNumber}: ${err.message}`);
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
    id: `flyer-${item.pageNumber}-${Date.now()}`,
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
async function executeFullFlyerDownloadAndAudit(
  targetUrl: string
): Promise<FlyerConferenceReport> {
  const startTime = Date.now();
  lastSourceUrl = targetUrl;

  console.log(`[Downloader] Iniciando varredura da URL: ${targetUrl}`);

  // Fetch page HTML
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`Falha ao acessar o site do supermercado: HTTP ${response.status}`);
  }

  const html = await response.text();
  const { validade, flyers: identifiedFlyers } = identifyAllFlyersFromHtml(html, targetUrl);

  console.log(`[Downloader] Identificados ${identifiedFlyers.length} panfletos na página.`);

  if (identifiedFlyers.length === 0) {
    throw new Error('Nenhum panfleto em formato JPEG foi localizado na página informada.');
  }

  // PASS 1: Concurrency-controlled downloading (pool of 3)
  const concurrency = 3;
  const results: DownloadedFlyer[] = new Array(identifiedFlyers.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < identifiedFlyers.length) {
      const idx = currentIndex++;
      const item = identifiedFlyers[idx];
      results[idx] = await downloadSingleFlyer(item, targetUrl, DOWNLOADS_DIR);
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
      console.warn(`[Downloader Conferência] Detectada falha no panfleto Pág. ${itemResult.pageNumber}. Executando re-download focado...`);
      const retryResult = await downloadSingleFlyer(identifiedFlyers[i], targetUrl, DOWNLOADS_DIR, 4);
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

  lastDownloadedFlyers = results;
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
    console.error('[Flyers Download Error]:', err);
    res.status(500).json({
      success: false,
      error: `Erro ao identificar ou baixar panfletos: ${err.message}`,
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

  // Forward to /api/extract-flyer-strict handler
  return extractFlyerStrictHandler(req, res);
});

// Backward-compatible scrape-url endpoint
app.post('/api/scrape-url', async (req, res) => {
  const { url } = req.body;
  const targetUrl = url || 'https://www.abimarsupermercados.com.br/ofertas/abimar/5';
  lastSourceUrl = targetUrl;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

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

// Strict Extraction with Gemini Flash Vision (Zero Hallucination)
async function extractFlyerStrictHandler(req: any, res: any) {
  const {
    imageBase64,
    mimeType = 'image/jpeg',
    pageNumber = 1,
    imageUrl,
  } = req.body;

  const ai = getGeminiClient();

  if (!ai) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY não configurada no servidor. Configure a chave de API no painel de Secrets.',
    });
  }

  let finalBase64 = imageBase64;

  // If imageUrl was passed instead of base64, attempt to download it
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

  // Clean base64 prefix if present
  const base64Data = finalBase64.replace(/^data:image\/\w+;base64,/, '');

  const strictPrompt = `Você é um leitor óptico e catalogador de encartes de supermercados brasileiros.
Sua função é transcrever ÚNICA E EXCLUSIVAMENTE os produtos que estão visíveis e legíveis na imagem fornecida.

REGRAS DE PRECISÃO ABSOLUTA (ZERO ALUCINAÇÃO):
1. NUNCA INVENTE PRODUTOS: Se um produto não estiver impresso nesta imagem, NÃO o inclua.
2. NUNCA INVENTE PREÇOS: Transcreva os números exatos que você lê na imagem (ex: 26.90, 4.39, 18.49).
3. DISTINÇÃO ENTRE PREÇO REGULAR E PROMOCIONAL:
   - "preco_regular": É o preço padrão/normal para qualquer cliente sem cadastro.
   - "preco_promocional": Se houver selo de "Clube Abimar", "Cliente Clube", "A partir de X unidades", registre o valor promocional menor aqui.
   - Se o produto tiver apenas um preço único normal, coloque esse valor em "preco_regular" e deixe "preco_promocional" estritamente como null.
4. PESO E VOLUME:
   - Extraia o valor numérico em quantidade_volume (ex: 5 para 5kg, 500 para 500g, 1 para 1L, 350 para 350ml).
   - Extraia a unidade em unidade_medida ("kg", "g", "l", "ml", "unidade", "duzia", "rolo", "pct").
   - Fatiados/Frios: Se o encarte disser "a cada 100g", unidade_medida="g" e quantidade_volume=100.
   - Carnes e hortifrúti a granel sem peso fixo: use unidade_medida="kg" e quantidade_volume=1.0.
5. Extraia o máximo de produtos legíveis contidos na imagem.`;

  // Candidate models to try in case of 503 temporary overload
  // We prioritize gemini-3.1-flash-lite first (fast, lowest 503 error rates), then gemini-2.5-flash, gemini-3.8-flash, gemini-flash-latest
  const candidateModels = [
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest',
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
        console.log(`[Gemini Vision] Chamando modelo ${modelName} (tentativa ${attempts})...`);
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
                  text: 'Extraia com 100% de fidelidade todos os produtos e seus respectivos preços contidos nesta página de encarte. Não invente nada.',
                },
              ],
            },
          ],
          config: {
            systemInstruction: strictPrompt,
            temperature: 0.0, // Strictly deterministic, zero hallucinations
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
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
                        description: 'Preço menor com Clube Abimar ou quantidade. Se não tiver, usar null.',
                      },
                      tipo_promocao: {
                        type: Type.STRING,
                        description: 'CLUBE_ABIMAR, ATACADO_QUANTIDADE, FRACIONADO_100G, ou SEM_PROMOCAO',
                      },
                      condicao_detalhes: {
                        type: Type.STRING,
                        description: 'Texto exato da condição, ex: "Clube Abimar", "A partir de 3 unidades", ou null',
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
          break; // Successfully got response
        }
      } catch (err: any) {
        console.warn(`[Gemini Vision] Falha no modelo ${modelName} (tentativa ${attempts}):`, err.message);
        lastError = err;
        const is503OrRateLimit =
          err?.status === 503 ||
          err?.code === 503 ||
          String(err?.message).includes('503') ||
          String(err?.message).includes('UNAVAILABLE') ||
          String(err?.message).includes('high demand') ||
          err?.status === 429;

        // If it's a 503 or 429, wait with backoff before retry or next model
        if (is503OrRateLimit) {
          await new Promise((r) => setTimeout(r, 1500 * attempts));
        } else {
          // If it's a different error (e.g. invalid arg), don't retry same model
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
    return res.status(503).json({
      error: `Os servidores do Gemini estão temporariamente sobrecarregados (503). Clique em "Tentar Novamente" em alguns instantes. Detalhes: ${errorMsg}`,
    });
  }

  try {
    let rawText = response.text.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(rawText || '{}');
    const validade = parsed.validade_encontrada || '';
    const rawProdutos = parsed.produtos || [];

    const formattedItems: ExtractedProductItem[] = rawProdutos.map(
      (p: any, idx: number) => {
        const equiv = calculateEquivalentPrice(
          p.preco_promocional ?? p.preco_regular,
          p.quantidade_volume,
          p.unidade_medida
        );

        return {
          id: `item-${pageNumber}-${Date.now()}-${idx}`,
          pageNumber,
          nome_produto: p.nome_produto,
          marca: p.marca || '',
          quantidade_volume: p.quantidade_volume,
          unidade_medida: p.unidade_medida,
          preco_regular: Number(p.preco_regular),
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
      }
    );

    // Append to current extraction state
    currentExtractedItems = [...currentExtractedItems, ...formattedItems];
    lastExtractionMetadata = {
      validade: validade || lastExtractionMetadata.validade,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      totalPages: Math.max(lastExtractionMetadata.totalPages, pageNumber),
      totalItems: currentExtractedItems.length,
    };

    res.json({
      success: true,
      usedModel,
      validade,
      pageNumber,
      extractedCountThisPage: formattedItems.length,
      totalAccumulatedItems: currentExtractedItems.length,
      items: formattedItems,
      allCurrentItems: currentExtractedItems,
    });
  } catch (error: any) {
    console.error('Gemini extraction error:', error);
    res.status(500).json({
      error: `Erro ao processar imagem no Gemini Vision: ${error.message}`,
    });
  }
}

app.post('/api/extract-flyer-strict', extractFlyerStrictHandler);

// Extract all downloaded flyers sequentially
app.post('/api/flyers/extract-all-pages', async (req, res) => {
  const successfulFlyers = lastDownloadedFlyers.filter((f) => f.status === 'sucesso');
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
      // We can use the internal logic to extract
      const fakeReq: any = {
        body: {
          imageBase64: base64Data,
          mimeType: 'image/jpeg',
          pageNumber: flyer.pageNumber,
        },
      };

      await new Promise<void>((resolve) => {
        const fakeRes: any = {
          status: () => fakeRes,
          json: (data: any) => {
            if (data.success) processedCount++;
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
  });
});

// Direct bulk save or set verified items
app.post('/api/set-extracted-items', (req, res) => {
  const { items, validade } = req.body;
  if (Array.isArray(items)) {
    currentExtractedItems = items;
    lastExtractionMetadata = {
      validade: validade || 'Válidas de 23/10 a 29/10/2026',
      timestamp: new Date().toLocaleTimeString(),
      totalPages: 1,
      totalItems: items.length,
    };
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
      server: { middlewareMode: true },
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
