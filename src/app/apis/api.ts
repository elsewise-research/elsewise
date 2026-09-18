export const callApi = async <B, T>(url: string, body: B): Promise<T> => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  
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