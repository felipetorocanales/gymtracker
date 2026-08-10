import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, fetchSignInMethodsForEmail, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// TODO: Reemplaza esto con la configuración de tu proyecto en la consola de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDPj5nL-CcszITvXiLokLpuyI7MfSqL9Us",
    authDomain: "gymtracker-b6d6b.firebaseapp.com",
    projectId: "gymtracker-b6d6b",
    storageBucket: "gymtracker-b6d6b.firebasestorage.app",
    messagingSenderId: "935815624128",
    appId: "1:935815624128:web:db59d78e6203bc6b104425",
    measurementId: "G-MN4ED8FDXV"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);



// App State
let currentUserId = null;
let currentSession = {
    date: new Date().toISOString(),
    logs: {} // { "exerciseName": { 1: [ { reps, weight } ], 2: [ ... ] } }
};
let activeExercise = null;
let activeDay = null;
let currentWeek = 1;
let maxWeek = 1;
let volumeChartInstance = null;
let globalChartInstance = null;
let cardioChartInstance = null;
let cardioTimeUnit = 'week';
let currentChartType = 'volume';
let currentTimeUnit = 'week';
let globalTimeUnit = 'week';
let globalDayFilter = new Set(); // empty = all days selected
let isNavigatingFromAI = false;
let lastWeekAnalyzed = null;

// Workout Timer State
let workoutTimerInterval = null;

// DOM Elements
const splashScreen = document.getElementById('splash-screen');
const screenLogin = document.getElementById('screen-login');
const screenHome = document.getElementById('screen-home');
const screenSelectDay = document.getElementById('screen-select-day');
const screenExercises = document.getElementById('screen-exercises');
const screenActiveExercise = document.getElementById('screen-active-exercise');
const screenChart = document.getElementById('screen-chart');

const workoutTimerBar = document.getElementById('workout-timer-bar');
const workoutTimerDisplay = document.getElementById('workout-timer-display');
const btnStopWorkout = document.getElementById('btn-stop-workout');

const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const welcomeMsg = document.getElementById('welcome-msg');
const btnStartDay = document.getElementById('btn-start-day');
const btnBackHome = document.getElementById('btn-back-home');
const btnBackDays = document.getElementById('btn-back-days');
const btnBackExercises = document.getElementById('btn-back-exercises');
const btnSaveSet = document.getElementById('btn-save-set');
const btnShowChart = document.getElementById('btn-show-chart');
const btnBackActiveExercise = document.getElementById('btn-back-active-exercise');
const noChartDataMsg = document.getElementById('no-chart-data-msg');
const btnTabVolume = document.getElementById('btn-tab-volume');
const btnTab1rm = document.getElementById('btn-tab-1rm');
const btnTabWeek = document.getElementById('btn-tab-week');
const btnTabMonth = document.getElementById('btn-tab-month');
const btnGlobalWeek = document.getElementById('btn-global-week');
const btnGlobalMonth = document.getElementById('btn-global-month');
const globalChartTitle = document.getElementById('global-chart-title');
const btnCardioWeek = document.getElementById('btn-cardio-week');
const btnCardioMonth = document.getElementById('btn-cardio-month');
const aiModalOverlay = document.getElementById('ai-modal-overlay');
const aiAnalysisContent = document.getElementById('ai-analysis-content');
const btnCloseAi = document.getElementById('btn-close-ai');

const inputEmail = document.getElementById('input-email');
const dayListContainer = document.getElementById('day-list');
const btnAddDay = document.getElementById('btn-add-day');
const btnAddExercise = document.getElementById('btn-add-exercise');
const exerciseListContainer = document.getElementById('exercise-list');
const currentDayTitleEl = document.getElementById('current-day-title');
const currentExerciseNameEl = document.getElementById('current-exercise-name');
const btnEditDesc = document.getElementById('btn-edit-desc');
const descTrabajoEl = document.getElementById('desc-trabajo');
const descIntensidadEl = document.getElementById('desc-intensidad');
const inputWeight = document.getElementById('input-weight');
const inputReps = document.getElementById('input-reps');
const setsListEl = document.getElementById('sets-list');

// Setup editable exercise name
currentExerciseNameEl.contentEditable = "true";
currentExerciseNameEl.style.outline = "none";
currentExerciseNameEl.style.borderBottom = "1px dashed rgba(255,255,255,0.3)";
currentExerciseNameEl.style.display = "inline-block";
currentExerciseNameEl.addEventListener('blur', async () => {
    const newName = currentExerciseNameEl.textContent.trim();
    if (newName && newName !== activeExercise) {
        await renameExercise(activeExercise, newName);
    } else {
        currentExerciseNameEl.textContent = activeExercise;
    }
});
currentExerciseNameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        currentExerciseNameEl.blur();
    }
});

// Week Navigation Elements
const btnPrevWeek = document.getElementById('btn-prev-week');
const btnNextWeek = document.getElementById('btn-next-week');
const btnAddWeek = document.getElementById('btn-add-week');
const currentWeekLabel = document.getElementById('current-week-label');
const consistencyContainer = document.getElementById('consistency-tracker');

// Toast notification system
const toastEl = document.getElementById('toast');
let toastTimeout = null;

function showToast(message, type = 'info') {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastEl.textContent = message;
    toastEl.className = `toast toast-${type} toast-show`;
    toastTimeout = setTimeout(() => {
        toastEl.classList.remove('toast-show');
    }, 2000);
}

function normalizeText(text) {
    if (!text) return '';
    return text.toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function stripDayPrefix(dayName) {
    if (typeof dayName !== 'string') return dayName;
    // Matches "Día 1: Pecho", "Día 1 Pecho", "Dia 1: Pecho", etc.
    return dayName.replace(/^(D[ií]a\s*\d+[:\s-]*)/i, '').trim();
}

// Custom Modal Prompt system
const modalOverlay = document.getElementById('modal-overlay');
const modalLabel = document.getElementById('modal-label');
const modalInput = document.getElementById('modal-input');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');

function showModal(label, placeholder = '', type = 'text') {
    return new Promise((resolve) => {
        modalLabel.innerHTML = label; // Support HTML
        modalInput.style.display = 'block'; // Ensure input is visible
        modalInput.type = type;
        modalInput.placeholder = placeholder;
        modalInput.value = '';
        modalOverlay.classList.remove('hidden');
        setTimeout(() => modalInput.focus(), 100);

        function onConfirm() {
            cleanup();
            resolve(modalInput.value.trim() || null);
        }

        function onCancel() {
            cleanup();
            resolve(null);
        }

        function onKeydown(e) {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
        }

        function cleanup() {
            modalOverlay.classList.add('hidden');
            modalInput.type = 'text'; // Reset type to default
            modalConfirm.removeEventListener('click', onConfirm);
            modalCancel.removeEventListener('click', onCancel);
            modalOverlay.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeydown);
        }

        function onOverlayClick(e) {
            if (e.target === modalOverlay) onCancel();
        }

        modalConfirm.addEventListener('click', onConfirm);
        modalCancel.addEventListener('click', onCancel);
        modalOverlay.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeydown);
    });
}

function showConfirm(labelHtml, confirmLabel = 'Eliminar', confirmColor = '#ef4444') {
    return new Promise((resolve) => {
        modalLabel.innerHTML = labelHtml;
        modalInput.style.display = 'none'; // Hide input for purely confirm dialogs
        modalOverlay.classList.remove('hidden');

        // Style the confirm button
        const originalBg = modalConfirm.style.background;
        modalConfirm.style.background = confirmColor;
        modalConfirm.textContent = confirmLabel;

        function onConfirm() {
            cleanup();
            resolve(true);
        }

        function onCancel() {
            cleanup();
            resolve(false);
        }

        function onKeydown(e) {
            if (e.key === 'Enter') onConfirm();
            if (e.key === 'Escape') onCancel();
        }

        function cleanup() {
            modalOverlay.classList.add('hidden');
            modalInput.style.display = ''; // Reset display style
            modalConfirm.style.background = originalBg; // Reset color
            modalConfirm.textContent = 'Confirmar'; // Reset text
            modalConfirm.removeEventListener('click', onConfirm);
            modalCancel.removeEventListener('click', onCancel);
            modalOverlay.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeydown);
        }

        function onOverlayClick(e) {
            if (e.target === modalOverlay) onCancel();
        }

        modalConfirm.addEventListener('click', onConfirm);
        modalCancel.addEventListener('click', onCancel);
        modalOverlay.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeydown);
    });
}

// Workout Timer Logic
function startRestTimer(startTimeMs = Date.now()) {
    if (workoutTimerInterval) clearInterval(workoutTimerInterval);

    localStorage.setItem('rest_start_time', startTimeMs.toString());
    if (workoutTimerBar) workoutTimerBar.classList.remove('hidden');
    
    const label = document.querySelector('.timer-label');
    if (label) label.textContent = 'Descanso';

    const updateDisplay = () => {
        const start = parseInt(localStorage.getItem('rest_start_time') || Date.now());
        const elapsedSec = Math.floor((Date.now() - start) / 1000);
        if (elapsedSec >= 600) { // 10 minutos
            if (workoutTimerDisplay) {
                workoutTimerDisplay.textContent = '00:10:00';
            }
            if (workoutTimerInterval) {
                clearInterval(workoutTimerInterval);
                workoutTimerInterval = null;
                
                // Alerta de vibración (soportada en la mayoría de los dispositivos Android)
                if ("vibrate" in navigator) {
                    navigator.vibrate([500, 200, 500, 200, 800]);
                }
            }
        } else {
            if (workoutTimerDisplay) {
                workoutTimerDisplay.textContent = fmtHMS(elapsedSec);
            }
        }
    };

    updateDisplay();
    workoutTimerInterval = setInterval(updateDisplay, 1000);
}

function startWorkoutTimer() {
    if (!localStorage.getItem('workout_start_time')) {
        localStorage.setItem('workout_start_time', Date.now().toString());
    }
    
    localStorage.removeItem('rest_start_time');
    if (workoutTimerInterval) {
        clearInterval(workoutTimerInterval);
        workoutTimerInterval = null;
    }
    
    if (workoutTimerBar) workoutTimerBar.classList.remove('hidden');
    const label = document.querySelector('.timer-label');
    if (label) label.textContent = 'Entrenamiento Activo';
    if (workoutTimerDisplay) workoutTimerDisplay.textContent = '00:00:00';
}

function restoreWorkoutTimer() {
    const savedStart = localStorage.getItem('workout_start_time');
    if (savedStart) {
        if (workoutTimerBar) workoutTimerBar.classList.remove('hidden');
        
        const restStart = localStorage.getItem('rest_start_time');
        if (restStart) {
            startRestTimer(parseInt(restStart));
        } else {
            const label = document.querySelector('.timer-label');
            if (label) label.textContent = 'Entrenamiento Activo';
            if (workoutTimerDisplay) workoutTimerDisplay.textContent = '00:00:00';
        }
    } else {
        if (workoutTimerBar) workoutTimerBar.classList.add('hidden');
    }
}

async function stopWorkoutTimer() {
    const savedStart = localStorage.getItem('workout_start_time');
    let durationStr = '00:00:00';
    if (savedStart) {
        const elapsedSec = Math.floor((Date.now() - parseInt(savedStart)) / 1000);
        durationStr = fmtHMS(elapsedSec);
    }

    const confirmed = await showConfirm(`¿Deseas finalizar tu sesión de entrenamiento?<br><br><strong>Tiempo transcurrido: ${durationStr}</strong>`, 'Terminar', '#ef4444');
    if (!confirmed) return;

    if (workoutTimerInterval) {
        clearInterval(workoutTimerInterval);
        workoutTimerInterval = null;
    }
    localStorage.removeItem('workout_start_time');
    localStorage.removeItem('rest_start_time');
    if (workoutTimerBar) workoutTimerBar.classList.add('hidden');

    // Registrar fecha de hoy en trainingDates para consistencia
    const today = new Date().toLocaleDateString('sv-SE');
    if (!currentSession.trainingDates) currentSession.trainingDates = [];
    if (!currentSession.trainingDates.includes(today)) {
        currentSession.trainingDates.push(today);
        await syncSessionToFirestore();
    }

    showToast(`🏆 ¡Entrenamiento completado! (${durationStr})`, 'success');
}

// UI Navigation
function showScreen(screen) {
    screenLogin.classList.add('hidden');
    screenHome.classList.add('hidden');
    screenSelectDay.classList.add('hidden');
    screenExercises.classList.add('hidden');
    screenActiveExercise.classList.add('hidden');
    screenChart.classList.add('hidden');
    if (screenRunning) screenRunning.classList.add('hidden');
    if (screenCycling) screenCycling.classList.add('hidden');
    screen.classList.remove('hidden');

    if (screen === screenHome) {
        renderConsistencyTracker();
        renderGlobalDayFilters();
        renderGlobalProgressChart();
        renderCardioChart();
    }
}

// Database sync logic
async function syncSessionToFirestore() {
    if (!currentUserId) return;
    try {
        await setDoc(doc(db, "workouts", currentUserId), currentSession);
    } catch (e) {
        console.error("Error al guardar en Firestore: ", e);
    }
}

// Helper to find the maximum week number based on calendar progression since registration
function calculateMaxWeek() {
    if (!currentSession.registrationDate) return 1;

    const getMonday = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(date.setDate(diff));
        mon.setHours(0, 0, 0, 0);
        return mon;
    };

    const regMon = getMonday(new Date(currentSession.registrationDate));
    const todayMon = getMonday(new Date());

    const diffTime = todayMon - regMon;
    if (diffTime < 0) return 1;

    const weeksDiff = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
    return weeksDiff + 1;
}

