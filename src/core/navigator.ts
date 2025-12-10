import { Page } from 'playwright';
import logger from '../utils/logger';

export async function executeAction<T>(
    page: Page, 
    actionName: string, 
    actionCallback: (p: Page) => Promise<T>
): Promise<T> {
    try {
        logger.info(`Iniciando ação: ${actionName}`);
        const start = Date.now();
        const result = await actionCallback(page);
        const duration = Date.now() - start;
        logger.info(`Sucesso na ação: ${actionName} (${duration}ms)`);
        return result;
    } catch (error: any) {
        logger.error(`FALHA CRÍTICA na ação: ${actionName}`);
        logger.error(`URL Atual: ${page.url()}`);
        logger.error(`Erro: ${error.message}`);
        
        try {
            await page.screenshot({ path: `logs/error_${Date.now()}.png` });
        } catch (sErr) {
            logger.error('Não foi possível tirar screenshot do erro.');
        }
        
        throw error;
    }
}