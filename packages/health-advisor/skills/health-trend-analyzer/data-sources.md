# Анализатор трендов здоровья - Подробное описание источников данных

Данный документ подробно описывает все источники данных, используемые анализатором трендов здоровья, включая структуру данных, методы чтения, проверку доступности и обработку отсутствующих данных.

## Обзор источников данных

| Источник данных | Путь к файлу | Частота обновления | Тип данных | Обязательность |
|--------|---------|---------|---------|--------|
| Личный профиль | `data/profile.json` | Низкая | Базовая информация | Необязательно |
| Записи симптомов | `data/symptoms/**/*.json` | Высокая | Временной ряд | Рекомендуется |
| Записи настроения | `data/mood/**/*.json` | Высокая | Временной ряд | Рекомендуется |
| Записи о питании | `data/diet/**/*.json` | Высокая | Временной ряд | Необязательно |
| Журнал приёма лекарств | `data/medication-logs/**/*.json` | Высокая | Временной ряд | Рекомендуется |
| Женский цикл | `data/cycle-tracker.json` | Средняя | Временной ряд | Условно |
| Отслеживание беременности | `data/pregnancy-tracker.json` | Средняя | Временной ряд | Условно |
| Менопауза | `data/menopause-tracker.json` | Средняя | Временной ряд | Условно |
| История аллергий | `data/allergies.json` | Низкая | Статические данные | Необязательно |
| Записи облучения | `data/radiation-records.json` | Низкая | Временной ряд | Необязательно |
| Результаты анализов | `data/medical_records/**/*.json` | Низкая | Временной ряд | Рекомендуется |

---

## 1. Личный профиль (profile.json)

### Путь к файлу
`data/profile.json`

### Структура данных
```json
{
  "created_at": "2025-01-01T00:00:00.000Z",
  "last_updated": "2025-12-31T12:34:56.789Z",
  "basic_info": {
    "name": "Иванов Иван",
    "gender": "мужской",
    "birth_date": "1990-01-01",
    "blood_type": "A+",
    "height": 175,
    "height_unit": "см",
    "weight": 70.5,
    "weight_unit": "кг",
    "emergency_contacts": [
      {
        "name": "Петрова Мария",
        "relationship": "супруг(а)",
        "phone": "138****1234"
      }
    ]
  },
  "calculated": {
    "age": 35,
    "age_years": 35,
    "bmi": 23.0,
    "bmi_status": "норма",
    "body_surface_area": 1.85,
    "bsa_unit": "м²"
  },
  "history": [
    {
      "date": "2025-10-01",
      "weight": 70.8,
      "bmi": 23.1
    },
    {
      "date": "2025-11-01",
      "weight": 69.5,
      "bmi": 22.7
    },
    {
      "date": "2025-12-01",
      "weight": 68.5,
      "bmi": 22.4
    }
  ]
}
```

### Описание полей

**basic_info**: Базовая информация
- `name`: Имя
- `gender`: Пол ("мужской" или "женский")
- `birth_date`: Дата рождения (формат YYYY-MM-DD)
- `blood_type`: Группа крови (A+, B+, AB+, O+, A-, B-, AB-, O-)
- `height`: Рост
- `height_unit`: Единица измерения роста (см)
- `weight`: Текущий вес
- `weight_unit`: Единица измерения веса (кг)
- `emergency_contacts`: Список экстренных контактов

**calculated**: Вычисляемые поля
- `age`: Возраст (лет)
- `bmi`: Индекс массы тела
- `bmi_status`: Статус ИМТ ("недостаточный вес", "норма", "избыточный вес", "ожирение")
- `body_surface_area`: Площадь поверхности тела (м²)

**history**: Историческая запись (для отслеживания изменений веса)
- `date`: Дата записи
- `weight`: Вес на момент записи
- `bmi`: ИМТ на момент записи

### Метод чтения
```javascript
const profile = JSON.parse(readFile('data/profile.json'));

// Получение текущего ИМТ
const currentBMI = profile.calculated.bmi;

// Получение истории веса (для анализа трендов)
const weightHistory = profile.history.map(h => ({
  date: h.date,
  weight: h.weight,
  bmi: h.bmi
}));
```

### Проверка доступности
```javascript
function checkProfileAvailable() {
  try {
    const profile = JSON.parse(readFile('data/profile.json'));
    return {
      available: true,
      hasHistory: profile.history && profile.history.length > 0,
      historyLength: profile.history ? profile.history.length : 0
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
```