function migrateSessionData() {
    let modified = false;

    // 1. Migrate Days from string[] to {id, name}[]
    // Only convert if they're still plain strings (old format).
    // No deduplication — two days can have the same zone name (e.g. two "Tren Superior" days).
    if (currentSession.days && currentSession.days.length > 0) {
        if (typeof currentSession.days[0] === 'string') {
            modified = true;
            currentSession.days = currentSession.days.map(dayStr => ({
                id: dayStr,
                name: stripDayPrefix(dayStr) || dayStr
            }));
        }
    } else if (!currentSession.days) {
        currentSession.days = [];
    }

    // 1b. Day recovery: if exercise maps have keys that are NOT in days[], rebuild them.
    // This recovers days that were lost by a previous buggy deduplication.
    {
        const existingDayIds = new Set((currentSession.days || []).map(d => d.id));
        const orphanKeys = new Set();

        const scanMap = (map) => {
            if (!map) return;
            for (const key of Object.keys(map)) {
                if (!existingDayIds.has(key)) orphanKeys.add(key);
            }
        };

        scanMap(currentSession.customExercises);
        scanMap(currentSession.exerciseOrder);
        scanMap(currentSession.hiddenExercises);

        if (orphanKeys.size > 0) {
            modified = true;
            // Add orphan day keys back, ordered naturally by their prefix number
            const recovered = Array.from(orphanKeys).sort().map(key => ({
                id: key,
                name: stripDayPrefix(key) || key
            }));
            currentSession.days = [...(currentSession.days || []), ...recovered];
        }
    }

    // 2. Migrate Exercises (Logs and custom config)
    const exMap = {};
    const logKeys = Object.keys(currentSession.logs || {});

    // Map log keys to their canonical (first seen) version
    logKeys.forEach(exKey => {
        const norm = normalizeText(exKey);
        let canonical;
        if (!exMap[norm]) {
            exMap[norm] = exKey;
            canonical = exKey;
        } else {
            canonical = exMap[norm];
        }

        if (canonical && canonical !== exKey) {
            modified = true;
            if (!currentSession.logs[canonical]) currentSession.logs[canonical] = {};

            const sourceWeeks = currentSession.logs[exKey];
            for (const week in sourceWeeks) {
                if (!currentSession.logs[canonical][week]) currentSession.logs[canonical][week] = [];
                currentSession.logs[canonical][week].push(...sourceWeeks[week]);
            }
            delete currentSession.logs[exKey];
        } else {
            exMap[norm] = canonical;
        }
    });

    if (currentSession.customDescriptions) {
        Object.keys(currentSession.customDescriptions).forEach(exKey => {
            const norm = normalizeText(exKey);
            const canonical = exMap[norm] || exKey;
            if (canonical !== exKey) {
                modified = true;
                currentSession.customDescriptions[canonical] = currentSession.customDescriptions[exKey];
                delete currentSession.customDescriptions[exKey];
            }
        });
    }

    if (currentSession.customExercises) {
        for (const cat in currentSession.customExercises) {
            const newList = [];
            currentSession.customExercises[cat].forEach(ex => {
                if (!ex) return; // ignore nulls
                const norm = normalizeText(ex);
                const canonical = exMap[norm] || ex;
                if (canonical !== ex) modified = true;
                if (!newList.includes(canonical)) newList.push(canonical);
            });
            currentSession.customExercises[cat] = newList;
        }
    }

    if (currentSession.hiddenExercises) {
        for (const cat in currentSession.hiddenExercises) {
            const newList = [];
            currentSession.hiddenExercises[cat].forEach(ex => {
                if (!ex) return;
                const norm = normalizeText(ex);
                const canonical = exMap[norm] || ex;
                if (canonical !== ex) modified = true;
                if (!newList.includes(canonical)) newList.push(canonical);
            });
            currentSession.hiddenExercises[cat] = newList;
        }
    }

    if (currentSession.exerciseOrder) {
        for (const cat in currentSession.exerciseOrder) {
            const newList = [];
            currentSession.exerciseOrder[cat].forEach(ex => {
                if (!ex) return;
                const norm = normalizeText(ex);
                const canonical = exMap[norm] || ex;
                if (canonical !== ex) modified = true;
                if (!newList.includes(canonical)) newList.push(canonical);
            });
            currentSession.exerciseOrder[cat] = newList;
        }
    }

    // ONE-TIME MIGRATION: Populate customExercises from exerciseOrder for legacy users
    // This runs once per user who started before customExercises was the source of truth.
    if (!currentSession.migratedCustomExercisesFromOrder) {
        if (currentSession.exerciseOrder && currentSession.days) {
            currentSession.days.forEach(day => {
                const dayId = day.id;
                const orderExercises = currentSession.exerciseOrder[dayId] || [];
                if (orderExercises.length > 0) {
                    if (!currentSession.customExercises[dayId]) {
                        currentSession.customExercises[dayId] = [];
                    }
                    orderExercises.forEach(ex => {
                        if (ex && !currentSession.customExercises[dayId].includes(ex)) {
                            currentSession.customExercises[dayId].push(ex);
                            modified = true;
                        }
                    });
                }
            });
        }
        currentSession.migratedCustomExercisesFromOrder = true;
        modified = true;
        console.log('[Migration] customExercises populated from exerciseOrder:', JSON.stringify(currentSession.customExercises));
    }

    return modified;
}

async function loadSessionFromFirestore() {
    if (!currentUserId) return;
    try {
        const docRef = doc(db, "workouts", currentUserId);
        let docSnap = await getDoc(docRef);

        // --- SISTEMA DE MIGRACIÓN: Email a UID ---
        if (!docSnap.exists()) {
            const userEmail = auth.currentUser?.email;
            if (userEmail) {
                const oldDocRef = doc(db, "workouts", userEmail);
                const oldDocSnap = await getDoc(oldDocRef);
                if (oldDocSnap.exists()) {
                    console.log("Migrando datos de sesión desde Email a UID...");
                    const oldData = oldDocSnap.data();
                    await setDoc(docRef, oldData);
                    docSnap = await getDoc(docRef); // Recargar ahora que ya existe el nuevo
                    showToast('Datos recuperados correctamente', 'success');
                }
            }
        }
        // -----------------------------------------

        if (docSnap.exists()) {
            currentSession = docSnap.data();
            // Asegurarse de que logs y days existen
            if (!currentSession.logs) currentSession.logs = {};
            if (!currentSession.customExercises) currentSession.customExercises = {};
            if (!currentSession.customDescriptions) currentSession.customDescriptions = {};
            if (!currentSession.trainingDates) currentSession.trainingDates = [];
            if (!currentSession.sessionDates) currentSession.sessionDates = {}; // { dayId: { week: 'YYYY-MM-DD' } }
            if (!currentSession.registrationDate) {
                currentSession.registrationDate = currentSession.date || new Date().toISOString();
            }

            // Sync currentWeek and maxWeek with LOADED data
            maxWeek = calculateMaxWeek();
            currentWeek = maxWeek;

            // Automatically fix case-sensitivity duplicated data
            const wasModified = migrateSessionData();

            if (wasModified) {
                // Background save the migrated structure back to firestore
                syncSessionToFirestore();
            }
        } else {
            // New user, save default structure
            currentSession = {
                date: new Date().toISOString(),
                registrationDate: new Date().toISOString(),
                logs: {},
                customExercises: {},
                customDescriptions: {},
                trainingDates: [],
                sessionDates: {}, // { dayId: { week: 'YYYY-MM-DD' } }
                days: []
            };
            maxWeek = 1;
            currentWeek = 1;
            await syncSessionToFirestore();
        }
    } catch (e) {
        console.error("Error al cargar desde Firestore: ", e);
    }
}

function renderConsistencyTracker() {
    if (!consistencyContainer) return;
    consistencyContainer.innerHTML = '';

    const trainingDates = currentSession.trainingDates || [];
    const goalPerWeek = currentSession.days ? currentSession.days.length : 3;

    // Helper: Get Monday of the week for a given date
    const getMonday = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(date.setDate(diff));
        mon.setHours(0, 0, 0, 0);
        return mon;
    };

    const today = new Date();
    const currentMonday = getMonday(today);

    // Identify current displayed max week (either global or from dates)
    const effectiveMaxWeek = Math.max(currentWeek, maxWeek);

    // Calculate Streak (Weekly)
    let streakWeeks = 0;
    let weekToStartChecking = effectiveMaxWeek;

    while (weekToStartChecking >= 1) {
        // Correct check for week N:
        // Use trainingDates if they fall in the range for weekly index N
        // Since we don't have perfect mapping for past weeks without dates,
        // if trainingDates are missing for a historical week index, check logs.

        let metGoal = false;

        // 1. Check if ANY exercise has logs for this week index
        let exercisesInWeek = 0;
        Object.values(currentSession.logs).forEach(exLogs => {
            if (exLogs[weekToStartChecking] && exLogs[weekToStartChecking].length > 0) {
                exercisesInWeek++;
            }
        });

        // If exercises found > 0, we can assume goal met or at least effort
        // For simplicity, if they have logs for at least 'goalPerWeek' exercises (approx)
        // or if they used the new trainingDates recently.

        // 2. Check trainingDates for current week range
        const weekMonday = new Date(currentMonday);
        weekMonday.setDate(currentMonday.getDate() - (effectiveMaxWeek - weekToStartChecking) * 7);
        const weekSunday = new Date(weekMonday);
        weekSunday.setDate(weekMonday.getDate() + 6);
        weekSunday.setHours(23, 59, 59, 999);

        const trainedDaysCount = trainingDates.filter(d => {
            const dt = new Date(d + 'T12:00:00');
            return dt >= weekMonday && dt <= weekSunday;
        }).length;

        // Met goal if: new system has enough dates
        if (trainedDaysCount >= goalPerWeek) {
            metGoal = true;
        }

        if (metGoal) {
            streakWeeks++;
            weekToStartChecking--;
        } else {
            // Only break streak if it's not the current week (which is in progress)
            if (weekToStartChecking === effectiveMaxWeek) {
                weekToStartChecking--;
            } else {
                break;
            }
        }
    }

    // Render Weeks
    const dayNamesShort = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const todayStr = today.toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time

    for (let w = effectiveMaxWeek; w >= 1; w--) {
        const weekMonday = new Date(currentMonday);
        weekMonday.setDate(currentMonday.getDate() - (effectiveMaxWeek - w) * 7);

        const isCurrentWeek = w === effectiveMaxWeek;

        // Count training days in this specific week
        const weekSun = new Date(weekMonday);
        weekSun.setDate(weekMonday.getDate() + 6);
        weekSun.setHours(23, 59, 59, 999);

        const trainedDaysInWeek = trainingDates.filter(d => {
            const dt = new Date(d + 'T12:00:00');
            return dt >= weekMonday && dt <= weekSun;
        });

        const displayCount = trainedDaysInWeek.length;
        const isGoalMet = displayCount >= goalPerWeek;

        let gridHtml = '';
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekMonday);
            d.setDate(weekMonday.getDate() + i);
            const dateStr = d.toLocaleDateString('sv-SE');
            const isActive = trainingDates.includes(dateStr);
            const isDayToday = dateStr === todayStr;

            gridHtml += `
                <div class="day-dot-container">
                    <div class="day-dot ${isActive ? 'active' : ''} ${isDayToday ? 'today' : ''}">
                        ${isActive ? '✓' : dayNamesShort[i]}
                    </div>
                </div>
            `;
        }

        const weekCard = document.createElement('div');
        weekCard.className = `week-card ${isCurrentWeek ? '' : 'past-week'}`;
        weekCard.innerHTML = `
            <div class="week-label-main">SEMANA ${w} ${isCurrentWeek ? '(ACTUAL)' : ''}</div>
            <div class="consistency-header">
                <span class="consistency-title">Meta: ${goalPerWeek} días</span>
                ${isCurrentWeek ? `
                    <div class="streak-badge">
                        <span>🔥</span>
                        <span>${streakWeeks} ${streakWeeks === 1 ? 'SEMANA' : 'SEMANAS'}</span>
                    </div>
                ` : ''}
            </div>
            <div class="consistency-grid">
                ${gridHtml}
            </div>
            <p class="consistency-summary">
                ${isGoalMet
                ? `<strong>¡Meta cumplida!</strong> 🏆`
                : `<strong>${displayCount} de ${goalPerWeek}</strong> días entrenados.`}
            </p>
        `;
        consistencyContainer.appendChild(weekCard);
    }
}

