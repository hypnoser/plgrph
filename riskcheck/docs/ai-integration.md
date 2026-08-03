# Інтеграція з Google Apps Script

## Крок 1: Створення веб-застосунку

Відкрийте https://script.google.com і створіть новий проєкт. Вставте цей код:

```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var email = data.email;
  var pos = data.pos;
  var score = data.score;

  // 1. Запис у Google Sheets
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow([new Date(), email, pos, score]);

  // 2. Відправка email через Gmail
  var subject = 'RiskCheck — Ваш аналітичний звіт';
  var body = 'Вітаю, це Сергій Коржов.\n\nВи оцінювали кандидата на посаду ' + pos + '.\nІндекс ризику: ' + score + '.\n\nДля обговорення результатів — відповідайте на цей лист.\n\nЗ повагою,\nСергій Коржов\nPLGRPH';
  GmailApp.sendEmail(email, subject, body);

  return ContentService.createTextOutput(JSON.stringify({status:'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return ContentService.createTextOutput('RiskCheck API is running')
    .setMimeType(ContentService.MimeType.TEXT);
}
```

## Крок 2: Розгортання

1. Збережіть проєкт (Ctrl+S)
2. Натисніть **Deploy → New deployment**
3. Тип: **Web app**
4. Хто має доступ: **Anyone**
5. Скопіюйте URL (виглядає як `https://script.google.com/macros/s/AKfycb.../exec`)

## Крок 3: Підключення до RiskCheck

Відкрийте `assets/js/app.js`, знайдіть рядок:

```javascript
var APPS_SCRIPT_URL='https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
```

Замініть `YOUR_SCRIPT_ID` на ID з вашого URL.

## Крок 4: Gemini AI (опціонально)

Додайте в Apps Script функцію для генерації AI-коментаря:

```javascript
function generateAIComment(data) {
  var apiKey = 'ВАШ_GEMINI_API_KEY'; // з aistudio.google.com
  var prompt = 'Ти — поліграфолог Сергій Коржов. Напиши 3 речення українською про профіль ризику кандидата на посаду ' + data.pos + ' з індексом ' + data.score + '. Без загальних фраз, конкретика.';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({contents:[{parts:[{text:prompt}]}]})
  });
  var result = JSON.parse(response.getContentText());
  return result.candidates[0].content.parts[0].text;
}
```

## Важливо

- **Ніколи не зберігайте API-ключ у фронтенді.** Тільки в Apps Script.
- Для тестування Apps Script може вимагати дозволу на відправку email. Надайте їх.
- Якщо листи потрапляють у Спам — додайте інструкцію в email-шаблони.
