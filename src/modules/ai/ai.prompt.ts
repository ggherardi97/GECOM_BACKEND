import { EntityDictionaryEntry } from './ai.types';

const commonRules = [
  'Responda sempre com JSON valido e sem markdown.',
  'Nao invente campos ou entidades fora da whitelist.',
  'Nunca inclua tenant_id no JSON. O backend aplica automaticamente.',
  'Todos os textos para usuario devem estar em portugues brasileiro.',
];

export function buildGridFilterSystemPrompt(entityDictionary: EntityDictionaryEntry[]): string {
  return [
    'Voce converte pedidos em linguagem natural para definicao de grid no formato de Saved View.',
    ...commonRules,
    'Use apenas operadores permitidos: eq, neq, contains, startsWith, endsWith, in, notIn, gte, lte, between, isNull, isNotNull.',
    'Retorne no formato: {"definition_json": {...}, "explanation_ptbr": "..."}.',
    'Se houver duvida, prefira filtros conservadores e mantenha pageSize <= 200.',
    `Entidades e campos permitidos: ${JSON.stringify(
      entityDictionary.map((entity) => ({
        entityName: entity.entityName,
        labelPtBr: entity.labelPtBr,
        defaultColumns: entity.defaultColumns,
        fields: entity.fields,
      })),
    )}`,
  ].join('\n');
}

export function buildGridFilterUserPrompt(args: {
  naturalLanguage: string;
  entityName: string;
  currentViewDefinitionJson?: unknown;
}): string {
  return [
    `Entidade alvo: ${args.entityName}`,
    `Pedido do usuario: ${args.naturalLanguage}`,
    `Definicao atual (opcional): ${JSON.stringify(args.currentViewDefinitionJson ?? null)}`,
    'Retorne somente JSON no formato solicitado.',
  ].join('\n');
}

export function buildDashboardSystemPrompt(entityDictionary: EntityDictionaryEntry[]): string {
  return [
    'Voce gera especificacoes estruturadas de dashboard para backend executar com Prisma.',
    ...commonRules,
    'Retorne no formato: {"dashboardSpec": {"title": "...", "widgets": [...]}, "insights_ptbr": "..."}.',
    'Cada widget DEVE conter obrigatoriamente: id, type, title, entityName, metric.',
    'Cada widget deve ter type em: kpi, timeSeries, bar, pie, topN.',
    'TopN deve respeitar limite maximo 50.',
    'Use metric em: count, sum, avg.',
    'Nao use chaves alternativas como entity, timeframe, limit, top_n, group_by_field.',
    'Nao inclua SQL nem instrucoes de execucao.',
    `Entidades e campos permitidos: ${JSON.stringify(
      entityDictionary.map((entity) => ({
        entityName: entity.entityName,
        fields: entity.fields,
      })),
    )}`,
  ].join('\n');
}

export function buildDashboardUserPrompt(args: { naturalLanguage: string; entityHints?: string[] }): string {
  return [
    `Pedido do usuario: ${args.naturalLanguage}`,
    `Entity hints: ${JSON.stringify(args.entityHints ?? [])}`,
    'Retorne somente JSON no formato solicitado.',
  ].join('\n');
}

export function buildInsightsPrompt(data: unknown): string {
  return [
    'Gere insights curtos em PT-BR com base EXCLUSIVA nos dados abaixo.',
    'Nao invente informacoes e nao mencione dados ausentes.',
    `Dados: ${JSON.stringify(data)}`,
    'Retorne JSON: {"insights_ptbr":"..."}',
  ].join('\n');
}

export function buildHomeSearchPrompt(args: {
  query: string;
  entities: string[];
  entityDictionary: EntityDictionaryEntry[];
}): string {
  return [
    'Voce decide quais entidades pesquisar e quais filtros estruturados aplicar.',
    ...commonRules,
    `Consulta do usuario: ${args.query}`,
    `Entidades candidatas: ${JSON.stringify(args.entities)}`,
    `Dicionario: ${JSON.stringify(
      args.entityDictionary.map((entity) => ({
        entityName: entity.entityName,
        fields: entity.fields,
      })),
    )}`,
    'Retorne JSON: {"entities": ["..."], "filters": [...]}.',
  ].join('\n');
}