function renderDayList() {
    dayListContainer.innerHTML = '';

    if (!currentSession.days || currentSession.days.length === 0) {
        dayListContainer.innerHTML = `
            <div class="empty-state">
                <p>Agrega los días que vas a entrenar para empezar.</p>
            </div>
        `;
        return;
    }

    let draggedDayIndex = null;
    let draggedOverDayIndex = null;

    const applyDayReorder = async () => {
        if (draggedDayIndex === null || draggedOverDayIndex === null || draggedDayIndex === draggedOverDayIndex) {
            draggedDayIndex = null;
            draggedOverDayIndex = null;
            return;
        }
        const itemToMove = currentSession.days.splice(draggedDayIndex, 1)[0];
        currentSession.days.splice(draggedOverDayIndex, 0, itemToMove);

        draggedDayIndex = null;
        draggedOverDayIndex = null;
        renderDayList();
        await syncSessionToFirestore();
    };

    currentSession.days.forEach((dayObj, index) => {
        const dayId = dayObj.id;
        const dayName = dayObj.name;

        // Container
        const container = document.createElement('div');
        container.className = 'list-item-container';

        // Delete Background
        const deleteBg = document.createElement('div');
        deleteBg.className = 'swipe-delete-bg';
        deleteBg.innerHTML = '🗑️';

        // Swipe Content Wrapper
        const swipeContent = document.createElement('div');
        swipeContent.className = 'swipe-content';

        const row = document.createElement('div');
        row.className = 'list-row';
        row.style.width = '100%';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.dataset.index = index;

        // Drag Handle
        let wasDayDragged = false;
        const dragHandle = document.createElement('div');
        dragHandle.innerHTML = '≡';
        dragHandle.style.cursor = 'grab';
        dragHandle.style.color = 'rgba(255,255,255,0.35)';
        dragHandle.style.fontSize = '2rem';
        dragHandle.style.padding = '0.5rem 1.2rem';
        dragHandle.style.userSelect = 'none';
        dragHandle.style.touchAction = 'none';
        dragHandle.draggable = true;

        const btn = document.createElement('button');
        btn.className = 'day-btn';
        btn.style.flexGrow = '1';
        btn.style.textAlign = 'left';
        btn.style.background = 'transparent';
        btn.style.border = 'none';
        btn.style.padding = '1rem';
        btn.innerHTML = `<span style="color:var(--accent); font-weight:800; margin-right:8px;">DÍA ${index + 1}</span> <span>${dayName}</span>`;

        btn.addEventListener('click', () => {
            if (wasDayDragged) {
                wasDayDragged = false;
                return;
            }
            activeDay = dayId;
            currentSession.date = new Date().toISOString();
            renderExerciseList(activeDay);
            showScreen(screenExercises);
        });

        const performDelete = async () => {
            const confirmed = await showConfirm(`¿Estás seguro de que deseas eliminar <strong>"${dayName}"</strong>?<br><br><span style="color:var(--accent); font-size:0.9rem;">⚠️ ADVERTENCIA: Se borrará toda la historia de las series acumulada en este día.</span>`);
            if (!confirmed) {
                swipeContent.style.transform = `translateX(0)`;
                return;
            }

            currentSession.days.splice(index, 1);

            // Clean up dependent data
            if (currentSession.customExercises?.[dayId]) delete currentSession.customExercises[dayId];
            if (currentSession.hiddenExercises?.[dayId]) delete currentSession.hiddenExercises[dayId];
            if (currentSession.exerciseOrder?.[dayId]) delete currentSession.exerciseOrder[dayId];

            renderDayList();
            showToast('🗑 Día eliminado', 'error');
            await syncSessionToFirestore();
        };

        // Swipe events for Day Delete
        let startX = 0;
        let currentX = 0;
        let isSwiping = false;

        swipeContent.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            isSwiping = true;
            startX = e.clientX;
            swipeContent.style.transition = 'none';
        });

        swipeContent.addEventListener('pointermove', (e) => {
            if (!isSwiping) return;
            currentX = e.clientX;
            let diff = Math.max(0, currentX - startX);
            if (diff > 150) diff = 150 + (diff - 150) * 0.2;
            swipeContent.style.transform = `translateX(${diff}px)`;
        });

        const endSwipe = () => {
            if (!isSwiping) return;
            isSwiping = false;
            swipeContent.style.transition = 'transform 0.3s ease-out';
            if (currentX - startX > 120) {
                swipeContent.style.transform = `translateX(100%)`;
                setTimeout(performDelete, 300);
            } else {
                swipeContent.style.transform = `translateX(0)`;
            }
        };

        swipeContent.addEventListener('pointerup', endSwipe);
        swipeContent.addEventListener('pointercancel', endSwipe);
        swipeContent.addEventListener('pointerleave', endSwipe);

        // Smooth Drag and Drop for Days
        let touchStartY = 0;
        let holdTimeout = null;
        let isDraggingTouch = false;
        let ghostEl = null;
        let touchOffsetY = 0;

        const cleanUpDayDrag = () => {
            if (ghostEl) { ghostEl.remove(); ghostEl = null; }
            container.style.opacity = '1';
            dayListContainer.style.overflow = '';
            Array.from(dayListContainer.children).forEach(child => {
                child.style.transform = '';
                child.style.transition = '';
            });
        };

        dragHandle.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;
            touchStartY = e.touches[0].clientY;
            holdTimeout = setTimeout(() => {
                isDraggingTouch = true;
                wasDayDragged = true;
                draggedDayIndex = index;
                if (navigator.vibrate) navigator.vibrate(40);

                const rect = container.getBoundingClientRect();
                touchOffsetY = touchStartY - rect.top;
                ghostEl = container.cloneNode(true);
                ghostEl.style.position = 'fixed';
                ghostEl.style.left = rect.left + 'px';
                ghostEl.style.top = rect.top + 'px';
                ghostEl.style.width = rect.width + 'px';
                ghostEl.style.zIndex = '9999';
                ghostEl.style.opacity = '0.9';
                ghostEl.style.pointerEvents = 'none';
                ghostEl.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
                ghostEl.style.transform = 'scale(1.04)';
                document.body.appendChild(ghostEl);

                container.style.opacity = '0.2';
            }, 100);
        }, { passive: true });

        dragHandle.addEventListener('touchmove', (e) => {
            if (!isDraggingTouch) {
                if (Math.abs(e.touches[0].clientY - touchStartY) > 10) clearTimeout(holdTimeout);
                return;
            }
            e.preventDefault();
            const touchY = e.touches[0].clientY;
            ghostEl.style.top = (touchY - touchOffsetY) + 'px';

            ghostEl.style.display = 'none';
            const element = document.elementFromPoint(e.touches[0].clientX, touchY);
            ghostEl.style.display = '';

            let newOverIndex = draggedOverDayIndex;
            if (element) {
                const targetContainer = element.closest('.list-item-container');
                if (targetContainer && targetContainer !== container) {
                    const rowEl = targetContainer.querySelector('.list-row');
                    if (rowEl) newOverIndex = parseInt(rowEl.dataset.index);
                }
            }

            if (newOverIndex !== draggedOverDayIndex) {
                draggedOverDayIndex = newOverIndex;
                Array.from(dayListContainer.children).forEach((child, i) => {
                    if (i === draggedDayIndex) return;
                    child.style.transition = 'transform 0.18s ease';
                    const childRow = child.querySelector('.list-row');
                    const ci = childRow ? parseInt(childRow.dataset.index) : i;
                    if (draggedDayIndex < draggedOverDayIndex) {
                        child.style.transform = (ci > draggedDayIndex && ci <= draggedOverDayIndex) ? 'translateY(-100%)' : '';
                    } else {
                        child.style.transform = (ci >= draggedOverDayIndex && ci < draggedDayIndex) ? 'translateY(100%)' : '';
                    }
                });
            }
        }, { passive: false });

        dragHandle.addEventListener('touchend', () => {
            clearTimeout(holdTimeout);
            if (!isDraggingTouch) return;
            isDraggingTouch = false;
            cleanUpDayDrag();
            applyDayReorder();
            setTimeout(() => { wasDayDragged = false; }, 100);
        });

        // Mouse Drag (simple reorder logic)
        dragHandle.addEventListener('dragstart', (e) => {
            draggedDayIndex = index;
            container.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = "move";
            const rect = container.getBoundingClientRect();
            e.dataTransfer.setDragImage(container, e.clientX - rect.left, e.clientY - rect.top);
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            draggedOverDayIndex = index;
        });

        row.addEventListener('dragend', () => {
            container.style.opacity = '1';
            applyDayReorder();
        });

        row.appendChild(btn);
        row.appendChild(dragHandle);
        swipeContent.appendChild(row);
        container.appendChild(deleteBg);
        container.appendChild(swipeContent);
        dayListContainer.appendChild(container);
    });
}

// Initialize Exercise List for a specific day
// Initialize Exercise List for a specific day
function renderExerciseList(dayId) {
    exerciseListContainer.innerHTML = '';

    const dayObj = (currentSession.days || []).find(d => d.id === dayId);
    currentDayTitleEl.textContent = dayObj ? dayObj.name : dayId;

    const customExs = currentSession.customExercises[dayId] || [];
    const hiddenExs = currentSession.hiddenExercises?.[dayId] || [];

    // Obtenemos las fechas en las que se ha realizado este día específico
    const datesOfThisDay = currentSession.sessionDates?.[dayId] || [];

    // ⭐ FIX: Recolectar todos los ejercicios: custom + del histórico (logs)
    let allExercises = [...customExs];

    // Agregar ejercicios del historial de logs que no estén ocultos
    for (const exerciseName in currentSession.logs) {
        let belongsToThisDay = false;

        // 1. ¿Está explícitamente en el orden guardado para este día?
        if (currentSession.exerciseOrder?.[dayId]?.includes(exerciseName)) {
            belongsToThisDay = true;
        }

        // 2. ¿Tiene logs en las fechas que corresponden a este día?
        // Solo verificamos si no lo confirmamos en el paso anterior
        if (!belongsToThisDay && datesOfThisDay.length > 0) {
            const exerciseLogs = currentSession.logs[exerciseName] || [];
            // Comprobamos si alguna fecha del log coincide con las fechas del día
            belongsToThisDay = exerciseLogs.some(log => datesOfThisDay.includes(log.date));
        }

        // Solo agregar si pertenece a ESTE día, no está duplicado y no está oculto
        if (belongsToThisDay && !allExercises.includes(exerciseName) && !hiddenExs.includes(exerciseName)) {
            allExercises.push(exerciseName);
        }
    }

    // --- Ordenamiento ---
    if (!currentSession.exerciseOrder) currentSession.exerciseOrder = {};
    if (currentSession.exerciseOrder[dayId]) {
        const orderArray = currentSession.exerciseOrder[dayId];
        allExercises.sort((a, b) => {
            let indexA = orderArray.indexOf(a);
            let indexB = orderArray.indexOf(b);
            if (indexA === -1) indexA = 9999;
            if (indexB === -1) indexB = 9999;
            return indexA - indexB;
        });
    }

    // Actualizar el orden activo
    currentSession.exerciseOrder[dayId] = [...allExercises];

    // --- Renderizado de la UI ---
    if (allExercises.length === 0) {
        exerciseListContainer.innerHTML = `
            <div class="empty-state">
                <p>Agrega los ejercicios que harás este día.</p>
            </div>
        `;
        return;
    }

    // ⭐ El resto del código sigue igual (drag & drop, delete, etc.)
    let draggedItemIndex = null;
    let draggedOverItemIndex = null;

    allExercises.forEach((ex, index) => {
        const isCustom = customExs.includes(ex);

        // [TODO: Mantener todo el resto del código de creación de elementos...]
        // El código de drag, swipe, etc. permanece igual

        // Container
        const container = document.createElement('div');
        container.className = 'list-item-container';

        // Delete Background
        const deleteBg = document.createElement('div');
        deleteBg.className = 'swipe-delete-bg';
        deleteBg.innerHTML = '🗑️';

        // Swipe Content Wrapper
        const swipeContent = document.createElement('div');
        swipeContent.className = 'swipe-content';

        const row = document.createElement('div');
        row.className = 'list-row';
        row.style.width = '100%';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '0';
        row.style.background = 'var(--card-bg)';
        row.style.border = '1px solid var(--glass-border)';
        row.style.borderRadius = '12px';
        row.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        row.dataset.index = index;
        row.draggable = false;

        // Drag Handle
        let wasDragged = false;
        const dragHandle = document.createElement('div');
        dragHandle.innerHTML = '≡';
        dragHandle.style.cursor = 'grab';
        dragHandle.style.color = 'rgba(255,255,255,0.35)';
        dragHandle.style.fontSize = '2rem';
        dragHandle.style.padding = '0.5rem 1rem';
        dragHandle.style.userSelect = 'none';
        dragHandle.style.touchAction = 'none';
        dragHandle.draggable = true;

        const btn = document.createElement('button');
        btn.className = 'exercise-btn';
        btn.style.flexGrow = '1';
        btn.style.textAlign = 'left';
        btn.style.background = 'transparent';
        btn.style.border = 'none';
        btn.style.boxShadow = 'none';
        btn.style.padding = '1rem';
        btn.innerHTML = `<span>${ex}</span>`;
        btn.addEventListener('click', (e) => {
            if (wasDragged) {
                e.preventDefault();
                wasDragged = false;
                return;
            }
            openExercise(ex);
        });

        const performDelete = async () => {
            const confirmed = await showConfirm(`¿Estás seguro de que deseas eliminar <strong>"${ex}"</strong>?<br><br><span style="color:var(--accent); font-size:0.9rem;">⚠️ ADVERTENCIA: Se perderá el acceso rápido a la historia de las series de este ejercicio.</span>`);
            if (!confirmed) {
                swipeContent.style.transform = `translateX(0)`;
                return;
            }

            if (isCustom) {
                const customList = currentSession.customExercises[dayId];
                const customIndex = customList.indexOf(ex);
                if (customIndex > -1) customList.splice(customIndex, 1);
            } else {
                if (!currentSession.hiddenExercises) currentSession.hiddenExercises = {};
                if (!currentSession.hiddenExercises[dayId]) currentSession.hiddenExercises[dayId] = [];
                if (!currentSession.hiddenExercises[dayId].includes(ex)) {
                    currentSession.hiddenExercises[dayId].push(ex);
                }
            }
            const activeOrder = currentSession.exerciseOrder && currentSession.exerciseOrder[dayId];
            if (activeOrder) {
                const orderIdx = activeOrder.indexOf(ex);
                if (orderIdx > -1) activeOrder.splice(orderIdx, 1);
            }

            renderExerciseList(dayId);
            showToast('🗑 Ejercicio eliminado', 'error');
            await syncSessionToFirestore();
        };

        // Swipe events for DELETE
        let startX = 0;
        let currentX = 0;
        let isSwiping = false;

        swipeContent.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            isSwiping = true;
            startX = e.clientX;
            swipeContent.style.transition = 'none';
        });

        swipeContent.addEventListener('pointermove', (e) => {
            if (!isSwiping) return;
            currentX = e.clientX;
            let diff = currentX - startX;
            if (diff < 0) diff = 0;

            if (diff > 150) {
                diff = 150 + (diff - 150) * 0.2;
            }
            swipeContent.style.transform = `translateX(${diff}px)`;
        });

        const endSwipe = () => {
            if (!isSwiping) return;
            isSwiping = false;
            swipeContent.style.transition = 'transform 0.3s ease-out';

            let diff = currentX - startX;
            if (diff > 120) {
                swipeContent.style.transform = `translateX(100%)`;
                setTimeout(performDelete, 300);
            } else {
                swipeContent.style.transform = `translateX(0)`;
            }
        };

        swipeContent.addEventListener('pointerup', endSwipe);
        swipeContent.addEventListener('pointercancel', endSwipe);
        swipeContent.addEventListener('pointerleave', endSwipe);

        // --- Drag and Drop Logic for REORDERING ---

        const applyReorder = async () => {
            if (draggedItemIndex === null || draggedOverItemIndex === null || draggedItemIndex === draggedOverItemIndex) {
                draggedItemIndex = null;
                draggedOverItemIndex = null;
                container.style.opacity = '1';
                Array.from(exerciseListContainer.children).forEach(child => {
                    child.style.transform = '';
                    child.style.transition = '';
                });
                return;
            }
            const list = currentSession.exerciseOrder[dayId];
            const itemToMove = list.splice(draggedItemIndex, 1)[0];
            list.splice(draggedOverItemIndex, 0, itemToMove);

            draggedItemIndex = null;
            draggedOverItemIndex = null;
            renderExerciseList(dayId);
            await syncSessionToFirestore();
        };

        dragHandle.addEventListener('dragstart', (e) => {
            draggedItemIndex = parseInt(row.dataset.index);
            container.style.opacity = '0.5';
            e.dataTransfer.effectAllowed = "move";
            const rect = container.getBoundingClientRect();
            e.dataTransfer.setDragImage(container, e.clientX - rect.left, e.clientY - rect.top);
        });

        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            const tgtIndex = parseInt(row.dataset.index);
            if (tgtIndex !== draggedOverItemIndex) {
                draggedOverItemIndex = tgtIndex;
            }
        });

        row.addEventListener('dragenter', (e) => {
            e.preventDefault();
            container.style.borderTop = draggedItemIndex > parseInt(row.dataset.index) ? '2px solid var(--accent)' : '';
            container.style.borderBottom = draggedItemIndex < parseInt(row.dataset.index) ? '2px solid var(--accent)' : '';
        });

        row.addEventListener('dragleave', () => {
            container.style.borderTop = '';
            container.style.borderBottom = '';
        });

        row.addEventListener('drop', (e) => {
            e.preventDefault();
            container.style.borderTop = '';
            container.style.borderBottom = '';
        });

        row.addEventListener('dragend', () => {
            container.style.opacity = '1';
            Array.from(exerciseListContainer.children).forEach(child => {
                child.style.borderTop = '';
                child.style.borderBottom = '';
            });
            applyReorder();
        });

        let touchStartY = 0;
        let initialIndex = null;
        let holdTimeout = null;
        let isDraggingTouch = false;
        let ghostEl = null;
        let touchOffsetY = 0;

        const cleanUpDrag = () => {
            if (ghostEl) { ghostEl.remove(); ghostEl = null; }
            container.style.opacity = '0.3';
            exerciseListContainer.style.overflow = '';
            Array.from(exerciseListContainer.children).forEach(child => {
                child.style.transform = '';
                child.style.transition = '';
            });
        };

        dragHandle.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return;
            touchStartY = e.touches[0].clientY;
            isDraggingTouch = false;
            wasDragged = false;
            holdTimeout = setTimeout(() => {
                isDraggingTouch = true;
                wasDragged = true;
                initialIndex = parseInt(row.dataset.index);
                draggedItemIndex = initialIndex;
                if (navigator.vibrate) navigator.vibrate(40);

                const rect = container.getBoundingClientRect();
                touchOffsetY = touchStartY - rect.top;
                ghostEl = container.cloneNode(true);
                ghostEl.style.position = 'fixed';
                ghostEl.style.left = rect.left + 'px';
                ghostEl.style.top = rect.top + 'px';
                ghostEl.style.width = rect.width + 'px';
                ghostEl.style.height = rect.height + 'px';
                ghostEl.style.margin = '0';
                ghostEl.style.zIndex = '9999';
                ghostEl.style.opacity = '0.9';
                ghostEl.style.pointerEvents = 'none';
                ghostEl.style.borderRadius = '12px';
                ghostEl.style.boxShadow = '0 8px 32px rgba(0,0,0,0.5)';
                ghostEl.style.transform = 'scale(1.04)';
                ghostEl.style.transition = 'transform 0.1s ease';
                document.body.appendChild(ghostEl);

                container.style.opacity = '0.2';
                exerciseListContainer.style.overflow = 'visible';
            }, 100);
        }, { passive: true });

        dragHandle.addEventListener('touchmove', (e) => {
            if (!isDraggingTouch) {
                const touchY = e.touches[0].clientY;
                if (Math.abs(touchY - touchStartY) > 10) clearTimeout(holdTimeout);
                return;
            }
            e.preventDefault();
            if (draggedItemIndex === null || !ghostEl) return;

            const touchY = e.touches[0].clientY;
            const touchX = e.touches[0].clientX;

            ghostEl.style.top = (touchY - touchOffsetY) + 'px';

            ghostEl.style.display = 'none';
            const element = document.elementFromPoint(touchX, touchY);
            ghostEl.style.display = '';

            let newOverIndex = draggedOverItemIndex;
            if (element) {
                const targetContainer = element.closest('.list-item-container');
                if (targetContainer && targetContainer !== container) {
                    const innerRow = targetContainer.querySelector('.list-row');
                    if (innerRow) newOverIndex = parseInt(innerRow.dataset.index);
                }
            }

            if (newOverIndex !== draggedOverItemIndex) {
                draggedOverItemIndex = newOverIndex;

                Array.from(exerciseListContainer.children).forEach((child, i) => {
                    if (i === draggedItemIndex) return;
                    child.style.transition = 'transform 0.18s ease';
                    if (draggedOverItemIndex !== null) {
                        const childRow = child.querySelector('.list-row');
                        const ci = childRow ? parseInt(childRow.dataset.index) : i;
                        if (draggedItemIndex < draggedOverItemIndex) {
                            if (ci > draggedItemIndex && ci <= draggedOverItemIndex) {
                                child.style.transform = 'translateY(-100%)';
                            } else {
                                child.style.transform = '';
                            }
                        } else {
                            if (ci >= draggedOverItemIndex && ci < draggedItemIndex) {
                                child.style.transform = 'translateY(100%)';
                            } else {
                                child.style.transform = '';
                            }
                        }
                    }
                });
            }
        }, { passive: false });

        dragHandle.addEventListener('touchend', () => {
            clearTimeout(holdTimeout);
            if (!isDraggingTouch) return;
            isDraggingTouch = false;

            cleanUpDrag();
            applyReorder();
            setTimeout(() => { wasDragged = false; }, 100);
        });

        dragHandle.addEventListener('touchcancel', () => {
            clearTimeout(holdTimeout);
            if (isDraggingTouch) {
                isDraggingTouch = false;
                draggedItemIndex = null;
                draggedOverItemIndex = null;
                cleanUpDrag();
                container.style.opacity = '1';
            }
        });

        row.appendChild(btn);
        row.appendChild(dragHandle);

        swipeContent.appendChild(row);
        container.appendChild(deleteBg);
        container.appendChild(swipeContent);
        exerciseListContainer.appendChild(container);
    });
}

