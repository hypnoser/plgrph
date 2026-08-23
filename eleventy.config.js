const { EleventyHtmlBasePlugin } = require("@11ty/eleventy");

module.exports = function (eleventyConfig) {
  // ---- Passthrough (статичні файли копіюються as-is) ----
  eleventyConfig.addPassthroughCopy("src/assets/css");
  eleventyConfig.addPassthroughCopy("src/assets/fonts");
  eleventyConfig.addPassthroughCopy("src/assets/images");
  eleventyConfig.addPassthroughCopy("src/assets/favicon");

  // /ps/ (Polygraph Suite) — окремий діючий продукт, живе в корені репозиторію
  // поза src/. Копіюється в _site/ps/ незмінним, логіку/код НЕ чіпаємо.
  eleventyConfig.addPassthroughCopy({ ps: "ps" });

  // ---- Колекції ----
  // Блог/статті: усі markdown-файли з src/blog/, крім index
  eleventyConfig.addCollection("blogPosts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/blog/*.md")
      .sort((a, b) => b.date - a.date);
  });

  // Сертифікати/дипломи для сторінки /kvalifikatsiya/ — власник додає файли
  // в src/certificates/, кожен окремим markdown-файлом. Порядок — за order
  // у frontmatter (менше число = вище на сторінці), потім за датою файлу.
  eleventyConfig.addCollection("certificates", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("src/certificates/*.md")
      .sort((a, b) => {
        const orderA = a.data.order ?? 999;
        const orderB = b.data.order ?? 999;
        return orderA - orderB;
      });
  });

  // ---- Фільтри ----
  eleventyConfig.addFilter("dateUk", (dateObj) => {
    return new Date(dateObj).toLocaleDateString("uk-UA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  });

  eleventyConfig.addFilter("isoDate", (dateObj) => {
    return new Date(dateObj).toISOString();
  });

  // slug-фільтр з транслітерацією кирилиці (той самий підхід, що на krzhv)
  eleventyConfig.addFilter("autoSlug", (str) => {
    const translitMap = {
      а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie",
      ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l",
      м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
      ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "",
      ю: "iu", я: "ia", " ": "-",
    };
    return str
      .toLowerCase()
      .split("")
      .map((ch) => (translitMap[ch] !== undefined ? translitMap[ch] : ch))
      .join("")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  });

  eleventyConfig.addGlobalData("currentYear", () => new Date().getFullYear());

  // Мапа URL-сегментів на людські назви — використовується для BreadcrumbList
  // schema та видимих хлібних крихт. Додавайте новий запис при створенні
  // нової top-level сторінки.
  eleventyConfig.addGlobalData("pageTitles", () => ({
    "perevirky": "Перевірки",
    "dlya-fahivtsiv": "Для фахівців",
    "pro-specialista": "Про спеціаліста",
    "faq": "Питання і відповіді",
    "blog": "Блог",
    "kontakty": "Контакти",
  }));

  eleventyConfig.addFilter("dump", (value) => {
    return JSON.stringify(value ?? "").replace(/</g, "\\u003c");
  });

  // Власний фільтр замість вбудованого Nunjucks `slice` — той має іншу
  // семантику (розбиття на підмасиви) і ламає прості випадки "перші N
  // елементів масиву об'єктів". limit(arr, n) повертає перші n елементів.
  eleventyConfig.addFilter("limit", (arr, n) => {
    if (!Array.isArray(arr)) return arr;
    return arr.slice(0, n);
  });

  // Виключає поточну сторінку зі списку колекції (для блоку "Читайте також")
  eleventyConfig.addFilter("excludeSelf", (arr, currentUrl) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter((item) => item.url !== currentUrl);
  });

  eleventyConfig.addPlugin(EleventyHtmlBasePlugin);

  return {
    dir: {
      input: "src",
      includes: "_includes",
      layouts: "_layouts",
      output: "_site",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    dataTemplateEngine: "njk",
  };
};
