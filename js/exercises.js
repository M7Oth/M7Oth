/**
 * Exercises Module
 * Contains workout schedule and exercise management
 */

const ExercisesManager = {
    // Weekly exercise schedule
    // 6 training days (Saturday to Thursday) + Friday rest
    weeklySchedule: [
        {
            dayIndex: 0,
            dayName: 'السبت',
            dayNameEn: 'Saturday',
            type: 'تمارين صدر وترايسبس',
            description: 'تمارين مركزة على عضلات الصدر والترايسبس',
            duration: 45, // minutes
            calories: 350,
            difficulty: 'متوسط',
            youtubeLink: 'https://www.youtube.com/watch?v=chest-workout',
            exercises: [
                'ضغط مستوي - 4 مجموعات × 12 تكرار',
                'ضغط علوي - 3 مجموعات × 12 تكرار',
                'تفتيح دمبل - 3 مجموعات × 15 تكرار',
                'ديبس ترايسبس - 3 مجموعات × 12 تكرار',
                'تمديد ترايسبس - 3 مجموعات × 15 تكرار'
            ],
            isRestDay: false
        },
        {
            dayIndex: 1,
            dayName: 'الأحد',
            dayNameEn: 'Sunday',
            type: 'تمارين ظهر وبايسبس',
            description: 'تمارين مركزة على عضلات الظهر والبايسبس',
            duration: 50,
            calories: 380,
            difficulty: 'متوسط',
            youtubeLink: 'https://www.youtube.com/watch?v=back-workout',
            exercises: [
                'سحب علوي - 4 مجموعات × 12 تكرار',
                'سحب أرضي - 4 مجموعات × 12 تكرار',
                'رفرفة خلفي - 3 مجموعات × 15 تكرار',
                'بايسبس كيرل - 3 مجموعات × 12 تكرار',
                'هامر كيرل - 3 مجموعات × 12 تكرار'
            ],
            isRestDay: false
        },
        {
            dayIndex: 2,
            dayName: 'الاثنين',
            dayNameEn: 'Monday',
            type: 'تمارين أرجل كاملة',
            description: 'تمارين شاملة لعضلات الأرجل',
            duration: 55,
            calories: 450,
            difficulty: 'صعب',
            youtubeLink: 'https://www.youtube.com/watch?v=legs-workout',
            exercises: [
                'سكوات - 4 مجموعات × 12 تكرار',
                'ليج برس - 4 مجموعات × 12 تكرار',
                'لانجز - 3 مجموعات × 10 لكل رجل',
                'ليج كيرل - 3 مجموعات × 15 تكرار',
                'كالف رايز - 4 مجموعات × 20 تكرار'
            ],
            isRestDay: false
        },
        {
            dayIndex: 3,
            dayName: 'الثلاثاء',
            dayNameEn: 'Tuesday',
            type: 'تمارين أكتاف وبطن',
            description: 'تمارين للأكتاف وعضلات البطن',
            duration: 45,
            calories: 320,
            difficulty: 'متوسط',
            youtubeLink: 'https://www.youtube.com/watch?v=shoulders-workout',
            exercises: [
                'ضغط كتف - 4 مجموعات × 12 تكرار',
                'رفرفة جانبي - 3 مجموعات × 15 تكرار',
                'رفرفة أمامي - 3 مجموعات × 12 تكرار',
                'كرانش - 3 مجموعات × 20 تكرار',
                'بلانك - 3 مجموعات × 45 ثانية'
            ],
            isRestDay: false
        },
        {
            dayIndex: 4,
            dayName: 'الأربعاء',
            dayNameEn: 'Wednesday',
            type: 'تمارين كارديو HIIT',
            description: 'تمارين القلب عالية الكثافة لحرق الدهون',
            duration: 30,
            calories: 400,
            difficulty: 'صعب',
            youtubeLink: 'https://www.youtube.com/watch?v=hiit-workout',
            exercises: [
                'إحماء - 5 دقائق',
                'جري سريع 30 ثانية + راحة 30 ثانية × 10',
                'بيربي - 3 مجموعات × 10 تكرار',
                'جامبنج جاك - 3 مجموعات × 30 تكرار',
                'ماونتن كلايمر - 3 مجموعات × 20 تكرار'
            ],
            isRestDay: false
        },
        {
            dayIndex: 5,
            dayName: 'الخميس',
            dayNameEn: 'Thursday',
            type: 'تمارين Full Body',
            description: 'تمارين شاملة لكل عضلات الجسم',
            duration: 50,
            calories: 420,
            difficulty: 'متوسط-صعب',
            youtubeLink: 'https://www.youtube.com/watch?v=fullbody-workout',
            exercises: [
                'ديدليفت - 4 مجموعات × 10 تكرار',
                'بينش برس - 3 مجموعات × 12 تكرار',
                'سحب بار - 3 مجموعات × 10 تكرار',
                'سكوات أمامي - 3 مجموعات × 12 تكرار',
                'ضغط كتف دمبل - 3 مجموعات × 12 تكرار'
            ],
            isRestDay: false
        },
        {
            dayIndex: 6,
            dayName: 'الجمعة',
            dayNameEn: 'Friday',
            type: 'يوم راحة',
            description: 'استرح واسمح لعضلاتك بالتعافي. يمكنك القيام بمشي خفيف أو تمارين إطالة.',
            duration: 0,
            calories: 0,
            difficulty: 'راحة',
            youtubeLink: null,
            exercises: [
                'تمارين إطالة خفيفة (اختياري)',
                'مشي 20-30 دقيقة (اختياري)',
                'تأمل واسترخاء'
            ],
            isRestDay: true
        }
    ],

    /**
     * Get today's exercise based on day of week
     */
    getTodayExercise() {
        const today = new Date();
        const dayOfWeek = today.getDay();

        // Convert JS day (0=Sunday) to our schedule (0=Saturday)
        const scheduleIndex = dayOfWeek === 6 ? 0 : dayOfWeek;

        return this.weeklySchedule[scheduleIndex];
    },

    /**
     * Get exercise by day index (0-6)
     */
    getExerciseByDay(dayIndex) {
        return this.weeklySchedule[dayIndex] || null;
    },

    /**
     * Get all training days (excluding rest day)
     */
    getTrainingDays() {
        return this.weeklySchedule.filter(day => !day.isRestDay);
    },

    /**
     * Calculate total weekly calories if all exercises completed
     */
    getTotalWeeklyCalories() {
        return this.weeklySchedule.reduce((total, day) => total + day.calories, 0);
    },

    /**
     * Get exercise difficulty color
     */
    getDifficultyColor(difficulty) {
        const colors = {
            'سهل': '#00d9a5',
            'متوسط': '#00b4d8',
            'متوسط-صعب': '#ffc107',
            'صعب': '#e94560',
            'راحة': '#6c6c7c'
        };
        return colors[difficulty] || '#a0a0b0';
    },

    /**
     * Generate exercise table HTML
     */
    generateExerciseTable(currentWeek) {
        let html = '';

        // Only show training days (0-5), skip rest day (6)
        this.getTrainingDays().forEach((exercise) => {
            const dayKey = `day${exercise.dayIndex}`;
            const dayData = currentWeek.days[dayKey];
            const isCompleted = dayData ? dayData.completed : false;

            const rowClass = isCompleted ? 'completed' : '';

            html += `
                <tr class="${rowClass}" data-day="${exercise.dayIndex}">
                    <td class="day-name">${exercise.dayName}</td>
                    <td class="exercise-name">
                        <strong>${exercise.type}</strong>
                        <small style="display: block; color: var(--text-muted); font-size: 0.75rem;">
                            ${exercise.duration} دقيقة | ${exercise.difficulty}
                        </small>
                    </td>
                    <td class="calories-cell">${exercise.calories}</td>
                    <td>
                        ${exercise.youtubeLink ?
                            `<a href="${exercise.youtubeLink}" target="_blank" class="exercise-link">
                                <span>▶️</span> مشاهدة
                            </a>` :
                            '<span style="color: var(--text-muted);">-</span>'
                        }
                    </td>
                    <td>
                        <label class="exercise-checkbox">
                            <input type="checkbox"
                                   data-day="${exercise.dayIndex}"
                                   data-calories="${exercise.calories}"
                                   ${isCompleted ? 'checked disabled' : ''}>
                            <span class="checkmark"></span>
                        </label>
                    </td>
                </tr>
            `;
        });

        // Add Friday rest day indicator
        html += `
            <tr class="rest-day">
                <td class="day-name">الجمعة</td>
                <td class="exercise-name">
                    <strong>يوم راحة 🌙</strong>
                    <small style="display: block; color: var(--text-muted); font-size: 0.75rem;">
                        استرح واستعد للأسبوع القادم
                    </small>
                </td>
                <td class="calories-cell">-</td>
                <td><span style="color: var(--text-muted);">-</span></td>
                <td><span style="font-size: 1.5rem;">😴</span></td>
            </tr>
        `;

        return html;
    },

    /**
     * Calculate dynamic calories based on user data
     * Uses MET (Metabolic Equivalent of Task) values
     */
    calculateDynamicCalories(exercise, userWeight) {
        // MET values for different exercise types
        const metValues = {
            'تمارين صدر وترايسبس': 5.0,
            'تمارين ظهر وبايسبس': 5.0,
            'تمارين أرجل كاملة': 6.0,
            'تمارين أكتاف وبطن': 4.5,
            'تمارين كارديو HIIT': 8.0,
            'تمارين Full Body': 6.0,
            'يوم راحة': 1.0
        };

        const met = metValues[exercise.type] || 5.0;
        const durationHours = exercise.duration / 60;

        // Calories = MET × weight (kg) × duration (hours)
        return Math.round(met * userWeight * durationHours);
    },

    /**
     * Get personalized schedule based on user data
     */
    getPersonalizedSchedule(userData) {
        if (!userData) return this.weeklySchedule;

        return this.weeklySchedule.map(exercise => {
            if (exercise.isRestDay) return exercise;

            return {
                ...exercise,
                personalizedCalories: this.calculateDynamicCalories(exercise, userData.weight)
            };
        });
    },

    /**
     * Get motivational message based on progress
     */
    getMotivationalMessage(completedDays, totalDays = 6) {
        const progress = completedDays / totalDays;

        if (completedDays === 0) {
            return {
                message: 'ابدأ أسبوعك بقوة! التمرين الأول ينتظرك 💪',
                emoji: '🚀'
            };
        } else if (progress < 0.5) {
            return {
                message: `رائع! أكملت ${completedDays} أيام. استمر في التقدم!`,
                emoji: '🔥'
            };
        } else if (progress < 1) {
            return {
                message: `ممتاز! بقي ${totalDays - completedDays} أيام فقط لإنهاء الأسبوع!`,
                emoji: '⭐'
            };
        } else {
            return {
                message: 'مذهل! أكملت كل تمارين الأسبوع! 🏆',
                emoji: '🎉'
            };
        }
    },

    /**
     * Get exercise tips
     */
    getExerciseTips() {
        return [
            'اشرب كمية كافية من الماء قبل وأثناء وبعد التمرين',
            'احرص على الإحماء لمدة 5-10 دقائق قبل التمرين',
            'لا تنسَ تمارين الإطالة بعد الانتهاء',
            'النوم الجيد (7-8 ساعات) ضروري لبناء العضلات',
            'تناول البروتين خلال ساعة من انتهاء التمرين',
            'استمع لجسمك وخذ راحة إذا شعرت بألم',
            'التنفس الصحيح يزيد من فعالية التمارين',
            'الاتساق أهم من الشدة - التزم بجدولك'
        ];
    },

    /**
     * Get random tip
     */
    getRandomTip() {
        const tips = this.getExerciseTips();
        return tips[Math.floor(Math.random() * tips.length)];
    }
};
