// ─── MOCK FALLBACK ───────────────────────────────────────────────────
const MOCK_RESPONSE = {
    format: "indian_btech",
    semester_summary: { total_courses: 6, total_credits: 24, total_theory: 4, total_labs: 2 },
    courses: [
        {
            course_code: "ECC-303", course_name: "Digital Signal Processing", credits: "4", type: "theory", internal_marks: "40", end_term_marks: "60", practical_marks: "", weight: "20%", date: "", priority: "High", category: "theory", estimated_effort: "High", confidence: 0.93, units: [
                { unit: "UNIT I", topics: ["Discrete-Time Signals", "Z-Transform", "DFT"] },
                { unit: "UNIT II", topics: ["FFT Algorithms", "Radix-2 FFT"] },
                { unit: "UNIT III", topics: ["FIR Filter Design", "Window Techniques"] },
                { unit: "UNIT IV", topics: ["IIR Filter Design", "Butterworth", "Chebyshev"] }
            ]
        },
        {
            course_code: "ECC-305", course_name: "Microelectronics", credits: "4", type: "theory", internal_marks: "40", end_term_marks: "60", practical_marks: "", weight: "20%", date: "", priority: "High", category: "theory", estimated_effort: "High", confidence: 0.91, units: [
                { unit: "UNIT I", topics: ["MOSFET Fundamentals", "Small Signal Model"] },
                { unit: "UNIT II", topics: ["Amplifier Configurations", "Biasing"] },
                { unit: "UNIT III", topics: ["Op-Amp Design", "Feedback Circuits"] },
                { unit: "UNIT IV", topics: ["CMOS Logic Design", "Layout Techniques"] }
            ]
        },
        {
            course_code: "ECC-311", course_name: "Data Communication & Networking", credits: "3", type: "theory", internal_marks: "40", end_term_marks: "60", practical_marks: "", weight: "15%", date: "", priority: "Medium", category: "theory", estimated_effort: "Medium", confidence: 0.89, units: [
                { unit: "UNIT I", topics: ["OSI Model", "TCP/IP", "Data Link Layer"] },
                { unit: "UNIT II", topics: ["Error Detection", "Flow Control"] },
                { unit: "UNIT III", topics: ["Routing Algorithms", "IP Addressing"] },
                { unit: "UNIT IV", topics: ["Transport Layer", "Application Layer Protocols"] }
            ]
        },
        {
            course_code: "ECC-307", course_name: "Control Systems", credits: "4", type: "theory", internal_marks: "40", end_term_marks: "60", practical_marks: "", weight: "20%", date: "", priority: "High", category: "theory", estimated_effort: "High", confidence: 0.90, units: [
                { unit: "UNIT I", topics: ["Laplace Transform", "Transfer Functions"] },
                { unit: "UNIT II", topics: ["Time Domain Analysis", "Stability"] },
                { unit: "UNIT III", topics: ["Root Locus", "Frequency Response"] },
                { unit: "UNIT IV", topics: ["State Space Analysis", "Controllability"] }
            ]
        },
        { course_code: "ECC-351", course_name: "DSP Lab", credits: "2", type: "lab", internal_marks: "30", end_term_marks: "", practical_marks: "70", weight: "10%", date: "", priority: "Medium", category: "lab", estimated_effort: "Medium", confidence: 0.88, units: [] },
        { course_code: "ECC-353", course_name: "Microelectronics Lab", credits: "2", type: "lab", internal_marks: "30", end_term_marks: "", practical_marks: "70", weight: "10%", date: "", priority: "Medium", category: "lab", estimated_effort: "Medium", confidence: 0.87, units: [] }
    ]
};

