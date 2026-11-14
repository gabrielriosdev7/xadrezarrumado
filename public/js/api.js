import { requireSupabase } from './supabase.js';

export async function callGameApi(action, data = {}) {
    const supabase = requireSupabase();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Entre na sua conta para jogar online.');

    const response = await fetch('/api/games', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, ...data }),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || 'Não foi possível acessar a partida.');
    }

    return result.game;
}
