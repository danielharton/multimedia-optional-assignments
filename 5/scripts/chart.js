window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('chartCanvas');
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('tooltip');
    const statsPanel = document.getElementById('statsPanel');

    const startPauseBtn = document.getElementById('startPauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const exportBtn = document.getElementById('exportBtn');
    const intervalInput = document.getElementById('intervalInput');
    const intervalValue = document.getElementById('intervalValue');
    const minInput = document.getElementById('minInput');
    const maxInput = document.getElementById('maxInput');
    const gridToggle = document.getElementById('gridToggle');
    const smoothToggle = document.getElementById('smoothToggle');
    const chartTypeSelect = document.getElementById('chartTypeSelect');
    const themeSelect = document.getElementById('themeSelect');

    const width = canvas.width;
    const height = canvas.height;
    const xIncrement = 20;
    const yIncrement = 100;
    const xGridIncrement = 150;
    const pointRadius = 4;
    const visiblePoints = Math.floor(width / xIncrement) + 1;

    const state = {
        running: true,
        intervalMs: 1000,
        min: 0,
        max: height,
        showGrid: true,
        smooth: false,
        chartType: 'line',
        series: [
            { name: 'Series A', color: '#22c55e', data: [] },
            { name: 'Series B', color: '#f97316', data: [] },
            { name: 'Series C', color: '#60a5fa', data: [] },
        ],
        timer: null,
    };

    function randBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    function setIntervalValue(ms) {
        state.intervalMs = ms;
        intervalValue.textContent = `${ms} ms`;
        if (state.running) {
            startTicker();
        }
    }

    function initData() {
        state.series.forEach(series => {
            series.data = [];
            for (let i = 0; i < visiblePoints; i++) {
                series.data.push(randBetween(state.min, state.max));
            }
        });
    }

    function addNewValues() {
        state.series.forEach(series => {
            series.data.push(randBetween(state.min, state.max));
            if (series.data.length > visiblePoints) {
                series.data.shift();
            }
        });
    }

    function valueToY(value) {
        const clamped = Math.max(state.min, Math.min(state.max, value));
        const span = Math.max(1, state.max - state.min);
        const ratio = (clamped - state.min) / span;
        return height - ratio * height;
    }

    function getColorVariable(name) {
        const styles = getComputedStyle(document.body);
        return styles.getPropertyValue(name).trim();
    }

    function drawGrid() {
        if (!state.showGrid) return;
        ctx.save();
        ctx.strokeStyle = getColorVariable('--grid') || 'gray';
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += xGridIncrement) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y <= height; y += yIncrement) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        ctx.fillStyle = getColorVariable('--muted') || '#9ca3af';
        ctx.font = '12px Segoe UI';
        for (let y = 0; y <= height; y += yIncrement) {
            const label = Math.round(state.max - (state.max - state.min) * (y / height));
            ctx.fillText(label, 6, y + 12);
        }
        for (let x = 0; x <= width; x += xGridIncrement) {
            ctx.fillText(x, x + 4, height - 6);
        }
        ctx.restore();
    }

    function movingAverage(data, windowSize = 3) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            let count = 0;
            for (let j = i - Math.floor(windowSize / 2); j <= i + Math.floor(windowSize / 2); j++) {
                const idx = Math.max(0, Math.min(data.length - 1, j));
                sum += data[idx];
                count++;
            }
            result.push(sum / count);
        }
        return result;
    }

    function drawLineSeries(series, fillArea = false) {
        const data = state.smooth ? movingAverage(series.data) : series.data;
        ctx.beginPath();
        data.forEach((value, i) => {
            const x = i * xIncrement;
            const y = valueToY(value);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        if (fillArea) {
            ctx.lineTo((data.length - 1) * xIncrement, height);
            ctx.lineTo(0, height);
            ctx.closePath();
            ctx.fillStyle = `${series.color}33`;
            ctx.fill();
        } else {
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    function drawScatterSeries(series) {
        ctx.fillStyle = series.color;
        series.data.forEach((value, i) => {
            const x = i * xIncrement;
            const y = valueToY(value);
            ctx.beginPath();
            ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawBarSeries(series) {
        const barWidth = xIncrement - 6;
        ctx.fillStyle = series.color;
        series.data.forEach((value, i) => {
            const x = i * xIncrement + 3;
            const y = valueToY(value);
            ctx.beginPath();
            ctx.rect(x, y, barWidth, height - y);
            ctx.fill();
        });
    }

    function drawSeries(series) {
        ctx.save();
        ctx.lineCap = 'round';
        if (state.chartType === 'line') {
            ctx.strokeStyle = series.color;
            drawLineSeries(series, false);
        } else if (state.chartType === 'area') {
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 2;
            drawLineSeries(series, true);
            ctx.beginPath();
            drawLineSeries(series, false);
        } else if (state.chartType === 'bar') {
            drawBarSeries(series);
        } else if (state.chartType === 'scatter') {
            drawScatterSeries(series);
        }
        ctx.restore();
    }

    function drawAll() {
        ctx.clearRect(0, 0, width, height);
        drawGrid();
        state.series.forEach(drawSeries);
        drawTooltipPoint();
        updateStats();
    }

    function startTicker() {
        if (state.timer) clearInterval(state.timer);
        state.timer = setInterval(() => {
            addNewValues();
            drawAll();
        }, state.intervalMs);
    }

    function toggleRunning() {
        state.running = !state.running;
        startPauseBtn.textContent = state.running ? 'Pause' : 'Start';
        startPauseBtn.classList.toggle('primary', state.running);
        if (state.running) {
            startTicker();
        } else if (state.timer) {
            clearInterval(state.timer);
        }
    }

    function resetChart() {
        initData();
        drawAll();
    }

    function exportImage() {
        const link = document.createElement('a');
        link.download = 'chart.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    function updateStats() {
        statsPanel.innerHTML = '';
        state.series.forEach(series => {
            const values = series.data;
            const last = values[values.length - 1];
            const prev = values[values.length - 2] ?? last;
            const min = Math.min(...values).toFixed(1);
            const max = Math.max(...values).toFixed(1);
            const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
            const trend = last > prev ? '▲ rising' : last < prev ? '▼ falling' : '→ steady';

            const card = document.createElement('div');
            card.className = 'stat-card';
            card.innerHTML = `
                <header>
                    <span class="stat-name">${series.name}</span>
                    <span class="stat-dot" style="background:${series.color}"></span>
                </header>
                <div class="stat-value">${last.toFixed(1)}</div>
                <div class="stat-meta">min: ${min} • max: ${max} • avg: ${avg}</div>
                <div class="stat-meta">trend: ${trend}</div>
            `;
            statsPanel.appendChild(card);
        });
    }

    function findNearestPoint(mouseX, mouseY) {
        let nearest = null;
        state.series.forEach(series => {
            series.data.forEach((value, index) => {
                const x = index * xIncrement;
                const y = valueToY(value);
                const dx = x - mouseX;
                const dy = y - mouseY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 10 && (!nearest || dist < nearest.dist)) {
                    nearest = { series, x, y, value, dist };
                }
            });
        });
        return nearest;
    }

    let currentHover = null;
    function drawTooltipPoint() {
        if (!currentHover) {
            tooltip.classList.add('hidden');
            return;
        }
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${currentHover.x + 12}px`;
        tooltip.style.top = `${currentHover.y + 12}px`;
        tooltip.innerHTML = `${currentHover.series.name}<br>Value: ${currentHover.value.toFixed(1)}`;

        ctx.save();
        ctx.fillStyle = '#00000055';
        ctx.strokeStyle = currentHover.series.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(currentHover.x, currentHover.y, pointRadius + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        currentHover = findNearestPoint(x, y);
        drawAll();
    });

    canvas.addEventListener('mouseleave', () => {
        currentHover = null;
        drawAll();
    });

    startPauseBtn.addEventListener('click', toggleRunning);
    resetBtn.addEventListener('click', resetChart);
    exportBtn.addEventListener('click', exportImage);

    intervalInput.addEventListener('input', (e) => {
        setIntervalValue(Number(e.target.value));
    });

    minInput.addEventListener('change', () => {
        const min = Number(minInput.value);
        state.min = min;
        if (state.max <= state.min) {
            state.max = state.min + 10;
            maxInput.value = state.max;
        }
        resetChart();
    });

    maxInput.addEventListener('change', () => {
        const max = Number(maxInput.value);
        state.max = max;
        if (state.max <= state.min) {
            state.min = state.max - 10;
            minInput.value = state.min;
        }
        resetChart();
    });

    gridToggle.addEventListener('change', (e) => {
        state.showGrid = e.target.checked;
        drawAll();
    });

    smoothToggle.addEventListener('change', (e) => {
        state.smooth = e.target.checked;
        drawAll();
    });

    chartTypeSelect.addEventListener('change', (e) => {
        state.chartType = e.target.value;
        drawAll();
    });

    themeSelect.addEventListener('change', (e) => {
        document.body.classList.remove('theme-dark', 'theme-light', 'theme-contrast');
        document.body.classList.add(e.target.value);
        drawAll();
    });

    initData();
    setIntervalValue(state.intervalMs);
    drawAll();
    startTicker();
});