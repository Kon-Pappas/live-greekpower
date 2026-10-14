// --- 1. Global ECharts Instances & State Management ---
let supplyChart, demandChart, flowsChart, dailyDispatchChart, xrayChart, reconciliationChart;
const fmt = (num) => new Intl.NumberFormat('en-US').format(Math.round(num));

// Global State Variables
let globalData = [];
let xrayData = [];
let entsoeData = [];
let latestDateGlobal = '';
let currentActiveTab = 'tab-live';
let validLiveRecord = null;
let selectedHourLive = null;
let selectedDateDaily = null;

// --- 2. Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    setupTabSwitcher();
    document.getElementById('context-dropdown').addEventListener('change', handleDropdownChange);
    loadData();
});

function initCharts() {
    supplyChart = echarts.init(document.getElementById('supplyChart'), 'dark');
    demandChart = echarts.init(document.getElementById('demandChart'), 'dark');
    flowsChart = echarts.init(document.getElementById('flowsChart'), 'dark');
    dailyDispatchChart = echarts.init(document.getElementById('dailyDispatchChart'), 'dark');
    xrayChart = echarts.init(document.getElementById('xrayChart'), 'dark');
    reconciliationChart = echarts.init(document.getElementById('reconciliationChart'), 'dark');

    window.addEventListener('resize', () => {
        if(supplyChart) supplyChart.resize(); 
        if(demandChart) demandChart.resize(); 
        if(flowsChart) flowsChart.resize(); 
        if(dailyDispatchChart) dailyDispatchChart.resize();
        if(xrayChart) xrayChart.resize();
        if(reconciliationChart) reconciliationChart.resize();
    });
}

function setupTabSwitcher() {
    document.querySelectorAll('.nav-tab-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = tab.getAttribute('data-target');
            
            // --- Auto-Fallback logic for Tab 3 (X-Ray) ---
            if (targetId === 'tab-xray' && selectedDateDaily === latestDateGlobal) {
                const uniqueDates = [...new Set(globalData.map(d => d.date))].reverse();
                if (uniqueDates.length > 1) {
                    selectedDateDaily = uniqueDates[1]; // Switch to yesterday automatically
                }
            }

            document.querySelectorAll('.nav-tab-item').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            currentActiveTab = targetId;
            updateDropdownState();
            
            setTimeout(() => {
                if(supplyChart) supplyChart.resize(); 
                if(demandChart) demandChart.resize(); 
                if(flowsChart) flowsChart.resize(); 
                if(dailyDispatchChart) dailyDispatchChart.resize();
                if(xrayChart) xrayChart.resize();
                if(reconciliationChart) reconciliationChart.resize();
            }, 50);
        });
    });
}

// --- 3. Main Data Fetcher & Deduplication ---
async function loadData() {
    try {
        const ts = new Date().getTime();
        const [liveRes, xrayRes, entsoeRes] = await Promise.all([
            fetch(`data/live_data.json?v=${ts}`).then(r => r.ok ? r.json() : []),
            fetch(`data/xray_data.json?v=${ts}`).then(r => r.ok ? r.json() : []).catch(() => []),
            fetch(`data/entsoe_ref.json?v=${ts}`).then(r => r.ok ? r.json() : []).catch(() => [])
        ]);
        
        if (!liveRes || liveRes.length === 0) throw new Error("No data found in live_data.json.");

        xrayData = xrayRes || [];
        entsoeData = entsoeRes || [];

        const cleanDataMap = new Map();
        liveRes.forEach(entry => {
            let hr = parseInt(entry.target_hour);
            if (hr === 0 || hr > 24) return; 
            entry.target_hour = hr; 
            
            const key = `${entry.date}_${hr}`;
            if (!cleanDataMap.has(key)) {
                cleanDataMap.set(key, entry);
            } else {
                const existingTime = new Date(cleanDataMap.get(key).fetch_timestamp).getTime();
                const newTime = new Date(entry.fetch_timestamp).getTime();
                if (newTime > existingTime) cleanDataMap.set(key, entry);
            }
        });

        globalData = Array.from(cleanDataMap.values()).sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.target_hour - b.target_hour;
        });

        for (let i = globalData.length - 1; i >= 0; i--) {
            let d = globalData[i];
            let totalGen = d.production_mix['TOTAL_PROD'] || 0;
            let demand = d.demand_mwh || 0;
            if (totalGen > 0 || demand > 0) {
                validLiveRecord = d;
                break;
            }
        }
        if (!validLiveRecord) validLiveRecord = globalData[globalData.length - 1];

        latestDateGlobal = validLiveRecord.date;
        selectedHourLive = validLiveRecord.target_hour;
        selectedDateDaily = validLiveRecord.date;

        updateDropdownState();
        loadRecords();

    } catch (error) {
        console.error("Error loading data:", error);
        document.getElementById('last-updated').innerText = "Failed to load data.";
    }
}