function renderWeekNavigation() {
    currentWeekLabel.textContent = `Semana ${currentWeek}`;

    // Disable prev button if on week 1
    btnPrevWeek.style.opacity = currentWeek <= 1 ? "0.3" : "1";
    btnPrevWeek.style.pointerEvents = currentWeek <= 1 ? "none" : "auto";

    // Disable next button if on max week
    btnNextWeek.style.opacity = currentWeek >= maxWeek ? "0.3" : "1";
    btnNextWeek.style.pointerEvents = currentWeek >= maxWeek ? "none" : "auto";

    // Hide inputs for past weeks
    const isPastWeek = currentWeek < maxWeek;
    const inputGroup = document.querySelector('.input-group');
    if (inputGroup) {
        inputGroup.style.display = isPastWeek ? 'none' : 'flex';
    }
    if (btnSaveSet) {
        btnSaveSet.style.display = isPastWeek ? 'none' : 'block';
    }
}

// Logic Functions

// Resolves the canonical log key for an exercise, merging any mismatched case/accent keys on the fly
function resolveLogKey(exerciseName) {
    const normTarget = normalizeText(exerciseName);

    // 1. Check existing log keys (in case it's a custom exercise that already has data)
    for (const logKey in currentSession.logs) {
        if (normalizeText(logKey) === normTarget) return logKey;
    }
    // 2. Fallback to the name as given
    return exerciseName;
}

async function renameExercise(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;

    // 1. Rename in logs
    if (currentSession.logs[oldName]) {
        currentSession.logs[newName] = currentSession.logs[oldName];
        delete currentSession.logs[oldName];
    }

    // 2. Rename in customDescriptions
    if (currentSession.customDescriptions && currentSession.customDescriptions[oldName]) {
        currentSession.customDescriptions[newName] = currentSession.customDescriptions[oldName];
        delete currentSession.customDescriptions[oldName];
    }

    // 3. Rename in Days (customExercises, exerciseOrder)
    if (currentSession.customExercises) {
        for (const day in currentSession.customExercises) {
            const idx = currentSession.customExercises[day].indexOf(oldName);
            if (idx !== -1) currentSession.customExercises[day][idx] = newName;
        }
    }

    if (currentSession.exerciseOrder) {
        for (const day in currentSession.exerciseOrder) {
            const idx = currentSession.exerciseOrder[day].indexOf(oldName);
            if (idx !== -1) currentSession.exerciseOrder[day][idx] = newName;
        }
    }



    activeExercise = newName;
    currentExerciseNameEl.textContent = newName;
    showToast('Nombre actualizado', 'success');
    await syncSessionToFirestore();
}

function openExercise(exerciseName) {
    // Resolve canonical key
    const canonicalName = resolveLogKey(exerciseName);
    activeExercise = canonicalName;
    currentExerciseNameEl.textContent = canonicalName;

    // If the display name differs from canonicalName, merge logs
    if (exerciseName !== canonicalName && currentSession.logs[exerciseName]) {
        if (!currentSession.logs[canonicalName]) currentSession.logs[canonicalName] = {};
        for (const week in currentSession.logs[exerciseName]) {
            if (!currentSession.logs[canonicalName][week]) currentSession.logs[canonicalName][week] = [];
            currentSession.logs[canonicalName][week].push(...currentSession.logs[exerciseName][week]);
        }
        delete currentSession.logs[exerciseName];
        // Background save the merge
        syncSessionToFirestore();
    }

    // Initialize log structure for exercise if new
    if (!currentSession.logs[activeExercise]) {
        currentSession.logs[activeExercise] = { 1: [] };
    }

    // Determine max week globally based on registration date
    maxWeek = calculateMaxWeek();

    // Set currentWeek to maxWeek if we were just opening the exercise, 
    // but don't reset it if the user is already navigating weeks? 
    // Actually, usually when opening an exercise you want to see the latest.
    currentWeek = maxWeek;

    renderWeekNavigation();

    // Set description details, checking custom desc first
    let details = currentSession.customDescriptions[exerciseName];

    if (details) {
        descTrabajoEl.innerText = details.trabajo || "-";
        descIntensidadEl.innerText = details.intensidad || "-";
    } else {
        descTrabajoEl.innerText = "-";
        descIntensidadEl.innerText = "-";
    }

    // Reset edit mode
    descTrabajoEl.contentEditable = "false";
    descIntensidadEl.contentEditable = "false";
    btnEditDesc.textContent = "✎";

    // reset inputs
    inputWeight.value = '';
    inputReps.value = '';

    renderSets();
    renderVolumeChart();
    showScreen(screenActiveExercise);
}

function saveSet() {
    const repsStr = inputReps.value.trim();
    let weightStr = inputWeight.value.trim().replace(',', '.'); // Handle comma as decimal separator

    if (!repsStr || !weightStr) {
        showToast("Por favor ingresa repeticiones y kilos.", "error");
        return;
    }

    const reps = Number(repsStr);
    const weight = Number(weightStr);

    if (isNaN(reps) || !Number.isInteger(reps) || reps <= 0) {
        showToast("Las repeticiones deben ser un número entero mayor a 0.", "error");
        return;
    }

    if (isNaN(weight) || weight < 0) {
        showToast("Por favor ingresa un peso (kilos) válido.", "error");
        return;
    }

    if (!currentSession.logs[activeExercise][currentWeek]) {
        currentSession.logs[activeExercise][currentWeek] = [];
    }

    currentSession.logs[activeExercise][currentWeek].push({ weight, reps });
    renderSets();
    renderVolumeChart();
    showToast(`✅ Serie guardada: ${reps} reps x ${weight} kg`, 'success');

    // Iniciar timer de descanso
    startRestTimer();

    // Determinar si esta es una sesión nueva o una edición de un día ya realizado.
    // Se guarda en sessionDates[dayId][semana] la fecha en que se inició ese día de
    // entrenamiento por primera vez. Si esa fecha es distinta a hoy, el usuario
    // está corrigiendo datos pasados y NO se debe marcar hoy como día entrenado.
    const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD en hora local
    if (!currentSession.sessionDates) currentSession.sessionDates = {};
    if (!currentSession.sessionDates[activeDay]) currentSession.sessionDates[activeDay] = {};

    const weekKey = String(currentWeek);
    const daySessionDate = currentSession.sessionDates[activeDay][weekKey];

    if (!daySessionDate) {
        // Primera vez que se guarda una serie para este día+semana → sesión real, registrar fecha
        currentSession.sessionDates[activeDay][weekKey] = todayStr;
    }

    // Solo marcar hoy en trainingDates si este día+semana fue iniciado HOY.
    // Si fue iniciado en una fecha anterior, es una edición retroactiva.
    const isNewSession = !daySessionDate || daySessionDate === todayStr;
    if (isNewSession) {
        if (!currentSession.trainingDates) currentSession.trainingDates = [];
        if (!currentSession.trainingDates.includes(todayStr)) {
            currentSession.trainingDates.push(todayStr);
        }
    }

    // Save to Firestore
    syncSessionToFirestore();

    // Clear reps for next set, keep weight usually
    inputReps.value = '';
    inputReps.focus();
}

function renderLastSessionStats() {
    const cardEl = document.getElementById('last-session-card');
    const weekEl = document.getElementById('last-session-week');
    const contentEl = document.getElementById('last-session-content');
    if (!cardEl || !weekEl || !contentEl) return;

    if (!activeExercise || !currentSession.logs || !currentSession.logs[activeExercise]) {
        cardEl.style.display = 'none';
        return;
    }

    const exLogs = currentSession.logs[activeExercise];
    let foundWeek = null;
    let foundLogs = [];

    // Buscar la última semana con datos antes de currentWeek
    for (let w = currentWeek - 1; w >= 1; w--) {
        const weekLogs = exLogs[w];
        if (weekLogs && weekLogs.length > 0) {
            foundWeek = w;
            foundLogs = weekLogs;
            break;
        }
    }

    if (foundWeek !== null && foundLogs.length > 0) {
        weekEl.textContent = foundWeek;
        contentEl.innerHTML = '';
        foundLogs.forEach((log, index) => {
            const chip = document.createElement('span');
            chip.className = 'last-session-chip';
            chip.textContent = `S${index + 1}: ${log.reps} x ${log.weight} kg`;
            contentEl.appendChild(chip);
        });
        cardEl.style.display = 'flex';
    } else {
        cardEl.style.display = 'none';
    }
}

function renderSets() {
    renderLastSessionStats();
    setsListEl.innerHTML = '';
    const logs = currentSession.logs[activeExercise][currentWeek] || [];

    if (logs.length === 0) {
        setsListEl.innerHTML = `<li>Aún no hay series en la Semana ${currentWeek}. ¡A darle! 💪</li>`;
        return;
    }

    logs.forEach((log, index) => {
        const li = document.createElement('li');
        li.className = 'list-row';
        const canEdit = currentWeek === maxWeek;
        const deleteBtnHtml = canEdit ? `<button class="delete-set-btn" data-index="${index}" title="Borrar serie">−</button>` : '';
        li.innerHTML = `
            ${deleteBtnHtml}
            <div class="set-item-box">
                <span class="set-label">Serie ${index + 1}</span>
                <span class="set-values">${log.reps} reps x ${log.weight} kg</span>
            </div>
        `;
        setsListEl.appendChild(li);
    });

    // Attach delete listeners
    setsListEl.querySelectorAll('.delete-set-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const i = parseInt(e.currentTarget.getAttribute('data-index'));
            currentSession.logs[activeExercise][currentWeek].splice(i, 1);
            renderSets();
            renderVolumeChart();
            showToast('🗑 Serie eliminada', 'error');
            await syncSessionToFirestore();
        });
    });
}

