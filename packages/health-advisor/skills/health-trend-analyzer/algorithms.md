# Анализатор трендов здоровья - Описание алгоритмов анализа

Данный документ подробно описывает различные алгоритмы анализа, используемые анализатором трендов здоровья, включая анализ временных рядов, корреляционный анализ, обнаружение точек изменения и генерацию прогностических выводов.

## Обзор алгоритмов

| Тип алгоритма | Назначение | Требования к данным | Выходные данные |
|---------|------|---------|------|
| Линейная регрессия | Обнаружение трендов | ≥3 точек данных | Наклон, точка пересечения, R² |
| Скользящее среднее | Сглаживание | ≥5 точек данных | Сглаженная кривая |
| Корреляция Пирсона | Корреляция непрерывных переменных | ≥30 точек данных | Коэффициент корреляции (-1~1) |
| Корреляция Спирмена | Корреляция порядковых переменных | ≥30 точек данных | Коэффициент корреляции (-1~1) |
| CUSUM | Обнаружение точек изменения | ≥10 точек данных | Положение точки изменения |
| Процентили | Обнаружение аномалий | ≥20 точек данных | Список аномальных значений |
| Декомпозиция временных рядов | Анализ сезонности | ≥12 точек данных | Тренд + сезонность + остаток |

---

## 1. Анализ временных рядов

### 1.1 Обнаружение трендов (линейная регрессия)

**Назначение**: Определение направления и силы линейного тренда данных во времени.

**Алгоритм**: Линейная регрессия методом наименьших квадратов

```javascript
function linearRegression(timeSeries) {
  // timeSeries: [{date: '2025-10-01', value: 70.8}, ...]

  const n = timeSeries.length;

  // Преобразование дат в числовые значения (количество дней от первого дня)
  const baseline = new Date(timeSeries[0].date);
  const x = timeSeries.map(d => (new Date(d.date) - baseline) / (1000 * 60 * 60 * 24));
  const y = timeSeries.map(d => d.value);

  // Расчёт средних значений
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  // Расчёт наклона (β1) и точки пересечения (β0)
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (x[i] - meanX) * (y[i] - meanY);
    denominator += Math.pow(x[i] - meanX, 2);
  }

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;

  // Расчёт R² (коэффициент детерминации)
  const predictions = x.map(xi => slope * xi + intercept);
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
  const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - predictions[i], 2), 0);
  const r2 = 1 - (ssRes / ssTot);

  // Расчёт общего изменения
  const firstValue = y[0];
  const lastValue = y[y.length - 1];
  const totalChange = lastValue - firstValue;
  const percentChange = (totalChange / firstValue) * 100;

  return {
    slope: slope,              // Наклон (изменение в день)
    intercept: intercept,      // Точка пересечения
    r2: r2,                    // Коэффициент детерминации (0~1, чем ближе к 1, тем лучше подгонка)
    direction: slope > 0.001 ? 'increasing' : slope < -0.001 ? 'decreasing' : 'stable',
    totalChange: totalChange,
    percentChange: percentChange,
    trendStrength: Math.abs(r2) > 0.7 ? 'strong' : Math.abs(r2) > 0.4 ? 'moderate' : 'weak'
  };
}
```

**Интерпретация результатов**:
- `slope > 0`: Восходящий тренд
- `slope < 0`: Нисходящий тренд
- `slope ≈ 0`: Стабильность
- `r2 > 0.7`: Сильный тренд (хорошая подгонка)
- `r2 < 0.4`: Слабый тренд (плохая подгонка)

**Пример**:
```javascript
const weightTrend = linearRegression(weightHistory);
// Результат:
{
  slope: -0.018,           // Снижение на 0,018 кг в день
  r2: 0.82,               // Сильный тренд
  direction: 'decreasing',
  totalChange: -2.3,      // Снижение на 2,3 кг за 90 дней
  percentChange: -3.2,    // Снижение на 3,2%
  trendStrength: 'strong'
}
```

### 1.2 Скользящее среднее (сглаживание)

**Назначение**: Сглаживание краткосрочных колебаний для выявления долгосрочного тренда.

**Алгоритм**: Простое скользящее среднее (SMA) с центрированным окном.

**Выбор размера окна**:
- 7 дней: Недельное сглаживание (устранение внутринедельных колебаний)
- 30 дней: Месячное сглаживание (устранение внутримесячных колебаний)
- 90 дней: Квартальное сглаживание (устранение квартальных колебаний)

### 1.3 Взвешенное скользящее среднее

