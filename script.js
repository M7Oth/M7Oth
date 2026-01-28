/**
 * موقع متابعة اللياقة البدنية - JavaScript
 * يتضمن: حاسبة السعرات، تتبع التمارين، سجل الوزن
 */

// ==========================================
// Constants & Configuration
// ==========================================

const caloriesMap = {
    day0: 350, // السبت: بطن + كارديو
    day1: 300, // الأحد: جسم كامل
    day2: 350, // الاثنين: بطن + كارديو
    day3: 300, // الثلاثاء: جسم كامل
    day4: 350, // الأربعاء: بطن + كارديو
    day5: 300  // الخميس: جسم كامل
};

const lastWorkoutDay = 'day5';
const weekLogsKey = 'weekLogs';
const currentWeekStartKey = 'currentWeekStart';
const currentWeekInitialWeightKey = 'currentWeekInitialWeight';

// ==========================================
// Initialization
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    loadUserInfo();
    loadProgress();
    loadWeightLogs();
    loadWeekLogs();
    setupEventListeners();
    setupDietTabs();
});

function setupEventListeners() {
    document.getElementById('userInfoForm').addEventListener('submit', saveUserInfo);
    document.getElementById('weightLogForm').addEventListener('submit', addWeightLog);
}

function setupDietTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all buttons and contents
            tabButtons.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Add active to clicked button and its content
            btn.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// ==========================================
// Calorie Calculator (TDEE & BMR)
// ==========================================

/**
 * حساب معدل الأيض الأساسي باستخدام معادلة Mifflin-St Jeor
 * BMR = (10 × weight) + (6.25 × height) - (5 × age) + s
 * حيث s = +5 للذكور و -161 للإناث
 */
function calculateBMR(weight, height, age, gender) {
    const baseCalc = (10 * weight) + (6.25 * height) - (5 * age);
    return gender === 'male' ? baseCalc + 5 : baseCalc - 161;
}

/**
 * حساب إجمالي السعرات اليومية (TDEE)
 * TDEE = BMR × Activity Level
 */
function calculateTDEE(bmr, activityLevel) {
    return bmr * activityLevel;
}

/**
 * حساب السعرات المستهدفة حسب الهدف
 * خسارة وزن: -500 سعرة (للخسارة الآمنة ~0.5 كجم/أسبوع)
 * زيادة وزن: +300 سعرة (لبناء العضلات)
 */
function calculateTargetCalories(tdee, goal) {
    switch (goal) {
        case 'lose':
            return Math.round(tdee - 500);
        case 'gain':
            return Math.round(tdee + 300);
        default:
            return Math.round(tdee);
    }
}

/**
 * حساب توزيع المغذيات (Macros)
 * للخسارة: 40% بروتين، 35% كارب، 25% دهون
 * للثبات: 30% بروتين، 45% كارب، 25% دهون
 * للزيادة: 30% بروتين، 50% كارب، 20% دهون
 */
function calculateMacros(targetCalories, goal) {
    let proteinPercent, carbsPercent, fatsPercent;

    switch (goal) {
        case 'lose':
            proteinPercent = 0.40;
            carbsPercent = 0.35;
            fatsPercent = 0.25;
            break;
        case 'gain':
            proteinPercent = 0.30;
            carbsPercent = 0.50;
            fatsPercent = 0.20;
            break;
        default:
            proteinPercent = 0.30;
            carbsPercent = 0.45;
            fatsPercent = 0.25;
    }

    const proteinCal = targetCalories * proteinPercent;
    const carbsCal = targetCalories * carbsPercent;
    const fatsCal = targetCalories * fatsPercent;

    return {
        protein: { grams: Math.round(proteinCal / 4), calories: Math.round(proteinCal) },
        carbs: { grams: Math.round(carbsCal / 4), calories: Math.round(carbsCal) },
        fats: { grams: Math.round(fatsCal / 9), calories: Math.round(fatsCal) }
    };
}

/**
 * حساب مؤشر كتلة الجسم (BMI)
 */
function calculateBMI(weight, height) {
    const heightInMeters = height / 100;
    return weight / (heightInMeters * heightInMeters);
}

