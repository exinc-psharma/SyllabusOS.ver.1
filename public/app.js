// ─── AUTHENTICATION WRAPPER ──────────────────────────────────────────
(function() {
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
})();

// ─── DOM SECURITY (XSS PREVENTION) ───────────────────────────────────
const sanitizeObjClient = (obj) => {
    if (typeof obj === 'string') return obj.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    if (Array.isArray(obj)) return obj.map(sanitizeObjClient);
    if (obj !== null && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, val] of Object.entries(obj)) sanitized[key] = sanitizeObjClient(val);
        return sanitized;
    }
    return obj;
};

// ─── STATE ───────────────────────────────────────────────────────────
let currentResponse = null;
let currentRawText = '';
let uploadedPdfFile = null;
let creditsChart = null;
let unitsChart = null;
let currentStudyPlanData = null;

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
const aiProcessingSteps = $('ai-processing-steps');

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

        // Reset view to dashboard when going to screen 3
        if (n === 3) {
            $('dashboard-wrapper').classList.remove('hidden');
            $('progress-wrapper').classList.add('hidden');
            $('tab-dashboard').classList.add('active');
            $('tab-tracker').classList.remove('active');
        }
        window.scrollTo(0, 0);
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
        currentStudyPlanData = null;
        $('date-start').value = '';
        $('date-midsem').value = '';
        $('date-endsem').value = '';
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

    // Show AI processing steps
    aiProcessingSteps.classList.remove('hidden');
    const steps = aiProcessingSteps.querySelectorAll('.ai-step');
    steps.forEach(s => { s.classList.remove('active', 'done'); });
    let stepIdx = 0;
    const stepInterval = setInterval(() => {
        if (stepIdx > 0 && stepIdx <= 4) steps[stepIdx - 1]?.classList.replace('active', 'done');
        if (stepIdx < 4) steps[stepIdx]?.classList.add('active');
        stepIdx++;
        if (stepIdx > 4) clearInterval(stepInterval);
    }, 1200);

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
        currentResponse = sanitizeObjClient(result);
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

    // Finish processing steps
    clearInterval(stepInterval);
    steps.forEach(s => { s.classList.remove('active'); s.classList.add('done'); });
    setTimeout(() => aiProcessingSteps.classList.add('hidden'), 800);

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
    const tempId = (currentResponse && currentResponse.id) ? currentResponse.id : null;
    try {
        const res = await fetch('/api/syllabi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, rawText: currentRawText, result: currentResponse, tempId })
        });
        const data = await res.json();
        if (data.success && data.id) {
            currentResponse.id = data.id;
            currentResponse.name = name;
            // Sync the frozen detailed state to the new ID
            if (currentStudyPlanData) {
                await saveFrozenSyllabus(currentStudyPlanData);
            }
            // Re-render tracker to update listeners with new ID
            await renderProgressTracker(currentResponse.courses);
        }
        showToast(data.success ? `"${name}" saved!` : 'Save failed.', data.success ? 'success' : 'error');
        if (data.success) loadHistory();
    } catch (err) {
        console.error('[App] Save error:', err);
        showToast('Save failed.', 'error');
    }
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
        drawerList.innerHTML = list.map(item => {
            const taskText = item.deliverableCount > 0 ? ` · ${item.deliverableCount} task(s)` : '';
            const safeItem = sanitizeObjClient(item); // Fix DOM XSS here
            return `
            <div class="history-item" data-id="${safeItem.id}">
                <div class="history-item-name">${safeItem.name}</div>
                <div class="history-item-meta">
                    <span>${safeItem.courseCount} course(s)${taskText}</span>
                    <span>${new Date(safeItem.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
                <div class="history-item-actions"><button class="history-delete" data-id="${safeItem.id}" onclick="event.stopPropagation()">Delete</button></div>
            </div>
            `;
        }).join('');
        drawerList.querySelectorAll('.history-item').forEach(el => el.addEventListener('click', () => loadSaved(el.dataset.id)));
        drawerList.querySelectorAll('.history-delete').forEach(el => el.addEventListener('click', () => deleteSaved(el.dataset.id)));
    } catch { drawerList.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--exam)">Failed to load.</p>'; }
}

