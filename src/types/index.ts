export interface DateInfo {
    startMonth: string;
    startYear: string;
    endDay: string;
    endMonth: string;
    endYear: string;
    formattedCurrent: string;
    rawStart: Date;
    rawEnd: Date;
}

export interface AntiCaptchaResponse {
    errorId: number;
    errorDescription?: string;
    taskId?: number;
    status?: 'processing' | 'ready';
    solution?: {
        gRecaptchaResponse: string;
    };
}