const DEFAULT_INPUT = `B.Tech ECE - Semester V

Course Code  |  Course Name                          | Credits | Type
ECC-303      |  Digital Signal Processing             | 4       | Theory
ECC-305      |  Microelectronics                      | 4       | Theory
ECC-311      |  Data Communication & Networking       | 3       | Theory
ECC-307      |  Control Systems                       | 4       | Theory
ECC-351      |  DSP Lab                               | 2       | Lab
ECC-353      |  Microelectronics Lab                  | 2       | Lab

Evaluation: Internal 40 + End Term 60 (Theory), Practical 70 + Internal 30 (Lab)

ECC-303 Digital Signal Processing:
UNIT I: Discrete-Time Signals, Z-Transform, DFT
UNIT II: FFT Algorithms, Radix-2 FFT
UNIT III: FIR Filter Design, Window Techniques
UNIT IV: IIR Filter Design, Butterworth, Chebyshev

ECC-305 Microelectronics:
UNIT I: MOSFET Fundamentals, Small Signal Model
UNIT II: Amplifier Configurations, Biasing
UNIT III: Op-Amp Design, Feedback Circuits
UNIT IV: CMOS Logic Design, Layout Techniques`;

// ─── STATE ───────────────────────────────────────────────────────────
let currentResponse = null;
let uploadedPdfFile = null;
let creditsChart = null;
let unitsChart = null;

// ─── DOM ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const syllabusInput = $('syllabus-input');
const generatePlanBtn = $('generate-plan-btn');
const topNavBtn = $('upload-new-btn');
const rawTextDisplay = $('raw-text-display');
const jsonPreview = $('json-preview');
const rawJsonDisplay = $('raw-json-display');
const generateTimelineBtn = $('generate-timeline-btn');
const parseBadge = $('parse-badge');
const badgeText = $('badge-text');
const uploadZone = $('upload-zone');
const pdfInput = $('pdf-input');
const pdfFilename = $('pdf-filename');
const toggleCardsBtn = $('toggle-cards');
const toggleJsonBtn = $('toggle-json');

const screens = { 1: $('screen-1'), 2: $('screen-2'), 3: $('screen-3') };

// ─── SCREEN TRANSITIONS ─────────────────────────────────────────────
function switchScreen(n) {
    Object.values(screens).forEach(s => {
        s.classList.remove('active');
        setTimeout(() => { if (!s.classList.contains('active')) s.style.display = 'none'; }, 400);
    });
    setTimeout(() => {
        screens[n].style.display = '';
        requestAnimationFrame(() => screens[n].classList.add('active'));
        topNavBtn.classList.toggle('hidden', n === 1);
    }, 400);
}

// ─── INIT ────────────────────────────────────────────────────────────
syllabusInput.value = DEFAULT_INPUT;

// ─── PDF UPLOAD ──────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => pdfInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
    e.preventDefault(); uploadZone.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') handlePdf(f);
});
pdfInput.addEventListener('change', () => { if (pdfInput.files[0]) handlePdf(pdfInput.files[0]); });

function handlePdf(file) {
    uploadedPdfFile = file;
    pdfFilename.textContent = `📄 ${file.name}`;
    pdfFilename.classList.remove('hidden');
}

// ─── VIEW TOGGLE ─────────────────────────────────────────────────────
toggleCardsBtn.addEventListener('click', () => {
    toggleCardsBtn.classList.add('active'); toggleJsonBtn.classList.remove('active');
    jsonPreview.classList.remove('hidden'); rawJsonDisplay.classList.add('hidden');
});
toggleJsonBtn.addEventListener('click', () => {
    toggleJsonBtn.classList.add('active'); toggleCardsBtn.classList.remove('active');
    rawJsonDisplay.classList.remove('hidden'); jsonPreview.classList.add('hidden');
});

