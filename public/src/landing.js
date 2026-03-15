/** SyllabusOS Landing Page Interactive Script */

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

document.addEventListener('DOMContentLoaded', () => {
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
});

// Tilt Effect for Hero Card (Subtle)
document.addEventListener('mousemove', (e) => {
    const card = document.querySelector('.hero-card-main');
    if (card) {
        const { clientX, clientY } = e;
        const { innerWidth, innerHeight } = window;
        const xRotation = ((clientY / innerHeight) - 0.5) * 15;
        const yRotation = ((clientX / innerWidth) - 0.5) * -15;
        card.style.transform = `rotate3d(1, 0, 0, ${xRotation}deg) rotate3d(0, 1, 0, ${yRotation}deg) translateZ(20px)`;
    }
});
