import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import config from '../../config';
import { deleteManyFromS3 } from '../../utils/s3';
import { IDocument } from './properties.interface';

export type PhotoOrderEntry =
    | { type: 'url'; url: string }
    | { type: 'file'; index: number };

const MIN_PHOTOS = 5;

export const resolvePhotoOrder = (
    photoOrder: unknown,
    uploadedUrls: string[],
    existingUrls?: string[],
): string[] => {
    if (!Array.isArray(photoOrder)) {
        throw new AppError(httpStatus.BAD_REQUEST, 'photoOrder must be an array');
    }

    const ownedUrls = new Set(existingUrls ?? []);
    const photos: string[] = [];

    photoOrder.forEach((item, position) => {
        const entry = item as Partial<PhotoOrderEntry> | null;
        if (!entry || typeof entry !== 'object') {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                `Invalid photoOrder item at position ${position}`,
            );
        }

        if (entry.type === 'url') {
            const url = typeof entry.url === 'string' ? entry.url.trim() : '';
            if (!url) {
                throw new AppError(
                    httpStatus.BAD_REQUEST,
                    `photoOrder url is missing at position ${position}`,
                );
            }
            if (existingUrls && !ownedUrls.has(url)) {
                throw new AppError(
                    httpStatus.BAD_REQUEST,
                    'photoOrder contains a photo URL that does not belong to this property',
                );
            }
            photos.push(url);
            return;
        }

        if (entry.type === 'file') {
            const index = entry.index;
            if (
                typeof index !== 'number' ||
                !Number.isInteger(index) ||
                index < 0 ||
                index >= uploadedUrls.length ||
                !uploadedUrls[index]
            ) {
                throw new AppError(
                    httpStatus.BAD_REQUEST,
                    `Invalid photo file index at position ${position}`,
                );
            }
            photos.push(uploadedUrls[index]);
            return;
        }

        throw new AppError(
            httpStatus.BAD_REQUEST,
            `Invalid photoOrder type at position ${position}`,
        );
    });

    if (photos.length < MIN_PHOTOS) {
        throw new AppError(
            httpStatus.BAD_REQUEST,
            'Minimum 5 high-res photos required',
        );
    }

    return photos;
};

export const isUrlList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string');

export const resolveKeptDocuments = (
    urls: string[],
    existingDocuments: IDocument[],
): IDocument[] => {
    const byUrl = new Map(existingDocuments.map((document) => [document.url, document]));

    return urls.map((url) => {
        const document = byUrl.get(url);
        if (!document) {
            throw new AppError(
                httpStatus.BAD_REQUEST,
                'documents contains a URL that does not belong to this property',
            );
        }

        return {
            name: document.name,
            size: document.size,
            updated: document.updated,
            url: document.url,
        };
    });
};

export const urlsRemovedFrom = (previous: string[], next: string[]): string[] => {
    const kept = new Set(next);
    return previous.filter((url) => !kept.has(url));
};

const toS3Key = (url: string): string | null => {
    const base = config.aws.s3BaseUrl?.replace(/\/$/, '');
    if (!base || !url.startsWith(`${base}/`)) return null;

    const key = url.slice(base.length + 1).split('?')[0];
    if (!key) return null;

    try {
        return decodeURIComponent(key);
    } catch {
        return key;
    }
};

export const deleteRemovedPropertyFiles = async (urls: string[]) => {
    const keys = [...new Set(urls.map(toS3Key).filter((key): key is string => Boolean(key)))];
    if (!keys.length) return;

    try {
        await deleteManyFromS3(keys);
    } catch (error) {
        console.error('Failed to delete removed property files:', error);
    }
};
