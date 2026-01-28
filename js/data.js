/**
 * Data Management Module
 * Handles all localStorage operations and data state
 */

const DataManager = {
    // Storage Keys
    KEYS: {
        USER_DATA: 'userData',
        WEIGHT_LOGS: 'weightLogs',
        WEEK_LOGS: 'weekLogs',
        CURRENT_WEEK: 'currentWeek',
        BADGES: 'unlockedBadges',
        STREAK: 'streakData',
        SETTINGS: 'appSettings'
    },

    // Default Values
    defaults: {
        userData: null,
        weightLogs: [],
        weekLogs: [],
        currentWeek: null,
        unlockedBadges: [],
        streakData: {
            current: 0,
            longest: 0,
            lastActiveDate: null
        },
        appSettings: {
            notifications: true,
            soundEffects: true
        }
    },

    /**
     * Initialize data manager
     */
    init() {
        // Ensure all required keys exist
        Object.keys(this.KEYS).forEach(key => {
            const storageKey = this.KEYS[key];
            if (localStorage.getItem(storageKey) === null) {
                const defaultKey = key.charAt(0).toLowerCase() + key.slice(1).replace(/_([a-z])/g, (g) => g[1].toUpperCase());
                this.save(storageKey, this.defaults[defaultKey] || null);
            }
        });
    },

    /**
     * Save data to localStorage
     */
    save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving data:', error);
            return false;
        }
    },

    /**
     * Load data from localStorage
     */
    load(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error loading data:', error);
            return null;
        }
    },

    /**
     * Remove data from localStorage
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing data:', error);
            return false;
        }
    },

    // ==================== User Data ====================

    /**
     * Save user profile data
     */
    saveUserData(data) {
        const userData = {
            weight: parseFloat(data.weight),
            height: parseFloat(data.height),
            age: parseInt(data.age),
            gender: data.gender,
            goal: data.goal,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        return this.save(this.KEYS.USER_DATA, userData);
    },

    /**
     * Get user profile data
     */
    getUserData() {
        return this.load(this.KEYS.USER_DATA);
    },

    /**
     * Calculate BMI
     */
    calculateBMI(weight, height) {
        const heightInMeters = height / 100;
        return (weight / (heightInMeters * heightInMeters)).toFixed(1);
    },

    /**
     * Get BMI category and status
     */
    getBMIStatus(bmi) {
        const bmiNum = parseFloat(bmi);
        if (bmiNum < 18.5) {
            return { category: 'underweight', label: 'نحيف', color: '#00b4d8' };
        } else if (bmiNum < 25) {
            return { category: 'normal', label: 'طبيعي', color: '#00d9a5' };
        } else if (bmiNum < 30) {
            return { category: 'overweight', label: 'وزن زائد', color: '#ffc107' };
        } else {
            return { category: 'obese', label: 'سمنة', color: '#e94560' };
        }
    },

    /**
     * Calculate BMR (Basal Metabolic Rate)
     */
    calculateBMR(weight, height, age, gender) {
        // Mifflin-St Jeor Equation
        if (gender === 'male') {
            return (10 * weight) + (6.25 * height) - (5 * age) + 5;
        } else {
            return (10 * weight) + (6.25 * height) - (5 * age) - 161;
        }
    },

    /**
     * Calculate TDEE (Total Daily Energy Expenditure)
     */
    calculateTDEE(bmr, activityLevel = 'moderate') {
        const activityMultipliers = {
            sedentary: 1.2,      // Little or no exercise
            light: 1.375,        // Light exercise 1-3 days/week
            moderate: 1.55,      // Moderate exercise 3-5 days/week
            active: 1.725,       // Hard exercise 6-7 days/week
            veryActive: 1.9      // Very hard exercise & physical job
        };
        return Math.round(bmr * (activityMultipliers[activityLevel] || 1.55));
    },

    // ==================== Weight Logs ====================

    /**
     * Add weight log entry
     */
    addWeightLog(weight, date = null) {
        const logs = this.getWeightLogs();
        const entry = {
            id: Date.now(),
            weight: parseFloat(weight),
            date: date || new Date().toISOString().split('T')[0],
            createdAt: new Date().toISOString()
        };
        logs.push(entry);
        // Sort by date
        logs.sort((a, b) => new Date(a.date) - new Date(b.date));
        this.save(this.KEYS.WEIGHT_LOGS, logs);
        return entry;
    },

    /**
     * Get all weight logs
     */
    getWeightLogs() {
        return this.load(this.KEYS.WEIGHT_LOGS) || [];
    },

    /**
     * Get latest weight
     */
    getLatestWeight() {
        const logs = this.getWeightLogs();
        if (logs.length === 0) {
            const userData = this.getUserData();
            return userData ? userData.weight : null;
        }
        return logs[logs.length - 1].weight;
    },

    /**
     * Calculate weight change between two entries
     */
    calculateWeightChange(current, previous) {
        const change = current - previous;
        return {
            value: Math.abs(change).toFixed(1),
            direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
            percentage: ((change / previous) * 100).toFixed(1)
        };
    },

    // ==================== Week Management ====================

    /**
     * Create or get current week
     */
    getCurrentWeek() {
        let week = this.load(this.KEYS.CURRENT_WEEK);

        if (!week) {
            week = this.createNewWeek();
        }

        return week;
    },

    /**
     * Create a new week
     */
    createNewWeek() {
        const weekLogs = this.getWeekLogs();
        const weekNumber = weekLogs.length + 1;
        const today = new Date();

        // Find next Saturday (or today if it's Saturday)
        const startDate = new Date(today);
        const dayOfWeek = today.getDay();
        // If not Saturday, go back to last Saturday
        if (dayOfWeek !== 6) {
            startDate.setDate(today.getDate() - dayOfWeek - 1);
        }

        const week = {
            weekNumber: weekNumber,
            startDate: startDate.toISOString().split('T')[0],
            startWeight: this.getLatestWeight(),
            days: {
                day0: { completed: false, calories: 0 },
                day1: { completed: false, calories: 0 },
                day2: { completed: false, calories: 0 },
                day3: { completed: false, calories: 0 },
                day4: { completed: false, calories: 0 },
                day5: { completed: false, calories: 0 }
            },
            totalCalories: 0,
            isComplete: false,
            endWeight: null,
            endDate: null
        };

        this.save(this.KEYS.CURRENT_WEEK, week);
        return week;
    },

    /**
     * Mark a day as completed
     */
    completeDay(dayIndex, calories) {
        const week = this.getCurrentWeek();
        const dayKey = `day${dayIndex}`;

        if (week.days[dayKey] && !week.days[dayKey].completed) {
            week.days[dayKey].completed = true;
            week.days[dayKey].calories = calories;
            week.days[dayKey].completedAt = new Date().toISOString();

            // Recalculate total calories
            week.totalCalories = Object.values(week.days)
                .reduce((sum, day) => sum + (day.calories || 0), 0);

            // Check if week is complete
            const completedDays = Object.values(week.days)
                .filter(day => day.completed).length;

            if (completedDays === 6) {
                week.isComplete = true;
            }

            this.save(this.KEYS.CURRENT_WEEK, week);

            // Update streak
            this.updateStreak();

            return { success: true, week, completedDays };
        }

        return { success: false, week };
    },

    /**
     * Get completed days count
     */
    getCompletedDaysCount() {
        const week = this.getCurrentWeek();
        return Object.values(week.days).filter(day => day.completed).length;
    },

    /**
     * End current week and archive it
     */
    endWeek(endWeight) {
        const week = this.getCurrentWeek();

        week.endWeight = parseFloat(endWeight);
        week.endDate = new Date().toISOString().split('T')[0];
        week.weightChange = week.endWeight - week.startWeight;

        // Archive the week
        const weekLogs = this.getWeekLogs();
        weekLogs.push({...week});
        this.save(this.KEYS.WEEK_LOGS, weekLogs);

        // Add weight to logs
        this.addWeightLog(endWeight);

        // Create new week
        this.remove(this.KEYS.CURRENT_WEEK);
        const newWeek = this.createNewWeek();

        return { archivedWeek: week, newWeek };
    },

    /**
     * Get all week logs
     */
    getWeekLogs() {
        return this.load(this.KEYS.WEEK_LOGS) || [];
    },

    // ==================== Streak Management ====================

    /**
     * Update streak data
     */
    updateStreak() {
        const streakData = this.load(this.KEYS.STREAK) || this.defaults.streakData;
        const today = new Date().toISOString().split('T')[0];

        if (streakData.lastActiveDate === today) {
            // Already updated today
            return streakData;
        }

        const lastDate = streakData.lastActiveDate ? new Date(streakData.lastActiveDate) : null;
        const todayDate = new Date(today);

        if (lastDate) {
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                // Consecutive day
                streakData.current += 1;
            } else if (diffDays > 1) {
                // Streak broken
                streakData.current = 1;
            }
        } else {
            streakData.current = 1;
        }

        // Update longest streak
        if (streakData.current > streakData.longest) {
            streakData.longest = streakData.current;
        }

        streakData.lastActiveDate = today;
        this.save(this.KEYS.STREAK, streakData);

        return streakData;
    },

    /**
     * Get current streak
     */
    getStreak() {
        const streakData = this.load(this.KEYS.STREAK) || this.defaults.streakData;

        // Check if streak should be reset (no activity yesterday)
        const today = new Date().toISOString().split('T')[0];
        const lastDate = streakData.lastActiveDate ? new Date(streakData.lastActiveDate) : null;

        if (lastDate) {
            const todayDate = new Date(today);
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

            if (diffDays > 1) {
                streakData.current = 0;
                this.save(this.KEYS.STREAK, streakData);
            }
        }

        return streakData;
    },

    // ==================== Statistics ====================

    /**
     * Get overall statistics
     */
    getOverallStats() {
        const weekLogs = this.getWeekLogs();
        const weightLogs = this.getWeightLogs();
        const userData = this.getUserData();
        const currentWeek = this.getCurrentWeek();

        // Total completed weeks
        const totalWeeks = weekLogs.length;

        // Total workouts (each week has 6 workout days)
        const totalWorkouts = weekLogs.reduce((sum, week) => {
            return sum + Object.values(week.days).filter(d => d.completed).length;
        }, 0) + this.getCompletedDaysCount();

        // Total calories burned
        const totalCalories = weekLogs.reduce((sum, week) => sum + week.totalCalories, 0)
            + currentWeek.totalCalories;

        // Weight change from start
        let weightChange = 0;
        if (userData && weightLogs.length > 0) {
            const latestWeight = weightLogs[weightLogs.length - 1].weight;
            weightChange = (userData.weight - latestWeight).toFixed(1);
        }

        return {
            totalWeeks,
            totalWorkouts,
            totalCalories,
            weightChange
        };
    },

    /**
     * Get weekly calories data for charts
     */
    getWeeklyCaloriesData() {
        const weekLogs = this.getWeekLogs();
        const currentWeek = this.getCurrentWeek();

        const data = weekLogs.map(week => ({
            label: `الأسبوع ${week.weekNumber}`,
            value: week.totalCalories
        }));

        // Add current week
        data.push({
            label: `الأسبوع ${currentWeek.weekNumber}`,
            value: currentWeek.totalCalories,
            current: true
        });

        return data;
    },

    /**
     * Get weight trend data for charts
     */
    getWeightTrendData() {
        const logs = this.getWeightLogs();
        const userData = this.getUserData();

        const data = [];

        // Add initial weight
        if (userData) {
            data.push({
                date: userData.createdAt.split('T')[0],
                weight: userData.weight,
                label: 'البداية'
            });
        }

        // Add weight logs
        logs.forEach((log, index) => {
            data.push({
                date: log.date,
                weight: log.weight,
                label: `قياس ${index + 1}`
            });
        });

        return data;
    },

    // ==================== Badges ====================

    /**
     * Get unlocked badges
     */
    getUnlockedBadges() {
        return this.load(this.KEYS.BADGES) || [];
    },

    /**
     * Unlock a badge
     */
    unlockBadge(badgeId) {
        const badges = this.getUnlockedBadges();
        if (!badges.includes(badgeId)) {
            badges.push(badgeId);
            this.save(this.KEYS.BADGES, badges);
            return true;
        }
        return false;
    },

    /**
     * Check if badge is unlocked
     */
    isBadgeUnlocked(badgeId) {
        return this.getUnlockedBadges().includes(badgeId);
    },

    // ==================== Utilities ====================

    /**
     * Format date to Arabic
     */
    formatDateArabic(dateString) {
        const date = new Date(dateString);
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        };
        return date.toLocaleDateString('ar-SA', options);
    },

    /**
     * Format short date
     */
    formatShortDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-SA', {
            month: 'short',
            day: 'numeric'
        });
    },

    /**
     * Export all data
     */
    exportData() {
        const data = {
            userData: this.getUserData(),
            weightLogs: this.getWeightLogs(),
            weekLogs: this.getWeekLogs(),
            currentWeek: this.getCurrentWeek(),
            badges: this.getUnlockedBadges(),
            streak: this.getStreak(),
            exportedAt: new Date().toISOString()
        };

        return JSON.stringify(data, null, 2);
    },

    /**
     * Import data
     */
    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            if (data.userData) this.save(this.KEYS.USER_DATA, data.userData);
            if (data.weightLogs) this.save(this.KEYS.WEIGHT_LOGS, data.weightLogs);
            if (data.weekLogs) this.save(this.KEYS.WEEK_LOGS, data.weekLogs);
            if (data.currentWeek) this.save(this.KEYS.CURRENT_WEEK, data.currentWeek);
            if (data.badges) this.save(this.KEYS.BADGES, data.badges);
            if (data.streak) this.save(this.KEYS.STREAK, data.streak);

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    /**
     * Clear all data
     */
    clearAllData() {
        Object.values(this.KEYS).forEach(key => {
            this.remove(key);
        });
        this.init();
    }
};

// Initialize on load
DataManager.init();
