/**
 * Charts Module
 * Handles all Chart.js visualizations
 */

const ChartsManager = {
    // Chart instances
    charts: {
        weight: null,
        calories: null,
        progress: null
    },

    // Default chart options for RTL and dark theme
    defaultOptions: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                rtl: true,
                labels: {
                    color: '#a0a0b0',
                    font: {
                        family: 'Tajawal',
                        size: 12
                    },
                    usePointStyle: true,
                    padding: 20
                }
            },
            tooltip: {
                rtl: true,
                titleFont: {
                    family: 'Tajawal',
                    size: 14
                },
                bodyFont: {
                    family: 'Tajawal',
                    size: 13
                },
                backgroundColor: '#1a1a2e',
                titleColor: '#ffffff',
                bodyColor: '#a0a0b0',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                displayColors: true
            }
        },
        scales: {
            x: {
                ticks: {
                    color: '#6c6c7c',
                    font: {
                        family: 'Tajawal'
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                    drawBorder: false
                }
            },
            y: {
                ticks: {
                    color: '#6c6c7c',
                    font: {
                        family: 'Tajawal'
                    }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                    drawBorder: false
                }
            }
        }
    },

    /**
     * Initialize all charts
     */
    init() {
        this.initWeightChart();
        this.initCaloriesChart();
        this.initProgressChart();
    },

    /**
     * Initialize weight tracking chart
     */
    initWeightChart() {
        const ctx = document.getElementById('weight-chart');
        if (!ctx) return;

        const data = DataManager.getWeightTrendData();

        // Destroy existing chart
        if (this.charts.weight) {
            this.charts.weight.destroy();
        }

        this.charts.weight = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => DataManager.formatShortDate(d.date)),
                datasets: [{
                    label: 'الوزن (كجم)',
                    data: data.map(d => d.weight),
                    borderColor: '#e94560',
                    backgroundColor: 'rgba(233, 69, 96, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#e94560',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                ...this.defaultOptions,
                plugins: {
                    ...this.defaultOptions.plugins,
                    legend: {
                        display: false
                    },
                    tooltip: {
                        ...this.defaultOptions.plugins.tooltip,
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y} كجم`;
                            }
                        }
                    }
                },
                scales: {
                    ...this.defaultOptions.scales,
                    y: {
                        ...this.defaultOptions.scales.y,
                        beginAtZero: false,
                        ticks: {
                            ...this.defaultOptions.scales.y.ticks,
                            callback: function(value) {
                                return value + ' كجم';
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
    },

    /**
     * Initialize calories chart
     */
    initCaloriesChart() {
        const ctx = document.getElementById('calories-chart');
        if (!ctx) return;

        const data = DataManager.getWeeklyCaloriesData();

        // Destroy existing chart
        if (this.charts.calories) {
            this.charts.calories.destroy();
        }

        // Create gradient
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, 'rgba(0, 217, 165, 0.8)');
        gradient.addColorStop(1, 'rgba(0, 180, 216, 0.2)');

        this.charts.calories = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: 'السعرات المحروقة',
                    data: data.map(d => d.value),
                    backgroundColor: data.map(d =>
                        d.current ? 'rgba(233, 69, 96, 0.8)' : gradient
                    ),
                    borderColor: data.map(d =>
                        d.current ? '#e94560' : '#00d9a5'
                    ),
                    borderWidth: 2,
                    borderRadius: 8,
                    borderSkipped: false
                }]
            },
            options: {
                ...this.defaultOptions,
                plugins: {
                    ...this.defaultOptions.plugins,
                    legend: {
                        display: false
                    },
                    tooltip: {
                        ...this.defaultOptions.plugins.tooltip,
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y.toLocaleString('ar-SA')} سعرة`;
                            }
                        }
                    }
                },
                scales: {
                    ...this.defaultOptions.scales,
                    y: {
                        ...this.defaultOptions.scales.y,
                        beginAtZero: true,
                        ticks: {
                            ...this.defaultOptions.scales.y.ticks,
                            callback: function(value) {
                                return value.toLocaleString('ar-SA');
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Initialize progress/completion chart
     */
    initProgressChart() {
        const ctx = document.getElementById('progress-chart');
        if (!ctx) return;

        const weekLogs = DataManager.getWeekLogs();
        const currentWeek = DataManager.getCurrentWeek();

        // Destroy existing chart
        if (this.charts.progress) {
            this.charts.progress.destroy();
        }

        // Calculate completion percentages for each week
        const data = weekLogs.map(week => {
            const completed = Object.values(week.days).filter(d => d.completed).length;
            return Math.round((completed / 6) * 100);
        });

        // Add current week
        const currentCompleted = Object.values(currentWeek.days).filter(d => d.completed).length;
        data.push(Math.round((currentCompleted / 6) * 100));

        const labels = weekLogs.map((_, i) => `الأسبوع ${i + 1}`);
        labels.push(`الأسبوع ${currentWeek.weekNumber}`);

        this.charts.progress = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'نسبة الإنجاز',
                    data: data,
                    borderColor: '#00b4d8',
                    backgroundColor: 'rgba(0, 180, 216, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: data.map((v, i) =>
                        i === data.length - 1 ? '#e94560' : '#00b4d8'
                    ),
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                ...this.defaultOptions,
                plugins: {
                    ...this.defaultOptions.plugins,
                    legend: {
                        display: false
                    },
                    tooltip: {
                        ...this.defaultOptions.plugins.tooltip,
                        callbacks: {
                            label: function(context) {
                                return `نسبة الإنجاز: ${context.parsed.y}%`;
                            }
                        }
                    }
                },
                scales: {
                    ...this.defaultOptions.scales,
                    y: {
                        ...this.defaultOptions.scales.y,
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            ...this.defaultOptions.scales.y.ticks,
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Update all charts
     */
    updateAll() {
        this.initWeightChart();
        this.initCaloriesChart();
        this.initProgressChart();
    },

    /**
     * Update weight chart only
     */
    updateWeightChart() {
        this.initWeightChart();
    },

    /**
     * Update calories chart only
     */
    updateCaloriesChart() {
        this.initCaloriesChart();
    },

    /**
     * Add animation to chart update
     */
    animateUpdate(chartType) {
        const chart = this.charts[chartType];
        if (chart) {
            chart.update('active');
        }
    },

    /**
     * Create mini sparkline chart (for dashboard widgets)
     */
    createSparkline(canvasId, data, color = '#00d9a5') {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map((_, i) => i),
                datasets: [{
                    data: data,
                    borderColor: color,
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { display: false },
                    y: { display: false }
                },
                elements: {
                    line: {
                        tension: 0.4
                    }
                }
            }
        });
    },

    /**
     * Create BMI gauge chart
     */
    createBMIGauge(canvasId, bmi) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const bmiValue = parseFloat(bmi);
        const percentage = Math.min((bmiValue / 40) * 100, 100);

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [percentage, 100 - percentage],
                    backgroundColor: [
                        this.getBMIColor(bmiValue),
                        'rgba(255, 255, 255, 0.1)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                rotation: -90,
                circumference: 180,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
    },

    /**
     * Get BMI color based on value
     */
    getBMIColor(bmi) {
        if (bmi < 18.5) return '#00b4d8'; // Underweight
        if (bmi < 25) return '#00d9a5';   // Normal
        if (bmi < 30) return '#ffc107';   // Overweight
        return '#e94560';                  // Obese
    },

    /**
     * Destroy all charts
     */
    destroyAll() {
        Object.keys(this.charts).forEach(key => {
            if (this.charts[key]) {
                this.charts[key].destroy();
                this.charts[key] = null;
            }
        });
    }
};
