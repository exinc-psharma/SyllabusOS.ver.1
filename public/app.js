// ─── STATE ───────────────────────────────────────────────────────────
let currentResponse = null;
let currentRawText = '';
let uploadedPdfFile = null;
let creditsChart = null;
let unitsChart = null;

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
const saveDashboardBtn = $('save-dashboard-btn');
const saveModal = $('save-modal');
const saveNameInput = $('save-name-input');
const saveCancel = $('save-cancel');
const saveConfirm = $('save-confirm');
const toastContainer = $('toast-container');

const screens = { 1: $('screen-1'), 2: $('screen-2'), 3: $('screen-3') };

// ─── SCREEN SWITCH ───────────────────────────────────────────────────
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

// ─── TOAST ───────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

// ─── MODE DETECTION ──────────────────────────────────────────────────
function detectMode(resp) {
    const hasCourses = resp.courses && resp.courses.length > 0;
    const hasDeliverables = resp.deliverables && resp.deliverables.length > 0;
    if (hasCourses && hasDeliverables) return 'mixed';
    if (hasDeliverables) return 'deadline';
    return 'curriculum';
}

// ─── NAV ─────────────────────────────────────────────────────────────
function goHome() {
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
}
logoHome.addEventListener('click', goHome);
topNavBtn.addEventListener('click', goHome);

// ─── PDF ─────────────────────────────────────────────────────────────
// Note: uploadZone is now a <label for="pdf-input">, so clicking it opens the file picker natively.
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
    showToast(`PDF: ${file.name}`, 'info');
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

// ─── PARSE (Screen 1 → 2) ───────────────────────────────────────────
generatePlanBtn.addEventListener('click', async () => {
    const text = syllabusInput.value.trim();
    if (!text && !uploadedPdfFile) { showToast('Please paste syllabus text or upload a PDF.', 'error'); return; }

    const btnText = generatePlanBtn.querySelector('.btn-text');
    const loader = generatePlanBtn.querySelector('.loader');
    btnText.textContent = "Analyzing Syllabus...";
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
        } else {
            currentRawText = text;
            const res = await fetch('/api/parse-syllabus', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syllabusText: text })
            });
            result = await res.json();
        }
        currentResponse = result;
    } catch (err) {
        console.warn('API failed:', err);
        currentResponse = { source: 'fallback', summary: { total_courses: 0, total_credits: 0 }, courses: [], deliverables: [] };
        currentRawText = text || '';
    }

    rawTextDisplay.textContent = currentRawText;

    if (currentResponse.source === 'fallback') {
        parseBadge.classList.add('fallback'); badgeText.textContent = 'Using Demo Data';
        const reason = currentResponse.error_reason || '';
        if (reason.includes('rate_limit')) {
            showToast('Groq rate limit hit — try again in ~1 hour, or upgrade your Groq plan.', 'error');
        } else {
            showToast('AI failed — using demo data. ' + (reason ? '(' + reason.slice(0, 80) + ')' : ''), 'error');
        }
    } else {
        parseBadge.classList.remove('fallback'); badgeText.textContent = 'AI Extraction Complete';
        const cc = (currentResponse.courses || []).length;
        const dc = (currentResponse.deliverables || []).length;
        showToast(`Extracted ${cc} course(s), ${dc} deliverable(s)!`, 'success');
    }

    populateCards(currentResponse);
    rawJsonDisplay.textContent = JSON.stringify(currentResponse, null, 2);
    toggleCardsBtn.classList.add('active'); toggleJsonBtn.classList.remove('active');
    jsonPreview.classList.remove('hidden'); rawJsonDisplay.classList.add('hidden');

    btnText.textContent = "Generate Academic Plan";
    loader.classList.add('hidden');
    generatePlanBtn.disabled = false;
    generatePlanBtn.style.opacity = '1';
    switchScreen(2);
});

