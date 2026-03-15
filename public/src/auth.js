// ─── AUTHENTICATION WRAPPER ──────────────────────────────────────────
export function initAuth() {
    let token = localStorage.getItem('syllabusos_token');
    if (!token) {
        token = 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('syllabusos_token', token);
    }
    const originalFetch = window.fetch;
    window.fetch = async function() {
        let [resource, config] = arguments;
        if (typeof resource === 'string' && resource.startsWith('/api/')) {
            config = config || {};
            config.headers = config.headers || {};
            if (config.headers instanceof Headers) {
                config.headers.append('Authorization', 'Bearer ' + token);
            } else {
                config.headers['Authorization'] = 'Bearer ' + token;
            }
        }
        return originalFetch(resource, config);
    };
}
