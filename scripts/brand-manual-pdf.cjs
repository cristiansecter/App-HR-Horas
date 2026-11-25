// Exporta docs/marca/index.html a PDF (A4) con Playwright. Uso: node scripts/brand-manual-pdf.cjs [carpeta-para-capturas]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(root, 'docs/marca/index.html'), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(root, 'docs/marca/SG-Black-Manual-de-marca.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  console.log('PDF listo');
})();