function renderVolumeChart() {
    const chartContainer = document.getElementById('volume-chart-container');
    const ctx = document.getElementById('volumeChart');
    if (!ctx || !chartContainer) return;

    if (!currentSession.logs[activeExercise]) {
        chartContainer.style.display = 'none';
        if (noChartDataMsg) noChartDataMsg.style.display = 'block';
        return;
    }

    const labels = [];
    const dataPoints = [];

    // Helpers for date/month calculations
    const getMonday = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(date.setDate(diff));
        mon.setHours(0, 0, 0, 0);
        return mon;
    };

    const getMonthLabel = (weekNum) => {
        if (!currentSession.registrationDate) return 'Desconocido';
        const regMon = getMonday(new Date(currentSession.registrationDate));
        const weekMon = new Date(regMon);
        weekMon.setDate(regMon.getDate() + (weekNum - 1) * 7);
        return weekMon.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
    };

    let hasData = false;

    if (currentTimeUnit === 'week') {
        for (let w = 1; w <= maxWeek; w++) {
            labels.push(`Sem ${w}`);
            const logs = currentSession.logs[activeExercise][w] || [];
            let value = 0;

            if (currentChartType === 'volume') {
                logs.forEach(log => {
                    value += (Number(log.reps) * Number(log.weight));
                });
            } else if (currentChartType === '1rm') {
                logs.forEach(log => {
                    const rep = Number(log.reps);
                    const weight = Number(log.weight);
                    if (rep > 0) {
                        const estimated1RM = weight * (1 + (rep / 30));
                        if (estimated1RM > value) {
                            value = estimated1RM;
                        }
                    }
                });
                value = Math.round(value * 10) / 10;
            }

            dataPoints.push(value);
            if (logs.length > 0) hasData = true;
        }
    } else {
        // AGREGACIÓN MENSUAL
        const monthlyData = {}; // { "ene 24": [values] }

        for (let w = 1; w <= maxWeek; w++) {
            const logs = currentSession.logs[activeExercise][w] || [];
            if (logs.length === 0) continue;

            const monthLabel = getMonthLabel(w);
            if (!monthlyData[monthLabel]) monthlyData[monthLabel] = [];

            let weekValue = 0;
            if (currentChartType === 'volume') {
                logs.forEach(log => {
                    weekValue += (Number(log.reps) * Number(log.weight));
                });
                monthlyData[monthLabel].push(weekValue);
            } else if (currentChartType === '1rm') {
                logs.forEach(log => {
                    const rep = Number(log.reps);
                    const weight = Number(log.weight);
                    if (rep > 0) {
                        const estimated1RM = weight * (1 + (rep / 30));
                        if (estimated1RM > weekValue) weekValue = estimated1RM;
                    }
                });
                monthlyData[monthLabel].push(weekValue);
            }
        }

        // Convert monthlyData map to sorted arrays for labels and dataPoints
        // Since monthLabel is like "may 24", we should ideally sort them chronologically.
        // But since we iterate w from 1 to maxWeek, the order in which we see months is already chronological.
        const seenMonths = [];
        for (let w = 1; w <= maxWeek; w++) {
            const monthLabel = getMonthLabel(w);
            if (monthlyData[monthLabel] && !seenMonths.includes(monthLabel)) {
                seenMonths.push(monthLabel);
                labels.push(monthLabel);

                const values = monthlyData[monthLabel];
                if (currentChartType === 'volume') {
                    // SUM of volume for the month
                    const monthSum = values.reduce((a, b) => a + b, 0);
                    dataPoints.push(monthSum);
                } else {
                    // MAX 1RM for the month
                    const monthMax = Math.max(...values);
                    dataPoints.push(Math.round(monthMax * 10) / 10);
                }
                hasData = true;
            }
        }
    }

    if (!hasData) {
        chartContainer.style.display = 'none';
        if (noChartDataMsg) noChartDataMsg.style.display = 'block';
        return;
    }

    chartContainer.style.display = 'block';
    if (noChartDataMsg) noChartDataMsg.style.display = 'none';

    if (volumeChartInstance) {
        volumeChartInstance.destroy();
    }

    // Chart.js default aesthetic adjustments
    Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
    Chart.defaults.font.family = "'Outfit', sans-serif";

    let chartColor = '#3b82f6';
    let chartBgColor = 'rgba(59, 130, 246, 0.2)';
    let chartLabel = 'Volumen (kg)';

    if (currentChartType === '1rm') {
        chartColor = '#8b5cf6'; // Morado
        chartBgColor = 'rgba(139, 92, 246, 0.2)';
        chartLabel = '1RM Estimado (kg)';
    }

    volumeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: chartLabel,
                data: dataPoints,
                borderColor: chartColor,
                backgroundColor: chartBgColor,
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: chartColor,
                pointHoverBackgroundColor: chartColor,
                pointHoverBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4 // Smooth curve
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // We use the container title or keep it clean
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleFont: { size: 13 },
                    bodyFont: { size: 14, weight: 'bold' },
                    padding: 10,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function (context) {
                            return context.parsed.y + ' kg';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false,
                    },
                    border: { display: false }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: false,
                    },
                    border: { display: false }
                }
            }
        }
    });
}

function analyzeGlobalWeek(weekNum) {
    let currentWeekVol = 0;
    const currentWeekData = {};

    Object.entries(currentSession.logs || {}).forEach(([exName, exLogs]) => {
        const weekLogs = exLogs[weekNum] || [];
        let exVol = 0;
        let sets = 0;
        weekLogs.forEach(log => {
            exVol += (Number(log.reps) * Number(log.weight));
            sets++;
        });
        if (exVol > 0) {
            currentWeekData[exName] = { volume: exVol, sets: sets };
            currentWeekVol += exVol;
        }
    });

    let prevWeeksVol = 0;
    let prevWeeksCount = 0;
    const prevWeeksAvgData = {};

    // Analyze up to 3 previous weeks
    for (let w = weekNum - 1; w >= Math.max(1, weekNum - 3); w--) {
        let hasLogs = false;
        Object.entries(currentSession.logs || {}).forEach(([exName, exLogs]) => {
            const weekLogs = exLogs[w] || [];
            let exVol = 0;
            let sets = 0;
            weekLogs.forEach(log => {
                exVol += (Number(log.reps) * Number(log.weight));
                sets++;
            });
            if (exVol > 0) {
                hasLogs = true;
                if (!prevWeeksAvgData[exName]) prevWeeksAvgData[exName] = { volume: 0, sets: 0, count: 0 };
                prevWeeksAvgData[exName].volume += exVol;
                prevWeeksAvgData[exName].sets += sets;
                prevWeeksAvgData[exName].count++;
                prevWeeksVol += exVol;
            }
        });
        if (hasLogs) prevWeeksCount++;
    }

    if (prevWeeksCount === 0) {
        return `No hay suficientes datos históricos previos a la <b>Semana ${weekNum}</b> para realizar una comparación profunda. ¡Sigue entrenando para generar un historial!`;
    }

    const avgPrevVol = prevWeeksVol / prevWeeksCount;
    const diff = currentWeekVol - avgPrevVol;
    const pctDiff = (Math.abs(diff) / avgPrevVol) * 100;
    const isCurrentWeek = weekNum === maxWeek;

    let analysis = `Comparando la <b>Semana ${weekNum}</b> con tu promedio reciente:<br><br>`;

    if (pctDiff <= 5 && !isCurrentWeek) {
        analysis += `Tu carga de trabajo se mantuvo muy estable (variación del ${pctDiff.toFixed(1)}%). ¡Excelente consistencia!`;
    } else if (pctDiff <= 5 && isCurrentWeek) {
        analysis += `¡Excelente! La semana aún no termina y ya alcanzaste tu volumen promedio habitual.`;
    } else if (diff > 0) {
        if (isCurrentWeek) {
            analysis += `¡Increíble! Aún no termina la semana y ya superaste tu promedio histórico en un <b>${pctDiff.toFixed(1)}%</b>.<br>`;
        } else {
            analysis += `¡Gran trabajo! Tu carga subió un <b>${pctDiff.toFixed(1)}%</b>.<br>`;
        }

        // Find what increased
        const increasedEx = [];
        const makeExLink = (name) => `<span class="ai-ex-link" data-ex="${name}" style="color: #60a5fa; text-decoration: underline; cursor: pointer; font-weight: bold;">${name}</span>`;

        Object.keys(currentWeekData).forEach(ex => {
            if (prevWeeksAvgData[ex] && currentWeekData[ex].volume > (prevWeeksAvgData[ex].volume / prevWeeksAvgData[ex].count) * 1.2) {
                increasedEx.push(makeExLink(ex));
            }
        });
        if (increasedEx.length > 0) {
            analysis += `Esto se vio impulsado por mejoras en: <i>${increasedEx.slice(0, 2).join(', ')}</i>.`;
        }
    } else {
        if (isCurrentWeek) {
            const currentPct = ((currentWeekVol / avgPrevVol) * 100).toFixed(1);
            analysis += `Esta semana está <b>en curso</b>. Llevas un <b>${currentPct}%</b> de tu volumen semanal habitual.<br><br>`;
        } else {
            analysis += `Noté una baja del <b>${pctDiff.toFixed(1)}%</b> en tu carga total.<br><br>`;
        }

        const makeExLink = (name) => `<span class="ai-ex-link" data-ex="${name}" style="color: #60a5fa; text-decoration: underline; cursor: pointer; font-weight: bold;">${name}</span>`;

        let missing = [];
        let dropped = [];

        const normalize = str => str.trim().toLowerCase();

        // Build exercise -> dayId map from customExercises (complete after migration)
        // Use day.id as key to distinguish days with same name (e.g. two "Tren Superior" days)
        const exerciseToDayId = {}; // normalized exercise name -> day.id
        if (currentSession.days && currentSession.customExercises) {
            currentSession.days.forEach(day => {
                (currentSession.customExercises[day.id] || []).forEach(ex => {
                    const key = normalize(ex);
                    if (!exerciseToDayId[key]) exerciseToDayId[key] = day.id;
                });
            });
        }

        // Initialize day stats keyed by day.id (unique), store display name separately
        const dayStats = {}; // dayId -> { missing, dropped, expected, displayName }
        if (currentSession.days) {
            currentSession.days.forEach(day => {
                const count = Object.keys(prevWeeksAvgData).filter(ex => exerciseToDayId[normalize(ex)] === day.id).length;
                if (count > 0) {
                    dayStats[day.id] = { missing: [], dropped: [], expected: count, displayName: day.name };
                }
            });
        }

        const findDayObj = (exName) => {
            const dayId = exerciseToDayId[normalize(exName)];
            return dayId && dayStats[dayId] ? dayStats[dayId] : null;
        };

        // Categorize exercises
        Object.keys(prevWeeksAvgData).forEach(ex => {
            const avgSets = Math.round(prevWeeksAvgData[ex].sets / prevWeeksAvgData[ex].count);
            const dObj = findDayObj(ex);

            if (!currentWeekData[ex]) {
                const item = { name: ex, text: `${makeExLink(ex)} (~${avgSets} series)` };
                if (dObj) dObj.missing.push(item);
                else missing.push(item);
            } else if (currentWeekData[ex].sets < avgSets) {
                const item = { name: ex, text: `${makeExLink(ex)} (hiciste ${currentWeekData[ex].sets} de ${avgSets})` };
                if (dObj) dObj.dropped.push(item);
                else dropped.push(item);
            }
        });

        const skippedDays = [];
        const poorDays = [];

        Object.values(dayStats).forEach(stat => {
            const totalMissed = stat.missing.length;
            const totalAffected = stat.missing.length + stat.dropped.length;
            const threshold = Math.max(1, Math.ceil(stat.expected * 0.7));

            if (stat.expected > 0 && totalMissed >= threshold) {
                skippedDays.push(stat.displayName);
            } else if (stat.expected > 0 && totalAffected >= threshold) {
                poorDays.push(stat.displayName);
            } else {
                stat.missing.forEach(m => missing.push(m));
                stat.dropped.forEach(d => dropped.push(d));
            }
        });

        if (skippedDays.length > 0) {
            if (isCurrentWeek) {
                analysis += `Parece que aún te falta entrenar tu(s) rutina(s) de:<br>• <b style="color: #8b5cf6;">${skippedDays.join('</b><br>• <b style="color: #8b5cf6;">')}</b><br><br>`;
            } else {
                analysis += `Detecté que omitiste por completo tu(s) día(s) de:<br>• <b style="color: #8b5cf6;">${skippedDays.join('</b><br>• <b style="color: #8b5cf6;">')}</b><br><br>`;
            }
        }

        if (poorDays.length > 0) {
            analysis += `Noté un bajo rendimiento general (menos series o ejercicios omitidos) en tu(s) día(s) de:<br>• <b style="color: #f59e0b;">${poorDays.join('</b><br>• <b style="color: #f59e0b;">')}</b><br><br>`;
        }

        if (missing.length > 0) {
            const missingTexts = missing.map(m => m.text);
            if (isCurrentWeek) {
                analysis += `Aún tienes pendiente registrar o realizar:<br>• ${missingTexts.slice(0, 4).join('<br>• ')}<br><br>`;
            } else {
                analysis += `También detecté que faltaron ejercicios aislados como:<br>• ${missingTexts.slice(0, 4).join('<br>• ')}<br><br>`;
            }
        }
        if (dropped.length > 0) {
            const droppedTexts = dropped.map(d => d.text);
            if (isCurrentWeek) {
                analysis += `Te faltan algunas series para igualar tu ritmo en:<br>• ${droppedTexts.slice(0, 4).join('<br>• ')}<br>`;
            } else {
                analysis += `Además, bajaste la cantidad de series en:<br>• ${droppedTexts.slice(0, 4).join('<br>• ')}<br>`;
            }
        }
        if (missing.length === 0 && dropped.length === 0) {
            if (isCurrentWeek) {
                analysis += `Has completado todos tus ejercicios, pero el tonelaje es algo menor. ¡Dalo todo en tus próximos entrenamientos!`;
            } else {
                analysis += `Hiciste todas tus series y ejercicios, pero con menos peso o repeticiones en general. Puede que hayas necesitado una semana de descarga (deload).`;
            }
        }
    }

    return analysis;
}