async function loadSaved(id) {
    try {
        console.log(`[App] loadSaved start for id: ${id}`);
        // Clear previous dates before loading new ones
        $('date-start').value = '';
        $('date-midsem').value = '';
        $('date-endsem').value = '';
        currentStudyPlanData = null;

        // Try new storage format first
        const resSyllabus = await fetch(`/api/syllabus/${id}`);
        if (resSyllabus.ok) {
            const syllabusData = await resSyllabus.json();
            if (syllabusData && syllabusData.parsedResponse) {
                console.log(`[App] Found modern syllabus record.`);
                currentResponse = sanitizeObjClient(syllabusData.parsedResponse);
                currentResponse.id = syllabusData.syllabusId;
                currentResponse.name = syllabusData.name || 'Untitled';

                currentRawText = syllabusData.rawText || '';
                rawTextDisplay.textContent = currentRawText;
                populateCards(currentResponse);
                rawJsonDisplay.textContent = JSON.stringify(currentResponse, null, 2);
                parseBadge.classList.remove('fallback');
                badgeText.textContent = 'Loaded from Storage';

                populateDashboard(currentResponse);

                // Restore frozen dates and schedule
                if (syllabusData.semesterDates) {
                    $('date-start').value = syllabusData.semesterDates.start || '';
                    $('date-midsem').value = syllabusData.semesterDates.mid || '';
                    $('date-endsem').value = syllabusData.semesterDates.end || '';
                }
                if (syllabusData.busyWeeksHtml) $('busy-weeks-list').innerHTML = syllabusData.busyWeeksHtml;
                if (syllabusData.studyPlanHtml) $('study-plan-list').innerHTML = syllabusData.studyPlanHtml;
                currentStudyPlanData = syllabusData.studyPlan;

                closeDrawer();
                switchScreen(3);
                showToast(`Loaded \"${syllabusData.name || 'Untitled'}\"`, 'success');
                return;
            }
        }

        console.log(`[App] Modern record not found or invalid, falling back to legacy history.`);
        const res = await fetch(`/api/syllabi/${id}`);
        if (!res.ok) {
            throw new Error(`Server returned ${res.status} ${res.statusText}`);
        }

        const saved = await res.json();
        if (!saved || !saved.result) {
            console.error('[App] Invalid legacy data structure:', saved);
            throw new Error('Invalid legacy data structure');
        }

        currentResponse = sanitizeObjClient(saved.result);
        currentResponse.id = saved.id || id;
        currentResponse.name = saved.name || 'Untitled';

        currentRawText = saved.rawText || '';
        rawTextDisplay.textContent = currentRawText;
        populateCards(currentResponse);
        rawJsonDisplay.textContent = JSON.stringify(currentResponse, null, 2);
        parseBadge.classList.remove('fallback');
        badgeText.textContent = 'Loaded from History';

        populateDashboard(currentResponse);
        closeDrawer();
        switchScreen(3);
        showToast(`Loaded \"${currentResponse.name}\"`, 'success');
    } catch (e) {
        console.error('[App] Load error:', e);
        showToast(`Failed to load: ${e.message}`, 'error');
    }
}

async function deleteSaved(id) {
    try { await fetch(`/api/syllabi/${id}`, { method: 'DELETE' }); showToast('Deleted.', 'info'); loadHistory(); }
    catch { showToast('Delete failed.', 'error'); }
}

