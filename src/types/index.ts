export interface Question {
    id: string;
    conceptTitle?: string;
    concept_title?: string;
    questionText?: string;
    question_text?: string;
    options: string[];
    orderIndex?: number;
    order_index?: number;
    isAnsweredCorrectly?: boolean;
    is_answered_correctly?: boolean;
    keyTakeaway?: string;
    key_takeaway?: string;
    explanation?: string;
    hint?: string;
}

export interface QuizSession {
    status: 'uploading' | 'generating' | 'active' | 'completed' | 'failed';
    pdfFilename?: string;
    pdf_filename?: string;
    questions: Question[];
}

export interface SubmitResponse {
    isCorrect: boolean;
    feedback: string;
    type: 'explanation' | 'hint';
    keyTakeaway?: string;
    explanation?: string;
    hint?: string;
}
export * from './pedagogical';