**Назначение**: Придание большего веса последним данным для более быстрого реагирования на изменение тренда. Использует линейные веса (1, 2, ..., windowSize).

### 1.4 Декомпозиция временных рядов

**Назначение**: Разложение временного ряда на три компонента: тренд, сезонность и остаток.

**Алгоритм**: Аддитивная модель Y = Тренд + Сезонность + Остаток. Тренд извлекается скользящим средним, сезонность -- усреднением по периоду (по умолчанию 7 дней), остаток = Y - Тренд - Сезонность. Наличие сезонности определяется, если амплитуда сезонной компоненты > 0.5 * std(Y).

---

## 2. Корреляционный анализ

### 2.1 Коэффициент корреляции Пирсона (Pearson Correlation)

**Назначение**: Измерение силы линейной корреляции между двумя непрерывными переменными. Рассчитывает коэффициент r, p-value через t-критерий Стьюдента.

**Формула**:
```
r = Σ[(xi - x̄)(yi - ȳ)] / √[Σ(xi - x̄)² × Σ(yi - ȳ)²]
```

**Диапазон**: от -1 (полная отрицательная корреляция) до 1 (полная положительная корреляция), 0 — отсутствие линейной корреляции

**Интерпретация результатов**:
- `|r| > 0.7`: Сильная корреляция
- `0.4 < |r| <= 0.7`: Средняя корреляция
- `0.2 < |r| <= 0.4`: Слабая корреляция
- `|r| <= 0.2`: Отсутствие корреляции

Значимость оценивается через t-критерий: p < 0.05 = significant, p < 0.1 = marginal.

### 2.2 Ранговая корреляция Спирмена (Spearman Correlation)

**Назначение**: Измерение монотонной зависимости между порядковыми переменными или переменными с ненормальным распределением. Нечувствительна к выбросам. Метод: преобразование значений в ранги, затем расчёт Пирсона по рангам.

### 2.3 Кросс-корреляция (Cross-Correlation)

**Назначение**: Обнаружение запаздывающей зависимости между двумя временными рядами (например, влияет ли сегодняшний сон на настроение завтра). Рассчитывает корреляцию Пирсона при сдвигах от -maxLag до +maxLag дней. Результат: оптимальный сдвиг (lag) и его корреляция.

---

## 3. Обнаружение точек изменения

### 3.1 Алгоритм CUSUM (кумулятивная сумма)

**Назначение**: Обнаружение значимых точек изменения во временном ряде.

**Принцип**: Накопление отклонений от среднего значения; при превышении кумулятивной суммой порога определяется точка изменения.

Метод: накопление отклонений от глобального среднего. При смене знака CUSUM или превышении порога (по умолчанию 5) фиксируется точка изменения. Для каждой точки рассчитывается разница средних до и после (окно 5 точек), тип (increase/decrease) и магнитуда.

### 3.2 t-критерий со скользящим окном

**Назначение**: Обнаружение значимых различий средних значений между двумя смежными временными периодами. Метод: двусторонний t-тест между окнами (по умолчанию 7 дней) до и после каждой точки. Фиксируются точки с |t| > критического значения (alpha=0.05).

---

## 4. Обнаружение выбросов

### 4.1 Метод процентилей

**Назначение**: Выявление экстремальных значений, выходящих за пределы нормального диапазона.

```javascript
function detectOutliersPercentile(timeSeries, lower = 5, upper = 95) {
  const values = timeSeries.map(d => d.value);
  const n = values.length;

  // Расчёт процентилей
  const sorted = [...values].sort((a, b) => a - b);
  const lowerPercentile = sorted[Math.floor(n * lower / 100)];
  const upperPercentile = sorted[Math.floor(n * upper / 100)];

  // Обнаружение выбросов
  const outliers = timeSeries.filter((d, i) => {
    const value = d.value;
    return value < lowerPercentile || value > upperPercentile;
  });

  return {
    lowerBound: lowerPercentile,
    upperBound: upperPercentile,
    outliers: outliers.map(o => ({
      date: o.date,
      value: o.value,
      type: o.value < lowerPercentile ? 'low' : 'high'
    })),
    outlierCount: outliers.length,
    outlierRate: outliers.length / n
  };
}
```

### 4.2 Метод IQR (межквартильный размах)

**Назначение**: Обнаружение выбросов с использованием правила диаграмм размаха.

