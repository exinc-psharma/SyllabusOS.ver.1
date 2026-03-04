// ─── STATE ───────────────────────────────────────────────────────────
let currentResponse = null;
let currentRawText = '';
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
const logoHome = $('logo-home');
const historyBtn = $('history-btn');
const drawerOverlay = $('drawer-overlay');
const historyDrawer = $('history-drawer');
const drawerClose = $('drawer-close');
const drawerList = $('drawer-list');
const saveBtn = $('save-syllabus-btn');
const saveModal = $('save-modal');
const saveNameInput = $('save-name-input');
const saveCancel = $('save-cancel');
const saveConfirm = $('save-confirm');
const toastContainer = $('toast-container');

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

// ─── TOAST SYSTEM ────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

// ─── LOGO → HOME ────────────────────────────────────────────────────
logoHome.addEventListener('click', () => {
    switchScreen(1);
    setTimeout(() => {
        syllabusInput.value = '';
        syllabusInput.focus();
        uploadedPdfFile = null;
        pdfFilename.classList.add('hidden');
        pdfInput.value = '';
        currentResponse = null;
        currentRawText = '';
    }, 400);
});

// ─── NEW SYLLABUS BUTTON ─────────────────────────────────────────────
topNavBtn.addEventListener('click', () => {
    switchScreen(1);
    setTimeout(() => {
        syllabusInput.value = '';
        syllabusInput.focus();
        uploadedPdfFile = null;
        pdfFilename.classList.add('hidden');
        pdfInput.value = '';
        currentResponse = null;
        currentRawText = '';
    }, 400);
});

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
    showToast(`PDF selected: ${file.name}`, 'info');
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

// ─── SCREEN 1 → 2 (PARSE) ───────────────────────────────────────────
generatePlanBtn.addEventListener('click', async () => {
    const text = syllabusInput.value.trim();
    if (!text && !uploadedPdfFile) {
        showToast('Please paste syllabus text or upload a PDF.', 'error');
        return;
    }

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
            currentRawText = result.extractedText || '[PDF text extracted]';
            rawTextDisplay.textContent = currentRawText;
        } else {
            currentRawText = text;
            rawTextDisplay.textContent = text;
            const res = await fetch('/api/parse-syllabus', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syllabusText: text })
            });
            result = await res.json();
        }
        currentResponse = result;
    } catch (err) {
        console.warn('API failed:', err);
        currentResponse = { format: 'fallback', source: 'fallback', semester_summary: { total_courses: 0, total_credits: 0, total_theory: 0, total_labs: 0 }, courses: [] };
        currentRawText = text || '[PDF text]';
        rawTextDisplay.textContent = currentRawText;
    }

    // Badge
    if (currentResponse.source === 'fallback') {
        parseBadge.classList.add('fallback');
        badgeText.textContent = 'Using Demo Data';
        showToast('AI parsing failed — using demo data.', 'error');
    } else {
        parseBadge.classList.remove('fallback');
        badgeText.textContent = 'AI Extraction Complete';
        showToast(`Extracted ${currentResponse.courses?.length || 0} items successfully!`, 'success');
    }

    populateCards(currentResponse.courses || []);
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
            const unitItems = c.units.map(u => `<li><strong>${u.unit}:</strong> ${u.topics.join(', ')}</li>`).join('');
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

// ─── SAVE MODAL ──────────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
    saveModal.classList.remove('hidden');
    saveNameInput.value = '';
    saveNameInput.focus();
});
saveCancel.addEventListener('click', () => saveModal.classList.add('hidden'));
saveModal.addEventListener('click', e => { if (e.target === saveModal) saveModal.classList.add('hidden'); });

saveConfirm.addEventListener('click', async () => {
    const name = saveNameInput.value.trim() || 'Untitled Syllabus';
    try {
        const res = await fetch('/api/syllabi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, rawText: currentRawText, result: currentResponse })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`"${name}" saved!`, 'success');
        } else {
            showToast('Failed to save.', 'error');
        }
    } catch (err) {
        showToast('Save failed — server error.', 'error');
    }
    saveModal.classList.add('hidden');
});

