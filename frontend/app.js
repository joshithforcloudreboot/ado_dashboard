const COLORS = {
    Completed: '#2196F3',
    Pending: '#F44336',
    'In Progress': '#4CAF50',
    Other: '#FF9800',
};

let donutChart = null;
let barChart = null;
let typeChart = null;

let allData = null;
let selectedSprint = 'All';
let selectedAssignee = null;
let selectedStates = new Set();
let activeTab = 'summary';

async function refresh() {
    const btn = document.getElementById('refresh-btn');
    const loading = document.getElementById('loading');
    const dashboard = document.getElementById('dashboard');
    const errorBanner = document.getElementById('error-banner');

    btn.disabled = true;
    loading.classList.remove('hidden');
    dashboard.classList.add('hidden');
    errorBanner.classList.add('hidden');

    try {
        const res = await fetch('/api/getWorkItems');
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        allData = await res.json();

        buildSprintFilters(allData.sprints);
        buildAssigneeFilter(allData.work_items);
        buildStateFilter(allData.work_items);

        renderSummary(allData);
        renderIntern(allData.work_items);

        document.getElementById('last-updated').textContent =
            `Last updated: ${new Date().toLocaleTimeString()}`;
        dashboard.classList.remove('hidden');
    } catch (err) {
        errorBanner.textContent = `Error: ${err.message}`;
        errorBanner.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
        btn.disabled = false;
    }
}

/* ── Sprint Filter ─────────────────────────────────────── */
function buildSprintFilters(sprints) {
    const container = document.getElementById('sprint-filters');
    const all = ['All', ...sprints];
    container.innerHTML = all.map(s =>
        `<button class="sprint-btn ${s === selectedSprint ? 'active' : ''}"
            onclick="selectSprint('${s}')">${s}</button>`
    ).join('');
}

async function selectSprint(sprint) {
    selectedSprint = sprint;
    document.querySelectorAll('.sprint-btn').forEach(b =>
        b.classList.toggle('active', b.textContent === sprint));

    const url = sprint === 'All' ? '/api/getWorkItems' : `/api/getWorkItems?sprint=${encodeURIComponent(sprint)}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        allData = data;
        renderSummary(data);
        renderIntern(data.work_items);
    } catch (e) { console.error(e); }
}

/* ── Summary Tab ───────────────────────────────────────── */
function renderSummary(data) {
    const { kpis, by_status, by_assignee } = data;

    document.getElementById('kpi-total').textContent = kpis.total;
    document.getElementById('kpi-completed').textContent = kpis.completed;
    document.getElementById('kpi-inprogress').textContent = kpis.in_progress;
    document.getElementById('kpi-pending').textContent = kpis.pending;
    document.getElementById('kpi-pct').textContent = kpis.pct_complete + '%';

    renderDonut(by_status);
    renderBar(by_assignee);
}

function renderDonut(by_status) {
    const labels = Object.keys(by_status);
    const values = Object.values(by_status);
    const colors = labels.map(l => COLORS[l] || '#999');

    if (donutChart) donutChart.destroy();
    donutChart = new Chart(document.getElementById('donut-chart'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
            cutout: '60%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                            return ` ${ctx.raw} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });

    const legend = document.getElementById('donut-legend');
    legend.innerHTML = labels.map((l, i) =>
        `<div class="legend-item">
            <div class="legend-dot" style="background:${colors[i]}"></div>
            <span>${l}</span>
        </div>`
    ).join('');
}

function renderBar(by_assignee) {
    const statuses = ['Completed', 'In Progress', 'Other', 'Pending'];
    const names = by_assignee.map(a => a.name);

    if (barChart) barChart.destroy();
    barChart = new Chart(document.getElementById('bar-chart'), {
        type: 'bar',
        data: {
            labels: names,
            datasets: statuses.map(s => ({
                label: s,
                data: by_assignee.map(a => a[s] || 0),
                backgroundColor: COLORS[s] || '#999',
                borderRadius: 2,
            }))
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { boxWidth: 12, font: { size: 12 } }
                }
            },
            scales: {
                x: {
                    stacked: false,
                    title: { display: true, text: 'Total Tasks', font: { size: 12 } },
                    ticks: { precision: 0 }
                },
                y: { stacked: false, ticks: { font: { size: 12 } } }
            }
        }
    });
}

/* ── Intern Tab ────────────────────────────────────────── */
function buildAssigneeFilter(items) {
    const names = [...new Set(items.map(i => i.assignee))].sort();
    const container = document.getElementById('assignee-filter');
    container.innerHTML = names.map(n =>
        `<button class="assignee-btn ${selectedAssignee === n ? 'active' : ''}"
            onclick="selectAssignee('${n.replace(/'/g, "\\'")}')">${n}</button>`
    ).join('');
}

function buildStateFilter(items) {
    const states = [...new Set(items.map(i => i.state))].sort();
    const container = document.getElementById('state-filter');
    container.innerHTML = states.map(s =>
        `<button class="state-btn ${selectedStates.has(s) ? 'active' : ''}"
            onclick="toggleState('${s}')">${s}</button>`
    ).join('');
}

function selectAssignee(name) {
    selectedAssignee = selectedAssignee === name ? null : name;
    document.querySelectorAll('.assignee-btn').forEach(b =>
        b.classList.toggle('active', b.textContent === selectedAssignee));
    renderIntern(allData.work_items);
}

function toggleState(state) {
    if (selectedStates.has(state)) selectedStates.delete(state);
    else selectedStates.add(state);
    document.querySelectorAll('.state-btn').forEach(b =>
        b.classList.toggle('active', selectedStates.has(b.textContent)));
    renderIntern(allData.work_items);
}

function renderIntern(items) {
    let filtered = items;
    if (selectedAssignee) filtered = filtered.filter(i => i.assignee === selectedAssignee);
    if (selectedStates.size) filtered = filtered.filter(i => selectedStates.has(i.state));

    document.getElementById('intern-total').textContent = filtered.length;

    const byType = {};
    filtered.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
    const typeLabels = Object.keys(byType);
    const typeValues = Object.values(byType);

    if (typeChart) typeChart.destroy();
    typeChart = new Chart(document.getElementById('type-chart'), {
        type: 'bar',
        data: {
            labels: typeLabels,
            datasets: [{
                label: 'WI Total',
                data: typeValues,
                backgroundColor: '#2196F3',
                borderRadius: 3,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    title: { display: true, text: 'WI Total', font: { size: 12 } },
                    ticks: { precision: 0 }
                }
            }
        }
    });

    const tbody = document.querySelector('#wi-table tbody');
    tbody.innerHTML = filtered.map(i =>
        `<tr>
            <td>${i.title}</td>
            <td>${i.state}</td>
            <td>${i.type}</td>
        </tr>`
    ).join('');
}

/* ── Tab Switching ─────────────────────────────────────── */
function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach((b, i) =>
        b.classList.toggle('active', ['summary', 'intern'][i] === tab));
    document.getElementById('tab-summary').classList.toggle('hidden', tab !== 'summary');
    document.getElementById('tab-intern').classList.toggle('hidden', tab !== 'intern');
}

refresh();