// ─── Screen 2 → 3 ───────────────────────────────────────────────────
generateTimelineBtn.addEventListener('click', () => {
    try {
        populateDashboard(currentResponse);
        // Force refresh from storage if exists
        if (currentResponse.id) {
            fetch(`/api/syllabus/${currentResponse.id}`)
                .then(r => r.json())
                .then(d => { if (d) populateDashboard(currentResponse); });
        }
    } catch (err) {
        console.error('Dashboard error:', err);
        showToast('Dashboard issue detected.', 'error');
    }
    switchScreen(3);
});

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
    try {
        if (courses.length > 0) {
            renderCreditsChart(courses);
        } else {
            renderWeightChart(deliverables);
            renderCategoryChart(deliverables);
        }
    } catch (chartErr) {
        console.error('Chart render error:', chartErr);
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

    // Initial empty states for schedule sections
    $('busy-weeks-list').innerHTML = '<div class="empty-state"><span>Enter dates above to generate busy weeks.</span></div>';
    $('study-plan-list').innerHTML = '<div class="empty-state"><span>Enter dates above to generate study plan.</span></div>';

    // Hook up schedule generation
    const genBtn = $('generate-schedule-btn');
    if (genBtn) {
        genBtn.onclick = async () => {
            const startStr = $('date-start').value;
            const midStr = $('date-midsem').value;
            const endStr = $('date-endsem').value;

            if (!startStr || !midStr || !endStr) {
                showToast('Please select all three dates.', 'error');
                return;
            }

            const startD = new Date(startStr);
            const midD = new Date(midStr);
            const endD = new Date(endStr);

            if (midD <= startD || endD <= midD) {
                showToast('Dates must be strictly chronological.', 'error');
                return;
            }

            try { renderBusyWeeksCustom(courses, startD, midD, endD); } catch (e) { console.error('BusyWeeks error:', e); }
            try {
                currentStudyPlanData = renderStudyPlanCustom(courses, startD, midD, endD);
                // Freeze the current state
                await saveFrozenSyllabus(currentStudyPlanData);

                const syllabusId = (currentResponse && currentResponse.id) ? currentResponse.id : 'temp';

                // Refresh tracker UI immediately
                await renderProgressTracker(courses);
            } catch (e) { console.error('StudyPlan error:', e); }
        };
    }

    // Attempt to load frozen state if available
    if (resp.id) {
        fetch(`/api/syllabus/${resp.id}`)
            .then(res => res.json())
            .then(sData => {
                if (sData) {
                    if (sData.semesterDates) {
                        $('date-start').value = sData.semesterDates.start || '';
                        $('date-midsem').value = sData.semesterDates.mid || '';
                        $('date-endsem').value = sData.semesterDates.end || '';
                    }
                    if (sData.busyWeeksHtml) $('busy-weeks-list').innerHTML = sData.busyWeeksHtml;
                    if (sData.studyPlanHtml) $('study-plan-list').innerHTML = sData.studyPlanHtml;
                }
            });
    }

    try { renderInsights(courses, deliverables, mode); } catch (e) { console.error('Insights error:', e); }
    try { renderProgressTracker(courses); } catch (e) { console.error('Progress Tracker error:', e); }
}

async function saveFrozenSyllabus(planData) {
    if (!currentResponse || !currentResponse.id) {
        currentResponse.id = 'temp_' + Math.random().toString(36).substr(2, 9);
    }
    const id = currentResponse.id;
    const data = {
        syllabusId: id,
        parsedCourses: currentResponse.courses,
        parsedResponse: currentResponse,
        rawText: currentRawText,
        semesterDates: {
            start: $('date-start').value,
            mid: $('date-midsem').value,
            end: $('date-endsem').value
        },
        studyPlanHtml: $('study-plan-list').innerHTML,
        busyWeeksHtml: $('busy-weeks-list').innerHTML,
        studyPlan: planData, // Freezing the sequence
        savedAt: new Date().toISOString()
    };

    await fetch('/api/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
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
const COLORS = ['#6366F1', '#EF4444', '#8B5CF6', '#F59E0B', '#22C55E', '#EC4899', '#3B82F6', '#14B8A6', '#F43F5E', '#06B6D4', '#84CC16', '#D946EF', '#EAB308', '#0EA5E9', '#10B981', '#F97316'];

function renderCreditsChart(courses) {
    const ctx = $('credits-chart').getContext('2d');
    const map = {}; courses.forEach(c => { map[c.course_name || c.type] = parseInt(c.credits) || 0; });
    if (creditsChart) creditsChart.destroy();

    // Build custom HTML legend
    const legendEl = $('credits-legend');
    let legendHtml = '';
    const keys = Object.keys(map);
    const values = Object.values(map);
    keys.forEach((label, i) => {
        const color = COLORS[i % COLORS.length];
        legendHtml += `<div class="legend-item"><div class="legend-dot" style="background:${color}"></div><div class="legend-label">${label}</div><div class="legend-value">${values[i]} cr</div></div>`;
    });
    legendEl.innerHTML = legendHtml;

    creditsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: keys, datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 2, borderColor: '#0F172A', hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, cutout: '60%', plugins: { legend: { display: false } } }
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
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 }, color: '#94A3B8' }, grid: { color: '#334155' } }, x: { ticks: { font: { size: 9 }, color: '#94A3B8' }, grid: { display: false } } } }
    });
}

