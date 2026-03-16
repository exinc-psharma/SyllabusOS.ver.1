import { $, detectMode, computeScore, showToast } from '../utils.js';
import { state } from '../state.js';
import { renderCreditsChart, renderWeightChart, renderCategoryChart } from './charts.js';
import { saveFrozenSyllabusData } from '../api.js';
import { renderProgressTracker } from './tracker.js';

export function populateDashboard(resp) {
    const courses = resp.courses || [];
    const deliverables = resp.deliverables || [];
    const summary = resp.summary || {};
    const mode = detectMode(resp);

    // ── Stats ──
    const statCourses = $('stat-courses');
    if(statCourses) statCourses.textContent = summary.total_courses || courses.length || deliverables.length;
    
    const statCredits = $('stat-credits');
    if(statCredits) statCredits.textContent = summary.total_credits || courses.reduce((s, c) => s + (parseInt(c.credits) || 0), 0);
    
    const statTheory = $('stat-theory');
    if(statTheory) statTheory.textContent = summary.total_theory || courses.filter(c => c.type === 'theory').length;
    
    const statLabs = $('stat-labs');
    if(statLabs) statLabs.textContent = summary.total_labs || courses.filter(c => c.type === 'lab').length;

    const allItems = [...courses, ...deliverables];
    const highEffort = allItems.filter(c => (c.estimated_effort || '').toLowerCase() === 'high').length;
    const loadRatio = highEffort / Math.max(allItems.length, 1);
    const statWorkload = $('stat-workload');
    if(statWorkload) statWorkload.textContent = loadRatio >= 0.5 ? '🔴 Heavy' : (loadRatio >= 0.25 ? '🟡 Moderate' : '🟢 Light');

    // ── Charts ──
    try {
        if (courses.length > 0) {
            renderCreditsChart(courses);
        } else if (deliverables.length > 0) {
            renderWeightChart(deliverables);
            renderCategoryChart(deliverables);
        }
    } catch (chartErr) {
        console.error('[Dashboard] Chart render error:', chartErr);
    }

    // ── Priority ──
    const scored = allItems.map(c => ({ ...c, score: computeScore(c) })).sort((a, b) => b.score - a.score);
    const pList = $('priority-list');
    if (pList) {
        pList.innerHTML = scored.map(c => `
            <div class="priority-item" data-type="${(c.category || c.type || 'other').toLowerCase()}">
                <div class="priority-title">${c.course_name || c.name || c.type}</div>
                <div class="priority-meta"><span>${c.date || (c.credits ? c.credits + ' cr' : '')}</span><span class="weight-badge">${c.weight || ''}</span></div>
                <div class="priority-score">Impact Score: <span>${c.score}</span></div>
            </div>
        `).join('');
    }

    // ── Timeline ──
    const tView = $('timeline-view');
    if (tView) {
        if (mode === 'deadline' || mode === 'mixed') {
            const items = deliverables.length > 0 ? deliverables : courses;
            tView.innerHTML = `<div class="timeline-body">${items.map((c, i) => `
                <div class="timeline-event timeline-event-animated" style="animation-delay:${i * 0.06}s">
                    <div class="event-dot ${c.category || c.type}"></div>
                    <div class="event-content">
                        <div class="event-date">${c.date || c.course_code || c.type}</div>
                        <div class="event-title">${c.name || c.course_name || c.type}</div>
                    </div>
                </div>
            `).join('')}</div>`;

        } else {
            const ordered = [...courses].sort((a, b) => (parseInt(b.credits) || 0) - (parseInt(a.credits) || 0));
            tView.innerHTML = `<div class="timeline-body">${ordered.map((c, i) => `
                <div class="timeline-event timeline-event-animated" style="animation-delay:${i * 0.06}s">
                    <div class="event-dot ${c.type || c.category}"></div>
                    <div class="event-content">
                        <div class="event-date">${c.course_code || c.type} · ${c.credits || '?'} cr</div>
                        <div class="event-title">${c.course_name}</div>
                    </div>
                </div>
            `).join('')}</div>`;

        }
    }

    // Initial empty states for schedule sections
    // Only show empty state if not already populated by a load/restore
    const bwList = $('busy-weeks-list');
    if (bwList && !bwList.querySelector('.busy-week-item')) {
        bwList.innerHTML = '<div class="empty-state"><span>Enter dates above to generate busy weeks.</span></div>';
    }
    
    const spList = $('study-plan-list');
    if (spList && !spList.querySelector('.study-week-block')) {
        spList.innerHTML = '<div class="empty-state"><span>Enter dates above to generate study plan.</span></div>';
    }

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

            try { renderBusyWeeksCustom(startD, midD, endD); } catch (e) { console.error('BusyWeeks error:', e); }
            try {
                const planData = renderStudyPlanCustom(courses, startD, midD, endD);
                state.currentStudyPlanData = planData;
                
                // Freeze the current state
                let id = 'temp_' + Math.random().toString(36).substr(2, 9);
                if (state.currentResponse && state.currentResponse.id) {
                    id = state.currentResponse.id;
                } else if (state.currentResponse) {
                    state.currentResponse.id = id;
                }
                
                const htmlContent = {
                    dates: { start: startStr, mid: midStr, end: endStr },
                    studyPlan: $('study-plan-list')?.innerHTML || '',
                    busyWeeks: $('busy-weeks-list')?.innerHTML || ''
                };

                await saveFrozenSyllabusData(id, state.currentRawText, state.currentResponse, planData, htmlContent, state.currentResponse.name);

                // Refresh tracker UI immediately
                renderProgressTracker(courses);
            } catch (e) { console.error('StudyPlan error:', e); }
        };
    }

    try { renderInsights(courses, deliverables, mode); } catch (e) { console.error('Insights error:', e); }
    try { renderProgressTracker(courses); } catch (e) { console.error('Progress Tracker error:', e); }
}