### Обработка отсутствующих данных
- Если файл не существует: пропустить анализ веса/ИМТ, сообщить "Личный профиль не записан"
- Если нет данных history: использовать текущий weight и bmi как единственную точку данных, анализ тренда невозможен

---

## 2. Записи симптомов (symptoms/)

### Путь к файлу
`data/symptoms/YYYY-MM/YYYY-MM-DD.json`

### Структура данных
```json
{
  "date": "2025-12-31",
  "logs": [
    {
      "id": "symptom_20251231083000001",
      "name": "Головная боль",
      "severity": "moderate",
      "severity_level": 2,
      "onset_time": "08:30",
      "duration": 4,
      "duration_unit": "hours",
      "description": "Постоянная тупая боль, обе височные области",
      "triggers": ["Недостаток сна", "Стресс"],
      "location": "Голова",
      "associated_symptoms": ["Тошнота", "Светобоязнь"],
      "relief_factors": "Улучшение после отдыха",
      "created_at": "2025-12-31T08:30:00.000Z"
    },
    {
      "id": "symptom_20251231140000002",
      "name": "Усталость",
      "severity": "mild",
      "severity_level": 1,
      "onset_time": "14:00",
      "duration": 3,
      "duration_unit": "hours",
      "description": "Ощущение слабости, трудности с концентрацией",
      "triggers": ["После обеда", "Высокая рабочая нагрузка"],
      "location": "Всё тело",
      "associated_symptoms": [],
      "relief_factors": "Короткий дневной сон",
      "created_at": "2025-12-31T14:00:00.000Z"
    }
  ],
  "summary": {
    "total_symptoms": 2,
    "most_severe": "Головная боль",
    "overall_discomfort": "moderate"
  }
}
```

### Описание полей

**Поля записи симптомов**:
- `id`: Уникальный идентификатор
- `name`: Название симптома (например: головная боль, усталость, бессонница)
- `severity`: Степень тяжести ("mild", "moderate", "severe")
- `severity_level`: Уровень тяжести (1 = лёгкая, 2 = средняя, 3 = тяжёлая)
- `onset_time`: Время начала (формат HH:mm)
- `duration`: Продолжительность
- `duration_unit`: Единица продолжительности (hours, days)
- `description`: Описание симптома
- `triggers`: Список провоцирующих факторов
- `location`: Локализация симптома
- `associated_symptoms`: Сопутствующие симптомы
- `relief_factors`: Факторы облегчения
- `created_at`: Время записи

**summary**: Дневная сводка
- `total_symptoms`: Общее количество симптомов за день
- `most_severe`: Наиболее тяжёлый симптом
- `overall_discomfort`: Общий дискомфорт

### Метод чтения
```javascript
// Получение всех файлов с симптомами
const symptomFiles = glob('data/symptoms/**/*.json');

// Чтение всех данных о симптомах
const allSymptoms = symptomFiles.map(file => {
  const data = JSON.parse(readFile(file));
  return data.logs;
}).flat();

// Фильтрация по временному диапазону
function filterSymptomsByDate(symptoms, startDate, endDate) {
  return symptoms.filter(symptom => {
    const symptomDate = new Date(symptom.created_at);
    return symptomDate >= startDate && symptomDate <= endDate;
  });
}

// Статистика частоты симптомов
function getSymptomFrequency(symptoms) {
  const frequency = {};
  symptoms.forEach(symptom => {
    const name = symptom.name;
    frequency[name] = (frequency[name] || 0) + 1;
  });
  return frequency;
}
```

### Проверка доступности
```javascript
function checkSymptomsAvailable(startDate, endDate) {
  const symptomFiles = glob('data/symptoms/**/*.json');

  if (symptomFiles.length === 0) {
    return { available: false, message: "Записи симптомов отсутствуют" };
  }

  // Проверка наличия данных в указанном диапазоне
  const allSymptoms = readAllSymptoms(symptomFiles);
  const filtered = filterSymptomsByDate(allSymptoms, startDate, endDate);

  return {
    available: true,
    totalFiles: symptomFiles.length,
    totalRecords: allSymptoms.length,
    recordsInRange: filtered.length,
    dataDensity: filtered.length / getDaysBetween(startDate, endDate) // Среднее количество записей в день
  };
}
```