// --- 4. Context-Aware Dropdown Manager ---
function updateDropdownState() {
    const dropdown = document.getElementById('context-dropdown');
    dropdown.innerHTML = '';
    
    if (currentActiveTab === 'tab-live') {
        const todayRecords = globalData.filter(d => d.date === latestDateGlobal);
        todayRecords.forEach(rec => {
            let hrStr = rec.target_hour.toString().padStart(2, '0') + ':00';
            let option = document.createElement('option');
            option.value = rec.target_hour;
            option.text = `Hour: ${hrStr}`;
            dropdown.appendChild(option);
        });
        
        if(todayRecords.find(r => r.target_hour === selectedHourLive)) dropdown.value = selectedHourLive;
        else { dropdown.value = validLiveRecord.target_hour; selectedHourLive = validLiveRecord.target_hour; }
        
    } else {
        const uniqueDates = [...new Set(globalData.map(d => d.date))].reverse();
        uniqueDates.forEach(dt => {
            let option = document.createElement('option');
            option.value = dt;
            let formattedDate = `${dt.substring(6,8)}/${dt.substring(4,6)}/${dt.substring(0,4)}`;
            if(dt === latestDateGlobal) formattedDate += " (Today)";
            option.text = `Date: ${formattedDate}`;
            dropdown.appendChild(option);
        });
        
        if(uniqueDates.includes(selectedDateDaily)) dropdown.value = selectedDateDaily;
        else { dropdown.value = uniqueDates[0]; selectedDateDaily = uniqueDates[0]; }
    }
    
    handleDropdownChange(); 
}

function handleDropdownChange() {
    const dropdown = document.getElementById('context-dropdown');
    const val = dropdown.value;
    const pill = document.getElementById('live-status-pill');
    
    if (currentActiveTab === 'tab-live') {
        selectedHourLive = parseInt(val);
        const record = globalData.find(d => d.date === latestDateGlobal && d.target_hour === selectedHourLive);
        
        const fetchTime = new Date(record.fetch_timestamp).toLocaleString('en-GB');
        const displayHour = record.target_hour.toString().padStart(2, '0') + ':00';
        document.getElementById('last-updated').innerText = `Last Update: ${fetchTime} | Target Hour: ${displayHour}`;
        
        if (record.target_hour === validLiveRecord.target_hour) {
            pill.innerHTML = '● Live Data Active';
            pill.style.color = 'var(--accent-green)'; pill.style.borderColor = 'rgba(46, 204, 113, 0.3)'; pill.style.backgroundColor = 'rgba(46, 204, 113, 0.15)';
        } else {
            pill.innerHTML = '● Historical Hour';
            pill.style.color = '#ffc000'; pill.style.borderColor = 'rgba(255, 192, 0, 0.3)'; pill.style.backgroundColor = 'rgba(255, 192, 0, 0.15)';
        }
        
        renderLiveTab(record);
        
    } else {
        selectedDateDaily = val;
        const dailyRecords = globalData.filter(d => d.date === selectedDateDaily);
        
        const latestRec = dailyRecords[dailyRecords.length - 1] || {};
        const fetchTime = latestRec.fetch_timestamp ? new Date(latestRec.fetch_timestamp).toLocaleString('en-GB') : '-';
        let formattedDate = `${selectedDateDaily.substring(6,8)}/${selectedDateDaily.substring(4,6)}/${selectedDateDaily.substring(0,4)}`;
        document.getElementById('last-updated').innerText = `Last Update: ${fetchTime} | Selected Date: ${formattedDate}`;
        
        if (selectedDateDaily === latestDateGlobal) {
            pill.innerHTML = '● Today';
            pill.style.color = 'var(--accent-green)'; pill.style.borderColor = 'rgba(46, 204, 113, 0.3)'; pill.style.backgroundColor = 'rgba(46, 204, 113, 0.15)';
        } else {
            pill.innerHTML = '● Historical Day';
            pill.style.color = '#ffc000'; pill.style.borderColor = 'rgba(255, 192, 0, 0.3)'; pill.style.backgroundColor = 'rgba(255, 192, 0, 0.15)';
        }
        
        if (currentActiveTab === 'tab-daily') {
            renderDailyTab(dailyRecords);
        } else if (currentActiveTab === 'tab-xray') {
            renderXrayTab(selectedDateDaily);
        }
    }
}

