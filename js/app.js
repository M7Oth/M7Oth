/**
 * Main Application Module
 * Fitness Tracker App
 */

const App = {
    // State
    isInitialized: false,
    currentUser: null,
    currentWeek: null,

    /**
     * Initialize the application
     */
    init() {
        // Show loading screen
        this.showLoading();

        // Initialize data manager
        DataManager.init();

        // Load user data
        this.currentUser = DataManager.getUserData();
        this.currentWeek = DataManager.getCurrentWeek();

        // Setup event listeners
        this.setupEventListeners();

        // Render UI based on state
        this.renderUI();

        // Hide loading and show app
        setTimeout(() => {
            this.hideLoading();
            this.isInitialized = true;
        }, 800);
    },

    /**
     * Show loading screen
     */
    showLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        const app = document.getElementById('app');
        if (loadingScreen) loadingScreen.classList.remove('hidden');
        if (app) app.classList.add('hidden');
    },

    /**
     * Hide loading screen
     */
    hideLoading() {
        const loadingScreen = document.getElementById('loading-screen');
        const app = document.getElementById('app');
        if (loadingScreen) loadingScreen.classList.add('hidden');
        if (app) app.classList.remove('hidden');
    },

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // User form
        const userForm = document.getElementById('user-form');
        if (userForm) {
            userForm.addEventListener('submit', (e) => this.handleUserFormSubmit(e));
        }

        // Edit user button
        const editUserBtn = document.getElementById('edit-user-btn');
        if (editUserBtn) {
            editUserBtn.addEventListener('click', () => this.toggleUserEdit());
        }

        // Weight form
        const weightForm = document.getElementById('weight-form');
        if (weightForm) {
            weightForm.addEventListener('submit', (e) => this.handleWeightFormSubmit(e));
        }

        // Add weight button
        const addWeightBtn = document.getElementById('add-weight-btn');
        if (addWeightBtn) {
            addWeightBtn.addEventListener('click', () => this.toggleWeightForm());
        }

        // Cancel weight button
        const cancelWeightBtn = document.getElementById('cancel-weight-btn');
        if (cancelWeightBtn) {
            cancelWeightBtn.addEventListener('click', () => this.toggleWeightForm(false));
        }

        // Save week button
        const saveWeekBtn = document.getElementById('save-week-btn');
        if (saveWeekBtn) {
            saveWeekBtn.addEventListener('click', () => this.handleEndWeek());
        }

        // Achievement modal close
        const closeAchievement = document.getElementById('close-achievement');
        if (closeAchievement) {
            closeAchievement.addEventListener('click', () => this.closeAchievementModal());
        }

        // Exercise checkboxes (delegated)
        const exercisesTbody = document.getElementById('exercises-tbody');
        if (exercisesTbody) {
            exercisesTbody.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    this.handleExerciseComplete(e.target);
                }
            });
        }

        // Set default date for weight form
        const weightDate = document.getElementById('weight-date');
        if (weightDate) {
            weightDate.value = new Date().toISOString().split('T')[0];
        }
    },

    /**
     * Render UI based on current state
     */
    renderUI() {
        if (this.currentUser) {
            // User exists, show dashboard
            this.showDashboard();
        } else {
            // New user, show form
            this.showUserForm();
        }
    },

    /**
     * Show user input form
     */
    showUserForm() {
        const userForm = document.getElementById('user-form');
        const userDisplay = document.getElementById('user-display');
        const editBtn = document.getElementById('edit-user-btn');

        if (userForm) userForm.classList.remove('hidden');
        if (userDisplay) userDisplay.classList.add('hidden');
        if (editBtn) editBtn.classList.add('hidden');

        // Hide other sections until user data is saved
        this.hideDashboardSections();
    },

    /**
     * Hide dashboard sections
     */
    hideDashboardSections() {
        const sections = ['body-section', 'week-section', 'weight-log-section',
                          'stats-section', 'weeks-log-section', 'badges-section'];

        sections.forEach(id => {
            const section = document.getElementById(id);
            if (section) section.classList.add('hidden');
        });
    },

    /**
     * Show dashboard with all sections
     */
    showDashboard() {
        // Show user display
        this.showUserDisplay();

        // Update body visualization
        this.updateBodyVisualization();

        // Show week section
        this.showWeekSection();

        // Show other sections
        this.showSection('weight-log-section');
        this.showSection('stats-section');
        this.showSection('weeks-log-section');
        this.showSection('badges-section');

        // Update all displays
        this.updateWeightLog();
        this.updateStats();
        this.updateWeeksLog();
        this.updateBadges();
        this.updateStreak();

        // Initialize charts
        ChartsManager.init();
    },

    /**
     * Show user display (not form)
     */
    showUserDisplay() {
        const userForm = document.getElementById('user-form');
        const userDisplay = document.getElementById('user-display');
        const editBtn = document.getElementById('edit-user-btn');

        if (userForm) userForm.classList.add('hidden');
        if (userDisplay) userDisplay.classList.remove('hidden');
        if (editBtn) editBtn.classList.remove('hidden');

        // Populate display
        this.populateUserDisplay();
    },

    /**
     * Populate user display with data
     */
    populateUserDisplay() {
        if (!this.currentUser) return;

        const weight = document.getElementById('display-weight');
        const height = document.getElementById('display-height');
        const age = document.getElementById('display-age');
        const bmi = document.getElementById('display-bmi');
        const bmiMarker = document.getElementById('bmi-marker');
        const bmiStatus = document.getElementById('bmi-status');

        const currentWeight = DataManager.getLatestWeight() || this.currentUser.weight;
        const bmiValue = DataManager.calculateBMI(currentWeight, this.currentUser.height);
        const bmiInfo = DataManager.getBMIStatus(bmiValue);

        if (weight) weight.textContent = currentWeight;
        if (height) height.textContent = this.currentUser.height;
        if (age) age.textContent = this.currentUser.age;
        if (bmi) bmi.textContent = bmiValue;

        // Position BMI marker (BMI range 15-40)
        if (bmiMarker) {
            const percentage = Math.min(Math.max((bmiValue - 15) / 25 * 100, 0), 100);
            bmiMarker.style.right = `${percentage}%`;
        }

        // Set BMI status text
        if (bmiStatus) {
            bmiStatus.textContent = `حالتك: ${bmiInfo.label}`;
            bmiStatus.style.borderColor = bmiInfo.color;
        }
    },

    /**
     * Toggle user edit mode
     */
    toggleUserEdit() {
        const userForm = document.getElementById('user-form');
        const userDisplay = document.getElementById('user-display');

        if (userForm.classList.contains('hidden')) {
            // Show form with current data
            if (this.currentUser) {
                document.getElementById('weight').value = this.currentUser.weight;
                document.getElementById('height').value = this.currentUser.height;
                document.getElementById('age').value = this.currentUser.age;
                document.getElementById('gender').value = this.currentUser.gender;
                document.getElementById('goal').value = this.currentUser.goal;
            }
            userForm.classList.remove('hidden');
            userDisplay.classList.add('hidden');
        } else {
            userForm.classList.add('hidden');
            userDisplay.classList.remove('hidden');
        }
    },

    /**
     * Handle user form submission
     */
    handleUserFormSubmit(e) {
        e.preventDefault();

        const formData = {
            weight: document.getElementById('weight').value,
            height: document.getElementById('height').value,
            age: document.getElementById('age').value,
            gender: document.getElementById('gender').value,
            goal: document.getElementById('goal').value,
            createdAt: this.currentUser ? this.currentUser.createdAt : new Date().toISOString()
        };

        // Validate
        if (!formData.weight || !formData.height || !formData.age) {
            this.showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
            return;
        }

        // Save data
        DataManager.saveUserData(formData);
        this.currentUser = DataManager.getUserData();

        // If first time, add initial weight log
        const weightLogs = DataManager.getWeightLogs();
        if (weightLogs.length === 0) {
            DataManager.addWeightLog(formData.weight);
        }

        // Initialize current week if needed
        this.currentWeek = DataManager.getCurrentWeek();

        // Update UI
        this.showDashboard();
        this.showToast('تم حفظ البيانات بنجاح!', 'success');
    },

    /**
     * Show a section
     */
    showSection(sectionId) {
        const section = document.getElementById(sectionId);
        if (section) section.classList.remove('hidden');
    },

    /**
     * Update body visualization
     */
    updateBodyVisualization() {
        this.showSection('body-section');

        const stats = DataManager.getOverallStats();
        const completedWeeks = stats.totalWeeks;
        const completedDays = DataManager.getCompletedDaysCount();

        // Update stage display
        const stages = document.querySelectorAll('.stage');
        const progress1 = document.getElementById('body-progress');
        const progress2 = document.getElementById('body-progress-2');

        // Calculate stage (1, 2, or 3) based on weeks and BMI
        let stage = 1;
        let progress1Value = 0;
        let progress2Value = 0;

        if (completedWeeks >= 8) {
            stage = 3;
            progress1Value = 100;
            progress2Value = 100;
        } else if (completedWeeks >= 4) {
            stage = 2;
            progress1Value = 100;
            progress2Value = Math.min((completedWeeks - 4) / 4 * 100, 100);
        } else if (completedWeeks >= 1) {
            stage = 2;
            progress1Value = Math.min(completedWeeks / 4 * 100, 100);
        } else {
            // Within first week
            progress1Value = Math.min(completedDays / 6 * 50, 50);
        }

        // Update stage classes
        stages.forEach((stageEl, index) => {
            stageEl.classList.remove('active', 'completed');
            if (index + 1 < stage) {
                stageEl.classList.add('completed');
            } else if (index + 1 === stage) {
                stageEl.classList.add('active');
            }
        });

        // Update progress bars
        if (progress1) progress1.style.width = `${progress1Value}%`;
        if (progress2) progress2.style.width = `${progress2Value}%`;

        // Update stage message
        const stageMessage = document.getElementById('stage-message');
        const messages = {
            1: 'أنت في البداية. كل خطوة تقربك من هدفك!',
            2: 'تقدم رائع! جسمك يتغير للأفضل.',
            3: 'مذهل! أنت تقترب من الشكل المثالي!'
        };
        if (stageMessage) {
            stageMessage.textContent = messages[stage];
        }

        // Update stats
        const completedWeeksEl = document.getElementById('completed-weeks');
        const totalCaloriesEl = document.getElementById('total-calories');

        if (completedWeeksEl) completedWeeksEl.textContent = completedWeeks;
        if (totalCaloriesEl) totalCaloriesEl.textContent = stats.totalCalories.toLocaleString('ar-SA');
    },

    /**
     * Show week section with exercises
     */
    showWeekSection() {
        this.showSection('week-section');
        this.currentWeek = DataManager.getCurrentWeek();

        // Update week info
        const weekNumber = document.getElementById('week-number');
        const weekDates = document.getElementById('week-dates');

        if (weekNumber) weekNumber.textContent = `الأسبوع ${this.currentWeek.weekNumber}`;
        if (weekDates && this.currentWeek.startDate) {
            weekDates.textContent = DataManager.formatShortDate(this.currentWeek.startDate);
        }

        // Update summary
        this.updateWeekSummary();

        // Generate exercises table
        const tbody = document.getElementById('exercises-tbody');
        if (tbody) {
            tbody.innerHTML = ExercisesManager.generateExerciseTable(this.currentWeek);
        }

        // Check if week is complete
        this.checkWeekCompletion();
    },

    /**
     * Update week summary display
     */
    updateWeekSummary() {
        const completedDays = DataManager.getCompletedDaysCount();
        const progress = Math.round((completedDays / 6) * 100);

        const daysCompleted = document.getElementById('days-completed');
        const weekCalories = document.getElementById('week-calories');
        const weekProgress = document.getElementById('week-progress');
        const progressFill = document.getElementById('week-progress-fill');

        if (daysCompleted) daysCompleted.textContent = `${completedDays}/6`;
        if (weekCalories) weekCalories.textContent = this.currentWeek.totalCalories.toLocaleString('ar-SA');
        if (weekProgress) weekProgress.textContent = `${progress}%`;
        if (progressFill) progressFill.style.width = `${progress}%`;
    },

    /**
     * Handle exercise completion
     */
    handleExerciseComplete(checkbox) {
        const dayIndex = parseInt(checkbox.dataset.day);
        const calories = parseInt(checkbox.dataset.calories);

        // Show confirmation
        if (!checkbox.checked) return;

        // Complete the day
        const result = DataManager.completeDay(dayIndex, calories);

        if (result.success) {
            // Update UI
            this.currentWeek = result.week;

            // Disable checkbox
            checkbox.disabled = true;

            // Update row styling
            const row = checkbox.closest('tr');
            if (row) row.classList.add('completed');

            // Update summary
            this.updateWeekSummary();

            // Update body visualization
            this.updateBodyVisualization();

            // Check for achievements
            this.checkAchievements();

            // Update streak
            this.updateStreak();

            // Update charts
            ChartsManager.updateCaloriesChart();

            // Show toast
            this.showToast(`أحسنت! حرقت ${calories} سعرة حرارية 🔥`, 'success');

            // Check week completion
            this.checkWeekCompletion();
        }
    },

    /**
     * Check if week is complete
     */
    checkWeekCompletion() {
        const completedDays = DataManager.getCompletedDaysCount();

        if (completedDays === 6) {
            // Show week complete prompt
            const prompt = document.getElementById('week-complete-prompt');
            if (prompt) {
                prompt.classList.remove('hidden');
                // Set suggested weight
                const weightInput = document.getElementById('end-week-weight');
                if (weightInput) {
                    weightInput.value = DataManager.getLatestWeight();
                }
            }
        }
    },

    /**
     * Handle end of week
     */
    handleEndWeek() {
        const weightInput = document.getElementById('end-week-weight');
        const weight = weightInput ? parseFloat(weightInput.value) : null;

        if (!weight || weight < 30 || weight > 300) {
            this.showToast('يرجى إدخال وزن صحيح', 'error');
            return;
        }

        // End week and start new one
        const result = DataManager.endWeek(weight);

        // Update state
        this.currentWeek = result.newWeek;

        // Hide prompt
        const prompt = document.getElementById('week-complete-prompt');
        if (prompt) prompt.classList.add('hidden');

        // Refresh UI
        this.showWeekSection();
        this.updateWeightLog();
        this.updateWeeksLog();
        this.updateStats();
        this.updateBodyVisualization();
        this.updateBadges();

        // Update charts
        ChartsManager.updateAll();

        // Check achievements
        this.checkAchievements();

        // Show toast
        this.showToast('مبروك! تم حفظ الأسبوع وبدء أسبوع جديد 🎉', 'success');
    },

    /**
     * Toggle weight form visibility
     */
    toggleWeightForm(show = null) {
        const container = document.getElementById('weight-form-container');
        if (!container) return;

        if (show === null) {
            container.classList.toggle('hidden');
        } else if (show) {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
    },

    /**
     * Handle weight form submission
     */
    handleWeightFormSubmit(e) {
        e.preventDefault();

        const weightInput = document.getElementById('new-weight');
        const dateInput = document.getElementById('weight-date');

        const weight = weightInput ? parseFloat(weightInput.value) : null;
        const date = dateInput ? dateInput.value : null;

        if (!weight || weight < 30 || weight > 300) {
            this.showToast('يرجى إدخال وزن صحيح', 'error');
            return;
        }

        // Add weight log
        DataManager.addWeightLog(weight, date);

        // Update UI
        this.updateWeightLog();
        this.populateUserDisplay();
        this.updateStats();
        ChartsManager.updateWeightChart();

        // Hide form
        this.toggleWeightForm(false);

        // Reset form
        weightInput.value = '';
        dateInput.value = new Date().toISOString().split('T')[0];

        // Check achievements
        this.checkAchievements();

        this.showToast('تم تسجيل الوزن بنجاح', 'success');
    },

    /**
     * Update weight log display
     */
    updateWeightLog() {
        const tbody = document.getElementById('weight-log-tbody');
        if (!tbody) return;

        const logs = DataManager.getWeightLogs();

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">لا توجد سجلات بعد</td></tr>';
            return;
        }

        let html = '';
        logs.slice().reverse().forEach((log, index, arr) => {
            const prevLog = arr[index + 1];
            let changeHtml = '-';

            if (prevLog) {
                const change = DataManager.calculateWeightChange(log.weight, prevLog.weight);
                const sign = change.direction === 'up' ? '+' : change.direction === 'down' ? '-' : '';
                const colorClass = change.direction === 'up' ? 'positive' :
                                   change.direction === 'down' ? 'negative' : 'neutral';
                changeHtml = `<span class="weight-change ${colorClass}">${sign}${change.value} كجم</span>`;
            }

            html += `
                <tr>
                    <td>${DataManager.formatShortDate(log.date)}</td>
                    <td><strong>${log.weight}</strong> كجم</td>
                    <td>${changeHtml}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    },

    /**
     * Update weeks log display
     */
    updateWeeksLog() {
        const container = document.getElementById('weeks-log-list');
        if (!container) return;

        const logs = DataManager.getWeekLogs();

        if (logs.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">لم تكمل أي أسبوع بعد. استمر في التمارين!</p>';
            return;
        }

        let html = '';
        logs.slice().reverse().forEach(week => {
            const weightChange = week.weightChange || 0;
            const changeSign = weightChange > 0 ? '+' : '';
            const changeColor = weightChange > 0 ? 'var(--accent-primary)' :
                               weightChange < 0 ? 'var(--accent-success)' : 'var(--text-muted)';

            html += `
                <div class="week-log-item">
                    <div class="week-log-number">${week.weekNumber}</div>
                    <div class="week-log-details">
                        <h4>الأسبوع ${week.weekNumber}</h4>
                        <p>${DataManager.formatShortDate(week.startDate)} - ${DataManager.formatShortDate(week.endDate)}</p>
                    </div>
                    <div class="week-log-stats">
                        <span class="stat">🔥 <strong>${week.totalCalories.toLocaleString('ar-SA')}</strong> سعرة</span>
                        <span class="stat" style="color: ${changeColor}">
                            ⚖️ <strong>${changeSign}${weightChange.toFixed(1)}</strong> كجم
                        </span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    /**
     * Update overall stats display
     */
    updateStats() {
        const stats = DataManager.getOverallStats();

        const totalWeeks = document.getElementById('total-weeks');
        const totalWorkouts = document.getElementById('total-workouts');
        const allTimeCalories = document.getElementById('all-time-calories');
        const weightLost = document.getElementById('weight-lost');

        if (totalWeeks) totalWeeks.textContent = stats.totalWeeks;
        if (totalWorkouts) totalWorkouts.textContent = stats.totalWorkouts;
        if (allTimeCalories) allTimeCalories.textContent = stats.totalCalories.toLocaleString('ar-SA');
        if (weightLost) {
            const sign = stats.weightChange > 0 ? '-' : '+';
            weightLost.textContent = `${sign}${Math.abs(stats.weightChange)}`;
        }
    },

    /**
     * Update badges display
     */
    updateBadges() {
        const grid = document.getElementById('badges-grid');
        if (grid) {
            grid.innerHTML = BadgesManager.generateBadgesHTML();
        }

        // Update level
        const stats = DataManager.getOverallStats();
        const level = BadgesManager.getCurrentLevel(stats.totalWeeks);
        const nextLevel = BadgesManager.getNextLevel(stats.totalWeeks);
        const progress = BadgesManager.getLevelProgress(stats.totalWeeks);

        const levelIcon = document.getElementById('level-icon');
        const levelName = document.getElementById('level-name');
        const levelFill = document.getElementById('level-fill');
        const levelInfo = document.getElementById('level-info');

        if (levelIcon) levelIcon.textContent = level.icon;
        if (levelName) levelName.textContent = level.name;
        if (levelFill) levelFill.style.width = `${progress.percentage}%`;
        if (levelInfo) {
            if (nextLevel) {
                levelInfo.textContent = `أكمل ${nextLevel.minWeeks - stats.totalWeeks} أسبوع للترقية إلى "${nextLevel.name}"`;
            } else {
                levelInfo.textContent = 'وصلت للمستوى الأعلى! أنت أسطورة!';
            }
        }
    },

    /**
     * Update streak display
     */
    updateStreak() {
        const streakData = DataManager.getStreak();
        const streakCount = document.getElementById('streak-count');

        if (streakCount) {
            streakCount.textContent = streakData.current;
        }
    },

    /**
     * Check and award achievements
     */
    checkAchievements() {
        const stats = DataManager.getOverallStats();
        const streak = DataManager.getStreak();

        const newBadges = BadgesManager.checkBadges(stats, streak);

        if (newBadges.length > 0) {
            // Show achievement for the first new badge
            this.showAchievementModal(newBadges[0]);
        }

        // Update badges display
        this.updateBadges();
    },

    /**
     * Show achievement modal
     */
    showAchievementModal(badge) {
        const modal = document.getElementById('achievement-modal');
        const icon = document.getElementById('achievement-icon');
        const title = document.getElementById('achievement-title');
        const description = document.getElementById('achievement-description');

        if (icon) icon.textContent = badge.icon;
        if (title) title.textContent = badge.name;
        if (description) description.textContent = badge.description;
        if (modal) modal.classList.remove('hidden');
    },

    /**
     * Close achievement modal
     */
    closeAchievementModal() {
        const modal = document.getElementById('achievement-modal');
        if (modal) modal.classList.add('hidden');
    },

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);

        // Remove after animation
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
