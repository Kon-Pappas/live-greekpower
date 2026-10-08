// --- 1. Global ECharts Instances ---
let supplyChart, demandChart, flowsChart, dailyDispatchChart;
const fmt = (num) => new Intl.NumberFormat('en-US').format(Math.round(num));

// --- 2. Initialize App ---
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    setupTabSwitcher();
    loadData();
});

function initCharts() {
    supplyChart = echarts.init(document.getElementById('supplyChart'), 'dark');
    demandChart = echarts.init(document.getElementById('demandChart'), 'dark');
    flowsChart = echarts.init(document.getElementById('flowsChart'), 'dark');
    dailyDispatchChart = echarts.init(document.getElementById('dailyDispatchChart'), 'dark');

    window.addEventListener('resize', () => {
        supplyChart.resize();
        demandChart.resize();
        flowsChart.resize();
        dailyDispatchChart.resize();
    });
}

function setupTabSwitcher() {
    document.querySelectorAll('.nav-tab-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            // Toggle Active Classes
            document.querySelectorAll('.nav-tab-item').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            
            // Force resize charts on tab change
            setTimeout(() => {
                supplyChart.resize(); demandChart.resize(); 
                flowsChart.resize(); dailyDispatchChart.resize();
            }, 50);
        });
    });
}

// --- 3. Main Data Fetcher ---
async function loadData() {
    try {
        const response = await fetch('data/live_data.json');
        const data = await response.json();
        
        const latestData = data[data.length - 1];
        const fetchTime = new Date(latestData.fetch_timestamp).toLocaleString('en-GB');
        document.getElementById('last-updated').innerText = `Last Update: ${fetchTime} | Target Hour: ${latestData.target_hour}:00`;

        const todayDate = latestData.date;
        const todayData = data.filter(d => d.date === todayDate);

        // Delegation to specific render functions
        renderLiveTab(latestData);
        renderDailyTab(todayData);

    } catch (error) {
        console.error("Error loading data:", error);
        document.getElementById('last-updated').innerText = "Failed to load data.";
    }
}

// --- 4. Render Logic for Tab 1 (Live) ---
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

    // UI Updates
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

    // Charts Config
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

// --- 5. Render Logic for Tab 2 (Daily) ---
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

    // Update Ribbon
    document.getElementById('rib-gen').innerText = `${fmt(sum.gen)} MWh`;
    document.getElementById('rib-therm').innerText = `${fmt(sum.lig + sum.gas)} MWh`;
    document.getElementById('rib-green').innerText = `${fmt(sum.hyd + sum.res)} MWh`;
    document.getElementById('rib-dem').innerText = `${fmt(sum.dem)} MWh`;
    document.getElementById('rib-bess').innerText = `${fmt(sum.stIn + sum.stAbs)} MWh`;
    document.getElementById('rib-bess-dis').innerText = `${fmt(sum.stIn)} MWh`;
    document.getElementById('rib-bess-chg').innerText = `${fmt(sum.stAbs)} MWh`;
    
    let netFlow = sum.imp - sum.exp;
    document.getElementById('rib-flows-title').innerText = netFlow >= 0 ? "Net Imports" : "Net Exports";
    document.getElementById('rib-flows-net').innerText = `${fmt(Math.abs(netFlow))} MWh`;
    document.getElementById('rib-flows-net').style.color = netFlow >= 0 ? "#ffc000" : "#e74c3c";
    document.getElementById('rib-imp').innerText = `${fmt(sum.imp)} MWh`;
    document.getElementById('rib-exp').innerText = `${fmt(sum.exp)} MWh`;
    document.getElementById('rib-pump').innerText = `${fmt(sum.pump)} MWh`;

    // 24H Dispatch Chart
    dailyDispatchChart.setOption({
        backgroundColor: 'transparent',
        title: { text: '24-Hour Dispatch & Market Clearing Price', left: 'center', top: 5, textStyle: { color: '#ffffff', fontSize: 15 } },
        tooltip: {
            trigger: 'axis', axisPointer: { type: 'cross' }, backgroundColor: 'rgba(28, 33, 40, 0.95)', borderColor: '#2d333b', textStyle: { color: '#fff' },
            formatter: function (params) {
                let h = `<b style="font-size:14px; color:#2ecc71;">Hour: ${params[0].axisValue}</b><br/><hr style="margin:5px 0; border-color:#2d333b;">`;
                params.sort((a,b) => b.seriesType === 'line' ? 1 : -1); 
                params.forEach(p => {
                    let val = Math.abs(p.value);
                    let unit = p.seriesName === 'MCP' ? '€/MWh' : 'MWh';
                    let fontW = p.seriesType === 'line' ? 'font-weight:900;' : '';
                    h += `<span style="color:${p.color}; font-size:16px;">●</span> <span style="${fontW}">${p.seriesName}</span>: <b>${fmt(val)}</b> ${unit}<br/>`;
                });
                return h;
            }
        },
        legend: { top: 40, textStyle: { color: '#8892b0' }, icon: 'roundRect' },
        grid: { top: 100, bottom: 40, left: 60, right: 60 },
        xAxis: { type: 'category', data: hours, axisLabel: { color: '#fff' } },
        yAxis: [
            { type: 'value', name: 'Volume (MWh)', position: 'left', splitLine: { lineStyle: { color: '#2d333b', type: 'dashed' } }, axisLabel: { color: '#8892b0', formatter: (val) => fmt(Math.abs(val)) }, nameTextStyle: { color: '#8892b0' } },
            { type: 'value', name: 'Price (€/MWh)', position: 'right', splitLine: { show: false }, axisLabel: { color: '#e74c3c', fontWeight: 'bold' }, nameTextStyle: { color: '#e74c3c' } }
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
            { name: 'MCP', type: 'line', yAxisIndex: 1, data: arrMcp, symbol: 'circle', symbolSize: 6, lineStyle: { color: '#e74c3c', width: 3 }, itemStyle: { color: '#e74c3c' }, z: 10 }
        ]
    });
}
