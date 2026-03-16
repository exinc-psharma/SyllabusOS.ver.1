import { initAuth } from './auth.js';
import { $, showToast, switchScreen, sanitizeObjClient } from './utils.js';
import { state } from './state.js';
import { parseSyllabusText, parseSyllabusPdf, saveSyllabus, loadHistoryList, loadSyllabusById, deleteSyllabus, saveFrozenSyllabusData } from './api.js';
import { populateDashboard } from './components/dashboard.js';
import { renderProgressTracker } from './components/tracker.js';

// Init Authentication Wrapper
initAuth();

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
const aiProcessingSteps = $('ai-processing-steps');

// ─── NAV ─────────────────────────────────────────────────────────────
function goHome() {
    window.location.href = '/';
}


if(logoHome) logoHome.addEventListener('click', goHome);
if(topNavBtn) topNavBtn.addEventListener('click', goHome);

// ─── PDF ─────────────────────────────────────────────────────────────
if(uploadZone) {
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', e => {
        e.preventDefault(); uploadZone.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f && f.type === 'application/pdf') handlePdf(f);
    });
}
if(pdfInput) {
    pdfInput.addEventListener('change', () => { if (pdfInput.files[0]) handlePdf(pdfInput.files[0]); });
}
function handlePdf(file) {
    state.uploadedPdfFile = file;
    if(pdfFilename) {
        pdfFilename.textContent = `📄 ${file.name}`;
        pdfFilename.classList.remove('hidden');
    }
    showToast(`PDF: ${file.name}`, 'info');
}

// ─── VIEW TOGGLE ─────────────────────────────────────────────────────
if(toggleCardsBtn) {
    toggleCardsBtn.addEventListener('click', () => {
        toggleCardsBtn.classList.add('active'); toggleJsonBtn.classList.remove('active');
        jsonPreview.classList.remove('hidden'); rawJsonDisplay.classList.add('hidden');
    });
}
if(toggleJsonBtn) {
    toggleJsonBtn.addEventListener('click', () => {
        toggleJsonBtn.classList.add('active'); toggleCardsBtn.classList.remove('active');
        rawJsonDisplay.classList.remove('hidden'); jsonPreview.classList.add('hidden');
    });
}

// ─── PARSE (Screen 1 → 2) ───────────────────────────────────────────
if(generatePlanBtn) {
    generatePlanBtn.addEventListener('click', async () => {
        const text = syllabusInput.value.trim();
        if (!text && !state.uploadedPdfFile) { showToast('Please paste syllabus text or upload a PDF.', 'error'); return; }

        const btnText = generatePlanBtn.querySelector('.btn-text');
        const loader = generatePlanBtn.querySelector('.loader');
        if(btnText) btnText.textContent = "Analyzing Syllabus...";
        if(loader) loader.classList.remove('hidden');
        generatePlanBtn.disabled = true;
        generatePlanBtn.style.opacity = '0.8';

        // Show AI processing steps
        if(aiProcessingSteps) {
            aiProcessingSteps.classList.remove('hidden');
            const steps = aiProcessingSteps.querySelectorAll('.ai-step');
            steps.forEach(s => { s.classList.remove('active', 'done', 'error'); });
            
            let currentStepIdx = 0;
            const updateSteps = (idx, status = 'active') => {
                if (idx > 0) {
                    steps[idx-1].classList.remove('active');
                    steps[idx-1].classList.add(status === 'error' && idx-1 === currentStepIdx ? 'error' : 'done');
                }
                if (idx < steps.length) {
                    steps[idx].classList.add(status);
                }
            };

            const stepInterval = setInterval(() => {
                if (currentStepIdx < steps.length - 1) {
                    currentStepIdx++;
                    updateSteps(currentStepIdx);
                }
            }, 800);

            // Ensure steps are visible for at least 2s
            const minWait = new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                updateSteps(0);
                let result;
                if (state.uploadedPdfFile) {
                    result = await parseSyllabusPdf(state.uploadedPdfFile);
                } else {
                    result = await parseSyllabusText(text);
                }
                
                await minWait;
                state.currentResponse = result;
                state.currentRawText = state.uploadedPdfFile ? (result.extractedText || '[PDF text extracted]') : text;
                
            } catch (err) {
                console.warn('API failed:', err);
                // Mark current step as error
                steps[currentStepIdx].classList.remove('active');
                steps[currentStepIdx].classList.add('error');
                
                await minWait; // Still wait for min time
                state.currentResponse = { source: 'fallback', summary: { total_courses: 0, total_credits: 0 }, courses: [], deliverables: [] };
                state.currentRawText = text || '';
                await new Promise(r => setTimeout(r, 1000)); // Show error slightly longer
            }

            clearInterval(stepInterval);
            
            if(rawTextDisplay) rawTextDisplay.textContent = state.currentRawText;

            if (state.currentResponse.source === 'fallback') {
                if(parseBadge) parseBadge.classList.add('fallback'); 
                if(badgeText) badgeText.textContent = 'Using Demo Data';
                const reason = state.currentResponse.error_reason || '';
                if (reason && reason.includes('rate_limit')) {
                    showToast('Groq rate limit hit — try again in ~1 hour.', 'error');
                } else {
                    showToast('AI failed — ' + (reason ? reason : 'using demo data'), 'error');
                }
            } else {
                if(parseBadge) parseBadge.classList.remove('fallback'); 
                if(badgeText) badgeText.textContent = 'AI Extraction Complete';
                const cc = (state.currentResponse.courses || []).length;
                const dc = (state.currentResponse.deliverables || []).length;
                showToast(`Extracted ${cc} course(s), ${dc} deliverable(s)!`, 'success');
            }

            populateCards(state.currentResponse);
            if(rawJsonDisplay) rawJsonDisplay.textContent = JSON.stringify(state.currentResponse, null, 2);
            
            if(toggleCardsBtn) toggleCardsBtn.classList.add('active'); 
            if(toggleJsonBtn) toggleJsonBtn.classList.remove('active');
            if(jsonPreview) jsonPreview.classList.remove('hidden'); 
            if(rawJsonDisplay) rawJsonDisplay.classList.add('hidden');

            if(btnText) btnText.textContent = "Generate Academic Plan";
            if(loader) loader.classList.add('hidden');
            generatePlanBtn.disabled = false;
            generatePlanBtn.style.opacity = '1';

            steps.forEach(s => { 
                if (!s.classList.contains('error')) {
                    s.classList.remove('active'); 
                    s.classList.add('done'); 
                }
            });
            
            setTimeout(() => {
                aiProcessingSteps.classList.add('hidden');
                switchScreen(2);
            }, 600);
        }
    });
}

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

    if(jsonPreview) jsonPreview.innerHTML = html || '<p style="color:var(--text-muted)">No data extracted.</p>';
}

