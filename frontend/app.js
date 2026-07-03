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
const STATUS_MAP = {
    closed: 'Completed', done: 'Completed', resolved: 'Completed', completed: 'Completed',
    active: 'In Progress', 'in progress': 'In Progress', committed: 'In Progress',
    new: 'Pending', 'to do': 'Pending', proposed: 'Pending', ready: 'Pending',
};

let fullItems = [];
let allSprints = [];
let allEpics = [];
let selectedSprint = 'All';
let selectedEpic = 'All';
let selectedEpicIntern = 'All';
let selectedAssignee = null;
let selectedStates = new Set();
let dateFrom = null;
let dateTo = null;

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
        const data = await res.json();

        fullItems = data.work_items;
        allSprints = data.sprints;
        allEpics = [...new Set(fullItems.map(i => i.epic_title))].sort((a, b) =>
            a === '(No Epic)' ? 1 : b === '(No Epic)' ? -1 : a.localeCompare(b));

        if (data.meta) {
            document.getElementById('project-scope-note').textContent =
                `Project: ${data.meta.project} (single-project scope — multi-project not yet supported)`;
        }

        buildSprintPills(allSprints);
        buildEpicPills(allEpics);
        buildAssigneeFilter(fullItems);
        buildStateFilter(fullItems);
        renderAll();

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

/* ── Client-side compute ────────────────────── */
function computeSummary(items) {
    const by_status = { Completed: 0, 'In Progress': 0, Pending: 0, Other: 0 };
    const by_assignee_map = {};

    items.forEach(i => {
        const sg = STATUS_MAP[(i.state || '').toLowerCase()] || 'Other';
        by_status[sg]++;
        if (!by_assignee_map[i.assignee]) {
            by_assignee_map[i.assignee] = { Completed: 0, 'In Progress': 0, Pending: 0, Other: 0 };
        }
        by_assignee_map[i.assignee][sg]++;
    });

    const total = items.length;
    const completed = by_status.Completed;
    const by_assignee = Object.entries(by_assignee_map)
        .map(([name, counts]) => ({ name, ...counts }))
        .sort((a, b) => (b.Completed + b['In Progress'] + b.Pending + b.Other) - (a.Completed + a['In Progress'] + a.Pending + a.Other));

    return {
        kpis: {
            total,
            completed,
            in_progress: by_status['In Progress'],
            pending: by_status.Pending,
            pct_complete: total ? parseFloat((completed / total * 100).toFixed(1)) : 0,
            blocked: items.filter(i => i.is_blocked).length,
            overdue: items.filter(i => i.is_overdue).length,
            unassigned: items.filter(i => i.is_unassigned).length,
            stale: items.filter(i => i.is_stale).length,
        },
        by_status,
        by_assignee,
    };
}

function computeByEpic(items) {
    const map = {};
    items.forEach(i => {
        const key = i.epic_title || '(No Epic)';
        if (!map[key]) map[key] = { name: key, Completed: 0, 'In Progress': 0, Pending: 0, Other: 0 };
        const sg = STATUS_MAP[(i.state || '').toLowerCase()] || 'Other';
        map[key][sg]++;
    });
    return Object.values(map)
        .sort((a, b) => (b.Completed + b['In Progress'] + b.Pending + b.Other) - (a.Completed + a['In Progress'] + a.Pending + a.Other));
}

function filteredBySprint(items) {
    return selectedSprint === 'All' ? items : items.filter(i => i.sprint === selectedSprint);
}

function filteredByEpic(items) {
    return selectedEpic === 'All' ? items : items.filter(i => i.epic_title === selectedEpic);
}

function filteredByDateRange(items) {
    if (!dateFrom && !dateTo) return items;
    return items.filter(i => {
        const d = new Date(i.created_date);
        if (isNaN(d)) return false;
        if (dateFrom && d < new Date(dateFrom)) return false;
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            if (d > to) return false;
        }
        return true;
    });
}

function applyDateRange() {
    dateFrom = document.getElementById('date-from').value || null;
    dateTo = document.getElementById('date-to').value || null;
    renderAll();
}

function clearDateRange() {
    dateFrom = null;
    dateTo = null;
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    renderAll();
}

function filteredForSummary(items) {
    return filteredByDateRange(filteredByEpic(filteredBySprint(items)));
}