```javascript
function detectOutliersIQR(timeSeries, multiplier = 1.5) {
  const values = timeSeries.map(d => d.value);
  const n = values.length;

  // Расчёт квартилей
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(n * 0.25)];
  const q2 = sorted[Math.floor(n * 0.5)]; // Медиана
  const q3 = sorted[Math.floor(n * 0.75)];

  const iqr = q3 - q1;
  const lowerFence = q1 - multiplier * iqr;
  const upperFence = q3 + multiplier * iqr;

  // Обнаружение выбросов
  const outliers = timeSeries.filter(d => {
    return d.value < lowerFence || d.value > upperFence;
  });

  return {
    q1: q1,
    q2: q2,
    q3: q3,
    iqr: iqr,
    lowerFence: lowerFence,
    upperFence: upperFence,
    outliers: outliers.map(o => ({
      date: o.date,
      value: o.value,
      type: o.value < lowerFence ? 'low' : 'high',
      severity: o.value < lowerFence - 2 * iqr || o.value > upperFence + 2 * iqr ? 'extreme' : 'mild'
    }))
  };
}
```

---

## 5. Расчёт статистических показателей

### 5.1 Описательная статистика

```javascript
function descriptiveStats(timeSeries) {
  const values = timeSeries.map(d => d.value);
  const n = values.length;

  // Центральная тенденция
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];

  // Мера рассеяния
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const range = sorted[n - 1] - sorted[0];

  // Процентили
  const percentiles = {
    p25: sorted[Math.floor(n * 0.25)],
    p50: median,
    p75: sorted[Math.floor(n * 0.75)]
  };

  // Коэффициент вариации (CV = σ/μ, используется для сравнения данных с разными единицами измерения)
  const cv = mean !== 0 ? (stdDev / mean) * 100 : 0;

  return {
    count: n,
    mean: mean,
    median: median,
    mode: calculateMode(sorted),
    stdDev: stdDev,
    variance: variance,
    range: range,
    min: sorted[0],
    max: sorted[n - 1],
    percentiles: percentiles,
    iqr: percentiles.p75 - percentiles.p25,
    cv: cv
  };
}

function calculateMode(sortedArray) {
  const frequency = {};
  sortedArray.forEach(val => {
    frequency[val] = (frequency[val] || 0) + 1;
  });

  let maxFreq = 0;
  let mode = null;
  for (const val in frequency) {
    if (frequency[val] > maxFreq) {
      maxFreq = frequency[val];
      mode = Number(val);
    }
  }
  return mode;
}
```

### 5.2 Расчёт скорости изменения

```javascript
function calculateChangeRate(timeSeries) {
  const values = timeSeries.map(d => d.value);
  const n = values.length;

  if (n < 2) {
    return null;
  }

  // Простая скорость изменения (начало-конец)
  const simpleRate = ((values[n - 1] - values[0]) / values[0]) * 100;

  // Средняя скорость изменения (ежедневная)
  const dailyRates = [];
  for (let i = 1; i < n; i++) {
    const rate = ((values[i] - values[i - 1]) / values[i - 1]) * 100;
    dailyRates.push(rate);
  }

  const avgDailyRate = dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length;
  const stdDailyRate = Math.sqrt(
    dailyRates.reduce((a, b) => a + Math.pow(b - avgDailyRate, 2), 0) / (dailyRates.length - 1)
  );

  return {
    simpleRate: simpleRate,          // Общая скорость изменения (%)
    avgDailyRate: avgDailyRate,     // Средняя дневная скорость изменения (%)
    stdDailyRate: stdDailyRate,     // Стандартное отклонение дневной скорости
    volatility: stdDailyRate,        // Волатильность
    maxGain: Math.max(...dailyRates),   // Максимальный дневной прирост (%)
    maxLoss: Math.min(...dailyRates)    // Максимальное дневное снижение (%)
  };
}
```

---

## 6. Генерация прогностических выводов

### 6.1 Оценка рисков