// ─── EXTRACTION CARDS (both courses + deliverables) ──────────────────
function populateCards(resp) {
    let html = '';
    const courses = resp.courses || [];
    const deliverables = resp.deliverables || [];

    if (courses.length > 0) {
        html += '<div style="font-size:0.6875rem;font-weight:600;color:var(--primary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.375rem">📚 Courses</div>';
        html += courses.map((c, i) => {
            const conf = typeof c.confidence === 'number' ? c.confidence : 0.75;
            const confPct = Math.round(conf * 100);
            const confCls = conf >= 0.85 ? 'confidence-high' : (conf >= 0.70 ? 'confidence-mid' : 'confidence-low');
            let unitsHtml = '';
            if (c.units && c.units.length > 0) {
                unitsHtml = `<details class="struct-units"><summary>${c.units.length} Unit(s)</summary><ul>${c.units.map(u => `<li><strong>${u.unit}:</strong> ${u.topics.join(', ')}</li>`).join('')}</ul></details>`;
            }
            const code = c.course_code ? `<span style="color:var(--text-muted);font-size:0.6875rem">${c.course_code}</span>` : '';
            return `<div class="struct-card" style="animation-delay:${i * 0.06}s">
                <div class="struct-card-header"><span class="struct-type">${c.course_name} ${code}</span><span class="tag ${(c.category || 'core').toLowerCase()}">${c.type || c.category}</span></div>
                <div class="struct-row"><span>Credits:</span><strong>${c.credits || '—'}</strong></div>
                ${c.internal_marks ? `<div class="struct-row"><span>Internal:</span><strong>${c.internal_marks}</strong></div>` : ''}
                ${c.end_term_marks ? `<div class="struct-row"><span>End Term:</span><strong>${c.end_term_marks}</strong></div>` : ''}
                ${unitsHtml}
                <div class="confidence-badge ${confCls}"><span class="dot"></span>AI Confidence: ${confPct}%</div>
            </div>`;
        }).join('');
    }

    if (deliverables.length > 0) {
        html += '<div style="font-size:0.6875rem;font-weight:600;color:var(--exam);text-transform:uppercase;letter-spacing:0.05em;margin:0.75rem 0 0.375rem">📋 Deliverables</div>';
        html += deliverables.map((d, i) => {
            const conf = typeof d.confidence === 'number' ? d.confidence : 0.75;
            const confPct = Math.round(conf * 100);
            const confCls = conf >= 0.85 ? 'confidence-high' : (conf >= 0.70 ? 'confidence-mid' : 'confidence-low');
            return `<div class="struct-card" style="animation-delay:${(courses.length + i) * 0.06}s">
                <div class="struct-card-header"><span class="struct-type">${d.name || d.type}</span><span class="tag ${(d.priority || 'medium').toLowerCase()}">${d.priority || 'Medium'}</span></div>
                ${d.date ? `<div class="struct-row"><span>Date:</span><strong>${d.date}</strong></div>` : ''}
                ${d.weight ? `<div class="struct-row"><span>Weight:</span><strong>${d.weight}</strong></div>` : ''}
                <div class="struct-row"><span>Category:</span><strong>${d.category || d.type}</strong></div>
                <div class="confidence-badge ${confCls}"><span class="dot"></span>AI Confidence: ${confPct}%</div>
            </div>`;
        }).join('');
    }

    jsonPreview.innerHTML = html || '<p style="color:var(--text-muted)">No data extracted.</p>';
}

// ─── SAVE MODAL ──────────────────────────────────────────────────────
function openSaveModal() { saveModal.classList.remove('hidden'); saveNameInput.value = ''; saveNameInput.focus(); }
saveBtn.addEventListener('click', openSaveModal);
saveDashboardBtn.addEventListener('click', openSaveModal);
saveCancel.addEventListener('click', () => saveModal.classList.add('hidden'));
saveModal.addEventListener('click', e => { if (e.target === saveModal) saveModal.classList.add('hidden'); });

