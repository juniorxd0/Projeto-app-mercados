export type Category =
  | 'mercearia'
  | 'carnes'
  | 'laticinios'
  | 'hortifruti'
  | 'bebidas'
  | 'limpeza'
  | 'higiene'
  | 'matinais';

export interface MarketRule {
  id: string;
  title: string;
  description: string;
  active: boolean;
}

export interface FewShotExample {
  id: string;
  title: string;
  visualCue: string;
  rawTextInput: string;
  expectedOutput: {
    nome_produto: string;
    marca: string;
    quantidade_volume: number;
    unidade_medida: string;
    preco_regular: number;
    preco_promocional: number | null;
    tipo_promocao: string;
    condicao_detalhes: string | null;
    categoria_sugerida: string;
  };
}

export interface Market {
  id: string;
  name: string;
  tagline: string;
  logoUrl?: string;
  color: string;
  badgeBg: string;
  city: string;
  defaultOffersUrl: string;
  customRules: string;
  rulesList: MarketRule[];
  fewShotExamples: FewShotExample[];
  lastScrapedAt?: string;
  status: 'active' | 'warning' | 'idle';
}

export interface FlyerOfferItem {
  id: string;
  marketId: string;
  marketName: string;
  pageNumber: number;
  nome_produto: string;
  marca: string;
  quantidade_volume: number;
  unidade_medida: string;
  preco_regular: number;
  preco_promocional: number | null;
  tipo_promocao: 'SEM_PROMOCAO' | 'CLUBE_FIDELIDADE' | 'ATACADO_VOLUME' | 'LEVE_PAGUE' | 'FRACIONADO_100G';
  condicao_detalhes: string | null;
  categoria: Category;
  preco_unitario_equivalente: number; // e.g. R$/kg, R$/L, R$/un
  preco_unitario_label: string; // "R$ 5,78 / kg"
  canonicalId: string; // group key for identical items
  validade: string;
  imagem_url?: string;
}

export interface CanonicalProduct {
  id: string; // canonical slug e.g. "arroz-parboilizado_tio-joao_5000g"
  name: string;
  brand: string;
  volumeLabel: string;
  category: Category;
  imageUrl?: string;
  offers: FlyerOfferItem[];
  lowestPrice: number;
  highestPrice: number;
  cheapestMarketId: string;
  cheapestMarketName: string;
  maxSavingsAmount: number;
  maxSavingsPercent: number;
}

export interface PriceAlert {
  id: string;
  productName: string;
  canonicalId?: string;
  targetMaxPrice: number;
  userEmail: string;
  category?: Category;
  createdAt: string;
  active: boolean;
  lastTriggeredAt?: string;
  matchedOffer?: {
    marketName: string;
    price: number;
    savings: number;
    validade: string;
  };
}

export interface BasketItem {
  canonicalId: string;
  productName: string;
  volumeLabel: string;
  category: Category;
  quantity: number;
}

export interface CrawlerLogEntry {
  id: string;
  timestamp: string;
  marketName: string;
  pagesScanned: number;
  itemsExtracted: number;
  tokensUsed: number;
  status: 'success' | 'warning' | 'error';
  message: string;
}