// ─── HISTORY DRAWER ──────────────────────────────────────────────────
function openDrawer() {
    historyDrawer.classList.add('open');
    drawerOverlay.classList.add('open');
    loadHistory();
}
function closeDrawer() {
    historyDrawer.classList.remove('open');
    drawerOverlay.classList.remove('open');
}

historyBtn.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

async function loadHistory() {
    drawerList.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8125rem">Loading...</p>';
    try {
        const res = await fetch('/api/syllabi');
        const list = await res.json();
        if (list.length === 0) {
            drawerList.innerHTML = `<div class="history-empty">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p>No saved syllabi yet.</p><p style="font-size:0.75rem">Parse a syllabus and click Save.</p>
            </div>`;
            return;
        }
        drawerList.innerHTML = list.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="history-item-name">${item.name}</div>
                <div class="history-item-meta">
                    <span>${item.courseCount} course${item.courseCount !== 1 ? 's' : ''} · ${item.credits} cr</span>
                    <span>${new Date(item.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
                <div class="history-item-actions">
                    <button class="history-delete" data-id="${item.id}" onclick="event.stopPropagation()">Delete</button>
                </div>
            </div>
        `).join('');

        // Click to load
        drawerList.querySelectorAll('.history-item').forEach(el => {
            el.addEventListener('click', () => loadSavedSyllabus(el.dataset.id));
        });
        // Delete
        drawerList.querySelectorAll('.history-delete').forEach(el => {
            el.addEventListener('click', (e) => deleteSyllabus(e.target.dataset.id));
        });
    } catch (err) {
        drawerList.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--exam)">Failed to load history.</p>';
    }
}

async function loadSavedSyllabus(id) {
    try {
        const res = await fetch(`/api/syllabi/${id}`);
        const saved = await res.json();
        currentResponse = saved.result;
        currentRawText = saved.rawText || '';
        rawTextDisplay.textContent = currentRawText;

        // Populate Screen 2
        populateCards(currentResponse.courses || []);
        rawJsonDisplay.textContent = JSON.stringify(currentResponse, null, 2);
        parseBadge.classList.remove('fallback');
        badgeText.textContent = 'Loaded from History';

        // Also populate dashboard
        populateDashboard(currentResponse);

        closeDrawer();
        switchScreen(3);
        showToast(`Loaded "${saved.name}"`, 'success');
    } catch (err) {
        showToast('Failed to load syllabus.', 'error');
    }
}

async function deleteSyllabus(id) {
    try {
        await fetch(`/api/syllabi/${id}`, { method: 'DELETE' });
        showToast('Deleted.', 'info');
        loadHistory();
    } catch (err) {
        showToast('Delete failed.', 'error');
    }
}

// ─── SCREEN 2 → 3 ───────────────────────────────────────────────────
generateTimelineBtn.addEventListener('click', () => {
    populateDashboard(currentResponse);
    switchScreen(3);
});

// ─── DASHBOARD ───────────────────────────────────────────────────────
function populateDashboard(resp) {
    const courses = resp.courses || [];
    const summary = resp.semester_summary || {};

    $('stat-courses').textContent = summary.total_courses || courses.length;
    $('stat-credits').textContent = summary.total_credits || courses.reduce((s, c) => s + (parseInt(c.credits) || 0), 0);
    $('stat-theory').textContent = summary.total_theory || courses.filter(c => c.type === 'theory').length;
    $('stat-labs').textContent = summary.total_labs || courses.filter(c => c.type === 'lab').length;

    const highEffort = courses.filter(c => (c.estimated_effort || '').toLowerCase() === 'high').length;
    const loadRatio = highEffort / Math.max(courses.length, 1);
    $('stat-workload').textContent = loadRatio >= 0.5 ? '🔴 Heavy' : (loadRatio >= 0.25 ? '🟡 Moderate' : '🟢 Light');

    renderCreditsChart(courses);
    renderUnitsChart(courses);

    const scored = courses.map(c => ({ ...c, score: computeScore(c) })).sort((a, b) => b.score - a.score);
    $('priority-list').innerHTML = scored.map(c => `
        <div class="priority-item" data-type="${c.category || c.type}">
            <div class="priority-title">${c.course_name || c.type}</div>
            <div class="priority-meta"><span>${c.date || c.credits + ' cr'}</span><span class="weight-badge">${c.weight || ''}</span></div>
            <div class="priority-score">Impact Score: ${c.score}</div>
        </div>
    `).join('');

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

    renderBusyWeeks(courses);
    renderStudyPlan(courses);
    renderInsights(courses);
}

function computeScore(c) {
    let s = parseInt(c.weight) || 0;
    s += (parseInt(c.credits) || 0) * 5;
    s += (c.units ? c.units.length : 0) * 3;
    if (c.date) { const d = Math.ceil((new Date(c.date) - new Date()) / 864e5); if (d <= 14) s += 30; else if (d <= 30) s += 20; else if (d <= 60) s += 10; }
    if ((c.estimated_effort || '').toLowerCase() === 'high') s += 10;
    return s;
}

// ─── CHARTS ──────────────────────────────────────────────────────────
function renderCreditsChart(courses) {
    const ctx = $('credits-chart').getContext('2d');
    const map = {}; courses.forEach(c => { map[c.course_name || c.type] = parseInt(c.credits) || 0; });
    if (creditsChart) creditsChart.destroy();
    creditsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(map), datasets: [{ data: Object.values(map), backgroundColor: ['#3B82F6', '#EF4444', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#6366F1', '#14B8A6'], borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 10, font: { family: 'Inter', size: 10, weight: '500' }, color: '#64748B' } } } }
    });
}

function renderUnitsChart(courses) {
    const ctx = $('units-chart').getContext('2d');
    const withUnits = courses.filter(c => c.units && c.units.length > 0);
    if (withUnits.length === 0) { ctx.canvas.parentElement.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem;text-align:center;padding:2rem 0">No unit data available</p>'; return; }
    if (unitsChart) unitsChart.destroy();
    unitsChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: withUnits.map(c => c.course_code || c.course_name.slice(0, 12)), datasets: [{ label: 'Units', data: withUnits.map(c => c.units.length), backgroundColor: '#3B82F6', borderRadius: 4, barThickness: 24 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#F1F5F9' } }, x: { ticks: { font: { size: 9 } }, grid: { display: false } } } }
    });
}

// ─── BUSY WEEKS ──────────────────────────────────────────────────────
function renderBusyWeeks(courses) {
    const withDates = courses.filter(c => c.date);
    const el = $('busy-weeks-list');
    if (withDates.length === 0) {
        const heavy = courses.filter(c => (parseInt(c.credits) || 0) >= 4).sort((a, b) => (parseInt(b.credits) || 0) - (parseInt(a.credits) || 0));
        if (heavy.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem">No workload data detected.</p>'; return; }
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
    withDates.forEach(c => { const d = new Date(c.date); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); const mon = new Date(d.setDate(diff)); const key = mon.toISOString().split('T')[0]; if (!weeks[key]) weeks[key] = { tasks: [], weight: 0 }; weeks[key].tasks.push(c); weeks[key].weight += parseInt(c.weight) || 0; });
    const sorted = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0]));
    const maxW = Math.max(...sorted.map(([, v]) => v.weight), 1);
    el.innerHTML = sorted.map(([k, v]) => {
        const lvl = v.weight >= 40 || v.tasks.length >= 3 ? 'high' : (v.weight >= 20 ? 'moderate' : 'normal');
        const cls = lvl === 'high' ? 'high-load' : (lvl === 'moderate' ? 'moderate-load' : '');
        const tag = lvl !== 'normal' ? `<span class="load-tag ${lvl}">${lvl === 'high' ? 'Busy' : 'Moderate'}</span>` : '';
        return `<div class="busy-week-item ${cls}"><div class="busy-week-header">Week of ${new Date(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${tag}</div><div class="busy-week-detail">${v.tasks.length} task(s) · ${v.weight}% weight</div><div class="busy-week-bar"><div class="busy-week-bar-fill ${lvl}" style="width:${(v.weight / maxW * 100)}%"></div></div></div>`;
    }).join('');
}

// ─── STUDY PLAN ──────────────────────────────────────────────────────
function renderStudyPlan(courses) {
    const el = $('study-plan-list');
    const withUnits = courses.filter(c => c.units && c.units.length > 0);
    if (withUnits.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem">No unit data for study planning.</p>'; return; }
    const blocks = [];
    withUnits.forEach(c => { c.units.forEach(u => { blocks.push({ course: c.course_code || c.course_name.slice(0, 15), unit: u.unit, color: c.type === 'lab' ? 'var(--lab)' : 'var(--primary)' }); }); });
    const weeks = [];
    for (let i = 0; i < blocks.length; i += 2) weeks.push(blocks.slice(i, i + 2));
    const labs = courses.filter(c => c.type === 'lab');
    el.innerHTML = weeks.map((w, i) => `
        <div class="study-week-block">
            <div class="study-week-title">Week ${i + 1}–${i + 2}</div>
            <div class="study-week-items">${w.map(b => `<div class="study-item"><span class="study-dot" style="background:${b.color}"></span>${b.course} — ${b.unit}</div>`).join('')}</div>
        </div>
    `).join('') + (labs.length > 0 ? `<div class="study-week-block" style="border-left-color:var(--lab)"><div class="study-week-title" style="color:var(--lab)">Ongoing Labs</div><div class="study-week-items">${labs.map(l => `<div class="study-item"><span class="study-dot" style="background:var(--lab)"></span>${l.course_name} (${l.credits} cr)</div>`).join('')}</div></div>` : '');
}

// ─── AI INSIGHTS ─────────────────────────────────────────────────────
function renderInsights(courses) {
    const el = $('insights-content');
    const insights = [];
    const byUnits = [...courses].filter(c => c.units && c.units.length > 0).sort((a, b) => b.units.length - a.units.length);
    if (byUnits.length > 0) { const h = byUnits[0]; const t = h.units.reduce((s, u) => s + u.topics.length, 0); insights.push({ icon: '📚', title: 'Heaviest Syllabus', value: h.course_name, desc: `${h.units.length} units, ${t} topics. Needs the most study time.`, cls: 'warning' }); }
    const byDiff = [...courses].sort((a, b) => { const e = x => ({ high: 3, medium: 2, low: 1 }[(x || 'medium').toLowerCase()] || 2); return (e(b.estimated_effort) + (parseInt(b.credits) || 0)) - (e(a.estimated_effort) + (parseInt(a.credits) || 0)); });
    if (byDiff.length > 0) { const d = byDiff[0]; insights.push({ icon: '🎯', title: 'Most Challenging', value: d.course_name, desc: `${d.credits} credits, ${d.estimated_effort || 'Medium'} effort.`, cls: 'info' }); }
    const topFocus = courses.map(c => ({ ...c, score: computeScore(c) })).sort((a, b) => b.score - a.score).slice(0, 2);
    if (topFocus.length > 0) insights.push({ icon: '⭐', title: 'Recommended Focus', value: topFocus.map(c => c.course_name).join(', '), desc: 'Highest impact scores — prioritize these.', cls: 'success' });
    const labs = courses.filter(c => c.type === 'lab');
    if (labs.length > 0) insights.push({ icon: '🔬', title: 'Practical Workload', value: `${labs.length} Lab(s)`, desc: labs.map(l => l.course_name).join(', '), cls: 'purple' });
    const lowConf = courses.filter(c => (c.confidence || 1) < 0.80);
    if (lowConf.length > 0) insights.push({ icon: '⚠️', title: 'Low Confidence', value: `${lowConf.length} item(s)`, desc: 'Verify these entries manually.', cls: 'warning' });
    const theory = courses.filter(c => c.type === 'theory').length;
    const balance = theory > 0 && labs.length > 0 ? 'Balanced' : (theory > 0 ? 'Theory-Heavy' : 'Lab-Heavy');
    insights.push({ icon: '⚖️', title: 'Semester Balance', value: balance, desc: `${theory} theory + ${labs.length} lab(s).`, cls: 'info' });
    el.innerHTML = insights.map(i => `<div class="insight-card ${i.cls}"><div class="insight-icon">${i.icon}</div><div class="insight-title">${i.title}</div><div class="insight-value">${i.value}</div><div class="insight-desc">${i.desc}</div></div>`).join('');
}