function filteredByIntern(items) {
    let f = filteredByDateRange(filteredBySprint(items));
    if (selectedAssignee) f = f.filter(i => i.assignee === selectedAssignee);
    if (selectedStates.size) f = f.filter(i => selectedStates.has(i.state));
    if (selectedEpicIntern !== 'All') f = f.filter(i => i.epic_title === selectedEpicIntern);
    return f;
}

function renderAll() {
    const scoped = filteredForSummary(fullItems);
    const summary = computeSummary(scoped);
    renderSummary(summary);
    renderEpicBars(computeByEpic(filteredByDateRange(filteredBySprint(fullItems))));
    renderAttentionTable(scoped);
    renderRecentActivity(scoped);
    renderIntern(filteredByIntern(fullItems));
}

/* ── Recent Activity (last 7 days) ───────────── */
const RECENT_WINDOW_DAYS = 7;

function daysAgo(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return (Date.now() - d.getTime()) / 86400000;
}

function renderRecentActivity(items) {
    const completed = items
        .filter(i => i.status_group === 'Completed' && daysAgo(i.closed_date || i.changed_date) !== null && daysAgo(i.closed_date || i.changed_date) <= RECENT_WINDOW_DAYS)
        .sort((a, b) => daysAgo(a.closed_date || a.changed_date) - daysAgo(b.closed_date || b.changed_date));

    const updated = items
        .filter(i => daysAgo(i.changed_date) !== null && daysAgo(i.changed_date) <= RECENT_WINDOW_DAYS)
        .sort((a, b) => daysAgo(a.changed_date) - daysAgo(b.changed_date));

    const created = items
        .filter(i => daysAgo(i.created_date) !== null && daysAgo(i.created_date) <= RECENT_WINDOW_DAYS)
        .sort((a, b) => daysAgo(a.created_date) - daysAgo(b.created_date));

    fillRecentCol('completed', completed, i => `Closed ${Math.round(daysAgo(i.closed_date || i.changed_date))}d ago · ${i.assignee}`);
    fillRecentCol('updated', updated, i => `Updated ${Math.round(daysAgo(i.changed_date))}d ago · ${i.state}`);
    fillRecentCol('created', created, i => `Created ${Math.round(daysAgo(i.created_date))}d ago · ${i.assignee}`);
}

function fillRecentCol(key, list, metaFn) {
    document.getElementById(`recent-${key}-count`).textContent = list.length;
    const el = document.getElementById(`recent-${key}-list`);
    if (!list.length) {
        el.innerHTML = '<div class="recent-empty">Nothing in the last 7 days.</div>';
        return;
    }
    el.innerHTML = list.slice(0, 8).map(i => `
        <div class="recent-item">
            <span class="recent-item-title">${i.title}</span>
            <span class="recent-item-meta">${metaFn(i)}</span>
        </div>`
    ).join('');
}

/* ── Sprint ─────────────────────────────────── */
function buildSprintPills(sprints) {
    const all = ['All', ...sprints];
    const html = all.map(s =>
        `<div class="sprint-pill ${s === selectedSprint ? 'active' : ''}" onclick="selectSprint('${s}')">${s}</div>`
    ).join('');
    document.getElementById('sprint-filters').innerHTML = html;
    document.getElementById('sprint-filters-intern').innerHTML = html;
}

function selectSprint(sprint) {
    selectedSprint = sprint;
    document.querySelectorAll('#sprint-filters .sprint-pill, #sprint-filters-intern .sprint-pill').forEach(b =>
        b.classList.toggle('active', b.textContent.trim() === sprint));
    renderAll();
}

/* ── Epic ───────────────────────────────────── */
function buildEpicPills(epics) {
    const all = ['All', ...epics];
    const html = all.map(e =>
        `<div class="sprint-pill epic-pill ${e === selectedEpic ? 'active' : ''}" onclick="selectEpic('${e.replace(/'/g, "\\'")}')">${e}</div>`
    ).join('');
    document.getElementById('epic-filters').innerHTML = html;

    const internHtml = all.map(e =>
        `<div class="sprint-pill epic-pill-intern ${e === selectedEpicIntern ? 'active' : ''}" onclick="selectEpicIntern('${e.replace(/'/g, "\\'")}')">${e}</div>`
    ).join('');
    document.getElementById('epic-filter-intern').innerHTML = internHtml;
}