// --- 5. Render Logic for Tab 1 (Live) ---
function renderLiveTab(latestData) {
    let live = {
        lignite: latestData.production_mix['TOTAL LIGNITE'] || 0,
        gas: latestData.production_mix['TOTAL GAS'] || 0,
        hydro: latestData.production_mix['TOTAL HYDRO'] || 0,
        res: latestData.production_mix['RES_PROD'] || 0,
        totalGen: latestData.production_mix['TOTAL_PROD'] || 0,
        stIn: latestData.production_mix['STORAGE_INJECTION'] || 0,
        stAbs: Math.abs(latestData.production_mix['STORAGE_ABSORPTION'] || 0),
        pump: latestData.production_mix['ΣΥΝΟΛΙΚΗ ΑΝΤΛΗΣΗ'] || 0,
        imports: 0, exports: 0,
        mcp: latestData.dam_price_eur || 0
    };
    
    const countryKeys = ['ΑΛΒΑΝΙΑ', 'ΒΟΥΛΓΑΡΙΑ', 'ΙΤΑΛΙΑ', 'ΤΟΥΡΚΙΑ', 'FYROM'];
    countryKeys.forEach(c => {
        live.imports += (latestData.interconnections_mwh[`${c}_IMP`] || 0);
        live.exports += (latestData.interconnections_mwh[`${c}_EXP`] || 0);
    });

    let liveTotalSupply = live.totalGen + live.stIn + live.imports;
    let liveTotalSinks = live.pump + live.stAbs + live.exports;
    let liveDemand = liveTotalSupply - liveTotalSinks;

    document.getElementById('render-gen-ledger').innerHTML = `
        <div class="ledger-row c-lignite"><span class="ledger-label">Lignite</span><span class="ledger-operator"></span><span class="ledger-value">${fmt(live.lignite)}</span></div>
        <div class="ledger-row c-gas"><span class="ledger-label">N. Gas</span><span class="ledger-operator">+</span><span class="ledger-value">${fmt(live.gas)}</span></div>
        <div class="ledger-row c-hydro"><span class="ledger-label">Hydro</span><span class="ledger-operator">+</span><span class="ledger-value">${fmt(live.hydro)}</span></div>
        <div class="ledger-row c-res"><span class="ledger-label">RES</span><span class="ledger-operator">+</span><span class="ledger-value">${fmt(live.res)}</span></div>
        <div class="ledger-divider"></div>
        <div class="ledger-total-row">
            <span class="ledger-total-label">= SUM</span>
            <span class="ledger-total-value text-white">${fmt(live.totalGen)}</span>
        </div>
    `;

    document.getElementById('render-dem-ledger').innerHTML = `
        <div class="ledger-row text-white"><span class="ledger-label">Generation</span><span class="ledger-operator"></span><span class="ledger-value">${fmt(live.totalGen)}</span></div>
        <div class="ledger-row c-imports"><span class="ledger-label">Imports</span><span class="ledger-operator">+</span><span class="ledger-value">${fmt(live.imports)}</span></div>
        <div class="ledger-row c-exports"><span class="ledger-label">Exports</span><span class="ledger-operator">-</span><span class="ledger-value">${fmt(live.exports)}</span></div>
        <div class="ledger-row c-storage"><span class="ledger-label">St. Disch.</span><span class="ledger-operator">+</span><span class="ledger-value">${fmt(live.stIn)}</span></div>
        <div class="ledger-row c-storage" style="color: var(--color-storage-chg);"><span class="ledger-label">St. Charge</span><span class="ledger-operator">-</span><span class="ledger-value">${fmt(live.stAbs)}</span></div>
        <div class="ledger-row c-pump"><span class="ledger-label">Pumping</span><span class="ledger-operator">-</span><span class="ledger-value">${fmt(live.pump)}</span></div>
        <div class="ledger-divider"></div>
        <div class="ledger-total-row">
            <span class="ledger-total-label">= NET</span>
            <span class="ledger-total-value">${fmt(liveDemand)}</span>
        </div>
    `;

    const getDonutOpt = (title, data) => ({
        backgroundColor: 'transparent',
        title: [
            { text: title, left: 'center', top: 5, textStyle: { color: '#ffffff', fontSize: 13 } },
            { text: `${fmt(liveTotalSupply)}\nMWh`, left: 'center', top: 'center', textStyle: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' } }
        ],
        tooltip: { trigger: 'item', formatter: (p) => `${p.name}: <br/> <b>${fmt(p.value)} MWh</b> (${p.percent}%)` },
        legend: { top: 'bottom', textStyle: { color: '#8892b0', fontSize: 10 } },
        series: [{ type: 'pie', radius: ['45%', '70%'], itemStyle: { borderRadius: 4, borderColor: '#1c2128', borderWidth: 2 }, label: { show: true, formatter: '{b}\n{d}%', color: '#fff', fontSize: 10 }, labelLine: { length: 8, length2: 10 }, data: data }]
    });

    let sData = [
        { value: live.lignite, name: 'Lignite', itemStyle: { color: '#b06a4b' } },
        { value: live.gas, name: 'Nat. Gas', itemStyle: { color: '#d18b57' } },
        { value: live.hydro, name: 'Hydro', itemStyle: { color: '#5b9bd5' } },
        { value: live.res, name: 'RES', itemStyle: { color: '#70ad47' } },
        { value: live.stIn, name: 'St. Disch.', itemStyle: { color: '#e0c2cd' } },
        { value: live.imports, name: 'Imports', itemStyle: { color: '#ffc000' } }
    ].filter(i => i.value > 0);

    let dData = [
        { value: live.pump, name: 'Pumping', itemStyle: { color: '#85c1e9' } },
        { value: live.stAbs, name: 'St. Charge', itemStyle: { color: '#b276a0' } },
        { value: live.exports, name: 'Exports', itemStyle: { color: '#e74c3c' } },
        { value: liveDemand, name: 'Demand', itemStyle: { color: '#4a5568' } }
    ].filter(i => i.value > 0);

    supplyChart.setOption(getDonutOpt('Supply Mix (Inflows)', sData));
    demandChart.setOption(getDonutOpt('Demand (Outflows)', dData));

    flowsChart.setOption({
        backgroundColor: 'transparent', title: { text: 'Cross-Border Flows', left: 'center', top: 10, textStyle: { color: '#fff', fontSize: 14 } },
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params) => { let h = params[0].name + '<br/>'; params.forEach(p => h += `${p.marker} ${p.seriesName}: ${fmt(Math.abs(p.value))} MWh<br/>`); return h; }},
        legend: { top: 40, textStyle: { color: '#8892b0', fontSize: 11 } }, grid: { top: 90, bottom: 40, left: 50, right: 20 },
        xAxis: { type: 'category', data: ['ALBANIA', 'BULGARIA', 'ITALY', 'TURKEY', 'NORTH MACEDONIA'], axisLabel: { color: '#fff', interval: 0, rotate: 15, fontSize: 11 } },
        yAxis: { type: 'value', splitLine: { lineStyle: { color: '#2d333b', type: 'dashed' } }, axisLabel: { color: '#8892b0', fontSize: 11, formatter: (val) => fmt(Math.abs(val)) } },
        series: [
            { name: 'Imports', type: 'bar', stack: 'Flow', itemStyle: { color: '#ffc000' }, data: countryKeys.map(c => latestData.interconnections_mwh[`${c}_IMP`] || 0) },
            { name: 'Exports', type: 'bar', stack: 'Flow', itemStyle: { color: '#e74c3c' }, data: countryKeys.map(c => -(latestData.interconnections_mwh[`${c}_EXP`] || 0)) }
        ]
    });
}

