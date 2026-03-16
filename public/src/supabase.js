// ─── SUPABASE CLIENT INITIALIZATION ─────────────────────────────────
const SUPABASE_URL = 'https://zxoyograzwmyyhketaxt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4b3lvZ3JhendteXloa2V0YXh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1ODkzNzEsImV4cCI6MjA4OTE2NTM3MX0.KScHLj5k4E3wlynFMZPt_5OVxC6vIuuZBoKC35RpPaY';

// We assume the Supabase SDK is loaded via CDN in index.html
// @ts-ignore
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
    }
});
