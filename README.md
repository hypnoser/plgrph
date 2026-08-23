# PLGRPH — сайт (plgrph.com)

Статичний сайт на Eleventy (11ty). Хостинг — GitHub Pages, DNS — Cloudflare
(без Cloudflare Worker — навмисно, історія проблем описана в README проєкту
[krzhv](https://github.com/hypnoser/krzhv)).

## Технічний стек

- **Генератор:** Eleventy (11ty) v3
- **Шаблони:** Nunjucks (`.njk`)
- **Хостинг:** GitHub Pages
- **DNS:** Cloudflare (bare domain plgrph.com, без Worker у шляху запиту)
- **Шрифти:** Manrope (заголовки), Inter (текст) — self-hosted WOFF2

## Структура проєкту

```
src/
  _layouts/       — базові шаблони сторінок (base.njk)
  _includes/      — партіали (header, footer, maintenance overlay)
  assets/
    css/          — стилі, що не інлайняться в <head>
    fonts/        — self-hosted WOFF2 (Manrope, Inter) — довантажити вручну, див. нижче
    images/       — зображення, лого
  blog/           — статті блогу (markdown), колекція blogPosts
  index.njk       — головна сторінка
  robots.njk      — генерує /robots.txt
  sitemap.njk     — генерує /sitemap.xml з усіх колекцій
  llms.njk        — генерує /llms.txt
eleventy.config.js — конфіг: колекції, фільтри, passthrough-копіювання
```

## Важливо: /ps/ (Polygraph Suite)

Калькулятор `/ps/` — **окремий діючий продукт**, що вже живе в корені цього
репозиторію (поза `src/`). Його код і логіку **не чіпаємо**.

⚠️ **Критично для деплою.** Поточний сайт деплоїться через
Settings → Pages → "Deploy from a branch" — публікується весь корінь гілки
напряму, тому `/ps/` зараз живий просто завдяки фізичному розташуванню.
Після переходу на GitHub Actions (обов'язково для Eleventy-білду)
публікується **лише вміст `_site/`** — вихід Eleventy з `src/`. Щоб `/ps/`
не зник із живого сайту, `eleventy.config.js` явно копіює його незмінним:

```js
eleventyConfig.addPassthroughCopy({ ps: "ps" });
```

Це перевірено локальною збіркою — `/ps/`, `/ps/en/`, `/ps/es/` потрапляють
у `_site/ps/` побайтово без змін. **Не видаляти цей рядок з конфігу** і не
переносити `/ps/` всередину `src/` без окремого узгодження — калькулятор
має продовжувати оновлюватися своїм окремим робочим процесом, незалежним
від цього сайту.

## Maintenance overlay ("сайт на реконструкції")

Увімкнення на будь-якій сторінці — `maintenanceOverlay: true` у frontmatter.
Це HTML/CSS overlay, не JS-підміна — реальний контент сторінки лишається
в DOM і доступний пошуковим ботам (Google-safe підхід). Дисміс — прихована
48×48px click-зона у правому верхньому куті, зберігається per-browser через
localStorage (ключ `plgrph_maintenance_dismissed`).

Коли редизайн буде готовий до публікації — прибрати `maintenanceOverlay: true`
з frontmatter кожної сторінки (не видаляти сам include-файл — знадобиться
для майбутніх технічних робіт).

## Шрифти — довантажити вручну перед першим білдом

WOFF2-файли не включені в репозиторій (додаються локально). Потрібні:
- `src/assets/fonts/inter-var.woff2` — Inter Variable
- `src/assets/fonts/manrope-var.woff2` — Manrope Variable

Джерело — Google Fonts (google-webfonts-helper або офіційні репозиторії
шрифтів), варіативні (variable) версії для мінімізації кількості файлів.

## Команди

```bash
npm install       # встановити залежності
npm run serve      # локальний dev-сервер з live reload
npm run build       # продакшн-білд у _site/
```

## Контент-воркфлоу (статті блогу)

Буде наповнено на кроці 11 (розділ /blog/), коли з'явиться шаблон статті
й колекція. Орієнтир — той самий підхід, що на krzhv: нові статті через
GitHub веб-редактор як Markdown, slug автогенерується з заголовка через
`autoSlug`-фільтр (транслітерація кирилиці).

## Відомі технічні уроки (успадковано з krzhv, актуальні й тут)

- Перевіряти реальний збережений стан файлу після редагування через GitHub
  веб-редактор — збереження іноді мовчки не спрацьовує.
- Вставка багаторядкового YAML-frontmatter через веб-редактор GitHub може
  внести символи табуляції — ламає парсер Eleventy. Використовувати
  flow-style (однорядковий, JSON-подібний) YAML для складних блоків.
- Шляхи до зображень у Markdown — завжди абсолютні (`/assets/images/...`),
  не відносні.
- Якщо GitHub Actions білд падає з помилками Jekyll/Liquid — перевірити
  Settings → Pages → Source (має бути "GitHub Actions", могло тихо
  відкотитися на "Deploy from a branch").
- Якщо виникають дивні проблеми з кешуванням/застарілим контентом —
  перше, що перевірити, це наявність залишкового Cloudflare Worker,
  прив'язаного до домену.
