const STATUS_COLORS = {
    Completed: '#3B9EFF',
    'In Progress': '#34D399',
    Pending: '#FB6D5C',
    Other: '#FBBF24',
};
const STATE_COLORS = {
    Active: '#34D399', New: '#8B93A6', Closed: '#3B9EFF',
    'To Do': '#FBBF24', Done: '#3B9EFF', Resolved: '#3B9EFF',
};

let allData = null;
let selectedSprint = 'All';
let selectedAssignee = null;
let selectedStates = new Set();

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

        buildSprintPills(allData.sprints);
        renderSummary(allData);
        buildAssigneeFilter(allData.work_items);
        buildStateFilter(allData.work_items);
        renderIntern(allData.work_items);

        document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
        dashboard.classList.remove('hidden');
    } catch (err) {
        errorBanner.textContent = `Error: ${err.message}`;
        errorBanner.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
        btn.disabled = false;
    }
}

/* ── Sprint ─────────────────────────────────── */
function buildSprintPills(sprints) {
    const container = document.getElementById('sprint-filters');
    const all = ['All', ...sprints];
    container.innerHTML = all.map(s =>
        `<div class="sprint-pill ${s === selectedSprint ? 'active' : ''}" onclick="selectSprint('${s}')">${s}</div>`
    ).join('');
}

async function selectSprint(sprint) {
    selectedSprint = sprint;
    document.querySelectorAll('.sprint-pill').forEach(b =>
        b.classList.toggle('active', b.textContent === sprint));
    const url = sprint === 'All' ? '/api/getWorkItems' : `/api/getWorkItems?sprint=${encodeURIComponent(sprint)}`;
    try {
        const res = await fetch(url);
        allData = await res.json();
        renderSummary(allData);
        renderIntern(allData.work_items);
    } catch (e) { console.error(e); }
}

/* ── Summary ────────────────────────────────── */
function renderSummary(data) {
    const { kpis, by_status, by_assignee } = data;

    document.getElementById('kpi-total').textContent = kpis.total;
    document.getElementById('kpi-total-sub').textContent = `across ${selectedSprint === 'All' ? 'all sprints' : selectedSprint}`;
    document.getElementById('kpi-completed').textContent = kpis.completed;
    document.getElementById('kpi-completed-sub').textContent = kpis.total ? `${Math.round(kpis.completed/kpis.total*100)}% of total` : '';
    document.getElementById('kpi-inprogress').textContent = kpis.in_progress;
    document.getElementById('kpi-inprogress-sub').textContent = kpis.total ? `${Math.round(kpis.in_progress/kpis.total*100)}% of total` : '';
    document.getElementById('kpi-pending').textContent = kpis.pending;
    document.getElementById('kpi-pending-sub').textContent = kpis.total ? `${Math.round(kpis.pending/kpis.total*100)}% of total` : '';
    document.getElementById('kpi-pct').innerHTML = `${kpis.pct_complete}<span style="font-size:24px;color:#7FB4EC;">%</span>`;
    document.getElementById('pct-bar').style.width = kpis.pct_complete + '%';

    renderDonut(by_status, kpis.total);
    renderAssigneeBars(by_assignee);
}

function renderDonut(by_status, total) {
    document.getElementById('donut-total').textContent = total;
    document.getElementById('donut-sub').textContent = `Distribution across ${total} tasks`;

    const statuses = ['Completed', 'In Progress', 'Pending', 'Other'];
    let deg = 0;
    const segments = statuses.map(s => {
        const count = by_status[s] || 0;
        const angle = total ? (count / total) * 360 : 0;
        const seg = { color: STATUS_COLORS[s], start: deg, end: deg + angle, count, label: s };
        deg += angle;
        return seg;
    });

    const conicParts = segments.map(s =>
        `${s.color} ${s.start.toFixed(2)}deg ${s.end.toFixed(2)}deg`
    ).join(', ');
    document.getElementById('donut').style.background =
        `conic-gradient(from -90deg, ${conicParts})`;

    document.getElementById('donut-legend').innerHTML = segments.map(s => {
        const pct = total ? Math.round(s.count / total * 100) : 0;
        const opacity = s.count === 0 ? 'opacity:0.45;' : '';
        return `<div class="legend-item" style="${opacity}">
            <span class="legend-dot" style="background:${s.color};"></span>
            <span class="legend-name">${s.label}</span>
            <span class="legend-count">${s.count}</span>
            <span class="legend-pct">${pct}%</span>
        </div>`;
    }).join('');
}

function renderAssigneeBars(by_assignee) {
    const maxTotal = Math.max(...by_assignee.map(a => a.Completed + a['In Progress'] + a.Pending + a.Other), 1);
    document.getElementById('assignee-bars').innerHTML = by_assignee.map(a => {
        const total = a.Completed + a['In Progress'] + a.Pending + a.Other;
        const widthPct = (total / maxTotal * 100).toFixed(1);
        return `<div class="assignee-row">
            <span class="assignee-name">${a.name}</span>
            <div class="assignee-bar-track">
                <div class="assignee-bar-inner" style="width:${widthPct}%;">
                    <div style="flex:${a.Completed} 1 0;background:#3B9EFF;"></div>
                    <div style="flex:${a['In Progress']} 1 0;background:#34D399;"></div>
                    <div style="flex:${a.Pending} 1 0;background:#FB6D5C;"></div>
                    <div style="flex:${a.Other} 1 0;background:#FBBF24;"></div>
                </div>
            </div>
            <span class="assignee-total">${total}</span>
        </div>`;
    }).join('');
}

