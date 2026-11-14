import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export function requireSupabase() {
    if (!supabase) {
        throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis do projeto.');
    }

    return supabase;
}

export function getSupabaseConfigurationError() {
    return supabase ? null : 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis do projeto.';
}