saveConfirm.addEventListener('click', async () => {
    const name = saveNameInput.value.trim() || 'Untitled Syllabus';
    try {
        const res = await fetch('/api/syllabi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, rawText: currentRawText, result: currentResponse }) });
        const data = await res.json();
        showToast(data.success ? `"${name}" saved!` : 'Save failed.', data.success ? 'success' : 'error');
    } catch { showToast('Save failed.', 'error'); }
    saveModal.classList.add('hidden');
});

// ─── HISTORY ─────────────────────────────────────────────────────────
function openDrawer() { historyDrawer.classList.add('open'); drawerOverlay.classList.add('open'); loadHistory(); }
function closeDrawer() { historyDrawer.classList.remove('open'); drawerOverlay.classList.remove('open'); }
historyBtn.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

async function loadHistory() {
    drawerList.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8125rem">Loading...</p>';
    try {
        const res = await fetch('/api/syllabi');
        const list = await res.json();
        if (list.length === 0) {
            drawerList.innerHTML = '<div class="history-empty"><p>No saved syllabi yet.</p><p style="font-size:0.75rem">Parse a syllabus and click Save.</p></div>';
            return;
        }
        drawerList.innerHTML = list.map(item => `
            <div class="history-item" data-id="${item.id}">
                <div class="history-item-name">${item.name}</div>
                <div class="history-item-meta">
                    <span>${item.courseCount} course(s) · ${item.deliverableCount || 0} task(s)</span>
                    <span>${new Date(item.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
                <div class="history-item-actions"><button class="history-delete" data-id="${item.id}" onclick="event.stopPropagation()">Delete</button></div>
            </div>
        `).join('');
        drawerList.querySelectorAll('.history-item').forEach(el => el.addEventListener('click', () => loadSaved(el.dataset.id)));
        drawerList.querySelectorAll('.history-delete').forEach(el => el.addEventListener('click', () => deleteSaved(el.dataset.id)));
    } catch { drawerList.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--exam)">Failed to load.</p>'; }
}

async function loadSaved(id) {
    try {
        const res = await fetch(`/api/syllabi/${id}`);
        const saved = await res.json();
        currentResponse = saved.result;
        currentRawText = saved.rawText || '';
        rawTextDisplay.textContent = currentRawText;
        populateCards(currentResponse);
        rawJsonDisplay.textContent = JSON.stringify(currentResponse, null, 2);
        parseBadge.classList.remove('fallback'); badgeText.textContent = 'Loaded from History';
        populateDashboard(currentResponse);
        closeDrawer();
        switchScreen(3);
        showToast(`Loaded "${saved.name}"`, 'success');
    } catch { showToast('Failed to load.', 'error'); }
}

async function deleteSaved(id) {
    try { await fetch(`/api/syllabi/${id}`, { method: 'DELETE' }); showToast('Deleted.', 'info'); loadHistory(); }
    catch { showToast('Delete failed.', 'error'); }
}

// ─── Screen 2 → 3 ───────────────────────────────────────────────────
generateTimelineBtn.addEventListener('click', () => { populateDashboard(currentResponse); switchScreen(3); });

// ─── DASHBOARD (auto-detects mode) ──────────────────────────────────
function populateDashboard(resp) {
    const courses = resp.courses || [];
    const deliverables = resp.deliverables || [];
    const summary = resp.summary || {};
    const mode = detectMode(resp);

    // ── Stats ──
    $('stat-courses').textContent = summary.total_courses || courses.length || deliverables.length;
    $('stat-credits').textContent = summary.total_credits || courses.reduce((s, c) => s + (parseInt(c.credits) || 0), 0);
    $('stat-theory').textContent = summary.total_theory || courses.filter(c => c.type === 'theory').length;
    $('stat-labs').textContent = summary.total_labs || courses.filter(c => c.type === 'lab').length;

    const allItems = [...courses, ...deliverables];
    const highEffort = allItems.filter(c => (c.estimated_effort || '').toLowerCase() === 'high').length;
    const loadRatio = highEffort / Math.max(allItems.length, 1);
    $('stat-workload').textContent = loadRatio >= 0.5 ? '🔴 Heavy' : (loadRatio >= 0.25 ? '🟡 Moderate' : '🟢 Light');

    // ── Charts ──
    if (courses.length > 0) {
        renderCreditsChart(courses);
        renderUnitsChart(courses);
    } else {
        renderWeightChart(deliverables);
        renderCategoryChart(deliverables);
    }

    // ── Priority ──
    const scored = allItems.map(c => ({ ...c, score: computeScore(c) })).sort((a, b) => b.score - a.score);
    $('priority-list').innerHTML = scored.map(c => `
        <div class="priority-item" data-type="${c.category || c.type}">
            <div class="priority-title">${c.course_name || c.name || c.type}</div>
            <div class="priority-meta"><span>${c.date || (c.credits ? c.credits + ' cr' : '')}</span><span class="weight-badge">${c.weight || ''}</span></div>
            <div class="priority-score">Impact Score: ${c.score}</div>
        </div>
    `).join('');

    // ── Timeline ──
    if (mode === 'deadline' || mode === 'mixed') {
        const items = deliverables.length > 0 ? deliverables : courses;
        const ordered = [...items].sort((a, b) => {
            if (a.date && b.date) return new Date(a.date) - new Date(b.date);
            return 0;
        });
        $('timeline-view').innerHTML = ordered.map((c, i) => `
            <div class="timeline-event" style="animation-delay:${i * 0.06}s;transform:translateY(8px)">
                <div class="event-dot ${c.category || c.type}"></div>
                <div class="event-content">
                    <div class="event-date">${c.date || c.course_code || c.type}</div>
                    <div class="event-title">${c.name || c.course_name || c.type}</div>
                </div>
            </div>
        `).join('');
    } else {
        const ordered = [...courses].sort((a, b) => (parseInt(b.credits) || 0) - (parseInt(a.credits) || 0));
        $('timeline-view').innerHTML = ordered.map((c, i) => `
            <div class="timeline-event" style="animation-delay:${i * 0.06}s;transform:translateY(8px)">
                <div class="event-dot ${c.type || c.category}"></div>
                <div class="event-content">
                    <div class="event-date">${c.course_code || c.type} · ${c.credits || '?'} cr</div>
                    <div class="event-title">${c.course_name}</div>
                </div>
            </div>
        `).join('');
    }

    renderBusyWeeks(courses, deliverables, mode);
    renderStudyPlan(courses);
    renderInsights(courses, deliverables, mode);
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
const COLORS = ['#3B82F6', '#EF4444', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#6366F1', '#14B8A6'];

function renderCreditsChart(courses) {
    const ctx = $('credits-chart').getContext('2d');
    const map = {}; courses.forEach(c => { map[c.course_name || c.type] = parseInt(c.credits) || 0; });
    if (creditsChart) creditsChart.destroy();
    creditsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(map), datasets: [{ data: Object.values(map), backgroundColor: COLORS, borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
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

function renderWeightChart(deliverables) {
    const ctx = $('credits-chart').getContext('2d');
    const map = {}; deliverables.forEach(d => { map[d.name || d.type] = parseInt(d.weight) || 0; });
    if (creditsChart) creditsChart.destroy();
    creditsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(map), datasets: [{ data: Object.values(map), backgroundColor: COLORS, borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 10, font: { family: 'Inter', size: 10, weight: '500' }, color: '#64748B' } } } }
    });
}

function renderCategoryChart(deliverables) {
    const ctx = $('units-chart').getContext('2d');
    const catMap = {}; deliverables.forEach(d => { const c = d.category || d.type || 'other'; catMap[c] = (catMap[c] || 0) + 1; });
    if (unitsChart) unitsChart.destroy();
    unitsChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: Object.keys(catMap).map(k => k.charAt(0).toUpperCase() + k.slice(1)), datasets: [{ label: 'Count', data: Object.values(catMap), backgroundColor: COLORS, borderRadius: 4, barThickness: 24 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: '#F1F5F9' } }, x: { ticks: { font: { size: 9 } }, grid: { display: false } } } }
    });
}