```javascript
function assessRisks(trends, thresholds) {
  const risks = [];

  // Оценка риска по весу
  if (trends.weight) {
    const bmi = trends.weight.currentBMI;
    if (bmi < 18.5) {
      risks.push({
        type: 'underweight',
        severity: 'moderate',
        factor: 'ИМТ ниже нормы',
        value: bmi,
        message: 'Низкий ИМТ может влиять на иммунитет'
      });
    } else if (bmi > 28) {
      risks.push({
        type: 'overweight',
        severity: bmi > 30 ? 'high' : 'moderate',
        factor: 'ИМТ выше нормы',
        value: bmi,
        message: 'Повышенный ИМТ увеличивает риск хронических заболеваний'
      });
    }

    // Быстрое изменение веса
    if (Math.abs(trends.weight.percentChange) > 10) {
      risks.push({
        type: 'rapid_weight_change',
        severity: 'high',
        factor: 'Быстрое изменение веса',
        value: trends.weight.percentChange,
        message: `Изменение веса на ${Math.abs(trends.weight.percentChange).toFixed(1)}% требует внимания`
      });
    }
  }

  // Оценка риска по симптомам
  if (trends.symptoms) {
    const { mostFrequent, frequency } = trends.symptoms;
    const avgMonthly = frequency / 3; // Предполагается 3 месяца данных

    if (avgMonthly > 10) {
      risks.push({
        type: 'frequent_symptoms',
        severity: 'high',
        factor: 'Частые симптомы',
        symptom: mostFrequent,
        value: avgMonthly,
        message: `${mostFrequent} возникает ${Math.round(avgMonthly)} раз в месяц, рекомендуется консультация врача`
      });
    }
  }

  // Оценка риска по приверженности приёму лекарств
  if (trends.medications) {
    if (trends.medications.adherence < 70) {
      risks.push({
        type: 'poor_adherence',
        severity: 'moderate',
        factor: 'Низкая приверженность приёму лекарств',
        value: trends.medications.adherence,
        message: 'Низкая приверженность может снижать эффективность лечения'
      });
    }
  }

  return risks;
}
```

### 6.2 Генерация профилактических рекомендаций

```javascript
function generateRecommendations(trends, correlations) {
  const recommendations = [];

  // Рекомендации на основе трендов
  if (trends.weight && trends.weight.direction === 'decreasing') {
    recommendations.push({
      type: 'maintain',
      priority: 'low',
      message: 'Управление весом эффективно, продолжайте текущий метод'
    });
  }

  if (trends.symptoms && trends.symptoms.trend === 'decreasing') {
    recommendations.push({
      type: 'positive',
      priority: 'low',
      message: 'Частота симптомов снижается, продолжайте текущую схему лечения'
    });
  }

  // Рекомендации на основе корреляций
  if (correlations.some(c => c.x === 'Продолжительность сна' && c.y === 'Оценка настроения' && c.coefficient > 0.7)) {
    recommendations.push({
      type: 'improvement',
      priority: 'high',
      message: 'Увеличение продолжительности сна до 7-8 часов может улучшить эмоциональное состояние'
    });
  }

  if (correlations.some(c => c.x === 'Приверженность приёму лекарств' && c.y === 'Частота симптомов' && c.coefficient < -0.6)) {
    recommendations.push({
      type: 'improvement',
      priority: 'high',
      message: 'Повышение приверженности приёму лекарств может снизить частоту симптомов'
    });
  }

  // Рекомендации на основе рисков
  trends.risks.forEach(risk => {
    if (risk.type === 'poor_adherence') {
      recommendations.push({
        type: 'action',
        priority: 'high',
        message: 'Установите напоминания о приёме лекарств для повышения приверженности до 90% и выше'
      });
    }
  });

  return recommendations.sort((a, b) => {
    const priorityOrder = { 'high': 0, 'moderate': 1, 'low': 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}
```

### 6.3 Ранние предупреждения

```javascript
function generateEarlyWarnings(trends) {
  const warnings = [];

  // Слишком быстрое снижение веса
  if (trends.weight && trends.weight.percentChange < -10) {
    warnings.push({
      type: 'weight_loss',
      urgency: 'high',
      message: 'Быстрое снижение веса (>-10%), рекомендуется консультация врача',
      indicator: 'weight_percent_change',
      threshold: -10,
      currentValue: trends.weight.percentChange
    });
  }

  // Рост частоты симптомов
  if (trends.symptoms && trends.symptoms.frequencyTrend === 'increasing') {
    warnings.push({
      type: 'symptom_increase',
      urgency: 'moderate',
      message: 'Частота симптомов возрастает, рекомендуется отслеживать триггеры',
      indicator: 'symptom_frequency'
    });
  }

  // Ухудшение показателей анализов
  if (trends.labResults) {
    trends.labResults.forEach(indicator => {
      if (indicator.trend === 'worsening' && indicator.severity === 'abnormal') {
        warnings.push({
          type: 'lab_worsening',
          urgency: 'high',
          message: `Показатель ${indicator.name} ухудшается и находится вне нормы, рекомендуется обратиться к врачу`,
          indicator: indicator.name,
          currentValue: indicator.value,
          referenceRange: indicator.reference_range
        });
      }
    });
  }

  return warnings;
}
```