// ─── SCREEN 1 → 2 ───────────────────────────────────────────────────
generatePlanBtn.addEventListener('click', async () => {
    const btnText = generatePlanBtn.querySelector('.btn-text');
    const loader = generatePlanBtn.querySelector('.loader');
    btnText.textContent = "Extracting Academic Intelligence...";
    loader.classList.remove('hidden');
    generatePlanBtn.disabled = true;
    generatePlanBtn.style.opacity = '0.8';

    try {
        let result;
        if (uploadedPdfFile) {
            const fd = new FormData(); fd.append('pdf', uploadedPdfFile);
            const res = await fetch('/api/parse-syllabus-pdf', { method: 'POST', body: fd });
            result = await res.json();
            rawTextDisplay.textContent = result.extractedText || '[PDF text extracted]';
        } else {
            const text = syllabusInput.value.trim() || DEFAULT_INPUT;
            rawTextDisplay.textContent = text;
            const res = await fetch('/api/parse-syllabus', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syllabusText: text })
            });
            result = await res.json();
        }
        currentResponse = result;
    } catch (err) {
        console.warn('API failed, using mock:', err);
        currentResponse = { ...MOCK_RESPONSE, source: 'fallback' };
        rawTextDisplay.textContent = syllabusInput.value || DEFAULT_INPUT;
    }

    // Badge
    if (currentResponse.source === 'fallback') {
        parseBadge.classList.add('fallback');
        badgeText.textContent = 'Using Demo Data';
    } else {
        parseBadge.classList.remove('fallback');
        badgeText.textContent = 'AI Extraction Complete';
    }

    populateCards(currentResponse.courses);
    rawJsonDisplay.textContent = JSON.stringify(currentResponse, null, 2);
    toggleCardsBtn.classList.add('active'); toggleJsonBtn.classList.remove('active');
    jsonPreview.classList.remove('hidden'); rawJsonDisplay.classList.add('hidden');

    btnText.textContent = "Generate Academic Plan";
    loader.classList.add('hidden');
    generatePlanBtn.disabled = false;
    generatePlanBtn.style.opacity = '1';
    switchScreen(2);
});

// ─── EXTRACTION CARDS ────────────────────────────────────────────────
function populateCards(courses) {
    jsonPreview.innerHTML = courses.map((c, i) => {
        const conf = typeof c.confidence === 'number' ? c.confidence : 0.75;
        const confPct = Math.round(conf * 100);
        const confClass = conf >= 0.85 ? 'confidence-high' : (conf >= 0.70 ? 'confidence-mid' : 'confidence-low');

        let unitsHtml = '';
        if (c.units && c.units.length > 0) {
            const unitItems = c.units.map(u =>
                `<li><strong>${u.unit}:</strong> ${u.topics.join(', ')}</li>`
            ).join('');
            unitsHtml = `<details class="struct-units"><summary>${c.units.length} Unit(s)</summary><ul>${unitItems}</ul></details>`;
        }

        const codeLabel = c.course_code ? `<span style="color:var(--text-muted);font-size:0.6875rem">${c.course_code}</span>` : '';

        return `
        <div class="struct-card" style="animation-delay:${i * 0.06}s">
            <div class="struct-card-header">
                <span class="struct-type">${c.course_name || c.type} ${codeLabel}</span>
                <span class="tag ${(c.priority || 'medium').toLowerCase()}">${c.priority || 'Medium'}</span>
            </div>
            <div class="struct-row"><span>Credits:</span><strong>${c.credits || '—'}</strong></div>
            <div class="struct-row"><span>Type:</span><strong>${c.type || '—'}</strong></div>
            ${c.weight ? `<div class="struct-row"><span>Weight:</span><strong>${c.weight}</strong></div>` : ''}
            ${c.internal_marks ? `<div class="struct-row"><span>Internal:</span><strong>${c.internal_marks}</strong></div>` : ''}
            ${c.end_term_marks ? `<div class="struct-row"><span>End Term:</span><strong>${c.end_term_marks}</strong></div>` : ''}
            ${unitsHtml}
            <div class="confidence-badge ${confClass}"><span class="dot"></span>AI Confidence: ${confPct}%</div>
        </div>`;
    }).join('');
}

// ─── SCREEN 2 → 3 ───────────────────────────────────────────────────
generateTimelineBtn.addEventListener('click', () => {
    populateDashboard(currentResponse);
    switchScreen(3);
});

