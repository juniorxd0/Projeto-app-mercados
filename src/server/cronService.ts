import cron, { ScheduledTask } from 'node-cron';
import { dbService, ConfiguracaoRotinaModel, MercadoModel } from './db.js';

let activeCronTask: ScheduledTask | null = null;
let isCurrentlyRunning = false;

// Convert day array [0, 1, 2, 3, 4, 5, 6] & "HH:mm" to standard cron expression
export function buildCronExpression(dias_semana: number[], horario_execucao: string): string {
  const [horaStr, minStr] = (horario_execucao || '06:00').split(':');
  const minute = parseInt(minStr, 10) || 0;
  const hour = parseInt(horaStr, 10) || 0;

  if (!dias_semana || dias_semana.length === 0) {
    // Default to Monday if empty
    return `${minute} ${hour} * * 1`;
  }

  if (dias_semana.length === 7) {
    return `${minute} ${hour} * * *`;
  }

  // Sort and remove duplicates
  const sortedUnique = Array.from(new Set(dias_semana)).sort((a, b) => a - b);
  return `${minute} ${hour} * * ${sortedUnique.join(',')}`;
}

// Calculate the next execution time and humanized countdown
export function calculateNextRun(
  dias_semana: number[],
  horario_execucao: string,
  ativo: boolean
): { nextExecution: string | null; countdown: string } {
  if (!ativo || !dias_semana || dias_semana.length === 0) {
    return { nextExecution: null, countdown: 'Automação pausada/desabilitada' };
  }

  const [horaStr, minStr] = (horario_execucao || '06:00').split(':');
  const targetHour = parseInt(horaStr, 10) || 0;
  const targetMinute = parseInt(minStr, 10) || 0;

  const now = new Date();
  // Search up to 8 days forward for next match
  for (let dayOffset = 0; dayOffset <= 8; dayOffset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset);
    candidate.setHours(targetHour, targetMinute, 0, 0);

    const dayOfWeek = candidate.getDay(); // 0=Dom, 1=Seg, etc.
    if (dias_semana.includes(dayOfWeek)) {
      if (candidate.getTime() > now.getTime()) {
        const diffMs = candidate.getTime() - now.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        let countdown = '';
        if (diffHours > 24) {
          const days = Math.floor(diffHours / 24);
          const remainingHours = diffHours % 24;
          countdown = `em ${days}d ${remainingHours}h`;
        } else if (diffHours > 0) {
          countdown = `em ${diffHours}h ${diffMins}min`;
        } else {
          countdown = `em ${diffMins} min`;
        }

        const dateStr = candidate.toLocaleDateString('pt-BR', {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        return { nextExecution: dateStr, countdown };
      }
    }
  }

  return { nextExecution: null, countdown: 'Não agendado' };
}

// Global hook to invoke the flyer download/extraction engine
export type AutomationPipelineFn = (
  url: string,
  mercadoNome: string,
  regrasIa?: any
) => Promise<{
  success: boolean;
  mercadoNome: string;
  targetUrl: string;
  panfletosBaixados: number;
  produtosExtraidos: number;
  panfletosExcluidos: number;
  detalhes?: string;
}>;

let pipelineExecutor: AutomationPipelineFn | null = null;

export function setPipelineExecutor(fn: AutomationPipelineFn) {
  pipelineExecutor = fn;
}

// Worker execution core
export async function executeScheduledRoutine(): Promise<{
  success: boolean;
  log: string;
  totalMercados: number;
  totalUrls: number;
  urlsProcessadas: number;
  urlsFalhadas: number;
}> {
  if (isCurrentlyRunning) {
    console.log('[Cron Service] Rotina já está em execução no momento. Ignorando disparo duplicado.');
    return {
      success: false,
      log: 'Rotina ignorada pois outra execução já está em andamento.',
      totalMercados: 0,
      totalUrls: 0,
      urlsProcessadas: 0,
      urlsFalhadas: 0,
    };
  }

  isCurrentlyRunning = true;
  const startTime = Date.now();
  const startTimestampStr = new Date().toLocaleString('pt-BR');

  dbService.updateConfiguracaoRotina({
    status_ultima_execucao: 'PROCESSANDO',
    log_ultima_execucao: `Iniciando rotina de ingestão automática em ${startTimestampStr}...`,
  });

  const logLines: string[] = [
    `=== EXECUÇÃO DA ROTINA AUTOMÁTICA DE ENCARTES & EXTRAÇÃO IA ===`,
    `Início: ${startTimestampStr}`,
    `Motor Utilizado: Extrator v1.0 + Leitura Factual Gemini Vision`,
  ];

  let totalUrlsCount = 0;
  let sucessosCount = 0;
  let falhasCount = 0;
  let totalProdutosExtraidosGeral = 0;

  try {
    const mercados = dbService.getMercados().filter((m) => m.ativo);
    logLines.push(`Mercados ativos encontrados: ${mercados.length}`);

    if (mercados.length === 0) {
      logLines.push(`Nenhum mercado ativo cadastrado para download.`);
    }

    for (const mercado of mercados) {
      const urlsAtivas = (mercado.urls || []).filter((u) => u.ativo);
      totalUrlsCount += urlsAtivas.length;

      logLines.push(
        `\n[Mercado: ${mercado.nome}] - ${urlsAtivas.length} URL(s) ativa(s)`
      );

      if (mercado.regras_extracao_ia) {
        logLines.push(
          ` -> [Regras IA Pré-configuradas]: ${JSON.stringify(mercado.regras_extracao_ia)}`
        );
      }

      for (const itemUrl of urlsAtivas) {
        const itemStart = Date.now();
        logLines.push(` -> Processando "${itemUrl.descricao}": ${itemUrl.url}`);

        if (!pipelineExecutor) {
          logLines.push(`    [ERRO]: Pipeline de automação e extração não configurado.`);
          falhasCount++;
          continue;
        }

        try {
          // Invoke the full automation pipeline (Download + Factual Extraction + Auto-Delete)
          const result = await pipelineExecutor(
            itemUrl.url,
            mercado.nome,
            mercado.regras_extracao_ia
          );
          const itemDuration = ((Date.now() - itemStart) / 1000).toFixed(1);

          if (result && result.success) {
            sucessosCount++;
            totalProdutosExtraidosGeral += result.produtosExtraidos || 0;
            logLines.push(
              `    [OK]: ${result.panfletosBaixados} panfleto(s) baixado(s), ${result.produtosExtraidos} produto(s) extraído(s) e catalogado(s) com IA, e ${result.panfletosExcluidos} panfleto(s) temporário(s) excluído(s) do disco com segurança em ${itemDuration}s.`
            );
          } else {
            sucessosCount++;
            logLines.push(
              `    [AVISO]: Processado em ${itemDuration}s (${result?.detalhes || 'Concluído'}).`
            );
          }
        } catch (err: any) {
          falhasCount++;
          const itemDuration = ((Date.now() - itemStart) / 1000).toFixed(1);
          console.error(`[Cron Worker] Erro ao processar URL ${itemUrl.url} (${mercado.nome}):`, err);
          logLines.push(
            `    [FALHA]: Erro após ${itemDuration}s: ${err.message || String(err)}`
          );
        }
      }
    }

    const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    const finalStatus = falhasCount === 0 || sucessosCount > 0 ? 'SUCESSO' : 'FALHA';

    logLines.push(`\n=== RESUMO DA EXECUÇÃO ===`);
    logLines.push(`Status Final: ${finalStatus}`);
    logLines.push(`Tempo Total: ${totalSeconds} segundos`);
    logLines.push(`URLs Processadas com Sucesso: ${sucessosCount}`);
    logLines.push(`URLs com Falha: ${falhasCount}`);
    logLines.push(`Término: ${new Date().toLocaleString('pt-BR')}`);

    const fullLog = logLines.join('\n');

    dbService.updateConfiguracaoRotina({
      ultima_execucao: new Date().toISOString(),
      status_ultima_execucao: finalStatus,
      log_ultima_execucao: fullLog,
    });

    console.log('[Cron Service] Rotina concluída com status:', finalStatus);

    return {
      success: finalStatus === 'SUCESSO',
      log: fullLog,
      totalMercados: mercados.length,
      totalUrls: totalUrlsCount,
      urlsProcessadas: sucessosCount,
      urlsFalhadas: falhasCount,
    };
  } catch (globalErr: any) {
    console.error('[Cron Service] Erro crítico na rotina:', globalErr);
    logLines.push(`\n[ERRO CRÍTICO GLOBAL]: ${globalErr.message || String(globalErr)}`);
    const fullLog = logLines.join('\n');

    dbService.updateConfiguracaoRotina({
      ultima_execucao: new Date().toISOString(),
      status_ultima_execucao: 'FALHA',
      log_ultima_execucao: fullLog,
    });

    return {
      success: false,
      log: fullLog,
      totalMercados: 0,
      totalUrls: totalUrlsCount,
      urlsProcessadas: sucessosCount,
      urlsFalhadas: falhasCount,
    };
  } finally {
    isCurrentlyRunning = false;
  }
}

// Reschedule node-cron task whenever config is updated
export function rescheduleCron(config: ConfiguracaoRotinaModel) {
  if (activeCronTask) {
    console.log('[Cron Service] Parando tarefa cron anterior...');
    activeCronTask.stop();
    activeCronTask = null;
  }

  if (!config.ativo) {
    console.log('[Cron Service] Automação desabilitada pelo usuário. Nenhuma tarefa agendada.');
    return;
  }

  const cronExpr = buildCronExpression(config.dias_semana, config.horario_execucao);
  if (!cron.validate(cronExpr)) {
    console.error('[Cron Service] Expressão cron inválida:', cronExpr);
    return;
  }

  console.log(`[Cron Service] Agendando tarefa cron: "${cronExpr}" (Horário: ${config.horario_execucao})`);

  activeCronTask = cron.schedule(
    cronExpr,
    async () => {
      console.log(`[Cron Service] Horário atingido (${config.horario_execucao}). Disparando rotina automática...`);
      await executeScheduledRoutine();
    },
    {
      timezone: 'America/Sao_Paulo',
    }
  );
}

// Initialize on application startup
export function initCronService(pipelineFn: AutomationPipelineFn) {
  setPipelineExecutor(pipelineFn);
  const config = dbService.getConfiguracaoRotina();
  rescheduleCron(config);
  console.log('[Cron Service] Motor de agendamento inicializado com sucesso.');
}
