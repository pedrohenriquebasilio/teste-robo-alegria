import 'dotenv/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs-extra';
import logger from './utils/logger';
import { executeAction } from './core/navigator';
import { getDates } from './utils/dateHelper';
import { solveCaptcha } from './services/captcha';
import { processFile } from './services/fileProcess';


(async () => {
    if (!process.env.PITZI_EMAIL || !process.env.ANTICAPTCHA_KEY) {
        logger.error('Faltam variáveis de ambiente (.env)');
        process.exit(1);
    }

    const browser: Browser = await chromium.launch({ 
        headless: process.env.HEADLESS === 'true',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const context: BrowserContext = await browser.newContext({ acceptDownloads: true });
    const page: Page = await context.newPage();

    try {
        const dates = getDates();
        const downloadPath = path.resolve(process.env.DOWNLOAD_PATH || 'downloads');
        await fs.ensureDir(downloadPath);

        await executeAction(page, 'Navegar para Login', async (p) => {
            await p.goto('https://pitzi.com.br/sellers/sign_in');
        });

        await executeAction(page, 'Preencher Credenciais', async (p) => {
            await p.fill('input[name="seller[email]"]', process.env.PITZI_EMAIL!);
            await p.fill('input[name="seller[password]"]', process.env.PITZI_PASS!);
        });
        const siteKey = await executeAction<string | null>(page, 'Capturar SiteKey', async (p) => {
            return await p.getAttribute('div.g-recaptcha', 'data-sitekey');
        });

        if (!siteKey) throw new Error('SiteKey do ReCaptcha não encontrado');

        const captchaToken = await solveCaptcha(process.env.ANTICAPTCHA_KEY!, siteKey, page.url());

        await executeAction(page, 'Injetar Token e Login', async (p) => {
            await p.evaluate((token: string) => {
                const el = document.getElementById('g-recaptcha-response');
                if(el) el.innerHTML = token;
            }, captchaToken);
            
            await p.click('input[name="commit"]');
            await p.waitForLoadState('networkidle');
        });
        await executeAction(page, 'Preencher Filtros de Data (Original)', async (p) => {
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
        logger.error(`Execução falhou: ${error.message}`);
        process.exit(1);
    } finally {
        await browser.close();
        logger.info('Browser encerrado.');
    }
})();