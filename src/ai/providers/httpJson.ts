import { isRetryableStatus, LlmApiError } from "../llmClient.js";

/** POST JSON, mapping network/HTTP failures to `LlmApiError` with the right `retryable` flag. */
export async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  providerLabel: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new LlmApiError(`${providerLabel} request failed: network error.`, {
      retryable: true,
      cause,
    });
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new LlmApiError(
      `${providerLabel} request failed with status ${response.status}: ${bodyText.slice(0, 500)}`,
      {
        statusCode: response.status,
        retryable: isRetryableStatus(response.status),
      },
    );
  }

  return response.json();
}
