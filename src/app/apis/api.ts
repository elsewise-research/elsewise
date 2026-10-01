export const callApi = async <B, T>(url: string, body: B, method: 'POST' | 'PUT' = 'POST'): Promise<T> => {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`${url} API error: ${response.status}`);
    }

    const result = await response.json();
    return result;
  };

  export const getApi = async <T>(url: string): Promise<T> => {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`${url} API error: ${response.status}`);
    }

    const result = await response.json();
    return result;
  };

  export type ApiResult = {
    success: boolean;
    message?: string;
  }