/**
 * تصنيف مؤشر كتلة الجسم
 */
function getBMICategory(bmi) {
    if (bmi < 18.5) return { text: 'نحيف', class: 'underweight' };
    if (bmi < 25) return { text: 'طبيعي', class: 'normal' };
    if (bmi < 30) return { text: 'زيادة في الوزن', class: 'overweight' };
    return { text: 'سمنة', class: 'obese' };
}

/**
 * تحديث عرض حاسبة السعرات
 */
function updateCalorieCalculator(weight, height, age, gender, activityLevel, goal) {
    const bmr = calculateBMR(weight, height, age, gender);
    const tdee = calculateTDEE(bmr, activityLevel);
    const targetCalories = calculateTargetCalories(tdee, goal);
    const macros = calculateMacros(targetCalories, goal);
    const bmi = calculateBMI(weight, height);
    const bmiCategory = getBMICategory(bmi);

    // Update BMR, TDEE, Target
    document.getElementById('bmrValue').textContent = Math.round(bmr);
    document.getElementById('tdeeValue').textContent = Math.round(tdee);
    document.getElementById('targetCalories').textContent = targetCalories;

    // Update target description
    const targetDesc = document.getElementById('targetDesc');
    switch (goal) {
        case 'lose':
            targetDesc.textContent = 'عجز 500 سعرة للخسارة الآمنة';
            break;
        case 'gain':
            targetDesc.textContent = 'فائض 300 سعرة لبناء العضلات';
            break;
        default:
            targetDesc.textContent = 'للحفاظ على وزنك الحالي';
    }

    // Update Macros
    document.getElementById('proteinGrams').textContent = macros.protein.grams;
    document.getElementById('proteinCal').textContent = macros.protein.calories;
    document.getElementById('carbsGrams').textContent = macros.carbs.grams;
    document.getElementById('carbsCal').textContent = macros.carbs.calories;
    document.getElementById('fatsGrams').textContent = macros.fats.grams;
    document.getElementById('fatsCal').textContent = macros.fats.calories;

    // Update BMI
    document.getElementById('bmiValue').textContent = bmi.toFixed(1);
    const bmiCategoryEl = document.getElementById('bmiCategory');
    bmiCategoryEl.textContent = bmiCategory.text;
    bmiCategoryEl.className = 'bmi-category ' + bmiCategory.class;

    // Update BMI indicator position
    const bmiIndicator = document.getElementById('bmiIndicator');
    // BMI scale: 15-40 mapped to 0-100%
    const minBMI = 15;
    const maxBMI = 40;
    const clampedBMI = Math.max(minBMI, Math.min(maxBMI, bmi));
    const percentage = ((clampedBMI - minBMI) / (maxBMI - minBMI)) * 100;
    bmiIndicator.style.left = percentage + '%';

    // Show results
    document.getElementById('calorieResults').classList.remove('hidden');
    document.getElementById('macroResults').classList.remove('hidden');
    document.getElementById('bmiDisplay').classList.remove('hidden');

    // Save calculated values
    localStorage.setItem('calculatedTDEE', Math.round(tdee));
    localStorage.setItem('calculatedTarget', targetCalories);
    localStorage.setItem('calculatedBMI', bmi.toFixed(1));
}

// ==========================================
// User Info Functions
// ==========================================

function loadUserInfo() {
    const weight = localStorage.getItem('userWeight');
    const height = localStorage.getItem('userHeight');
    const age = localStorage.getItem('userAge');
    const gender = localStorage.getItem('userGender');
    const activity = localStorage.getItem('userActivity');
    const goal = localStorage.getItem('userGoal');

    if (weight) document.getElementById('weightInput').value = weight;
    if (height) document.getElementById('heightInput').value = height;
    if (age) document.getElementById('ageInput').value = age;
    if (gender) document.getElementById('genderInput').value = gender;
    if (activity) document.getElementById('activityInput').value = activity;
    if (goal) document.getElementById('goalInput').value = goal;

    if (weight && height && age && gender && activity && goal) {
        displayUserInfo(weight, height, age);
        updateCalorieCalculator(
            parseFloat(weight),
            parseFloat(height),
            parseInt(age),
            gender,
            parseFloat(activity),
            goal
        );
    }
}