### Оценка качества данных
- **Отлично**: Плотность данных ≥ 0,5 (в среднем не менее 1 записи каждые 2 дня)
- **Хорошо**: Плотность данных ≥ 0,3 (в среднем не менее 1 записи каждые 3 дня)
- **Удовлетворительно**: Плотность данных ≥ 0,1 (в среднем не менее 1 записи каждые 10 дней)
- **Недостаточно**: Плотность данных < 0,1 (данных недостаточно, надёжность анализа трендов низкая)

### Обработка отсутствующих данных
- Если директория не существует: пропустить анализ симптомов, сообщить "Записи симптомов отсутствуют, рекомендуется использовать команду /symptom для записи"
- Если данных недостаточно (<1 месяца): сообщить "Записей симптомов менее 1 месяца, рекомендуется продлить период записи"
- Если качество данных низкое: отметить в отчёте "Качество данных: удовлетворительно, анализ трендов носит справочный характер"

---

## 3. Записи настроения (mood/)

### Путь к файлу
`data/mood/YYYY-MM/YYYY-MM-DD.json`

### Структура данных
```json
{
  "date": "2025-12-31",
  "logs": [
    {
      "id": "mood_20251231080000001",
      "timestamp": "2025-12-31T08:00:00.000Z",
      "mood_score": 7,
      "mood_description": "Хорошее",
      "energy_level": "moderate",
      "energy_score": 6,
      "sleep_quality": "fair",
      "sleep_hours": 6.5,
      "stress_level": "low",
      "stress_score": 3,
      "notes": "Прошлой ночью спал нормально, сегодня чувствую себя неплохо"
    }
  ],
  "summary": {
    "average_mood": 7.0,
    "average_sleep": 6.5,
    "average_stress": 3.0,
    "day_mood": "stable"
  }
}
```

### Описание полей

**Поля записи настроения**:
- `id`: Уникальный идентификатор
- `timestamp`: Временная метка записи
- `mood_score`: Оценка настроения (1-10 баллов, 10 = лучшее)
- `mood_description`: Описание настроения (например: "excellent", "good", "fair", "poor", "bad")
- `energy_level`: Уровень энергии ("high", "moderate", "low")
- `energy_score`: Оценка энергии (1-10 баллов)
- `sleep_quality`: Качество сна ("excellent", "good", "fair", "poor")
- `sleep_hours`: Продолжительность сна (часов)
- `stress_level`: Уровень стресса ("low", "moderate", "high")
- `stress_score`: Оценка стресса (1-10 баллов, 10 = максимальный стресс)
- `notes`: Примечания

**summary**: Дневная сводка
- `average_mood`: Средняя оценка настроения (среднее из нескольких записей за день)
- `average_sleep`: Средняя продолжительность сна
- `average_stress`: Средняя оценка стресса
- `day_mood`: Тренд настроения за день ("improving", "declining", "stable")

### Метод чтения
```javascript
// Чтение всех данных о настроении
const moodFiles = glob('data/mood/**/*.json');
const allMoods = moodFiles.map(file => {
  const data = JSON.parse(readFile(file));
  return data.logs;
}).flat();

// Извлечение данных временных рядов
function getMoodTimeSeries(moods) {
  return moods.map(mood => ({
    date: mood.timestamp.split('T')[0],
    time: mood.timestamp.split('T')[1].substring(0, 5),
    moodScore: mood.mood_score,
    sleepHours: mood.sleep_hours,
    stressScore: mood.stress_score
  }));
}

// Расчёт средних значений
function getMoodStats(moods) {
  const avgMood = moods.reduce((sum, m) => sum + m.mood_score, 0) / moods.length;
  const avgSleep = moods.reduce((sum, m) => sum + m.sleep_hours, 0) / moods.length;
  const avgStress = moods.reduce((sum, m) => sum + m.stress_score, 0) / moods.length;

  return { avgMood, avgSleep, avgStress };
}
```

### Проверка доступности
```javascript
function checkMoodAvailable(startDate, endDate) {
  const moodFiles = glob('data/mood/**/*.json');

  if (moodFiles.length === 0) {
    return { available: false, message: "Записи настроения отсутствуют" };
  }

  const allMoods = readAllMoods(moodFiles);
  const filtered = filterByDate(allMoods, startDate, endDate);

  return {
    available: true,
    totalRecords: filtered.length,
    recordRate: filtered.length / getDaysBetween(startDate, endDate), // Показатель записей
    hasSleepData: filtered.every(m => m.sleep_hours > 0),
    hasStressData: filtered.every(m => m.stress_score > 0)
  };
}
```