// ─── DASHBOARD ───────────────────────────────────────────────────────
function populateDashboard(resp) {
    const courses = resp.courses;
    const summary = resp.semester_summary || {};

    // ── Stats ──
    $('stat-courses').textContent = summary.total_courses || courses.length;
    $('stat-credits').textContent = summary.total_credits || courses.reduce((s, c) => s + (parseInt(c.credits) || 0), 0);
    $('stat-theory').textContent = summary.total_theory || courses.filter(c => c.type === 'theory').length;
    $('stat-labs').textContent = summary.total_labs || courses.filter(c => c.type === 'lab').length;

    const highEffort = courses.filter(c => (c.estimated_effort || '').toLowerCase() === 'high').length;
    const loadRatio = highEffort / Math.max(courses.length, 1);
    $('stat-workload').textContent = loadRatio >= 0.5 ? '🔴 Heavy' : (loadRatio >= 0.25 ? '🟡 Moderate' : '🟢 Light');

    // ── Charts ──
    renderCreditsChart(courses);
    renderUnitsChart(courses);

    // ── Priority ──
    const scored = courses.map(c => ({ ...c, score: computeScore(c) })).sort((a, b) => b.score - a.score);
    $('priority-list').innerHTML = scored.map(c => `
        <div class="priority-item" data-type="${c.category || c.type}">
            <div class="priority-title">${c.course_name || c.type}</div>
            <div class="priority-meta">
                <span>${c.date || c.credits + ' cr'}</span>
                <span class="weight-badge">${c.weight || ''}</span>
            </div>
            <div class="priority-score">Impact Score: ${c.score}</div>
        </div>
    `).join('');

    // ── Timeline ──
    const ordered = [...courses].sort((a, b) => {
        if (a.date && b.date) return new Date(a.date) - new Date(b.date);
        return (parseInt(b.credits) || 0) - (parseInt(a.credits) || 0);
    });
    $('timeline-view').innerHTML = ordered.map((c, i) => `
        <div class="timeline-event" style="animation-delay:${i * 0.06}s;transform:translateY(8px)">
            <div class="event-dot ${c.category || c.type}"></div>
            <div class="event-content">
                <div class="event-date">${c.date || c.course_code || c.type}</div>
                <div class="event-title">${c.course_name || c.type}</div>
            </div>
        </div>
    `).join('');

    // ── Busy Weeks ──
    renderBusyWeeks(courses);

    // ── Study Plan ──
    renderStudyPlan(courses);

    // ── AI Insights ──
    renderInsights(courses);
}

// ─── PRIORITY SCORE ──────────────────────────────────────────────────
function computeScore(c) {
    let score = parseInt(c.weight) || 0;
    score += (parseInt(c.credits) || 0) * 5;
    score += (c.units ? c.units.length : 0) * 3;
    if (c.date) {
        const days = Math.ceil((new Date(c.date) - new Date()) / 864e5);
        if (days <= 14) score += 30;
        else if (days <= 30) score += 20;
        else if (days <= 60) score += 10;
    }
    if ((c.estimated_effort || '').toLowerCase() === 'high') score += 10;
    return score;
}

// ─── CHARTS ──────────────────────────────────────────────────────────
function renderCreditsChart(courses) {
    const ctx = $('credits-chart').getContext('2d');
    const map = {};
    courses.forEach(c => { const n = c.course_name || c.type; map[n] = parseInt(c.credits) || 0; });
    if (creditsChart) creditsChart.destroy();
    creditsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(map),
            datasets: [{ data: Object.values(map), backgroundColor: ['#3B82F6', '#EF4444', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#6366F1', '#14B8A6'], borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: true, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 10, font: { family: 'Inter', size: 10, weight: '500' }, color: '#64748B' } } } }
    });
}

function renderUnitsChart(courses) {
    const ctx = $('units-chart').getContext('2d');
    const withUnits = courses.filter(c => c.units && c.units.length > 0);
    if (withUnits.length === 0) {
        ctx.canvas.parentElement.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem;text-align:center;padding:2rem 0">No unit data available</p>';
        return;
    }
    const labels = withUnits.map(c => c.course_code || c.course_name.slice(0, 12));
    const data = withUnits.map(c => c.units.length);
    if (unitsChart) unitsChart.destroy();
    unitsChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Units', data, backgroundColor: '#3B82F6', borderRadius: 4, barThickness: 24 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#F1F5F9' } }, x: { ticks: { font: { size: 9 } }, grid: { display: false } } } }
    });
}

