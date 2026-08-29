/**
 * Файл конфигурации графиков ECharts
 * Отчёт по анализу трендов здоровья - Полная конфигурация для 6 типов графиков
 *
 * Способ использования:
 * 1. Подключите этот файл в HTML
 * 2. Вызовите соответствующую функцию инициализации графика
 * 3. Передайте реальные данные
 */

// ===== 1. Конфигурация графика трендов веса/ИМТ =====

/**
 * Инициализация графика трендов веса/ИМТ (линейный график с двумя осями)
 * @param {Array} weightData - Данные о весе [{date: '2025-10', weight: 60.8}, ...]
 * @param {Array} bmiData - Данные об ИМТ [{date: '2025-10', bmi: 22.3}, ...]
 */
function initWeightChart(weightData, bmiData) {
    const chart = echarts.init(document.getElementById('weight-chart'));

    const dates = weightData.map(d => d.date);
    const weights = weightData.map(d => d.weight);
    const bmis = bmiData.map(d => d.bmi);

    const option = {
        title: {
            text: 'Тренды изменения веса/ИМТ',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
        },
        legend: {
            data: ['Вес (кг)', 'ИМТ'],
            top: 40
        },
        grid: {
            left: '3%',
            right: '3%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: dates,
            boundaryGap: false
        },
        yAxis: [
            {
                type: 'value',
                name: 'Вес (кг)',
                position: 'left',
                axisLabel: { formatter: '{value} кг' }
            },
            {
                type: 'value',
                name: 'ИМТ',
                position: 'right',
                axisLabel: { formatter: '{value}' }
            }
        ],
        series: [
            {
                name: 'Вес',
                type: 'line',
                data: weights,
                smooth: true,
                yAxisIndex: 0,
                itemStyle: { color: '#3b82f6' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                        { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
                    ])
                },
                markLine: {
                    data: [
                        { type: 'average', name: 'Среднее' }
                    ]
                }
            },
            {
                name: 'ИМТ',
                type: 'line',
                data: bmis,
                smooth: true,
                yAxisIndex: 1,
                itemStyle: { color: '#8b5cf6' },
                markLine: {
                    data: [
                        { yAxis: 18.5, name: 'Нижняя граница ИМТ', lineStyle: { type: 'dashed', color: '#22c55e' } },
                        { yAxis: 24, name: 'Верхняя граница ИМТ', lineStyle: { type: 'dashed', color: '#f59e0b' } },
                        { yAxis: 28, name: 'Граница избыточного веса', lineStyle: { type: 'dashed', color: '#ef4444' } }
                    ]
                }
            }
        ]
    };

    chart.setOption(option);
    return chart;
}

// ===== 2. Конфигурация графика частоты симптомов =====

/**
 * Инициализация столбчатой диаграммы частоты симптомов
 * @param {Array} symptomsData - Данные о симптомах [{name: 'Головная боль', count: 4, severity: 'high'}, ...]
 */
function initSymptomsChart(symptomsData) {
    const chart = echarts.init(document.getElementById('symptoms-chart'));

    const names = symptomsData.map(d => d.name);
    const counts = symptomsData.map(d => d.count);

    // Установка цветов в зависимости от частоты
    const colors = symptomsData.map(d => {
        if (d.severity === 'high') return '#ef4444';
        if (d.severity === 'medium') return '#f59e0b';
        return '#22c55e';
    });

    const option = {
        title: {
            text: 'Статистика частоты симптомов',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' }
        },
        xAxis: {
            type: 'category',
            data: names,
            axisLabel: { interval: 0, rotate: 30 }
        },
        yAxis: {
            type: 'value',
            name: 'Количество случаев'
        },
        series: [{
            type: 'bar',
            data: symptomsData.map((d, i) => ({
                value: d.count,
                itemStyle: { color: colors[i] }
            })),
            label: {
                show: true,
                position: 'top',
                formatter: '{c} раз'
            },
            itemStyle: {
                borderRadius: [4, 4, 0, 0]
            }
        }]
    };

    chart.setOption(option);
    return chart;
}

