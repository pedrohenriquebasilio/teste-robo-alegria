import axios from 'axios';
import logger from '../utils/logger';
import { AntiCaptchaResponse } from '../types';

export async function solveCaptcha(apiKey: string, siteKey: string, url: string): Promise<string> {
    logger.info('Iniciando resolução de Captcha...');
    
    const createRes = await axios.post<AntiCaptchaResponse>('https://api.anti-captcha.com/createTask', {
        clientKey: apiKey,
        task: {
            type: 'RecaptchaV2TaskProxyless',
            websiteURL: url,
            websiteKey: siteKey
        }
    });

    if (createRes.data.errorId !== 0 || !createRes.data.taskId) {
        throw new Error(`Erro AntiCaptcha Create: ${createRes.data.errorDescription}`);
    }

    const taskId = createRes.data.taskId;
    logger.info(`Tarefa Captcha criada: ${taskId}. Aguardando solução...`);

    let attempts = 0;
    while (attempts < 30) {
        await new Promise(r => setTimeout(r, 5000));
        
        const resultRes = await axios.post<AntiCaptchaResponse>('https://api.anti-captcha.com/getTaskResult', {
            clientKey: apiKey,
            taskId: taskId
        });

        if (resultRes.data.status === 'ready' && resultRes.data.solution) {
            logger.info('Captcha resolvido com sucesso.');
            return resultRes.data.solution.gRecaptchaResponse;
        }
        
        if (resultRes.data.errorId !== 0) {
            throw new Error(`Erro ao consultar Captcha: ${resultRes.data.errorDescription}`);
        }

        attempts++;
    }
    
    throw new Error('Timeout na resolução do Captcha');
}