function saveUserInfo(event) {
    event.preventDefault();

    const weight = document.getElementById('weightInput').value.trim();
    const height = document.getElementById('heightInput').value.trim();
    const age = document.getElementById('ageInput').value.trim();
    const gender = document.getElementById('genderInput').value;
    const activity = document.getElementById('activityInput').value;
    const goal = document.getElementById('goalInput').value;

    if (!weight || !height || !age || !gender || !activity || !goal) {
        alert('يرجى ملء جميع الحقول');
        return;
    }

    // Save to localStorage
    localStorage.setItem('userWeight', weight);
    localStorage.setItem('userHeight', height);
    localStorage.setItem('userAge', age);
    localStorage.setItem('userGender', gender);
    localStorage.setItem('userActivity', activity);
    localStorage.setItem('userGoal', goal);

    displayUserInfo(weight, height, age);

    // Calculate and display calories
    updateCalorieCalculator(
        parseFloat(weight),
        parseFloat(height),
        parseInt(age),
        gender,
        parseFloat(activity),
        goal
    );

    updateProgressImage();
    alert('تم حفظ المعلومات وحساب السعرات بنجاح');
}

function displayUserInfo(weight, height, age) {
    const displayDiv = document.getElementById('userInfoDisplay');
    const bmi = calculateBMI(parseFloat(weight), parseFloat(height));
    const bmiCategory = getBMICategory(bmi);
    displayDiv.innerHTML = `
        <strong>الوزن:</strong> ${weight} كجم |
        <strong>الطول:</strong> ${height} سم |
        <strong>العمر:</strong> ${age} سنة |
        <strong>BMI:</strong> ${bmi.toFixed(1)} (${bmiCategory.text})
    `;
}

// ==========================================
// Progress & Workout Tracking
// ==========================================

function loadProgress() {
    const daysCount = 6;

    for (let i = 0; i < daysCount; i++) {
        const key = 'day' + i;
        const saved = localStorage.getItem(key);
        const checkbox = document.getElementById(key);

        if (checkbox && saved !== null) {
            const done = saved === 'true';
            checkbox.checked = done;

            if (done) {
                checkbox.disabled = true;
                const row = checkbox.closest('tr');
                if (row) row.classList.add('completed-row');
            }
        }

        // Restore calories display
        if (caloriesMap.hasOwnProperty(key)) {
            const calKey = 'calories_' + key;
            const storedCal = localStorage.getItem(calKey);
            const calCell = document.getElementById('calDay' + i);
            if (calCell) {
                calCell.textContent = storedCal ? storedCal + ' سعرة' : '—';
            }
        }
    }

    updateTotalCalories();
    updateProgressImage();

    // Check if week is pending completion
    if (checkAllWorkoutsComplete() && localStorage.getItem('weekPendingCompletion') !== 'true') {
        startWeekIfNotStarted();
        localStorage.setItem('weekPendingCompletion', 'true');
    }
}

function toggleCompleted(dayId) {
    const checkbox = document.getElementById(dayId);
    if (!checkbox) return;

    localStorage.setItem(dayId, checkbox.checked);

    if (checkbox.checked) {
        checkbox.disabled = true;
        const row = checkbox.closest('tr');
        if (row) row.classList.add('completed-row');
        startWeekIfNotStarted();
    }

    updateProgressImage();
    updateCaloriesForDay(dayId);
    updateTotalCalories();

    // Check if all workouts are complete
    if (dayId === lastWorkoutDay && checkbox.checked && checkAllWorkoutsComplete()) {
        localStorage.setItem('weekPendingCompletion', 'true');
        alert('أحسنت! أتممت جميع تمارين الأسبوع. سجّل وزنك في سجل الوزن لحفظ بيانات الأسبوع.');
    }
}

