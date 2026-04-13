jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ constructed: true })),
}));

import OpenAI from 'openai';

import { createOpenAiLikeClient, resolveOpenAiLikeClientInit } from '../src/ai/openAIConfig';

const originalEnv = process.env;

describe('createOpenAiLikeClient', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OPENAI_API_KEY = 'sk-test-openai-sdk-spec';
    delete process.env.LLM_BASE_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('loads the OpenAI SDK and constructs a client with resolved init', async () => {
    const init = resolveOpenAiLikeClientInit();
    const client = await createOpenAiLikeClient();
    expect(client).toEqual({ constructed: true });
    expect(OpenAI).toHaveBeenCalledWith(init);
  });
});