// ─── SAVE MODAL ──────────────────────────────────────────────────────
function openSaveModal() { 
    if(saveModal) saveModal.classList.remove('hidden'); 
    if(saveNameInput) { saveNameInput.value = ''; saveNameInput.focus(); }
}
if(saveBtn) saveBtn.addEventListener('click', openSaveModal);
if(saveDashboardBtn) saveDashboardBtn.addEventListener('click', openSaveModal);
if(saveCancel) saveCancel.addEventListener('click', () => saveModal.classList.add('hidden'));
if(saveModal) saveModal.addEventListener('click', e => { if (e.target === saveModal) saveModal.classList.add('hidden'); });

if(saveConfirm) {
    saveConfirm.addEventListener('click', async () => {
        const name = saveNameInput.value.trim() || 'Untitled Syllabus';
        const tempId = (state.currentResponse && state.currentResponse.id) ? state.currentResponse.id : null;
        try {
            const data = await saveSyllabus(name, state.currentRawText, state.currentResponse, tempId);
            if (data.success && data.id) {
                state.currentResponse.id = data.id;
                state.currentResponse.name = name;
                
                // Automatically save frozen plan if open
                if (state.currentStudyPlanData) {
                    const htmlContent = {
                        dates: { start: $('date-start')?.value||'', mid: $('date-midsem')?.value||'', end: $('date-endsem')?.value||'' },
                        studyPlan: $('study-plan-list')?.innerHTML || '',
                        busyWeeks: $('busy-weeks-list')?.innerHTML || ''
                    };
                    await saveFrozenSyllabusData(data.id, state.currentRawText, state.currentResponse, state.currentStudyPlanData, htmlContent);
                }
                
                renderProgressTracker(state.currentResponse.courses);
            }
            showToast(data.success ? `"${name}" saved!` : 'Save failed: ' + (data.error || 'Server error'), data.success ? 'success' : 'error');
            if (data.success) loadHistoryUI();
        } catch (err) {
            console.error('[App] Save error:', err);
            showToast('Save failed: ' + err.message, 'error');
        }
        saveModal.classList.add('hidden');
    });
}

// ─── HISTORY ─────────────────────────────────────────────────────────
function openDrawer() { 
    if(historyDrawer) historyDrawer.classList.add('open'); 
    if(drawerOverlay) drawerOverlay.classList.add('open'); 
    loadHistoryUI(); 
}
function closeDrawer() { 
    if(historyDrawer) historyDrawer.classList.remove('open'); 
    if(drawerOverlay) drawerOverlay.classList.remove('open'); 
}
if(historyBtn) historyBtn.addEventListener('click', openDrawer);
if(drawerClose) drawerClose.addEventListener('click', closeDrawer);
if(drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);

