# RiskCheck — Інструкція з деплою

## 1. GitHub Pages

1. Створіть репозиторій `riskcheck` на https://github.com/hypnoser
2. Завантажте всі файли з цієї папки
3. Перейдіть у Settings → Pages → Source: Deploy from a branch → main / root
4. Сайт буде доступний за адресою: `https://hypnoser.github.io/riskcheck/`

## 2. Google Apps Script (Email + AI)

1. Перейдіть на https://script.google.com
2. Створіть новий проєкт → вставте код з `docs/ai-integration.md`
3. Збережіть → Розгорніть як веб-застосунок (Deploy → New deployment → Web app)
4. Скопіюйте URL веб-застосунку
5. Відкрийте `assets/js/app.js` → знайдіть `APPS_SCRIPT_URL` → замініть `YOUR_SCRIPT_ID` на реальний ID

## 3. Gemini API Key (опціонально, для AI-коментарів)

1. Перейдіть на https://aistudio.google.com/app/apikey
2. Створіть API-ключ
3. Вставте його в Google Apps Script (не у фронтенд!)

## 4. Логотип

Замініть `assets/images/logo.png` на ваш логотип PLGRPH. SVG-версія вже вбудована в `index.html`.

## 5. Тестування

Відкрийте `index.html` локально через Live Server або просто подвійним кліком. Перевірте:
- Перехід між екранами
- Калькулятор з усіма валютами
- Опитування для CFO та CEO
- Генерацію звіту
- Друк (Ctrl+P)

## Структура файлів

```
riskcheck/
├── .nojekyll
├── index.html
├── assets/
│   ├── css/main.css
│   ├── js/app.js
│   └── images/logo.png (ваш логотип)
├── email-templates/
├── pages/
│   ├── privacy.html
│   └── disclaimer.html
└── docs/
    ├── setup.md
    └── ai-integration.md
```
