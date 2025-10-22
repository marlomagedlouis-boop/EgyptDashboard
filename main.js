document.addEventListener('DOMContentLoaded', () => {
    // --- 1. CONFIGURATION & STATE ---
    const config = {
        TODAY: new Date('2025-10-22T17:15:00'), // Updated time
        kpiIcons: { 'Registered Customers': 'fa-user-plus', 'Active Customers': 'fa-user-check', 'Delivered Orders': 'fa-truck-fast', 'Volume UC': 'fa-boxes-stacked', 'NSR': 'fa-dollar-sign', 'Active Placed': 'fa-mouse-pointer', 'Digital Order Share %': 'fa-chart-pie', 'Digital Volume Share %': 'fa-chart-area', 'Order Frequency': 'fa-repeat', 'UC per Order': 'fa-box', 'Fulfillment Rate %': 'fa-circle-check', 'default': 'fa-chart-line' },
        highlightKPIs: ['Active Placed', 'Digital Order Share %', 'Digital Volume Share %'],
        monthMap: { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 },
        monthNames: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    };
    const state = { liveData: [], historicalData: [], chartInstances: {}, renderedTabs: { mtd: false, ytd: false, closing: false, historical: false }, closingTab: { year: 0, month: 0, kpi: '' } };

    // --- COLOR CONSTANTS ---
    const rootStyles = getComputedStyle(document.documentElement);
    const COLOR_GOOD = rootStyles.getPropertyValue('--bar-good').trim();
    const COLOR_BAD = rootStyles.getPropertyValue('--bar-bad').trim();
    const COLOR_NEUTRAL = rootStyles.getPropertyValue('--bar-neutral').trim();

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

    // --- 4. DATA PARSING & INITIALIZATION ---
    const parseData = (file, text) => new Promise((resolve, reject) => Papa.parse(text, { header: true, skipEmptyLines: 'greedy', transformHeader: h => h.trim(), complete: (results) => results.errors.length ? reject(new Error(`Parsing error in ${file}: ${results.errors[0].message}`)) : resolve(results.data) }));
    const cleanRow = (row, numericFields) => {
        const cleaned = { ...row };
        if (!cleaned.Platform || !cleaned.KPI) { return null; }

        Object.keys(cleaned).forEach(key => {
            if (typeof cleaned[key] === 'string') { cleaned[key] = cleaned[key].replace(/\s|&nbsp;/g, ' ').trim(); }
            if (numericFields.includes(key)) {
                const value = cleaned[key];
                if (value === undefined || value === null || String(value) === '') { cleaned[key] = null; }
                else { const num = parseFloat(String(value).replace(/,/g, '')); cleaned[key] = isNaN(num) ? null : num; }
            }
        });
        if (cleaned.Month && config.monthMap[cleaned.Month]) cleaned.Month = config.monthMap[cleaned.Month];
        return cleaned;
    };

     const getLatestDataDate = () => {
         if (state.liveData.length === 0) return config.TODAY;
        const sampleRow = state.liveData[0];
        if (sampleRow.Total_Days_in_Month && sampleRow.Days_Passed) {
             let currentLiveMonth = 0;
             let currentLiveYear = config.TODAY.getFullYear();
             if (state.historicalData.length > 0) {
                 const maxHistYear = Math.max(...state.historicalData.map(r => r.Year));
                 const maxHistMonthInMaxYear = Math.max(...state.historicalData.filter(r => r.Year === maxHistYear).map(r => r.Month));
                 currentLiveMonth = maxHistMonthInMaxYear + 1;
                 currentLiveYear = maxHistYear;
                 if (currentLiveMonth > 12) {
                     currentLiveMonth = 1;
                     currentLiveYear += 1;
                 }
             } else {
                 currentLiveMonth = config.TODAY.getMonth() + 1;
             }
             const day = Math.min(sampleRow.Days_Passed || 1, sampleRow.Total_Days_in_Month || 31);
             try { return new Date(currentLiveYear, currentLiveMonth - 1, day); }
             catch(e) { console.warn("Could not construct date from live data, falling back.", e); return config.TODAY; }
        }
        return config.TODAY;
    };

    const init = async () => {
        try {
            const [liveText, historicalText] = await Promise.all([
                fetch('live_progress.csv').then(res => { if (!res.ok) throw new Error('live_progress.csv not found'); return res.text(); }),
                fetch('historical_log.csv').then(res => { if (!res.ok) throw new Error('historical_log.csv not found'); return res.text(); })
            ]);
            const numericLive = ['MTD_Actual', 'Full_Month_Target', 'Total_Days_in_Month', 'Days_Passed'];
            const numericHist = ['Year', 'Actual', 'Target'];
            state.liveData = (await parseData('live_progress.csv', liveText))
                                .map(row => cleanRow(row, numericLive))
                                .filter(row => row !== null);
            state.historicalData = (await parseData('historical_log.csv', historicalText))
                                    .map(row => cleanRow(row, numericHist))
                                    .filter(row => row !== null);

            if (state.liveData.length === 0 || state.historicalData.length === 0) throw new Error("One or more data files are empty or could not be parsed after cleaning.");

            Chart.register(ChartDataLabels);
            const lastDataDate = getLatestDataDate();
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            subtitleElement.textContent = `Current Month Pacing | Data as of ${lastDataDate.toLocaleDateString('en-GB', { dateStyle: 'long' })} | ${timeZone}`;
            renderMtdTab(); // Render the default tab
        } catch (error) {
            console.error("CRITICAL ERROR:", error);
            mainContainer.innerHTML = `<div class="error-message"><h2>Dashboard Failed to Load</h2><p><strong>Error:</strong> ${error.message}</p></div>`;
        } finally {
            loadingSpinner.style.display = 'none';
        }
    };

    // --- 5. RENDER FUNCTIONS ---
    const renderMtdTab = () => {
        if (state.renderedTabs.mtd) return;
        const container = document.getElementById('mtd');
        const firstRow = state.liveData[0];
        const highlightCardsHtml = config.highlightKPIs.map(kpi => {
            const isPercent = kpi.includes('%'); let cpValue = 0, chatbotValue = 0;
            if (isPercent) { const cpRow = state.liveData.find(r => r.KPI === kpi && r.Platform === 'Customer Portal' && r.Channel === 'Total'); const chatbotRow = state.liveData.find(r => r.KPI === kpi && r.Platform === 'Chatbot'); cpValue = cpRow ? cpRow.MTD_Actual : 0; chatbotValue = chatbotRow ? chatbotRow.MTD_Actual : 0; }
            else { cpValue = state.liveData.filter(r => r.KPI === kpi && r.Platform === 'Customer Portal' && r.Channel !== 'Total').reduce((sum, r) => sum + (r.MTD_Actual || 0), 0); chatbotValue = state.liveData.filter(r => r.KPI === kpi && r.Platform === 'Chatbot').reduce((sum, r) => sum + (r.MTD_Actual || 0), 0); }
            const iconClass = config.kpiIcons[kpi] || config.kpiIcons.default;
            return `<div class="highlight-card card"><div class="highlight-card-header"><div class="icon"><i class="fa-solid ${iconClass}"></i></div><div class="title">${kpi}</div></div><div class="highlight-card-body"><div class="platform-metric drilldown-capable" data-kpi="${kpi}" data-platform="Customer Portal"><span class="label">Customer Portal</span><span class="value">${isPercent ? cpValue.toFixed(1) + '%' : formatNumber(cpValue,0)}</span></div><div class="platform-metric"><span class="label">Chatbot</span><span class="value">${isPercent ? chatbotValue.toFixed(1) + '%' : formatNumber(chatbotValue,0)}</span></div><div class="card-drilldown-container"></div></div></div>`;
        }).join('');

        const validLiveKPIs = [...new Set(state.liveData.map(r => r.KPI))].filter(Boolean);
        const tableKPIs = validLiveKPIs.filter(kpi => !config.highlightKPIs.includes(kpi));
        
        const kpiGroupsHtml = tableKPIs.sort().map(kpi => {
            if (!kpi) return '';
            const platforms = [...new Set(state.liveData.filter(r => r.KPI === kpi).map(r => r.Platform))].filter(Boolean);
            const platformHtml = platforms.map(platform => {
                if (!platform) return '';
                const channels = state.liveData.filter(r => r.KPI === kpi && r.Platform === platform);
                const totalRow = channels.find(c => c.Channel === 'Total');
                const actual = totalRow ? totalRow.MTD_Actual : channels.filter(c => c.Channel !== 'Total').reduce((sum, ch) => sum + (ch.MTD_Actual || 0), 0);
                const fullTarget = totalRow ? totalRow.Full_Month_Target : channels.filter(c => c.Channel !== 'Total').reduce((sum, ch) => sum + (ch.Full_Month_Target || 0), 0);
                let achievement, targetForDisplay;
                if (kpi === 'Registered Customers') { targetForDisplay = fullTarget; achievement = (actual !== null && fullTarget > 0) ? (actual / fullTarget) * 100 : 0; }
                else { const pacingTarget = totalRow ? (totalRow.Full_Month_Target / totalRow.Total_Days_in_Month) * totalRow.Days_Passed : channels.filter(c => c.Channel !== 'Total').reduce((sum, ch) => sum + ((ch.Full_Month_Target / ch.Total_Days_in_Month) * ch.Days_Passed || 0), 0); targetForDisplay = pacingTarget; achievement = (actual !== null && pacingTarget > 0) ? (actual / pacingTarget) * 100 : 0; }
                let focusHtml = '';
                if (achievement < 100 && platform === 'Customer Portal' && kpi !== 'Registered Customers') {
                    const individualChannels = channels.filter(c => c.Channel !== 'Total');
                    if (individualChannels.length > 1) {
                        let worstChannel = null; let minAch = 101;
                        individualChannels.forEach(ch => { const chTarget = (ch.Full_Month_Target / ch.Total_Days_in_Month) * ch.Days_Passed; const chAch = (ch.MTD_Actual !== null && chTarget > 0) ? (ch.MTD_Actual / chTarget) * 100 : 101; if (chAch < minAch) { minAch = chAch; worstChannel = ch; } });
                        if (worstChannel) focusHtml = `<span class="focus-indicator">(Focus: ${worstChannel.Channel})</span>`;
                    }
                }
                const barColor = achievement < 90 ? COLOR_BAD : achievement < 100 ? COLOR_NEUTRAL : COLOR_GOOD;
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
        const CURRENT_YEAR = getLatestDataDate().getFullYear();
        const CURRENT_MONTH = getLatestDataDate().getMonth() + 1;

        const ytdTotals = {};
        const relevantHistorical = state.historicalData.filter(r => r.Year == CURRENT_YEAR && r.Month < CURRENT_MONTH && (r.Channel === 'Total' || r.Platform === 'Chatbot'));
        relevantHistorical.forEach(r => { if (!ytdTotals[r.KPI]) ytdTotals[r.KPI] = 0; ytdTotals[r.KPI] += r.Actual || 0; });

        const mtdTotals = {};
        const kpisToSum = ['Volume UC', 'Delivered Orders', 'NSR'];
        kpisToSum.forEach(kpi => {
            mtdTotals[kpi] = 0;
            const cpMtd = state.liveData.filter(r => r.Platform === 'Customer Portal' && r.KPI === kpi && r.Channel !== 'Total').reduce((sum, r) => sum + (r.MTD_Actual || 0), 0);
            const chatbotMtd = state.liveData.filter(r => r.Platform === 'Chatbot' && r.KPI === kpi).reduce((sum, r) => sum + (r.MTD_Actual || 0), 0);
            mtdTotals[kpi] = cpMtd + chatbotMtd;
            if(ytdTotals[kpi]) ytdTotals[kpi] += mtdTotals[kpi]; else ytdTotals[kpi] = mtdTotals[kpi];
        });

        const ytdChannelTotals = {};
        const allChannels = [...new Set(state.historicalData.filter(r => r.Platform === 'Customer Portal').map(r => r.Channel)), 'Chatbot'];
        
        allChannels.forEach(channel => {
            if (channel === 'Total') return;
            ytdChannelTotals[channel] = 0;
            const histChannelData = state.historicalData.filter(r => r.Year === CURRENT_YEAR && r.Month < CURRENT_MONTH && r.KPI === 'Volume UC' && ((r.Platform === 'Customer Portal' && r.Channel === channel) || (r.Platform === 'Chatbot' && channel === 'Chatbot')));
            ytdChannelTotals[channel] += histChannelData.reduce((sum, r) => sum + (r.Actual || 0), 0);
             const liveChannelData = state.liveData.filter(r => r.KPI === 'Volume UC' && ((r.Platform === 'Customer Portal' && r.Channel === channel) || (r.Platform === 'Chatbot' && channel === 'Chatbot')));
            ytdChannelTotals[channel] += liveChannelData.reduce((sum, r) => sum + (r.MTD_Actual || 0), 0);
        });

        let ytdTableHtml = `<div class="card" style="margin-top: 20px;"><h3 style="padding: 15px 20px; border-bottom: 1px solid var(--border-color);">YTD Volume UC Breakdown</h3><table class="table"><thead><tr><th>Channel/Platform</th><th>YTD Volume UC</th></tr></thead><tbody>`;
        Object.entries(ytdChannelTotals).sort(([,volA], [,volB]) => volB - volA).forEach(([channel, volume]) => {
            ytdTableHtml += `<tr><td>${channel}</td><td>${formatNumber(volume)}</td></tr>`;
        });
        ytdTableHtml += `</tbody></table></div>`;

        container.innerHTML = `<div class="ytd-highlight-cards"><div class="ytd-highlight-card card"><div class="title">YTD Volume UC</div><div class="value">${formatNumber(ytdTotals['Volume UC'])}</div></div><div class="ytd-highlight-card card"><div class="title">YTD Delivered Orders</div><div class="value">${formatNumber(ytdTotals['Delivered Orders'], 0)}</div></div><div class="ytd-highlight-card card"><div class="title">YTD NSR</div><div class="value">${formatNumber(ytdTotals['NSR'])}</div></div></div><div class="card" style="padding:20px; height: 400px; margin-bottom: 20px;"><canvas id="ytd-chart"></canvas></div>${ytdTableHtml}`;

        const chartData = { labels: config.monthNames.slice(0, CURRENT_MONTH), actuals: [], targets: [] };
        let cumulativeActual = 0, cumulativeTarget = 0;
        const historicalTotalsOnly = state.historicalData.filter(r => r.Channel === 'Total' || r.Platform === 'Chatbot');
        for (let i = 1; i <= CURRENT_MONTH; i++) {
            let monthActual = 0, monthTarget = 0;
            if (i < CURRENT_MONTH) {
                monthActual = historicalTotalsOnly.filter(r => r.Year == CURRENT_YEAR && r.Month == i && r.KPI === 'Volume UC').reduce((sum, r) => sum + r.Actual, 0);
                monthTarget = historicalTotalsOnly.filter(r => r.Year == CURRENT_YEAR && r.Month == i && r.KPI === 'Volume UC').reduce((sum, r) => sum + r.Target, 0);
            } else {
                monthActual = mtdTotals['Volume UC'] || 0;
                const cpLiveRows = state.liveData.filter(r => r.Platform === 'Customer Portal' && r.KPI === 'Volume UC' && r.Channel !== 'Total');
                const chatbotLiveRow = state.liveData.find(r => r.Platform === 'Chatbot' && r.KPI === 'Volume UC');
                let pacingTarget = 0;
                cpLiveRows.forEach(r => { const pt = (r.Full_Month_Target / r.Total_Days_in_Month) * r.Days_Passed; if(!isNaN(pt)) pacingTarget += pt; });
                if(chatbotLiveRow) { const pt = (chatbotLiveRow.Full_Month_Target / chatbotLiveRow.Total_Days_in_Month) * chatbotLiveRow.Days_Passed; if(!isNaN(pt)) pacingTarget += pt; }
                monthTarget = pacingTarget;
            }
            cumulativeActual += monthActual;
            cumulativeTarget += monthTarget;
            chartData.actuals.push(cumulativeActual);
            chartData.targets.push(cumulativeTarget);
        }
        if (state.chartInstances['ytd-chart']) state.chartInstances['ytd-chart'].destroy();
        state.chartInstances['ytd-chart'] = new Chart(document.getElementById('ytd-chart'), { type: 'line', data: { labels: chartData.labels, datasets: [ { label: 'YTD Actual', data: chartData.actuals, borderColor: 'var(--coca-cola-red)', backgroundColor: 'rgba(244, 0, 9, 0.1)', tension: 0.1, fill: true, pointRadius: 3, pointHoverRadius: 5 }, { label: 'YTD Pacing Target', data: chartData.targets, borderColor: 'var(--text-dark)', borderDash: [5, 5], tension: 0.1, fill: false, pointRadius: 3, pointHoverRadius: 5 } ] }, options: { responsive: true, maintainAspectRatio: false, devicePixelRatio: 2, scales: { y: { beginAtZero: true, ticks: { callback: value => formatNumber(value) } } }, plugins: { title: { display: true, text: `Cumulative YTD Volume UC vs. Target` }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatNumber(context.raw, 1)}` } }, datalabels: { display: false } } } });
        state.renderedTabs.ytd = true;
    };

    const updateClosingMissionControl = (kpi, year, month) => {
        state.closingTab.kpi = kpi;
        const cpChannels = state.historicalData.filter(r => r.Platform === 'Customer Portal' && r.KPI === kpi && r.Year == year && r.Month == month && r.Channel !== 'Total');
        const chatbotData = state.historicalData.find(r => r.Platform === 'Chatbot' && r.KPI === kpi && r.Year == year && r.Month == month);
        const allEntities = [...cpChannels, chatbotData].filter(Boolean).sort((a,b) => (b.Actual || 0) - (a.Actual || 0));

        const priorMonth = month === 1 ? 12 : month - 1;
        const priorYear = month === 1 ? year - 1 : year;
        const priorMonthAll = state.historicalData.filter(r => r.KPI === kpi && r.Year == priorYear && r.Month == priorMonth);

        const labels = allEntities.map(c => c.Platform === 'Chatbot' ? 'Chatbot' : c.Channel);
        const actuals = allEntities.map(c => c.Actual);
        
        const chartCanvas = document.getElementById('closing-deep-dive-chart');
        if (!chartCanvas) return;

        if (state.chartInstances['closing-deep-dive-chart']) state.chartInstances['closing-deep-dive-chart'].destroy();
        state.chartInstances['closing-deep-dive-chart'] = new Chart(chartCanvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ 
                    label: 'Actual', 
                    data: actuals, 
                    backgroundColor: (context) => {
                        const entity = allEntities[context.dataIndex];
                        if (!entity || entity.Target === null || entity.Target === undefined || entity.Target === 0) return COLOR_NEUTRAL;
                        return (entity.Actual || 0) >= entity.Target ? COLOR_GOOD : COLOR_BAD;
                    },
                    barPercentage: 0.7, 
                    categoryPercentage: 0.7 
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                devicePixelRatio: 2,
                layout: { padding: { top: 20 } },
                plugins: { 
                    title: { display: true, text: `Performance Analysis for ${kpi}`}, 
                    legend: { display: false },
                    tooltip: {
                         callbacks: {
                            title: (context) => context[0].label,
                            label: function(context) {
                                const entity = allEntities[context.dataIndex];
                                let tooltip = [`Actual: ${formatNumber(entity.Actual)}`];
                                if (entity.Target > 0) {
                                    const ach = (entity.Actual / entity.Target) * 100;
                                    tooltip.push(`Target: ${formatNumber(entity.Target)} (${ach.toFixed(1)}%)`);
                                }
                                const priorEntity = priorMonthAll.find(p => p.Channel === entity.Channel && p.Platform === entity.Platform);
                                if (priorEntity && priorEntity.Actual > 0) {
                                    const mom = ((entity.Actual - priorEntity.Actual) / priorEntity.Actual) * 100;
                                    tooltip.push(`vs Prior Mo.: ${mom.toFixed(1)}%`);
                                }
                                return tooltip;
                            }
                        }
                    },
                    datalabels: {
                        display: 'auto',
                        clamp: true,
                        anchor: 'end',
                        align: 'top',
                        offset: 4,
                        font: { weight: 'bold', size: 10 },
                        formatter: (value, context) => {
                            const entity = allEntities[context.dataIndex];
                            const priorEntity = priorMonthAll.find(p => p.Channel === entity.Channel && p.Platform === entity.Platform);
                            if (priorEntity && priorEntity.Actual > 0 && value > 0) {
                                const mom = ((value - priorEntity.Actual) / priorEntity.Actual) * 100;
                                const arrow = mom >= 0 ? '▲' : '▼';
                                return `${arrow} ${Math.abs(mom).toFixed(1)}%`;
                            }
                            return null;
                        },
                        color: (context) => {
                            const entity = allEntities[context.dataIndex];
                             const priorEntity = priorMonthAll.find(p => p.Channel === entity.Channel && p.Platform === entity.Platform);
                            if (!priorEntity || priorEntity.Actual === 0) return 'var(--text-light)';
                            return (entity.Actual || 0) >= priorEntity.Actual ? COLOR_GOOD : COLOR_BAD;
                        }
                    }
                }, 
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        afterDataLimits: (scale) => { scale.max *= 1.15; }, 
                        ticks: { callback: value => formatNumber(value) } 
                    },
                    x: {}
                } 
            }
        });

        // --- Channel Mix Chart ---
        const allActuals = allEntities.map(e => e.Actual || 0);
        const platformTotal = allActuals.reduce((sum, val) => sum + val, 0);
        const mixLabels = allEntities.map(e => e.Platform === 'Chatbot' ? 'Chatbot' : e.Channel);
        const mixData = allEntities.map(e => platformTotal > 0 ? ((e.Actual || 0) / platformTotal) * 100 : 0);
        
        const mixChartCanvas = document.getElementById('closing-mix-chart');
        if (mixChartCanvas) {
            if (state.chartInstances['closing-mix-chart']) state.chartInstances['closing-mix-chart'].destroy();
            state.chartInstances['closing-mix-chart'] = new Chart(mixChartCanvas, {
                type: 'doughnut',
                data: { labels: mixLabels, datasets: [{ data: mixData, backgroundColor: ['#D8BFD8', '#9370DB', '#E0B0FF', '#FAE6FA', '#8A2BE2'] }] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    devicePixelRatio: 2,
                    plugins: { 
                        legend: { display: false }, 
                        title: {display: true, text: `Mix % for ${kpi}`},
                        datalabels: {
                            display: (context) => context.dataset.data[context.dataIndex] > 5,
                            formatter: (value) => `${value.toFixed(1)}%`,
                            color: '#2D2D2D', 
                            font: { weight: 'bold' }
                        }
                    } 
                }
            });
        }

         // --- Update Right Insights (CORRECTED SELECTORS) ---
         const updateInsightPanel = (kpiName, panelId) => {
             const getChannelPerformance = (kpi, year, month) => { // Define helper within scope
                const channels = state.historicalData.filter(r => r.Platform === 'Customer Portal' && r.KPI === kpi && r.Year === year && r.Month === month && r.Channel !== 'Total');
                if (channels.length === 0) return { topPerformer: { channel: 'N/A', value: 'N/A'}, areaForImprovement: { channel: 'N/A', value: 'N/A'}, biggestContributor: { channel: 'N/A', value: 'N/A'}, smallestContributor: { channel: 'N/A', value: 'N/A'} };
                const withAch = channels.map(c => ({...c, ach: (c.Target > 0) ? ((c.Actual || 0) / c.Target) * 100 : -1 })).filter(c => c.ach !== -1);
                let topPerformer = { channel: 'N/A', value: 'N/A' }, areaForImprovement = { channel: 'N/A', value: 'N/A' };
                if (withAch.length > 0) {
                    withAch.sort((a,b) => b.ach - a.ach);
                    topPerformer = { channel: withAch[0].Channel, value: `${withAch[0].ach.toFixed(1)}%` };
                    areaForImprovement = { channel: withAch[withAch.length - 1].Channel, value: `${withAch[withAch.length - 1].ach.toFixed(1)}%` };
                }
                const byActual = [...channels].sort((a,b) => (b.Actual || 0) - (a.Actual || 0));
                const biggestContributor = byActual.length > 0 ? { channel: byActual[0].Channel, value: formatNumber(byActual[0].Actual) } : { channel: 'N/A', value: 'N/A' };
                const smallestContributor = byActual.length > 0 ? { channel: byActual[byActual.length - 1].Channel, value: formatNumber(byActual[byActual.length - 1].Actual) } : { channel: 'N/A', value: 'N/A' };
                return { topPerformer, areaForImprovement, biggestContributor, smallestContributor };
            };

            const performance = getChannelPerformance(kpiName, year, month);
            const panel = document.getElementById(panelId);
             if(panel) {
                // Use more specific selectors within the panel's body
                const body = panel.querySelector('.body');
                if (body) {
                    body.querySelector('.item .top-performer').textContent = `${performance.topPerformer.channel} (${performance.topPerformer.value})`;
                    body.querySelector('.item .area-improvement').textContent = `${performance.areaForImprovement.channel} (${performance.areaForImprovement.value})`;
                    body.querySelector('.item .biggest-contributor').textContent = `${performance.biggestContributor.channel} (${performance.biggestContributor.value})`;
                    body.querySelector('.item .smallest-contributor').textContent = `${performance.smallestContributor.channel} (${performance.smallestContributor.value})`;
                } else {
                     console.error(`Body element not found in panel with ID ${panelId}.`);
                }
            } else {
                 console.error(`Insight panel with ID ${panelId} not found.`);
            }
         };
         updateInsightPanel('Volume UC', 'volume-uc-insights');
         updateInsightPanel('Active Customers', 'active-customers-insights');
    };
    
    const renderClosingTab = (targetYear = 0, targetMonth = 0) => {
        const container = document.getElementById('closing');
        if (!targetYear || !targetMonth) {
            const currentMonthJS = config.TODAY.getMonth();
            const currentYear = config.TODAY.getFullYear();
            let lastHistoricalMonth = 0, lastHistoricalYear = 0;
            state.historicalData.forEach(r => {
                if (r.Year > lastHistoricalYear || (r.Year === lastHistoricalYear && r.Month > lastHistoricalMonth)) {
                    if (r.Year < currentYear || (r.Year === currentYear && r.Month <= currentMonthJS + 1)) {
                        lastHistoricalYear = r.Year;
                        lastHistoricalMonth = r.Month;
                    }
                }
            });
             if (lastHistoricalYear === 0) {
                 lastHistoricalMonth = currentMonthJS === 0 ? 12 : currentMonthJS;
                 lastHistoricalYear = currentMonthJS === 0 ? currentYear - 1 : currentYear;
                 if (!state.historicalData.some(r => r.Year === lastHistoricalYear && r.Month === lastHistoricalMonth)) {
                    lastHistoricalYear = 0;
                 }
            }
            targetYear = lastHistoricalYear;
            targetMonth = lastHistoricalMonth;
        }

        if (targetYear === 0) { container.innerHTML = `<div class="card" style="padding: 20px;"><p>No historical data available for analysis.</p></div>`; state.renderedTabs.closing = true; return; }

        state.closingTab.year = targetYear;
        state.closingTab.month = targetMonth;

        const availableYears = [...new Set(state.historicalData.map(r => r.Year))].sort((a,b) => b-a);
        const availableMonths = [...new Set(state.historicalData.filter(r => r.Year === targetYear).map(r => r.Month))].sort((a,b) => a-b); 

        const allKpis = [...new Set(state.historicalData.filter(r => r.Year === targetYear && r.Month === targetMonth).map(r => r.KPI))];
        const primaryKpis = [], secondaryKpis = [];
        allKpis.forEach(kpi => {
            const hasTarget = state.historicalData.some(r => r.KPI === kpi && r.Year === targetYear && r.Month === targetMonth && r.Target !== null && r.Target !== 0);
            if (hasTarget) primaryKpis.push(kpi);
            else secondaryKpis.push(kpi);
        });

        const createKpiCards = (kpiList, isPrimary) => kpiList.sort().map((kpi) => {
            const cpRow = state.historicalData.find(r => r.KPI === kpi && r.Year === targetYear && r.Month === targetMonth && r.Platform === 'Customer Portal' && r.Channel === 'Total');
            let totalActual = 0;
            if (isPrimary) {
                const cbRow = state.historicalData.find(r => r.KPI === kpi && r.Year === targetYear && r.Month === targetMonth && r.Platform === 'Chatbot');
                totalActual = (cpRow?.Actual || 0) + (cbRow?.Actual || 0);
            } else {
                totalActual = (cpRow?.Actual || 0);
            }
            if (totalActual === 0 && !cpRow && !(isPrimary && state.historicalData.some(r => r.KPI === kpi && r.Year === targetYear && r.Month === targetMonth && r.Platform === 'Chatbot'))) return '';
            const iconClass = config.kpiIcons[kpi] || config.kpiIcons.default;
            // Add 'active' class based on the stored state kpi
            const isActive = kpi === state.closingTab.kpi;
            return `<div class="kpi-card ${isActive ? 'active' : ''}" data-kpi="${kpi}">
                <div class="title"><i class="icon fa-solid ${iconClass}"></i> ${kpi}</div>
                <div class="value">${formatNumber(totalActual, 1)}</div>
            </div>`;
        }).join('');
        
        container.innerHTML = `
            <div class="closing-header">
                <h2>Monthly Performance Analysis: <span id="closing-month-title">${config.monthNames[targetMonth - 1]} ${targetYear}</span></h2>
                <div class="closing-filters">
                    <select id="closing-year-select">${availableYears.map(y => `<option value="${y}" ${y === targetYear ? 'selected' : ''}>${y}</option>`).join('')}</select>
                    <select id="closing-month-select">${availableMonths.map(m => `<option value="${m}" ${m === targetMonth ? 'selected' : ''}>${config.monthNames[m-1]}</option>`).join('')}</select>
                </div>
            </div>
            <div class="mission-control-grid">
                <div id="closing-col-left">
                    <div class="kpi-navigator-group">
                        <div class="kpi-navigator-group-title">Primary KPIs</div>
                        <div class="kpi-card-grid">${createKpiCards(primaryKpis, true)}</div>
                    </div>
                    <div class="kpi-navigator-group">
                        <div class="kpi-navigator-group-title">Secondary Metrics</div>
                        <div class="kpi-card-grid">${createKpiCards(secondaryKpis, false)}</div>
                    </div>
                </div>
                <div id="closing-col-center" class="card" style="padding: 20px; min-height: 500px;">
                    <canvas id="closing-deep-dive-chart"></canvas>
                </div>
                <div id="closing-col-right">
                    <div id="volume-uc-insights" class="insight-panel card" style="padding: 20px;">
                        <div class="title">Volume UC Analysis</div>
                        <div class="body">
                             <div class="item"><span class="label">Top Performer (vs. Target)</span><span class="value text-green top-performer"></span></div>
                            <div class="item"><span class="label">Area for Improvement</span><span class="value text-red area-improvement"></span></div>
                            <div class="item"><span class="label">Biggest Contributor</span><span class="value biggest-contributor"></span></div>
                            <div class="item"><span class="label">Smallest Contributor</span><span class="value smallest-contributor"></span></div>
                        </div>
                    </div>
                    <div id="active-customers-insights" class="insight-panel card" style="padding: 20px;">
                        <div class="title">Active Customers Analysis</div>
                         <div class="body">
                             <div class="item"><span class="label">Top Performer (vs. Target)</span><span class="value text-green top-performer"></span></div>
                            <div class="item"><span class="label">Area for Improvement</span><span class="value text-red area-improvement"></span></div>
                            <div class="item"><span class="label">Biggest Contributor</span><span class="value biggest-contributor"></span></div>
                            <div class="item"><span class="label">Smallest Contributor</span><span class="value smallest-contributor"></span></div>
                        </div>
                    </div>
                    <div class="insight-panel card" style="padding: 20px; height: 250px;">
                         <canvas id="closing-mix-chart"></canvas>
                    </div>
                </div>
            </div>`;
        
        let initialKPI = state.closingTab.kpi;
        const currentMonthKpis = [...primaryKpis, ...secondaryKpis];
        if (!initialKPI || !currentMonthKpis.includes(initialKPI)) {
            initialKPI = primaryKpis.includes('NSR') ? 'NSR' : (primaryKpis[0] || secondaryKpis[0]);
        }
        
        // Ensure the initialKPI exists before trying to update
        if (initialKPI && currentMonthKpis.includes(initialKPI)) {
            // Mark the initial card as active after rendering innerHTML
            const activeCard = document.querySelector(`#closing-col-left .kpi-card[data-kpi="${initialKPI}"]`);
            if (activeCard) activeCard.classList.add('active');
            updateClosingMissionControl(initialKPI, targetYear, targetMonth);
        } else {
             // Handle case where there might be no KPIs for the selected month
             const centerCol = document.getElementById('closing-col-center');
             if(centerCol) centerCol.innerHTML = '<p style="text-align: center; padding: 50px;">No data available for selected period.</p>';
             const rightCol = document.getElementById('closing-col-right');
             if(rightCol) rightCol.innerHTML = ''; // Clear insights if no data
        }

        state.renderedTabs.closing = true; // Mark tab as rendered *after* content is added and initial chart is potentially drawn
    };
    
    const renderHistoricalTab = () => {
        if (state.renderedTabs.historical) return;
        const container = document.getElementById('historical');
        const platforms = [...new Set(state.historicalData.map(r => r.Platform))];
        const kpis = [...new Set(state.historicalData.map(r => r.KPI))];
        container.innerHTML = `<div class="historical-filters"><select id="hist-platform"><option value="">All Platforms</option>${platforms.map(p => `<option>${p}</option>`).join('')}</select><select id="hist-channel" disabled><option value="">All Channels</option></select><select id="hist-kpi">${kpis.sort().map(k => `<option ${k === 'Volume UC' ? 'selected' : ''}>${k}</option>`).join('')}</select></div><div class="card" style="padding:20px; height: 450px;"><canvas id="historical-chart"></canvas></div>`;
        const platformSelect = document.getElementById('hist-platform');
        const channelSelect = document.getElementById('hist-channel');
        const kpiSelect = document.getElementById('hist-kpi');
        const updateChannelFilter = () => {
            const selectedPlatform = platformSelect.value;
            if (!selectedPlatform) { channelSelect.innerHTML = '<option value="">All Channels</option>'; channelSelect.disabled = true; return; }
            const channels = [...new Set(state.historicalData.filter(r => r.Platform === selectedPlatform).map(r => r.Channel))];
            channelSelect.innerHTML = `<option value="">All Channels</option>${channels.sort().map(c => `<option>${c}</option>`).join('')}`;
            channelSelect.disabled = false;
        };
        const updateChart = () => {
            const platform = platformSelect.value, channel = channelSelect.value, kpi = kpiSelect.value;
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
            const labels = sortedPeriods.map(p => { const [year, month] = p.split('-'); return `${config.monthNames[parseInt(month,10)-1]} '${year.slice(2)}`; });
            const actuals = sortedPeriods.map(p => aggregated[p].actual);
            const targets = sortedPeriods.map(p => aggregated[p].target);
            const chartCtx = document.getElementById('historical-chart');
            if(state.chartInstances['historical-chart']) state.chartInstances['historical-chart'].destroy();
            state.chartInstances['historical-chart'] = new Chart(chartCtx, {
                type: 'line',
                data: { labels, datasets: [ { label: 'Target', data: targets, borderColor: 'var(--text-dark)', borderDash: [5, 5], tension: 0.1, pointRadius: 3, pointHoverRadius: 5 }, { label: 'Actual', data: actuals, borderColor: 'var(--coca-cola-red)', tension: 0.1, pointRadius: 3, pointHoverRadius: 5, fill: { target: '-1', above: 'rgba(39, 174, 96, 0.2)', below: 'rgba(235, 87, 87, 0.2)' } } ] },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    devicePixelRatio: 2, 
                    plugins: { 
                        title: { display: true, text: `Historical Trend for ${kpi}` }, 
                        tooltip: { mode: 'index', intersect: false }, 
                        datalabels: { 
                            display: 'auto', 
                            align: 'top', 
                            formatter: (value) => formatNumber(value, 1), 
                            font: { size: 9 },
                            backgroundColor: 'rgba(255,255,255,0.7)',
                            borderRadius: 3,
                            padding: 2,
                            filter: (context) => context.dataset.label === 'Actual'
                        } 
                    }, 
                    scales: { y: { beginAtZero: true } } 
                }
            });
        };
        platformSelect.addEventListener('change', () => { updateChannelFilter(); updateChart(); });
        channelSelect.addEventListener('change', updateChart);
        kpiSelect.addEventListener('change', updateChart);
        updateChart();
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
        
        const lastDataDate = getLatestDataDate();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const title = e.target.textContent;
        subtitleElement.textContent = `${title} | Data as of ${lastDataDate.toLocaleDateString('en-GB', { dateStyle: 'long' })} | ${timeZone}`;

        switch (tabId) {
            case 'mtd': renderMtdTab(); break;
            case 'ytd': renderYtdTab(); break;
            case 'closing': renderClosingTab(state.closingTab.year, state.closingTab.month); break;
            case 'historical': renderHistoricalTab(); break;
        }
    });

    // Delegated listener for dynamic content (MTD drilldowns, Closing KPI Cards)
    document.body.addEventListener('click', (e) => {
        const parentSection = e.target.closest('.content-area');
        if (!parentSection) return;

        // MTD Tab Drilldowns
        if (parentSection.id === 'mtd') {
            const target = e.target.closest('.platform-metric.drilldown-capable, .platform-row');
            if (!target) return;
            const container = target.closest('.highlight-card, .platform-row-wrapper');
            const drilldown = container?.querySelector('.drilldown-container, .card-drilldown-container');
            if (!drilldown) return;
            const isExpanded = drilldown.classList.contains('expanded');
            document.querySelectorAll('#mtd .drilldown-container.expanded, #mtd .card-drilldown-container.expanded').forEach(el => {
                if (el !== drilldown) el.classList.remove('expanded');
            });
            if (isExpanded) {
                drilldown.classList.remove('expanded');
            } else {
                const kpi = target.dataset.kpi;
                const platform = target.dataset.platform;
                // Highlight Card Simple Drilldown
                if (target.closest('.highlight-card')) {
                    const channels = state.liveData.filter(d => d.KPI === kpi && d.Platform === platform && d.Channel !== 'Total');
                    if (channels.length === 0) { drilldown.innerHTML = `<div class="drilldown-content" style="padding: 15px 20px;"><p>No channel breakdown.</p></div>`; } 
                    else {
                        const maxValue = Math.max(...channels.map(d => d.MTD_Actual || 0));
                        let chartHtml = channels.map(channel => {
                            const barWidth = maxValue > 0 ? ((channel.MTD_Actual || 0) / maxValue) * 100 : 0;
                            return `<div style="display:grid; grid-template-columns: 80px 1fr; align-items:center; gap: 10px; margin-bottom: 5px; font-size: 12px;"><div style="text-align: right; white-space: nowrap;">${channel.Channel}</div><div style="background: #f0f0f0; border-radius: 4px;"><div style="background-color: var(--coca-cola-red); width: ${barWidth}%; border-radius: 4px; padding: 4px 8px; color: white; text-align: right;">${formatNumber(channel.MTD_Actual,0)}</div></div></div>`;
                        }).join('');
                        drilldown.innerHTML = `<div class="drilldown-content" style="padding: 15px 20px;"><div class="drilldown-header" style="font-size: 13px;">Channel Breakdown (MTD Actual)</div>${chartHtml}</div>`;
                    }
                } 
                // Table Row Analytical Drilldown
                else {
                    const channels = state.liveData.filter(d => d.KPI === kpi && d.Platform === platform && d.Channel !== 'Total');
                    if (channels.length === 0) { drilldown.innerHTML = `<div class="drilldown-content"><p>No channel breakdown.</p></div>`; } 
                    else {
                        let content = `<div class="drilldown-content"><div class="drilldown-header">Channel Breakdown vs. Pacing Target</div>`;
                        channels.forEach(channel => { const actual = channel.MTD_Actual; const targetVal = (channel.Full_Month_Target / channel.Total_Days_in_Month) * channel.Days_Passed; const achievement = (actual !== null && targetVal > 0) ? (actual / targetVal) * 100 : 0; const barColor = achievement < 90 ? COLOR_BAD : achievement < 100 ? COLOR_NEUTRAL : COLOR_GOOD; content += `<div class="drilldown-channel"><div class="drilldown-channel-label">${channel.Channel}</div><div class="pacing-bar-container"><div class="pacing-bar" style="width: ${Math.min(achievement, 100)}%; background-color: ${barColor};"></div><span class="pacing-bar-text">${achievement.toFixed(0)}%</span></div><div style="font-size: 12px; color: var(--text-light); white-space:nowrap;">Act: ${formatNumber(actual,0)} / Tgt: ${formatNumber(targetVal,0)}</div></div>`; });
                        drilldown.innerHTML = content + '</div>';
                    }
                }
                drilldown.classList.add('expanded');
            }
        }

        // Closing Tab KPI Card Clicks
        if (parentSection.id === 'closing') {
            const target = e.target.closest('.kpi-card');
            if(!target) return; // Ignore clicks that aren't on a KPI card
            document.querySelectorAll('#closing .kpi-card').forEach(row => row.classList.remove('active'));
            target.classList.add('active');
            const kpi = target.dataset.kpi;
            updateClosingMissionControl(kpi, state.closingTab.year, state.closingTab.month);
        }
    });
    
    // Delegated listener for Closing Tab Dropdowns (Attached ONCE to body)
     document.body.addEventListener('change', (e) => {
        // Ensure we are in the closing tab before reacting
        const parentSection = e.target.closest('#closing');
        if (!parentSection) return; 

        if (e.target.matches('#closing-year-select')) {
             const newYear = parseInt(e.target.value);
             const monthsInNewYear = [...new Set(state.historicalData.filter(r => r.Year === newYear).map(r => r.Month))].sort((a,b) => b-a);
             // Try to keep the current month if it exists in the new year, otherwise default to latest
             const currentMonthSelected = parseInt(document.getElementById('closing-month-select')?.value || monthsInNewYear[0] || 0);
             const newMonth = monthsInNewYear.includes(currentMonthSelected) ? currentMonthSelected : (monthsInNewYear.length > 0 ? monthsInNewYear[0] : 0);
             renderClosingTab(newYear, newMonth); 
        } else if (e.target.matches('#closing-month-select')) {
            renderClosingTab(state.closingTab.year, parseInt(e.target.value));
        }
    });

    init();
});