function updateProgressImage() {
    const daysCount = 6;
    let completed = 0;

    for (let i = 0; i < daysCount; i++) {
        if (localStorage.getItem('day' + i) === 'true') completed++;
    }

    const ratio = completed / daysCount;
    const bodyShape = document.getElementById('bodyShape');

    if (bodyShape) {
        // Animate body shape based on progress
        // Start: rx=25, ry=35 (wider)
        // End: rx=18, ry=30 (slimmer)
        const startRx = 25, endRx = 18;
        const startRy = 35, endRy = 30;

        const currentRx = startRx - (ratio * (startRx - endRx));
        const currentRy = startRy - (ratio * (startRy - endRy));

        bodyShape.setAttribute('rx', currentRx);
        bodyShape.setAttribute('ry', currentRy);

        // Change color based on progress
        if (ratio >= 0.83) {
            bodyShape.setAttribute('fill', '#00ff88');
        } else if (ratio >= 0.5) {
            bodyShape.setAttribute('fill', '#00bfff');
        }
    }

    updateProgressBar(ratio, completed, daysCount);
}

function updateProgressBar(ratio, completed, total) {
    const bar = document.getElementById('progressBar');
    const label = document.getElementById('progressLabel');

    if (bar && label) {
        const percentage = Math.round(ratio * 100);
        bar.style.width = percentage + '%';
        label.textContent = `${completed} من ${total} يوم مكتمل (${percentage}%)`;
    }
}

function updateCaloriesForDay(dayId) {
    const dayNum = dayId.replace('day', '');
    const calCell = document.getElementById('calDay' + dayNum);
    if (!calCell || !caloriesMap.hasOwnProperty(dayId)) return;

    const checkbox = document.getElementById(dayId);
    if (!checkbox) return;

    const storageKey = 'calories_' + dayId;

    if (checkbox.checked) {
        const calories = caloriesMap[dayId];
        calCell.textContent = calories + ' سعرة';
        localStorage.setItem(storageKey, calories);
    } else {
        calCell.textContent = '—';
        localStorage.removeItem(storageKey);
    }
}

function updateTotalCalories() {
    let total = 0;

    Object.keys(caloriesMap).forEach(key => {
        const stored = localStorage.getItem('calories_' + key);
        if (stored) total += parseInt(stored, 10);
    });

    const weeklyEl = document.getElementById('weeklyCalories');
    if (weeklyEl) weeklyEl.textContent = total;
}

function checkAllWorkoutsComplete() {
    for (const key in caloriesMap) {
        const checkbox = document.getElementById(key);
        if (checkbox && !checkbox.checked) return false;
    }
    return true;
}

// ==========================================
// Week Management
// ==========================================

function startWeekIfNotStarted() {
    if (!localStorage.getItem(currentWeekStartKey)) {
        localStorage.setItem(currentWeekStartKey, new Date().toISOString());
        const currentWeight = localStorage.getItem('userWeight') || '';
        localStorage.setItem(currentWeekInitialWeightKey, currentWeight);
    }
}

function finishWeek() {
    const startDate = localStorage.getItem(currentWeekStartKey);
    if (!startDate) return;

    const endDate = new Date().toISOString();
    let totalCalories = 0;

    Object.keys(caloriesMap).forEach(key => {
        const stored = localStorage.getItem('calories_' + key);
        if (stored) totalCalories += parseInt(stored, 10);
    });

    const initialWeight = parseFloat(localStorage.getItem(currentWeekInitialWeightKey) || '0');
    const finalWeight = parseFloat(localStorage.getItem('userWeight') || '0');

    let weekLogs = [];
    const logsRaw = localStorage.getItem(weekLogsKey);
    if (logsRaw) {
        try {
            weekLogs = JSON.parse(logsRaw);
        } catch (e) {
            weekLogs = [];
        }
    }

    weekLogs.push({
        week: weekLogs.length + 1,
        startDate: startDate,
        endDate: endDate,
        calories: totalCalories,
        initialWeight: initialWeight,
        finalWeight: finalWeight
    });

    localStorage.setItem(weekLogsKey, JSON.stringify(weekLogs));
    localStorage.removeItem(currentWeekStartKey);
    localStorage.removeItem(currentWeekInitialWeightKey);
    localStorage.setItem('weekPendingCompletion', 'false');

    clearWeekProgress();
    updateTotalCalories();
    updateProgressImage();
    loadWeekLogs();
}

