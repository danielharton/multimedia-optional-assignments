window.onload = function () {
    const keyboard = document.querySelector('.keyboard');
    const keys = Array.from(document.querySelectorAll('.key'));
    const noteDisplay = document.getElementById('noteDisplay');
    const waveformSelect = document.getElementById('waveformSelect');
    const volumeControl = document.getElementById('volumeControl');
    const attackCtrl = document.getElementById('attack');
    const decayCtrl = document.getElementById('decay');
    const sustainCtrl = document.getElementById('sustain');
    const releaseCtrl = document.getElementById('release');
    const octaveDown = document.getElementById('octaveDown');
    const octaveUp = document.getElementById('octaveUp');
    const octaveValue = document.getElementById('octaveValue');
    const recordBtn = document.getElementById('recordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const playRecordBtn = document.getElementById('playRecordBtn');
    const reverbToggle = document.getElementById('reverbToggle');
    const delayToggle = document.getElementById('delayToggle');
    const distortionToggle = document.getElementById('distortionToggle');
    const delayTime = document.getElementById('delayTime');
    const delayFeedback = document.getElementById('delayFeedback');
    const reverbLevel = document.getElementById('reverbLevel');
    const distortionAmount = document.getElementById('distortionAmount');
    const toggleLabelsBtn = document.getElementById('toggleLabels');
    const metronomeToggle = document.getElementById('metronomeToggle');
    const metronomeBpm = document.getElementById('metronomeBpm');
    const chordButtons = document.querySelectorAll('[data-chord]');
    const presetButtons = document.querySelectorAll('[data-preset]');
    const spectrumCanvas = document.getElementById('spectrum');
    const pianoRollCanvas = document.getElementById('pianoRoll');
    const seqGrid = document.getElementById('sequencerGrid');
    const seqToggle = document.getElementById('seqToggle');
    const seqBpm = document.getElementById('seqBpm');
    const audioRecordBtn = document.getElementById('audioRecordBtn');
    const audioStopBtn = document.getElementById('audioStopBtn');
    const downloadLink = document.getElementById('downloadLink');

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const inputGain = ctx.createGain();
    const masterGain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    const mediaDest = ctx.createMediaStreamDestination();

    // Delay chain
    const delayNode = ctx.createDelay(1.5);
    const delayGain = ctx.createGain();
    const delayWet = ctx.createGain();
    delayGain.gain.value = parseFloat(delayFeedback.value);
    delayWet.gain.value = 0;
    delayNode.connect(delayGain);
    delayGain.connect(delayNode);
    delayNode.connect(delayWet);
    delayNode.delayTime.value = parseFloat(delayTime.value);

    // Reverb chain
    const reverbNode = ctx.createConvolver();
    const reverbWet = ctx.createGain();
    reverbWet.gain.value = 0;
    reverbNode.buffer = buildImpulseResponse(ctx, 2.5, 2);

    // Distortion
    const distortionNode = ctx.createWaveShaper();
    setDistortionCurve(0);

    // Connections
    inputGain.connect(distortionNode);
    distortionNode.connect(masterGain);
    distortionNode.connect(delayNode);
    distortionNode.connect(reverbNode);
    delayWet.connect(masterGain);
    reverbWet.connect(masterGain);
    masterGain.connect(analyser);
    masterGain.connect(ctx.destination);
    masterGain.connect(mediaDest);
    reverbNode.connect(reverbWet);

    analyser.fftSize = 2048;

    let waveform = 'sawtooth';
    let octaveOffset = 0;
    let recording = false;
    let recordStart = 0;
    let recordedNotes = [];
    let recordedActive = new Map();
    let metronomeInterval = null;
    let activeVoices = new Map();
    let sustainOn = false;
    let sustainedNotes = new Set();
    let pitchBendSemitones = 0;
    let mediaRecorder = null;
    let audioChunks = [];

    const midiToNoteName = new Map();
    keys.forEach(k => midiToNoteName.set(parseInt(k.dataset.midiCode, 10), k.dataset.note));

    // Sequencer setup
    const seqNotes = [72, 71, 69, 67, 65, 64, 62, 60];
    const steps = 16;
    const seqState = Array(seqNotes.length).fill(0).map(() => Array(steps).fill(false));
    let seqPosition = 0;
    let seqInterval = null;
    buildSequencerGrid();

    // Keyboard mapping for three rows (two octaves) with shift capability
    const emulatedKeys = {
        z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54, b: 55, h: 56, n: 57, j: 58, m: 59, ',': 60,
        q: 60, 2: 61, w: 62, 3: 63, e: 64, r: 65, 5: 66, t: 67, 6: 68, y: 69, 7: 70, u: 71, i: 72,
        9: 73, o: 74, 0: 75, p: 76, '[': 77, '=': 78, ']': 79, '\\': 80
    };

    function midiToFreq(midi) {
        return Math.pow(2, (midi - 69) / 12) * 440;
    }

    function buildImpulseResponse(context, duration, decay) {
        const sampleRate = context.sampleRate;
        const length = sampleRate * duration;
        const impulse = context.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const impulseChannel = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                impulseChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            }
        }
        return impulse;
    }

    function setDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 0;
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < samples; ++i) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
    }

    function currentAdsr() {
        return {
            attack: parseFloat(attackCtrl.value),
            decay: parseFloat(decayCtrl.value),
            sustain: parseFloat(sustainCtrl.value),
            release: parseFloat(releaseCtrl.value)
        };
    }

    function startVoice(midi, velocity = 1) {
        if (ctx.state === 'suspended') ctx.resume();
        const now = ctx.currentTime;
        const freq = midiToFreq(midi);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const { attack, decay, sustain } = currentAdsr();
        osc.type = waveform;
        osc.frequency.setValueAtTime(freq * Math.pow(2, pitchBendSemitones / 12), now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(velocity, now + attack);
        gain.gain.linearRampToValueAtTime(velocity * sustain, now + attack + decay);
        osc.connect(gain);
        gain.connect(inputGain);
        osc.start(now);
        activeVoices.set(midi, { osc, gain, baseFreq: freq, velocity });
        highlightKey(midi, true);
        updateNoteDisplay();
    }

    function stopVoice(midi) {
        const voice = activeVoices.get(midi);
        if (!voice) return;
        const now = ctx.currentTime;
        const { release } = currentAdsr();
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + release);
        voice.osc.stop(now + release + 0.05);
        activeVoices.delete(midi);
        highlightKey(midi, false);
        updateNoteDisplay();
    }

    function highlightKey(midi, on) {
        const key = document.querySelector(`[data-midi-code="${midi}"]`);
        if (!key) return;
        if (on) key.classList.add('activeKey');
        else key.classList.remove('activeKey');
    }

    function updateNoteDisplay() {
        if (activeVoices.size === 0) {
            noteDisplay.textContent = 'Ready';
            return;
        }
        const notes = Array.from(activeVoices.keys()).map(midi => `${midiToNoteName.get(midi) || midi} (${midi})`);
        noteDisplay.textContent = notes.join(', ');
    }

    function withOffset(midi) {
        const shifted = midi + octaveOffset * 12;
        return Math.min(96, Math.max(36, shifted));
    }

    function handleKeyDown(e) {
        const key = e.key.toLowerCase();
        if (e.shiftKey && key === 'r') {
            toggleRecording();
            return;
        }
        if (e.shiftKey && key === 'p') {
            playRecording();
            return;
        }
        if (key === 'arrowup') {
            changeOctave(1);
            return;
        }
        if (key === 'arrowdown') {
            changeOctave(-1);
            return;
        }
        if (['1', '2', '3', '4'].includes(key)) {
            const types = ['sine', 'square', 'sawtooth', 'triangle'];
            waveformSelect.value = types[parseInt(key, 10) - 1];
            waveform = waveformSelect.value;
        }
        if (!emulatedKeys.hasOwnProperty(key)) return;
        const midi = withOffset(emulatedKeys[key]);
        if (activeVoices.has(midi)) return;
        startVoice(midi);
        if (recording) beginRecordNote(midi);
    }

    function handleKeyUp(e) {
        const key = e.key.toLowerCase();
        if (!emulatedKeys.hasOwnProperty(key)) return;
        const midi = withOffset(emulatedKeys[key]);
        if (sustainOn) {
            sustainedNotes.add(midi);
            return;
        }
        endNote(midi);
    }

    function endNote(midi) {
        stopVoice(midi);
        if (recording) endRecordNote(midi);
    }

    function changeOctave(delta) {
        octaveOffset = Math.max(-2, Math.min(2, octaveOffset + delta));
        octaveValue.textContent = octaveOffset;
    }

    function attachMouseListeners() {
        keys.forEach(key => {
            const midi = parseInt(key.dataset.midiCode, 10);
            key.addEventListener('mousedown', () => {
                startVoice(midi);
                if (recording) beginRecordNote(midi);
            });
            key.addEventListener('mouseup', () => {
                if (sustainOn) {
                    sustainedNotes.add(midi);
                    return;
                }
                endNote(midi);
            });
            key.addEventListener('mouseleave', () => {
                if (activeVoices.has(midi) && !sustainOn) endNote(midi);
            });
            key.addEventListener('touchstart', (e) => {
                e.preventDefault();
                startVoice(midi);
                if (recording) beginRecordNote(midi);
            }, { passive: false });
            key.addEventListener('touchend', (e) => {
                e.preventDefault();
                if (sustainOn) {
                    sustainedNotes.add(midi);
                    return;
                }
                endNote(midi);
            });
        });
    }

    function toggleRecording() {
        if (!recording) {
            recordedNotes = [];
            recordedActive.clear();
            recordStart = ctx.currentTime;
            recording = true;
            noteDisplay.textContent = 'Recording...';
        } else {
            recording = false;
            noteDisplay.textContent = `Recorded ${recordedNotes.length} notes`;
        }
    }

    function beginRecordNote(midi) {
        recordedActive.set(midi, ctx.currentTime - recordStart);
    }

    function endRecordNote(midi) {
        const start = recordedActive.get(midi);
        if (start === undefined) return;
        const duration = ctx.currentTime - recordStart - start;
        recordedNotes.push({ midi, start, duration });
        recordedActive.delete(midi);
    }

    function playRecording() {
        if (!recordedNotes.length) return;
        recordedNotes.forEach(ev => {
            setTimeout(() => startVoice(ev.midi), ev.start * 1000);
            setTimeout(() => endNote(ev.midi), (ev.start + ev.duration) * 1000);
        });
    }

    function playChord(name) {
        const chords = {
            C: [60, 64, 67],
            G: [67, 71, 74],
            Am: [69, 72, 76],
            F: [65, 69, 72]
        };
        const notes = chords[name];
        if (!notes) return;
        notes.forEach(n => startVoice(n));
        setTimeout(() => notes.forEach(n => endNote(n)), 1000);
    }

    function toggleLabels() {
        keyboard.classList.toggle('hide-labels');
    }

    function startMetronome() {
        const bpm = parseInt(metronomeBpm.value, 10);
        const interval = 60000 / bpm;
        if (metronomeInterval) clearInterval(metronomeInterval);
        metronomeInterval = setInterval(() => tickMetronome(), interval);
        metronomeToggle.textContent = 'Stop';
    }

    function stopMetronome() {
        clearInterval(metronomeInterval);
        metronomeInterval = null;
        metronomeToggle.textContent = 'Start';
    }

    function tickMetronome() {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(1000, now);
        osc.type = 'square';
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.06);
    }

    function buildSequencerGrid() {
        seqGrid.innerHTML = '';
        seqNotes.forEach((note, rowIdx) => {
            for (let step = 0; step < steps; step++) {
                const cell = document.createElement('div');
                cell.classList.add('seq-cell');
                cell.dataset.row = rowIdx;
                cell.dataset.step = step;
                cell.title = `${midiToNoteName.get(note)} step ${step + 1}`;
                cell.addEventListener('click', () => {
                    seqState[rowIdx][step] = !seqState[rowIdx][step];
                    cell.classList.toggle('active', seqState[rowIdx][step]);
                });
                seqGrid.appendChild(cell);
            }
        });
    }

    function startSequencer() {
        const bpm = parseInt(seqBpm.value, 10);
        const interval = (60000 / bpm) / 4; // 16th notes
        stopSequencer();
        seqInterval = setInterval(() => advanceSequencer(), interval);
        seqToggle.textContent = 'Stop Sequencer';
    }

    function stopSequencer() {
        if (seqInterval) clearInterval(seqInterval);
        seqInterval = null;
        seqToggle.textContent = 'Start Sequencer';
        clearSeqPlayingState();
    }

    function clearSeqPlayingState() {
        document.querySelectorAll('.seq-cell.playing').forEach(c => c.classList.remove('playing'));
    }

    function advanceSequencer() {
        const cells = Array.from(seqGrid.children);
        clearSeqPlayingState();
        seqNotes.forEach((note, rowIdx) => {
            const active = seqState[rowIdx][seqPosition];
            const idx = rowIdx * steps + seqPosition;
            if (cells[idx]) cells[idx].classList.add('playing');
            if (active) {
                startVoice(note, 0.8);
                setTimeout(() => endNote(note), 200);
            }
        });
        seqPosition = (seqPosition + 1) % steps;
    }

    function handleMidi(access) {
        access.inputs.forEach(input => {
            input.onmidimessage = (m) => {
                const [status, data1, data2] = m.data;
                const command = status & 0xf0;
                if (command === 144 && data2 > 0) {
                    const velocity = data2 / 127;
                    startVoice(data1, velocity);
                    if (recording) beginRecordNote(data1);
                } else if (command === 128 || (command === 144 && data2 === 0)) {
                    if (sustainOn) {
                        sustainedNotes.add(data1);
                        return;
                    }
                    endNote(data1);
                } else if (command === 176 && data1 === 64) {
                    sustainOn = data2 >= 64;
                    if (!sustainOn) {
                        sustainedNotes.forEach(n => endNote(n));
                        sustainedNotes.clear();
                    }
                } else if (command === 224) {
                    const bend = ((data2 << 7) + data1) - 8192;
                    pitchBendSemitones = (bend / 8192) * 2; // +/-2 semitones
                    activeVoices.forEach((voice, midi) => {
                        const freq = voice.baseFreq * Math.pow(2, pitchBendSemitones / 12);
                        voice.osc.frequency.setValueAtTime(freq, ctx.currentTime);
                    });
                }
            };
        });
    }

    function setupAnalyser() {
        const spectrumCtx = spectrumCanvas.getContext('2d');
        const rollCtx = pianoRollCanvas.getContext('2d');
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const playedHistory = [];

        function draw() {
            requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            spectrumCtx.fillStyle = '#0b1220';
            spectrumCtx.fillRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
            const barWidth = (spectrumCanvas.width / bufferLength) * 2.5;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i];
                const y = (v / 255) * spectrumCanvas.height;
                spectrumCtx.fillStyle = '#38bdf8';
                spectrumCtx.fillRect(x, spectrumCanvas.height - y, barWidth, y);
                x += barWidth + 1;
            }

            // Piano roll
            const now = ctx.currentTime;
            rollCtx.fillStyle = '#0b1220';
            rollCtx.fillRect(0, 0, pianoRollCanvas.width, pianoRollCanvas.height);
            const toRemove = [];
            playedHistory.forEach((item, idx) => {
                const elapsed = now - item.start;
                if (elapsed > 6) toRemove.push(idx);
                const xPos = pianoRollCanvas.width - (elapsed / 6) * pianoRollCanvas.width;
                const height = 10;
                const yPos = pianoRollCanvas.height - ((item.midi - 36) / (96 - 36)) * pianoRollCanvas.height - height;
                const width = (item.duration || 0.5) * 80;
                rollCtx.fillStyle = '#a78bfa';
                rollCtx.fillRect(xPos, yPos, width, height);
            });
            toRemove.reverse().forEach(i => playedHistory.splice(i, 1));
        }

        function trackNote(midi, duration = 0.5) {
            playedHistory.push({ midi, start: ctx.currentTime, duration });
        }

        analyser.trackNote = trackNote;
        draw();
    }

    function connectNoteTracking() {
        const originalStart = startVoice;
        startVoice = function (midi, velocity = 1) {
            originalStart(midi, velocity);
            if (analyser.trackNote) analyser.trackNote(midi);
        };
    }

    function applyPreset(name) {
        const presets = {
            piano: { waveform: 'sine', attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.4 },
            organ: { waveform: 'square', attack: 0.02, decay: 0.05, sustain: 0.9, release: 0.2 },
            strings: { waveform: 'triangle', attack: 0.2, decay: 0.3, sustain: 0.8, release: 0.8 },
            lead: { waveform: 'sawtooth', attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.25 }
        };
        const preset = presets[name];
        if (!preset) return;
        waveform = preset.waveform;
        waveformSelect.value = preset.waveform;
        attackCtrl.value = preset.attack;
        decayCtrl.value = preset.decay;
        sustainCtrl.value = preset.sustain;
        releaseCtrl.value = preset.release;
    }

    function setupRecordingControls() {
        recordBtn.addEventListener('click', toggleRecording);
        stopRecordBtn.addEventListener('click', () => {
            if (recording) toggleRecording();
        });
        playRecordBtn.addEventListener('click', playRecording);

        audioRecordBtn.addEventListener('click', () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') return;
            audioChunks = [];
            mediaRecorder = new MediaRecorder(mediaDest.stream);
            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(audioChunks, { type: 'audio/wav' });
                const url = URL.createObjectURL(blob);
                downloadLink.href = url;
            };
            mediaRecorder.start();
            audioRecordBtn.textContent = 'Recording...';
        });

        audioStopBtn.addEventListener('click', () => {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                audioRecordBtn.textContent = 'Start Audio Capture';
            }
        });
    }

    function setupEffects() {
        masterGain.gain.value = parseFloat(volumeControl.value);
        volumeControl.addEventListener('input', () => {
            masterGain.gain.setValueAtTime(parseFloat(volumeControl.value), ctx.currentTime);
        });
        waveformSelect.addEventListener('change', () => {
            waveform = waveformSelect.value;
        });
        delayToggle.addEventListener('change', () => {
            delayWet.gain.value = delayToggle.checked ? 0.35 : 0;
        });
        reverbToggle.addEventListener('change', () => {
            reverbWet.gain.value = reverbToggle.checked ? parseFloat(reverbLevel.value) : 0;
        });
        distortionToggle.addEventListener('change', () => {
            setDistortionCurve(distortionToggle.checked ? parseFloat(distortionAmount.value) : 0);
        });
        delayTime.addEventListener('input', () => {
            delayNode.delayTime.value = parseFloat(delayTime.value);
        });
        delayFeedback.addEventListener('input', () => {
            delayGain.gain.value = parseFloat(delayFeedback.value);
        });
        reverbLevel.addEventListener('input', () => {
            if (reverbToggle.checked) reverbWet.gain.value = parseFloat(reverbLevel.value);
        });
        distortionAmount.addEventListener('input', () => {
            if (distortionToggle.checked) setDistortionCurve(parseFloat(distortionAmount.value));
        });
    }

    // Event wiring
    attachMouseListeners();
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    toggleLabelsBtn.addEventListener('click', toggleLabels);
    metronomeToggle.addEventListener('click', () => {
        if (metronomeInterval) stopMetronome();
        else startMetronome();
    });
    chordButtons.forEach(btn => btn.addEventListener('click', () => playChord(btn.dataset.chord)));
    presetButtons.forEach(btn => btn.addEventListener('click', () => applyPreset(btn.dataset.preset)));
    octaveDown.addEventListener('click', () => changeOctave(-1));
    octaveUp.addEventListener('click', () => changeOctave(1));
    seqToggle.addEventListener('click', () => {
        if (seqInterval) stopSequencer();
        else startSequencer();
    });
    setupRecordingControls();
    setupEffects();
    setupAnalyser();
    connectNoteTracking();

    navigator.requestMIDIAccess({ sysex: false }).then(handleMidi);
};