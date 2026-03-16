import { supabase } from './supabase.js';

// ─── AUTHENTICATION WRAPPER ──────────────────────────────────────────
export function initAuth() {
    const originalFetch = window.fetch;

    window.fetch = function() {
        let [resource, config] = arguments;
        
        // Only attach auth to our internal API calls
        if (typeof resource === 'string' && resource.startsWith('/api/')) {
            config = config || {};
            config.headers = config.headers || {};

            // Synchronously check if there's a session in memory/storage
            // We use getSession() which is async, so we wrap the fetch in an async function
            return (async () => {
                const { data: { session } } = await supabase.auth.getSession();
                
                if (session?.access_token) {
                    if (config.headers instanceof Headers) {
                        config.headers.append('Authorization', 'Bearer ' + session.access_token);
                    } else {
                        config.headers['Authorization'] = 'Bearer ' + session.access_token;
                    }
                }
                return originalFetch(resource, config);
            })();
        }
        return originalFetch(resource, config);
    };
}

/** ─── GOOGLE OAUTH ────────────────────────────────────────── */
export async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/app.html'
        }
    });

    if (error) {
        console.error('Google login error:', error);
        throw error;
    }
    return data;
}
