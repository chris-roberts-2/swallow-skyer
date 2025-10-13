// Location-related TypeScript type definitions

export interface Location {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface LocationWithPhotos extends Location {
  photo_count: number;
}

export interface LocationFilters {
  latitude: number;
  longitude: number;
  radius?: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}