// ─── BUSY WEEKS ──────────────────────────────────────────────────────
function renderBusyWeeks(courses, deliverables, mode) {
    const el = $('busy-weeks-list');
    if (mode === 'deadline' || mode === 'mixed') {
        const withDates = deliverables.filter(d => d.date);
        if (withDates.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem">No deadline data.</p>'; return; }
        const weeks = {};
        withDates.forEach(d => { const dt = new Date(d.date); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); const mon = new Date(dt.setDate(diff)); const key = mon.toISOString().split('T')[0]; if (!weeks[key]) weeks[key] = { tasks: [], weight: 0 }; weeks[key].tasks.push(d); weeks[key].weight += parseInt(d.weight) || 0; });
        const sorted = Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0]));
        const maxW = Math.max(...sorted.map(([, v]) => v.weight), 1);
        el.innerHTML = sorted.map(([k, v]) => {
            const lvl = v.weight >= 40 || v.tasks.length >= 3 ? 'high' : (v.weight >= 20 ? 'moderate' : 'normal');
            const cls = lvl === 'high' ? 'high-load' : (lvl === 'moderate' ? 'moderate-load' : '');
            const tag = lvl !== 'normal' ? `<span class="load-tag ${lvl}">${lvl === 'high' ? 'Busy' : 'Moderate'}</span>` : '';
            return `<div class="busy-week-item ${cls}"><div class="busy-week-header">Week of ${new Date(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${tag}</div><div class="busy-week-detail">${v.tasks.length} task(s) · ${v.weight}% weight</div><div class="busy-week-bar"><div class="busy-week-bar-fill ${lvl}" style="width:${(v.weight / maxW * 100)}%"></div></div></div>`;
        }).join('');
    } else {
        const heavy = courses.filter(c => (parseInt(c.credits) || 0) >= 3).sort((a, b) => (parseInt(b.credits) || 0) - (parseInt(a.credits) || 0));
        if (heavy.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem">No workload data.</p>'; return; }
        el.innerHTML = heavy.map(c => `
            <div class="busy-week-item high-load">
                <div class="busy-week-header">${c.course_name} <span class="load-tag high">${c.credits} cr</span></div>
                <div class="busy-week-detail">${c.units ? c.units.length + ' units' : ''} · ${c.estimated_effort || 'Medium'} effort</div>
                <div class="busy-week-bar"><div class="busy-week-bar-fill high" style="width:${Math.min(100, (parseInt(c.credits) / 5) * 100)}%"></div></div>
            </div>
        `).join('');
    }
}