// ─── BUSY WEEKS ──────────────────────────────────────────────────────
function renderBusyWeeksCustom(courses, startD, midD, endD) {
    const el = $('busy-weeks-list');

    // Calculate weeks before exams
    const msWeekStart = new Date(midD);
    msWeekStart.setDate(msWeekStart.getDate() - 7);
    const msWeekEnd = new Date(msWeekStart);
    msWeekEnd.setDate(msWeekEnd.getDate() + 6);

    const endWeekStart = new Date(endD);
    endWeekStart.setDate(endWeekStart.getDate() - 7);
    const endWeekEnd = new Date(endWeekStart);
    endWeekEnd.setDate(endWeekEnd.getDate() + 6);

    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let html = `
        <div class="busy-week-item moderate-load">
            <div class="busy-week-header">${fmt(msWeekStart)} – ${fmt(msWeekEnd)} <span class="load-tag moderate">Moderate</span></div>
            <div class="busy-week-detail">Mid-Sem Preparation · Focus on Units 1-2</div>
            <div class="busy-week-bar"><div class="busy-week-bar-fill moderate" style="width:70%"></div></div>
        </div>
        <div class="busy-week-item high-load">
            <div class="busy-week-header">${fmt(endWeekStart)} – ${fmt(endWeekEnd)} <span class="load-tag high">Busy</span></div>
            <div class="busy-week-detail">Finals Preparation · Focus on Units 3-4+</div>
            <div class="busy-week-bar"><div class="busy-week-bar-fill high" style="width:95%"></div></div>
        </div>
    `;

    el.innerHTML = html;
}

// ─── STUDY PLAN ──────────────────────────────────────────────────────
function getWeeksBetween(d1, d2) {
    return Math.max(1, Math.round((d2 - d1) / (7 * 24 * 60 * 60 * 1000)));
}