function clearWeekProgress() {
    for (const key in caloriesMap) {
        localStorage.removeItem(key);
        localStorage.removeItem('calories_' + key);

        const checkbox = document.getElementById(key);
        if (checkbox) {
            checkbox.checked = false;
            checkbox.disabled = false;
            const row = checkbox.closest('tr');
            if (row) row.classList.remove('completed-row');
        }

        updateCaloriesForDay(key);
    }
}

function loadWeekLogs() {
    const tableBody = document.querySelector('#weekLogTable tbody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    let logs = [];
    const logsRaw = localStorage.getItem(weekLogsKey);
    if (logsRaw) {
        try {
            logs = JSON.parse(logsRaw);
        } catch (e) {
            logs = [];
        }
    }

    logs.forEach(log => {
        const weightDiff = log.finalWeight - log.initialWeight;
        const diffText = weightDiff > 0 ? `+${weightDiff.toFixed(1)}` : weightDiff.toFixed(1);
        const diffClass = weightDiff > 0 ? 'weight-gain' : weightDiff < 0 ? 'weight-loss' : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${log.week}</td>
            <td>${formatDate(log.startDate)}</td>
            <td>${formatDate(log.endDate)}</td>
            <td>${log.calories} سعرة</td>
            <td>${log.initialWeight} كجم</td>
            <td>${log.finalWeight} كجم</td>
            <td class="${diffClass}">${diffText} كجم</td>
        `;
        tableBody.appendChild(tr);
    });
}

// ==========================================
// Weight Log Functions
// ==========================================

function loadWeightLogs() {
    const listEl = document.getElementById('weightLogList');
    listEl.innerHTML = '';

    let logs = [];
    const logsRaw = localStorage.getItem('weightLogs');
    if (logsRaw) {
        try {
            logs = JSON.parse(logsRaw);
        } catch (e) {
            logs = [];
        }
    }

    // Show latest first
    logs.slice().reverse().forEach(log => {
        const li = document.createElement('li');
        const date = new Date(log.date);
        const formattedDate = date.toLocaleDateString('ar-SA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        li.textContent = `${formattedDate}: ${log.weight} كجم`;
        listEl.appendChild(li);
    });
}

function addWeightLog(event) {
    event.preventDefault();

    const input = document.getElementById('weightLogInput');
    const weightValue = input.value.trim();

    if (weightValue === '') {
        alert('يرجى إدخال الوزن');
        return;
    }

    let logs = [];
    const logsRaw = localStorage.getItem('weightLogs');
    if (logsRaw) {
        try {
            logs = JSON.parse(logsRaw);
        } catch (e) {
            logs = [];
        }
    }

    logs.push({
        date: new Date().toISOString(),
        weight: parseFloat(weightValue)
    });

    localStorage.setItem('weightLogs', JSON.stringify(logs));
    localStorage.setItem('userWeight', weightValue);

    // Update weight input field
    const weightInput = document.getElementById('weightInput');
    if (weightInput) weightInput.value = weightValue;

    // Refresh user info display
    const currentHeight = localStorage.getItem('userHeight');
    const currentAge = localStorage.getItem('userAge');
    if (currentHeight && currentAge) {
        displayUserInfo(weightValue, currentHeight, currentAge);
    }

    // Recalculate if all data available
    const gender = localStorage.getItem('userGender');
    const activity = localStorage.getItem('userActivity');
    const goal = localStorage.getItem('userGoal');
    if (currentHeight && currentAge && gender && activity && goal) {
        updateCalorieCalculator(
            parseFloat(weightValue),
            parseFloat(currentHeight),
            parseInt(currentAge),
            gender,
            parseFloat(activity),
            goal
        );
    }

    updateProgressImage();
    input.value = '';
    loadWeightLogs();

    // Check if week is pending completion
    if (localStorage.getItem('weekPendingCompletion') === 'true') {
        finishWeek();
        alert('تم حفظ بيانات الأسبوع والانتقال للأسبوع الجديد!');
    }
}

// ==========================================
// Utility Functions
// ==========================================

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}