function renderGlobalProgressChart() {
    const container = document.getElementById('global-progress-container');
    const ctx = document.getElementById('globalChart');
    if (!ctx || !container) return;

    const labels = [];
    const dataPoints = [];
    let hasData = false;

    // Helpers for month calculation
    const getMonday = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(date.setDate(diff));
        mon.setHours(0, 0, 0, 0);
        return mon;
    };

    const getMonthLabel = (weekNum) => {
        if (!currentSession.registrationDate) return 'Desc';
        const regMon = getMonday(new Date(currentSession.registrationDate));
        const weekMon = new Date(regMon);
        weekMon.setDate(regMon.getDate() + (weekNum - 1) * 7);
        return weekMon.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
    };

    // Build the set of exercises belonging to the filtered days.
    // If globalDayFilter is empty, include ALL exercises (original behavior).
    let filteredExerciseNames = null; // null = all
    if (globalDayFilter.size > 0) {
        filteredExerciseNames = new Set();
        globalDayFilter.forEach(dayId => {
            const exs = currentSession.customExercises?.[dayId] || [];
            exs.forEach(ex => filteredExerciseNames.add(ex));
        });
    }

    const getExerciseLogs = () => {
        const allLogs = currentSession.logs || {};
        if (!filteredExerciseNames) return Object.values(allLogs);
        return Object.entries(allLogs)
            .filter(([name]) => filteredExerciseNames.has(name))
            .map(([, v]) => v);
    };

    if (globalTimeUnit === 'week') {
        globalChartTitle.textContent = 'Carga Total Semanal (kg)';
        for (let w = 1; w <= maxWeek; w++) {
            labels.push(`Sem ${w}`);
            let weeklyTotal = 0;
            getExerciseLogs().forEach(exLogs => {
                const weekLogs = exLogs[w] || [];
                weekLogs.forEach(log => {
                    weeklyTotal += (Number(log.reps) * Number(log.weight));
                });
            });
            dataPoints.push(weeklyTotal);
            if (weeklyTotal > 0) hasData = true;
        }
    } else {
        globalChartTitle.textContent = 'Carga Total Mensual (kg)';
        const monthlyTotals = {};
        for (let w = 1; w <= maxWeek; w++) {
            let weeklyTotal = 0;
            getExerciseLogs().forEach(exLogs => {
                const weekLogs = exLogs[w] || [];
                weekLogs.forEach(log => {
                    weeklyTotal += (Number(log.reps) * Number(log.weight));
                });
            });
            if (weeklyTotal === 0) continue;
            const monthLabel = getMonthLabel(w);
            monthlyTotals[monthLabel] = (monthlyTotals[monthLabel] || 0) + weeklyTotal;
        }

        // Chronological order based on week discovery
        for (let w = 1; w <= maxWeek; w++) {
            const monthLabel = getMonthLabel(w);
            if (monthlyTotals[monthLabel] !== undefined && !labels.includes(monthLabel)) {
                labels.push(monthLabel);
                dataPoints.push(monthlyTotals[monthLabel]);
                hasData = true;
            }
        }
    }

    if (!hasData) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // ── Calcular Línea de Tendencia (Regresión Lineal Simple: y = m*x + b) ──
    const n = dataPoints.length;
    let trendPoints = [];
    let percentChange = 0;
    let slope = 0;

    if (n >= 2) {
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += dataPoints[i];
            sumXY += i * dataPoints[i];
            sumXX += i * i;
        }
        slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        trendPoints = dataPoints.map((_, i) => Math.max(0, Math.round(slope * i + intercept)));

        // Calcular variación porcentual desde la primera hasta la última sesión del período
        const firstVal = dataPoints[0];
        const lastVal = dataPoints[n - 1];
        if (firstVal > 0) {
            percentChange = Math.round(((lastVal - firstVal) / firstVal) * 100);
        }
    }

    // Actualizar badge de tendencia
    const trendBadge = document.getElementById('global-trend-badge');
    if (trendBadge) {
        if (n >= 2 && percentChange !== 0) {
            trendBadge.style.display = 'inline-block';
            if (percentChange > 0) {
                trendBadge.textContent = `▲ +${percentChange}%`;
                trendBadge.style.background = 'rgba(52, 211, 153, 0.15)';
                trendBadge.style.color = '#34d399';
            } else {
                trendBadge.textContent = `▼ ${percentChange}%`;
                trendBadge.style.background = 'rgba(248, 113, 113, 0.15)';
                trendBadge.style.color = '#f87171';
            }
        } else if (n >= 2 && slope !== 0) {
            trendBadge.style.display = 'inline-block';
            trendBadge.textContent = slope > 0 ? '▲ En ascenso' : '▼ En descenso';
            trendBadge.style.background = slope > 0 ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)';
            trendBadge.style.color = slope > 0 ? '#34d399' : '#f87171';
        } else {
            trendBadge.style.display = 'none';
        }
    }

    if (globalChartInstance) {
        globalChartInstance.destroy();
    }

    // Create Gradient slightly softer
    const context = ctx.getContext('2d');
    const chartGradient = context.createLinearGradient(0, 0, 0, 180);
    chartGradient.addColorStop(0, 'rgba(96, 165, 250, 0.9)'); // Blue top
    chartGradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)'); // Very soft bottom

    const datasets = [
        {
            label: 'Carga Total (kg)',
            data: dataPoints,
            borderColor: '#3b82f6',
            backgroundColor: chartGradient,
            borderWidth: 3,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#3b82f6',
            pointHoverBackgroundColor: '#3b82f6',
            pointHoverBorderColor: '#fff',
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: true,
            tension: 0.4
        }
    ];

    // Si hay 2 o más puntos, agregamos la línea de tendencia punteada
    if (trendPoints.length >= 2) {
        const isUp = slope >= 0;
        datasets.push({
            label: 'Línea de Tendencia',
            data: trendPoints,
            borderColor: isUp ? '#34d399' : '#f87171',
            borderWidth: 2,
            borderDash: [6, 6],
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            tension: 0
        });
    }

    globalChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    left: 5,
                    right: 5,
                    bottom: 5
                }
            },
            onClick: (event, elements, chart) => {
                if (elements.length > 0 && globalTimeUnit === 'week') {
                    const idx = elements[0].index;
                    const rawLabel = chart.data.labels[idx]; // e.g. "Sem 3"
                    const weekNum = parseInt(rawLabel.replace('Sem ', ''));
                    if (!isNaN(weekNum)) {
                        lastWeekAnalyzed = weekNum;
                        const insight = analyzeGlobalWeek(weekNum);
                        aiAnalysisContent.innerHTML = insight;
                        aiModalOverlay.classList.remove('hidden');
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#60a5fa',
                    bodyColor: '#fff',
                    bodyFont: { weight: 'bold' },
                    padding: 12,
                    cornerRadius: 12,
                    callbacks: {
                        label: (context) => {
                            if (context.dataset.label === 'Línea de Tendencia') {
                                return `Tendencia: ${context.parsed.y.toLocaleString()} kg`;
                            }
                            return `${context.parsed.y.toLocaleString()} kg total`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.03)',
                        drawBorder: false
                    },
                    ticks: { display: false }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.3)',
                        font: { size: 10, weight: '600' }
                    }
                }
            }
        }
    });
}

// ── Day-filter pills for the global chart ──────────────────────────────────
function renderGlobalDayFilters() {
    const container = document.getElementById('global-day-filters');
    if (!container) return;
    container.innerHTML = '';

    const days = currentSession.days || [];
    if (days.length === 0) return;

    // "Todos" pill
    const allPill = document.createElement('button');
    allPill.className = 'day-filter-pill' + (globalDayFilter.size === 0 ? ' active' : '');
    allPill.textContent = 'Todos';
    allPill.addEventListener('click', () => {
        globalDayFilter.clear();
        renderGlobalDayFilters();
        renderGlobalProgressChart();
    });
    container.appendChild(allPill);

    // One pill per day
    days.forEach((dayObj, idx) => {
        const pill = document.createElement('button');
        const isActive = globalDayFilter.has(dayObj.id);
        pill.className = 'day-filter-pill' + (isActive ? ' active' : '');
        pill.textContent = `Día ${idx + 1}`;
        pill.title = dayObj.name;
        pill.addEventListener('click', () => {
            if (globalDayFilter.has(dayObj.id)) {
                globalDayFilter.delete(dayObj.id);
            } else {
                globalDayFilter.add(dayObj.id);
            }
            // If nothing is selected, reset to "Todos"
            if (globalDayFilter.size === 0) {
                // stays as "all"
            }
            renderGlobalDayFilters();
            renderGlobalProgressChart();
        });
        container.appendChild(pill);
    });
}
// ────────────────────────────────────────────────────────────────────────────

function renderCardioChart() {
    const container = document.getElementById('cardio-progress-container');
    const ctx = document.getElementById('cardioChart');
    if (!ctx || !container) return;

    const runLogs = currentSession.cardioLogs || [];
    const cycleLogs = currentSession.cyclingLogs || [];

    // Helper: get week/month label from an ISO date string
    const getMonday = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(date.setDate(diff));
        mon.setHours(0, 0, 0, 0);
        return mon;
    };

    const weekKey = (isoDate) => {
        const mon = getMonday(new Date(isoDate));
        return mon.toLocaleDateString('sv-SE'); // YYYY-MM-DD of that monday
    };

    const monthKey = (isoDate) => {
        const d = new Date(isoDate);
        return d.toLocaleString('es-ES', { month: 'short', year: '2-digit' });
    };

    // Aggregate distances per period
    const aggregate = (logs, keyFn) => {
        const map = {};
        logs.forEach(log => {
            if (!log.date || !log.distancia) return;
            const k = keyFn(log.date);
            map[k] = (map[k] || 0) + Number(log.distancia);
        });
        return map;
    };

    const keyFn = cardioTimeUnit === 'week' ? weekKey : monthKey;

    const runMap = aggregate(runLogs, keyFn);
    const cycleMap = aggregate(cycleLogs, keyFn);

    // Union of all period keys, sorted chronologically
    const allKeys = Array.from(new Set([
        ...Object.keys(runMap),
        ...Object.keys(cycleMap)
    ])).sort();

    if (allKeys.length === 0) {
        container.style.display = 'none';
        return;
    }

    // Build display labels
    const labels = cardioTimeUnit === 'week'
        ? allKeys.map(k => {
            const d = new Date(k + 'T12:00:00');
            return d.toLocaleString('es-ES', { day: '2-digit', month: 'short' });
        })
        : allKeys; // already month labels

    const runData = allKeys.map(k => Math.round((runMap[k] || 0) * 100) / 100);
    const cycleData = allKeys.map(k => Math.round((cycleMap[k] || 0) * 100) / 100);

    container.style.display = 'block';

    if (cardioChartInstance) cardioChartInstance.destroy();

    const context = ctx.getContext('2d');
    const runGrad = context.createLinearGradient(0, 0, 0, 180);
    runGrad.addColorStop(0, 'rgba(52, 211, 153, 0.85)');
    runGrad.addColorStop(1, 'rgba(52, 211, 153, 0.05)');

    const cycleGrad = context.createLinearGradient(0, 0, 0, 180);
    cycleGrad.addColorStop(0, 'rgba(6, 182, 212, 0.85)');
    cycleGrad.addColorStop(1, 'rgba(6, 182, 212, 0.05)');

    cardioChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Trote (km)',
                    data: runData,
                    backgroundColor: runGrad,
                    borderColor: '#34d399',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false,
                    stack: 'cardio'
                },
                {
                    label: 'Bicicleta (km)',
                    data: cycleData,
                    backgroundColor: cycleGrad,
                    borderColor: '#06b6d4',
                    borderWidth: 1.5,
                    borderRadius: 6,
                    borderSkipped: false,
                    stack: 'cardio'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 10, left: 5, right: 5, bottom: 5 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#34d399',
                    bodyColor: '#fff',
                    bodyFont: { weight: 'bold' },
                    padding: 12,
                    cornerRadius: 12,
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)} km`
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, weight: '600' } }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
                    ticks: { display: false }
                }
            }
        }
    });
}

// ============================================================
// RUNNING & CYCLING MODULE
// ============================================================

// ── Screen refs ─────────────────────────────────────────────
const screenRunning = document.getElementById('screen-running');
const screenCycling = document.getElementById('screen-cycling');

// ── Running DOM ──────────────────────────────────────────────
const btnStartRunning = document.getElementById('btn-start-running');
const btnBackRunning = document.getElementById('btn-back-running');
const btnModeGps = document.getElementById('btn-mode-gps');
const btnModeTreadmill = document.getElementById('btn-mode-treadmill');
const gpsStatusBar = document.getElementById('gps-status-bar');
const gpsStatusIcon = document.getElementById('gps-status-icon');
const gpsStatusText = document.getElementById('gps-status-text');
const runningTimerEl = document.getElementById('running-timer');
const statDistance = document.getElementById('stat-distance');
const statPace = document.getElementById('stat-pace');
const statCalories = document.getElementById('stat-calories');
const btnRunStart = document.getElementById('btn-run-start');
const btnRunStop = document.getElementById('btn-run-stop');
const runningHistoryList = document.getElementById('running-history-list');
const stravaStatusEl = document.getElementById('strava-status');
const stravaStatusText = document.getElementById('strava-status-text');
const btnConnectStrava = document.getElementById('btn-connect-strava');

// ── Cycling DOM ──────────────────────────────────────────────
const btnStartCycling = document.getElementById('btn-start-cycling');
const btnBackCycling = document.getElementById('btn-back-cycling');
const btnCycleModeGps = document.getElementById('btn-cycle-mode-gps');
const btnCycleModeIndoor = document.getElementById('btn-cycle-mode-indoor');
const cycleGpsStatusBar = document.getElementById('cycle-gps-status-bar');
const cycleGpsStatusIcon = document.getElementById('cycle-gps-status-icon');
const cycleGpsStatusText = document.getElementById('cycle-gps-status-text');
const cyclingTimerEl = document.getElementById('cycling-timer');
const cycleStatDistance = document.getElementById('cycle-stat-distance');
const cycleStatSpeed = document.getElementById('cycle-stat-speed');
const cycleStatCalories = document.getElementById('cycle-stat-calories');
const btnCycleStart = document.getElementById('btn-cycle-start');
const btnCycleStop = document.getElementById('btn-cycle-stop');
const cyclingHistoryList = document.getElementById('cycling-history-list');
const stravaStatusCyclingEl = document.getElementById('strava-status-cycling');
const stravaStatusTextCycling = document.getElementById('strava-status-text-cycling');
const btnConnectStravaCycling = document.getElementById('btn-connect-strava-cycling');

// ── State ────────────────────────────────────────────────────
let isRunning = false, runInterval = null, runElapsed = 0;
let runMode = 'gps', runDistKm = 0, runWatchId = null, runLastPos = null;
let isCycling = false, cycleInterval = null, cycleElapsed = 0;
let cycleMode = 'gps', cycleDistKm = 0, cycleWatchId = null, cycleLastPos = null;
let curSpeedKmh = 0;

// ── Helpers ──────────────────────────────────────────────────
function fmtHMS(s) {
    return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtMM(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtDur(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
}
function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function haversineKm(la1, lo1, la2, lo2) {
    const R = 6371, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function runKcal(km) { return Math.round(km * 60); }
function cycleKcal(km) { return Math.round(km * 30); }

// ── Strava UI ────────────────────────────────────────────────
function updateStravaStatusUI() {
    const tokens = (() => { try { return JSON.parse(localStorage.getItem('strava_tokens') || 'null'); } catch { return null; } })();
    const ok = !!(tokens && tokens.access_token);
    const t = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    [[stravaStatusEl, stravaStatusText, btnConnectStrava],
    [stravaStatusCyclingEl, stravaStatusTextCycling, btnConnectStravaCycling]
    ].forEach(([bar, txt, btn]) => {
        if (!bar) return;
        bar.classList.toggle('strava-connected', ok);
        if (txt) txt.textContent = ok ? `Strava conectado · Última sync: ${t}` : 'Conecta para sincronizar automáticamente';
        if (btn) { btn.textContent = ok ? 'Desconectar' : 'Conectar'; btn.className = ok ? 'btn-strava-disconnect' : 'btn-strava-connect'; }
    });
}
function handleStravaConnect() {
    const tokens = (() => { try { return JSON.parse(localStorage.getItem('strava_tokens') || 'null'); } catch { return null; } })();
    if (tokens && tokens.access_token) {
        localStorage.removeItem('strava_tokens');
        updateStravaStatusUI();
        showToast('Strava desconectado', 'info');
    } else {
        const clientId = '245269';
        const redirectUri = window.location.origin + window.location.pathname;
        const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&approval_prompt=force&scope=read,activity:read,activity:read_all`;
        window.location.href = stravaAuthUrl;
    }
}