// --- 6. Render Logic for Tab 2 (Daily) ---
function renderDailyTab(todayData) {
    let hours = [], arrLignite = [], arrGas = [], arrHydro = [], arrRes = [];
    let arrImports = [], arrStIn = [], arrDemand = [], arrMcp = [];
    let arrPump = [], arrStAbs = [], arrExports = []; 
    
    let sum = { gen:0, lig:0, gas:0, hyd:0, res:0, dem:0, stIn:0, stAbs:0, imp:0, exp:0, pump:0 };
    const countryKeys = ['ΑΛΒΑΝΙΑ', 'ΒΟΥΛΓΑΡΙΑ', 'ΙΤΑΛΙΑ', 'ΤΟΥΡΚΙΑ', 'FYROM'];

    todayData.forEach(d => {
        hours.push(d.target_hour.toString().padStart(2, '0') + ':00');

        let l = d.production_mix['TOTAL LIGNITE'] || 0;
        let g = d.production_mix['TOTAL GAS'] || 0;
        let h = d.production_mix['TOTAL HYDRO'] || 0;
        let r = d.production_mix['RES_PROD'] || 0;
        let gen = d.production_mix['TOTAL_PROD'] || 0;
        
        let sIn = d.production_mix['STORAGE_INJECTION'] || 0;
        let sAbs = Math.abs(d.production_mix['STORAGE_ABSORPTION'] || 0);
        let p = d.production_mix['ΣΥΝΟΛΙΚΗ ΑΝΤΛΗΣΗ'] || 0;
        
        let imp = 0, exp = 0;
        countryKeys.forEach(c => {
            imp += (d.interconnections_mwh[`${c}_IMP`] || 0);
            exp += (d.interconnections_mwh[`${c}_EXP`] || 0);
        });
        
        let dem = gen + imp - exp + sIn - sAbs - p;
        let mcp = d.dam_price_eur || 0;

        arrLignite.push(l); arrGas.push(g); arrHydro.push(h); arrRes.push(r);
        arrImports.push(imp); arrStIn.push(sIn); arrDemand.push(dem); arrMcp.push(mcp);
        arrPump.push(-p); arrStAbs.push(-sAbs); arrExports.push(-exp);

        sum.lig += l; sum.gas += g; sum.hyd += h; sum.res += r; sum.gen += gen;
        sum.stIn += sIn; sum.stAbs += sAbs; sum.imp += imp; sum.exp += exp; sum.pump += p; sum.dem += dem;
    });

    const leaderboardItems = [
        { name: 'RES (ΑΠΕ)', value: sum.res, color: 'var(--color-res)' },
        { name: 'Natural Gas (Φ.Αεριο)', value: sum.gas, color: 'var(--color-gas)' },
        { name: 'Domestic Demand (Ζήτηση)', value: sum.dem, color: 'var(--text-main)' },
        { name: 'Total Generation (Παραγωγή)', value: sum.gen, color: 'var(--accent-green)' },
        { name: 'Imports (Εισαγωγές)', value: sum.imp, color: 'var(--color-imports)' },
        { name: 'Exports (Εξαγωγές)', value: sum.exp, color: 'var(--color-exports)' },
        { name: 'Hydro (Υδροηλεκτρικά)', value: sum.hyd, color: 'var(--color-hydro)' },
        { name: 'BESS Discharge (Αποφόρτιση)', value: sum.stIn, color: 'var(--color-storage)' },
        { name: 'BESS Charge (Φόρτιση)', value: sum.stAbs, color: 'var(--color-storage-chg)' },
        { name: 'Lignite (Λιγνίτης)', value: sum.lig, color: 'var(--color-lignite)' },
        { name: 'Pumping (Άντληση)', value: sum.pump, color: 'var(--color-pump)' }
    ];

    leaderboardItems.sort((a, b) => b.value - a.value);

    document.getElementById('daily-leaderboard').innerHTML = leaderboardItems.map((item, index) => `
        <div class="leaderboard-item">
            <div class="lb-top">
                <span class="lb-name" style="color: ${item.color};">${item.name}</span>
                <span class="lb-rank">#${index + 1}</span>
            </div>
            <div class="lb-value">${fmt(item.value)} <span style="font-size: 0.9rem; font-weight: normal; color: var(--text-muted);">MWh</span></div>
        </div>
    `).join('');

    dailyDispatchChart.setOption({
        backgroundColor: 'transparent',
        title: { text: '24-Hour Dispatch & Market Clearing Price', left: 'center', top: 5, textStyle: { color: '#ffffff', fontSize: 15 } },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: 'rgba(28, 33, 40, 0.95)',
            borderColor: '#2d333b',
            textStyle: { color: '#fff' },
            formatter: function (params) {
                let hour = params[0].axisValue;
                const supplyOrder = ['Hydro', 'RES', 'BESS Discharge', 'Imports', 'Natural Gas', 'Lignite'];
                const demandOrder = ['Domestic Demand', 'Exports', 'BESS Charge', 'Pumping'];
                
                let mcpParam = params.find(p => p.seriesName === 'MCP');
                let mcpValue = mcpParam ? fmt(Math.abs(mcpParam.value)) : '-';

                let html = `<div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                                <b style="font-size:14px; color:#2ecc71;">Hour: ${hour}</b>
                                <b style="font-size:14px; color:#00e5ff;">MCP: ${mcpValue} €/MWh</b>
                            </div>`;

                const renderRow = (p) => {
                    if (!p) return '';
                    let val = Math.abs(p.value);
                    let isDemand = p.seriesName === 'Domestic Demand';
                    let label = isDemand ? `<b>${p.seriesName}</b>` : p.seriesName;
                    return `<div style="margin-bottom: 3px;">
                                <span style="color:${p.color}; font-size:14px;">●</span> 
                                <span style="display:inline-block; width:130px; font-size:13px; color:#fff;">${label}:</span> 
                                <span style="font-size:13px; color:#fff; float:right;"><b>${fmt(val)}</b> MWh</span>
                            </div>`;
                };

                supplyOrder.forEach(name => {
                    let p = params.find(item => item.seriesName === name);
                    if(p && p.value !== 0) html += renderRow(p); 
                });

                html += `<div style="height: 15px;"></div>`;

                demandOrder.forEach(name => {
                    let p = params.find(item => item.seriesName === name);
                    if(p && p.value !== 0) html += renderRow(p); 
                });

                return html;
            }
        },
        legend: { top: 40, textStyle: { color: '#8892b0' }, icon: 'roundRect' },
        grid: { top: 100, bottom: 40, left: 60, right: 60 },
        xAxis: { type: 'category', data: hours, axisLabel: { color: '#fff' } },
        yAxis: [
            { type: 'value', name: 'Volume (MWh)', position: 'left', splitLine: { lineStyle: { color: '#2d333b', type: 'dashed' } }, axisLabel: { color: '#8892b0', formatter: (val) => fmt(Math.abs(val)) }, nameTextStyle: { color: '#8892b0' } },
            { type: 'value', name: 'Price (€/MWh)', position: 'right', splitLine: { show: false }, axisLabel: { color: '#00e5ff', fontWeight: 'bold' }, nameTextStyle: { color: '#00e5ff' } }
        ],
        series: [
            { name: 'Lignite', type: 'bar', stack: 'Total', barWidth: '70%', data: arrLignite, itemStyle: { color: '#b06a4b' } },
            { name: 'Natural Gas', type: 'bar', stack: 'Total', barWidth: '70%', data: arrGas, itemStyle: { color: '#d18b57' } },
            { name: 'Imports', type: 'bar', stack: 'Total', barWidth: '70%', data: arrImports, itemStyle: { color: '#ffc000' } },
            { name: 'BESS Discharge', type: 'bar', stack: 'Total', barWidth: '70%', data: arrStIn, itemStyle: { color: '#e0c2cd' } },
            { name: 'RES', type: 'bar', stack: 'Total', barWidth: '70%', data: arrRes, itemStyle: { color: '#70ad47' } },
            { name: 'Hydro', type: 'bar', stack: 'Total', barWidth: '70%', data: arrHydro, itemStyle: { color: '#5b9bd5' } },
            { name: 'Pumping', type: 'bar', stack: 'Total', barWidth: '70%', data: arrPump, itemStyle: { color: '#85c1e9' } },
            { name: 'BESS Charge', type: 'bar', stack: 'Total', barWidth: '70%', data: arrStAbs, itemStyle: { color: '#b276a0' } },
            { name: 'Exports', type: 'bar', stack: 'Total', barWidth: '70%', data: arrExports, itemStyle: { color: '#e74c3c' } },
            { name: 'Domestic Demand', type: 'line', yAxisIndex: 0, data: arrDemand, symbol: 'none', smooth: true, lineStyle: { color: '#ffffff', width: 3, type: 'dashed' }, z: 10 },
            { name: 'MCP', type: 'line', yAxisIndex: 1, data: arrMcp, symbol: 'circle', symbolSize: 6, lineStyle: { color: '#00e5ff', width: 3 }, itemStyle: { color: '#00e5ff' }, z: 10 }
        ]
    });
}

