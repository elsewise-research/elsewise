// Attaches the HTTP status code to the thrown error so callers can distinguish failure
// kinds (e.g. a 401 auth error) without parsing the message string.
export type ApiError = Error & { status: number };

function apiError(url: string, status: number): ApiError {
  return Object.assign(new Error(`${url} API error: ${status}`), { status });
}

export const callApi = async <B, T>(url: string, body: B, method: 'POST' | 'PUT' = 'POST'): Promise<T> => {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw apiError(url, response.status);
    }

    const result = await response.json();
    return result;
  };

  export const getApi = async <T>(url: string): Promise<T> => {
    const response = await fetch(url);

    if (!response.ok) {
      throw apiError(url, response.status);
    }

    const result = await response.json();
    return result;
  };

  export type ApiResult = {
    success: boolean;
    message?: string;
  }