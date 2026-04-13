import {
  parseLlmDefaultHeadersFromEnv,
  resolveLlmBaseUrl,
  resolveOpenAiLikeClientInit,
  shouldUseLlmGateway,
  splitPromotableAuthorizationFromHeaders,
} from '../src/ai/openAIConfig';

const originalEnv = process.env;

function resetEnv(): void {
  process.env = { ...originalEnv };
}

describe('openAIConfig', () => {
  beforeEach(() => {
    resetEnv();
    delete process.env.LLM_BASE_URL;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_DEFAULT_HEADERS;
    delete process.env.LLM_DEFAULT_HEADERS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('resolveLlmBaseUrl', () => {
    it('prefers LLM_BASE_URL over OPENAI_BASE_URL', () => {
      process.env.OPENAI_BASE_URL = 'https://openai.example';
      process.env.LLM_BASE_URL = '  https://llm.example  ';
      expect(resolveLlmBaseUrl()).toBe('https://llm.example');
    });

    it('falls back to OPENAI_BASE_URL', () => {
      process.env.OPENAI_BASE_URL = 'https://only-openai';
      expect(resolveLlmBaseUrl()).toBe('https://only-openai');
    });

    it('returns undefined when unset', () => {
      expect(resolveLlmBaseUrl()).toBeUndefined();
    });
  });

  describe('parseLlmDefaultHeadersFromEnv', () => {
    it('returns undefined when no headers set', () => {
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it('merges OPENAI_DEFAULT_HEADERS with LLM_DEFAULT_HEADERS override', () => {
      process.env.OPENAI_DEFAULT_HEADERS = JSON.stringify({ 'X-A': '1', 'X-B': 'old' });
      process.env.LLM_DEFAULT_HEADERS = JSON.stringify({ 'X-B': 'new', 'X-C': '3' });
      expect(parseLlmDefaultHeadersFromEnv()).toEqual({
        'X-A': '1',
        'X-B': 'new',
        'X-C': '3',
      });
    });

    it('returns undefined for invalid JSON', () => {
      process.env.OPENAI_DEFAULT_HEADERS = '{not json';
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it('ignores non-object JSON (arrays)', () => {
      process.env.OPENAI_DEFAULT_HEADERS = '[1,2,3]';
      expect(parseLlmDefaultHeadersFromEnv()).toBeUndefined();
    });

    it('ignores non-string header values', () => {
      process.env.OPENAI_DEFAULT_HEADERS = JSON.stringify({ 'X-Num': 42, 'X-Ok': 'yes' });
      expect(parseLlmDefaultHeadersFromEnv()).toEqual({ 'X-Ok': 'yes' });
    });
  });

  describe('splitPromotableAuthorizationFromHeaders', () => {
    it('returns headers unchanged when no Authorization', () => {
      const h = { 'X-Custom': 'v' };
      expect(splitPromotableAuthorizationFromHeaders(h)).toEqual({ defaultHeaders: h });
    });

    it('promotes raw sk- token from Authorization', () => {
      const sk = 'sk-test123456789012345678901234567890';
      const result = splitPromotableAuthorizationFromHeaders({ Authorization: sk });
      expect(result.apiKeyFromAuthHeader).toBe(sk);
      expect(result.defaultHeaders).toEqual({});
    });

    it('promotes Bearer sk- token and strips header', () => {
      const sk = 'sk-abc';
      const result = splitPromotableAuthorizationFromHeaders({ Authorization: `Bearer ${sk}` });
      expect(result.apiKeyFromAuthHeader).toBe(sk);
      expect(result.defaultHeaders).toEqual({});
    });

    it('does not promote non-key Authorization values', () => {
      const h = { Authorization: 'Basic dXNlcjpwYXNz' };
      expect(splitPromotableAuthorizationFromHeaders(h)).toEqual({ defaultHeaders: h });
    });

    it('returns headers unchanged when Authorization header is empty', () => {
      const h = { Authorization: '' };
      expect(splitPromotableAuthorizationFromHeaders(h)).toEqual({ defaultHeaders: h });
    });
  });

  describe('shouldUseLlmGateway', () => {
    it('is true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-key';
      expect(shouldUseLlmGateway()).toBe(true);
    });

    it('is true when LLM_API_KEY is set', () => {
      process.env.LLM_API_KEY = 'sk-llm';
      expect(shouldUseLlmGateway()).toBe(true);
    });

    it('is true when base URL is set without key', () => {
      process.env.OPENAI_BASE_URL = 'https://proxy.local/v1';
      expect(shouldUseLlmGateway()).toBe(true);
    });

    it('is true when default headers JSON is non-empty', () => {
      process.env.LLM_DEFAULT_HEADERS = JSON.stringify({ Authorization: 'Bearer sk-from-header' });
      expect(shouldUseLlmGateway()).toBe(true);
    });

    it('is false when nothing configured', () => {
      expect(shouldUseLlmGateway()).toBe(false);
    });
  });

  describe('resolveOpenAiLikeClientInit', () => {
    it('uses env API key and optional base URL', () => {
      process.env.OPENAI_API_KEY = 'sk-real';
      process.env.LLM_BASE_URL = 'https://custom';
      expect(resolveOpenAiLikeClientInit()).toEqual({
        apiKey: 'sk-real',
        baseURL: 'https://custom',
      });
    });

    it('uses unused placeholder when no key and no promotable auth in headers', () => {
      expect(resolveOpenAiLikeClientInit()).toEqual({ apiKey: 'unused' });
    });

    it('prefers LLM_API_KEY over OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'sk-openai';
      process.env.LLM_API_KEY = 'sk-llm-wins';
      expect(resolveOpenAiLikeClientInit().apiKey).toBe('sk-llm-wins');
    });

    it('promotes sk- token from default headers when env API key is empty', () => {
      process.env.LLM_DEFAULT_HEADERS = JSON.stringify({ Authorization: 'sk-from-headers-only' });
      expect(resolveOpenAiLikeClientInit()).toEqual({
        apiKey: 'sk-from-headers-only',
      });
    });

    it('uses defaultHeaders with env API key when both are set', () => {
      process.env.OPENAI_API_KEY = 'sk-main';
      process.env.OPENAI_DEFAULT_HEADERS = JSON.stringify({ 'X-Custom': '1' });
      expect(resolveOpenAiLikeClientInit()).toEqual({
        apiKey: 'sk-main',
        defaultHeaders: { 'X-Custom': '1' },
      });
    });
  });
});
