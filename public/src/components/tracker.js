import { $ } from '../utils.js';
import { loadProgressData, saveTopicProgress } from '../api.js';
import { state } from '../state.js';

export async function renderProgressTracker(courses) {
    const container = $('tracker-courses-container');
    if (!container) return;
    container.innerHTML = "";

    const liveId = (state.currentResponse && state.currentResponse.id) ? state.currentResponse.id : 'temp';

    const dateStart = $('date-start');
    const dateMid = $('date-midsem');
    const dateEnd = $('date-endsem');
    const hasDates = dateStart && dateStart.value && dateMid && dateMid.value && dateEnd && dateEnd.value;

    let trackerState = {};
    try {
        trackerState = await loadProgressData(liveId);
    } catch (e) {
        console.warn('[Tracker] Could not fetch progress state:', e);
    }

    if (!courses || !Array.isArray(courses) || courses.length === 0) {
        container.innerHTML = '<div class="empty-state-container">No courses available to track.</div>';
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

    courses.forEach((c) => {
        const units = c.units || [];
        if (units.length === 0) return;

        const courseSlug = (c.course_code || c.course_name || 'subj').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
        const courseId = `${idx}-${courseSlug}`;
        const courseDisplayName = c.course_name || courseId;

        html += `<div class="course-accordion">
            <div class="course-header" onclick="this.nextElementSibling.classList.toggle('open'); this.querySelector('.chevron').classList.toggle('open')">
                <span class="course-displayName">${courseDisplayName}</span>
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
                const topicKey = `${courseId}*${unitName}*${tIdx}`;
                const st = trackerState[topicKey] || { completed: false, notes: '', revision: false };

                const compClass = st.completed ? 'completed' : '';
                const chk = st.completed ? 'checked' : '';
                const starActive = st.revision ? 'active' : '';

                html += `<div class="topic-item ${compClass}" data-key="${topicKey}">
                    <input type="checkbox" class="topic-checkbox" ${chk}>
                    <div class="topic-details">
                        <span class="topic-name">${topic}</span>
                        <textarea class="topic-notes" placeholder="Add study notes...">${st.notes || ''}</textarea>
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

    html += `</div>`;

    if (totalTopicsCount === 0) {
        container.innerHTML = '<div class="empty-state-container">Courses found, but no units/topics were extracted.</div>';
    } else {
        container.innerHTML = html;
        const actualTotal = container.querySelectorAll('.topic-item').length;
        attachTrackerListeners(container, actualTotal);
        
        const actualCompleted = container.querySelectorAll('.topic-item.completed').length;
        updateOverallProgress(actualCompleted, actualTotal);
    }

    const goalEl = $('current-goal-text');
    const goalHeader = document.querySelector('.goal-header');

    const studyPlan = state.currentStudyPlanData;
    const hasPlan = studyPlan && (
        (studyPlan.midSem && studyPlan.midSem.length > 0) ||
        (studyPlan.finals && studyPlan.finals.length > 0)
    );

    if (goalEl) {
        if (!hasPlan) {
            if (goalHeader) goalHeader.textContent = '🔥 Current Week Goal';
            goalEl.innerHTML = `<span class="guidance-banner-text guidance-banner-muted">Generate a schedule on the Dashboard to start your study plan.</span>`;
        } else {
            if (goalHeader) goalHeader.textContent = '📅 Study Guidance';
            goalEl.innerHTML = `<span class="guidance-banner-text guidance-banner-main">Track your weekly progress below. Complete tasks to stay on schedule.</span>`;
        }
    }
}

function attachTrackerListeners(container, totalTopicsCount) {
    async function save(topicItem) {
        const liveId = (state.currentResponse && state.currentResponse.id) ? state.currentResponse.id : 'temp';
        const key = topicItem.dataset.key;
        const cb = topicItem.querySelector('.topic-checkbox');
        const nt = topicItem.querySelector('.topic-notes');
        const st = topicItem.querySelector('.topic-star');
        
        // Debug log to help identify persistence issues
        console.log(`[Tracker] Auto-saving topic "${key}" to syllabus "${liveId}"...`);
        
        await saveTopicProgress(liveId, key, cb.checked, nt.value, st.classList.contains('active'));

        const currentCompletedCount = container.querySelectorAll('.topic-item.completed').length;
        const currentTotalTopics = container.querySelectorAll('.topic-item').length;
        updateOverallProgress(currentCompletedCount, currentTotalTopics);
    }

    // Event Delegation for performance
    container.onclick = (e) => {
        const target = e.target;
        const item = target.closest('.topic-item');
        if (!item) return;

        if (target.classList.contains('topic-checkbox')) {
            item.classList.toggle('completed', target.checked);
            save(item);
        } else if (target.closest('.topic-star')) {
            const star = item.querySelector('.topic-star');
            star.classList.toggle('active');
            save(item);
        }
    };

    container.onfocusout = (e) => {
        if (e.target.classList.contains('topic-notes')) {
            save(e.target.closest('.topic-item'));
        }
    };
}

function updateOverallProgress(completed, total) {
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
    const fractionText = `${completed} / ${total} tasks`;

    const progText = $('overall-progress-text');
    if (progText) progText.innerHTML = `<span style="font-size:1.5rem">${pct}%</span> <span style="font-size:0.6rem;font-weight:600">Progress</span>`;
    
    const progFrac = $('overall-progress-fraction');
    if (progFrac) progFrac.textContent = fractionText;

    const circle = $('overall-progress-circle');
    if (circle) {
        const circ = 251.2;
        const offset = circ - (pct / 100) * circ;
        circle.style.strokeDashoffset = offset;
    }
}
