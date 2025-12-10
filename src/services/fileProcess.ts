import fs from 'fs-extra';
import path from 'path';
import { parse } from 'csv-parse/sync';
import logger from '../utils/logger';

export async function processFile(
    inputPath: string, 
    outputDir: string, 
    prefix: string, 
    startDate: Date, 
    endDate: Date
): Promise<void> {
    logger.info(`Processando arquivo: ${inputPath}`);
    
    const content = await fs.readFile(inputPath, 'utf-8');
    const records = parse(content, { columns: false, 
        trim: true,
        relax_column_count: true }) as string[][];
    
    const outputFilename = `${prefix}_pitzi.txt`;
    const outputPath = path.join(outputDir, outputFilename);
    
    const lines: string[] = [];
    
    const sDateStr = startDate.toLocaleDateString('pt-BR');
    const eDateStr = endDate.toLocaleDateString('pt-BR');
    lines.push(`Período: ${sDateStr} a ${eDateStr}`);

    records.forEach((row, index) => {
        if (index === 0) return; 

        const dateStr = row[1];
        
        if (dateStr === "Vendido em") {
            const line = row.map(field => `"${field}"`).join('|');
            lines.push(line);
            return;
        }

        try {
            const [dParts, tParts] = dateStr.split(' ');
            const [day, month, year] = dParts.split('/');
            const [hour, min, sec] = tParts.split(':');
            
          
            const saleDate = new Date(
                parseInt(year), 
                parseInt(month) - 1, 
                parseInt(day), 
                parseInt(hour), 
                parseInt(min), 
                parseInt(sec)
            );

            if (saleDate >= startDate && saleDate <= endDate) {
                const line = row.map(field => `"${field}"`).join('|');
                lines.push(line);
            }
        } catch (e) {
        }
    });

    await fs.ensureDir(outputDir);
    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
    logger.info(`Arquivo convertido salvo em: ${outputPath}`);
}