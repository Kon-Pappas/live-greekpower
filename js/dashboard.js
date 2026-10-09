// --- 1. Global ECharts Instances & State Management ---
let supplyChart, demandChart, flowsChart, dailyDispatchChart;
const fmt = (num) => new Intl.NumberFormat('en-US').format(Math.round(num));

// Global State Variables
let globalData = [];
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

    window.addEventListener('resize', () => {
        supplyChart.resize(); demandChart.resize(); flowsChart.resize(); dailyDispatchChart.resize();
    });
}

function setupTabSwitcher() {
    document.querySelectorAll('.nav-tab-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-tab-item').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            
            currentActiveTab = targetId;
            updateDropdownState();
            
            setTimeout(() => {
                supplyChart.resize(); demandChart.resize(); flowsChart.resize(); dailyDispatchChart.resize();
            }, 50);
        });
    });
}

// --- 3. Main Data Fetcher & Deduplication ---
async function loadData() {
    try {
        const response = await fetch('data/live_data.json?v=' + new Date().getTime());
        const rawData = await response.json();
        
        if (!rawData || rawData.length === 0) throw new Error("No data found in JSON.");

        const cleanDataMap = new Map();
        rawData.forEach(entry => {
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
        
        // Φόρτωση Records αθόρυβα στο background για να ελέγξουμε αν υπάρχει Badge
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
        
        const latestRec = dailyRecords[dailyRecords.length - 1];
        const fetchTime = new Date(latestRec.fetch_timestamp).toLocaleString('en-GB');
        let formattedDate = `${selectedDateDaily.substring(6,8)}/${selectedDateDaily.substring(4,6)}/${selectedDateDaily.substring(0,4)}`;
        document.getElementById('last-updated').innerText = `Last Update: ${fetchTime} | Selected Date: ${formattedDate}`;
        
        if (selectedDateDaily === latestDateGlobal) {
            pill.innerHTML = '● Today';
            pill.style.color = 'var(--accent-green)'; pill.style.borderColor = 'rgba(46, 204, 113, 0.3)'; pill.style.backgroundColor = 'rgba(46, 204, 113, 0.15)';
        } else {
            pill.innerHTML = '● Historical Day';
            pill.style.color = '#ffc000'; pill.style.borderColor = 'rgba(255, 192, 0, 0.3)'; pill.style.backgroundColor = 'rgba(255, 192, 0, 0.15)';
        }
        
        renderDailyTab(dailyRecords);
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

    document.getElementById('val-production').innerText = `${fmt(live.totalGen)} MWh`;
    document.getElementById('val-demand').innerText = `${fmt(liveDemand)} MWh`;
    document.getElementById('val-price').innerText = `${fmt(live.mcp)} €`;

    document.getElementById('eq-generation').innerHTML = `
        <div class="eq-row c-lignite"><span class="eq-label">Lignite</span><span class="eq-operator"></span><span class="eq-value">${fmt(live.lignite)}</span></div>
        <div class="eq-row c-gas"><span class="eq-label">Natural Gas</span><span class="eq-operator">+</span><span class="eq-value">${fmt(live.gas)}</span></div>
        <div class="eq-row c-hydro"><span class="eq-label">Hydro</span><span class="eq-operator">+</span><span class="eq-value">${fmt(live.hydro)}</span></div>
        <div class="eq-row c-res"><span class="eq-label">RES</span><span class="eq-operator">+</span><span class="eq-value">${fmt(live.res)}</span></div>
    `;
    document.getElementById('eq-demand').innerHTML = `
        <div class="eq-row text-white"><span class="eq-label">Generation</span><span class="eq-operator"></span><span class="eq-value">${fmt(live.totalGen)}</span></div>
        <div class="eq-row c-imports"><span class="eq-label">Imports</span><span class="eq-operator">+</span><span class="eq-value">${fmt(live.imports)}</span></div>
        <div class="eq-row c-exports"><span class="eq-label">Exports</span><span class="eq-operator">-</span><span class="eq-value">${fmt(live.exports)}</span></div>
        <div class="eq-row c-storage"><span class="eq-label">Storage Disch.</span><span class="eq-operator">+</span><span class="eq-value">${fmt(live.stIn)}</span></div>
        <div class="eq-row c-storage" style="color: #b276a0;"><span class="eq-label">Storage Charge</span><span class="eq-operator">-</span><span class="eq-value">${fmt(live.stAbs)}</span></div>
        <div class="eq-row c-pump"><span class="eq-label">Pumping</span><span class="eq-operator">-</span><span class="eq-value">${fmt(live.pump)}</span></div>
    `;

    const getDonutOpt = (title, data) => ({
        backgroundColor: 'transparent',
        title: [
            { text: title, left: 'center', top: 5, textStyle: { color: '#ffffff', fontSize: 14 } },
            { text: `${fmt(liveTotalSupply)}\nMWh`, left: 'center', top: 'center', textStyle: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' } }
        ],
        tooltip: { trigger: 'item', formatter: (p) => `${p.name}: <br/> <b>${fmt(p.value)} MWh</b> (${p.percent}%)` },
        legend: { top: 'bottom', textStyle: { color: '#8892b0' } },
        series: [{ type: 'pie', radius: ['45%', '70%'], itemStyle: { borderRadius: 4, borderColor: '#1c2128', borderWidth: 2 }, label: { show: true, formatter: '{b}\n{d}%', color: '#fff', fontSize: 11 }, labelLine: { length: 10, length2: 15 }, data: data }]
    });

    let sData = [
        { value: live.lignite, name: 'Lignite', itemStyle: { color: '#b06a4b' } },
        { value: live.gas, name: 'Natural Gas', itemStyle: { color: '#d18b57' } },
        { value: live.hydro, name: 'Hydro', itemStyle: { color: '#5b9bd5' } },
        { value: live.res, name: 'RES', itemStyle: { color: '#70ad47' } },
        { value: live.stIn, name: 'Storage Disch.', itemStyle: { color: '#e0c2cd' } },
        { value: live.imports, name: 'Imports', itemStyle: { color: '#ffc000' } }
    ].filter(i => i.value > 0);

    let dData = [
        { value: live.pump, name: 'Pumping', itemStyle: { color: '#85c1e9' } },
        { value: live.stAbs, name: 'Storage Charge', itemStyle: { color: '#b276a0' } },
        { value: live.exports, name: 'Exports', itemStyle: { color: '#e74c3c' } },
        { value: liveDemand, name: 'Domestic Demand', itemStyle: { color: '#4a5568' } }
    ].filter(i => i.value > 0);

    supplyChart.setOption(getDonutOpt('Supply Mix (Inflows)', sData));
    demandChart.setOption(getDonutOpt('Demand & Sinks (Outflows)', dData));

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

    const balanceContainer = document.getElementById('daily-balance-equation');
    balanceContainer.innerHTML = `
        <div class="eq-subline">
            <span class="eq-term text-white">Generation: <b>${fmt(sum.gen)}</b></span> <span class="eq-op">+</span>
            <span class="eq-term" style="color: var(--color-imports);">Imports: <b>${fmt(sum.imp)}</b></span> <span class="eq-op">+</span>
            <span class="eq-term" style="color: var(--color-storage);">Bess_Discharge: <b>${fmt(sum.stIn)}</b></span> 
            <span class="eq-op">=</span> 
            <span class="eq-term" style="color: var(--color-demand);">Demand: <b>${fmt(sum.dem)}</b></span> <span class="eq-op">+</span>
            <span class="eq-term" style="color: var(--color-exports);">Exports: <b>${fmt(sum.exp)}</b></span> <span class="eq-op">+</span>
            <span class="eq-term" style="color: var(--color-storage-chg);">Bess_Charge: <b>${fmt(sum.stAbs)}</b></span> <span class="eq-op">+</span>
            <span class="eq-term" style="color: var(--color-pump);">Pump: <b>${fmt(sum.pump)}</b></span>
        </div>
        <div class="eq-subline" style="border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 6px;">
            <span class="eq-term text-white">Generation: <b>${fmt(sum.gen)}</b></span> 
            <span class="eq-op">=</span> 
            <span class="eq-term" style="color: var(--color-lignite);">Lignite: <b>${fmt(sum.lig)}</b></span> <span class="eq-op">+</span>
            <span class="eq-term" style="color: var(--color-gas);">N.Gas: <b>${fmt(sum.gas)}</b></span> <span class="eq-op">+</span>
            <span class="eq-term" style="color: var(--color-res);">RES: <b>${fmt(sum.res)}</b></span> <span class="eq-op">+</span>
            <span class="eq-term" style="color: var(--color-hydro);">Hydro: <b>${fmt(sum.hyd)}</b></span>
        </div>
    `;

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

    const leaderboardContainer = document.getElementById('daily-leaderboard');
    leaderboardContainer.innerHTML = leaderboardItems.map((item, index) => `
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
                    let valueStr = isDemand ? `<b>${fmt(val)}</b>` : `<b>${fmt(val)}</b>`;
                    
                    return `<div style="margin-bottom: 3px;">
                                <span style="color:${p.color}; font-size:14px;">●</span> 
                                <span style="display:inline-block; width:130px; font-size:13px; color:#fff;">${label}:</span> 
                                <span style="font-size:13px; color:#fff; float:right;">${valueStr} MWh</span>
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
            { name: 'Lignite', type: 'bar', stack: 'Pos', data: arrLignite, itemStyle: { color: '#b06a4b' } },
            { name: 'Natural Gas', type: 'bar', stack: 'Pos', data: arrGas, itemStyle: { color: '#d18b57' } },
            { name: 'Imports', type: 'bar', stack: 'Pos', data: arrImports, itemStyle: { color: '#ffc000' } },
            { name: 'BESS Discharge', type: 'bar', stack: 'Pos', data: arrStIn, itemStyle: { color: '#e0c2cd' } },
            { name: 'RES', type: 'bar', stack: 'Pos', data: arrRes, itemStyle: { color: '#70ad47' } },
            { name: 'Hydro', type: 'bar', stack: 'Pos', data: arrHydro, itemStyle: { color: '#5b9bd5' } },
            { name: 'Pumping', type: 'bar', stack: 'Neg', data: arrPump, itemStyle: { color: '#85c1e9' } },
            { name: 'BESS Charge', type: 'bar', stack: 'Neg', data: arrStAbs, itemStyle: { color: '#b276a0' } },
            { name: 'Exports', type: 'bar', stack: 'Neg', data: arrExports, itemStyle: { color: '#e74c3c' } },
            { name: 'Domestic Demand', type: 'line', yAxisIndex: 0, data: arrDemand, symbol: 'none', smooth: true, lineStyle: { color: '#ffffff', width: 3, type: 'dashed' }, z: 10 },
            { name: 'MCP', type: 'line', yAxisIndex: 1, data: arrMcp, symbol: 'circle', symbolSize: 6, lineStyle: { color: '#00e5ff', width: 3 }, itemStyle: { color: '#00e5ff' }, z: 10 }
        ]
    });
}

// --- 7. Modal Records Loader & Smart Notification Badge ---
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
            // Το slice(0, 3) επιβάλλει στο UI να δείξει μόνο τα 3 πρώτα ακόμα κι αν το παλιό JSON έχει 5!
            let listHtml = items.slice(0, 3).map((item, idx) => {
                
                // Προσθήκη χρωμάτων (Χρυσό, Αργυρό, Χάλκινο) στους αριθμούς κατάταξης
                let rankStyle = '';
                if (idx === 0) rankStyle = 'color: #ffc000; font-size: 0.85rem; text-shadow: 0 0 5px rgba(255,192,0,0.3);'; // Gold
                else if (idx === 1) rankStyle = 'color: #c0c0c0;'; // Silver
                else if (idx === 2) rankStyle = 'color: #cd7f32;'; // Bronze
                
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
        console.error("No records.json found yet. It will be created on next python run.");
        document.getElementById('render-hourly-records').innerHTML = '<div class="col-12"><p class="text-muted p-3">Waiting for first Python sync to generate records...</p></div>';
        document.getElementById('render-daily-records').innerHTML = '<div class="col-12"><p class="text-muted p-3">Waiting for first Python sync to generate records...</p></div>';
    }
}
