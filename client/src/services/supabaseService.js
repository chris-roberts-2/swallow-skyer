import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

class SupabaseService {
  // METADATA-ONLY OPERATIONS
  // Note: Binary file storage is handled by Cloudflare R2 on the backend
  // This service only manages photo metadata (coordinates, URLs, timestamps, user info)

  // Photo metadata operations
  async getPhotos() {
    const { data, error } = await supabase
      .from('photos')
      .select('id, filename, caption, latitude, longitude, altitude, created_at, updated_at, user_id, file_url')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getPhotosByLocation(latitude, longitude, radius = 0.001) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, filename, caption, latitude, longitude, altitude, created_at, updated_at, user_id, file_url')
      .gte('latitude', latitude - radius)
      .lte('latitude', latitude + radius)
      .gte('longitude', longitude - radius)
      .lte('longitude', longitude + radius);

    if (error) throw error;
    return data;
  }

  async insertPhotoMetadata(photoMetadata) {
    // Only store metadata - file_url points to R2 storage
    const { data, error } = await supabase
      .from('photos')
      .insert([photoMetadata])
      .select();

    if (error) throw error;
    return data[0];
  }

  async updatePhotoMetadata(id, updates) {
    const { data, error } = await supabase
      .from('photos')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) throw error;
    return data[0];
  }

  async deletePhotoMetadata(id) {
    const { error } = await supabase
      .from('photos')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // User metadata operations
  async getUser(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, created_at')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  async updateUserMetadata(userId, updates) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select();

    if (error) throw error;
    return data[0];
  }

  // Location metadata operations
  async getLocationStats(latitude, longitude, radius = 0.01) {
    const { data, error } = await supabase
      .from('photos')
      .select('id, latitude, longitude, created_at')
      .gte('latitude', latitude - radius)
      .lte('latitude', latitude + radius)
      .gte('longitude', longitude - radius)
      .lte('longitude', longitude + radius);

    if (error) throw error;
    return {
      photoCount: data.length,
      coordinates: { latitude, longitude },
      radius
    };
  }
}

export default new SupabaseService();
