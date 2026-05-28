import type { ListResponse } from '../types/api';
import type { PlayerCape, PlayerSkin } from '../types/entities';

const getAuthHeader = (): string => {
  const token =
    sessionStorage.getItem('jwtToken') ||
    localStorage.getItem('jwtToken') ||
    (window as unknown as { __strapiAuthToken?: string }).__strapiAuthToken ||
    '';
  return token ? `Bearer ${token.replace(/^"(.*)"$/, '$1')}` : '';
};

const base = '/yggdrasil/textures';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: getAuthHeader(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const buildQueryString = (params?: {
  page?: number;
  pageSize?: number;
  search?: string;
}): string => {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  if (params?.search) searchParams.set('search', params.search);
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

export const texturesApi = {
  listSkins(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<ListResponse<PlayerSkin>> {
    return request<ListResponse<PlayerSkin>>(`/skins${buildQueryString(params)}`);
  },

  listCapes(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<ListResponse<PlayerCape>> {
    return request<ListResponse<PlayerCape>>(`/capes${buildQueryString(params)}`);
  },

  uploadSkin(
    userId: number,
    username: string | undefined,
    file: File,
    variant?: 'CLASSIC' | 'SLIM',
  ): Promise<PlayerSkin> {
    return fileToBase64(file).then((fileBase64) =>
      request<PlayerSkin>('/upload/skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username, fileBase64, variant }),
      }),
    );
  },

  uploadCape(userId: number, username: string | undefined, file: File): Promise<PlayerCape> {
    return fileToBase64(file).then((fileBase64) =>
      request<PlayerCape>('/upload/cape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username, fileBase64 }),
      }),
    );
  },

  deleteSkin(id: number): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/skins/${id}`, { method: 'DELETE' });
  },

  deleteCape(id: number): Promise<{ success: boolean }> {
    return request<{ success: boolean }>(`/capes/${id}`, { method: 'DELETE' });
  },

  validate(): Promise<{ missingSkins: number[]; missingCapes: number[] }> {
    return request<{ missingSkins: number[]; missingCapes: number[] }>('/validate', {
      method: 'POST',
    });
  },

  purgeMissing(): Promise<{ deletedSkins: number; deletedCapes: number }> {
    return request<{ deletedSkins: number; deletedCapes: number }>('/purge-missing', {
      method: 'POST',
    });
  },
};