function renderStudyPlanCustom(courses, startD, midD, endD) {
    const el = $('study-plan-list');
    const withUnits = courses.filter(c => c.units && c.units.length > 0);
    if (withUnits.length === 0) { el.innerHTML = '<div class="empty-state"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><span>No unit data for study planning.</span></div>'; return; }

    const buildItems = (unitFilter) => {
        const items = [];
        withUnits.forEach(c => {
            const name = c.course_code || c.course_name.slice(0, 15);
            const color = c.type === 'lab' ? 'var(--lab)' : 'var(--primary)';
            c.units.forEach((u, idx) => {
                if (unitFilter(idx)) {
                    const topics = (u.topics && u.topics.length > 0) ? u.topics.slice(0, 3).join(', ') : '';
                    items.push({ course: name, unit: u.unit, topics, color });
                }
            });
        });
        return items;
    };

    const midSem = buildItems(idx => idx < 2);
    const finals = buildItems(idx => idx >= 2);

    const midWeeksCount = getWeeksBetween(startD, midD);
    const finalWeeksCount = getWeeksBetween(midD, endD);

    const chunkArray = (arr, numChunks) => {
        const chunks = Array.from({ length: numChunks }, () => []);
        arr.forEach((item, i) => chunks[i % numChunks].push(item));
        return chunks;
    };

    const midChunks = chunkArray(midSem, midWeeksCount);
    const finalChunks = chunkArray(finals, finalWeeksCount);

    const renderItem = b => {
        let label = `${b.course} — ${b.unit}`;
        const topicHint = b.topics ? `<div class="study-item" style="color:var(--text-muted);font-size:0.5625rem;padding-left:0.875rem;opacity:0.8;margin-top:2px;">↳ ${b.topics}</div>` : '';
        return `<div class="study-item"><span class="study-dot" style="background:${b.color}"></span>${label}</div>${topicHint}`;
    };

    const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let html = '';

    if (midSem.length > 0) {
        html += '<div class="study-week-block" style="border-left-color:var(--confidence-mid)"><div class="study-week-title" style="color:var(--confidence-mid)">📝 Mid-Sem Preparation</div><div class="study-week-items"><div class="study-item" style="color:var(--text-muted);font-size:0.625rem">Focus on Units 1 & 2 of each subject</div></div></div>';
        midChunks.forEach((chunk, i) => {
            if (chunk.length === 0) return;
            const wStart = addDays(startD, i * 7);
            const wEnd = addDays(wStart, 6);
            html += `<div class="study-week-block"><div class="study-week-title">${fmt(wStart)} – ${fmt(wEnd)}</div><div class="study-week-items">${chunk.map(renderItem).join('')}</div></div>`;
        });
    }

    if (finals.length > 0) {
        html += '<div class="study-week-block" style="border-left-color:var(--exam)"><div class="study-week-title" style="color:var(--exam)">🎯 Finals Preparation</div><div class="study-week-items"><div class="study-item" style="color:var(--text-muted);font-size:0.625rem">Units 3, 4+ — complete remaining syllabus</div></div></div>';
        finalChunks.forEach((chunk, i) => {
            if (chunk.length === 0) return;
            const wStart = addDays(midD, i * 7);
            const wEnd = addDays(wStart, 6);
            html += `<div class="study-week-block"><div class="study-week-title">${fmt(wStart)} – ${fmt(wEnd)}</div><div class="study-week-items">${chunk.map(renderItem).join('')}</div></div>`;
        });
    }

    const labs = courses.filter(c => c.type === 'lab');
    if (labs.length > 0) {
        html += `<div class="study-week-block" style="border-left-color:var(--lab)"><div class="study-week-title" style="color:var(--lab)">🔬 Ongoing Labs</div><div class="study-week-items">${labs.map(l => `<div class="study-item"><span class="study-dot" style="background:var(--lab)"></span>${l.course_name} (${l.credits} cr)</div>`).join('')}</div></div>`;
    }

    el.innerHTML = html;

    // Return the stable sequence for freezing
    return { midSem, finals, labs };
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

// ─── PROGRESS TRACKER LOGIC ──────────────────────────────────────────

// View Toggle
$('tab-dashboard').addEventListener('click', () => {
    $('tab-dashboard').classList.add('active');
    $('tab-tracker').classList.remove('active');
    $('dashboard-wrapper').classList.remove('hidden');
    $('progress-wrapper').classList.add('hidden');
});

$('tab-tracker').addEventListener('click', async () => {
    $('tab-tracker').classList.add('active');
    $('tab-dashboard').classList.remove('active');
    $('progress-wrapper').classList.remove('hidden');
    $('dashboard-wrapper').classList.add('hidden');

    if (currentResponse) {
        renderProgressTracker(currentResponse.courses);
    }
});

// Tracker Render
async function renderProgressTracker(courses) {
    const container = $('tracker-courses-container');
    if (!container) return;

    container.innerHTML = ""; // Clear for stability

    const syllabusId = (currentResponse && currentResponse.id) ? currentResponse.id : 'temp';

    // Check for dates to determine locked state
    const hasDates = $('date-start').value && $('date-midsem').value && $('date-endsem').value;

    // 1. Fetch Plan & Progress first (Load Order Optimization)
    let studyPlan = null;
    let trackerState = {};

    try {
        const resSyllabus = await fetch(`/api/syllabus/${syllabusId}`);
        if (resSyllabus.ok) {
            const sData = await resSyllabus.json();
            studyPlan = sData ? sData.studyPlan : null;
        }

        const resProgress = await fetch(`/api/progress/${syllabusId}`);
        if (resProgress.ok) trackerState = await resProgress.json();
    } catch (e) {
        console.warn('[App] Could not fetch state:', e);
    }

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:2rem;">No courses available to track.</div>';
        updateOverallProgress(0, 0);
        return;
    }

    let bannerHtml = '';
    let lockedClass = '';
    if (!hasDates) {
        bannerHtml = `<div class="locked-banner">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            Enter semester dates on Dashboard and click Generate Schedule to activate the Progress Tracker.
        </div>`;
        lockedClass = 'tracker-locked';
    }

    let html = bannerHtml + `<div class="${lockedClass}">`;
    let totalTopicsCount = 0;

    courses.forEach((c, cIdx) => {
        const units = c.units || [];
        if (units.length === 0) return;

        const courseId = c.course_code || c.course_name.slice(0, 15);
        const courseDisplayName = c.course_name || courseId;

        html += `<div class="course-accordion">
            <div class="course-header" onclick="this.nextElementSibling.classList.toggle('open'); this.querySelector('.chevron').classList.toggle('open')">
                <span style="font-weight:600">${courseDisplayName}</span>
                <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
            <div class="course-body">`;

        units.forEach((u, uIdx) => {
            const unitName = u.unit || `Unit ${uIdx + 1}`;
            const topics = u.topics || [];

            html += `<div class="unit-accordion">
                <div class="unit-header" onclick="this.nextElementSibling.classList.toggle('open'); this.classList.toggle('open')">
                    ${unitName}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                <div class="unit-body">`;

            topics.forEach((topic, tIdx) => {
                totalTopicsCount++;
                // Standardized progress key format: syllabusId*courseId*unitId*topicIndex
                const topicKey = `${syllabusId}*${courseId}*${unitName}*${tIdx}`;
                const state = trackerState[topicKey] || { completed: false, notes: '', revision: false };

                const compClass = state.completed ? 'completed' : '';
                const chk = state.completed ? 'checked' : '';
                const starActive = state.revision ? 'active' : '';

                html += `<div class="topic-item ${compClass}" data-key="${topicKey}">
                    <input type="checkbox" class="topic-checkbox" ${chk}>
                    <div class="topic-details">
                        <span class="topic-name">${topic}</span>
                        <textarea class="topic-notes" placeholder="Add study notes...">${state.notes || ''}</textarea>
                    </div>
                    <div class="topic-star ${starActive}" title="Mark for revision">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </div>
                </div>`;
            });

            html += `</div></div>`;
        });

        html += `</div></div>`;
    });

    html += `</div>`; // Close locked wrapper

    if (totalTopicsCount === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:2rem;">Courses found, but no units/topics were extracted.</div>';
    } else {
        container.innerHTML = html;
        attachTrackerListeners(container, totalTopicsCount, courses, syllabusId);
    }

    // Initial Progress Update (Calculation using loaded state)
    let completedCount = 0;
    Object.values(trackerState).forEach(s => { if (s.completed) completedCount++; });
    updateOverallProgress(completedCount, totalTopicsCount);

    // FIX 2: Simplified Goal Banner Logic
    const goalEl = $('current-goal-text');
    const goalHeader = document.querySelector('.goal-header');

    // Check if plan exists in a robust way
    const hasPlan = studyPlan && (
        (studyPlan.midSem && studyPlan.midSem.length > 0) ||
        (studyPlan.finals && studyPlan.finals.length > 0)
    );

    if (goalEl) {
        if (!hasPlan) {
            if (goalHeader) goalHeader.textContent = '🔥 Current Week Goal';
            goalEl.innerHTML = `<span style="color:var(--text-muted); font-size: 0.8125rem;">Generate a schedule on the Dashboard to start your study plan.</span>`;
        } else {
            if (goalHeader) goalHeader.textContent = '📅 Study Guidance';
            goalEl.innerHTML = `<span style="color:var(--text-main); font-size: 0.8125rem; font-weight:500;">Track your weekly progress below. Complete tasks to stay on schedule.</span>`;
        }
    }
}