---

## 7. Подготовка данных для графиков

### 7.1 Данные для линейного графика

```javascript
function prepareLineChartData(timeSeries, yAxisTitle) {
  return {
    xAxis: {
      type: 'category',
      data: timeSeries.map(d => d.date),
      name: 'Дата'
    },
    yAxis: {
      type: 'value',
      name: yAxisTitle
    },
    series: [{
      name: yAxisTitle,
      type: 'line',
      data: timeSeries.map(d => d.value),
      smooth: true,
      markLine: {
        data: [{ type: 'average', name: 'Среднее' }]
      }
    }]
  };
}
```

### 7.2 Данные для тепловой карты

```javascript
function prepareHeatmapData(correlations, xLabels, yLabels) {
  // Преобразование матрицы корреляций в формат тепловой карты ECharts
  const data = [];

  correlations.forEach((row, i) => {
    row.forEach((value, j) => {
      data.push([j, i, value]); // [x, y, значение]
    });
  });

  return {
    tooltip: {
      position: 'top',
      formatter: (params) => {
        return `${xLabels[params.data[0]]} vs ${yLabels[params.data[1]]}<br/>Коэффициент корреляции: ${params.data[2].toFixed(2)}`;
      }
    },
    grid: {
      height: '50%',
      top: '10%'
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      splitArea: { show: true },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'category',
      data: yLabels,
      splitArea: { show: true },
      splitLine: { show: false }
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '15%',
      inRange: {
        color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffcc', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
      },
      textStyle: { color: '#333' }
    },
    series: [{
      name: 'Корреляция',
      type: 'heatmap',
      data: data,
      label: {
        show: true,
        formatter: (params) => params.data[2].toFixed(2)
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  };
}
```

---

## Руководство по выбору алгоритмов

### Выбор алгоритма по типу данных

| Тип данных | Рекомендуемый алгоритм | Выходные данные |
|---------|---------|------|
| Тренд веса/ИМТ | Линейная регрессия | Наклон, R², направление |
| Частота симптомов | Описательная статистика | Частота, процент |
| Приверженность приёму лекарств | Расчёт процента | Показатель приверженности (%) |
| Корреляция непрерывных переменных | Корреляция Пирсона | Коэффициент корреляции |
| Корреляция порядковых переменных | Корреляция Спирмена | Коэффициент корреляции |
| Паттерны временных рядов | Декомпозиция временных рядов | Тренд + сезонность + остаток |
| Обнаружение изменений | CUSUM или t-критерий | Список точек изменения |
| Обнаружение экстремальных значений | Метод IQR | Список выбросов |

### Выбор алгоритма по объёму данных

| Объём данных | Рекомендуемые алгоритмы | Примечания |
|--------|---------|---------|
| < 5 точек | Описательная статистика | Анализ трендов невозможен |
| 5-20 точек | Линейная регрессия, скользящее среднее | Надёжность тренда ограничена |
| 20-60 точек | Линейная регрессия, корреляционный анализ | Возможен предварительный анализ |
| > 60 точек | Все алгоритмы | Результаты анализа надёжны |

---

## Оптимизация производительности

### Оптимизация чтения данных
```javascript
// Чтение только необходимых файлов
function readDataForPeriod(startDate, endDate) {
  const pattern = `data/symptoms/${startDate.year}-${startDate.month.toString().padStart(2, '0')}/*.json`;
  const files = glob(pattern);

  // Чтение только подходящих файлов
  return files.map(file => JSON.parse(readFile(file)));
}
```

### Инкрементальные вычисления
```javascript
// Кэширование промежуточных результатов
const cache = new Map();

function calculateWithCache(key, compute) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = compute();
  cache.set(key, result);
  return result;
}
```

---

## Валидация алгоритмов

### Методы валидации
- **Перекрёстная валидация**: Разделение данных на обучающую и тестовую выборки для проверки стабильности алгоритма
- **Визуальная проверка**: Построение графиков данных для ручной проверки точности обнаружения трендов
- **Анализ чувствительности**: Изменение параметров (например, размера окна) для оценки стабильности результатов

### Критерии точности
- **Обнаружение трендов**: R² > 0,5 — надёжный тренд
- **Корреляционный анализ**: p < 0,05 — статистически значимо
- **Обнаружение точек изменения**: Необходимо не менее 2 последовательных точек данных для подтверждения
