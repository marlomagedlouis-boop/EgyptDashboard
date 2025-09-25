document.addEventListener('DOMContentLoaded', () => {
    // --- 1. CONFIGURATION & STATE ---
    const config = {
        // To align with the provided data (Days_Passed: 28), the context date is set to Sept 28.
        TODAY: new Date('2025-09-28T08:12:35'),
        kpiIcons: { 'Registered Customers': 'fa-user-plus', 'Active Customers': 'fa-user-check', 'Delivered Orders': 'fa-truck-fast', 'Volume UC': 'fa-boxes-stacked', 'NSR': 'fa-dollar-sign', 'Active Placed': 'fa-mouse-pointer', 'Digital Order Share %': 'fa-chart-pie', 'Digital Volume Share %': 'fa-chart-area', 'default': 'fa-chart-line' },
        highlightKPIs: ['Active Placed', 'Digital Order Share %', 'Digital Volume Share %'],
        monthMap: { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 },
        monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    };
    const state = { liveData: [], historicalData: [], chartInstances: {}, renderedTabs: { mtd: false, ytd: false, closing: false, historical: false } };

    // --- 2. DOM ELEMENTS ---
    const loadingSpinner = document.getElementById('loading-spinner');
    const subtitleElement = document.getElementById('dashboard-subtitle');
    const navContainer = document.getElementById('main-nav');
    const mainContainer = document.querySelector('main');

    // --- 3. UTILITY & HELPER FUNCTIONS ---
    const formatNumber = (num, decimals = 1, forceSign = false) => {
        if (num === null || num === undefined) return 'N/A';
        const sign = forceSign && num > 0 ? '+' : '';
        if (num === 0) return '0';
        if (Math.abs(num) < 1) return `${sign}${num.toFixed(1)}%`;
        if (Math.abs(num) < 1000) return `${sign}${num.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
        if (Math.abs(num) >= 1000000) return `${sign}${(num / 1000000).toFixed(decimals)}M`;
        if (Math.abs(num) >= 1000) return `${sign}${(num / 1000).toFixed(decimals)}K`;
        return `${sign}${num.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
    };
    
    const calculatePacingTarget = (item) => {
        if (!item || item.Full_Month_Target === null || !item.Total_Days_in_Month || !item.Days_Passed) return null;
        return (item.Full_Month_Target / item.Total_Days_in_Month) * item.Days_Passed;
    };

    // --- 4. DATA PARSING & INITIALIZATION ---
    const parseData = (file, text) => new Promise((resolve, reject) => Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim(), complete: (results) => results.errors.length ? reject(new Error(`Parsing error in ${file}: ${results.errors[0].message}`)) : resolve(results.data) }));
    
    const cleanRow = (row, numericFields) => {
        const cleaned = { ...row };
        Object.keys(cleaned).forEach(key => {
            if (typeof cleaned[key] === 'string') {
                cleaned[key] = cleaned[key].replace(/\s|&nbsp;/g, ' ').trim();
            }
            if (numericFields.includes(key)) {
                const value = cleaned[key];
                if (value === undefined || value === null || String(value) === '') {
                    cleaned[key] = null;
                } else {
                    const num = parseFloat(String(value).replace(/,/g, ''));
                    cleaned[key] = isNaN(num) ? null : num;
                }
            }
        });
        if (cleaned.Month && config.monthMap[cleaned.Month]) cleaned.Month = config.monthMap[cleaned.Month];
        return cleaned;
    };

    const init = async () => {
        try {
            const [liveText, historicalText] = await Promise.all([
                fetch('live_progress.csv').then(res => { if (!res.ok) throw new Error('live_progress.csv not found'); return res.text(); }),
                fetch('historical_log.csv').then(res => { if (!res.ok) throw new Error('historical_log.csv not found'); return res.text(); })
            ]);
            const numericLive = ['MTD_Actual', 'Full_Month_Target', 'Total_Days_in_Month', 'Days_Passed'];
            const numericHist = ['Year', 'Actual', 'Target'];
            state.liveData = (await parseData('live_progress.csv', liveText)).map(row => cleanRow(row, numericLive));
            state.historicalData = (await parseData('historical_log.csv', historicalText)).map(row => cleanRow(row, numericHist));
            
            if (state.liveData.length === 0 || state.historicalData.length === 0) throw new Error("One or more data files are empty or could not be parsed.");
            
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            subtitleElement.textContent = `Current Month Pacing | ${config.TODAY.toLocaleDateString('en-GB', { dateStyle: 'long' })} | ${timeZone}`;
            renderMtdTab();
        } catch (error) {
            console.error("CRITICAL ERROR:", error);
            mainContainer.innerHTML = `<div class="error-message"><h2>Dashboard Failed to Load</h2><p><strong>Error:</strong> ${error.message}</p></div>`;
        } finally {
            loadingSpinner.style.display = 'none';
        }
    };
    
    // --- 5. RENDER FUNCTIONS ---
    const renderSimpleDrilldown = (container, kpi, platform) => {
      const channelData = state.liveData.filter(d => d.KPI === kpi && d.Platform === platform && d.Channel !== 'Total');
      if (channelData.length === 0) { container.innerHTML = `<div class="drilldown-content"><p>No channel breakdown available.</p></div>`; return; }
      const maxValue = Math.max(...channelData.map(d => d.MTD_Actual || 0));
      const chartHtml = channelData.map(channel => { const barWidth = maxValue > 0 ? ((channel.MTD_Actual || 0) / maxValue) * 100 : 0; return `<div class="chart-bar-row" style="display:grid; grid-template-columns: 120px 1fr; align-items:center; gap: 15px; margin-bottom: 5px; font-size: 13px;"><div class="chart-bar-label" style="text-align: right;">${channel.Channel}</div><div class="chart-bar-wrapper" style="background: #f0f0f0; border-radius: 4px;"><div class="chart-bar" style="background-color: var(--coca-cola-red); width: ${barWidth}%; border-radius: 4px; padding: 4px 8px; color: white; text-align: right;">${formatNumber(channel.MTD_Actual)}</div></div></div>`; }).join('');
      container.innerHTML = `<div class="drilldown-content"><div class="drilldown-header">Channel Breakdown (MTD Actual)</div>${chartHtml}</div>`;
    };

    const renderAnalyticalDrilldown = (container, kpi, platform) => {
      const channelData = state.liveData.filter(d => d.KPI === kpi && d.Platform === platform && d.Channel !== 'Total');
      if (channelData.length === 0) { container.innerHTML = `<div class="drilldown-content"><p>No channel breakdown available.</p></div>`; return; }
      let content = `<div class="drilldown-content"><div class="drilldown-header">Channel Breakdown vs. Pacing Target</div>`;
      channelData.forEach(channel => { const actual = channel.MTD_Actual; const target = calculatePacingTarget(channel); const achievement = (actual !== null && target > 0) ? (actual / target) * 100 : 0; const barColor = achievement < 90 ? 'var(--bar-bad)' : achievement < 100 ? 'var(--bar-neutral)' : 'var(--bar-good)'; content += `<div class="drilldown-channel"><div class="drilldown-channel-label">${channel.Channel}</div><div class="pacing-bar-container"><div class="pacing-bar" style="width: ${Math.min(achievement, 100)}%; background-color: ${barColor};"></div><span class="pacing-bar-text">${achievement.toFixed(0)}%</span></div><div class="drilldown-channel-metrics" style="font-size: 12px; color: var(--text-light);">Act: ${formatNumber(actual)} / Tgt: ${formatNumber(target)}</div></div>`; });
      container.innerHTML = content + '</div>';
    };

    const renderMtdTab = () => {
        if (state.renderedTabs.mtd) return;
        const container = document.getElementById('mtd');
        const firstRow = state.liveData[0];
        const highlightCardsHtml = config.highlightKPIs.map(kpi => {
            const isPercent = kpi.includes('%'); let cpValue = 0, chatbotValue = 0;
            if (isPercent) { const cpRow = state.liveData.find(r => r.KPI === kpi && r.Platform === 'Customer Portal' && r.Channel === 'Total'); const chatbotRow = state.liveData.find(r => r.KPI === kpi && r.Platform === 'Chatbot'); cpValue = cpRow ? cpRow.MTD_Actual : 0; chatbotValue = chatbotRow ? chatbotRow.MTD_Actual : 0; }
            else { cpValue = state.liveData.filter(r => r.KPI === kpi && r.Platform === 'Customer Portal' && r.Channel !== 'Total').reduce((sum, r) => sum + (r.MTD_Actual || 0), 0); chatbotValue = state.liveData.filter(r => r.KPI === kpi && r.Platform === 'Chatbot').reduce((sum, r) => sum + (r.MTD_Actual || 0), 0); }
            const iconClass = config.kpiIcons[kpi] || config.kpiIcons.default;
            return `<div class="highlight-card card"><div class="highlight-card-header"><div class="icon"><i class="fa-solid ${iconClass}"></i></div><div class="title">${kpi}</div></div><div class="highlight-card-body"><div class="platform-metric drilldown-capable" data-kpi="${kpi}" data-platform="Customer Portal"><span class="label">Customer Portal <i class="fa-solid fa-chevron-down fa-xs"></i></span><span class="value">${isPercent ? cpValue.toFixed(1) + '%' : formatNumber(cpValue,0)}</span></div><div class="platform-metric"><span class="label">Chatbot</span><span class="value">${isPercent ? chatbotValue.toFixed(1) + '%' : formatNumber(chatbotValue,0)}</span></div><div class="card-drilldown-container"></div></div></div>`;
        }).join('');
        const tableKPIs = [...new Set(state.liveData.map(r => r.KPI))].filter(kpi => !config.highlightKPIs.includes(kpi));
        const kpiGroupsHtml = tableKPIs.sort().map(kpi => {
            const platforms = [...new Set(state.liveData.filter(r => r.KPI === kpi).map(r => r.Platform))];
            const platformHtml = platforms.map(platform => {
                const channels = state.liveData.filter(r => r.KPI === kpi && r.Platform === platform);
                const totalRow = channels.find(c => c.Channel === 'Total');
                const actual = totalRow ? totalRow.MTD_Actual : channels.filter(c => c.Channel !== 'Total').reduce((sum, ch) => sum + (ch.MTD_Actual || 0), 0);
                const fullTarget = totalRow ? totalRow.Full_Month_Target : channels.filter(c => c.Channel !== 'Total').reduce((sum, ch) => sum + (ch.Full_Month_Target || 0), 0);
                let achievement, targetForDisplay;
                if (kpi === 'Registered Customers') { targetForDisplay = fullTarget; achievement = (actual !== null && fullTarget > 0) ? (actual / fullTarget) * 100 : 0; }
                else { const pacingTarget = totalRow ? calculatePacingTarget(totalRow) : channels.filter(c => c.Channel !== 'Total').reduce((sum, ch) => sum + (calculatePacingTarget(ch) || 0), 0); targetForDisplay = pacingTarget; achievement = (actual !== null && pacingTarget > 0) ? (actual / pacingTarget) * 100 : 0; }
                let focusHtml = '';
                if (achievement < 100 && platform === 'Customer Portal' && kpi !== 'Registered Customers') {
                    const individualChannels = channels.filter(c => c.Channel !== 'Total');
                    if (individualChannels.length > 1) {
                        let worstChannel = null; let minAch = 101;
                        individualChannels.forEach(ch => { const chTarget = calculatePacingTarget(ch); const chAch = (ch.MTD_Actual !== null && chTarget > 0) ? (ch.MTD_Actual / chTarget) * 100 : 101; if (chAch < minAch) { minAch = chAch; worstChannel = ch; } });
                        if (worstChannel) focusHtml = `<span class="focus-indicator">(Focus: ${worstChannel.Channel})</span>`;
                    }
                }
                const barColor = achievement < 90 ? 'var(--bar-bad)' : achievement < 100 ? 'var(--bar-neutral)' : 'var(--bar-good)';
                const iconClass = config.kpiIcons[kpi] || config.kpiIcons.default;
                const numFormatter = (val) => (kpi === 'Volume UC' || kpi === 'NSR') ? formatNumber(val) : (val !== null ? val.toLocaleString(undefined, { maximumFractionDigits: 0 }) : 'N/A');
                return `<div class="platform-row-wrapper"><div class="platform-row" data-kpi="${kpi}" data-platform="${platform}"><div class="platform-name"><i class="icon fa-solid ${iconClass}"></i><span>${platform}</span>${focusHtml}</div><div class="kpi-value">${numFormatter(actual)}</div><div class="kpi-value">${numFormatter(targetForDisplay)}</div><div class="pacing-bar-container"><div class="pacing-bar" style="width: ${Math.min(achievement, 100)}%; background-color: ${barColor};"></div><span class="pacing-bar-text">${achievement.toFixed(0)}%</span></div><div class="kpi-value">${numFormatter(fullTarget)}</div></div><div class="drilldown-container"></div></div>`;
            }).join('');
            return `<div class="kpi-group"><div class="kpi-group-header">${kpi}</div>${platformHtml}</div>`;
        }).join('');
        container.innerHTML = `<div id="mtd-highlight-cards" class="highlight-cards-container">${highlightCardsHtml}</div><div class="card"><div class="pacing-header"><h2 id="pacing-title">Pacing by KPI (Day ${firstRow?.Days_Passed || 'N/A'} of ${firstRow?.Total_Days_in_Month || 'N/A'})</h2><div class="pacing-table-legend"><span>KPI / Platforms</span><span>MTD Actual</span><span>Pacing Target</span><span>Performance</span><span>Full Month Target</span></div></div><div id="pacing-kpi-container">${kpiGroupsHtml}</div></div>`;
        state.renderedTabs.mtd = true;
    };

    const renderYtdTab = () => {
        if (state.renderedTabs.ytd) return;
        const container = document.getElementById('ytd');
        const CURRENT_YEAR = config.TODAY.getFullYear(); 
        const CURRENT_MONTH = config.TODAY.getMonth() + 1;

        // --- START: CORRECTED YTD CALCULATION LOGIC ---
        const historicalTotals = {};
        const relevantHistorical = state.historicalData.filter(r => r.Year == CURRENT_YEAR && r.Month < CURRENT_MONTH && (r.Channel === 'Total' || r.Platform === 'Chatbot'));
        
        relevantHistorical.forEach(r => {
            if (!historicalTotals[r.KPI]) historicalTotals[r.KPI] = 0;
            historicalTotals[r.KPI] += r.Actual || 0;
        });

        // Manually calculate MTD totals with correct fallback logic
        const mtdTotals = {};
        const kpisToSum = ['Volume UC', 'Delivered Orders', 'NSR']; // Define which KPIs need this logic

        kpisToSum.forEach(kpi => {
            mtdTotals[kpi] = 0;
            // Customer Portal: Sum channels since there's no 'Total' row for these KPIs
            const cpMtd = state.liveData
                .filter(r => r.Platform === 'Customer Portal' && r.KPI === kpi && r.Channel !== 'Total')
                .reduce((sum, r) => sum + (r.MTD_Actual || 0), 0);
            
            // Chatbot: Direct value
            const chatbotMtd = state.liveData
                .filter(r => r.Platform === 'Chatbot' && r.KPI === kpi)
                .reduce((sum, r) => sum + (r.MTD_Actual || 0), 0);
                
            mtdTotals[kpi] = cpMtd + chatbotMtd;
        });
        
        const ytdVolume = (historicalTotals['Volume UC'] || 0) + (mtdTotals['Volume UC'] || 0);
        const ytdOrders = (historicalTotals['Delivered Orders'] || 0) + (mtdTotals['Delivered Orders'] || 0);
        const ytdNSR = (historicalTotals['NSR'] || 0) + (mtdTotals['NSR'] || 0);
        // --- END: CORRECTED YTD CALCULATION LOGIC ---

        container.innerHTML = `<div class="ytd-highlight-cards">
            <div class="ytd-highlight-card card"><div class="title">YTD Volume UC</div><div class="value">${formatNumber(ytdVolume)}</div></div>
            <div class="ytd-highlight-card card"><div class="title">YTD Delivered Orders</div><div class="value">${formatNumber(ytdOrders, 0)}</div></div>
            <div class="ytd-highlight-card card"><div class="title">YTD NSR</div><div class="value">${formatNumber(ytdNSR)}</div></div>
        </div><div class="card" style="padding:20px; height: 400px; margin-bottom: 20px;"><canvas id="ytd-chart"></canvas></div>`;
        
        // Chart logic remains the same as it was already calculating correctly month-by-month
        const chartData = { labels: config.monthNames.slice(0, CURRENT_MONTH), actuals: [], targets: [] }; 
        let cumulativeActual = 0, cumulativeTarget = 0;
        const historicalTotalsOnly = state.historicalData.filter(r => r.Channel === 'Total' || r.Platform === 'Chatbot');
        
        for (let i = 1; i <= CURRENT_MONTH; i++) {
            let monthActual = 0, monthTarget = 0;
            if (i < CURRENT_MONTH) {
                monthActual = historicalTotalsOnly.filter(r => r.Year == CURRENT_YEAR && r.Month == i && r.KPI === 'Volume UC').reduce((sum, r) => sum + r.Actual, 0);
                monthTarget = historicalTotalsOnly.filter(r => r.Year == CURRENT_YEAR && r.Month == i && r.KPI === 'Volume UC').reduce((sum, r) => sum + r.Target, 0);
            } else {
                // For the current month's point on the chart, we use the MTD total we calculated
                monthActual = mtdTotals['Volume UC'] || 0;
                // Calculate pacing target for the chart
                const cpLiveRows = state.liveData.filter(r => r.Platform === 'Customer Portal' && r.KPI === 'Volume UC' && r.Channel !== 'Total');
                const chatbotLiveRow = state.liveData.find(r => r.Platform === 'Chatbot' && r.KPI === 'Volume UC');
                let pacingTarget = 0;
                cpLiveRows.forEach(r => pacingTarget += calculatePacingTarget(r) || 0);
                if(chatbotLiveRow) pacingTarget += calculatePacingTarget(chatbotLiveRow) || 0;
                monthTarget = pacingTarget;
            }
            cumulativeActual += monthActual; 
            cumulativeTarget += monthTarget;
            chartData.actuals.push(cumulativeActual); 
            chartData.targets.push(cumulativeTarget);
        }

        if (state.chartInstances['ytd-chart']) state.chartInstances['ytd-chart'].destroy();
        state.chartInstances['ytd-chart'] = new Chart(document.getElementById('ytd-chart'), { 
            type: 'line', 
            data: { 
                labels: chartData.labels, 
                datasets: [ 
                    { label: 'YTD Actual', data: chartData.actuals, borderColor: 'var(--coca-cola-red)', backgroundColor: 'rgba(244, 0, 9, 0.1)', tension: 0.1, fill: true }, 
                    { label: 'YTD Pacing Target', data: chartData.targets, borderColor: 'var(--text-dark)', borderDash: [5, 5], tension: 0.1, fill: false } 
                ] 
            }, 
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                devicePixelRatio: window.devicePixelRatio || 1, 
                scales: { y: { beginAtZero: true, ticks: { callback: value => formatNumber(value) } } }, 
                plugins: { 
                    title: { display: true, text: `Cumulative YTD Volume UC vs. Target` }, 
                    tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatNumber(context.raw, 1)}` } } 
                } 
            } 
        });
        state.renderedTabs.ytd = true;
    };

    const renderClosingTab = () => {
        if (state.renderedTabs.closing) return;
        const container = document.getElementById('closing');
        
        const currentMonth = config.TODAY.getMonth() + 1;
        const currentYear = config.TODAY.getFullYear();
        
        let lastMonth = 0, lastYear = 0;
        state.historicalData.forEach(r => {
            if (r.Year > lastYear || (r.Year === lastYear && r.Month > lastMonth)) {
                if(r.Year < currentYear || (r.Year === currentYear && r.Month < currentMonth)) {
                    lastYear = r.Year;
                    lastMonth = r.Month;
                }
            }
        });

        if (lastMonth === 0) {
            container.innerHTML = `<div class="card" style="padding: 20px;"><p>No historical data available for prior months.</p></div>`;
            return;
        }

        const priorMonth = lastMonth === 1 ? 12 : lastMonth - 1;
        const priorYear = lastMonth === 1 ? lastYear - 1 : lastYear;

        const lastMonthData = state.historicalData.filter(r => r.Year === lastYear && r.Month === lastMonth && (r.Channel === 'Total' || r.Platform === 'Chatbot'));
        const priorMonthData = state.historicalData.filter(r => r.Year === priorYear && r.Month === priorMonth && (r.Channel === 'Total' || r.Platform === 'Chatbot'));

        const getKpiValue = (data, kpi) => data.filter(r => r.KPI === kpi).reduce((sum, r) => sum + (r.Actual || 0), 0);
        
        const mainKpis = ['NSR', 'Volume UC', 'Delivered Orders', 'Active Placed', 'Registered Customers'];
        let tableHtml = `<table class="table"><thead><tr><th>KPI</th><th>Actual</th><th>Target</th><th>Ach. %</th><th>vs. Prior Month</th></tr></thead><tbody>`;
        mainKpis.forEach(kpi => {
            const actual = getKpiValue(lastMonthData, kpi);
            const target = lastMonthData.filter(r => r.KPI === kpi).reduce((sum, r) => sum + (r.Target || 0), 0);
            const prior = getKpiValue(priorMonthData, kpi);
            
            const ach = (target > 0) ? (actual / target) * 100 : 0;
            const mom = (prior > 0) ? ((actual - prior) / prior) * 100 : 0;

            const achColor = ach < 90 ? 'text-red' : ach < 100 ? '' : 'text-green';
            const momColor = mom < 0 ? 'text-red' : 'text-green';
            
            tableHtml += `<tr>
                <td>${kpi}</td>
                <td>${formatNumber(actual, 1)}</td>
                <td>${formatNumber(target, 1)}</td>
                <td class="${achColor}">${ach > 0 ? ach.toFixed(1) + '%' : 'N/A'}</td>
                <td class="${momColor}">${prior > 0 ? formatNumber(mom, 1, true) + '%' : 'N/A'}</td>
            </tr>`;
        });
        tableHtml += `</tbody></table>`;
        
        const analyticalKpis = ['Order Frequency', 'UC per Order', 'Fulfillment Rate %'];
        let cardsHtml = '';
        analyticalKpis.forEach(kpi => {
            const value = getKpiValue(lastMonthData, kpi);
            const priorValue = getKpiValue(priorMonthData, kpi);
            const mom = (priorValue > 0) ? ((value - priorValue) / priorValue) * 100 : 0;
            const momColor = mom < 0 ? 'text-red' : 'text-green';
            cardsHtml += `<div class="analytical-card">
                <div class="title">${kpi}</div>
                <div class="value">${kpi.includes('%') ? value.toFixed(1) : formatNumber(value, 1)}</div>
                <div class="mom ${momColor}">${priorValue > 0 ? formatNumber(mom, 1, true) + '%' : 'N/A'} MoM</div>
            </div>`;
        });

        container.innerHTML = `
            <h2 style="margin-bottom: 20px;">Closing Performance for ${config.monthNames[lastMonth-1]} ${lastYear}</h2>
            <div class="grid-layout">
                <div class="card">${tableHtml}</div>
                <div><div class="analytical-cards">${cardsHtml}</div></div>
            </div>`;
        state.renderedTabs.closing = true;
    };

    const renderHistoricalTab = () => {
        if (state.renderedTabs.historical) return;
        const container = document.getElementById('historical');
        
        const platforms = [...new Set(state.historicalData.map(r => r.Platform))];
        const kpis = [...new Set(state.historicalData.map(r => r.KPI))];

        container.innerHTML = `
            <div class="historical-filters">
                <select id="hist-platform"><option value="">All Platforms</option>${platforms.map(p => `<option>${p}</option>`).join('')}</select>
                <select id="hist-channel" disabled><option value="">All Channels</option></select>
                <select id="hist-kpi">${kpis.sort().map(k => `<option ${k === 'Volume UC' ? 'selected' : ''}>${k}</option>`).join('')}</select>
            </div>
            <div class="card" style="padding:20px; height: 450px;"><canvas id="historical-chart"></canvas></div>`;

        const platformSelect = document.getElementById('hist-platform');
        const channelSelect = document.getElementById('hist-channel');
        const kpiSelect = document.getElementById('hist-kpi');

        const updateChannelFilter = () => {
            const selectedPlatform = platformSelect.value;
            if (!selectedPlatform) {
                channelSelect.innerHTML = '<option value="">All Channels</option>';
                channelSelect.disabled = true;
                return;
            }
            const channels = [...new Set(state.historicalData.filter(r => r.Platform === selectedPlatform).map(r => r.Channel))];
            channelSelect.innerHTML = `<option value="">All Channels</option>${channels.sort().map(c => `<option>${c}</option>`).join('')}`;
            channelSelect.disabled = false;
        };
        
        const updateChart = () => {
            const platform = platformSelect.value;
            const channel = channelSelect.value;
            const kpi = kpiSelect.value;

            let filteredData = state.historicalData.filter(r => r.KPI === kpi);
            if (platform) filteredData = filteredData.filter(r => r.Platform === platform);
            if (channel) filteredData = filteredData.filter(r => r.Channel === channel);

            const aggregated = filteredData.reduce((acc, row) => {
                const period = `${row.Year}-${String(row.Month).padStart(2, '0')}`;
                if (!acc[period]) acc[period] = { actual: 0, target: 0 };
                acc[period].actual += row.Actual || 0;
                acc[period].target += row.Target || 0;
                return acc;
            }, {});

            const sortedPeriods = Object.keys(aggregated).sort();
            const labels = sortedPeriods.map(p => {
                const [year, month] = p.split('-');
                return `${config.monthNames[parseInt(month,10)-1]} '${year.slice(2)}`;
            });
            const actuals = sortedPeriods.map(p => aggregated[p].actual);
            const targets = sortedPeriods.map(p => aggregated[p].target);
            
            const chartCtx = document.getElementById('historical-chart');
            if(state.chartInstances['historical-chart']) state.chartInstances['historical-chart'].destroy();
            state.chartInstances['historical-chart'] = new Chart(chartCtx, {
                type: 'line',
                data: { labels, datasets: [
                    { label: 'Actual', data: actuals, borderColor: 'var(--coca-cola-red)', tension: 0.1 },
                    { label: 'Target', data: targets, borderColor: 'var(--text-dark)', borderDash: [5, 5], tension: 0.1 }
                ]},
                options: { responsive: true, maintainAspectRatio: false, devicePixelRatio: window.devicePixelRatio || 1, plugins: { title: { display: true, text: `Historical Trend for ${kpi}` }}}
            });
        };

        platformSelect.addEventListener('change', () => { updateChannelFilter(); updateChart(); });
        channelSelect.addEventListener('change', updateChart);
        kpiSelect.addEventListener('change', updateChart);
        
        updateChart(); // Initial render
        state.renderedTabs.historical = true;
    };


    // --- 6. EVENT LISTENERS & INITIALIZATION CALL ---
    navContainer.addEventListener('click', (e) => {
        if (!e.target.matches('.nav-button')) return;
        const tabId = e.target.dataset.tab;
        navContainer.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('.content-area').forEach(area => area.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const title = e.target.textContent;
        subtitleElement.textContent = `${title} | ${config.TODAY.toLocaleDateString('en-GB', { dateStyle: 'long' })} | ${timeZone}`;

        switch (tabId) {
            case 'mtd': renderMtdTab(); break;
            case 'ytd': renderYtdTab(); break;
            case 'closing': renderClosingTab(); break;
            case 'historical': renderHistoricalTab(); break;
        }
    });

    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-kpi]');
        if (!target) return;
        const container = target.closest('.platform-row-wrapper, .highlight-card');
        const drilldown = container?.querySelector('.drilldown-container, .card-drilldown-container');
        if (!drilldown) return;
        
        const isExpanded = drilldown.classList.contains('expanded');
        
        document.querySelectorAll('.drilldown-container.expanded, .card-drilldown-container.expanded').forEach(el => {
            if(el !== drilldown) el.classList.remove('expanded');
        });
        
        if (isExpanded) {
            drilldown.classList.remove('expanded');
        } else {
            const kpi = target.dataset.kpi;
            if (config.highlightKPIs.includes(kpi)) {
                renderSimpleDrilldown(drilldown, kpi, target.dataset.platform);
            } else {
                renderAnalyticalDrilldown(drilldown, kpi, target.dataset.platform);
            }
            drilldown.classList.add('expanded');
        }
    });
    
    init();
});