function selectEpic(epic) {
    selectedEpic = epic;
    document.querySelectorAll('.epic-pill').forEach(b =>
        b.classList.toggle('active', b.textContent.trim() === epic));
    renderAll();
}

function selectEpicIntern(epic) {
    selectedEpicIntern = epic;
    document.querySelectorAll('.epic-pill-intern').forEach(b =>
        b.classList.toggle('active', b.textContent.trim() === epic));
    renderIntern(filteredByIntern(fullItems));
}

function jumpToEpicInIntern(epic) {
    selectedEpicIntern = epic;
    switchTab('intern');
    buildEpicPills(allEpics);
    renderIntern(filteredByIntern(fullItems));
}

/* ── Summary ────────────────────────────────── */
function renderSummary({ kpis, by_status, by_assignee }) {
    document.getElementById('kpi-total').textContent = kpis.total;
    document.getElementById('kpi-total-sub').textContent = `across ${selectedSprint === 'All' ? 'all sprints' : selectedSprint}`;
    document.getElementById('kpi-completed').textContent = kpis.completed;
    document.getElementById('kpi-completed-sub').textContent = kpis.total ? `${Math.round(kpis.completed / kpis.total * 100)}% of total` : '';
    document.getElementById('kpi-inprogress').textContent = kpis.in_progress;
    document.getElementById('kpi-inprogress-sub').textContent = kpis.total ? `${Math.round(kpis.in_progress / kpis.total * 100)}% of total` : '';
    document.getElementById('kpi-pending').textContent = kpis.pending;
    document.getElementById('kpi-pending-sub').textContent = kpis.total ? `${Math.round(kpis.pending / kpis.total * 100)}% of total` : '';
    document.getElementById('kpi-pct').innerHTML = `${kpis.pct_complete}<span style="font-size:24px;color:#7FB4EC;">%</span>`;
    document.getElementById('pct-bar').style.width = kpis.pct_complete + '%';

    document.getElementById('kpi-blocked').textContent = kpis.blocked;
    document.getElementById('kpi-overdue').textContent = kpis.overdue;
    document.getElementById('kpi-unassigned').textContent = kpis.unassigned;
    document.getElementById('kpi-stale').textContent = kpis.stale;

    renderDonut(by_status, kpis.total);
    renderAssigneeBars(by_assignee);
}

function renderEpicBars(by_epic) {
    if (!by_epic.length) {
        document.getElementById('epic-bars').innerHTML = '<div style="color:#6B7488;font-size:13px;">No epics found in this sprint.</div>';
        return;
    }
    const maxTotal = Math.max(...by_epic.map(e => e.Completed + e['In Progress'] + e.Pending + e.Other), 1);
    document.getElementById('epic-bars').innerHTML = by_epic.map(e => {
        const total = e.Completed + e['In Progress'] + e.Pending + e.Other;
        const widthPct = (total / maxTotal * 100).toFixed(1);
        return `<div class="assignee-row" style="cursor:pointer;" onclick="jumpToEpicInIntern('${e.name.replace(/'/g, "\\'")}')">
            <span class="assignee-name">${e.name}</span>
            <div class="assignee-bar-track">
                <div class="assignee-bar-inner" style="width:${widthPct}%;">
                    <div style="flex:${e.Completed} 1 0;background:#3B9EFF;"></div>
                    <div style="flex:${e['In Progress']} 1 0;background:#34D399;"></div>
                    <div style="flex:${e.Pending} 1 0;background:#FB6D5C;"></div>
                    <div style="flex:${e.Other} 1 0;background:#FBBF24;"></div>
                </div>
            </div>
            <span class="assignee-total">${total}</span>
        </div>`;
    }).join('');
}

function formatLastUpdated(item) {
    if (item.stale_days === null || item.stale_days === undefined) return '—';
    if (item.stale_days === 0) return 'Today';
    if (item.stale_days === 1) return '1 day ago';
    return `${item.stale_days} days ago`;
}

function severityRank(item) {
    if (item.is_blocked) return 0;
    if (item.is_overdue) return 1;
    if (item.is_unassigned) return 2;
    if (item.is_stale) return 3;
    return 4;
}

