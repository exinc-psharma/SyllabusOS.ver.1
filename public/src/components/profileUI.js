/** Profile UI Component for SyllabusOS */
import { supabase } from '../supabase.js';

export function createProfileUI(container, session) {
    if (!session || !session.user) return;

    const user = session.user;
    const email = user.email;
    const initial = email.charAt(0).toUpperCase();

    // Create Profile Element
    const profileWrap = document.createElement('div');
    profileWrap.className = 'profile-nav-wrap';
    profileWrap.innerHTML = `
        <div class="profile-avatar" id="profile-avatar-trigger">
            ${initial}
        </div>
        <div class="profile-dropdown hidden" id="profile-dropdown">
            <div class="dropdown-header">
                <p class="dropdown-label">Signed in as</p>
                <p class="dropdown-email" title="${email}">${email}</p>
            </div>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item logout-btn" id="logout-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log Out
            </button>
        </div>
    `;

    container.appendChild(profileWrap);

    // Toggle Dropdown
    const trigger = profileWrap.querySelector('#profile-avatar-trigger');
    const dropdown = profileWrap.querySelector('#profile-dropdown');
    
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    // Close on click outside
    document.addEventListener('click', () => {
        dropdown.classList.add('hidden');
    });

    // Logout Logic
    const logoutBtn = profileWrap.querySelector('#logout-btn');
    logoutBtn.addEventListener('click', async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error);
            alert('Logout failed: ' + error.message);
        } else {
            window.location.href = 'index.html';
        }
    });
}
