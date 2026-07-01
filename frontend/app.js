async function fetchWorkItems() {
    const btn = document.getElementById('refresh-btn');
    const loading = document.getElementById('loading');
    const rawData = document.getElementById('raw-data');
    const errorBanner = document.getElementById('error-banner');
    const jsonOutput = document.getElementById('json-output');
    const itemCount = document.getElementById('item-count');
    const lastUpdated = document.getElementById('last-updated');

    btn.disabled = true;
    loading.classList.remove('hidden');
    rawData.classList.add('hidden');
    errorBanner.classList.add('hidden');

    try {
        const res = await fetch('/api/getWorkItems');
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();

        jsonOutput.textContent = JSON.stringify(data, null, 2);
        itemCount.textContent = `${data.length} work items`;
        lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
        rawData.classList.remove('hidden');
    } catch (err) {
        errorBanner.textContent = `Error: ${err.message}`;
        errorBanner.classList.remove('hidden');
    } finally {
        loading.classList.add('hidden');
        btn.disabled = false;
    }
}

fetchWorkItems();
