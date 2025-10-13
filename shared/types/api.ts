// API-related TypeScript type definitions

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

export interface ApiError {
  message: string;
  status: number;
  details?: any;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}
