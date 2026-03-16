// ─── AUTH MODAL COMPONENT ──────────────────────────────────────────
import { supabase } from '../supabase.js';
import { signInWithGoogle } from '../auth.js';

export function createAuthModal(onSuccess) {
    const modal = document.createElement('div');
    modal.className = 'auth-modal-overlay';
    modal.innerHTML = `
        <div class="glass-card auth-modal">
            <button class="close-btn" id="close-auth">&times;</button>
            <div class="auth-header">
                <h2>Welcome to <span class="gradient-text">SyllabusOS</span></h2>
                <p id="auth-subtitle">Log in to sync your academic command center.</p>
            </div>
            
            <form id="auth-form">
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="auth-email" class="form-input" placeholder="you@example.com" required>
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required>
                </div>
                <div id="auth-error" class="auth-error-msg"></div>
                <button type="submit" id="auth-submit" class="btn btn-primary auth-btn">Log In</button>
            </form>

            <div class="auth-footer">
                <p id="toggle-auth-text">Don't have an account? <a href="#" id="toggle-auth">Sign Up</a></p>
                <a href="#" id="forgot-password" class="forgot-link">Forgot Password?</a>
            </div>

            <div class="social-auth">
                <div class="divider"><span>OR</span></div>
                <button class="btn btn-outline social-btn" id="google-auth-btn">
                    <img src="https://www.google.com/favicon.ico" alt="Google">
                    Continue with Google
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    let isLogin = true;
    const form = modal.querySelector('#auth-form');
    const submitBtn = modal.querySelector('#auth-submit');
    const toggleAuth = modal.querySelector('#toggle-auth');
    const subtitle = modal.querySelector('#auth-subtitle');
    const toggleText = modal.querySelector('#toggle-auth-text');
    const errorMsg = modal.querySelector('#auth-error');
    const closeBtn = modal.querySelector('#close-auth');

    closeBtn.onclick = () => {
        modal.classList.add('hide');
        setTimeout(() => modal.remove(), 300);
    };

    toggleAuth.onclick = (e) => {
        e.preventDefault();
        isLogin = !isLogin;
        submitBtn.innerText = isLogin ? 'Log In' : 'Create Account';
        subtitle.innerText = isLogin ? 'Log in to sync your academic command center.' : 'Join SyllabusOS and master your semester.';
        toggleText.innerHTML = isLogin ? `Don't have an account? <a href="#" id="toggle-auth">Sign Up</a>` : `Already have an account? <a href="#" id="toggle-auth">Log In</a>`;
        
        // Re-attach toggle listener because innerHTML wipes it
        modal.querySelector('#toggle-auth').onclick = toggleAuth.onclick;
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = modal.querySelector('#auth-email').value;
        const password = modal.querySelector('#auth-password').value;
        
        submitBtn.disabled = true;
        submitBtn.innerText = isLogin ? 'Logging in...' : 'Creating Account...';
        errorMsg.innerText = '';

        try {
            let res;
            if (isLogin) {
                res = await supabase.auth.signInWithPassword({ email, password });
            } else {
                res = await supabase.auth.signUp({ email, password });
            }

            if (res.error) throw res.error;

            // Success: Trigger Migration if old token exists
            const oldToken = localStorage.getItem('syllabusos_token');
            if (oldToken) {
                try {
                    console.log('Migrating anonymous data...');
                    await fetch('/api/migrate-data', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${res.data.session.access_token}`
                        },
                        body: JSON.stringify({ oldToken })
                    });
                    localStorage.removeItem('syllabusos_token');
                } catch (migrationErr) {
                    console.error('Migration failed:', migrationErr);
                }
            }

            modal.classList.add('hide');
            setTimeout(() => {
                modal.remove();
                if (onSuccess) onSuccess(res.data.session);
            }, 300);

        } catch (err) {
            errorMsg.innerText = err.message;
            submitBtn.disabled = false;
            submitBtn.innerText = isLogin ? 'Log In' : 'Create Account';
        }
    };

    // Google Auth Listener
    const googleBtn = modal.querySelector('#google-auth-btn');
    if (googleBtn) {
        googleBtn.onclick = async () => {
            try {
                googleBtn.disabled = true;
                googleBtn.innerHTML = `<span class="loader"></span> Connecting...`;
                await signInWithGoogle();
            } catch (err) {
                errorMsg.innerText = err.message || 'Google Login failed';
                googleBtn.disabled = false;
                googleBtn.innerHTML = `<img src="https://www.google.com/favicon.ico" alt="Google"> Continue with Google`;
            }
        };
    }

    return modal;
}