/**
 * Инициализация графика временной шкалы симптомов (накопительная площадная диаграмма)
 * @param {Array} timelineData - Данные временной шкалы [{date: '2025-10-01', symptoms: ['Головная боль', 'Усталость']}, ...]
 */
function initSymptomsTimelineChart(timelineData) {
    const chart = echarts.init(document.getElementById('symptoms-timeline-chart'));

    // Агрегация данных о симптомах
    const symptomTypes = [...new Set(timelineData.flatMap(d => d.symptoms))];
    const dates = [...new Set(timelineData.map(d => d.date))].sort();

    const series = symptomTypes.map(symptom => {
        const data = dates.map(date => {
            const dayData = timelineData.find(d => d.date === date);
            return dayData && dayData.symptoms.includes(symptom) ? 1 : 0;
        });

        return {
            name: symptom,
            type: 'line',
            data: data,
            stack: 'symptoms',
            areaStyle: {},
            emphasis: { focus: 'series' }
        };
    });

    const option = {
        title: {
            text: 'Временная шкала симптомов',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                const symptoms = params.filter(p => p.value > 0).map(p => p.seriesName);
                return `${params[0].axisValue}<br/>Симптомы: ${symptoms.join(', ') || 'Нет'}`;
            }
        },
        legend: {
            data: symptomTypes,
            top: 40
        },
        xAxis: {
            type: 'category',
            data: dates,
            boundaryGap: false
        },
        yAxis: {
            type: 'value',
            max: 1,
            axisLabel: { show: false }
        },
        series: series
    };

    chart.setOption(option);
    return chart;
}

// ===== 3. Конфигурация графика приверженности приёму лекарств =====

/**
 * Инициализация панели приверженности приёму лекарств
 * @param {number} adherenceRate - Процент приверженности (0-100)
 */
function initMedicationGauge(adherenceRate) {
    const chart = echarts.init(document.getElementById('medication-gauge'));

    const option = {
        title: {
            text: 'Общая приверженность',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        series: [{
            type: 'gauge',
            startAngle: 180,
            endAngle: 0,
            min: 0,
            max: 100,
            splitNumber: 5,
            axisLine: {
                lineStyle: {
                    width: 20,
                    color: [
                        [0.6, '#ef4444'],
                        [0.8, '#f59e0b'],
                        [1, '#22c55e']
                    ]
                }
            },
            pointer: {
                icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
                length: '12%',
                width: 20,
                offsetCenter: [0, '-60%'],
                itemStyle: { color: 'auto' }
            },
            axisTick: { length: 12, lineStyle: { color: 'auto', width: 2 } },
            splitLine: { length: 20, lineStyle: { color: 'auto', width: 5 } },
            axisLabel: { color: '#464646', fontSize: 14, distance: -60 },
            detail: {
                valueAnimation: true,
                formatter: '{value}%',
                color: 'auto',
                fontSize: 30,
                offsetCenter: [0, '-20%']
            },
            data: [{ value: adherenceRate }]
        }]
    };

    chart.setOption(option);
    return chart;
}

/**
 * Инициализация круговой диаграммы записей приёма лекарств
 * @param {Object} medicationStats - Статистика приёма {taken: 26, missed: 2, pending: 0}
 */
function initMedicationPie(medicationStats) {
    const chart = echarts.init(document.getElementById('medication-pie'));

    const option = {
        title: {
            text: 'Распределение записей приёма',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'item',
            formatter: '{b}: {c} ({d}%)'
        },
        legend: {
            orient: 'vertical',
            left: 'left'
        },
        series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            itemStyle: {
                borderRadius: 10,
                borderColor: '#fff',
                borderWidth: 2
            },
            label: {
                show: true,
                formatter: '{b}: {c} раз\n({d}%)'
            },
            emphasis: {
                label: { show: true, fontSize: 16, fontWeight: 'bold' }
            },
            data: [
                { value: medicationStats.taken, name: 'Принято', itemStyle: { color: '#22c55e' } },
                { value: medicationStats.missed, name: 'Пропущено', itemStyle: { color: '#ef4444' } },
                { value: medicationStats.pending, name: 'Ожидает приёма', itemStyle: { color: '#f59e0b' } }
            ]
        }]
    };

    chart.setOption(option);
    return chart;
}