/* ── Intern filters ──────────────────────────── */
function buildAssigneeFilter(items) {
    const names = [...new Set(items.map(i => i.assignee))].sort();
    document.getElementById('assignee-filter').innerHTML = names.map(n =>
        `<div class="assignee-pill ${selectedAssignee === n ? 'active' : ''}"
            onclick="selectAssignee(this,'${n.replace(/'/g, "\\'")}')">${n}</div>`
    ).join('');
}

function buildStateFilter(items) {
    const states = [...new Set(items.map(i => i.state))].sort();
    document.getElementById('state-filter').innerHTML = states.map(s =>
        `<div class="state-pill ${selectedStates.has(s) ? 'active' : ''}"
            onclick="toggleState(this,'${s}')">${s}</div>`
    ).join('');
}

function selectAssignee(el, name) {
    selectedAssignee = selectedAssignee === name ? null : name;
    document.querySelectorAll('.assignee-pill').forEach(b =>
        b.classList.toggle('active', b.textContent === selectedAssignee));
    renderIntern(allData.work_items);
}

function toggleState(el, state) {
    if (selectedStates.has(state)) selectedStates.delete(state);
    else selectedStates.add(state);
    el.classList.toggle('active', selectedStates.has(state));
    renderIntern(allData.work_items);
}

/* ── Intern render ───────────────────────────── */
function renderIntern(items) {
    let filtered = items;
    if (selectedAssignee) filtered = filtered.filter(i => i.assignee === selectedAssignee);
    if (selectedStates.size) filtered = filtered.filter(i => selectedStates.has(i.state));

    document.getElementById('intern-total').textContent = filtered.length;

    // Person card
    if (selectedAssignee) {
        const initials = selectedAssignee.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        document.getElementById('person-avatar').textContent = initials;
        document.getElementById('person-name').textContent = selectedAssignee;
        document.getElementById('person-badge').innerHTML =
            `<span class="badge-dot"></span>${filtered.length} work item${filtered.length !== 1 ? 's' : ''} assigned`;
    } else {
        document.getElementById('person-avatar').textContent = '—';
        document.getElementById('person-name').textContent = 'Select a person';
        document.getElementById('person-badge').innerHTML = '';
    }

    // WI by type bars
    const byType = {};
    filtered.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
    const maxType = Math.max(...Object.values(byType), 1);
    const typeOrder = ['User Story', 'Feature', 'Task', 'Bug', 'Epic'];
    const allTypes = [...new Set([...typeOrder.filter(t => byType[t]), ...Object.keys(byType).filter(t => !typeOrder.includes(t))])];
    document.getElementById('type-bars').innerHTML = allTypes.map(t => {
        const count = byType[t] || 0;
        const pct = (count / maxType * 100).toFixed(1);
        return `<div class="type-bar-item">
            <div class="type-bar-header">
                <span class="type-bar-name" style="color:${count ? '#C3CAD8' : '#6B7488'};">${t}</span>
                <span class="type-bar-count" style="color:${count ? '#EEF2F9' : '#6B7488'};">${count}</span>
            </div>
            <div class="type-bar-track"><div class="type-bar-fill" style="width:${pct}%;"></div></div>
        </div>`;
    }).join('');

    // WI by state grid
    const byState = {};
    filtered.forEach(i => { byState[i.state] = (byState[i.state] || 0) + 1; });
    const stateOrder = ['Active', 'New', 'Closed', 'To Do', 'Done', 'Resolved'];
    const allStates = [...new Set([...stateOrder, ...Object.keys(byState)])].slice(0, 8);
    document.getElementById('state-grid').innerHTML = allStates.map(s => {
        const count = byState[s] || 0;
        const color = STATE_COLORS[s] || '#6B7488';
        return `<div class="state-tile">
            <div class="state-tile-header">
                <span class="state-tile-dot" style="background:${color};"></span>
                <span class="state-tile-label">${s}</span>
            </div>
            <div class="state-tile-count" style="color:${count ? '#F3F6FB' : '#6B7488'};">${count}</div>
        </div>`;
    }).join('');

    // Table
    document.querySelector('#wi-table tbody').innerHTML = filtered.map(i =>
        `<tr>
            <td>${i.title}</td>
            <td>${i.state}</td>
            <td>${i.type}</td>
            <td>${i.sprint}</td>
        </tr>`
    ).join('');
}

/* ── Tab switching ───────────────────────────── */
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-btn-${tab}`).classList.add('active');
    document.getElementById('tab-summary').classList.toggle('hidden', tab !== 'summary');
    document.getElementById('tab-intern').classList.toggle('hidden', tab !== 'intern');
}

refresh();
