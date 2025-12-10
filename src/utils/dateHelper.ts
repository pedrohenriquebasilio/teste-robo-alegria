import { DateInfo } from '../types';

const meses: { [key: number]: string } = {
    0: 'JANEIRO', 1: 'FEVEREIRO', 2: 'MARÇO', 3: 'ABRIL',
    4: 'MAIO', 5: 'JUNHO', 6: 'JULHO', 7: 'AGOSTO',
    8: 'SETEMBRO', 9: 'OUTUBRO', 10: 'NOVEMBRO', 11: 'DEZEMBRO'
};

export function getDates(): DateInfo {
    const now = new Date();
    
    const startObj = new Date(now);
    startObj.setDate(now.getDate() - 1); 
    
    const endObj = new Date(now);
    endObj.setDate(now.getDate() + 1); 

    return {
        startMonth: meses[startObj.getMonth()],
        startYear: now.getFullYear().toString(),
        endDay: endObj.getDate().toString(),
        endMonth: meses[endObj.getMonth()],
        endYear: endObj.getFullYear().toString(),
        formattedCurrent: now.toISOString().slice(0,10).replace(/-/g,''),
        rawStart: startObj,
        rawEnd: endObj
    };
}