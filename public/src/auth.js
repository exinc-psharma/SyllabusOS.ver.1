import { supabase } from './supabase.js';

// ─── AUTHENTICATION WRAPPER ──────────────────────────────────────────
export async function initAuth() {
    const originalFetch = window.fetch;

    window.fetch = async function() {
        let [resource, config] = arguments;
        
        // Only attach auth to our internal API calls
        if (typeof resource === 'string' && resource.startsWith('/api/')) {
            config = config || {};
            config.headers = config.headers || {};

            // Get the latest session to ensure we have the most recent JWT
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session?.access_token) {
                if (config.headers instanceof Headers) {
                    config.headers.append('Authorization', 'Bearer ' + session.access_token);
                } else {
                    config.headers['Authorization'] = 'Bearer ' + session.access_token;
                }
            }
        }
        return originalFetch(resource, config);
    };
}