// ===== 4. Конфигурация графика трендов результатов анализов =====

/**
 * Инициализация графика трендов результатов анализов (многосерийный линейный график)
 * @param {Object} labData - Данные анализов
 * @param {Array} labData.dates - Массив дат
 * @param {Array} labData.series - Серии показателей [{name: 'Холестерин', data: [240, 230, 210], unit: 'мг/дл', range: [0, 200]}, ...]
 */
function initLabChart(labData) {
    const chart = echarts.init(document.getElementById('lab-chart'));

    const series = labData.series.map(s => ({
        name: s.name,
        type: 'line',
        data: s.data,
        smooth: true,
        yAxisIndex: s.name === 'Глюкоза' ? 1 : 0,
        markLine: {
            silent: true,
            lineStyle: { type: 'dashed' },
            data: [
                { yAxis: s.range[1], name: 'Верхняя граница нормы', label: { formatter: `${s.range[1]} ${s.unit}` } }
            ]
        }
    }));

    const option = {
        title: {
            text: 'Изменения лабораторных показателей',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                let result = params[0].axisValue + '<br/>';
                params.forEach(p => {
                    result += `${p.seriesName}: ${p.value} ${labData.series.find(s => s.name === p.seriesName).unit}<br/>`;
                });
                return result;
            }
        },
        legend: {
            data: labData.series.map(s => s.name),
            top: 40
        },
        xAxis: {
            type: 'category',
            data: labData.dates,
            boundaryGap: false
        },
        yAxis: [
            {
                type: 'value',
                name: 'мг/дл',
                position: 'left'
            },
            {
                type: 'value',
                name: 'ммоль/л',
                position: 'right'
            }
        ],
        series: series
    };

    chart.setOption(option);
    return chart;
}

// ===== 5. Конфигурация тепловой карты корреляций =====

/**
 * Инициализация тепловой карты корреляций
 * @param {Object} correlationData - Данные о корреляциях
 * @param {Array} correlationData.xAxis - Метки оси X
 * @param {Array} correlationData.yAxis - Метки оси Y
 * @param {Array} correlationData.data - Матрица корреляций [[x, y, value], ...]
 */
function initCorrelationHeatmap(correlationData) {
    const chart = echarts.init(document.getElementById('correlation-heatmap'));

    const option = {
        title: {
            text: 'Анализ корреляций показателей',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            position: 'top',
            formatter: function(params) {
                return `${correlationData.xAxis[params.value[0]]} × ${correlationData.yAxis[params.value[1]]}<br/>Коэффициент корреляции: ${params.value[2].toFixed(2)}`;
            }
        },
        grid: {
            height: '50%',
            top: '15%'
        },
        xAxis: {
            type: 'category',
            data: correlationData.xAxis,
            splitArea: { show: true }
        },
        yAxis: {
            type: 'category',
            data: correlationData.yAxis,
            splitArea: { show: true }
        },
        visualMap: {
            min: -1,
            max: 1,
            calculable: true,
            orient: 'horizontal',
            left: 'center',
            bottom: '5%',
            inRange: {
                color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffcc',
                       '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
            },
            text: ['Положительная корреляция', 'Отрицательная корреляция']
        },
        series: [{
            type: 'heatmap',
            data: correlationData.data,
            label: {
                show: true,
                formatter: function(params) {
                    return params.value[2].toFixed(2);
                }
            },
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
            }
        }]
    };

    chart.setOption(option);
    return chart;
}

