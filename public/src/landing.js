/** SyllabusOS Landing Page Interactive Script */
import { initAuth } from './auth.js';
import { loadHistoryList } from './api.js';
import { supabase } from './supabase.js';
import { createAuthModal } from './components/authModal.js';

// Initialize Auth for session persistence
initAuth();

// Preloader Handler
window.addEventListener('load', () => {
    const preloader = document.getElementById('preloader');
    if (preloader) {
        setTimeout(() => {
            preloader.classList.add('hidden');
        }, 800);
    }
});

// Cursor Glow Effect
document.addEventListener('DOMContentLoaded', () => {
    const glow = document.getElementById('cursor-glow');
    if (glow) {
        document.addEventListener('mousemove', (e) => {
            glow.style.left = e.clientX + 'px';
            glow.style.top = e.clientY + 'px';
        });
    }
});

// Scroll Reveal Logic
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
});

document.addEventListener('DOMContentLoaded', async () => {
    const reveals = document.querySelectorAll('.reveal');
    reveals.forEach(el => revealObserver.observe(el));

    // Navbar Scroll Effect
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // --- NEW: Auth State Handler ---
    const handleGetStarted = async (e) => {
        if (e) e.preventDefault();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
            window.location.href = 'app.html';
        } else {
            createAuthModal((session) => {
                if (session) window.location.href = 'app.html';
            });
        }
    };

    const getStartedBtns = document.querySelectorAll('a[href="app.html"]');
    getStartedBtns.forEach(btn => btn.onclick = handleGetStarted);

    // --- NEW: History Preview Logic ---
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const history = await loadHistoryList();
            const historyContainer = document.getElementById('history-preview');
            const historySection = document.getElementById('history-section');

            if (history && history.length > 0) {
                historySection.style.display = 'block';
                // Show only top 3
                const recent = history.slice(0, 3);
                historyContainer.innerHTML = recent.map(item => {
                    const dateRaw = item.savedAt || item.created_at || item.createdAt;
                    let dateDisplay = 'Recently';
                    if (dateRaw) {
                        const d = new Date(dateRaw);
                        dateDisplay = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
                    }
                    return `
                    <div class="glass-card history-card reveal">
                        <div>
                            <div class="date">${dateDisplay}</div>
                            <h4>${item.name || 'Untitled Syllabus'}</h4>
                            <p style="font-size: 0.85rem; color: var(--text-muted);">${(item.rawText || '').substring(0, 60)}...</p>
                        </div>
                        <div class="actions">
                            <a href="app.html?id=${item.id}" class="btn btn-primary" style="padding: 8px 20px; font-size: 0.85rem;">Open</a>
                        </div>
                    </div>
                `;}).join('');
                
                // Observe newly added cards
                historyContainer.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
            }
        }
    } catch (err) {
        console.error('Failed to load landing history:', err);
    }

    // --- NEW: Contact Form Logic ---
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = document.getElementById('form-status');
            const submitBtn = contactForm.querySelector('button');
            
            const name = contactForm.querySelector('input[type="text"]').value;
            const email = contactForm.querySelector('input[type="email"]').value;
            const message = contactForm.querySelector('textarea').value;

            submitBtn.disabled = true;
            submitBtn.innerText = 'Sending...';
            
            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, message })
                });

                const result = await response.json();
                
                if (response.ok) {
                    contactForm.reset();
                    status.innerText = 'Message sent successfully!';
                    status.style.color = '#10B981';
                    status.style.display = 'block';
                } else {
                    const msg = result.details ? result.details.map(d => d.msg).join(', ') : (result.error || 'Failed to send message');
                    throw new Error(msg);
                }
            } catch (err) {
                console.error('Contact Error:', err);
                status.innerText = err.message || 'ErrorMessage failed to send';
                status.style.color = '#EF4444';
                status.style.display = 'block';
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Send Message';
                setTimeout(() => {
                    status.style.display = 'none';
                }, 5000);
            }
        });
    }
});

// Tilt Effect for Cards
document.addEventListener('mousemove', (e) => {
    const cards = document.querySelectorAll('.glass-card.reveal');
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;

    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        // Only tilt if near the card to save performance
        const dx = clientX - (rect.left + rect.width / 2);
        const dy = clientY - (rect.top + rect.height / 2);
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < 400) {
            const xRotation = (dy / innerHeight) * 20;
            const yRotation = (dx / innerWidth) * -20;
            card.style.transform = `perspective(1000px) rotateX(${xRotation}deg) rotateY(${yRotation}deg) translateY(-8px)`;
        } else {
             card.style.transform = '';
        }
    });
});