// --- 7. Render Logic for Tab 3 (Clean Energy X-Ray Analytics) ---
function renderXrayTab(targetDate) {
    let hours = [];
    let arrBigHydro = [], arrSmallHydro = [], arrSolar = [], arrWind = [];
    let arrBiomass = [], arrCogen = [], arrUnallocated = [], arrMcp = [];
    let arrEntsoeSolar = [], arrEntsoeWind = [], arrEntsoeHydro = [];

    let sum = {
        bigHydro: 0, smallHydro: 0, solar: 0, wind: 0, biomass: 0, cogen: 0,
        unallocated: 0, totalPhysClean: 0, totalLiveClean: 0,
        entsoeSolar: 0, entsoeWind: 0, entsoeHydro: 0
    };

    for (let hr = 1; hr <= 24; hr++) {
        hours.push(hr.toString().padStart(2, '0') + ':00');

        let xRec = xrayData.find(d => d.date === targetDate && d.target_hour === hr) || {};
        let eRec = entsoeData.find(d => d.date === targetDate && d.target_hour === hr) || {};
        let lRec = globalData.find(d => d.date === targetDate && d.target_hour === hr) || {};

        let bh = xRec.big_hydro || 0;
        let sh = xRec.small_hydro || 0;
        let sol = xRec.solar || 0;
        let wnd = xRec.wind || 0;
        let bio = xRec.biomass || 0;
        let cog = xRec.cogen || 0;
        let mcp = xRec.mcp || lRec.dam_price_eur || 0;

        let liveRes = lRec.production_mix ? (lRec.production_mix['RES_PROD'] || 0) : 0;
        let liveHydro = lRec.production_mix ? (lRec.production_mix['TOTAL HYDRO'] || 0) : 0;
        let liveCleanTotal = liveRes + liveHydro;

        let physCleanTotal = bh + sh + sol + wnd + bio + cog;
        let unallocated = liveCleanTotal - physCleanTotal;
        if (unallocated < 0) unallocated = 0; 

        let eSolar = eRec.entsoe_solar || 0;
        let eWind = eRec.entsoe_wind || 0;
        let eHydro = eRec.entsoe_hydro || 0;

        arrBigHydro.push(bh);
        arrSmallHydro.push(sh);
        arrSolar.push(sol);
        arrWind.push(wnd);
        arrBiomass.push(bio);
        arrCogen.push(cog);
        arrUnallocated.push(unallocated);
        arrMcp.push(mcp);

        arrEntsoeSolar.push(eSolar);
        arrEntsoeWind.push(eWind);
        arrEntsoeHydro.push(eHydro);

        sum.bigHydro += bh;
        sum.smallHydro += sh;
        sum.solar += sol;
        sum.wind += wnd;
        sum.biomass += bio;
        sum.cogen += cog;
        sum.unallocated += unallocated;
        sum.totalPhysClean += physCleanTotal;
        sum.totalLiveClean += liveCleanTotal;
        sum.entsoeSolar += eSolar;
        sum.entsoeWind += eWind;
        sum.entsoeHydro += eHydro;
    }

    // --- Update the 3 Inline Summary Boxes ---
    document.getElementById('xb-stoch').innerHTML = `
        <div class="xb-item"><span style="color: #70ad47;">Wind</span> <span class="text-white">${fmt(sum.wind)} MWh</span></div>
        <div class="xb-item"><span style="color: #5b9bd5;">Big Hydro</span> <span class="text-white">${fmt(sum.bigHydro)} MWh</span></div>
        <div class="xb-item"><span style="color: #f39c12;">Solar</span> <span class="text-white">${fmt(sum.solar)} MWh</span></div>
    `;

    document.getElementById('xb-uce').innerHTML = `
        <div class="xb-item" style="justify-content: center; margin-top: 10px;">
            <span style="color: #e74c3c; font-size: 1.1rem; margin-right: 10px;">UCE</span> 
            <span class="text-white" style="font-size: 1.1rem;">${fmt(sum.unallocated)} MWh</span>
        </div>
    `;

    document.getElementById('xb-base').innerHTML = `
        <div class="xb-item"><span style="color: #f1c40f;">Cogen</span> <span class="text-white">${fmt(sum.cogen)} MWh</span></div>
        <div class="xb-item"><span style="color: #3498db;">Small Hydro</span> <span class="text-white">${fmt(sum.smallHydro)} MWh</span></div>
        <div class="xb-item"><span style="color: #8e44ad;">Biomass</span> <span class="text-white">${fmt(sum.biomass)} MWh</span></div>
    `;

    // --- Watermark Logic (If user forces 'Today' on Tab 3) ---
    const xrayWrapper = document.getElementById('xray-wrapper');
    const watermark = document.getElementById('xray-watermark');
    
    if (targetDate === latestDateGlobal) {
        xrayWrapper.classList.add('faded-charts');
        watermark.classList.remove('d-none');
    } else {
        xrayWrapper.classList.remove('faded-charts');
        watermark.classList.add('d-none');
    }

    xrayChart.setOption({
        backgroundColor: 'transparent',
        title: { text: 'Physical Clean Energy Dispatch vs Unallocated Energy (X-Ray)', left: 'center', top: 5, textStyle: { color: '#ffffff', fontSize: 15 } },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' },
            backgroundColor: 'rgba(28, 33, 40, 0.95)',
            borderColor: '#2d333b',
            textStyle: { color: '#fff' },
            formatter: function (params) {
                let hour = params[0].axisValue;
                let mcpParam = params.find(p => p.seriesName === 'MCP');
                let mcpValue = mcpParam ? fmt(Math.abs(mcpParam.value)) : '-';

                // Header
                let html = `<div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                                <b style="font-size:15px; color:#70ad47;">Hour: ${hour}</b>
                                <b style="font-size:15px; color:#00e5ff;">MCP: ${mcpValue} €/MWh</b>
                            </div>`;

                const renderRow = (seriesName) => {
                    let p = params.find(item => item.seriesName === seriesName);
                    if (!p) return '';
                    return `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="font-size:14px; color:#fff;">
                                    <span style="color:${p.color}; font-size:16px; margin-right:4px;">●</span>${p.seriesName}:
                                </span>
                                <span style="font-size:14px; color:#fff;"><b>${fmt(p.value)}</b> MWh</span>
                            </div>`;
                };

                // Block 1: Μεταβλητά
                html += renderRow('Wind');
                html += renderRow('Big Hydro');
                html += renderRow('Solar');
                
                html += `<div style="border-bottom: 1px dashed rgba(255,255,255,0.2); margin: 8px 0;"></div>`;
                
                // Block 2: Unallocated (UCE)
                html += renderRow('UCE');

                html += `<div style="border-bottom: 1px dashed rgba(255,255,255,0.2); margin: 8px 0;"></div>`;

                // Block 3: Baseload
                html += renderRow('Cogen');
                html += renderRow('Small Hydro');
                html += renderRow('Biomass');
                
                html += `<div style="border-bottom: 1px dashed rgba(255,255,255,0.2); margin: 8px 0;"></div>`;

                // Footer (Total)
                let cleanSum = 0;
                params.forEach(p => {
                    if (p.seriesName !== 'MCP') cleanSum += p.value;
                });

                html += `<div style="display: flex; justify-content: space-between; margin-top: 6px;">
                            <span style="font-size:14px; color:#8892b0;">Total Clean Energy:</span> 
                            <span style="font-size:14px; color:#70ad47;"><b>${fmt(cleanSum)}</b> MWh</span>
                        </div>`;

                return html;
            }
        },
        legend: { top: 35, textStyle: { color: '#8892b0' }, icon: 'roundRect' },
        grid: { top: 95, bottom: 40, left: 60, right: 60 },
        xAxis: { type: 'category', data: hours, axisLabel: { color: '#fff' } },
        yAxis: [
            { type: 'value', name: 'Volume (MWh)', position: 'left', splitLine: { lineStyle: { color: '#2d333b', type: 'dashed' } }, axisLabel: { color: '#8892b0', formatter: (val) => fmt(val) }, nameTextStyle: { color: '#8892b0' } },
            { type: 'value', name: 'Price (€/MWh)', position: 'right', splitLine: { show: false }, axisLabel: { color: '#00e5ff', fontWeight: 'bold' }, nameTextStyle: { color: '#00e5ff' } }
        ],
        series: [
            { name: 'Biomass', type: 'bar', stack: 'Clean', barWidth: '70%', data: arrBiomass, itemStyle: { color: '#8e44ad' } },
            { name: 'Small Hydro', type: 'bar', stack: 'Clean', barWidth: '70%', data: arrSmallHydro, itemStyle: { color: '#3498db' } },
            { name: 'Cogen', type: 'bar', stack: 'Clean', barWidth: '70%', data: arrCogen, itemStyle: { color: '#f1c40f' } },
            { name: 'UCE', type: 'bar', stack: 'Clean', barWidth: '70%', data: arrUnallocated, itemStyle: { color: '#e74c3c' } },
            { name: 'Solar', type: 'bar', stack: 'Clean', barWidth: '70%', data: arrSolar, itemStyle: { color: '#f39c12' } },
            { name: 'Big Hydro', type: 'bar', stack: 'Clean', barWidth: '70%', data: arrBigHydro, itemStyle: { color: '#5b9bd5' } },
            { name: 'Wind', type: 'bar', stack: 'Clean', barWidth: '70%', data: arrWind, itemStyle: { color: '#70ad47' } },
            { name: 'MCP', type: 'line', yAxisIndex: 1, data: arrMcp, symbol: 'circle', symbolSize: 6, lineStyle: { color: '#00e5ff', width: 3 }, itemStyle: { color: '#00e5ff' }, z: 10 }
        ]
    });

    reconciliationChart.setOption({
        backgroundColor: 'transparent',
        title: { text: 'ENTSO-E vs SCADA Transparency Radar (Solar & Wind Comparison)', left: 'center', top: 5, textStyle: { color: '#ffffff', fontSize: 15 } },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: 'rgba(28, 33, 40, 0.95)',
            borderColor: '#2d333b',
            textStyle: { color: '#fff' },
            formatter: function (params) {
                let hour = params[0].axisValue;
                let html = `<div style="margin-bottom: 8px;"><b style="font-size:15px; color:#70ad47;">Hour: ${hour}</b></div>`;

                params.forEach(p => {
                    html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="font-size:14px; color:#fff;">
                                    <span style="color:${p.color}; font-size:16px; margin-right:4px;">●</span>${p.seriesName}:
                                </span>
                                <span style="font-size:14px; color:#fff; margin-left: 15px;"><b>${fmt(p.value)}</b> MWh</span>
                            </div>`;
                });

                return html;
            }
        },
        legend: { top: 35, textStyle: { color: '#8892b0' }, icon: 'roundRect' },
        grid: { top: 90, bottom: 40, left: 60, right: 20 },
        xAxis: { type: 'category', data: hours, axisLabel: { color: '#fff' } },
        yAxis: { type: 'value', name: 'Volume (MWh)', splitLine: { lineStyle: { color: '#2d333b', type: 'dashed' } }, axisLabel: { color: '#8892b0', formatter: (val) => fmt(val) }, nameTextStyle: { color: '#8892b0' } },
        series: [
            { name: 'Physical Solar (SCADA)', type: 'line', smooth: true, data: arrSolar, lineStyle: { color: '#f39c12', width: 3 }, itemStyle: { color: '#f39c12' } },
            { name: 'ENTSO-E Declared Solar', type: 'line', smooth: true, data: arrEntsoeSolar, lineStyle: { color: '#ff9f43', width: 3, type: 'dashed' }, itemStyle: { color: '#ff9f43' } },
            { name: 'Physical Wind (SCADA)', type: 'line', smooth: true, data: arrWind, lineStyle: { color: '#70ad47', width: 3 }, itemStyle: { color: '#70ad47' } },
            { name: 'ENTSO-E Declared Wind', type: 'line', smooth: true, data: arrEntsoeWind, lineStyle: { color: '#10ac84', width: 3, type: 'dashed' }, itemStyle: { color: '#10ac84' } }
        ]
    });
}

// --- 8. Modal Records Loader & Smart Notification Badge ---
async function loadRecords() {
    try {
        const response = await fetch('data/records.json?v=' + new Date().getTime());
        if (!response.ok) throw new Error("No records file");
        const recs = await response.json();
        
        let todayFormatted = '';
        if (latestDateGlobal) { 
            todayFormatted = `${latestDateGlobal.substring(0,4)}-${latestDateGlobal.substring(4,6)}-${latestDateGlobal.substring(6,8)}`;
            let todayRecordsCount = 0;

            for (const category in recs.daily) {
                recs.daily[category].forEach(item => { if (item.id === todayFormatted) todayRecordsCount++; });
            }
            for (const category in recs.hourly) {
                recs.hourly[category].forEach(item => { if (item.id.startsWith(todayFormatted)) todayRecordsCount++; });
            }

            const badge = document.getElementById('records-badge');
            if (badge) {
                if (todayRecordsCount > 0) {
                    badge.innerText = `${todayRecordsCount} New!`;
                    badge.classList.remove('d-none');
                } else {
                    badge.classList.add('d-none');
                }
            }
        }

        const buildCard = (title, items, color, unit) => {
            let listHtml = items.slice(0, 3).map((item, idx) => {
                let rankStyle = '';
                if (idx === 0) rankStyle = 'color: #ffc000; font-size: 0.85rem; text-shadow: 0 0 5px rgba(255,192,0,0.3);'; 
                else if (idx === 1) rankStyle = 'color: #c0c0c0;'; 
                else if (idx === 2) rankStyle = 'color: #cd7f32;'; 
                
                let isNew = todayFormatted && item.id.startsWith(todayFormatted);
                let newBadgeHtml = isNew ? `<span class="new-record-badge">NEW!</span>` : '';
                
                return `
                    <div class="record-row">
                        <span class="rec-rank" style="${rankStyle}">#${idx+1}</span>
                        <span class="rec-date">${item.id}</span>
                        <span class="rec-val" style="color: ${color};">${fmt(item.value)} <span style="font-size:0.75rem;">${unit}</span></span>
                        ${newBadgeHtml}
                    </div>
                `;
            }).join('');
            
            return `
                <div class="col-md-6">
                    <div class="record-box">
                        <h6>${title}</h6>
                        ${listHtml || '<div class="text-muted" style="font-size:0.85rem;">No data yet</div>'}
                    </div>
                </div>
            `;
        };

        let hourlyHtml = '';
        hourlyHtml += buildCard('Peak Demand', recs.hourly.demand, 'var(--color-demand)', 'MW');
        hourlyHtml += buildCard('Peak Exports', recs.hourly.exports, 'var(--color-exports)', 'MW');
        hourlyHtml += buildCard('Peak BESS Charge', recs.hourly.bess_chg, 'var(--color-storage-chg)', 'MW');
        hourlyHtml += buildCard('Peak BESS Discharge', recs.hourly.bess_dis, 'var(--color-storage)', 'MW');
        hourlyHtml += buildCard('Peak Network Load (Gross Supply)', recs.hourly.network_load, 'var(--accent-green)', 'MW');
        document.getElementById('render-hourly-records').innerHTML = hourlyHtml;

        let dailyHtml = '';
        dailyHtml += buildCard('Max Daily RES', recs.daily.res, 'var(--color-res)', 'MWh');
        dailyHtml += buildCard('Max RES Share', recs.daily.res_share, 'var(--color-res)', '%');
        dailyHtml += buildCard('Max Daily Exports', recs.daily.exports, 'var(--color-exports)', 'MWh');
        dailyHtml += buildCard('Max BESS Charge + Pump', recs.daily.bess_chg_pump, 'var(--color-storage-chg)', 'MWh');
        dailyHtml += buildCard('Max Daily BESS Discharge', recs.daily.bess_dis, 'var(--color-storage)', 'MWh');
        document.getElementById('render-daily-records').innerHTML = dailyHtml;

    } catch (error) {
        console.error("No records.json found yet.");
        document.getElementById('render-hourly-records').innerHTML = '<div class="col-12"><p class="text-muted p-3">Waiting for first Python sync...</p></div>';
        document.getElementById('render-daily-records').innerHTML = '<div class="col-12"><p class="text-muted p-3">Waiting for first Python sync...</p></div>';
    }
}
