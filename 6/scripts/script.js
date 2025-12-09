document.addEventListener('DOMContentLoaded', () => {
    const originalCanvas = document.getElementById('originalCanvas');
    const originalContext = originalCanvas.getContext('2d');

    const targetCanvas = document.getElementById('targetCanvas');
    const targetContext = targetCanvas.getContext('2d');

    const compareCanvas = document.getElementById('compareCanvas');
    const compareContext = compareCanvas.getContext('2d');

    const histOriginal = document.getElementById('histOriginal');
    const histProcessed = document.getElementById('histProcessed');

    const filterSelect = document.getElementById('filterSelect');
    const applyBtn = document.getElementById('applyBtn');
    const addPipelineBtn = document.getElementById('addPipelineBtn');
    const runPipelineBtn = document.getElementById('runPipelineBtn');
    const clearPipelineBtn = document.getElementById('clearPipelineBtn');
    const fileInput = document.getElementById('fileInput');
    const downloadBtn = document.getElementById('downloadBtn');

    const intensitySlider = document.getElementById('intensitySlider');
    const intensityValue = document.getElementById('intensityValue');
    const paramSlider = document.getElementById('paramSlider');
    const paramValue = document.getElementById('paramValue');
    const compareSlider = document.getElementById('compareSlider');
    const compareValue = document.getElementById('compareValue');
    const kernelGrid = document.getElementById('kernelGrid');
    const pipelineList = document.getElementById('pipelineList');

    const kernels = {
        edge: [
            [-1, -1, -1],
            [-1, 8, -1],
            [-1, -1, -1]
        ],
        gaussian: [
            [0.0625, 0.125, 0.0625],
            [0.125, 0.25, 0.125],
            [0.0625, 0.125, 0.0625]
        ],
        sharpen: [
            [0, -1, 0],
            [-1, 5, -1],
            [0, -1, 0]
        ],
        emboss: [
            [-2, -1, 0],
            [-1, 1, 1],
            [0, 1, 2]
        ],
        diagonalEmboss: [
            [-1, -1, 0],
            [-1, 0, 1],
            [0, 1, 1]
        ],
        boxBlur: [
            [0.111, 0.111, 0.111],
            [0.111, 0.111, 0.111],
            [0.111, 0.111, 0.111]
        ]
    };

    let originalImageData = null;
    let processedImageData = null;
    let blendedImageData = null;
    let pipeline = [];

    initKernelGrid();
    loadDefaultImage();
    registerEvents();

    function registerEvents() {
        applyBtn.addEventListener('click', () => {
            applySelectedFilter();
        });

        addPipelineBtn.addEventListener('click', () => {
            const step = buildStepFromUI();
            if (step) {
                pipeline.push(step);
                refreshPipelineUI();
            }
        });

        runPipelineBtn.addEventListener('click', () => {
            runPipeline();
        });

        clearPipelineBtn.addEventListener('click', () => {
            pipeline = [];
            refreshPipelineUI();
            runPipeline();
        });

        intensitySlider.addEventListener('input', () => {
            intensityValue.textContent = `${intensitySlider.value}%`;
            renderWithBlend();
        });

        paramSlider.addEventListener('input', () => {
            paramValue.textContent = paramSlider.value;
        });

        compareSlider.addEventListener('input', () => {
            compareValue.textContent = `${compareSlider.value}%`;
            drawComparison();
        });

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (!ev.target?.result) return;
                loadImage(ev.target.result.toString());
            };
            reader.readAsDataURL(file);
        });

        downloadBtn.addEventListener('click', () => {
            if (!blendedImageData) return;
            const link = document.createElement('a');
            link.download = 'processed.png';
            link.href = targetCanvas.toDataURL('image/png');
            link.click();
        });
    }

    function initKernelGrid() {
        const defaults = kernels.edge.flat();
        for (let i = 0; i < 9; i++) {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '0.001';
            input.value = defaults[i];
            input.className = 'kernel-input';
            kernelGrid.appendChild(input);
        }
    }

    function loadDefaultImage() {
        loadImage('assets/download.png');
    }

    function loadImage(src) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            resizeCanvases(img.width, img.height);
            originalContext.drawImage(img, 0, 0);
            originalImageData = originalContext.getImageData(0, 0, img.width, img.height);
            processedImageData = originalImageData;
            blendedImageData = originalImageData;
            applySelectedFilter();
        };
        img.src = src;
    }

    function resizeCanvases(w, h) {
        [originalCanvas, targetCanvas, compareCanvas].forEach((c) => {
            c.width = w;
            c.height = h;
        });
    }

    function applySelectedFilter() {
        if (!originalImageData) return;
        const step = buildStepFromUI();
        if (!step) return;
        processedImageData = runFilter(originalImageData, step);
        renderWithBlend();
    }

    function runPipeline() {
        if (!originalImageData) return;
        if (pipeline.length === 0) {
            applySelectedFilter();
            return;
        }
        let data = cloneImageData(originalImageData);
        pipeline.forEach((step) => {
            data = runFilter(data, step);
        });
        processedImageData = data;
        renderWithBlend();
    }

    function renderWithBlend() {
        if (!processedImageData || !originalImageData) return;
        const alpha = Number(intensitySlider.value) / 100;
        blendedImageData = blendWithOriginal(originalImageData, processedImageData, alpha);
        targetContext.putImageData(blendedImageData, 0, 0);
        drawComparison();
        drawHistograms();
    }

    function drawComparison() {
        if (!blendedImageData || !originalImageData) return;
        compareContext.putImageData(blendedImageData, 0, 0);
        const split = (Number(compareSlider.value) / 100) * blendedImageData.width;
        compareContext.save();
        compareContext.beginPath();
        compareContext.rect(split, 0, blendedImageData.width - split, blendedImageData.height);
        compareContext.clip();
        compareContext.putImageData(originalImageData, 0, 0);
        compareContext.restore();
    }

    function drawHistograms() {
        if (!originalImageData || !blendedImageData) return;
        const originalHist = computeHistogram(originalImageData);
        const processedHist = computeHistogram(blendedImageData);
        drawHistogram(histOriginal, originalHist);
        drawHistogram(histProcessed, processedHist);
    }

    function drawHistogram(canvas, histogram) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const max = Math.max(...histogram.r, ...histogram.g, ...histogram.b, 1);
        const colors = [
            { data: histogram.r, color: 'red' },
            { data: histogram.g, color: 'green' },
            { data: histogram.b, color: 'blue' }
        ];
        colors.forEach(({ data, color }) => {
            ctx.fillStyle = color;
            data.forEach((value, i) => {
                const barHeight = (value / max) * canvas.height;
                ctx.fillRect(i, canvas.height - barHeight, 1, barHeight);
            });
        });
    }

    function computeHistogram(imageData) {
        const r = new Array(256).fill(0);
        const g = new Array(256).fill(0);
        const b = new Array(256).fill(0);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            r[data[i]]++;
            g[data[i + 1]]++;
            b[data[i + 2]]++;
        }
        return { r, g, b };
    }

    function buildStepFromUI() {
        const type = filterSelect.value;
        const param = Number(paramSlider.value);
        let kernel = null;
        if (type === 'custom') {
            kernel = readCustomKernel();
        } else if (kernels[type]) {
            kernel = kernels[type];
        }
        return {
            type,
            options: { kernel, param },
            label: buildLabel(type, param)
        };
    }

    function buildLabel(type, param) {
        switch (type) {
            case 'threshold': return `Threshold (${param})`;
            case 'posterize': return `Posterize (${Math.max(2, Math.round(param / 16))} levels)`;
            case 'custom': return 'Custom kernel';
            default: return type;
        }
    }

    function refreshPipelineUI() {
        pipelineList.innerHTML = '';
        pipeline.forEach((step, idx) => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            const label = document.createElement('span');
            label.textContent = `${idx + 1}. ${step.label}`;
            label.title = 'Click to load settings';
            label.style.cursor = 'pointer';
            label.addEventListener('click', () => loadStepToUI(step));

            const actions = document.createElement('div');
            actions.className = 'chip-actions';
            actions.appendChild(createChipButton('↑', () => moveStep(idx, -1), idx === 0));
            actions.appendChild(createChipButton('↓', () => moveStep(idx, 1), idx === pipeline.length - 1));
            actions.appendChild(createChipButton('✕', () => removeStep(idx)));

            chip.appendChild(label);
            chip.appendChild(actions);
            pipelineList.appendChild(chip);
        });
    }

    function readCustomKernel() {
        const values = [...kernelGrid.querySelectorAll('input')].map((i) => Number(i.value || 0));
        const matrix = [];
        for (let i = 0; i < 3; i++) {
            matrix.push(values.slice(i * 3, i * 3 + 3));
        }
        return matrix;
    }

    function setKernelGrid(matrix) {
        const flat = matrix.flat();
        const inputs = [...kernelGrid.querySelectorAll('input')];
        inputs.forEach((input, idx) => {
            input.value = flat[idx] ?? 0;
        });
    }

    function loadStepToUI(step) {
        if (!step) return;
        filterSelect.value = step.type;
        if (typeof step.options?.param === 'number') {
            paramSlider.value = step.options.param;
            paramValue.textContent = step.options.param.toString();
        }
        if (step.options?.kernel) {
            setKernelGrid(step.options.kernel);
        } else if (kernels[step.type]) {
            setKernelGrid(kernels[step.type]);
        }
    }

    function moveStep(index, delta) {
        const target = index + delta;
        if (target < 0 || target >= pipeline.length) return;
        [pipeline[index], pipeline[target]] = [pipeline[target], pipeline[index]];
        refreshPipelineUI();
        runPipeline();
    }

    function removeStep(index) {
        pipeline.splice(index, 1);
        refreshPipelineUI();
        runPipeline();
    }

    function createChipButton(label, handler, disabled = false) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.className = 'chip-btn';
        btn.disabled = disabled;
        btn.addEventListener('click', handler);
        return btn;
    }

    function runFilter(imageData, step) {
        const { type, options } = step;
        switch (type) {
            case 'threshold':
                return applyThreshold(imageData, options.param);
            case 'invert':
                return applyInvert(imageData);
            case 'sepia':
                return applySepia(imageData);
            case 'posterize':
                return applyPosterize(imageData, options.param);
            case 'custom':
                return applyConvolution(imageData, options.kernel);
            default:
                if (options.kernel) {
                    return applyConvolution(imageData, options.kernel);
                }
                return imageData;
        }
    }

    function applyConvolution(imageData, kernel) {
        const { width, height, data } = imageData;
        const output = new Uint8ClampedArray(data);
        const size = kernel.length;
        const half = Math.floor(size / 2);

        for (let y = half; y < height - half; y++) {
            for (let x = half; x < width - half; x++) {
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    for (let ky = 0; ky < size; ky++) {
                        for (let kx = 0; kx < size; kx++) {
                            const srcX = x + kx - half;
                            const srcY = y + ky - half;
                            const idx = (srcY * width + srcX) * 4 + c;
                            sum += data[idx] * kernel[ky][kx];
                        }
                    }
                    const outIdx = (y * width + x) * 4 + c;
                    output[outIdx] = clamp(sum);
                }
                const alphaIdx = (y * width + x) * 4 + 3;
                output[alphaIdx] = 255;
            }
        }
        return new ImageData(output, width, height);
    }

    function applyThreshold(imageData, level = 128) {
        const { width, height, data } = imageData;
        const output = new Uint8ClampedArray(data.length);
        for (let i = 0; i < data.length; i += 4) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const v = lum >= level ? 255 : 0;
            output[i] = v;
            output[i + 1] = v;
            output[i + 2] = v;
            output[i + 3] = 255;
        }
        return new ImageData(output, width, height);
    }

    function applyInvert(imageData) {
        const { width, height, data } = imageData;
        const output = new Uint8ClampedArray(data.length);
        for (let i = 0; i < data.length; i += 4) {
            output[i] = 255 - data[i];
            output[i + 1] = 255 - data[i + 1];
            output[i + 2] = 255 - data[i + 2];
            output[i + 3] = 255;
        }
        return new ImageData(output, width, height);
    }

    function applySepia(imageData) {
        const { width, height, data } = imageData;
        const output = new Uint8ClampedArray(data.length);
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            output[i] = clamp(0.393 * r + 0.769 * g + 0.189 * b);
            output[i + 1] = clamp(0.349 * r + 0.686 * g + 0.168 * b);
            output[i + 2] = clamp(0.272 * r + 0.534 * g + 0.131 * b);
            output[i + 3] = 255;
        }
        return new ImageData(output, width, height);
    }

    function applyPosterize(imageData, param = 128) {
        const { width, height, data } = imageData;
        const output = new Uint8ClampedArray(data.length);
        const levels = Math.max(2, Math.min(32, Math.round(param / 8)));
        const step = 255 / (levels - 1);
        for (let i = 0; i < data.length; i += 4) {
            output[i] = quantize(data[i]);
            output[i + 1] = quantize(data[i + 1]);
            output[i + 2] = quantize(data[i + 2]);
            output[i + 3] = 255;
        }
        return new ImageData(output, width, height);

        function quantize(v) {
            return clamp(Math.round(v / step) * step);
        }
    }

    function blendWithOriginal(original, processed, alpha) {
        const { width, height, data: a } = original;
        const b = processed.data;
        const output = new Uint8ClampedArray(a.length);
        for (let i = 0; i < a.length; i += 4) {
            output[i] = clamp(a[i] * (1 - alpha) + b[i] * alpha);
            output[i + 1] = clamp(a[i + 1] * (1 - alpha) + b[i + 1] * alpha);
            output[i + 2] = clamp(a[i + 2] * (1 - alpha) + b[i + 2] * alpha);
            output[i + 3] = 255;
        }
        return new ImageData(output, width, height);
    }

    function cloneImageData(imageData) {
        return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
    }

    function clamp(value) {
        return Math.max(0, Math.min(255, value));
    }
});