### Обработка отсутствующих данных
- Если нет данных о сне (sleep_hours = 0): пропустить корреляционный анализ сон-настроение
- Если нет данных о стрессе (stress_score = 0): пропустить корреляционный анализ стресс-настроение
- Если показатель записей < 30%: сообщить "Записей настроения мало, рекомендуется ежедневная запись"

---

## 4. Записи о питании (diet/)

### Путь к файлу
`data/diet/YYYY-MM/YYYY-MM-DD.json`

### Структура данных
```json
{
  "date": "2025-12-31",
  "meals": [
    {
      "id": "diet_20251231080000001",
      "meal_type": "breakfast",
      "meal_time": "08:00",
      "foods": [
        { "name": "Овсяная каша на молоке", "amount": 1, "unit": "порция", "calories": 250, "protein": 8, "carbs": 40, "fat": 5 },
        { "name": "Варёное яйцо", "amount": 1, "unit": "шт.", "calories": 70, "protein": 6, "carbs": 1, "fat": 5 }
      ],
      "total_calories": 320,
      "notes": "Сбалансированное питание"
    }
  ],
  "summary": { "total_calories": 1420, "total_protein": 48, "total_carbs": 96, "total_fat": 30, "meals_count": 3 }
}
```
*Массив `meals` содержит записи для каждого приёма пищи (breakfast, lunch, dinner, snack).*

### Описание полей

**Поля записи приёма пищи**:
- `id`: Уникальный идентификатор
- `meal_type`: Тип приёма пищи ("breakfast", "lunch", "dinner", "snack")
- `meal_time`: Время приёма пищи (формат HH:mm)
- `foods`: Список продуктов

**Поля продуктов**:
- `name`: Название продукта
- `amount`: Количество
- `unit`: Единица измерения (г, мл, шт., порция и др.)
- `calories`: Калорийность
- `protein`: Белок (г)
- `carbs`: Углеводы (г)
- `fat`: Жиры (г)

**summary**: Дневная сводка
- `total_calories`: Общая калорийность
- `total_protein`: Общий белок
- `total_carbs`: Общие углеводы
- `total_fat`: Общие жиры
- `meals_count`: Количество приёмов пищи

### Метод чтения
Чтение файлов из `data/diet/**/*.json`, агрегация по дням. Расчёт ежедневного потребления: суммирование calories, protein, carbs, fat по всем приёмам пищи.

### Проверка доступности
Проверить наличие файлов в `data/diet/`. Убедиться в наличии данных о калорийности и макронутриентах.

### Обработка отсутствующих данных
- Данные о питании необязательны, их отсутствие не влияет на анализ других измерений
- Если нет данных о калорийности (calories = 0): пропустить корреляционный анализ питание-вес
- Если показатель записей < 20%: сообщить "Записей о питании мало, рекомендуется записывать каждый приём пищи"

---

## 5. Журнал приёма лекарств (medication-logs/)

### Путь к файлу
`data/medication-logs/YYYY-MM/YYYY-MM-DD.json`

### Структура данных
```json
{
  "date": "2025-12-31",
  "logs": [
    {
      "id": "log_20251231080000001",
      "medication_id": "med_20250915123456789",
      "medication_name": "Амлодипин",
      "scheduled_time": "08:00",
      "scheduled_dose": {
        "value": 5,
        "unit": "мг"
      },
      "actual_time": "2025-12-31T08:05:00",
      "status": "taken",
      "actual_dose": {
        "value": 5,
        "unit": "мг"
      },
      "notes": "",
      "created_at": "2025-12-31T08:05:00.000Z"
    },
    {
      "id": "log_20251231200000002",
      "medication_id": "med_20250915123456789",
      "medication_name": "Амлодипин",
      "scheduled_time": "20:00",
      "scheduled_dose": {
        "value": 5,
        "unit": "мг"
      },
      "actual_time": null,
      "status": "missed",
      "actual_dose": null,
      "notes": "Забыл принять",
      "created_at": "2025-12-31T22:00:00.000Z"
    }
  ],
  "summary": {
    "total_planned": 2,
    "total_taken": 1,
    "total_missed": 1,
    "adherence_rate": 50
  }
}
```

### Описание полей

