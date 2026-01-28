/**
 * Badges & Achievements Module
 * Gamification system for motivation
 */

const BadgesManager = {
    // All available badges
    badges: [
        // Workout Milestones
        {
            id: 'first_workout',
            name: 'البداية',
            description: 'أكملت أول تمرين',
            icon: '🌟',
            category: 'workouts',
            requirement: { type: 'workouts', value: 1 }
        },
        {
            id: 'week_warrior',
            name: 'محارب الأسبوع',
            description: 'أكملت أسبوع كامل من التمارين',
            icon: '⚔️',
            category: 'workouts',
            requirement: { type: 'weeks', value: 1 }
        },
        {
            id: 'ten_workouts',
            name: 'عشرة تمارين',
            description: 'أكملت 10 تمارين',
            icon: '💪',
            category: 'workouts',
            requirement: { type: 'workouts', value: 10 }
        },
        {
            id: 'month_master',
            name: 'سيد الشهر',
            description: 'أكملت 4 أسابيع من التمارين',
            icon: '👑',
            category: 'workouts',
            requirement: { type: 'weeks', value: 4 }
        },
        {
            id: 'fifty_workouts',
            name: 'خمسون تمرين',
            description: 'أكملت 50 تمرين',
            icon: '🏆',
            category: 'workouts',
            requirement: { type: 'workouts', value: 50 }
        },
        {
            id: 'hundred_workouts',
            name: 'المئة',
            description: 'أكملت 100 تمرين',
            icon: '💯',
            category: 'workouts',
            requirement: { type: 'workouts', value: 100 }
        },

        // Streak Badges
        {
            id: 'streak_3',
            name: 'ثلاثة أيام متتالية',
            description: 'تمرنت 3 أيام متتالية',
            icon: '🔥',
            category: 'streak',
            requirement: { type: 'streak', value: 3 }
        },
        {
            id: 'streak_7',
            name: 'أسبوع متواصل',
            description: 'تمرنت 7 أيام متتالية',
            icon: '🌟',
            category: 'streak',
            requirement: { type: 'streak', value: 7 }
        },
        {
            id: 'streak_14',
            name: 'أسبوعان متواصلان',
            description: 'تمرنت 14 يوم متتالي',
            icon: '⭐',
            category: 'streak',
            requirement: { type: 'streak', value: 14 }
        },
        {
            id: 'streak_30',
            name: 'شهر بدون انقطاع',
            description: 'تمرنت 30 يوم متتالي',
            icon: '🌙',
            category: 'streak',
            requirement: { type: 'streak', value: 30 }
        },

        // Calories Badges
        {
            id: 'burn_1000',
            name: 'ألف سعرة',
            description: 'حرقت 1000 سعرة حرارية',
            icon: '🔥',
            category: 'calories',
            requirement: { type: 'calories', value: 1000 }
        },
        {
            id: 'burn_5000',
            name: 'خمسة آلاف سعرة',
            description: 'حرقت 5000 سعرة حرارية',
            icon: '💥',
            category: 'calories',
            requirement: { type: 'calories', value: 5000 }
        },
        {
            id: 'burn_10000',
            name: 'عشرة آلاف سعرة',
            description: 'حرقت 10,000 سعرة حرارية',
            icon: '🌋',
            category: 'calories',
            requirement: { type: 'calories', value: 10000 }
        },
        {
            id: 'burn_50000',
            name: 'خمسون ألف سعرة',
            description: 'حرقت 50,000 سعرة حرارية',
            icon: '☄️',
            category: 'calories',
            requirement: { type: 'calories', value: 50000 }
        },

        // Weight Goals
        {
            id: 'first_kg',
            name: 'الكيلو الأول',
            description: 'خسرت أول كيلو من وزنك',
            icon: '📉',
            category: 'weight',
            requirement: { type: 'weight_lost', value: 1 }
        },
        {
            id: 'five_kg',
            name: 'خمسة كيلو',
            description: 'خسرت 5 كيلو من وزنك',
            icon: '🎯',
            category: 'weight',
            requirement: { type: 'weight_lost', value: 5 }
        },
        {
            id: 'ten_kg',
            name: 'عشرة كيلو',
            description: 'خسرت 10 كيلو من وزنك',
            icon: '🏅',
            category: 'weight',
            requirement: { type: 'weight_lost', value: 10 }
        },

        // Special Badges
        {
            id: 'early_bird',
            name: 'الطائر المبكر',
            description: 'أكملت تمرين قبل الساعة 7 صباحاً',
            icon: '🌅',
            category: 'special',
            requirement: { type: 'special', value: 'early_bird' }
        },
        {
            id: 'night_owl',
            name: 'بومة الليل',
            description: 'أكملت تمرين بعد الساعة 10 مساءً',
            icon: '🦉',
            category: 'special',
            requirement: { type: 'special', value: 'night_owl' }
        },
        {
            id: 'consistent',
            name: 'الثابت',
            description: 'أكملت 12 أسبوع (3 أشهر)',
            icon: '🎖️',
            category: 'special',
            requirement: { type: 'weeks', value: 12 }
        },
        {
            id: 'dedicated',
            name: 'المخلص',
            description: 'أكملت 24 أسبوع (6 أشهر)',
            icon: '🏛️',
            category: 'special',
            requirement: { type: 'weeks', value: 24 }
        },
        {
            id: 'legend',
            name: 'أسطورة',
            description: 'أكملت 52 أسبوع (سنة كاملة)',
            icon: '👑',
            category: 'special',
            requirement: { type: 'weeks', value: 52 }
        }
    ],

    // Level System
    levels: [
        { level: 1, name: 'مبتدئ', icon: '🌱', minWeeks: 0 },
        { level: 2, name: 'متدرب', icon: '🌿', minWeeks: 2 },
        { level: 3, name: 'متمرس', icon: '🌳', minWeeks: 4 },
        { level: 4, name: 'متقدم', icon: '⚡', minWeeks: 8 },
        { level: 5, name: 'محترف', icon: '🔥', minWeeks: 12 },
        { level: 6, name: 'خبير', icon: '💎', minWeeks: 20 },
        { level: 7, name: 'أسطورة', icon: '👑', minWeeks: 30 },
        { level: 8, name: 'إله اللياقة', icon: '🏆', minWeeks: 52 }
    ],

    /**
     * Get all badges
     */
    getAllBadges() {
        return this.badges;
    },

    /**
     * Get badge by ID
     */
    getBadgeById(badgeId) {
        return this.badges.find(b => b.id === badgeId);
    },

    /**
     * Get badges by category
     */
    getBadgesByCategory(category) {
        return this.badges.filter(b => b.category === category);
    },

    /**
     * Check and award badges based on stats
     */
    checkBadges(stats, streak) {
        const newBadges = [];

        this.badges.forEach(badge => {
            if (DataManager.isBadgeUnlocked(badge.id)) return;

            let shouldUnlock = false;

            switch (badge.requirement.type) {
                case 'workouts':
                    shouldUnlock = stats.totalWorkouts >= badge.requirement.value;
                    break;
                case 'weeks':
                    shouldUnlock = stats.totalWeeks >= badge.requirement.value;
                    break;
                case 'streak':
                    shouldUnlock = streak.current >= badge.requirement.value ||
                                   streak.longest >= badge.requirement.value;
                    break;
                case 'calories':
                    shouldUnlock = stats.totalCalories >= badge.requirement.value;
                    break;
                case 'weight_lost':
                    shouldUnlock = parseFloat(stats.weightChange) >= badge.requirement.value;
                    break;
                case 'special':
                    shouldUnlock = this.checkSpecialBadge(badge.requirement.value);
                    break;
            }

            if (shouldUnlock) {
                DataManager.unlockBadge(badge.id);
                newBadges.push(badge);
            }
        });

        return newBadges;
    },

    /**
     * Check special badge conditions
     */
    checkSpecialBadge(type) {
        const now = new Date();
        const hour = now.getHours();

        switch (type) {
            case 'early_bird':
                return hour < 7;
            case 'night_owl':
                return hour >= 22;
            default:
                return false;
        }
    },

    /**
     * Get current level based on completed weeks
     */
    getCurrentLevel(completedWeeks) {
        let currentLevel = this.levels[0];

        for (const level of this.levels) {
            if (completedWeeks >= level.minWeeks) {
                currentLevel = level;
            } else {
                break;
            }
        }

        return currentLevel;
    },

    /**
     * Get next level info
     */
    getNextLevel(completedWeeks) {
        const currentLevel = this.getCurrentLevel(completedWeeks);
        const currentIndex = this.levels.findIndex(l => l.level === currentLevel.level);

        if (currentIndex < this.levels.length - 1) {
            return this.levels[currentIndex + 1];
        }

        return null; // Max level reached
    },

    /**
     * Calculate progress to next level
     */
    getLevelProgress(completedWeeks) {
        const currentLevel = this.getCurrentLevel(completedWeeks);
        const nextLevel = this.getNextLevel(completedWeeks);

        if (!nextLevel) {
            return { current: completedWeeks, needed: completedWeeks, percentage: 100 };
        }

        const progressInLevel = completedWeeks - currentLevel.minWeeks;
        const totalNeeded = nextLevel.minWeeks - currentLevel.minWeeks;
        const percentage = Math.round((progressInLevel / totalNeeded) * 100);

        return {
            current: progressInLevel,
            needed: totalNeeded,
            percentage: Math.min(percentage, 100)
        };
    },

    /**
     * Generate badges grid HTML
     */
    generateBadgesHTML() {
        const unlockedBadges = DataManager.getUnlockedBadges();
        let html = '';

        this.badges.forEach(badge => {
            const isUnlocked = unlockedBadges.includes(badge.id);
            html += `
                <div class="badge-item ${isUnlocked ? 'unlocked' : ''}"
                     title="${badge.description}">
                    <span class="badge-icon">${badge.icon}</span>
                    <span class="badge-name">${badge.name}</span>
                </div>
            `;
        });

        return html;
    },

    /**
     * Get achievement notification data
     */
    getAchievementNotification(badge) {
        return {
            title: 'إنجاز جديد!',
            icon: badge.icon,
            name: badge.name,
            description: badge.description
        };
    },

    /**
     * Get motivational quote based on level
     */
    getMotivationalQuote(level) {
        const quotes = {
            1: [
                'كل رحلة تبدأ بخطوة واحدة. أنت بدأت!',
                'الجسم يحقق ما يؤمن به العقل.',
                'لا تقارن نفسك بالآخرين، قارن نفسك بنفسك بالأمس.'
            ],
            2: [
                'أنت تبني عادة جديدة. استمر!',
                'النجاح هو مجموع الجهود الصغيرة.',
                'كل تمرين يجعلك أقوى.'
            ],
            3: [
                'أنت الآن في المسار الصحيح!',
                'الاتساق يصنع التغيير.',
                'جسمك يتحول. ثق بالعملية.'
            ],
            4: [
                'أنت ملهم للآخرين!',
                'القوة لا تأتي من القدرة، بل من الإرادة.',
                'أنت أقوى مما تعتقد.'
            ],
            5: [
                'أنت محترف حقيقي!',
                'العمل الجاد يتفوق على الموهبة.',
                'أنت تصنع التاريخ.'
            ],
            6: [
                'أنت مثال يحتذى به!',
                'التميز ليس فعلاً، بل عادة.',
                'أنت تعيد تعريف حدودك.'
            ],
            7: [
                'أنت أسطورة حقيقية!',
                'لا شيء مستحيل لمن يصر.',
                'أنت تلهم العالم.'
            ],
            8: [
                'أنت وصلت للقمة!',
                'أنت دليل حي على قوة الإرادة.',
                'أنت لا تُهزم.'
            ]
        };

        const levelQuotes = quotes[level] || quotes[1];
        return levelQuotes[Math.floor(Math.random() * levelQuotes.length)];
    }
};