// ── GPS helpers ──────────────────────────────────────────────
function setGpsUI(bar, icon, text, state) {
    if (!bar) return;
    bar.className = 'gps-status-bar';
    if (state === 'active') bar.classList.add('gps-active');
    if (state === 'error') bar.classList.add('gps-error');
    if (icon) icon.textContent = state === 'active' ? '✅' : state === 'error' ? '⚠️' : '📡';
    if (text) text.textContent = state === 'active' ? 'GPS activo' : state === 'error' ? 'Error de GPS. Revisa permisos.' : text.textContent;
}

// ══════════════════════════════════════════════════════════════
// RUNNING
// ══════════════════════════════════════════════════════════════
function resetRunDisplays() {
    runDistKm = 0; runElapsed = 0; runLastPos = null;
    if (runningTimerEl) runningTimerEl.textContent = '00:00:00';
    if (statDistance) statDistance.textContent = '0.00';
    if (statPace) statPace.textContent = '--:--';
    if (statCalories) statCalories.textContent = '0';
}
function stopRunGps() {
    if (runWatchId !== null) { navigator.geolocation.clearWatch(runWatchId); runWatchId = null; }
}
function startRunGps() {
    if (!navigator.geolocation) { setGpsUI(gpsStatusBar, gpsStatusIcon, gpsStatusText, 'error'); return; }
    setGpsUI(gpsStatusBar, gpsStatusIcon, gpsStatusText, 'idle');
    if (gpsStatusText) gpsStatusText.textContent = 'Buscando señal GPS...';
    runWatchId = navigator.geolocation.watchPosition(
        pos => {
            setGpsUI(gpsStatusBar, gpsStatusIcon, gpsStatusText, 'active');
            if (runLastPos && isRunning) {
                const d = haversineKm(runLastPos.lat, runLastPos.lon, pos.coords.latitude, pos.coords.longitude);
                if (d < 0.5) runDistKm += d;
            }
            runLastPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        },
        () => setGpsUI(gpsStatusBar, gpsStatusIcon, gpsStatusText, 'error'),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
}
function startRunSession() {
    isRunning = true;
    if (btnRunStart) { btnRunStart.textContent = 'EN CURSO...'; btnRunStart.classList.add('is-running'); }
    if (btnRunStop) btnRunStop.style.display = 'block';
    if (runningTimerEl) runningTimerEl.classList.add('running');
    if (runMode === 'gps') startRunGps();
    runInterval = setInterval(() => {
        runElapsed++;
        if (runningTimerEl) runningTimerEl.textContent = fmtHMS(runElapsed);
        if (statDistance) statDistance.textContent = runDistKm.toFixed(2);
        if (statCalories) statCalories.textContent = runKcal(runDistKm);
        if (runDistKm > 0) {
            const pps = runElapsed / runDistKm;
            if (statPace) statPace.textContent = `${Math.floor(pps / 60)}:${String(Math.floor(pps % 60)).padStart(2, '0')}`;
        }
    }, 1000);
}
async function stopRunSession() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(runInterval); runInterval = null;
    stopRunGps();
    if (runningTimerEl) runningTimerEl.classList.remove('running');
    if (btnRunStart) { btnRunStart.textContent = 'COMENZAR'; btnRunStart.classList.remove('is-running'); }
    if (btnRunStop) btnRunStop.style.display = 'none';
    const elapsed = runElapsed;
    if (elapsed < 30) { showToast('Sesión muy corta (mín. 30 seg.)', 'error'); resetRunDisplays(); return; }
    let finalDist = runDistKm;
    if (runMode === 'treadmill') {
        const inp = await showModal('¿Cuántos km corriste en la cinta?', 'ej: 5.2', 'number');
        if (!inp) { resetRunDisplays(); return; }
        finalDist = parseFloat(inp.replace(',', '.'));
        if (isNaN(finalDist) || finalDist <= 0) { showToast('Distancia inválida.', 'error'); resetRunDisplays(); return; }
    }
    const pps = finalDist > 0 ? elapsed / finalDist : 0;
    const paceStr = finalDist > 0 ? `${Math.floor(pps / 60)}:${String(Math.floor(pps % 60)).padStart(2, '0')}` : '--:--';
    const record = { id: Date.now(), date: new Date().toISOString(), tipo: runMode, duracion: elapsed, distancia: Math.round(finalDist * 100) / 100, ritmo: paceStr, calorias: runKcal(finalDist) };
    if (!currentSession.cardioLogs) currentSession.cardioLogs = [];
    currentSession.cardioLogs.unshift(record);
    const today = new Date().toLocaleDateString('sv-SE');
    if (!currentSession.trainingDates) currentSession.trainingDates = [];
    if (!currentSession.trainingDates.includes(today)) currentSession.trainingDates.push(today);
    await syncSessionToFirestore();
    showToast('✅ Sesión de trote guardada', 'success');
    resetRunDisplays();
    renderRunHistory();
}
function renderRunHistory() {
    if (!runningHistoryList) return;
    const logs = currentSession.cardioLogs || [];
    if (!logs.length) { runningHistoryList.innerHTML = '<div class="running-empty-state">Aún no tienes sesiones.<br>¡A trotar! 🏃</div>'; return; }
    runningHistoryList.innerHTML = '';
    logs.forEach((log, idx) => {
        const isS = log.tipo === 'strava';
        const mLabel = isS ? 'Strava' : (log.tipo === 'gps' ? '🛰️ Calle' : '🏃 Cinta');
        const sBadge = isS ? '<span class="run-history-strava-badge">⚡ Strava</span>' : '';
        const rName = (isS && log.nombre) ? `<div class="run-name-label">"${log.nombre}"</div>` : '';
        const bpm = (isS && log.pulsaciones) ? `<div class="run-history-stat"><span class="run-history-stat-value">${Math.round(log.pulsaciones)}</span><span class="run-history-stat-label">bpm ❤️</span></div>` : '';
        const card = document.createElement('div');
        card.className = 'run-history-card' + (isS ? ' from-strava' : '');
        card.innerHTML = `<div class="run-history-header"><span class="run-history-date">${fmtDate(log.date)}${sBadge}</span><span class="run-history-mode">${mLabel}</span></div>${rName}<div class="run-history-stats"><div class="run-history-stat"><span class="run-history-stat-value">${(log.distancia || 0).toFixed(2)}</span><span class="run-history-stat-label">km</span></div><div class="run-history-stat"><span class="run-history-stat-value">${fmtDur(log.duracion || 0)}</span><span class="run-history-stat-label">Tiempo</span></div><div class="run-history-stat"><span class="run-history-stat-value">${log.ritmo || '--'}</span><span class="run-history-stat-label">min/km</span></div><div class="run-history-stat"><span class="run-history-stat-value">${log.calorias || 0}</span><span class="run-history-stat-label">kcal</span></div>${bpm}</div><button class="run-delete-btn" data-idx="${idx}">−</button>`;
        runningHistoryList.appendChild(card);
    });
    runningHistoryList.querySelectorAll('.run-delete-btn').forEach(btn => btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.idx);
        if (!await showConfirm('¿Eliminar esta sesión?', 'Eliminar', '#ef4444')) return;
        currentSession.cardioLogs.splice(i, 1);
        await syncSessionToFirestore();
        renderRunHistory();
        showToast('🗑 Sesión eliminada', 'error');
    }));
}
// Running listeners
btnModeGps.addEventListener('click', () => {
    if (isRunning) return;
    runMode = 'gps'; btnModeGps.classList.add('active'); btnModeTreadmill.classList.remove('active');
    if (gpsStatusBar) gpsStatusBar.classList.remove('hidden');
    if (gpsStatusText) gpsStatusText.textContent = 'Buscando señal GPS...';
});
btnModeTreadmill.addEventListener('click', () => {
    if (isRunning) return;
    runMode = 'treadmill'; btnModeTreadmill.classList.add('active'); btnModeGps.classList.remove('active');
    if (gpsStatusBar) gpsStatusBar.classList.add('hidden');
});
btnRunStart.addEventListener('click', () => { if (!isRunning) startRunSession(); });
btnRunStop.addEventListener('click', () => stopRunSession());
btnConnectStrava.addEventListener('click', handleStravaConnect);
btnStartRunning.addEventListener('click', () => {
    resetRunDisplays(); renderRunHistory();
    runMode = 'gps'; btnModeGps.classList.add('active'); btnModeTreadmill.classList.remove('active');
    if (gpsStatusBar) { gpsStatusBar.classList.remove('hidden'); if (gpsStatusText) gpsStatusText.textContent = 'Buscando señal GPS...'; }
    updateStravaStatusUI();
    screenHome.classList.add('hidden');
    if (screenRunning) screenRunning.classList.remove('hidden');
});
btnBackRunning.addEventListener('click', () => {
    if (isRunning) { isRunning = false; clearInterval(runInterval); stopRunGps(); resetRunDisplays(); }
    if (screenRunning) screenRunning.classList.add('hidden');
    showScreen(screenHome);
});

// ══════════════════════════════════════════════════════════════
// CYCLING
// ══════════════════════════════════════════════════════════════
function resetCycleDisplays() {
    cycleDistKm = 0; cycleElapsed = 0; cycleLastPos = null; curSpeedKmh = 0;
    if (cyclingTimerEl) cyclingTimerEl.textContent = '00:00';
    if (cycleStatDistance) cycleStatDistance.textContent = '0.00';
    if (cycleStatSpeed) cycleStatSpeed.textContent = '0.0';
    if (cycleStatCalories) cycleStatCalories.textContent = '0';
}
function stopCycleGps() {
    if (cycleWatchId !== null) { navigator.geolocation.clearWatch(cycleWatchId); cycleWatchId = null; }
}
function startCycleGps() {
    if (!navigator.geolocation) { setGpsUI(cycleGpsStatusBar, cycleGpsStatusIcon, cycleGpsStatusText, 'error'); return; }
    setGpsUI(cycleGpsStatusBar, cycleGpsStatusIcon, cycleGpsStatusText, 'idle');
    if (cycleGpsStatusText) cycleGpsStatusText.textContent = 'Buscando señal GPS...';
    let lastT = null;
    cycleWatchId = navigator.geolocation.watchPosition(
        pos => {
            setGpsUI(cycleGpsStatusBar, cycleGpsStatusIcon, cycleGpsStatusText, 'active');
            const now = Date.now();
            if (cycleLastPos && isCycling) {
                const d = haversineKm(cycleLastPos.lat, cycleLastPos.lon, pos.coords.latitude, pos.coords.longitude);
                if (d < 1) cycleDistKm += d;
                if (lastT) { const dtH = (now - lastT) / 3600000; if (dtH > 0) curSpeedKmh = Math.round(d / dtH * 10) / 10; }
            }
            cycleLastPos = { lat: pos.coords.latitude, lon: pos.coords.longitude }; lastT = now;
        },
        () => setGpsUI(cycleGpsStatusBar, cycleGpsStatusIcon, cycleGpsStatusText, 'error'),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
}
function startCycleSession() {
    isCycling = true;
    if (btnCycleStart) { btnCycleStart.textContent = 'EN CURSO...'; btnCycleStart.classList.add('is-cycling'); }
    if (btnCycleStop) btnCycleStop.style.display = 'block';
    if (cyclingTimerEl) cyclingTimerEl.classList.add('cycling');
    if (cycleMode === 'gps') startCycleGps();
    cycleInterval = setInterval(() => {
        cycleElapsed++;
        if (cyclingTimerEl) cyclingTimerEl.textContent = fmtMM(cycleElapsed);
        if (cycleStatDistance) cycleStatDistance.textContent = cycleDistKm.toFixed(2);
        if (cycleStatSpeed) cycleStatSpeed.textContent = curSpeedKmh.toFixed(1);
        if (cycleStatCalories) cycleStatCalories.textContent = cycleKcal(cycleDistKm);
    }, 1000);
}
async function stopCycleSession() {
    if (!isCycling) return;
    isCycling = false; clearInterval(cycleInterval); cycleInterval = null;
    if (cyclingTimerEl) cyclingTimerEl.classList.remove('cycling');
    if (btnCycleStart) { btnCycleStart.classList.remove('is-cycling'); btnCycleStart.textContent = 'COMENZAR'; }
    if (btnCycleStop) btnCycleStop.style.display = 'none';
    if (cycleMode === 'gps') stopCycleGps();
    const elapsed = cycleElapsed;
    if (elapsed < 30) { showToast('Sesión muy corta (mín. 30 seg.)', 'error'); resetCycleDisplays(); return; }
    let finalDist = cycleDistKm, finalSpeed = curSpeedKmh;
    if (cycleMode === 'indoor') {
        const inp = await showModal('¿Cuántos km recorriste?', 'ej: 20.5', 'number');
        if (!inp) { resetCycleDisplays(); return; }
        finalDist = parseFloat(inp.replace(',', '.'));
        if (isNaN(finalDist) || finalDist <= 0) { showToast('Distancia inválida.', 'error'); resetCycleDisplays(); return; }
        finalSpeed = elapsed > 0 ? Math.round(finalDist / elapsed * 3600 * 10) / 10 : 0;
    }
    const record = { id: Date.now(), date: new Date().toISOString(), tipo: cycleMode, duracion: elapsed, distancia: Math.round(finalDist * 100) / 100, velocidad: finalSpeed, calorias: cycleKcal(finalDist) };
    if (!currentSession.cyclingLogs) currentSession.cyclingLogs = [];
    currentSession.cyclingLogs.unshift(record);
    const today = new Date().toLocaleDateString('sv-SE');
    if (!currentSession.trainingDates) currentSession.trainingDates = [];
    if (!currentSession.trainingDates.includes(today)) currentSession.trainingDates.push(today);
    await syncSessionToFirestore();
    showToast('✅ Sesión de bicicleta guardada', 'success');
    resetCycleDisplays(); renderCycleHistory();
}
function renderCycleHistory() {
    if (!cyclingHistoryList) return;
    const logs = currentSession.cyclingLogs || [];
    if (!logs.length) { cyclingHistoryList.innerHTML = '<div class="cycling-empty-state">Aún no tienes sesiones.<br>¡A pedalear! 🚴</div>'; return; }
    cyclingHistoryList.innerHTML = '';
    logs.forEach((log, idx) => {
        const isS = log.tipo === 'strava';
        const mLabel = isS ? 'Strava' : (log.tipo === 'gps' ? '🛰️ Aire Libre' : '🏠 Indoor');
        const sBadge = isS ? '<span class="run-history-strava-badge">⚡ Strava</span>' : '';
        const rName = (isS && log.nombre) ? `<div class="run-name-label">"${log.nombre}"</div>` : '';
        const bpm = (isS && log.pulsaciones) ? `<div class="cycle-history-stat"><span class="cycle-history-stat-value">${Math.round(log.pulsaciones)}</span><span class="cycle-history-stat-label">bpm ❤️</span></div>` : '';
        const elev = (isS && log.elevacion > 0) ? `<div class="cycle-history-stat"><span class="cycle-history-stat-value">${Math.round(log.elevacion)}</span><span class="cycle-history-stat-label">m ↑</span></div>` : '';
        const card = document.createElement('div');
        card.className = 'cycle-history-card' + (isS ? ' from-strava' : '');
        card.innerHTML = `<div class="cycle-history-header"><span class="cycle-history-date">${fmtDate(log.date)}${sBadge}</span><span class="cycle-history-mode">${mLabel}</span></div>${rName}<div class="cycle-history-stats"><div class="cycle-history-stat"><span class="cycle-history-stat-value">${(log.distancia || 0).toFixed(2)}</span><span class="cycle-history-stat-label">km</span></div><div class="cycle-history-stat"><span class="cycle-history-stat-value">${fmtDur(log.duracion || 0)}</span><span class="cycle-history-stat-label">Tiempo</span></div><div class="cycle-history-stat"><span class="cycle-history-stat-value">${log.velocidad ? log.velocidad.toFixed(1) : '—'}</span><span class="cycle-history-stat-label">km/h</span></div><div class="cycle-history-stat"><span class="cycle-history-stat-value">${log.calorias || 0}</span><span class="cycle-history-stat-label">kcal</span></div>${bpm}${elev}</div><button class="cycle-delete-btn" data-idx="${idx}">−</button>`;
        cyclingHistoryList.appendChild(card);
    });
    cyclingHistoryList.querySelectorAll('.cycle-delete-btn').forEach(btn => btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.idx);
        if (!await showConfirm('¿Eliminar esta sesión?', 'Eliminar', '#ef4444')) return;
        currentSession.cyclingLogs.splice(i, 1);
        await syncSessionToFirestore();
        renderCycleHistory();
        showToast('🗑 Sesión eliminada', 'error');
    }));
}
// Cycling listeners
btnCycleModeGps.addEventListener('click', () => {
    if (isCycling) return;
    cycleMode = 'gps'; btnCycleModeGps.classList.add('active'); btnCycleModeIndoor.classList.remove('active');
    if (cycleGpsStatusBar) cycleGpsStatusBar.classList.remove('hidden');
    if (cycleGpsStatusText) cycleGpsStatusText.textContent = 'Buscando señal GPS...';
});
btnCycleModeIndoor.addEventListener('click', () => {
    if (isCycling) return;
    cycleMode = 'indoor'; btnCycleModeIndoor.classList.add('active'); btnCycleModeGps.classList.remove('active');
    if (cycleGpsStatusBar) cycleGpsStatusBar.classList.add('hidden');
});
btnCycleStart.addEventListener('click', () => { if (!isCycling) startCycleSession(); });
btnCycleStop.addEventListener('click', () => stopCycleSession());
btnConnectStravaCycling.addEventListener('click', handleStravaConnect);
btnStartCycling.addEventListener('click', () => {
    resetCycleDisplays(); renderCycleHistory();
    cycleMode = 'gps'; btnCycleModeGps.classList.add('active'); btnCycleModeIndoor.classList.remove('active');
    if (cycleGpsStatusBar) { cycleGpsStatusBar.classList.remove('hidden'); if (cycleGpsStatusText) cycleGpsStatusText.textContent = 'Buscando señal GPS...'; }
    updateStravaStatusUI();
    screenHome.classList.add('hidden');
    if (screenCycling) screenCycling.classList.remove('hidden');
});
btnBackCycling.addEventListener('click', () => {
    if (isCycling) { isCycling = false; clearInterval(cycleInterval); stopCycleGps(); resetCycleDisplays(); }
    if (screenCycling) screenCycling.classList.add('hidden');
    showScreen(screenHome);
});