// ===== 6. Конфигурация графика настроения и сна =====

/**
 * Инициализация графика трендов настроения и сна (площадная диаграмма с двумя осями)
 * @param {Array} moodSleepData - Данные о настроении и сне
 * @param {Array} moodSleepData.dates - Массив дат
 * @param {Array} moodSleepData.moodScores - Массив оценок настроения (0-10)
 * @param {Array} moodSleepData.sleepHours - Массив продолжительности сна (часы)
 */
function initMoodSleepChart(moodSleepData) {
    const chart = echarts.init(document.getElementById('mood-chart'));

    const option = {
        title: {
            text: 'Тренды настроения и сна',
            left: 'center',
            textStyle: { fontSize: 18, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross' }
        },
        legend: {
            data: ['Оценка настроения', 'Продолжительность сна'],
            top: 40
        },
        xAxis: {
            type: 'category',
            data: moodSleepData.dates,
            boundaryGap: false
        },
        yAxis: [
            {
                type: 'value',
                name: 'Оценка настроения',
                position: 'left',
                min: 0,
                max: 10,
                axisLabel: { formatter: '{value}' }
            },
            {
                type: 'value',
                name: 'Продолжительность сна (часы)',
                position: 'right',
                min: 0,
                max: 12,
                axisLabel: { formatter: '{value} ч' }
            }
        ],
        series: [
            {
                name: 'Настроение',
                type: 'line',
                data: moodSleepData.moodScores,
                smooth: true,
                yAxisIndex: 0,
                itemStyle: { color: '#ec4899' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(236, 72, 153, 0.4)' },
                        { offset: 1, color: 'rgba(236, 72, 153, 0.05)' }
                    ])
                }
            },
            {
                name: 'Сон',
                type: 'line',
                data: moodSleepData.sleepHours,
                smooth: true,
                yAxisIndex: 1,
                itemStyle: { color: '#6366f1' },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(99, 102, 241, 0.4)' },
                        { offset: 1, color: 'rgba(99, 102, 241, 0.05)' }
                    ])
                },
                markLine: {
                    data: [
                        { yAxis: 7, name: 'Рекомендуемый сон', lineStyle: { type: 'dashed', color: '#22c55e' } }
                    ]
                }
            }
        ]
    };

    chart.setOption(option);
    return chart;
}

// ===== Общая функция инициализации =====

/**
 * Инициализация всех графиков
 * @param {Object} allData - Данные для всех графиков
 */
function initAllCharts(allData) {
    const charts = {};

    // 1. График веса/ИМТ
    if (allData.weight && allData.bmi) {
        charts.weight = initWeightChart(allData.weight, allData.bmi);
    }

    // 2. Графики симптомов
    if (allData.symptoms) {
        charts.symptoms = initSymptomsChart(allData.symptoms.frequency);
        charts.symptomsTimeline = initSymptomsTimelineChart(allData.symptoms.timeline);
    }

    // 3. Графики приверженности приёму лекарств
    if (allData.medications) {
        charts.medicationGauge = initMedicationGauge(allData.medications.adherenceRate);
        charts.medicationPie = initMedicationPie(allData.medications.stats);
    }

    // 4. График результатов анализов
    if (allData.labResults) {
        charts.labResults = initLabChart(allData.labResults);
    }

    // 5. Тепловая карта корреляций
    if (allData.correlations) {
        charts.correlations = initCorrelationHeatmap(allData.correlations);
    }

    // 6. График настроения и сна
    if (allData.moodSleep) {
        charts.moodSleep = initMoodSleepChart(allData.moodSleep);
    }

    return charts;
}

// ===== Экспорт модуля =====

// Если в среде Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initWeightChart,
        initSymptomsChart,
        initSymptomsTimelineChart,
        initMedicationGauge,
        initMedicationPie,
        initLabChart,
        initCorrelationHeatmap,
        initMoodSleepChart,
        initAllCharts
    };
}
