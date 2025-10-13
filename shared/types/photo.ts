// Photo-related TypeScript type definitions

export interface Photo {
  id: string;
  filename: string;
  original_filename: string;
  file_path: string;
  thumbnail_path?: string;
  caption?: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  created_at: string;
  updated_at: string;
  user_id?: string;
}

export interface PhotoUpload {
  file: File;
  caption?: string;
  latitude: number;
  longitude: number;
}

export interface PhotoFilters {
  latitude?: number;
  longitude?: number;
  radius?: number;
  page?: number;
  per_page?: number;
}

export interface PhotoStats {
  total_photos: number;
  recent_photos: number;
}

export interface PhotoResponse {
  photos: Photo[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}
