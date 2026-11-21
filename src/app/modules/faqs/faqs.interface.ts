
import { Model } from 'mongoose';

export interface IFaqs {
    question: string;
    answer: string;
    order: number;
    isDeleted: boolean;
}

export type IFaqsModules = Model<IFaqs, Record<string, unknown>>;