// ─── STUDY PLAN ──────────────────────────────────────────────────────
function renderStudyPlan(courses) {
    const el = $('study-plan-list');
    const withUnits = courses.filter(c => c.units && c.units.length > 0);
    if (withUnits.length === 0) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.8125rem">No unit data for planning.</p>'; return; }
    const blocks = [];
    withUnits.forEach(c => c.units.forEach(u => blocks.push({ course: c.course_code || c.course_name.slice(0, 15), unit: u.unit, color: c.type === 'lab' ? 'var(--lab)' : 'var(--primary)' })));
    const weeks = [];
    for (let i = 0; i < blocks.length; i += 2) weeks.push(blocks.slice(i, i + 2));
    const labs = courses.filter(c => c.type === 'lab');
    el.innerHTML = weeks.map((w, i) => `
        <div class="study-week-block"><div class="study-week-title">Week ${i + 1}–${i + 2}</div><div class="study-week-items">${w.map(b => `<div class="study-item"><span class="study-dot" style="background:${b.color}"></span>${b.course} — ${b.unit}</div>`).join('')}</div></div>
    `).join('') + (labs.length > 0 ? `<div class="study-week-block" style="border-left-color:var(--lab)"><div class="study-week-title" style="color:var(--lab)">Ongoing Labs</div><div class="study-week-items">${labs.map(l => `<div class="study-item"><span class="study-dot" style="background:var(--lab)"></span>${l.course_name} (${l.credits} cr)</div>`).join('')}</div></div>` : '');
}

