// ─── DOM SECURITY (XSS PREVENTION) ───────────────────────────────────
export const sanitizeObjClient = (obj) => {
    if (typeof obj === 'string') return obj.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    if (Array.isArray(obj)) return obj.map(sanitizeObjClient);
    if (obj !== null && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, val] of Object.entries(obj)) sanitized[key] = sanitizeObjClient(val);
        return sanitized;
    }
    return obj;
};

// ─── UTILS ───────────────────────────────────────────────────────────
export const $ = id => document.getElementById(id);

export const COLORS = ['#6366F1', '#EF4444', '#8B5CF6', '#F59E0B', '#22C55E', '#EC4899', '#3B82F6', '#14B8A6', '#F43F5E', '#06B6D4', '#84CC16', '#D946EF', '#EAB308', '#0EA5E9', '#10B981', '#F97316'];

export function showToast(msg, type = 'info') {
    const toastContainer = $('toast-container');
    if (!toastContainer) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

export function detectMode(resp) {
    const hasCourses = resp.courses && resp.courses.length > 0;
    const hasDeliverables = resp.deliverables && resp.deliverables.length > 0;
    if (hasCourses && hasDeliverables) return 'mixed';
    if (hasDeliverables) return 'deadline';
    return 'curriculum';
}

export function computeScore(c) {
    let s = parseInt(c.weight) || 0;
    s += (parseInt(c.credits) || 0) * 5;
    s += (c.units ? c.units.length : 0) * 3;
    if (c.date) { const d = Math.ceil((new Date(c.date) - new Date()) / 864e5); if (d <= 14) s += 30; else if (d <= 30) s += 20; else if (d <= 60) s += 10; }
    if ((c.estimated_effort || '').toLowerCase() === 'high') s += 10;
    return s;
}

export function switchScreen(n) {
    const screens = { 1: $('screen-1'), 2: $('screen-2'), 3: $('screen-3') };
    Object.values(screens).forEach(s => {
        if (!s) return;
        s.classList.remove('active');
        setTimeout(() => { if (!s.classList.contains('active')) s.style.display = 'none'; }, 400);
    });
    setTimeout(() => {
        const target = screens[n];
        if (target) {
            target.style.display = '';
            requestAnimationFrame(() => target.classList.add('active'));
            const topNavBtn = $('upload-new-btn');
            if (topNavBtn) topNavBtn.classList.toggle('hidden', n === 1);

            // Reset view to dashboard when going to screen 3
            if (n === 3) {
                const dashWrapper = $('dashboard-wrapper');
                const progWrapper = $('progress-wrapper');
                const tabDash = $('tab-dashboard');
                const tabProg = $('tab-tracker');
                
                if (dashWrapper) dashWrapper.classList.remove('hidden');
                if (progWrapper) progWrapper.classList.add('hidden');
                if (tabDash) tabDash.classList.add('active');
                if (tabProg) tabProg.classList.remove('active');
            }
            window.scrollTo(0, 0);
        }
    }, 400);
}