**Поля журнала приёма лекарств**:
- `id`: Уникальный идентификатор
- `medication_id`: ID лекарства (связь с medications.json)
- `medication_name`: Название лекарства
- `scheduled_time`: Запланированное время приёма (HH:mm)
- `scheduled_dose`: Запланированная доза
- `actual_time`: Фактическое время приёма (формат ISO 8601)
- `status`: Статус приёма ("taken", "missed", "skipped", "delayed")
- `actual_dose`: Фактическая доза
- `notes`: Примечания

**summary**: Дневная сводка
- `total_planned`: Запланированное количество приёмов
- `total_taken`: Фактически принято
- `total_missed`: Пропущено
- `adherence_rate`: Показатель приверженности за день (%)

### Метод чтения
Чтение файлов из `data/medication-logs/**/*.json`, агрегация по дням. Расчёт приверженности: `taken / total * 100`. Группировка по лекарствам для индивидуальной статистики.

### Проверка доступности
Проверить наличие файлов в `data/medication-logs/`. Извлечь список уникальных лекарств и диапазон дат.

### Обработка отсутствующих данных
- Если нет журнала приёма лекарств: пропустить анализ приверженности
- Если журнал неполный (<1 месяца): сообщить "Журнал приёма лекарств менее 1 месяца, рекомендуется продлить период записи"

---

## 6. Результаты анализов (medical_records/)

### Путь к файлу
`data/medical_records/biochemical_tests/YYYY-MM-DD.json` или
`data/medical_records/imaging_tests/YYYY-MM-DD.json`

### Структура данных (биохимическое исследование)
```json
{
  "report_id": "lab_20251231001",
  "report_type": "biochemical",
  "test_date": "2025-12-31",
  "hospital": "Лаборатория клинической больницы",
  "indicators": [
    {
      "name": "Общий холестерин",
      "name_en": "Total Cholesterol",
      "value": 210,
      "unit": "мг/дл",
      "reference_range": "200-240",
      "reference_min": 200,
      "reference_max": 240,
      "status": "normal",
      "trend": "decreased"
    },
    {
      "name": "Глюкоза натощак",
      "name_en": "Fasting Glucose",
      "value": 5.4,
      "unit": "ммоль/л",
      "reference_range": "3,9-6,1",
      "reference_min": 3.9,
      "reference_max": 6.1,
      "status": "normal",
      "trend": "stable"
    },
    {
      "name": "Систолическое давление",
      "name_en": "Systolic BP",
      "value": 132,
      "unit": "мм рт.ст.",
      "reference_range": "90-140",
      "reference_min": 90,
      "reference_max": 140,
      "status": "normal",
      "trend": "decreased"
    },
    {
      "name": "Диастолическое давление",
      "name_en": "Diastolic BP",
      "value": 82,
      "unit": "мм рт.ст.",
      "reference_range": "60-90",
      "reference_min": 60,
      "reference_max": 90,
      "status": "normal",
      "trend": "decreased"
    }
  ],
  "summary": {
    "total_indicators": 4,
    "abnormal_count": 0,
    "improved_count": 2,
    "worsened_count": 0
  },
  "created_at": "2025-12-31T10:00:00.000Z"
}
```

### Описание полей

**Поля отчёта об анализах**:
- `report_id`: ID отчёта
- `report_type`: Тип отчёта ("biochemical", "imaging")
- `test_date`: Дата исследования
- `hospital`: Название медучреждения
- `indicators`: Список показателей

**Поля показателей**:
- `name`: Название показателя
- `name_en`: Название показателя (англ.)
- `value`: Значение
- `unit`: Единица измерения
- `reference_range`: Референсный диапазон (строка)
- `reference_min`: Нижняя граница
- `reference_max`: Верхняя граница
- `status`: Статус ("normal", "abnormal_low", "abnormal_high")
- `trend`: Тренд ("improved", "worsened", "stable", "new")

### Метод чтения
Чтение файлов из `data/medical_records/biochemical_tests/**/*.json`. Извлечение временного ряда по каждому показателю (name), сортировка по дате. Выявление аномальных показателей (status !== 'normal').

### Проверка доступности
Проверить наличие файлов. Для анализа тренда необходимо не менее 2 отчётов. Извлечь список уникальных показателей.

### Обработка отсутствующих данных
- Если нет результатов анализов: пропустить анализ лабораторных показателей
- Если только 1 отчёт: показать текущие значения, сообщить "Для анализа тренда необходимо не менее 2 отчётов"
- Если интервал между отчётами < 1 месяца: сообщить "Интервал между анализами мал, рекомендуется повторная проверка через 3-6 месяцев"