export function renderInsights(courses, deliverables, mode) {
    const el = $('insights-content');
    if (!el) return;
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

    el.innerHTML = insights.map(i => `
        <div class="insight-card ${i.cls}">
            <div class="insight-header">
                <div class="insight-icon">${i.icon}</div>
                <div class="insight-title">${i.title}</div>
            </div>
            <div class="insight-value">${i.value}</div>
            <div class="insight-desc">${i.desc}</div>
        </div>`).join('');
}


export function renderBusyWeeksCustom(startD, midD, endD) {
    const el = $('busy-weeks-list');
    if (!el) return;

    const msWeekStart = new Date(midD);
    msWeekStart.setDate(msWeekStart.getDate() - 7);
    const msWeekEnd = new Date(msWeekStart);
    msWeekEnd.setDate(msWeekEnd.getDate() + 6);

    const endWeekStart = new Date(endD);
    endWeekStart.setDate(endWeekStart.getDate() - 7);
    const endWeekEnd = new Date(endWeekStart);
    endWeekEnd.setDate(endWeekEnd.getDate() + 6);

    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    el.innerHTML = `
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
}

export function getWeeksBetween(d1, d2) {
    return Math.max(1, Math.round((d2 - d1) / (7 * 24 * 60 * 60 * 1000)));
}

export function renderStudyPlanCustom(courses, startD, midD, endD) {
    const el = $('study-plan-list');
    if (!el) return null;
    
    const withUnits = courses.filter(c => c.units && c.units.length > 0);
    if (withUnits.length === 0) { 
        el.innerHTML = '<div class="empty-state"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><span>No unit data for study planning.</span></div>'; 
        return null; 
    }

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
        const topicHint = b.topics ? `<div class="study-item-hint">↳ ${b.topics}</div>` : '';
        const dotColorClass = b.color.includes('lab') ? 'bg-lab' : 'bg-primary';
        return `<div class="study-item"><span class="study-dot ${dotColorClass}"></span>${label}</div>${topicHint}`;
    };

    const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    let html = '';

    if (midSem.length > 0) {
        html += '<div class="study-week-block border-mid"><div class="study-week-title text-mid">📝 Mid-Sem Preparation</div><div class="study-week-items"><div class="study-week-desc">Focus on Units 1 & 2 of each subject</div></div></div>';
        midChunks.forEach((chunk, i) => {
            if (chunk.length === 0) return;
            const wStart = addDays(startD, i * 7);
            const wEnd = addDays(wStart, 6);
            html += `<div class="study-week-block"><div class="study-week-title">${fmt(wStart)} – ${fmt(wEnd)}</div><div class="study-week-items">${chunk.map(renderItem).join('')}</div></div>`;
        });
    }

    if (finals.length > 0) {
        html += '<div class="study-week-block border-exam"><div class="study-week-title text-exam">🎯 Finals Preparation</div><div class="study-week-items"><div class="study-week-desc">Units 3, 4+ — complete remaining syllabus</div></div></div>';
        finalChunks.forEach((chunk, i) => {
            if (chunk.length === 0) return;
            const wStart = addDays(midD, i * 7);
            const wEnd = addDays(wStart, 6);
            html += `<div class="study-week-block"><div class="study-week-title">${fmt(wStart)} – ${fmt(wEnd)}</div><div class="study-week-items">${chunk.map(renderItem).join('')}</div></div>`;
        });
    }

    const labs = courses.filter(c => c.type === 'lab');
    if (labs.length > 0) {
        html += `<div class="study-week-block border-lab"><div class="study-week-title text-lab">🔬 Ongoing Labs</div><div class="study-week-items">${labs.map(l => `<div class="study-item"><span class="study-dot bg-lab"></span>${l.course_name} (${l.credits} cr)</div>`).join('')}</div></div>`;
    }

    el.innerHTML = html;

    return { midSem, finals, labs }; 
}