// ── Init Strava callback check ───────────────────────────────
handleStravaCallback();
async function handleStravaCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    window.history.replaceState({}, '', window.location.pathname);

    showToast('Conectando con Strava...', 'info');

    try {
        const response = await fetch('https://strava-oauth-proxy.felipetoro-c.workers.dev/strava/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code })
        });

        if (!response.ok) throw new Error('Error en el Worker');

        const data = await response.json();

        if (data.access_token) {
            localStorage.setItem('strava_tokens', JSON.stringify({
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: data.expires_at,
                athlete: data.athlete
            }));
            updateStravaStatusUI();
            showToast('¡Strava conectado exitosamente!', 'success');
        } else {
            throw new Error(data.error || 'No se recibió token');
        }
    } catch (err) {
        console.error('Strava callback error:', err);
        showToast('Error al conectar con Strava: ' + err.message, 'error');
    }
}

// Event Listeners
btnLogin.addEventListener('click', async () => {
    const email = inputEmail.value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
        showToast('Por favor ingresa un correo electrónico válido.', 'error');
        return;
    }

    try {
        // Verificar si el correo ya tiene métodos de inicio de sesión
        const methods = await fetchSignInMethodsForEmail(auth, email);

        if (methods.length > 0) {
            // El usuario ya existe, pedir contraseña para entrar
            const password = await showModal('Ingresa tu contraseña para entrar:', 'Contraseña', 'password');
            if (!password) return;

            try {
                await signInWithEmailAndPassword(auth, email, password);
                showToast('Sesión iniciada con éxito', 'success');
                inputEmail.value = '';
            } catch (error) {
                console.error('Error al iniciar sesión:', error);
                if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    showToast('Contraseña incorrecta.', 'error');
                } else {
                    showToast('Error al iniciar sesión. Intenta de nuevo.', 'error');
                }
            }
        } else {
            // El usuario no existe, preguntar si desea crear cuenta
            const confirmCreate = await showConfirm(`El correo <strong>${email}</strong> no está registrado.<br><br>¿Deseas crear una cuenta nueva?`, 'Crear Cuenta', 'var(--accent)');
            if (!confirmCreate) return;

            const pass1 = await showModal('Crea una contraseña para tu cuenta:', 'Mínimo 6 caracteres', 'password');
            if (!pass1) return;
            if (pass1.length < 6) {
                showToast('La contraseña debe tener al menos 6 caracteres.', 'error');
                return;
            }

            const pass2 = await showModal('Repite la contraseña para confirmar:', 'Repetir contraseña', 'password');
            if (!pass2) return;

            if (pass1 !== pass2) {
                showToast('Las contraseñas no coinciden.', 'error');
                return;
            }

            try {
                await createUserWithEmailAndPassword(auth, email, pass1);
                showToast('¡Cuenta creada y sesión iniciada!', 'success');
                inputEmail.value = '';
            } catch (error) {
                console.error('Error al crear cuenta:', error);
                if (error.code === 'auth/email-already-in-use') {
                    showToast('Este correo ya está en uso.', 'error');
                } else {
                    showToast('Error al crear la cuenta.', 'error');
                }
            }
        }
    } catch (error) {
        console.error('Error al verificar correo:', error);
        showToast('Error al verificar el correo. Intenta de nuevo.', 'error');
    }
});

btnLogout.addEventListener('click', async () => {
    console.log("Logout button clicked");
    try {
        await signOut(auth);
        window.localStorage.removeItem('emailForSignIn');
        currentUserId = null;
        currentSession = { date: new Date().toISOString(), logs: {} };
        inputEmail.value = '';
        showScreen(screenLogin);
        showToast('Sesión cerrada', 'info');
    } catch (error) {
        console.error("Error cerrando sesión:", error);
        showToast('Error al cerrar sesión', 'error');
    }
});

btnStartDay.addEventListener('click', () => {
    // Show the day selection screen
    renderDayList();
    showScreen(screenSelectDay);
});

btnBackHome.addEventListener('click', () => {
    showScreen(screenHome);
});

btnAddDay.addEventListener('click', async () => {
    if (!currentSession.days) currentSession.days = [];

    if (currentSession.days.length >= 7) {
        showToast('¡Límite máximo de 7 días alcanzado!', 'error');
        return;
    }

    const zoneName = await showModal('¿Qué zona trabajarás en este nuevo día?', 'Ej: Pecho y Tríceps');
    if (!zoneName) return;

    // Use a unique ID based on timestamp
    const dayId = `day_${Date.now()}`;
    const newDayObj = {
        id: dayId,
        name: zoneName.trim()
    };

    currentSession.days.push(newDayObj);
    renderDayList();
    showToast(`✅ Día ${currentSession.days.length} agregado`, 'success');

    await syncSessionToFirestore();
});

btnAddExercise.addEventListener('click', async () => {
    let exerciseName = await showModal('Nombre del nuevo ejercicio:', 'Ej: Press de Banca');
    if (!exerciseName) return;

    exerciseName = exerciseName.trim();

    if (!currentSession.customExercises[activeDay]) {
        currentSession.customExercises[activeDay] = [];
    }

    currentSession.customExercises[activeDay].push(exerciseName);

    renderExerciseList(activeDay);
    showToast(`✅ "${exerciseName}" agregado`, 'success');

    await syncSessionToFirestore();
});

btnEditDesc.addEventListener('click', async () => {
    const isEditing = descTrabajoEl.contentEditable === "true";

    if (isEditing) {
        // Save Mode
        descTrabajoEl.contentEditable = "false";
        descIntensidadEl.contentEditable = "false";
        btnEditDesc.textContent = "✎";

        // Save details
        currentSession.customDescriptions[activeExercise] = {
            trabajo: descTrabajoEl.innerText.trim(),
            intensidad: descIntensidadEl.innerText.trim()
        };

        await syncSessionToFirestore();
        showToast('✅ Descripción guardada', 'success');
    } else {
        // Edit Mode
        descTrabajoEl.contentEditable = "true";
        descIntensidadEl.contentEditable = "true";
        btnEditDesc.textContent = "💾";
        descTrabajoEl.focus(); // focus first box
    }
});

btnBackDays.addEventListener('click', () => {
    showScreen(screenSelectDay);
});

btnBackExercises.addEventListener('click', () => {
    if (isNavigatingFromAI) {
        isNavigatingFromAI = false;
        showScreen(screenHome);
        if (lastWeekAnalyzed) {
            const insight = analyzeGlobalWeek(lastWeekAnalyzed);
            aiAnalysisContent.innerHTML = insight;
            aiModalOverlay.classList.remove('hidden');
        }
    } else {
        if (activeDay) renderExerciseList(activeDay);
        showScreen(screenExercises);
    }
});

btnSaveSet.addEventListener('click', saveSet);

btnPrevWeek.addEventListener('click', () => {
    if (currentWeek > 1) {
        currentWeek--;
        renderWeekNavigation();
        renderSets();
    }
});

btnNextWeek.addEventListener('click', () => {
    if (currentWeek < maxWeek) {
        currentWeek++;
        renderWeekNavigation();
        renderSets();
    }
});

btnShowChart.addEventListener('click', () => {
    showScreen(screenChart);
    renderVolumeChart();
});

btnTabVolume.addEventListener('click', () => {
    if (currentChartType === 'volume') return;
    currentChartType = 'volume';
    btnTabVolume.classList.add('active');
    btnTab1rm.classList.remove('active');
    renderVolumeChart();
});

btnTab1rm.addEventListener('click', () => {
    if (currentChartType === '1rm') return;
    currentChartType = '1rm';
    btnTab1rm.classList.add('active');
    btnTabVolume.classList.remove('active');
    renderVolumeChart();
});

btnTabWeek.addEventListener('click', () => {
    if (currentTimeUnit === 'week') return;
    currentTimeUnit = 'week';
    btnTabWeek.classList.add('active');
    btnTabMonth.classList.remove('active');
    renderVolumeChart();
});

btnTabMonth.addEventListener('click', () => {
    if (currentTimeUnit === 'month') return;
    currentTimeUnit = 'month';
    btnTabMonth.classList.add('active');
    btnTabWeek.classList.remove('active');
    renderVolumeChart();
});

btnGlobalWeek.addEventListener('click', () => {
    if (globalTimeUnit === 'week') return;
    globalTimeUnit = 'week';
    btnGlobalWeek.classList.add('active');
    btnGlobalMonth.classList.remove('active');
    renderGlobalProgressChart();
});

btnGlobalMonth.addEventListener('click', () => {
    if (globalTimeUnit === 'month') return;
    globalTimeUnit = 'month';
    btnGlobalMonth.classList.add('active');
    btnGlobalWeek.classList.remove('active');
    renderGlobalProgressChart();
});

btnCardioWeek.addEventListener('click', () => {
    if (cardioTimeUnit === 'week') return;
    cardioTimeUnit = 'week';
    btnCardioWeek.classList.add('active');
    btnCardioMonth.classList.remove('active');
    renderCardioChart();
});

btnCardioMonth.addEventListener('click', () => {
    if (cardioTimeUnit === 'month') return;
    cardioTimeUnit = 'month';
    btnCardioMonth.classList.add('active');
    btnCardioWeek.classList.remove('active');
    renderCardioChart();
});

btnCloseAi.addEventListener('click', () => {
    aiModalOverlay.classList.add('hidden');
});

aiModalOverlay.addEventListener('click', (e) => {
    if (e.target === aiModalOverlay) {
        aiModalOverlay.classList.add('hidden');
    }
});

aiAnalysisContent.addEventListener('click', (e) => {
    const link = e.target.closest('.ai-ex-link');
    if (link) {
        const exName = link.getAttribute('data-ex');
        isNavigatingFromAI = true;
        aiModalOverlay.classList.add('hidden');
        openExercise(exName);
    }
});

btnBackActiveExercise.addEventListener('click', () => {
    showScreen(screenActiveExercise);
});

btnStartDay.addEventListener('click', () => {
    startWorkoutTimer();
    renderDayList();
    showScreen(screenSelectDay);
});

btnStopWorkout.addEventListener('click', () => {
    stopWorkoutTimer();
});

// App Init & Auth Listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        await loadSessionFromFirestore();
        welcomeMsg.textContent = `Hola, ${user.email}`;
        restoreWorkoutTimer();
        showScreen(screenHome);
    } else {
        if (workoutTimerBar) workoutTimerBar.classList.add('hidden');
        showScreen(screenLogin);
    }

    // Hide splash screen with a smooth delay
    setTimeout(() => {
        if (splashScreen) splashScreen.classList.add('hidden');
    }, 2000);
});