---

## 7. Данные о женском здоровье (условные источники данных)

### 7.1 Отслеживание цикла (cycle-tracker.json)

#### Путь к файлу
`data/cycle-tracker.json`

#### Структура данных (сводка)
```json
{
  "cycles": [
    {
      "cycle_id": "cycle_20251101",
      "period_start": "2025-11-01",
      "period_end": "2025-11-05",
      "cycle_length": 28,
      "daily_logs": [
        {
          "date": "2025-11-01",
          "symptoms": ["Боль в животе", "Боль в пояснице"],
          "mood": "Нормальное",
          "flow": { "intensity": "medium" }
        }
      ]
    }
  ]
}
```

#### Метод чтения
Чтение `data/cycle-tracker.json` только для пользователей с `gender === 'женский'`. Подсчёт циклов и проверка наличия записей о симптомах.

### 7.2 Отслеживание беременности (pregnancy-tracker.json)

#### Путь к файлу
`data/pregnancy-tracker.json`

#### Структура данных (сводка)
```json
{
  "current_pregnancy": {
    "start_date": "2025-06-01",
    "current_week": 30,
    "weight_gain": 8.5,
    "checkups": [...]
  }
}
```

#### Метод чтения
```javascript
function checkPregnancyDataAvailable() {
  try {
    const pregnancyData = JSON.parse(readFile('data/pregnancy-tracker.json'));
    const hasActivePregnancy = pregnancyData.current_pregnancy !== null;

    return {
      available: hasActivePregnancy,
      currentWeek: hasActivePregnancy ? pregnancyData.current_pregnancy.current_week : null
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
```

### 7.3 Отслеживание менопаузы (menopause-tracker.json)

#### Путь к файлу
`data/menopause-tracker.json`

#### Структура данных (сводка)
```json
{
  "menopause_tracking": {
    "start_date": "2025-01-01",
    "symptoms": ["Приливы", "Потливость"],
    "hrt_use": true
  }
}
```

#### Метод чтения
```javascript
function checkMenopauseDataAvailable() {
  try {
    const menopauseData = JSON.parse(readFile('data/menopause-tracker.json'));
    const hasTracking = menopauseData.menopause_tracking !== null;

    return {
      available: hasTracking,
      symptoms: hasTracking ? menopauseData.menopause_tracking.symptoms : []
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
```

---

## 8. Прочие источники данных

### 8.1 История аллергий (allergies.json)

```json
{
  "allergies": [
    {
      "allergen": { "name": "Пенициллин", "type": "drug" },
      "severity_level": 4,
      "current_status": { "status": "active" }
    }
  ]
}
```

**Назначение**: Отметка аллергических рисков в анализе трендов, предупреждение о связанных симптомах

### 8.2 Записи облучения (radiation-records.json)

```json
{
  "records": [
    {
      "exam_date": "2025-12-31",
      "exam_type": "КТ",
      "dose": 5.2,
      "dose_unit": "мЗв"
    }
  ]
}
```

**Назначение**: Отслеживание накопленной дозы облучения, оценка рисков

---

## Стратегия агрегации данных

### Полный процесс чтения данных

1. Определение временного диапазона (по умолчанию: последние 3 месяца)
2. Проверка доступности каждого источника (profile, symptoms, mood, diet, medications, labResults, cycle, pregnancy, menopause)
3. Чтение доступных данных с фильтрацией по диапазону дат
4. Анализ трендов по всем доступным измерениям
5. Формирование отчёта с учётом доступности данных

---

## Стандарты качества данных

### Минимальные требования к данным

| Тип анализа | Минимальный объём данных | Рекомендуемый объём данных |
|---------|-----------|-----------|
| Тренд веса/ИМТ | 2 временные точки | 5 и более точек |
| Паттерны симптомов | 1 месяц записей | 3 месяца записей |
| Приверженность приёму лекарств | 2 недели записей | 1 месяц записей |
| Тренд результатов анализов | 2 отчёта | 3 и более отчётов |
| Корреляция настроение-сон | 2 недели записей (ежедневно) | 1 месяц записей |
| Корреляционный анализ | 30 точек данных | 60 и более точек |

### Оценка полноты данных
Для каждого источника рассчитывается отношение дней с записями к общему числу дней в периоде:
- **good**: >= 50% (настроение) / >= 30% (симптомы)
- **fair**: >= 30% / >= 10%
- **poor**: ниже порога fair