// ─── BUSY WEEKS ──────────────────────────────────────────────────────
function renderBusyWeeks(courses) {
    const withDates = courses.filter(c => c.date);
    const el = $('busy-weeks-list');
    if (withDates.length === 0) {
        // For Indian syllabi without dates, show workload by credits
        const heavy = courses.filter(c => (parseInt(c.credits) || 0) >= 4).sort((a, b) => (parseInt(b.credits) || 0) - (parseInt(a.credits) || 0));
        if (heavy.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem">No deadline clusters detected.</p>'; return; }
        el.innerHTML = heavy.map(c => `
            <div class="busy-week-item high-load">
                <div class="busy-week-header">${c.course_name} <span class="load-tag high">${c.credits} cr</span></div>
                <div class="busy-week-detail">${c.units ? c.units.length + ' units' : ''} · ${c.estimated_effort || 'Medium'} effort</div>
                <div class="busy-week-bar"><div class="busy-week-bar-fill high" style="width:${Math.min(100, (parseInt(c.credits) / 5) * 100)}%"></div></div>
            </div>
        `).join('');
        return;
    }
    const weeks = {};
    withDates.forEach(c => {
        const d = new Date(c.date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d.setDate(diff)); const key = mon.toISOString().split('T')[0];
        if (!weeks[key]) weeks[key] = { tasks: [], weight: 0 };
        weeks[key].tasks.push(c); weeks[key].weight += parseInt(c.weight) || 0;
    });
    const sorted = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0]));
    const maxW = Math.max(...sorted.map(([, v]) => v.weight), 1);
    el.innerHTML = sorted.map(([k, v]) => {
        const lvl = v.weight >= 40 || v.tasks.length >= 3 ? 'high' : (v.weight >= 20 ? 'moderate' : 'normal');
        const cls = lvl === 'high' ? 'high-load' : (lvl === 'moderate' ? 'moderate-load' : '');
        const tag = lvl !== 'normal' ? `<span class="load-tag ${lvl}">${lvl === 'high' ? 'Busy' : 'Moderate'}</span>` : '';
        return `<div class="busy-week-item ${cls}">
            <div class="busy-week-header">Week of ${new Date(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${tag}</div>
            <div class="busy-week-detail">${v.tasks.length} task(s) · ${v.weight}% weight · ${v.tasks.map(t => t.course_name || t.type).join(', ')}</div>
            <div class="busy-week-bar"><div class="busy-week-bar-fill ${lvl}" style="width:${(v.weight / maxW * 100)}%"></div></div>
        </div>`;
    }).join('');
}

// ─── STUDY PLAN ──────────────────────────────────────────────────────
function renderStudyPlan(courses) {
    const el = $('study-plan-list');
    const withUnits = courses.filter(c => c.units && c.units.length > 0);

    if (withUnits.length === 0) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem">No unit-level data available for study planning.</p>';
        return;
    }

    // Flatten: each unit becomes a study block
    const blocks = [];
    withUnits.forEach(c => {
        c.units.forEach(u => {
            blocks.push({ course: c.course_code || c.course_name.slice(0, 15), unit: u.unit, topics: u.topics, type: c.type, color: c.type === 'lab' ? 'var(--lab)' : 'var(--primary)' });
        });
    });

    // Distribute 2 blocks per week
    const weeks = [];
    for (let i = 0; i < blocks.length; i += 2) {
        weeks.push(blocks.slice(i, i + 2));
    }

    // Add lab sessions at the end if labs exist
    const labs = courses.filter(c => c.type === 'lab');

    el.innerHTML = weeks.map((w, i) => `
        <div class="study-week-block">
            <div class="study-week-title">Week ${i + 1}–${i + 2}</div>
            <div class="study-week-items">
                ${w.map(b => `<div class="study-item"><span class="study-dot" style="background:${b.color}"></span>${b.course} — ${b.unit}</div>`).join('')}
            </div>
        </div>
    `).join('') + (labs.length > 0 ? `
        <div class="study-week-block" style="border-left-color:var(--lab)">
            <div class="study-week-title" style="color:var(--lab)">Ongoing Labs</div>
            <div class="study-week-items">
                ${labs.map(l => `<div class="study-item"><span class="study-dot" style="background:var(--lab)"></span>${l.course_name} (${l.credits} cr)</div>`).join('')}
            </div>
        </div>
    ` : '');
}

