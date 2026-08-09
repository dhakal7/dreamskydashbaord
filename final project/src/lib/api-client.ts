const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:5001/api';
const DASHBOARD_URL = (import.meta as any).env?.VITE_DASHBOARD_URL ?? 'http://localhost:5173';

export const ACCESS_TOKEN_KEY = 'dreamsky-access-token';
export const REFRESH_TOKEN_KEY = 'dreamsky-refresh-token';
export const USER_KEY = 'dreamsky-user';

export const tokenStore = {
  getAccess(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY) ?? sessionStorage.getItem(ACCESS_TOKEN_KEY);
  },
  setAccess(token: string, remember: boolean = true) {
    if (remember) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    } else {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  },
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY) ?? sessionStorage.getItem(REFRESH_TOKEN_KEY);
  },
  setRefresh(token: string, remember: boolean = true) {
    if (remember) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
      sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    } else {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  },
  setUser(user: any, remember: boolean = true) {
    const serialized = JSON.stringify(user);
    if (remember) {
      localStorage.setItem(USER_KEY, serialized);
      sessionStorage.removeItem(USER_KEY);
    } else {
      sessionStorage.setItem(USER_KEY, serialized);
      localStorage.removeItem(USER_KEY);
    }
  },
  clearAll() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }
};

export const api = {
  async post(endpoint: string, body: any) {
    const token = tokenStore.getAccess();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data.message || `Request failed with status ${res.status}`;
      const error: any = new Error(errorMsg);
      error.response = { data, status: res.status };
      throw error;
    }

    return { data };
  },

  async get(endpoint: string) {
    const token = tokenStore.getAccess();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = data.message || `Request failed with status ${res.status}`;
      const error: any = new Error(errorMsg);
      error.response = { data, status: res.status };
      throw error;
    }

    return { data };
  }
};

export const redirectToDashboard = () => {
  window.location.href = DASHBOARD_URL;
};