// ─── AI INSIGHTS ─────────────────────────────────────────────────────
function renderInsights(courses, deliverables, mode) {
    const el = $('insights-content');
    const insights = [];

    if (courses.length > 0) {
        const byUnits = [...courses].filter(c => c.units && c.units.length > 0).sort((a, b) => b.units.length - a.units.length);
        if (byUnits.length > 0) { const h = byUnits[0]; insights.push({ icon: '📚', title: 'Heaviest Syllabus', value: h.course_name, desc: `${h.units.length} units, ${h.units.reduce((s, u) => s + u.topics.length, 0)} topics.`, cls: 'warning' }); }
        const byDiff = [...courses].sort((a, b) => { const e = x => ({ high: 3, medium: 2, low: 1 }[(x || 'medium').toLowerCase()] || 2); return (e(b.estimated_effort) + (parseInt(b.credits) || 0)) - (e(a.estimated_effort) + (parseInt(a.credits) || 0)); });
        if (byDiff.length > 0) insights.push({ icon: '🎯', title: 'Most Challenging', value: byDiff[0].course_name, desc: `${byDiff[0].credits} credits, ${byDiff[0].estimated_effort || 'Medium'} effort.`, cls: 'info' });
    }

    if (deliverables.length > 0) {
        const highPri = deliverables.filter(d => d.priority === 'High');
        if (highPri.length > 0) insights.push({ icon: '🔥', title: 'High Priority Items', value: `${highPri.length} task(s)`, desc: highPri.map(d => d.name || d.type).join(', '), cls: 'warning' });
        const upcoming = deliverables.filter(d => d.date).sort((a, b) => new Date(a.date) - new Date(b.date));
        if (upcoming.length > 0) insights.push({ icon: '📅', title: 'Next Deadline', value: upcoming[0].name || upcoming[0].type, desc: `Due: ${upcoming[0].date} · ${upcoming[0].weight || ''}`, cls: 'info' });
    }

    const allItems = [...courses, ...deliverables];
    const topFocus = allItems.map(c => ({ ...c, score: computeScore(c) })).sort((a, b) => b.score - a.score).slice(0, 2);
    if (topFocus.length > 0) insights.push({ icon: '⭐', title: 'Recommended Focus', value: topFocus.map(c => c.course_name || c.name).join(', '), desc: 'Highest impact — prioritize these.', cls: 'success' });

    const labs = courses.filter(c => c.type === 'lab');
    if (labs.length > 0) insights.push({ icon: '🔬', title: 'Labs', value: `${labs.length} lab(s)`, desc: labs.map(l => l.course_name).join(', '), cls: 'purple' });

    const lowConf = allItems.filter(c => (c.confidence || 1) < 0.80);
    if (lowConf.length > 0) insights.push({ icon: '⚠️', title: 'Low Confidence', value: `${lowConf.length} item(s)`, desc: 'Verify manually.', cls: 'warning' });

    const theory = courses.filter(c => c.type === 'theory').length;
    if (courses.length > 0) {
        const balance = theory > 0 && labs.length > 0 ? 'Balanced' : (theory > 0 ? 'Theory-Heavy' : 'Lab-Heavy');
        insights.push({ icon: '⚖️', title: 'Balance', value: balance, desc: `${theory} theory + ${labs.length} lab(s).`, cls: 'info' });
    }

    if (mode === 'mixed') insights.push({ icon: '🔀', title: 'Mixed Format', value: `${courses.length} courses + ${deliverables.length} tasks`, desc: 'Both curriculum and deadline data detected.', cls: 'success' });

    el.innerHTML = insights.map(i => `<div class="insight-card ${i.cls}"><div class="insight-icon">${i.icon}</div><div class="insight-title">${i.title}</div><div class="insight-value">${i.value}</div><div class="insight-desc">${i.desc}</div></div>`).join('');
}