// ─── AI INSIGHTS ─────────────────────────────────────────────────────
function renderInsights(courses) {
    const el = $('insights-content');
    const insights = [];

    // 1. Heaviest syllabus (most units)
    const byUnits = [...courses].filter(c => c.units && c.units.length > 0).sort((a, b) => b.units.length - a.units.length);
    if (byUnits.length > 0) {
        const h = byUnits[0];
        const totalTopics = h.units.reduce((s, u) => s + u.topics.length, 0);
        insights.push({ icon: '📚', title: 'Heaviest Syllabus', value: h.course_name, desc: `${h.units.length} units, ${totalTopics} topics. This subject requires the most study time.`, cls: 'warning' });
    }

    // 2. Most difficult (highest effort + credits)
    const byDifficulty = [...courses].sort((a, b) => {
        const effortScore = e => ({ high: 3, medium: 2, low: 1 }[(e || 'medium').toLowerCase()] || 2);
        return (effortScore(b.estimated_effort) + (parseInt(b.credits) || 0)) - (effortScore(a.estimated_effort) + (parseInt(a.credits) || 0));
    });
    if (byDifficulty.length > 0) {
        const d = byDifficulty[0];
        insights.push({ icon: '🎯', title: 'Most Challenging Course', value: d.course_name, desc: `${d.credits} credits, ${d.estimated_effort || 'Medium'} effort. Allocate extra preparation time.`, cls: 'info' });
    }

    // 3. Recommended focus (top 2 by score)
    const topFocus = courses.map(c => ({ ...c, score: computeScore(c) })).sort((a, b) => b.score - a.score).slice(0, 2);
    if (topFocus.length > 0) {
        insights.push({ icon: '⭐', title: 'Recommended Focus', value: topFocus.map(c => c.course_name).join(', '), desc: 'These subjects have the highest impact scores. Prioritize them for best results.', cls: 'success' });
    }

    // 4. Lab workload
    const labs = courses.filter(c => c.type === 'lab');
    if (labs.length > 0) {
        insights.push({ icon: '🔬', title: 'Practical Workload', value: `${labs.length} Lab(s)`, desc: labs.map(l => l.course_name).join(', ') + '. Schedule regular lab practice sessions.', cls: 'purple' });
    }

    // 5. Confidence warning
    const lowConf = courses.filter(c => (c.confidence || 1) < 0.80);
    if (lowConf.length > 0) {
        insights.push({ icon: '⚠️', title: 'Low Confidence Extractions', value: `${lowConf.length} item(s)`, desc: lowConf.map(c => c.course_name).join(', ') + '. Please verify these entries manually.', cls: 'warning' });
    }

    // 6. Semester balance
    const theory = courses.filter(c => c.type === 'theory').length;
    const labCount = labs.length;
    const balance = theory > 0 && labCount > 0 ? 'Balanced' : (theory > 0 ? 'Theory-Heavy' : 'Lab-Heavy');
    insights.push({ icon: '⚖️', title: 'Semester Balance', value: balance, desc: `${theory} theory + ${labCount} lab${labCount !== 1 ? 's' : ''}. ${balance === 'Balanced' ? 'Good mix of theory and practical.' : 'Consider supplementing with self-study.'}`, cls: 'info' });

    el.innerHTML = insights.map(i => `
        <div class="insight-card ${i.cls}">
            <div class="insight-icon">${i.icon}</div>
            <div class="insight-title">${i.title}</div>
            <div class="insight-value">${i.value}</div>
            <div class="insight-desc">${i.desc}</div>
        </div>
    `).join('');
}

// ─── RESET ───────────────────────────────────────────────────────────
topNavBtn.addEventListener('click', () => {
    switchScreen(1);
    setTimeout(() => {
        syllabusInput.value = '';
        syllabusInput.focus();
        uploadedPdfFile = null;
        pdfFilename.classList.add('hidden');
        pdfInput.value = '';
        currentResponse = null;
    }, 400);
});
