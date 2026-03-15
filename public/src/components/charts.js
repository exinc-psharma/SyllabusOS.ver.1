import { $, COLORS } from '../utils.js';
import { state } from '../state.js';

export function renderCreditsChart(courses) {
    const ctx = $('credits-chart').getContext('2d');
    const map = {}; courses.forEach(c => { map[c.course_name || c.type] = parseInt(c.credits) || 0; });
    if (state.creditsChart) state.creditsChart.destroy();

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

    state.creditsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: keys, datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 2, borderColor: '#020617', hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, cutout: '60%', plugins: { legend: { display: false } } }
    });
}


export function renderWeightChart(deliverables) {
    const ctx = $('credits-chart').getContext('2d');
    const map = {}; deliverables.forEach(d => { map[d.name || d.type] = parseInt(d.weight) || 0; });
    if (state.creditsChart) state.creditsChart.destroy();
    state.creditsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(map), datasets: [{ data: Object.values(map), backgroundColor: COLORS, borderWidth: 2, borderColor: '#020617', hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: true, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 10, font: { family: 'Inter', size: 10, weight: '500' }, color: '#94A3B8' } } } }
    });
}


export function renderCategoryChart(deliverables) {
    const ctx = $('units-chart').getContext('2d');
    const catMap = {}; deliverables.forEach(d => { const c = d.category || d.type || 'other'; catMap[c] = (catMap[c] || 0) + 1; });
    if (state.unitsChart) state.unitsChart.destroy();
    
    // Safety check if canvas doesn't exist
    if (!ctx) return;
    
    state.unitsChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: Object.keys(catMap).map(k => k.charAt(0).toUpperCase() + k.slice(1)), datasets: [{ label: 'Count', data: Object.values(catMap), backgroundColor: COLORS, borderRadius: 4, barThickness: 24 }] },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 }, color: '#94A3B8' }, grid: { color: '#334155' } }, x: { ticks: { font: { size: 9 }, color: '#94A3B8' }, grid: { display: false } } } }
    });
}
