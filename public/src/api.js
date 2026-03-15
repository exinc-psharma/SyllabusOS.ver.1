import { sanitizeObjClient } from './utils.js';
import { state } from './state.js';

export async function parseSyllabusText(text) {
    const res = await fetch('/api/parse-syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syllabusText: text })
    });
    const result = await res.json();
    return sanitizeObjClient(result);
}

export async function parseSyllabusPdf(file) {
    const fd = new FormData();
    fd.append('pdf', file);
    const res = await fetch('/api/parse-syllabus-pdf', { method: 'POST', body: fd });
    const result = await res.json();
    return sanitizeObjClient(result);
}

export async function saveSyllabus(name, rawText, responseData, tempId) {
    const res = await fetch('/api/syllabi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, rawText, result: responseData, tempId })
    });
    return res.json();
}

export async function loadHistoryList() {
    const res = await fetch('/api/syllabi');
    const list = await res.json();
    return list.map(sanitizeObjClient);
}

export async function loadSyllabusById(id) {
    // Try modern format
    const res = await fetch(`/api/syllabus/${id}`);
    if (res.ok) {
        const data = await res.json();
        if (data && data.parsedResponse) return { type: 'modern', data: sanitizeObjClient(data) };
    }
    // Fallback to legacy
    const resLegacy = await fetch(`/api/syllabi/${id}`);
    if (!resLegacy.ok) throw new Error('Not found');
    const dataLegacy = await resLegacy.json();
    return { type: 'legacy', data: sanitizeObjClient(dataLegacy) };
}

export async function deleteSyllabus(id) {
    return fetch(`/api/syllabi/${id}`, { method: 'DELETE' });
}

export async function saveFrozenSyllabusData(id, rawText, responseData, studyPlanData, htmlContent, name) {
    const data = {
        syllabusId: id,
        name: name || responseData.name || 'Untitled',
        parsedCourses: responseData.courses,
        parsedResponse: responseData,
        rawText: rawText,
        semesterDates: htmlContent.dates,
        studyPlanHtml: htmlContent.studyPlan,
        busyWeeksHtml: htmlContent.busyWeeks,
        studyPlan: studyPlanData,
        savedAt: new Date().toISOString()
    };
    await fetch('/api/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

export async function loadProgressData(syllabusId) {
    const res = await fetch(`/api/progress/${syllabusId}`);
    if (!res.ok) return {};
    return res.json();
}

export async function saveTopicProgress(syllabusId, topicKey, completed, notes, revision) {
    await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syllabusId, topicId: topicKey, completed, notes, revision })
    });
}