---

## Фильтрация и очистка данных

### Фильтрация по временному диапазону
Фильтрация записей по полям `date`, `created_at` или `timestamp` в заданном диапазоне дат.

### Обнаружение выбросов
Метод 2-sigma: значения, отклоняющиеся от среднего более чем на 2 стандартных отклонения, помечаются как выбросы.

### Обработка пропущенных значений
Два метода заполнения пропусков:
1. **Линейная интерполяция**: среднее между предыдущим и следующим значениями
2. **Прямое заполнение (forward fill)**: использование последнего известного значения

---

## Формат экспорта данных

### Экспорт JSON (для HTML-отчёта)

```json
{
  "analysis_date": "2025-12-31",
  "period": {
    "start": "2025-10-01",
    "end": "2025-12-31",
    "days": 92
  },
  "data_sources": {
    "profile": "available",
    "symptoms": "available",
    "mood": "available",
    "diet": "not_available"
  },
  "trends": {
    "weight": { "direction": "decreasing", "change": -2.3, "unit": "кг" },
    "symptoms": { "most_frequent": "Головная боль", "frequency": 12, "trend": "decreasing" },
    "medications": { "adherence": 78, "missed_doses": 8 },
    "mood": { "average_score": 6.8, "trend": "stable" }
  },
  "correlations": [
    { "x": "Продолжительность сна", "y": "Оценка настроения", "coefficient": 0.78, "significance": "high" }
  ],
  "recommendations": [
    "Увеличить продолжительность сна до 7-8 часов",
    "Установить вечернее напоминание о приёме лекарств",
    "Повторная проверка липидного профиля через 3 месяца"
  ]
}
```

---

## Миграция на `sources/` (1.7.0) — КАНОНИЧЕСКИЙ layout первичных данных

С версии 1.7.0 у пакета ОДИН канонический layout первичных данных, и он определяется командой
`intake-archive` (см. `skills/intake-archive/SKILL.md`). Определение живёт в ОДНОМ машиночитаемом
месте — `lib/workspace-layout.js`; всё остальное его импортирует.

```
<workspace>/
  sources/
    raw/sha256-<64 hex>/    неизменяемые принятые архивы (только intake-archive)
    manifest.json           ИНДЕКС: строка на каждый принятый файл
    LOG.jsonl               append-only ЖУРНАЛ: строка на каждую попытку приёма, включая отказы
```

### Что во что переходит

| Было (этот документ, до 1.7.0) | Стало (канон 1.7.0) |
|---|---|
| `data/profile.json` | `profile.json` кейса — схема и гарантии у `case-state` (`skills/case-state/`) |
| `data/medical_records/**/*.json` | `sources/raw/sha256-<hex>/**` + строка в `sources/manifest.json` |

### Что канонического дома ПОКА НЕ ИМЕЕТ — сказано прямо, а не замазано

Остальные девять источников из таблицы выше (`data/symptoms/**`, `data/mood/**`, `data/diet/**`,
`data/medication-logs/**`, `data/cycle-tracker.json`, `data/pregnancy-tracker.json`,
`data/menopause-tracker.json`, `data/allergies.json`, `data/radiation-records.json`)
**канонического места в `sources/` пока не имеют**. Это честный незакрытый разрыв, а не недосмотр:
`sources/` спроектирован под НЕИЗМЕНЯЕМЫЕ первичные документы, а перечисленные — это
редактируемые пользователем временные ряды, и класть их в raw-зону значило бы соврать про их
природу. До отдельного решения они остаются там, где лежат.

### Принудительной миграции НЕТ

Ничего в 1.7.0 не читает, не переносит и не перезаписывает `data/**`. Воркспейс без `data/` ведёт
себя до и после 1.7.0 одинаково. Воркспейс С `data/` получает **громкое предупреждение**
`[LEGACY-LAYOUT]` — от `intake-archive` и от его отчёта `--verify`, и БОЛЬШЕ НИОТКУДА:
`ha check` остаётся без warn-режима по своей же доктрине («NO --warn mode and NO warn-only
outcome»), потому что warn внутри гейта — это то, как гейт тихо умирает.

`detectLegacyLayout()` делает `lstat`, а не `read`: чтобы обнаружить наличие старого дерева, файл
пациента открывать не нужно, и не открывать его — самая дешёвая из возможных позиций по приватности.
