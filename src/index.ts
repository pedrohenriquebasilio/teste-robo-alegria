import 'dotenv/config';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import logger from './utils/logger';
import { executeAction } from './core/navigator';
import { getDates } from './utils/dateHelper';
import { solveCaptcha } from './services/captcha';
import { processFile } from './services/fileProcess';

chromium.use(stealthPlugin());

(async () => {
    if (!process.env.PITZI_EMAIL || !process.env.ANTICAPTCHA_KEY) {
        logger.error('Faltam variáveis de ambiente (.env)');
        process.exit(1);
    }

    const browser: Browser = await chromium.launch({
        headless: process.env.HEADLESS === 'true',
        proxy: {
            server: '216.10.27.159:6837',
            username: 'urixdzgb',
            password: 'b2rqzhev455w'
        },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const context: BrowserContext = await browser.newContext({
        acceptDownloads: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
    });

    const page: Page = await context.newPage();
    page.setDefaultTimeout(60000);

    try {
        const dates = getDates();
        const downloadPath = path.resolve(process.env.DOWNLOAD_PATH || 'downloads');
        await fs.ensureDir(downloadPath);

        await executeAction(page, 'Navegar para Login', async (p) => {
            await p.goto('https://pitzi.com.br/sellers/sign_in', { waitUntil: 'domcontentloaded' });
        });

        await executeAction(page, 'Preencher Credenciais', async (p) => {
            await p.fill('input[name="seller[email]"]', process.env.PITZI_EMAIL!);
            await p.fill('input[name="seller[password]"]', process.env.PITZI_PASS!);
        });

        const siteKey = await executeAction<string | null>(page, 'Capturar SiteKey', async (p) => {
            return await p.getAttribute('div.g-recaptcha', 'data-sitekey');
        });

        if (!siteKey) throw new Error('SiteKey do ReCaptcha não encontrado');

        await executeAction(page, 'Esperar widget recaptcha', async (p) => {
            try {
                await Promise.race([
                    p.waitForSelector('iframe[src*="recaptcha"]', { timeout: 15000 }),
                    p.waitForSelector('#g-recaptcha-response', { timeout: 15000 }),
                    p.waitForSelector('textarea[name="g-recaptcha-response"]', { timeout: 15000 })
                ]);
            } catch {}
        });

        const captchaToken = await solveCaptcha(process.env.ANTICAPTCHA_KEY!, siteKey, page.url());
        if (!captchaToken) throw new Error('Captcha não resolvido');

        await executeAction(page, 'Injetar token recaptcha', async (p) => {
            const selectors = [
                '#g-recaptcha-response',
                'textarea[name="g-recaptcha-response"]',
                'form textarea#g-recaptcha-response'
            ];

            let found = null;
            for (const s of selectors) {
                try {
                    const el = await p.waitForSelector(s, { timeout: 3000 });
                    if (el) {
                        found = s;
                        break;
                    }
                } catch {}
            }

            if (!found) {
                await p.evaluate((token: string) => {
                    let el = document.getElementById('g-recaptcha-response') as HTMLTextAreaElement | null;
                    if (!el) {
                        el = document.createElement('textarea');
                        el.id = 'g-recaptcha-response';
                        el.name = 'g-recaptcha-response';
                        el.style.display = 'none';
                        document.body.appendChild(el);
                    }
                    el.value = token;
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }, captchaToken);
            } else {
                await p.evaluate((args: { sel: string; token: string }) => {
                    const el = document.querySelector(args.sel) as HTMLTextAreaElement | null;
                    if (el) {
                        el.value = args.token;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, { sel: found, token: captchaToken });
            }

            await p.waitForTimeout(700);
        });

        await executeAction(page, 'Enviar Login', async (p) => {
            const [response] = await Promise.all([
                p.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => null),
                p.click('input[name="commit"]')
            ]);
            if (!response) await p.waitForTimeout(1500);
        });

        await executeAction(page, 'Preencher Filtros de Data', async (p) => {
            await p.locator('[name="start_date[month]"]').click();
            await p.locator('[name="start_date[month]"]').type(dates.startMonth);
            await p.locator('[name="start_date[year]"]').click();
            await p.locator('[name="start_date[year]"]').type(dates.startYear);
            await p.locator('[name="end_date[day]"]').click();
            await p.locator('[name="end_date[day]"]').type(dates.endDay);
            await p.locator('[name="end_date[month]"]').click();
            await p.locator('[name="end_date[month]"]').type(dates.endMonth);
            await p.locator('[name="end_date[year]"]').click();
            await p.locator('[name="end_date[year]"]').type(dates.endYear);
        });

        await executeAction(page, 'Aplicar Filtro', async (p) => {
            await p.click('input[name="commit"]');
            await p.waitForTimeout(5000);
        });

        const downloadPromise = page.waitForEvent('download');

        await executeAction(page, 'Iniciar Download', async (p) => {
            await p.click('xpath=/html/body/div[1]/section[2]/div/ul/li[1]/a');
        });

        const download = await downloadPromise;
        const tempPath = path.join(downloadPath, download.suggestedFilename());
        await download.saveAs(tempPath);

        logger.info(`Download concluído: ${tempPath}`);

        const finalDir = path.resolve(process.env.OUTPUT_PATH || 'output');
        await processFile(tempPath, finalDir, dates.formattedCurrent, dates.rawStart, dates.rawEnd);

    } catch (error: any) {
        logger.error(`Execução falhou: ${error?.message ?? error}`);
        process.exit(1);
    } finally {
        await browser.close();
        logger.info('Browser encerrado.');
    }
})();
