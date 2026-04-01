import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim()
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const SUPABASE_CLIENT_CACHE_KEY = "__elb_v1_supabase_client__";
const SUPABASE_STORAGE_KEY = "elb-v1-web-auth-token";

function getCachedClient(): SupabaseClient | null {
  const globalScope = globalThis as typeof globalThis & { [SUPABASE_CLIENT_CACHE_KEY]?: SupabaseClient | null };
  return globalScope[SUPABASE_CLIENT_CACHE_KEY] ?? null;
}

function setCachedClient(client: SupabaseClient | null): void {
  const globalScope = globalThis as typeof globalThis & { [SUPABASE_CLIENT_CACHE_KEY]?: SupabaseClient | null };
  globalScope[SUPABASE_CLIENT_CACHE_KEY] = client;
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const cachedClient = getCachedClient();
  if (cachedClient) {
    return cachedClient;
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      storageKey: SUPABASE_STORAGE_KEY,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  setCachedClient(client);
  return client;
}