async function loadHistoryUI() {
    if(!drawerList) return;
    drawerList.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.8125rem">Loading...</p>';
    try {
        const list = await loadHistoryList();
        if (list.length === 0) {
            drawerList.innerHTML = '<div class="history-empty"><p>No saved syllabi yet.</p><p style="font-size:0.75rem">Parse a syllabus and click Save.</p></div>';
            return;
        }
        drawerList.innerHTML = list.map(safeItem => {
            const taskText = safeItem.deliverableCount > 0 ? ` · ${safeItem.deliverableCount} task(s)` : '';
            return `
            <div class="history-item" data-id="${safeItem.id}">
                <div class="history-item-name">${safeItem.name}</div>
                <div class="history-item-meta">
                    <span>${safeItem.courseCount} course(s)${taskText}</span>
                    <span>${(() => {
                        const d = new Date(safeItem.savedAt);
                        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
                    })()}</span>
                </div>
                <div class="history-item-actions"><button class="history-delete" data-id="${safeItem.id}" onclick="event.stopPropagation()">Delete</button></div>
            </div>
            `;
        }).join('');
        drawerList.querySelectorAll('.history-item').forEach(el => el.addEventListener('click', () => loadSavedUI(el.dataset.id)));
        drawerList.querySelectorAll('.history-delete').forEach(el => el.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSavedUI(el.dataset.id);
        }));
    } catch { 
        drawerList.innerHTML = '<p style="text-align:center;padding:1rem;color:var(--exam)">Failed to load.</p>'; 
    }
}

async function loadSavedUI(id) {
    try {
        console.log(`[App] loadSaved start for id: ${id}`);
        // Clear previous dates before loading new ones
        if($('date-start')) $('date-start').value = '';
        if($('date-midsem')) $('date-midsem').value = '';
        if($('date-endsem')) $('date-endsem').value = '';
        state.currentStudyPlanData = null;

        const { type, data } = await loadSyllabusById(id);
        
        let targetResponse = null;
        if (type === 'modern') {
            targetResponse = data.parsedResponse;
            targetResponse.id = data.syllabusId;
            targetResponse.name = data.name || 'Untitled';
            
            state.currentResponse = targetResponse;
            state.currentRawText = data.rawText || '';
            
            if (data.semesterDates) {
                if($('date-start')) $('date-start').value = data.semesterDates.start || '';
                if($('date-midsem')) $('date-midsem').value = data.semesterDates.mid || '';
                if($('date-endsem')) $('date-endsem').value = data.semesterDates.end || '';
            }
            if (data.busyWeeksHtml && $('busy-weeks-list')) $('busy-weeks-list').innerHTML = data.busyWeeksHtml;
            if (data.studyPlanHtml && $('study-plan-list')) $('study-plan-list').innerHTML = data.studyPlanHtml;
            state.currentStudyPlanData = data.studyPlan;

        } else {
            targetResponse = data.result;
            targetResponse.id = data.id || id;
            targetResponse.name = data.name || 'Untitled';

            state.currentResponse = targetResponse;
            state.currentRawText = data.rawText || '';
        }

        if(rawTextDisplay) rawTextDisplay.textContent = state.currentRawText;
        populateCards(state.currentResponse);
        if(rawJsonDisplay) rawJsonDisplay.textContent = JSON.stringify(state.currentResponse, null, 2);
        if(parseBadge) parseBadge.classList.remove('fallback');
        if(badgeText) badgeText.textContent = type === 'modern' ? 'Loaded from Storage' : 'Loaded from History';

        populateDashboard(state.currentResponse);
        closeDrawer();
        switchScreen(3);
        showToast(`Loaded \"${state.currentResponse.name}\"`, 'success');
    } catch (e) {
        console.error('[App] Load error:', e);
        showToast(`Failed to load: ${e.message}`, 'error');
    }
}

async function deleteSavedUI(id) {
    try { 
        await deleteSyllabus(id); 
        showToast('Deleted.', 'info'); 
        loadHistoryUI(); 
    } catch { 
        showToast('Delete failed.', 'error'); 
    }
}

// ─── Screen 2 → 3 ───────────────────────────────────────────────────
generateTimelineBtn.addEventListener('click', () => {
    try {
        populateDashboard(state.currentResponse);
    } catch (err) {
        console.error('Dashboard error:', err);
        showToast('Dashboard issue detected.', 'error');
    }
    switchScreen(3);
});

// View Toggle for Tab Tracker
if($('tab-dashboard')) {
    $('tab-dashboard').addEventListener('click', () => {
        $('tab-dashboard').classList.add('active');
        if($('tab-tracker')) $('tab-tracker').classList.remove('active');
        if($('dashboard-wrapper')) $('dashboard-wrapper').classList.remove('hidden');
        if($('progress-wrapper')) $('progress-wrapper').classList.add('hidden');
    });
}

if($('tab-tracker')) {
    $('tab-tracker').addEventListener('click', async () => {
        $('tab-tracker').classList.add('active');
        if($('tab-dashboard')) $('tab-dashboard').classList.remove('active');
        if($('progress-wrapper')) $('progress-wrapper').classList.remove('hidden');
        if($('dashboard-wrapper')) $('dashboard-wrapper').classList.add('hidden');

        if (state.currentResponse) {
            renderProgressTracker(state.currentResponse.courses);
        }
    });
}
// ─── INITIALIZATION (Deep Linking) ──────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const loadId = params.get('id');
    if (loadId) {
        console.log(`[Init] Deep-link detected: ${loadId}`);
        loadSavedUI(loadId);
    }
});

// ─── PREMIUM INTERACTIVE EFFECTS ───────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const glow = $('cursor-glow');
    if (glow) {
        document.addEventListener('mousemove', (e) => {
            glow.style.left = e.clientX + 'px';
            glow.style.top = e.clientY + 'px';
        });
    }
});
