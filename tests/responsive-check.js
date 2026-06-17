const { chromium } = require("playwright-core");

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const viewports = [
  { width: 360, height: 1200, name: "phone-360" },
  { width: 390, height: 1200, name: "phone-390" },
  { width: 500, height: 1400, name: "phone-500" },
  { width: 768, height: 1300, name: "tablet-768" },
  { width: 1024, height: 1300, name: "tablet-1024" },
  { width: 1280, height: 1200, name: "desktop-1280" },
  { width: 1440, height: 1200, name: "desktop-1440" },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const failures = [];

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto("http://localhost:8080", { waitUntil: "networkidle" });
    await page.screenshot({ path: `/tmp/vega-${viewport.name}.png`, fullPage: true });

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const form = document.querySelector("[data-contact-form]");
      const heroMeta = document.querySelector(".hero-meta");
      return {
        innerWidth,
        scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
        formWidth: form ? form.getBoundingClientRect().width : 0,
        heroMetaWidth: heroMeta ? heroMeta.getBoundingClientRect().width : 0,
      };
    });

    if (metrics.scrollWidth > metrics.innerWidth + 1) {
      failures.push(
        `${viewport.name}: horizontal overflow ${metrics.scrollWidth}px > ${metrics.innerWidth}px`
      );
    }

    if (metrics.formWidth > metrics.innerWidth) {
      failures.push(`${viewport.name}: form wider than viewport`);
    }

    if (metrics.heroMetaWidth > metrics.innerWidth) {
      failures.push(`${viewport.name}: hero stack wider than viewport`);
    }

    await page.close();
  }

  await browser.close();

  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }

  console.log(`Responsive check passed for ${viewports.length} viewports.`);
})();