function renderAttentionTable(items) {
    const flagged = items
        .filter(i => i.attention_reasons && i.attention_reasons.length)
        .sort((a, b) => severityRank(a) - severityRank(b) || (b.stale_days || 0) - (a.stale_days || 0));

    document.getElementById('attention-sub').textContent =
        `${flagged.length} of ${items.length} work items need attention`;

    if (!flagged.length) {
        document.querySelector('#attention-table tbody').innerHTML =
            '<tr><td colspan="5" style="color:#6B7488;">Nothing needs attention in this view.</td></tr>';
        return;
    }

    document.querySelector('#attention-table tbody').innerHTML = flagged.map(i => `
        <tr>
            <td>${i.title}</td>
            <td>${i.assignee}</td>
            <td>${i.state}</td>
            <td>${formatLastUpdated(i)}</td>
            <td style="color:#FB6D5C;">${i.attention_reasons.join(', ')}</td>
        </tr>`
    ).join('');
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

    document.getElementById('donut').style.background =
        `conic-gradient(from -90deg, ${segments.map(s => `${s.color} ${s.start.toFixed(2)}deg ${s.end.toFixed(2)}deg`).join(', ')})`;

    document.getElementById('donut-legend').innerHTML = segments.map(s => {
        const pct = total ? Math.round(s.count / total * 100) : 0;
        return `<div class="legend-item" style="${s.count === 0 ? 'opacity:0.45;' : ''}">
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
            onclick="selectAssignee('${n.replace(/'/g, "\\'")}')">${n}</div>`
    ).join('');
}

function buildStateFilter(items) {
    const states = [...new Set(items.map(i => i.state))].sort();
    document.getElementById('state-filter').innerHTML = states.map(s =>
        `<div class="state-pill ${selectedStates.has(s) ? 'active' : ''}"
            onclick="toggleState('${s}')">${s}</div>`
    ).join('');
}

function selectAssignee(name) {
    selectedAssignee = selectedAssignee === name ? null : name;
    document.querySelectorAll('.assignee-pill').forEach(b =>
        b.classList.toggle('active', b.textContent.trim() === selectedAssignee));
    renderIntern(filteredByIntern(fullItems));
}

function toggleState(state) {
    if (selectedStates.has(state)) selectedStates.delete(state);
    else selectedStates.add(state);
    document.querySelectorAll('.state-pill').forEach(b =>
        b.classList.toggle('active', selectedStates.has(b.textContent.trim())));
    renderIntern(filteredByIntern(fullItems));
}

/* ── Intern render ───────────────────────────── */
function renderIntern(items) {
    document.getElementById('intern-total').textContent = items.length;

    if (selectedAssignee) {
        const initials = selectedAssignee.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        document.getElementById('person-avatar').textContent = initials;
        document.getElementById('person-name').textContent = selectedAssignee;
        document.getElementById('person-badge').innerHTML =
            `<span class="badge-dot"></span>${items.length} work item${items.length !== 1 ? 's' : ''} assigned`;
    } else {
        document.getElementById('person-avatar').textContent = '—';
        document.getElementById('person-name').textContent = 'Select a person';
        document.getElementById('person-badge').innerHTML = '';
    }

    const byType = {};
    items.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
    const maxType = Math.max(...Object.values(byType), 1);
    const typeOrder = ['User Story', 'Feature', 'Task', 'Bug', 'Epic'];
    const allTypes = [...new Set([...typeOrder.filter(t => byType[t]), ...Object.keys(byType).filter(t => !typeOrder.includes(t))])];
    document.getElementById('type-bars').innerHTML = allTypes.map(t => {
        const count = byType[t] || 0;
        return `<div class="type-bar-item">
            <div class="type-bar-header">
                <span class="type-bar-name" style="color:${count ? '#C3CAD8' : '#6B7488'};">${t}</span>
                <span class="type-bar-count" style="color:${count ? '#EEF2F9' : '#6B7488'};">${count}</span>
            </div>
            <div class="type-bar-track"><div class="type-bar-fill" style="width:${(count / maxType * 100).toFixed(1)}%;"></div></div>
        </div>`;
    }).join('');

    const byState = {};
    items.forEach(i => { byState[i.state] = (byState[i.state] || 0) + 1; });
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

    document.querySelector('#wi-table tbody').innerHTML = items.map(i =>
        `<tr>
            <td>${i.title}</td>
            <td>${i.state}</td>
            <td>${i.type}</td>
            <td>${i.sprint}</td>
            <td>${i.epic_title || '(No Epic)'}</td>
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
