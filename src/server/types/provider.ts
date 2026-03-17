export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'ollama'
  | 'lmstudio'
  | 'xai'
  | 'qwen'
  | 'zai'
  | 'other';

export interface ProviderConfig {
  id: LLMProvider;
  name: string;
  defaultBaseUrl: string;
  supportsParallelToolCalls: boolean;
  supportsToolChoiceRequired: boolean;
  supportsToolChoice: boolean;
}

export const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    supportsParallelToolCalls: true,
    supportsToolChoiceRequired: true,
    supportsToolChoice: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    supportsParallelToolCalls: true,
    supportsToolChoiceRequired: true,
    supportsToolChoice: true,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    supportsParallelToolCalls: false,
    supportsToolChoiceRequired: false,
    supportsToolChoice: true,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    supportsParallelToolCalls: false,
    supportsToolChoiceRequired: true,
    supportsToolChoice: true,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    supportsParallelToolCalls: false,
    supportsToolChoiceRequired: false,
    supportsToolChoice: false,
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    defaultBaseUrl: 'http://localhost:1234/v1',
    supportsParallelToolCalls: false,
    supportsToolChoiceRequired: false,
    supportsToolChoice: true,
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    defaultBaseUrl: 'https://api.x.ai/v1',
    supportsParallelToolCalls: true,
    supportsToolChoiceRequired: true,
    supportsToolChoice: true,
  },
  qwen: {
    id: 'qwen',
    name: 'Alibaba Qwen',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    supportsParallelToolCalls: false,
    supportsToolChoiceRequired: false,
    supportsToolChoice: true,
  },
  zai: {
    id: 'zai',
    name: 'Z.AI',
    defaultBaseUrl: 'https://api.z.ai/api/coding/paas/v4/',
    supportsParallelToolCalls: false,
    supportsToolChoiceRequired: false,
    supportsToolChoice: true,
  },
  other: {
    id: 'other',
    name: 'Custom (OpenAI Compatible)',
    defaultBaseUrl: '',
    supportsParallelToolCalls: false,
    supportsToolChoiceRequired: false,
    supportsToolChoice: true,
  },
};

export function getProviderConfig(providerId: string): ProviderConfig {
  return PROVIDER_CONFIGS[providerId as LLMProvider] ?? PROVIDER_CONFIGS.other;
}
