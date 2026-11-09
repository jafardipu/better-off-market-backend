import { NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import { uploadToS3 } from '../../utils/s3';
import AppError from '../../error/AppError';
import { Property } from './properties.models';
import { IDocument } from './properties.interface';
import {
    isUrlList,
    resolveKeptDocuments,
    resolvePhotoOrder,
    urlsRemovedFrom,
} from './properties.files';

const sanitizeFileName = (name: string): string => {
    const lastDot = name.lastIndexOf('.');
    const base = lastDot > 0 ? name.slice(0, lastDot) : name;
    const ext = lastDot > 0 ? name.slice(lastDot) : '';

    const cleanBase = base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return `${cleanBase}${ext}`;
};

const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const uploadPhotos = async (files: Express.Multer.File[]): Promise<string[]> => {
    return Promise.all(
        files.map(async (file, index) => {
            const url = await uploadToS3({
                file,
                fileName: `images/property/photos/${Date.now()}-${index}-${sanitizeFileName(file.originalname)}`,
            });

            if (!url) {
                throw new AppError(httpStatus.BAD_REQUEST, 'File Upload failed');
            }

            return url;
        }),
    );
};

const uploadDocuments = async (files: Express.Multer.File[]): Promise<IDocument[]> => {
    return Promise.all(
        files.map(async (file, index) => {
            const url = await uploadToS3({
                file,
                fileName: `documents/property/${Date.now()}-${index}-${sanitizeFileName(file.originalname)}`,
            });

            if (!url) {
                throw new AppError(httpStatus.BAD_REQUEST, 'File Upload failed');
            }

            return {
                name: file.originalname,
                size: formatFileSize(file.size),
                updated: new Date().toISOString(),
                url,
            };
        }),
    );
};

const applyOrderedPhotos = async (
    req: Request,
    photoFiles: Express.Multer.File[],
    existingPhotos?: string[],
) => {
    const uploadedPhotoUrls = await uploadPhotos(photoFiles);
    req.body.photos = resolvePhotoOrder(
        req.body.photoOrder,
        uploadedPhotoUrls,
        existingPhotos,
    );
    delete req.body.photoOrder;

    return existingPhotos
        ? urlsRemovedFrom(existingPhotos, req.body.photos)
        : [];
};

const applyDocuments = async (
    req: Request,
    documentFiles: Express.Multer.File[],
    existingDocuments: IDocument[] | undefined,
    isUpdate: boolean,
) => {
    const uploadedDocuments = documentFiles.length
        ? await uploadDocuments(documentFiles)
        : [];
    const currentDocuments = req.body.documents;

    if (isUrlList(currentDocuments)) {
        const keptDocuments = isUpdate
            ? resolveKeptDocuments(currentDocuments, existingDocuments ?? [])
            : currentDocuments.length
                ? resolveKeptDocuments(currentDocuments, [])
                : [];

        req.body.documents = [...keptDocuments, ...uploadedDocuments];

        return urlsRemovedFrom(
            (existingDocuments ?? []).map((document) => document.url),
            req.body.documents.map((document: IDocument) => document.url),
        );
    }

    if (isUpdate && uploadedDocuments.length && currentDocuments === undefined) {
        req.body.documents = [...(existingDocuments ?? []), ...uploadedDocuments];
        return [];
    }

    if (uploadedDocuments.length) {
        req.body.documents = uploadedDocuments;
    }

    return [];
};

const processPropertyFiles = catchAsync(
    async (req: Request, res: Response, next: NextFunction) => {
        const files = req.files as
            | {
                photos?: Express.Multer.File[];
                documents?: Express.Multer.File[];
            }
            | undefined;
        const photoFiles = files?.photos ?? [];
        const documentFiles = files?.documents ?? [];
        const hasPhotoOrder = Object.prototype.hasOwnProperty.call(
            req.body ?? {},
            'photoOrder',
        );

        if (hasPhotoOrder) {
            const propertyId = req.params?.id;
            let existingPhotos: string[] | undefined;
            let existingDocuments: IDocument[] | undefined;

            if (propertyId) {
                const existing = await Property.findById(propertyId)
                    .select('photos documents')
                    .lean();

                if (!existing) {
                    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
                }

                existingPhotos = existing.photos ?? [];
                existingDocuments = existing.documents ?? [];
            }

            const removedPhotos = await applyOrderedPhotos(
                req,
                photoFiles,
                existingPhotos,
            );
            const removedDocuments = await applyDocuments(
                req,
                documentFiles,
                existingDocuments,
                Boolean(propertyId),
            );

            res.locals.removedPropertyFileUrls = [
                ...removedPhotos,
                ...removedDocuments,
            ];
            next();
            return;
        }

        if (photoFiles.length) {
            req.body.photos = await Promise.all(
                photoFiles.map((file) =>
                    uploadToS3({
                        file,
                        fileName: `images/property/photos/${Date.now()}-${sanitizeFileName(file.originalname)}`,
                    }),
                ),
            );
        }

        if (isUrlList(req.body?.documents)) {
            const propertyId = req.params?.id;
            let existingDocuments: IDocument[] | undefined;

            if (propertyId) {
                const existing = await Property.findById(propertyId)
                    .select('documents')
                    .lean();

                if (!existing) {
                    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
                }

                existingDocuments = existing.documents ?? [];
            }

            res.locals.removedPropertyFileUrls = await applyDocuments(
                req,
                documentFiles,
                existingDocuments,
                Boolean(propertyId),
            );
            next();
            return;
        }

        if (documentFiles.length) {
            req.body.documents = await Promise.all(
                documentFiles.map(async (file) => {
                    const url = await uploadToS3({
                        file,
                        fileName: `documents/property/${Date.now()}-${sanitizeFileName(file.originalname)}`,
                    });

                    return {
                        name: file.originalname,
                        size: formatFileSize(file.size),
                        updated: new Date().toISOString(),
                        url,
                    };
                }),
            );
        }

        next();
    },
);

export default processPropertyFiles;