function attachTrackerListeners(container, totalTopicsCount, courses, syllabusId) {
    async function saveProgress(topicItem) {
        const key = topicItem.dataset.key;
        const body = {
            syllabusId,
            topicId: key,
            completed: topicItem.querySelector('.topic-checkbox').checked,
            notes: topicItem.querySelector('.topic-notes').value,
            revision: topicItem.querySelector('.topic-star').classList.contains('active')
        };
        await fetch('/api/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const allItems = container.querySelectorAll('.topic-item');
        const newState = {};
        allItems.forEach(it => {
            newState[it.dataset.key] = { completed: it.querySelector('.topic-checkbox').checked };
        });

        let completedCount = 0;
        Object.values(newState).forEach(s => { if (s.completed) completedCount++; });
        updateOverallProgress(completedCount, totalTopicsCount);
    }

    container.querySelectorAll('.topic-checkbox').forEach(cb => {
        cb.onchange = (e) => {
            const item = e.target.closest('.topic-item');
            item.classList.toggle('completed', e.target.checked);
            saveProgress(item);
        };
    });

    container.querySelectorAll('.topic-notes').forEach(tn => {
        tn.onblur = (e) => saveProgress(e.target.closest('.topic-item'));
    });

    container.querySelectorAll('.topic-star').forEach(ts => {
        ts.onclick = (e) => {
            const item = e.target.closest('.topic-item');
            const star = item.querySelector('.topic-star');
            star.classList.toggle('active');
            saveProgress(item);
        };
    });
}

function updateOverallProgress(completed, total) {
    // FIX 9: Percent calculation check
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
    // FIX Progress Text Display: "X / Y tasks"
    const fractionText = `${completed} / ${total} tasks`;

    $('overall-progress-text').innerHTML = `<span style="font-size:1.5rem">${pct}%</span> <span style="font-size:0.6rem;font-weight:600">Progress</span>`;
    $('overall-progress-fraction').textContent = fractionText;

    const circle = $('overall-progress-circle');
    const circ = 251.2;
    // Standard circle math: offset = circ - (pct/100)*circ
    const offset = circ - (pct / 100) * circ;
    circle.style.strokeDashoffset = offset;
}

