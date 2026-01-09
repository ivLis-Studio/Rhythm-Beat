var visualizer = (() => {
    const React = Spicetify.React;
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    // ====== GAME CONFIGURATION ======
    // Key Configurations for different modes
    const KEY_CONFIGS = {
        4: { keys: ['D', 'F', 'J', 'K'], colors: ['#FF3366', '#00D4AA', '#00B4FF', '#FF3366'] },
        6: { keys: ['S', 'D', 'F', 'J', 'K', 'L'], colors: ['#FF3366', '#FF6B35', '#00D4AA', '#00B4FF', '#00D4AA', '#FF3366'] },
        8: { keys: ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'], colors: ['#FF3366', '#FF6B35', '#FFB800', '#00D4AA', '#00B4FF', '#00D4AA', '#FF6B35', '#FF3366'] }
    };

    const GAME_WIDTH = 500; // Slightly wider
    const GAME_HEIGHT = 800;
    const JUDGE_LINE_Y = 700;
    const NOTE_HEIGHT = 28;

    // Timing windows (in ms)
    const TIMING = {
        PERFECT: 50,
        GREAT: 100,
        GOOD: 150,
        MISS: 250
    };

    // Note synchronization threshold (ms) - notes within this window will be synchronized
    const NOTE_SYNC_THRESHOLD = 80;
    // Minimum time before notes can appear (ms)
    const MIN_NOTE_TIME = 1000;

    const SCORE_VALUES = {
        PERFECT: 1000,
        GREAT: 700,
        GOOD: 400,
        MISS: 0
    };

    // Difficulty settings
    const DIFFICULTIES = [
        { stars: 1, name: 'EASY', noteMultiplier: 0.15, segmentThreshold: 0.95, color: '#00D4AA' },
        { stars: 2, name: 'NORMAL', noteMultiplier: 0.25, segmentThreshold: 0.85, color: '#00B4FF' },
        { stars: 3, name: 'HARD', noteMultiplier: 0.4, segmentThreshold: 0.7, color: '#FFB800' },
        { stars: 4, name: 'EXPERT', noteMultiplier: 0.6, segmentThreshold: 0.5, color: '#FF6B35' },
        { stars: 5, name: 'MASTER', noteMultiplier: 0.85, segmentThreshold: 0.3, color: '#FF3366' }
    ];

    // ====== HIGH SCORE STORAGE ======
    const STORAGE_KEY = 'rhythm_game_high_scores';

    function getHighScores() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('[RhythmGame] Failed to load high scores:', e);
            return {};
        }
    }

    function saveHighScore(trackId, difficultyName, result) {
        try {
            const scores = getHighScores();
            const key = `${trackId}_${difficultyName}`;
            const existing = scores[key];

            // Only save if it's a new high score
            if (!existing || result.score > existing.score) {
                scores[key] = {
                    score: result.score,
                    accuracy: result.accuracy,
                    rank: result.rank,
                    maxCombo: result.maxCombo,
                    isFullCombo: result.isFullCombo,
                    date: new Date().toISOString()
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
                return true; // New high score!
            }
            return false;
        } catch (e) {
            console.error('[RhythmGame] Failed to save high score:', e);
            return false;
        }
    }

    function getHighScore(trackId, difficultyName) {
        const scores = getHighScores();
        const key = `${trackId}_${difficultyName}`;
        return scores[key] || null;
    }

    function getRankFromAccuracy(accuracy) {
        if (accuracy >= 98) return { rank: 'S+', color: '#00D4AA' };
        if (accuracy >= 95) return { rank: 'S', color: '#00D4AA' };
        if (accuracy >= 90) return { rank: 'A', color: '#00B4FF' };
        if (accuracy >= 80) return { rank: 'B', color: '#00B4FF' };
        if (accuracy >= 70) return { rank: 'C', color: '#FFB800' };
        return { rank: 'D', color: '#FF3366' };
    }

    // ====== NOTE SKINS ======
    const NOTE_SKINS = {
        default: {
            name: 'Default',
            drawNote: (ctx, x, y, width, height, color, isHit) => {
                // Gradient note
                const gradient = ctx.createLinearGradient(x, y, x + width, y);
                gradient.addColorStop(0, color);
                gradient.addColorStop(0.5, lightenColor(color, 35));
                gradient.addColorStop(1, color);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.roundRect(x + 5, y, width - 10, height, 6);
                ctx.fill();
                // Shine effect
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.beginPath();
                ctx.roundRect(x + 10, y + 3, width - 20, 6, 3);
                ctx.fill();
            }
        },
        neon: {
            name: 'Neon',
            drawNote: (ctx, x, y, width, height, color, isHit) => {
                ctx.shadowColor = color;
                ctx.shadowBlur = 25;
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.roundRect(x + 8, y + 2, width - 16, height - 4, 4);
                ctx.stroke();
                ctx.fillStyle = `${color}40`;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        },
        pixel: {
            name: 'Pixel',
            drawNote: (ctx, x, y, width, height, color, isHit) => {
                const pixelSize = 4;
                ctx.fillStyle = color;
                for (let px = x + 8; px < x + width - 8; px += pixelSize) {
                    for (let py = y + 2; py < y + height - 2; py += pixelSize) {
                        if ((Math.floor(px / pixelSize) + Math.floor(py / pixelSize)) % 2 === 0) {
                            ctx.fillRect(px, py, pixelSize - 1, pixelSize - 1);
                        }
                    }
                }
                ctx.fillStyle = lightenColor(color, 30);
                ctx.fillRect(x + 8, y + 2, width - 16, pixelSize);
            }
        },
        circle: {
            name: 'Circle',
            drawNote: (ctx, x, y, width, height, color, isHit) => {
                const centerX = x + width / 2;
                const centerY = y + height / 2;
                const radius = Math.min(width, height) / 2 - 4;
                const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
                gradient.addColorStop(0, lightenColor(color, 50));
                gradient.addColorStop(0.7, color);
                gradient.addColorStop(1, darkenColor(color, 20));
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        },
        arrow: {
            name: 'Arrow',
            drawNote: (ctx, x, y, width, height, color, isHit) => {
                const centerX = x + width / 2;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(centerX, y);
                ctx.lineTo(x + width - 10, y + height);
                ctx.lineTo(centerX, y + height - 8);
                ctx.lineTo(x + 10, y + height);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = lightenColor(color, 40);
                ctx.beginPath();
                ctx.moveTo(centerX, y + 4);
                ctx.lineTo(centerX + 10, y + height - 6);
                ctx.lineTo(centerX, y + height - 10);
                ctx.closePath();
                ctx.fill();
            }
        },
        diamond: {
            name: 'Diamond',
            drawNote: (ctx, x, y, width, height, color, isHit) => {
                const centerX = x + width / 2;
                const centerY = y + height / 2;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(centerX, y);
                ctx.lineTo(x + width - 8, centerY);
                ctx.lineTo(centerX, y + height);
                ctx.lineTo(x + 8, centerY);
                ctx.closePath();
                ctx.fill();
                // Inner shine
                ctx.fillStyle = lightenColor(color, 50);
                ctx.beginPath();
                ctx.moveTo(centerX, y + 6);
                ctx.lineTo(x + width - 16, centerY);
                ctx.lineTo(centerX, y + height - 6);
                ctx.lineTo(x + 16, centerY);
                ctx.closePath();
                ctx.fill();
            }
        },
        bar: {
            name: 'Bar',
            drawNote: (ctx, x, y, width, height, color, isHit) => {
                // Simple flat bar with gradient
                const gradient = ctx.createLinearGradient(x, y, x, y + height);
                gradient.addColorStop(0, lightenColor(color, 30));
                gradient.addColorStop(0.5, color);
                gradient.addColorStop(1, darkenColor(color, 30));
                ctx.fillStyle = gradient;
                ctx.fillRect(x + 6, y + 2, width - 12, height - 4);
                // Top highlight
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillRect(x + 6, y + 2, width - 12, 2);
            }
        },
        wave: {
            name: 'Wave',
            drawNote: (ctx, x, y, width, height, color, isHit) => {
                const centerY = y + height / 2;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(x + 8, centerY);
                // Upper wave
                ctx.quadraticCurveTo(x + width * 0.25, y, x + width / 2, centerY);
                ctx.quadraticCurveTo(x + width * 0.75, y + height, x + width - 8, centerY);
                // Lower curve back
                ctx.quadraticCurveTo(x + width * 0.75, y, x + width / 2, centerY);
                ctx.quadraticCurveTo(x + width * 0.25, y + height, x + 8, centerY);
                ctx.fill();
            }
        }
    };

    // Helper for adjusting color brightness (positive = lighten, negative = darken)
    function adjustColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * Math.abs(percent));
        const sign = percent >= 0 ? 1 : -1;
        const R = sign > 0 ? Math.min(255, (num >> 16) + amt) : Math.max(0, (num >> 16) - amt);
        const G = sign > 0 ? Math.min(255, ((num >> 8) & 0x00FF) + amt) : Math.max(0, ((num >> 8) & 0x00FF) - amt);
        const B = sign > 0 ? Math.min(255, (num & 0x0000FF) + amt) : Math.max(0, (num & 0x0000FF) - amt);
        return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
    }
    const lightenColor = (hex, percent) => adjustColor(hex, percent);
    const darkenColor = (hex, percent) => adjustColor(hex, -percent);

    // ====== SETTINGS STORAGE ======
    const SETTINGS_KEY = 'rhythm_game_settings';

    const DEFAULT_SETTINGS = {
        speed: 5,
        keyMode: 4,
        customKeys: {
            4: ['D', 'F', 'J', 'K'],
            6: ['S', 'D', 'F', 'J', 'K', 'L'],
            8: ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';']
        },
        effects: {
            particles: true,
            screenShake: true,
            laneFlash: true,
            hitEffects: true
        },
        noteSkin: 'default',
        backgroundVisualizer: true,
        // Game modifiers
        modifiers: {
            mirror: false,
            random: false,
            noFail: false,
            hidden: false,  // Notes fade out before judge line
            sudden: false   // Notes appear suddenly near judge line
        },
        offset: 0, // Audio sync offset in ms
        laneCover: 0 // Lane cover percentage from top (0-50)
    };

    function loadSettings() {
        try {
            const data = localStorage.getItem(SETTINGS_KEY);
            if (data) {
                const saved = JSON.parse(data);
                // Merge with defaults to ensure all keys exist
                return {
                    ...DEFAULT_SETTINGS,
                    ...saved,
                    customKeys: { ...DEFAULT_SETTINGS.customKeys, ...saved.customKeys },
                    effects: { ...DEFAULT_SETTINGS.effects, ...saved.effects },
                    modifiers: { ...DEFAULT_SETTINGS.modifiers, ...saved.modifiers }
                };
            }
            return DEFAULT_SETTINGS;
        } catch (e) {
            console.error('[RhythmGame] Failed to load settings:', e);
            return DEFAULT_SETTINGS;
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('[RhythmGame] Failed to save settings:', e);
        }
    }

    // ====== RHYTHM GAME COMPONENT ======
    function RhythmGame({ audioAnalysis, difficulty, onGameEnd, gameStateRef: externalRef, settings }) {
        const canvasRef = useRef(null);
        const analyserRef = useRef(null);
        const audioDataRef = useRef(new Uint8Array(64));

        // Derive config from settings
        const { speed, keyMode, customKeys, effects, noteSkin, backgroundVisualizer } = settings;
        const keyConfig = KEY_CONFIGS[keyMode] || KEY_CONFIGS[4];

        // Dynamic constants based on settings
        const LANES = keyMode;
        const LANE_KEYS = customKeys?.[keyMode] || keyConfig.keys;
        const LANE_COLORS = keyConfig.colors;
        const NOTE_SPEED = speed * 100;

        // Get note skin drawer
        const noteSkinDrawer = NOTE_SKINS[noteSkin] || NOTE_SKINS.default;

        // Layout calculations
        const calculatedLaneWidth = LANES === 8 ? 55 : (LANES === 6 ? 70 : 85);
        const LANE_WIDTH = calculatedLaneWidth;
        const TOTAL_LANES_WIDTH = LANES * LANE_WIDTH;
        const LANE_START_X = (GAME_WIDTH - TOTAL_LANES_WIDTH) / 2;

        const gameStateRef = useRef({
            notes: [],
            score: 0,
            combo: 0,
            maxCombo: 0,
            judgements: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
            lastJudgement: null,
            lastJudgementTime: 0,
            lastJudgementLane: -1,
            lastTiming: null, // 'EARLY', 'LATE', or null for PERFECT
            particles: [],
            hitEffects: [],
            laneFlashes: new Array(LANES).fill(0),
            holdingLanes: new Array(LANES).fill(false),
            shakeAmount: 0,
            isPlaying: false,
            isPaused: false,
            syncOffset: 0,
            gameStartTime: 0,
            totalNotes: 0,
            isFullCombo: true,
            gameEnded: false,
            songDuration: 0,
            hp: 100,
            // New features
            isFever: false, // Fever mode active
            feverMultiplier: 1, // Score multiplier
            perfectChain: 0, // Consecutive perfect count
            missFlash: 0, // Red flash on miss (0-1)
            currentAccuracy: 100 // Real-time accuracy
        });

        // Update arrays when lanes change
        useEffect(() => {
            if (gameStateRef.current.holdingLanes.length !== LANES) {
                gameStateRef.current.laneFlashes = new Array(LANES).fill(0);
                gameStateRef.current.holdingLanes = new Array(LANES).fill(false);
            }
        }, [LANES]);

        // Expose gameStateRef to parent - Fix: expose the ref object itself
        useEffect(() => {
            if (externalRef) externalRef.current = gameStateRef;
        }, [externalRef]);

        const keysPressed = useRef({});
        const keysHeld = useRef({});
        const animationRef = useRef(null);
        const startedRef = useRef(false);
        const dprRef = useRef(window.devicePixelRatio || 1);
        const cachedGradientsRef = useRef(null);
        const MAX_PARTICLES = 500;

        // Generate notes from audio analysis
        const generateNotes = useCallback((analysis, diff) => {
            if (!analysis) return [];

            const notes = [];
            const slideNotes = [];
            const beats = analysis.beats || [];
            const segments = analysis.segments || [];
            const bars = analysis.bars || [];

            // Get modifiers from settings
            const isMirror = settings.modifiers?.mirror;
            const isRandom = settings.modifiers?.random;

            // Helper function to check if a time overlaps with any slide note in the same lane
            const overlapsWithSlide = (time, lane) => {
                return slideNotes.some(slide =>
                    slide.lane === lane &&
                    time >= slide.time - 100 &&
                    time <= slide.time + slide.duration + 100
                );
            };

            // Apply lane modifier
            const applyLaneModifier = (lane) => {
                if (isMirror) {
                    return LANES - 1 - lane;
                }
                if (isRandom) {
                    return Math.floor(Math.random() * LANES);
                }
                return lane;
            };

            // FIRST: Generate slide notes for higher difficulties
            if (diff.stars >= 3) {
                bars.forEach((bar, index) => {
                    if (index % (6 - diff.stars) !== 0) return;

                    let lane = Math.floor(bar.start * 100) % LANES;
                    lane = applyLaneModifier(lane);
                    const time = bar.start * 1000;
                    const duration = Math.min(bar.duration * 1000, 2000);

                    const totalTicks = Math.max(10, Math.floor(duration / 100));
                    notes.push({
                        id: `slide-${index}`,
                        type: 'slide',
                        time: time,
                        lane: lane,
                        duration: duration,
                        hit: false,
                        processed: false,
                        holding: false,
                        ticksHit: 0,
                        totalTicks: totalTicks
                    });
                    slideNotes.push({ time, lane, duration });
                });
            }

            // SECOND: Generate tap notes from beats
            beats.forEach((beat, index) => {
                if (diff.noteMultiplier < 1.0 && index % Math.floor(1 / diff.noteMultiplier) !== 0) return;

                const time = beat.start * 1000;
                let lane = Math.floor(beat.start * 100) % LANES;
                lane = applyLaneModifier(lane);

                if (overlapsWithSlide(time, lane)) {
                    lane = (lane + 1) % LANES;
                    if (overlapsWithSlide(time, lane)) return;
                }

                notes.push({
                    id: `beat-${index}`,
                    type: 'tap',
                    time: time,
                    lane: lane,
                    hit: false,
                    passed: false,
                    confidence: beat.confidence || 0.5
                });
            });

            // Add extra notes from segments - AVOID slide overlaps
            segments.forEach((segment, index) => {
                if (segment.confidence > diff.segmentThreshold) {
                    let lane = (index + 2) % LANES;
                    lane = applyLaneModifier(lane);
                    const time = segment.start * 1000;

                    if (overlapsWithSlide(time, lane)) return;

                    const existingNote = notes.find(n =>
                        Math.abs(n.time - time) < 120 && n.lane === lane
                    );
                    if (!existingNote) {
                        notes.push({
                            id: `seg-${index}`,
                            type: 'tap',
                            time: time,
                            lane: lane,
                            hit: false,
                            passed: false,
                            confidence: segment.confidence
                        });
                    }
                }
            });

            // Sort notes by time first
            notes.sort((a, b) => a.time - b.time);

            // Filter out notes in the first second (0~1000ms)
            const filteredNotes = notes.filter(note => note.time >= MIN_NOTE_TIME);

            // Synchronize near-simultaneous notes (within NOTE_SYNC_THRESHOLD)
            // Group notes that are close in time and align them to the earliest time in the group
            for (let i = 0; i < filteredNotes.length; i++) {
                const baseNote = filteredNotes[i];
                if (baseNote.type === 'slide') continue; // Skip slide notes for sync

                // Find all notes within the threshold that are in different lanes
                for (let j = i + 1; j < filteredNotes.length; j++) {
                    const compareNote = filteredNotes[j];
                    if (compareNote.type === 'slide') continue;

                    const timeDiff = Math.abs(compareNote.time - baseNote.time);
                    if (timeDiff <= NOTE_SYNC_THRESHOLD && compareNote.lane !== baseNote.lane) {
                        // Snap the later note to the earlier note's time
                        compareNote.time = baseNote.time;
                    } else if (timeDiff > NOTE_SYNC_THRESHOLD) {
                        // Notes are sorted, so no need to check further
                        break;
                    }
                }
            }

            // Snap notes to BPM grid if tempo info is available
            const tempo = analysis?.track?.tempo;
            if (tempo && tempo > 0) {
                const beatInterval = 60000 / tempo; // ms per beat
                const quarterBeat = beatInterval / 4;

                filteredNotes.forEach(note => {
                    if (note.type === 'slide') return;

                    // Find the nearest beat subdivision (quarter beat)
                    const beatPosition = note.time / quarterBeat;
                    const snappedBeatPosition = Math.round(beatPosition);
                    const snappedTime = snappedBeatPosition * quarterBeat;

                    // Only snap if within reasonable distance (half of quarter beat)
                    if (Math.abs(note.time - snappedTime) < quarterBeat / 2) {
                        note.time = snappedTime;
                    }
                });
            }

            return filteredNotes;
        }, [LANES, settings.modifiers]);

        // Initialize game
        useEffect(() => {
            if (audioAnalysis && difficulty && !startedRef.current) {
                startedRef.current = true;
                const notes = generateNotes(audioAnalysis, difficulty);

                gameStateRef.current = {
                    ...gameStateRef.current,
                    notes: notes,
                    totalNotes: notes.length,
                    score: 0,
                    combo: 0,
                    maxCombo: 0,
                    judgements: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
                    particles: [],
                    hitEffects: [],
                    laneFlashes: new Array(LANES).fill(0),
                    holdingLanes: new Array(LANES).fill(false),
                    gameStartTime: performance.now(),
                    isFullCombo: true,
                    gameEnded: false,
                    isPlaying: false,
                    hp: 100, // Reset HP
                    songDuration: (audioAnalysis?.track?.duration || 0) * 1000
                };

                // Start playing after countdown (3 seconds)
                setTimeout(() => {
                    Spicetify.Player.seek(0);
                    setTimeout(() => Spicetify.Player.play(), 50);
                    gameStateRef.current.isPlaying = true;
                    gameStateRef.current.gameStartTime = performance.now();
                }, 3500); // 3.5 second delay for countdown
            }
        }, [audioAnalysis, difficulty, generateNotes, LANES]);

        // Sync with Spotify playback
        useEffect(() => {
            const syncWithPlayer = () => {
                if (!gameStateRef.current.isPlaying) return;
                const progress = Spicetify.Player.getProgress();
                gameStateRef.current.syncOffset = progress - (performance.now() - gameStateRef.current.gameStartTime);
            };

            const interval = setInterval(syncWithPlayer, 100);
            return () => clearInterval(interval);
        }, []);

        // Detect Spotify play/pause state changes for space bar handling
        useEffect(() => {
            let lastPlayState = Spicetify.Player.isPlaying();

            const handlePlayStateChange = () => {
                const isNowPlaying = Spicetify.Player.isPlaying();
                const state = gameStateRef.current;

                // Only handle if game hasn't ended
                if (state.gameEnded) return;

                if (isNowPlaying && !lastPlayState) {
                    // Just started playing - this is our "space pressed" signal during pause
                    if (state.isPaused) {
                        state.isPlaying = true;
                        state.isPaused = false;
                        state.gameStartTime = performance.now() - Spicetify.Player.getProgress();
                    }
                } else if (!isNowPlaying && lastPlayState) {
                    // Just paused
                    if (state.isPlaying) {
                        state.isPlaying = false;
                        state.isPaused = true;
                    }
                }

                lastPlayState = isNowPlaying;
            };

            // Check state frequently
            const interval = setInterval(handlePlayStateChange, 50);

            return () => clearInterval(interval);
        }, []);

        // Handle key input
        useEffect(() => {
            const handleKeyDown = (e) => {
                if (e.repeat) return;

                // Space key handling - directly control pause/resume
                if (e.code === 'Space') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (Spicetify.Player.isPlaying()) {
                        Spicetify.Player.pause();
                    } else {
                        Spicetify.Player.play();
                    }
                    return;
                }

                const key = e.key.toUpperCase();
                const laneIndex = LANE_KEYS.indexOf(key);

                if (laneIndex !== -1 && !keysPressed.current[key]) {
                    keysPressed.current[key] = true;
                    keysHeld.current[key] = true;
                    handleNoteHit(laneIndex);
                }
            };

            const handleKeyUp = (e) => {
                const key = e.key.toUpperCase();
                keysPressed.current[key] = false;
                keysHeld.current[key] = false;

                const laneIndex = LANE_KEYS.indexOf(key);
                if (laneIndex !== -1) {
                    handleNoteRelease(laneIndex);
                }
            };

            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);

            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                window.removeEventListener('keyup', handleKeyUp);
            };
        }, [LANES, LANE_KEYS]);

        // Handle note release (for slide notes)
        const handleNoteRelease = useCallback((lane) => {
            const state = gameStateRef.current;
            state.holdingLanes[lane] = false;
            state.notes.forEach(note => {
                if (note.lane === lane && note.type === 'slide' && note.holding) {
                    note.holding = false;
                }
            });
        }, []);

        // Add hit effect
        const addHitEffect = useCallback((lane, judgement) => {
            const state = gameStateRef.current;
            const x = LANE_START_X + lane * LANE_WIDTH + LANE_WIDTH / 2;

            // Screen shake for PERFECT (if enabled)
            if (effects?.screenShake !== false) {
                if (judgement === 'PERFECT') {
                    state.shakeAmount = 8;
                } else if (judgement === 'GREAT') {
                    state.shakeAmount = 4;
                }
            }

            // Lane flash (if enabled)
            if (effects?.laneFlash !== false) {
                state.laneFlashes[lane] = 1;
            }

            // Explosion particles (if enabled)
            if (effects?.particles !== false) {
                const particleCount = judgement === 'PERFECT' ? 25 : judgement === 'GREAT' ? 15 : 8;
                for (let i = 0; i < particleCount; i++) {
                    const angle = (Math.PI * 2 / particleCount) * i + Math.random() * 0.5;
                    const speed = 3 + Math.random() * 6;
                    state.particles.push({
                        x: x,
                        y: JUDGE_LINE_Y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed - 3,
                        life: 1,
                        color: LANE_COLORS[lane],
                        size: 3 + Math.random() * 4
                    });
                }
            }

            // Hit ring effect (if enabled)
            if (effects?.hitEffects !== false) {
                state.hitEffects.push({
                    x: x,
                    y: JUDGE_LINE_Y,
                    radius: 20,
                    maxRadius: judgement === 'PERFECT' ? 100 : 80,
                    life: 1,
                    color: LANE_COLORS[lane],
                    lane: lane,
                    judgement: judgement,
                    hue: 0
                });
            }
        }, [effects]);

        // Handle note hit
        const handleNoteHit = useCallback((lane) => {
            const currentTime = Spicetify.Player.getProgress() + (settings.offset || 0);
            const state = gameStateRef.current;
            const isNoFail = settings.modifiers?.noFail;

            let closestNote = null;
            let closestDiff = Infinity;
            let timingDelta = 0; // Positive = late, negative = early

            state.notes.forEach(note => {
                if (note.lane === lane && !note.hit && !note.passed) {
                    const noteTime = note.time;
                    const diff = Math.abs(currentTime - noteTime);
                    if (diff < closestDiff && diff < TIMING.MISS) {
                        closestDiff = diff;
                        closestNote = note;
                        timingDelta = currentTime - noteTime;
                    }
                }
            });

            if (closestNote) {
                let judgement;

                if (closestDiff <= TIMING.PERFECT) {
                    judgement = 'PERFECT';
                    state.lastTiming = null; // Perfect = no timing indicator
                    state.perfectChain++;
                } else if (closestDiff <= TIMING.GREAT) {
                    judgement = 'GREAT';
                    state.lastTiming = timingDelta > 0 ? 'LATE' : 'EARLY';
                    state.perfectChain = 0;
                } else if (closestDiff <= TIMING.GOOD) {
                    judgement = 'GOOD';
                    state.lastTiming = timingDelta > 0 ? 'LATE' : 'EARLY';
                    state.perfectChain = 0;
                } else {
                    judgement = 'MISS';
                    state.lastTiming = null;
                    state.perfectChain = 0;
                }

                if (closestNote.type === 'slide') {
                    closestNote.holding = true;
                    closestNote.hit = true;
                    state.holdingLanes[lane] = true;
                } else {
                    closestNote.hit = true;
                }

                // Check Fever mode (50+ combo)
                const wasFever = state.isFever;
                state.isFever = state.combo >= 50;
                state.feverMultiplier = state.isFever ? 2.0 : 1.0;

                // Calculate score with fever and combo multiplier
                const baseScore = SCORE_VALUES[judgement];
                const comboBonus = 1 + state.combo * 0.05;
                const feverBonus = state.feverMultiplier;
                state.score += baseScore * comboBonus * feverBonus;

                state.judgements[judgement]++;

                if (judgement !== 'MISS') {
                    state.combo++;
                    state.maxCombo = Math.max(state.maxCombo, state.combo);
                    addHitEffect(lane, judgement);
                    // Heal on hit
                    state.hp = Math.min(100, state.hp + (judgement === 'PERFECT' ? 2 : 1));
                } else {
                    state.combo = 0;
                    state.isFullCombo = false;
                    state.missFlash = 1.0; // Trigger miss flash
                    // Damage on miss (skip if No Fail enabled)
                    if (!isNoFail) {
                        state.hp = Math.max(0, state.hp - 15);
                    }
                }

                // Update real-time accuracy
                const totalHits = state.judgements.PERFECT + state.judgements.GREAT + state.judgements.GOOD + state.judgements.MISS;
                if (totalHits > 0) {
                    const weightedScore = state.judgements.PERFECT * 100 + state.judgements.GREAT * 70 + state.judgements.GOOD * 40;
                    state.currentAccuracy = (weightedScore / totalHits).toFixed(1);
                }

                state.lastJudgement = judgement;
                state.lastJudgementTime = performance.now();
                state.lastJudgementLane = lane;
            }
        }, [addHitEffect, settings.offset, settings.modifiers]);

        // Update slide notes
        const updateSlideNotes = useCallback(() => {
            const currentTime = Spicetify.Player.getProgress();
            const state = gameStateRef.current;

            state.notes.forEach(note => {
                if (note.type === 'slide' && note.holding && !note.passed) {
                    const endTime = note.time + note.duration;

                    // Award points for holding
                    if (currentTime < endTime) {
                        const tickInterval = note.duration / note.totalTicks;
                        const expectedTicks = Math.floor((currentTime - note.time) / tickInterval);

                        while (note.ticksHit < expectedTicks && note.ticksHit < note.totalTicks) {
                            note.ticksHit++;
                            state.score += 100 * (1 + state.combo * 0.02);
                            state.combo++;

                            // Small particles for slide
                            const x = LANE_START_X + note.lane * LANE_WIDTH + LANE_WIDTH / 2;
                            for (let i = 0; i < 3; i++) {
                                state.particles.push({
                                    x: x + (Math.random() - 0.5) * 40,
                                    y: JUDGE_LINE_Y,
                                    vx: (Math.random() - 0.5) * 3,
                                    vy: -Math.random() * 4 - 2,
                                    life: 0.6,
                                    color: LANE_COLORS[note.lane],
                                    size: 2 + Math.random() * 2
                                });
                            }
                        }
                    } else {
                        note.passed = true;
                        note.holding = false;
                    }
                }
            });
        }, []);

        // Check game end
        const checkGameEnd = useCallback(() => {
            const state = gameStateRef.current;
            if (state.gameEnded) return;

            const currentTime = Spicetify.Player.getProgress();
            const songEnd = state.songDuration - 1000; // End 1 second before song ends

            const allNotesDone = state.notes.every(n => n.hit || n.passed);
            const isDead = state.hp <= 0;
            const shouldEnd = (allNotesDone && state.notes.length > 0) ||
                (currentTime >= songEnd && songEnd > 0) || isDead;

            if (shouldEnd) {
                state.gameEnded = true;
                Spicetify.Player.pause();

                const hitNotes = state.judgements.PERFECT + state.judgements.GREAT + state.judgements.GOOD;
                const accuracy = state.totalNotes > 0 ? (hitNotes / state.totalNotes * 100) : 0;
                const isFullCombo = state.isFullCombo && state.judgements.MISS === 0;

                setTimeout(() => {
                    onGameEnd?.({
                        score: Math.floor(state.score),
                        maxCombo: state.maxCombo,
                        judgements: { ...state.judgements },
                        accuracy: accuracy.toFixed(2),
                        isFullCombo: isFullCombo,
                        isDead: isDead // Pass death state
                    });
                }, 1500);
            }
        }, [onGameEnd]);

        // Game loop
        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const dpr = dprRef.current;

            canvas.width = GAME_WIDTH * dpr;
            canvas.height = GAME_HEIGHT * dpr;
            ctx.scale(dpr, dpr);

            // Cache gradients on first render
            if (!cachedGradientsRef.current) {
                const bgGradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
                bgGradient.addColorStop(0, '#0a0a18');
                bgGradient.addColorStop(0.5, '#12122a');
                bgGradient.addColorStop(1, '#0a0a18');
                cachedGradientsRef.current = { bgGradient };
            }

            const render = () => {
                const state = gameStateRef.current;
                const currentTime = Spicetify.Player.getProgress();

                // Limit particles
                if (state.particles.length > MAX_PARTICLES) {
                    state.particles = state.particles.slice(-MAX_PARTICLES);
                }

                // Update slide notes
                updateSlideNotes();

                // Apply screen shake
                ctx.save();
                if (state.shakeAmount > 0) {
                    const shakeX = (Math.random() - 0.5) * state.shakeAmount;
                    const shakeY = (Math.random() - 0.5) * state.shakeAmount;
                    ctx.translate(shakeX, shakeY);
                    state.shakeAmount *= 0.85;
                    if (state.shakeAmount < 0.5) state.shakeAmount = 0;
                }

                // Clear canvas with cached gradient
                ctx.fillStyle = cachedGradientsRef.current.bgGradient;
                ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

                // Background visualizer (audio spectrum effect based on combo)
                if (backgroundVisualizer !== false) {
                    const barCount = 32;
                    const barWidth = GAME_WIDTH / barCount;
                    const maxBarHeight = GAME_HEIGHT * 0.3;
                    const time = performance.now() / 1000;

                    for (let i = 0; i < barCount; i++) {
                        // Create pseudo-audio data based on time and combo
                        const frequency = (Math.sin(time * 2 + i * 0.3) + 1) / 2;
                        const comboBoost = Math.min(state.combo / 100, 1) * 0.5;
                        const height = (frequency * 0.5 + comboBoost) * maxBarHeight * (0.3 + Math.random() * 0.2);

                        // Color based on position
                        const hue = (i / barCount) * 60 + 180; // Cyan to purple
                        const alpha = 0.15 + comboBoost * 0.1;

                        ctx.fillStyle = `hsla(${hue}, 70%, 50%, ${alpha})`;
                        ctx.fillRect(i * barWidth, GAME_HEIGHT - height, barWidth - 2, height);

                        // Mirror on top
                        ctx.fillRect(i * barWidth, 0, barWidth - 2, height * 0.5);
                    }
                }

                // Draw lane backgrounds with flash effect
                for (let i = 0; i < LANES; i++) {
                    const x = LANE_START_X + i * LANE_WIDTH;

                    // Lane gradient
                    const laneGradient = ctx.createLinearGradient(x, 0, x, GAME_HEIGHT);
                    laneGradient.addColorStop(0, 'rgba(20, 20, 40, 0.4)');
                    laneGradient.addColorStop(0.8, 'rgba(30, 30, 60, 0.6)');
                    laneGradient.addColorStop(1, 'rgba(40, 40, 80, 0.8)');
                    ctx.fillStyle = laneGradient;
                    ctx.fillRect(x, 0, LANE_WIDTH, GAME_HEIGHT);

                    // Lane flash on hit
                    if (state.laneFlashes[i] > 0) {
                        ctx.fillStyle = `${LANE_COLORS[i]}${Math.floor(state.laneFlashes[i] * 60).toString(16).padStart(2, '0')}`;
                        ctx.fillRect(x, 0, LANE_WIDTH, GAME_HEIGHT);
                        state.laneFlashes[i] *= 0.88;
                        if (state.laneFlashes[i] < 0.05) state.laneFlashes[i] = 0;
                    }

                    // Lane separators
                    ctx.strokeStyle = 'rgba(100, 100, 180, 0.2)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, GAME_HEIGHT);
                    ctx.stroke();
                }

                // Draw judge line with pulsing glow
                const pulseIntensity = 0.7 + Math.sin(performance.now() / 200) * 0.3;
                ctx.shadowColor = difficulty?.color || '#00ff88';
                ctx.shadowBlur = 25 * pulseIntensity;

                const judgeGradient = ctx.createLinearGradient(LANE_START_X, 0, LANE_START_X + LANES * LANE_WIDTH, 0);
                judgeGradient.addColorStop(0, LANE_COLORS[0]);
                judgeGradient.addColorStop(0.33, LANE_COLORS[1]);
                judgeGradient.addColorStop(0.66, LANE_COLORS[2]);
                judgeGradient.addColorStop(1, LANE_COLORS[3]);

                ctx.strokeStyle = judgeGradient;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(LANE_START_X, JUDGE_LINE_Y);
                ctx.lineTo(LANE_START_X + LANES * LANE_WIDTH, JUDGE_LINE_Y);
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Draw key hints
                for (let i = 0; i < LANES; i++) {
                    const x = LANE_START_X + i * LANE_WIDTH + LANE_WIDTH / 2;
                    const isPressed = keysHeld.current[LANE_KEYS[i]];

                    // Key circle with glow
                    if (isPressed) {
                        ctx.shadowColor = LANE_COLORS[i];
                        ctx.shadowBlur = 20;
                    }

                    ctx.fillStyle = isPressed
                        ? LANE_COLORS[i]
                        : `rgba(60, 60, 100, 0.6)`;
                    ctx.beginPath();
                    ctx.arc(x, JUDGE_LINE_Y + 50, 28, 0, Math.PI * 2);
                    ctx.fill();

                    // Key border
                    ctx.strokeStyle = isPressed ? '#fff' : LANE_COLORS[i];
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.shadowBlur = 0;

                    // Key text
                    ctx.fillStyle = isPressed ? '#000' : '#fff';
                    ctx.font = 'bold 18px "Segoe UI", Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(LANE_KEYS[i], x, JUDGE_LINE_Y + 50);
                }

                // Update and draw notes
                const isNoFail = settings.modifiers?.noFail;
                const offsetTime = currentTime + (settings.offset || 0);
                state.notes.forEach(note => {
                    if (note.hit && note.type !== 'slide') return;
                    if (note.passed) return;

                    // Check if note was missed
                    const noteEndTime = note.type === 'slide' ? note.time + note.duration : note.time;
                    if (offsetTime > noteEndTime + TIMING.MISS && !note.hit) {
                        note.passed = true;
                        state.judgements.MISS++;
                        state.combo = 0;
                        state.isFullCombo = false;
                        state.perfectChain = 0;
                        state.missFlash = 1;
                        // Damage on miss (skip if No Fail enabled)
                        if (!isNoFail) {
                            state.hp = Math.max(0, state.hp - 15);
                        }
                        state.lastJudgement = 'MISS';
                        state.lastJudgementTime = performance.now();
                        state.lastJudgementLane = note.lane;
                        return;
                    }

                    const x = LANE_START_X + note.lane * LANE_WIDTH;

                    if (note.type === 'slide') {
                        // Draw slide note (long note)
                        const startY = JUDGE_LINE_Y - ((note.time - currentTime) / 1000) * NOTE_SPEED;
                        const endY = JUDGE_LINE_Y - ((note.time + note.duration - currentTime) / 1000) * NOTE_SPEED;

                        if (endY < GAME_HEIGHT && startY > -NOTE_HEIGHT) {
                            // Slide body
                            const bodyGradient = ctx.createLinearGradient(x, 0, x + LANE_WIDTH, 0);
                            bodyGradient.addColorStop(0, LANE_COLORS[note.lane] + '80');
                            bodyGradient.addColorStop(0.5, LANE_COLORS[note.lane] + 'CC');
                            bodyGradient.addColorStop(1, LANE_COLORS[note.lane] + '80');

                            ctx.fillStyle = bodyGradient;
                            const clampedStartY = Math.min(startY, JUDGE_LINE_Y);
                            const clampedEndY = Math.max(endY, -NOTE_HEIGHT);
                            ctx.fillRect(x + 8, clampedEndY, LANE_WIDTH - 16, clampedStartY - clampedEndY);

                            // Slide end cap
                            if (endY > -NOTE_HEIGHT) {
                                ctx.shadowColor = LANE_COLORS[note.lane];
                                ctx.shadowBlur = 10;
                                ctx.fillStyle = LANE_COLORS[note.lane];
                                ctx.beginPath();
                                ctx.roundRect(x + 5, endY, LANE_WIDTH - 10, NOTE_HEIGHT, 4);
                                ctx.fill();
                                ctx.shadowBlur = 0;
                            }

                            // Slide start cap (only if visible and not passed)
                            if (startY > -NOTE_HEIGHT && startY < GAME_HEIGHT && !note.hit) {
                                ctx.shadowColor = LANE_COLORS[note.lane];
                                ctx.shadowBlur = 15;
                                const headGradient = ctx.createLinearGradient(x, startY, x + LANE_WIDTH, startY);
                                headGradient.addColorStop(0, LANE_COLORS[note.lane]);
                                headGradient.addColorStop(0.5, lightenColor(LANE_COLORS[note.lane], 40));
                                headGradient.addColorStop(1, LANE_COLORS[note.lane]);
                                ctx.fillStyle = headGradient;
                                ctx.beginPath();
                                ctx.roundRect(x + 5, startY, LANE_WIDTH - 10, NOTE_HEIGHT, 6);
                                ctx.fill();
                                ctx.shadowBlur = 0;
                            }

                            // Holding effect - enhanced
                            if (note.holding) {
                                const holdX = x + LANE_WIDTH / 2;

                                // Glowing center line
                                ctx.shadowColor = LANE_COLORS[note.lane];
                                ctx.shadowBlur = 25;
                                ctx.strokeStyle = LANE_COLORS[note.lane];
                                ctx.lineWidth = 4;
                                ctx.beginPath();
                                ctx.moveTo(holdX, Math.max(endY, 0));
                                ctx.lineTo(holdX, JUDGE_LINE_Y);
                                ctx.stroke();
                                ctx.shadowBlur = 0;

                                // Pulsing glow at judge line
                                const pulseSize = 20 + Math.sin(performance.now() / 80) * 8;
                                ctx.fillStyle = LANE_COLORS[note.lane] + '60';
                                ctx.beginPath();
                                ctx.arc(holdX, JUDGE_LINE_Y, pulseSize, 0, Math.PI * 2);
                                ctx.fill();

                                // Animated particles going up
                                if (Math.random() < 0.3) {
                                    state.particles.push({
                                        x: holdX + (Math.random() - 0.5) * 30,
                                        y: JUDGE_LINE_Y,
                                        vx: (Math.random() - 0.5) * 2,
                                        vy: -Math.random() * 5 - 3,
                                        life: 0.7,
                                        color: LANE_COLORS[note.lane],
                                        size: 2 + Math.random() * 3
                                    });
                                }
                            }
                        }
                    } else {
                        // Draw tap note
                        const y = JUDGE_LINE_Y - ((note.time - currentTime) / 1000) * NOTE_SPEED;

                        if (y > -NOTE_HEIGHT && y < GAME_HEIGHT) {
                            // Get modifier settings
                            const isHidden = settings.modifiers?.hidden;
                            const isSudden = settings.modifiers?.sudden;

                            // Calculate note alpha based on modifiers
                            let noteAlpha = 1;

                            // Hidden: fade out when note is in lower half (closer to judge line)
                            if (isHidden) {
                                const fadeStart = GAME_HEIGHT * 0.4; // Start fading at 40% from top
                                const fadeEnd = GAME_HEIGHT * 0.7; // Fully invisible at 70%
                                if (y > fadeStart) {
                                    noteAlpha = Math.max(0, 1 - (y - fadeStart) / (fadeEnd - fadeStart));
                                }
                            }

                            // Sudden: only visible when note is in lower portion
                            if (isSudden) {
                                const appearY = GAME_HEIGHT * 0.45; // Notes appear at 45% from top
                                if (y < appearY) {
                                    noteAlpha = 0; // Invisible until reaching appear point
                                } else {
                                    // Quick fade in
                                    const fadeRange = 50;
                                    noteAlpha = Math.min(1, (y - appearY) / fadeRange);
                                }
                            }

                            if (noteAlpha > 0) {
                                ctx.save();
                                ctx.globalAlpha = noteAlpha;

                                // Note glow
                                ctx.shadowColor = LANE_COLORS[note.lane];
                                ctx.shadowBlur = 18;

                                // Use note skin drawer
                                noteSkinDrawer.drawNote(ctx, x, y, LANE_WIDTH, NOTE_HEIGHT, LANE_COLORS[note.lane], note.hit);

                                ctx.shadowBlur = 0;
                                ctx.restore();
                            }
                        }
                    }
                });

                // Draw hit ring effects
                state.hitEffects = state.hitEffects.filter(effect => {
                    effect.radius += (effect.maxRadius - effect.radius) * 0.15;
                    effect.life -= 0.04;
                    effect.hue = (effect.hue + 10) % 360;

                    if (effect.life > 0) {
                        // Rainbow effect for PERFECT
                        if (effect.judgement === 'PERFECT') {
                            ctx.strokeStyle = `hsla(${effect.hue}, 100%, 60%, ${effect.life})`;
                            ctx.lineWidth = 6 * effect.life;
                        } else {
                            ctx.strokeStyle = effect.color + Math.floor(effect.life * 200).toString(16).padStart(2, '0');
                            ctx.lineWidth = 4 * effect.life;
                        }
                        ctx.beginPath();
                        ctx.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
                        ctx.stroke();

                        // Extra inner ring for PERFECT
                        if (effect.judgement === 'PERFECT' && effect.life > 0.5) {
                            ctx.strokeStyle = `hsla(${(effect.hue + 180) % 360}, 100%, 70%, ${effect.life * 0.5})`;
                            ctx.lineWidth = 2;
                            ctx.beginPath();
                            ctx.arc(effect.x, effect.y, effect.radius * 0.6, 0, Math.PI * 2);
                            ctx.stroke();
                        }
                        return true;
                    }
                    return false;
                });

                // Draw particles
                state.particles = state.particles.filter(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.25;
                    p.life -= 0.025;

                    if (p.life > 0) {
                        ctx.fillStyle = p.color + Math.floor(p.life * 255).toString(16).padStart(2, '0');
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                        ctx.fill();
                        return true;
                    }
                    return false;
                });

                // Draw miss flash effect (red screen flash)
                if (state.missFlash > 0) {
                    ctx.fillStyle = `rgba(255, 51, 102, ${state.missFlash * 0.3})`;
                    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
                    state.missFlash -= 0.08;
                    if (state.missFlash < 0) state.missFlash = 0;
                }

                // Draw HP danger vignette effect
                if (state.hp < 30) {
                    const dangerIntensity = (30 - state.hp) / 30;
                    const pulseTime = performance.now() / 500;
                    const pulse = state.hp < 20 ? 0.5 + Math.sin(pulseTime) * 0.5 : 1;
                    const vignetteGradient = ctx.createRadialGradient(
                        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.3,
                        GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.8
                    );
                    vignetteGradient.addColorStop(0, 'rgba(255, 0, 0, 0)');
                    vignetteGradient.addColorStop(1, `rgba(255, 0, 0, ${dangerIntensity * 0.4 * pulse})`);
                    ctx.fillStyle = vignetteGradient;
                    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
                }

                // Draw judgement text with animation + timing indicator
                if (state.lastJudgement && performance.now() - state.lastJudgementTime < 400) {
                    const elapsed = performance.now() - state.lastJudgementTime;
                    const progress = elapsed / 400;
                    const scale = 1 + Math.sin(progress * Math.PI) * 0.3;
                    const alpha = 1 - progress;

                    const colors = {
                        PERFECT: '#00D4AA',
                        GREAT: '#00B4FF',
                        GOOD: '#888888',
                        MISS: '#FF3366'
                    };

                    ctx.save();
                    ctx.translate(GAME_WIDTH / 2, 200);
                    ctx.scale(scale, scale);

                    // Text shadow
                    ctx.fillStyle = 'rgba(0,0,0,0.5)';
                    ctx.font = 'bold 48px "Segoe UI", Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(state.lastJudgement, 2, 2);

                    ctx.fillStyle = colors[state.lastJudgement];
                    ctx.globalAlpha = alpha;
                    ctx.fillText(state.lastJudgement, 0, 0);

                    // Early/Late indicator
                    if (state.lastTiming) {
                        ctx.font = 'bold 18px "Segoe UI", Arial';
                        ctx.fillStyle = state.lastTiming === 'EARLY' ? '#00B4FF' : '#FF6B35';
                        ctx.fillText(state.lastTiming, 0, 35);
                    }

                    // Perfect chain
                    if (state.perfectChain >= 5) {
                        ctx.font = 'bold 14px "Segoe UI", Arial';
                        ctx.fillStyle = '#00D4AA';
                        ctx.fillText(`${state.perfectChain} PERFECT CHAIN`, 0, -35);
                    }

                    ctx.restore();
                }

                // Miss flash effect
                if (state.missFlash > 0) {
                    ctx.fillStyle = `rgba(255, 0, 0, ${state.missFlash * 0.3})`;
                    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
                    state.missFlash *= 0.85;
                    if (state.missFlash < 0.05) state.missFlash = 0;
                }

                // Fever mode visual - badge in top right
                if (state.isFever) {
                    // Rainbow border glow
                    const hue = (performance.now() / 10) % 360;
                    ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.8)`;
                    ctx.lineWidth = 4;
                    ctx.strokeRect(2, 2, GAME_WIDTH - 4, GAME_HEIGHT - 4);

                    // Fever badge
                    ctx.save();
                    const feverX = GAME_WIDTH - 65;
                    const feverY = 25;
                    const feverScale = 1 + Math.sin(performance.now() / 100) * 0.05;
                    ctx.translate(feverX, feverY);
                    ctx.scale(feverScale, feverScale);

                    const feverGradient = ctx.createLinearGradient(-40, -10, 40, 10);
                    feverGradient.addColorStop(0, '#FF3366');
                    feverGradient.addColorStop(0.5, '#FFB800');
                    feverGradient.addColorStop(1, '#00D4AA');
                    ctx.fillStyle = feverGradient;
                    ctx.shadowColor = '#00D4AA';
                    ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.roundRect(-40, -12, 80, 24, 12);
                    ctx.fill();

                    ctx.shadowBlur = 0;
                    ctx.fillStyle = '#000';
                    ctx.font = 'bold 12px "Segoe UI", Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('FEVER x2', 0, 0);
                    ctx.restore();
                }

                // Draw progress bar at bottom
                const songProgress = state.songDuration > 0 ? (currentTime / state.songDuration) : 0;
                const progressWidth = GAME_WIDTH - 20;
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(10, GAME_HEIGHT - 10, progressWidth, 3);
                ctx.fillStyle = state.isFever ? '#FF3366' : '#00D4AA';
                ctx.fillRect(10, GAME_HEIGHT - 10, progressWidth * Math.min(1, songProgress), 3);

                // Draw fever gauge (combo progress to 50)
                const feverGaugeWidth = 120;
                const feverGaugeHeight = 8;
                const feverGaugeX = GAME_WIDTH - feverGaugeWidth - 15;
                const feverGaugeY = 90;
                const feverProgress = Math.min(state.combo / 50, 1);
                const feverTime = performance.now() / 200;

                // Gauge background
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.beginPath();
                ctx.roundRect(feverGaugeX, feverGaugeY, feverGaugeWidth, feverGaugeHeight, 4);
                ctx.fill();

                // Gauge fill (rainbow when in fever)
                if (state.isFever) {
                    const rainbowGradient = ctx.createLinearGradient(feverGaugeX, 0, feverGaugeX + feverGaugeWidth, 0);
                    for (let i = 0; i <= 1; i += 0.2) {
                        rainbowGradient.addColorStop(i, `hsl(${(feverTime * 50 + i * 360) % 360}, 100%, 60%)`);
                    }
                    ctx.fillStyle = rainbowGradient;
                } else {
                    const gaugeGradient = ctx.createLinearGradient(feverGaugeX, 0, feverGaugeX + feverGaugeWidth, 0);
                    gaugeGradient.addColorStop(0, '#00D4AA');
                    gaugeGradient.addColorStop(1, '#FF3366');
                    ctx.fillStyle = gaugeGradient;
                }
                ctx.beginPath();
                ctx.roundRect(feverGaugeX, feverGaugeY, feverGaugeWidth * feverProgress, feverGaugeHeight, 4);
                ctx.fill();

                // Fever label
                ctx.font = 'bold 10px monospace';
                ctx.textAlign = 'right';
                ctx.fillStyle = state.isFever ? '#FF3366' : '#888';
                ctx.fillText(state.isFever ? 'FEVER x2' : 'FEVER', feverGaugeX - 5, feverGaugeY + 7);

                // Combo milestones popup (only shown briefly)
                const milestones = [50, 100, 200, 300, 500, 1000];
                if (milestones.includes(state.combo)) {
                    if (!state.lastMilestone || state.lastMilestone !== state.combo) {
                        state.lastMilestone = state.combo;
                        state.milestoneTime = performance.now();
                    }
                }
                if (state.milestoneTime && performance.now() - state.milestoneTime < 800) {
                    const milestoneElapsed = performance.now() - state.milestoneTime;
                    const milestoneProgress = milestoneElapsed / 800;
                    const milestoneAlpha = 1 - milestoneProgress;
                    const milestoneScale = 1 + milestoneProgress * 0.3;

                    ctx.save();
                    ctx.globalAlpha = milestoneAlpha;
                    ctx.translate(GAME_WIDTH / 2, 120);
                    ctx.scale(milestoneScale, milestoneScale);
                    ctx.font = 'bold 28px "Segoe UI", Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#00D4AA';
                    ctx.shadowColor = '#00D4AA';
                    ctx.shadowBlur = 15;
                    ctx.fillText(`${state.lastMilestone} COMBO`, 0, 0);
                    ctx.restore();
                }

                // Draw pause indicator
                if (state.isPaused) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 48px "Segoe UI", Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('PAUSED', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);

                    ctx.font = '18px "Segoe UI", Arial';
                    ctx.fillStyle = '#aaa';
                    ctx.fillText('Press SPACE to resume', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
                }

                ctx.restore();

                // Check game end
                checkGameEnd();

                animationRef.current = requestAnimationFrame(render);
            };

            render();

            return () => {
                if (animationRef.current) {
                    cancelAnimationFrame(animationRef.current);
                }
            };
        }, [difficulty, updateSlideNotes, checkGameEnd]);

        return React.createElement('canvas', {
            ref: canvasRef,
            style: {
                width: `${GAME_WIDTH}px`,
                height: `${GAME_HEIGHT}px`,
                borderRadius: '16px',
                boxShadow: `0 0 50px ${difficulty?.color || '#00ff88'}40, 0 0 100px ${difficulty?.color || '#00ff88'}20`
            }
        });
    }

    function formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        return `${m}:${(s % 60).toString().padStart(2, '0')}`;
    }

    // ====== GAME SCREEN COMPONENT (Refactored) ======
    function GameScreen({ audioAnalysis, difficulty, trackInfo, onGameEnd, onRestart, onQuit, settings }) {
        const [gameState, setGameState] = useState({
            score: 0, combo: 0, maxCombo: 0, hp: 100,
            judgements: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
            isPaused: false, accuracy: 100, isFever: false
        });
        const [progress, setProgress] = useState(0);
        const [countdown, setCountdown] = useState(3);
        const [showCountdown, setShowCountdown] = useState(true);
        const gameRef = useRef(null);

        // Derive keys from settings
        const { keyMode, modifiers } = settings;
        const config = KEY_CONFIGS[keyMode] || KEY_CONFIGS[4];
        const currentKeys = config.keys;
        const currentColors = config.colors;

        // Get BPM from analysis
        const bpm = useMemo(() => {
            if (audioAnalysis?.track?.tempo) {
                return Math.round(audioAnalysis.track.tempo);
            }
            return null;
        }, [audioAnalysis]);

        // Countdown effect
        useEffect(() => {
            if (!showCountdown) return;
            if (countdown <= 0) {
                setShowCountdown(false);
                return;
            }
            const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        }, [countdown, showCountdown]);

        // Update state from game
        useEffect(() => {
            const interval = setInterval(() => {
                if (gameRef.current?.current) {
                    const s = gameRef.current.current;
                    setGameState({
                        score: Math.floor(s.score),
                        combo: s.combo,
                        maxCombo: s.maxCombo,
                        hp: s.hp,
                        judgements: { ...s.judgements },
                        isPaused: s.isPaused,
                        accuracy: s.currentAccuracy || 100,
                        isFever: s.isFever || false
                    });
                }
                setProgress(Spicetify.Player.getProgress());
            }, 50);
            return () => clearInterval(interval);
        }, []);

        // Handle pause menu key events
        useEffect(() => {
            const handleKey = (e) => {
                if (!gameState.isPaused) return;
                if (e.key === 'r' || e.key === 'R') {
                    e.preventDefault();
                    onRestart?.();
                } else if (e.key === 'q' || e.key === 'Q' || e.key === 'Escape') {
                    e.preventDefault();
                    onQuit?.();
                }
            };
            window.addEventListener('keydown', handleKey);
            return () => window.removeEventListener('keydown', handleKey);
        }, [gameState.isPaused, onRestart, onQuit]);

        const duration = audioAnalysis?.track?.duration * 1000 || 0;
        const albumArt = trackInfo?.album?.images?.[0]?.url ||
            Spicetify.Player.data?.item?.album?.images?.[0]?.url || '';

        // Active modifiers list
        const activeModifiers = [];
        if (modifiers?.mirror) activeModifiers.push({ icon: 'MIR', name: 'Mirror' });
        if (modifiers?.random) activeModifiers.push({ icon: 'RND', name: 'Random' });
        if (modifiers?.noFail) activeModifiers.push({ icon: 'NF', name: 'No Fail' });
        if (modifiers?.hidden) activeModifiers.push({ icon: 'HD', name: 'Hidden' });
        if (modifiers?.sudden) activeModifiers.push({ icon: 'SD', name: 'Sudden' });

        return React.createElement('div', { className: 'rhythm-container' },
            // Countdown Overlay
            showCountdown && React.createElement('div', {
                className: 'countdown-overlay',
                style: {
                    position: 'fixed', inset: 0, zIndex: 100,
                    background: 'rgba(0,0,0,0.8)', display: 'flex',
                    justifyContent: 'center', alignItems: 'center',
                    flexDirection: 'column'
                }
            },
                React.createElement('div', {
                    style: {
                        fontSize: countdown === 0 ? '80px' : '120px',
                        fontWeight: '900',
                        color: countdown === 0 ? '#00D4AA' : '#fff',
                        textShadow: `0 0 40px ${countdown === 0 ? '#00D4AA' : '#fff'}`,
                        animation: 'pulse 0.5s ease'
                    }
                }, countdown === 0 ? 'GO!' : countdown),
                React.createElement('div', { style: { marginTop: '20px', color: '#888', fontSize: '14px', letterSpacing: '2px' } },
                    'GET READY'
                )
            ),

            // Pause Menu Overlay
            gameState.isPaused && !showCountdown && React.createElement('div', {
                className: 'pause-overlay',
                style: {
                    position: 'fixed', inset: 0, zIndex: 100,
                    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    flexDirection: 'column', gap: '20px'
                }
            },
                React.createElement('div', { style: { fontSize: '48px', fontWeight: '900', color: '#fff', marginBottom: '10px' } }, 'PAUSED'),
                React.createElement('div', { style: { color: '#888', marginBottom: '30px' } }, 'Press SPACE to resume'),
                React.createElement('div', { style: { display: 'flex', gap: '16px' } },
                    React.createElement('button', {
                        className: 'pause-btn',
                        onClick: onRestart,
                        style: {
                            padding: '14px 32px', borderRadius: '12px', border: '2px solid #00D4AA',
                            background: 'transparent', color: '#00D4AA', fontSize: '14px', fontWeight: '700',
                            cursor: 'pointer', letterSpacing: '1px', transition: 'all 0.2s'
                        }
                    }, 'RESTART (R)'),
                    React.createElement('button', {
                        className: 'pause-btn',
                        onClick: onQuit,
                        style: {
                            padding: '14px 32px', borderRadius: '12px', border: '2px solid #FF3366',
                            background: 'transparent', color: '#FF3366', fontSize: '14px', fontWeight: '700',
                            cursor: 'pointer', letterSpacing: '1px', transition: 'all 0.2s'
                        }
                    }, 'QUIT (Q)')
                ),
                React.createElement('div', { style: { marginTop: '40px', textAlign: 'center' } },
                    React.createElement('div', { style: { fontSize: '12px', color: '#666', marginBottom: '8px' } }, 'CURRENT PROGRESS'),
                    React.createElement('div', { style: { fontSize: '24px', fontWeight: '700' } }, gameState.score.toLocaleString()),
                    React.createElement('div', { style: { fontSize: '14px', color: '#00D4AA', marginTop: '4px' } }, `${gameState.combo} Combo`)
                )
            ),

            // Left Panel - Score & Stats
            React.createElement('div', { className: 'glass-panel left-panel' },
                React.createElement('div', { className: 'score-container' },
                    React.createElement('div', { className: 'score-value' }, gameState.score.toLocaleString())
                ),
                // HP Bar
                React.createElement('div', { className: 'hp-container', style: { width: '100%', marginBottom: '20px' } },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px', fontWeight: 'bold' } },
                        React.createElement('span', {}, 'HEALTH'),
                        React.createElement('span', {}, `${Math.floor(gameState.hp)}%`)
                    ),
                    React.createElement('div', { className: 'hp-bar-bg', style: { width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' } },
                        React.createElement('div', {
                            className: 'hp-bar-fill',
                            style: {
                                width: `${gameState.hp}%`,
                                height: '100%',
                                background: gameState.hp > 50 ? '#00D4AA' : (gameState.hp > 20 ? '#FFB800' : '#FF3366'),
                                transition: 'width 0.2s, background 0.2s'
                            }
                        })
                    )
                ),
                React.createElement('div', { className: 'combo-container' },
                    React.createElement('div', { className: 'combo-value', style: { color: gameState.isFever ? '#FF3366' : '#00D4AA' } }, gameState.combo),
                    React.createElement('div', { className: 'combo-label' }, 'COMBO'),
                    gameState.maxCombo > 0 && React.createElement('div', { style: { fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' } }, `MAX: ${gameState.maxCombo}`)
                ),
                // Accuracy display
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '12px' } },
                    React.createElement('span', { style: { fontSize: '12px', color: 'rgba(255,255,255,0.6)' } }, 'ACCURACY'),
                    React.createElement('span', { style: { fontSize: '18px', fontWeight: '700', color: gameState.accuracy >= 90 ? '#00D4AA' : (gameState.accuracy >= 70 ? '#FFB800' : '#FF3366') } }, `${gameState.accuracy}%`)
                ),
                // Fever indicator
                gameState.isFever && React.createElement('div', {
                    style: {
                        padding: '8px 16px', background: 'linear-gradient(90deg, #FF3366, #FFB800, #00D4AA)',
                        borderRadius: '20px', textAlign: 'center', fontWeight: '700', color: '#000', fontSize: '12px', marginTop: '12px'
                    }
                }, 'FEVER x2'),
                React.createElement('div', { className: 'stats-container' },
                    React.createElement('div', { className: 'stats-title' }, 'JUDGEMENT'),
                    ['PERFECT', 'GREAT', 'GOOD', 'MISS'].map(j =>
                        React.createElement('div', { key: j, className: 'stat-row' },
                            React.createElement('span', { className: `stat-label ${j.toLowerCase()}` }, j),
                            React.createElement('span', { className: 'stat-count' }, gameState.judgements[j])
                        )
                    )
                ),
                // Modifiers display
                activeModifiers.length > 0 && React.createElement('div', {
                    style: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap', justifyContent: 'center' }
                },
                    activeModifiers.map(m => React.createElement('div', {
                        key: m.name,
                        style: {
                            padding: '6px 12px', background: 'rgba(78,205,196,0.2)',
                            borderRadius: '20px', fontSize: '11px', color: '#00D4AA'
                        }
                    }, `${m.icon} ${m.name}`))
                ),
                React.createElement('div', { className: 'diff-badge', style: { color: difficulty.color, borderColor: difficulty.color, marginTop: 'auto' } },
                    React.createElement('div', {}, difficulty.name),
                    React.createElement('div', { style: { fontSize: '12px' } }, '★'.repeat(difficulty.stars))
                )
            ),

            // Center - Game Canvas
            React.createElement('div', { className: 'game-area' },
                React.createElement('div', { className: 'game-canvas-wrapper' },
                    React.createElement(RhythmGame, {
                        gameStateRef: gameRef,
                        audioAnalysis,
                        difficulty,
                        onGameEnd,
                        settings
                    })
                )
                // Note: Key hints are displayed in the canvas itself, removed duplicate here
            ),

            // Right Panel - Track Info
            React.createElement('div', { className: 'glass-panel right-panel' },
                React.createElement('img', { src: albumArt, className: 'album-art' }),
                React.createElement('div', { className: 'track-info' },
                    React.createElement('div', { className: 'track-title' }, trackInfo?.name),
                    React.createElement('div', { className: 'track-artist' }, trackInfo?.artists?.map(a => a.name).join(', '))
                ),
                // BPM Display
                bpm && React.createElement('div', {
                    style: {
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 16px', background: 'rgba(255,255,255,0.05)',
                        borderRadius: '12px', marginTop: '16px'
                    }
                },
                    React.createElement('span', { style: { fontSize: '11px', color: '#888', letterSpacing: '1px' } }, 'BPM'),
                    React.createElement('span', { style: { fontSize: '20px', fontWeight: '700', color: '#00D4AA' } }, bpm)
                ),
                React.createElement('div', { className: 'progress-container' },
                    React.createElement('div', { className: 'progress-bar' },
                        React.createElement('div', {
                            className: 'progress-fill',
                            style: { width: `${Math.min(100, (progress / duration) * 100)}%` }
                        })
                    ),
                    React.createElement('div', { className: 'time-labels' },
                        React.createElement('span', {}, formatTime(progress)),
                        React.createElement('span', {}, formatTime(duration))
                    )
                )
            )
        );
    }

    // ====== STATISTICS STORAGE ======
    const STATS_KEY = 'rhythm_game_stats';

    function getGameStats() {
        try {
            const data = localStorage.getItem(STATS_KEY);
            return data ? JSON.parse(data) : { totalPlays: 0, totalScore: 0, avgAccuracy: 0, bestCombo: 0, plays: [] };
        } catch (e) { return { totalPlays: 0, totalScore: 0, avgAccuracy: 0, bestCombo: 0, plays: [] }; }
    }

    function saveGameStats(result, trackInfo, difficulty) {
        try {
            const stats = getGameStats();
            stats.totalPlays++;
            stats.totalScore += result.score;
            stats.bestCombo = Math.max(stats.bestCombo, result.maxCombo);
            const totalAcc = stats.avgAccuracy * (stats.totalPlays - 1) + parseFloat(result.accuracy);
            stats.avgAccuracy = (totalAcc / stats.totalPlays).toFixed(2);
            stats.plays.unshift({
                track: trackInfo?.name || 'Unknown',
                artist: trackInfo?.artists?.[0]?.name || '',
                difficulty: difficulty.name,
                score: result.score,
                accuracy: result.accuracy,
                rank: result.rank,
                maxCombo: result.maxCombo,
                date: new Date().toISOString()
            });
            if (stats.plays.length > 20) stats.plays = stats.plays.slice(0, 20);
            localStorage.setItem(STATS_KEY, JSON.stringify(stats));
        } catch (e) { console.error('[RhythmGame] Stats save error:', e); }
    }

    // ====== NOTE SKIN PREVIEW ======
    function NoteSkinPreview({ skinKey, isActive, onClick, color }) {
        const canvasRef = useRef(null);
        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, 60, 36);
            const skin = NOTE_SKINS[skinKey];
            if (skin) skin.drawNote(ctx, 5, 4, 50, 28, color || '#00D4AA', false);
        }, [skinKey, color]);
        return React.createElement('div', {
            className: `note-preview-card ${isActive ? 'active' : ''}`,
            onClick: onClick
        },
            React.createElement('canvas', { ref: canvasRef, width: 60, height: 36, className: 'note-preview-canvas' }),
            React.createElement('div', { className: 'note-preview-label' }, NOTE_SKINS[skinKey]?.name)
        );
    }

    // ====== SETTINGS PANEL ======
    function SettingsPanel({ settings, onSettingChange }) {
        const colors = KEY_CONFIGS[settings.keyMode]?.colors || KEY_CONFIGS[4].colors;
        return React.createElement('div', { className: 'content-panel' },
            React.createElement('div', { className: 'settings-grid' },
                // Speed
                React.createElement('div', { className: 'setting-card' },
                    React.createElement('div', { className: 'setting-title' }, 'NOTE SPEED'),
                    React.createElement('div', { className: 'speed-control' },
                        React.createElement('button', { className: 'speed-btn', onClick: () => onSettingChange('speed', Math.max(1, settings.speed - 1)) }, '−'),
                        React.createElement('div', { className: 'speed-display' }, settings.speed),
                        React.createElement('button', { className: 'speed-btn', onClick: () => onSettingChange('speed', Math.min(10, settings.speed + 1)) }, '+')
                    )
                ),
                // Keys
                React.createElement('div', { className: 'setting-card' },
                    React.createElement('div', { className: 'setting-title' }, 'KEY MODE'),
                    React.createElement('div', { className: 'setting-options' },
                        [4, 6, 8].map(k => React.createElement('button', {
                            key: k, className: `setting-btn ${settings.keyMode === k ? 'active' : ''}`,
                            onClick: () => onSettingChange('keyMode', k)
                        }, `${k}K`))
                    )
                ),
                // Note Skin with Preview
                React.createElement('div', { className: 'setting-card full-width' },
                    React.createElement('div', { className: 'setting-title' }, 'NOTE SKIN'),
                    React.createElement('div', { className: 'note-preview-container' },
                        Object.keys(NOTE_SKINS).map(skinKey =>
                            React.createElement(NoteSkinPreview, {
                                key: skinKey, skinKey, color: colors[0],
                                isActive: settings.noteSkin === skinKey,
                                onClick: () => onSettingChange('noteSkin', skinKey)
                            })
                        )
                    )
                ),
                // Game Modifiers
                React.createElement('div', { className: 'setting-card full-width' },
                    React.createElement('div', { className: 'setting-title' }, 'GAME MODIFIERS'),
                    React.createElement('div', { className: 'modifier-grid', style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
                        [
                            { key: 'mirror', icon: 'MIR', name: 'Mirror', desc: 'Flip lanes horizontally' },
                            { key: 'random', icon: 'RND', name: 'Random', desc: 'Randomize note positions' },
                            { key: 'noFail', icon: 'NF', name: 'No Fail', desc: 'Cannot die from HP loss' },
                            { key: 'hidden', icon: 'HD', name: 'Hidden', desc: 'Notes fade out before judge line' },
                            { key: 'sudden', icon: 'SD', name: 'Sudden', desc: 'Notes appear near judge line' }
                        ].map(mod => React.createElement('div', {
                            key: mod.key,
                            onClick: () => onSettingChange('modifiers', { ...settings.modifiers, [mod.key]: !settings.modifiers?.[mod.key] }),
                            style: {
                                flex: '1 1 140px',
                                padding: '14px 16px',
                                borderRadius: '12px',
                                background: settings.modifiers?.[mod.key] ? 'rgba(78,205,196,0.2)' : 'rgba(0,0,0,0.2)',
                                border: `1px solid ${settings.modifiers?.[mod.key] ? '#00D4AA' : 'rgba(255,255,255,0.08)'}`,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }
                        },
                            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
                                React.createElement('span', { style: { fontSize: '18px' } }, mod.icon),
                                React.createElement('span', { style: { fontWeight: '700', color: settings.modifiers?.[mod.key] ? '#00D4AA' : '#fff' } }, mod.name)
                            ),
                            React.createElement('div', { style: { fontSize: '11px', color: 'rgba(255,255,255,0.5)' } }, mod.desc)
                        ))
                    )
                ),
                // Effects
                React.createElement('div', { className: 'setting-card' },
                    React.createElement('div', { className: 'setting-title' }, 'VISUAL EFFECTS'),
                    React.createElement('div', { className: 'effect-grid' },
                        [{ key: 'particles', icon: 'PTL', label: 'Particles' },
                        { key: 'screenShake', icon: 'SHK', label: 'Shake' },
                        { key: 'laneFlash', icon: 'FLS', label: 'Flash' },
                        { key: 'hitEffects', icon: 'HIT', label: 'Hit FX' }
                        ].map(e => React.createElement('div', {
                            key: e.key,
                            className: `effect-toggle ${settings.effects?.[e.key] !== false ? 'active' : ''}`,
                            onClick: () => onSettingChange('effects', { ...settings.effects, [e.key]: settings.effects?.[e.key] === false })
                        },
                            React.createElement('span', { className: 'effect-icon' }, e.icon),
                            React.createElement('span', { className: 'effect-label' }, e.label)
                        ))
                    )
                ),
                // Audio Offset - NEW
                React.createElement('div', { className: 'setting-card' },
                    React.createElement('div', { className: 'setting-title' }, 'AUDIO OFFSET'),
                    React.createElement('div', { className: 'speed-control' },
                        React.createElement('button', { className: 'speed-btn', onClick: () => onSettingChange('offset', (settings.offset || 0) - 10) }, '−'),
                        React.createElement('div', { style: { fontSize: '16px', fontWeight: '700', minWidth: '60px', textAlign: 'center' } },
                            `${settings.offset || 0}ms`
                        ),
                        React.createElement('button', { className: 'speed-btn', onClick: () => onSettingChange('offset', (settings.offset || 0) + 10) }, '+')
                    ),
                    React.createElement('div', { style: { fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '8px', textAlign: 'center' } },
                        'Adjust if notes feel early/late'
                    )
                ),
                // BG Visualizer
                React.createElement('div', { className: 'setting-card' },
                    React.createElement('div', { className: 'setting-title' }, 'BACKGROUND'),
                    React.createElement('div', { className: 'setting-options' },
                        React.createElement('button', {
                            className: `setting-btn ${settings.backgroundVisualizer !== false ? 'active' : ''}`,
                            onClick: () => onSettingChange('backgroundVisualizer', !settings.backgroundVisualizer)
                        }, settings.backgroundVisualizer !== false ? 'Visualizer ON' : 'Visualizer OFF')
                    )
                ),
                // Key Display
                React.createElement('div', { className: 'setting-card full-width' },
                    React.createElement('div', { className: 'setting-title' }, `${settings.keyMode}K KEY LAYOUT`),
                    React.createElement('div', { className: 'key-display' },
                        (settings.customKeys?.[settings.keyMode] || KEY_CONFIGS[settings.keyMode].keys).map((key, i) =>
                            React.createElement('div', { key: i, className: 'key-item', style: { background: colors[i] } }, key)
                        )
                    )
                )
            )
        );
    }

    // ====== STATISTICS PANEL ======
    function StatsPanel() {
        const stats = useMemo(() => getGameStats(), []);
        return React.createElement('div', { className: 'content-panel stats-screen' },
            React.createElement('div', { className: 'stats-overview' },
                [{ label: 'TOTAL PLAYS', value: stats.totalPlays },
                { label: 'TOTAL SCORE', value: stats.totalScore.toLocaleString() },
                { label: 'AVG ACCURACY', value: `${stats.avgAccuracy}%` },
                { label: 'BEST COMBO', value: stats.bestCombo }
                ].map((s, i) => React.createElement('div', { key: i, className: 'stat-card' },
                    React.createElement('div', { className: 'stat-card-value' }, s.value),
                    React.createElement('div', { className: 'stat-card-label' }, s.label)
                ))
            ),
            React.createElement('div', { className: 'recent-plays glass-panel' },
                React.createElement('div', { className: 'recent-plays-title' }, 'RECENT PLAYS'),
                stats.plays.length === 0
                    ? React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.4)' } }, 'No plays yet')
                    : stats.plays.slice(0, 8).map((p, i) => React.createElement('div', { key: i, className: 'play-item' },
                        React.createElement('div', { className: 'play-rank', style: { background: getRankFromAccuracy(parseFloat(p.accuracy)).color, color: '#000' } }, p.rank),
                        React.createElement('div', { className: 'play-info' },
                            React.createElement('div', { className: 'play-track' }, p.track),
                            React.createElement('div', { className: 'play-meta' }, `${p.artist} • ${p.difficulty} • ${p.accuracy}%`)
                        ),
                        React.createElement('div', { className: 'play-score' }, p.score.toLocaleString())
                    ))
            )
        );
    }

    // ====== TITLE SCREEN COMPONENT (Refactored) ======
    function TitleScreen({ trackInfo, onSelectDifficulty, settings, onSettingChange }) {
        const [activeTab, setActiveTab] = useState('play');
        const [selectedDiff, setSelectedDiff] = useState(2);
        const [highScore, setHighScore] = useState(null);

        const trackId = useMemo(() => {
            if (!trackInfo?.uri) return null;
            try { return Spicetify.URI.fromString(trackInfo.uri).id; } catch { return null; }
        }, [trackInfo]);

        useEffect(() => {
            if (trackId) setHighScore(getHighScore(trackId, DIFFICULTIES[selectedDiff]?.name));
            else setHighScore(null);
        }, [trackId, selectedDiff]);

        useEffect(() => {
            if (activeTab !== 'play') return;
            let lastPlay = Spicetify.Player.isPlaying();
            const check = () => {
                const nowPlay = Spicetify.Player.isPlaying();
                if (nowPlay && !lastPlay) {
                    Spicetify.Player.pause();
                    Spicetify.Player.seek(0);
                    setTimeout(() => onSelectDifficulty(DIFFICULTIES[selectedDiff]), 100);
                }
                lastPlay = nowPlay;
            };
            const iv = setInterval(check, 50);
            return () => clearInterval(iv);
        }, [selectedDiff, onSelectDifficulty, activeTab]);

        const albumArt = trackInfo?.album?.images?.[0]?.url || '';

        // SVG Animated Decorations
        const WaveformSVG = () => React.createElement('div', { className: 'waveform' },
            [1, 2, 3, 4, 5].map(i => React.createElement('div', { key: i, className: 'bar' }))
        );

        const OrbitSVG = () => React.createElement('div', {
            className: 'orbit-container',
            style: { position: 'absolute', right: '10%', top: '20%', opacity: 0.3, pointerEvents: 'none' }
        },
            React.createElement('div', { className: 'orbit-ring' }),
            React.createElement('div', { className: 'orbit-dot' })
        );

        const DotGridSVG = () => React.createElement('div', {
            className: 'dot-grid',
            style: { left: '5%', bottom: '15%' }
        },
            Array(15).fill(0).map((_, i) => React.createElement('div', { key: i, className: 'dot' }))
        );

        return React.createElement('div', { className: 'title-container' },
            // SVG Decorations
            React.createElement(OrbitSVG),
            React.createElement(DotGridSVG),

            React.createElement('div', { className: 'title-header' },
                React.createElement('h1', { className: 'title-logo' }, 'RHYTHM BEAT'),
                React.createElement('div', { className: 'title-subtitle' }, 'AURORA EDITION'),
                React.createElement('div', { style: { marginTop: '16px', display: 'flex', justifyContent: 'center' } },
                    React.createElement(WaveformSVG)
                )
            ),

            trackInfo && React.createElement('div', { className: 'glass-panel track-card' },
                albumArt && React.createElement('img', { src: albumArt, className: 'track-card-art' }),
                React.createElement('div', { className: 'track-card-info' },
                    React.createElement('div', { className: 'track-card-title' }, trackInfo.name),
                    React.createElement('div', { className: 'track-card-artist' }, trackInfo.artists?.map(a => a.name).join(', '))
                )
            ),

            React.createElement('div', { className: 'nav-tabs' },
                ['play', 'settings', 'stats'].map(tab =>
                    React.createElement('button', {
                        key: tab, className: `nav-tab ${activeTab === tab ? 'active' : ''}`,
                        onClick: () => setActiveTab(tab)
                    }, tab === 'play' ? 'PLAY' : tab === 'settings' ? 'SETTINGS' : 'STATS')
                )
            ),

            activeTab === 'play' && React.createElement('div', { className: 'content-panel' },
                React.createElement('div', { className: 'difficulty-grid' },
                    DIFFICULTIES.map((diff, i) => React.createElement('div', {
                        key: diff.stars,
                        className: `diff-card ${i === selectedDiff ? 'selected' : ''}`,
                        style: { color: i === selectedDiff ? '#000' : diff.color, borderColor: i === selectedDiff ? '#fff' : `${diff.color}40` },
                        onClick: () => setSelectedDiff(i)
                    },
                        React.createElement('span', { className: 'diff-name' }, diff.name),
                        React.createElement('span', { className: 'diff-stars' }, '★'.repeat(diff.stars))
                    ))
                ),
                highScore && React.createElement('div', { className: 'high-score-bar' },
                    [{ l: 'BEST RANK', v: highScore.rank, c: getRankFromAccuracy(parseFloat(highScore.accuracy)).color },
                    { l: 'HIGH SCORE', v: highScore.score.toLocaleString() },
                    { l: 'ACCURACY', v: `${highScore.accuracy}%` }
                    ].map((h, i) => React.createElement('div', { key: i, className: 'hs-item' },
                        React.createElement('div', { className: 'hs-label' }, h.l),
                        React.createElement('div', { className: 'hs-value', style: h.c ? { color: h.c } : {} }, h.v)
                    )),
                    highScore.isFullCombo && React.createElement('div', { className: 'hs-item' },
                        React.createElement('div', { style: { color: '#00D4AA', fontWeight: '600', letterSpacing: '2px' } }, 'FC')
                    )
                ),
                React.createElement('button', { className: 'start-button', onClick: () => onSelectDifficulty(DIFFICULTIES[selectedDiff]) }, 'START GAME (SPACE)')
            ),

            activeTab === 'settings' && React.createElement(SettingsPanel, { settings, onSettingChange }),
            activeTab === 'stats' && React.createElement(StatsPanel)
        );
    }

    // ====== RESULT SCREEN COMPONENT (Refactored) ======
    function ResultScreen({ result, difficulty, onRestart, isNewHighScore }) {
        const getRank = (accuracy) => {
            if (accuracy >= 98) return { rank: 'S+', color: '#00D4AA' };
            if (accuracy >= 95) return { rank: 'S', color: '#00D4AA' };
            if (accuracy >= 90) return { rank: 'A', color: '#00B4FF' };
            if (accuracy >= 80) return { rank: 'B', color: '#00B4FF' };
            if (accuracy >= 70) return { rank: 'C', color: '#FFB800' };
            return { rank: 'D', color: '#FF3366' };
        };

        // Detect Spotify play state change for restart
        useEffect(() => {
            let lastPlayState = Spicetify.Player.isPlaying();

            const handlePlayStateChange = () => {
                const isNowPlaying = Spicetify.Player.isPlaying();

                if (isNowPlaying && !lastPlayState) {
                    // User pressed space and Spotify started playing
                    // Quickly pause and restart
                    Spicetify.Player.pause();
                    Spicetify.Player.seek(0);

                    setTimeout(() => {
                        onRestart();
                    }, 100);
                }

                lastPlayState = isNowPlaying;
            };

            const interval = setInterval(handlePlayStateChange, 50);
            return () => clearInterval(interval);
        }, [onRestart]);

        const rankInfo = result.isDead ? { rank: 'FAIL', color: '#666' } : getRank(parseFloat(result.accuracy));

        return React.createElement('div', { className: 'result-container' },
            result.isDead && React.createElement('div', {
                style: {
                    position: 'absolute', top: '20%', left: '50%', transform: 'translate(-50%, -50%)',
                    fontSize: '80px', fontWeight: '300', color: '#FF3366', textShadow: '0 0 50px rgba(255, 51, 102, 0.5)', letterSpacing: '0.1em',
                    zIndex: 100, pointerEvents: 'none'
                }
            }, 'GAME OVER'),
            React.createElement('div', { className: 'result-card', style: { borderColor: rankInfo.color, boxShadow: `0 0 50px ${rankInfo.color}20`, opacity: result.isDead ? 0.7 : 1 } },
                // New High Score Banner
                isNewHighScore && React.createElement('div', {
                    style: {
                        background: '#00D4AA',
                        color: '#000',
                        padding: '10px 30px',
                        borderRadius: '20px',
                        fontWeight: '800',
                        fontSize: '16px',
                        marginBottom: '20px',
                        animation: 'pulse-button 1.5s infinite',
                        letterSpacing: '2px'
                    }
                }, 'NEW HIGH SCORE!'),
                React.createElement('div', {
                    className: 'difficulty-badge',
                    style: { background: 'rgba(255,255,255,0.1)', marginBottom: '20px', display: 'inline-flex', padding: '8px 16px', borderRadius: '20px', color: difficulty.color }
                }, `${difficulty.name} ${'★'.repeat(difficulty.stars)}`),

                React.createElement('div', {
                    className: 'score-display',
                    style: { fontSize: '100px', lineHeight: 1, marginBottom: '10px', color: rankInfo.color, background: 'none', WebkitTextFillColor: rankInfo.color, textShadow: `0 0 30px ${rankInfo.color}60` }
                }, rankInfo.rank),

                React.createElement('div', { className: 'score-display', style: { marginBottom: '30px' } },
                    result.score.toLocaleString()
                ),

                React.createElement('div', { className: 'glass-panel', style: { padding: '20px', marginBottom: '30px', background: 'rgba(0,0,0,0.2)' } },
                    ['PERFECT', 'GREAT', 'GOOD', 'MISS'].map(j =>
                        React.createElement('div', { key: j, className: 'judgement-row' },
                            React.createElement('span', { className: `judgement-label judgement-${j.toLowerCase()}` }, j),
                            React.createElement('span', { className: 'judgement-value' }, result.judgements[j])
                        )
                    )
                ),

                result.isFullCombo && React.createElement('div', { className: 'full-combo-text' }, 'FULL COMBO!'),

                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '30px', padding: '0 20px' } },
                    React.createElement('div', { style: { textAlign: 'center' } },
                        React.createElement('div', { style: { fontSize: '11px', color: '#aaa', letterSpacing: '1px' } }, 'MAX COMBO'),
                        React.createElement('div', { style: { fontSize: '20px', fontWeight: '700' } }, result.maxCombo)
                    ),
                    React.createElement('div', { style: { textAlign: 'center' } },
                        React.createElement('div', { style: { fontSize: '11px', color: '#aaa', letterSpacing: '1px' } }, 'ACCURACY'),
                        React.createElement('div', { style: { fontSize: '20px', fontWeight: '700' } }, `${result.accuracy}%`)
                    )
                ),

                React.createElement('button', {
                    className: 'start-button',
                    onClick: onRestart,
                    style: { padding: '16px 40px', fontSize: '16px' }
                }, 'PLAY AGAIN (SPACE)')
            )
        );
    }

    // ====== MAIN APP COMPONENT ======
    function App() {
        const [gamePhase, setGamePhase] = useState('title'); // 'title', 'playing', 'result'
        const [audioAnalysis, setAudioAnalysis] = useState(null);
        const [selectedDifficulty, setSelectedDifficulty] = useState(null);
        const [gameResult, setGameResult] = useState(null);
        const [trackInfo, setTrackInfo] = useState(null);
        const [loading, setLoading] = useState(true);
        const [settings, setSettings] = useState(() => loadSettings());
        const [isNewHighScore, setIsNewHighScore] = useState(false);

        // Load and pause on mount
        useEffect(() => {
            const init = async () => {
                // Pause and seek to start
                Spicetify.Player.pause();
                Spicetify.Player.seek(0);

                const item = Spicetify.Player.data?.item;
                if (item) {
                    setTrackInfo(item);

                    try {
                        const uri = Spicetify.URI.fromString(item.uri);
                        if (uri.type === Spicetify.URI.Type.TRACK) {
                            const url = `https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${uri.id}?format=json`;
                            const analysis = await Spicetify.CosmosAsync.get(url);
                            if (analysis && analysis.beats) {
                                setAudioAnalysis(analysis);
                            }
                        }
                    } catch (e) {
                        console.error('[RhythmGame]', e);
                    }
                }
                setLoading(false);
            };

            init();

            // Handle song change
            const onSongChange = async (e) => {
                if (gamePhase === 'title' && e?.data?.item) {
                    Spicetify.Player.pause();
                    Spicetify.Player.seek(0);
                    setTrackInfo(e.data.item);

                    try {
                        const uri = Spicetify.URI.fromString(e.data.item.uri);
                        if (uri.type === Spicetify.URI.Type.TRACK) {
                            const url = `https://spclient.wg.spotify.com/audio-attributes/v1/audio-analysis/${uri.id}?format=json`;
                            const analysis = await Spicetify.CosmosAsync.get(url);
                            if (analysis && analysis.beats) {
                                setAudioAnalysis(analysis);
                            }
                        }
                    } catch (e) {
                        console.error('[RhythmGame]', e);
                    }
                }
            };

            Spicetify.Player.addEventListener("songchange", onSongChange);
            return () => {
                Spicetify.Player.removeEventListener("songchange", onSongChange);
            };
        }, [gamePhase]);

        const handleSelectDifficulty = (difficulty) => {
            if (!audioAnalysis) {
                Spicetify.showNotification('오디오 분석을 불러올 수 없습니다.', true);
                return;
            }
            Spicetify.Player.seek(0);
            setSelectedDifficulty(difficulty);
            setGamePhase('playing');
        };

        const handleGameEnd = (result) => {
            // Calculate rank before saving
            const accuracy = parseFloat(result.accuracy);
            const rankInfo = result.isDead ? { rank: 'FAIL', color: '#666' } : getRankFromAccuracy(accuracy);
            const resultWithRank = { ...result, rank: rankInfo.rank };

            // Save game stats
            saveGameStats(resultWithRank, trackInfo, selectedDifficulty);

            // Try to save high score
            let isNew = false;
            if (!result.isDead && trackInfo?.uri) {
                try {
                    const uri = Spicetify.URI.fromString(trackInfo.uri);
                    isNew = saveHighScore(uri.id, selectedDifficulty.name, resultWithRank);
                } catch (e) {
                    console.error('[RhythmGame] Failed to save high score:', e);
                }
            }

            setIsNewHighScore(isNew);
            setGameResult(resultWithRank);
            setGamePhase('result');
            Spicetify.Player.pause();
        };

        const handleRestart = () => {
            Spicetify.Player.pause();
            Spicetify.Player.seek(0);
            setGamePhase('title');
            setSelectedDifficulty(null);
            setGameResult(null);
            setIsNewHighScore(false);
        };

        // Quick restart (from pause menu) - restart same song with same difficulty
        const handleQuickRestart = () => {
            Spicetify.Player.pause();
            Spicetify.Player.seek(0);
            setGameResult(null);
            setIsNewHighScore(false);
            // Force re-mount by briefly going to title then back
            setGamePhase('title');
            setTimeout(() => {
                setGamePhase('playing');
            }, 50);
        };

        const handleSettingChange = (key, value) => {
            setSettings(prev => {
                const newSettings = { ...prev, [key]: value };
                saveSettings(newSettings);

                // Show toast notification for important settings
                const toastMessages = {
                    speed: `Speed: ${value}`,
                    offset: `Offset: ${value}ms`,
                    keyMode: `Key Mode: ${value}K`
                };
                if (toastMessages[key] && Spicetify.showNotification) {
                    Spicetify.showNotification(toastMessages[key]);
                }

                return newSettings;
            });
        };

        // Loading screen
        if (loading) {
            return React.createElement('div', { className: 'loading-container' },
                React.createElement('div', {
                    style: {
                        width: '50px', height: '50px',
                        border: '3px solid rgba(255,255,255,0.1)',
                        borderTopColor: '#00D4AA',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }
                })
            );
        }

        // Render based on phase
        if (gamePhase === 'title') {
            return React.createElement(TitleScreen, {
                trackInfo: trackInfo,
                onSelectDifficulty: handleSelectDifficulty,
                settings: settings,
                onSettingChange: handleSettingChange
            });
        }

        if (gamePhase === 'playing') {
            return React.createElement(GameScreen, {
                audioAnalysis: audioAnalysis,
                difficulty: selectedDifficulty,
                trackInfo: trackInfo,
                onGameEnd: handleGameEnd,
                onRestart: handleQuickRestart,
                onQuit: handleRestart,
                settings: settings
            });
        }

        if (gamePhase === 'result') {
            return React.createElement(ResultScreen, {
                result: gameResult,
                difficulty: selectedDifficulty,
                onRestart: handleRestart,
                isNewHighScore: isNewHighScore
            });
        }

        return null;
    }

    return { default: () => React.createElement(App) };
})();

let render = () => visualizer.default();