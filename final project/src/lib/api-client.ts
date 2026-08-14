const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
const DASHBOARD_URL = import.meta.env.VITE_DASHBOARD_URL || 'http://localhost:5173';
export const LANDING_URL = import.meta.env.VITE_LANDING_URL || 'http://localhost:5174';

/** Maps a normalised frontend role key to its dashboard path. */
const ROLE_PATHS: Record<string, string> = {
  super_admin:    '/dashboard/super-admin',
  counselor:      '/dashboard/counselor',
  front_desk:     '/dashboard/frontdesk',
  teacher:        '/dashboard/teacher',
  student:        '/dashboard/student',
  referral_agent: '/dashboard/referral',
};

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

/** Redirect to root of dashboard (fallback). */
export const redirectToDashboard = () => {
  window.location.href = DASHBOARD_URL;
};

/**
 * Redirect to the role-specific dashboard page.
 * @param role  Normalised frontend role key (e.g. 'super_admin', 'student')
 */
export const redirectToDashboardRole = (role: string) => {
  const path = ROLE_PATHS[role] ?? '/';
  const token = tokenStore.getAccess() || '';
  const refresh = tokenStore.getRefresh() || '';
  const userStr = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || '';

  const params = new URLSearchParams();
  if (token) params.set('accessToken', token);
  if (refresh) params.set('refreshToken', refresh);
  if (userStr) params.set('user', userStr);

  const queryString = params.toString();
  const separator = path.includes('?') ? '&' : '?';
  const finalUrl = queryString
    ? `${DASHBOARD_URL}${path}${separator}${queryString}`
    : `${DASHBOARD_URL}${path}`;

  window.location.href = finalUrl;
};
