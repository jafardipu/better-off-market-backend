"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_status_1 = __importDefault(require("http-status"));
const catchAsync_1 = __importDefault(require("../../utils/catchAsync"));
const s3_1 = require("../../utils/s3");
const AppError_1 = __importDefault(require("../../error/AppError"));
const properties_models_1 = require("./properties.models");
const properties_files_1 = require("./properties.files");
const sanitizeFileName = (name) => {
    const lastDot = name.lastIndexOf('.');
    const base = lastDot > 0 ? name.slice(0, lastDot) : name;
    const ext = lastDot > 0 ? name.slice(lastDot) : '';
    const cleanBase = base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${cleanBase}${ext}`;
};
const formatFileSize = (bytes) => {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const uploadPhotos = (files) => __awaiter(void 0, void 0, void 0, function* () {
    return Promise.all(files.map((file, index) => __awaiter(void 0, void 0, void 0, function* () {
        const url = yield (0, s3_1.uploadToS3)({
            file,
            fileName: `images/property/photos/${Date.now()}-${index}-${sanitizeFileName(file.originalname)}`,
        });
        if (!url) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'File Upload failed');
        }
        return url;
    })));
});
const uploadDocuments = (files) => __awaiter(void 0, void 0, void 0, function* () {
    return Promise.all(files.map((file, index) => __awaiter(void 0, void 0, void 0, function* () {
        const url = yield (0, s3_1.uploadToS3)({
            file,
            fileName: `documents/property/${Date.now()}-${index}-${sanitizeFileName(file.originalname)}`,
        });
        if (!url) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'File Upload failed');
        }
        return {
            name: file.originalname,
            size: formatFileSize(file.size),
            updated: new Date().toISOString(),
            url,
        };
    })));
});
const applyOrderedPhotos = (req, photoFiles, existingPhotos) => __awaiter(void 0, void 0, void 0, function* () {
    const uploadedPhotoUrls = yield uploadPhotos(photoFiles);
    req.body.photos = (0, properties_files_1.resolvePhotoOrder)(req.body.photoOrder, uploadedPhotoUrls, existingPhotos);
    delete req.body.photoOrder;
    return existingPhotos
        ? (0, properties_files_1.urlsRemovedFrom)(existingPhotos, req.body.photos)
        : [];
});
const applyDocuments = (req, documentFiles, existingDocuments, isUpdate) => __awaiter(void 0, void 0, void 0, function* () {
    const uploadedDocuments = documentFiles.length
        ? yield uploadDocuments(documentFiles)
        : [];
    const currentDocuments = req.body.documents;
    if ((0, properties_files_1.isUrlList)(currentDocuments)) {
        const keptDocuments = isUpdate
            ? (0, properties_files_1.resolveKeptDocuments)(currentDocuments, existingDocuments !== null && existingDocuments !== void 0 ? existingDocuments : [])
            : currentDocuments.length
                ? (0, properties_files_1.resolveKeptDocuments)(currentDocuments, [])
                : [];
        req.body.documents = [...keptDocuments, ...uploadedDocuments];
        return (0, properties_files_1.urlsRemovedFrom)((existingDocuments !== null && existingDocuments !== void 0 ? existingDocuments : []).map((document) => document.url), req.body.documents.map((document) => document.url));
    }
    if (isUpdate && uploadedDocuments.length && currentDocuments === undefined) {
        req.body.documents = [...(existingDocuments !== null && existingDocuments !== void 0 ? existingDocuments : []), ...uploadedDocuments];
        return [];
    }
    if (uploadedDocuments.length) {
        req.body.documents = uploadedDocuments;
    }
    return [];
});
const processPropertyFiles = (0, catchAsync_1.default)((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const files = req.files;
    const photoFiles = (_a = files === null || files === void 0 ? void 0 : files.photos) !== null && _a !== void 0 ? _a : [];
    const documentFiles = (_b = files === null || files === void 0 ? void 0 : files.documents) !== null && _b !== void 0 ? _b : [];
    const hasPhotoOrder = Object.prototype.hasOwnProperty.call((_c = req.body) !== null && _c !== void 0 ? _c : {}, 'photoOrder');
    if (hasPhotoOrder) {
        const propertyId = (_d = req.params) === null || _d === void 0 ? void 0 : _d.id;
        let existingPhotos;
        let existingDocuments;
        if (propertyId) {
            const existing = yield properties_models_1.Property.findById(propertyId)
                .select('photos documents')
                .lean();
            if (!existing) {
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
            }
            existingPhotos = (_e = existing.photos) !== null && _e !== void 0 ? _e : [];
            existingDocuments = (_f = existing.documents) !== null && _f !== void 0 ? _f : [];
        }
        const removedPhotos = yield applyOrderedPhotos(req, photoFiles, existingPhotos);
        const removedDocuments = yield applyDocuments(req, documentFiles, existingDocuments, Boolean(propertyId));
        res.locals.removedPropertyFileUrls = [
            ...removedPhotos,
            ...removedDocuments,
        ];
        next();
        return;
    }
    if (photoFiles.length) {
        req.body.photos = yield Promise.all(photoFiles.map((file) => (0, s3_1.uploadToS3)({
            file,
            fileName: `images/property/photos/${Date.now()}-${sanitizeFileName(file.originalname)}`,
        })));
    }
    if ((0, properties_files_1.isUrlList)((_g = req.body) === null || _g === void 0 ? void 0 : _g.documents)) {
        const propertyId = (_h = req.params) === null || _h === void 0 ? void 0 : _h.id;
        let existingDocuments;
        if (propertyId) {
            const existing = yield properties_models_1.Property.findById(propertyId)
                .select('documents')
                .lean();
            if (!existing) {
                throw new AppError_1.default(http_status_1.default.NOT_FOUND, 'Property not found');
            }
            existingDocuments = (_j = existing.documents) !== null && _j !== void 0 ? _j : [];
        }
        res.locals.removedPropertyFileUrls = yield applyDocuments(req, documentFiles, existingDocuments, Boolean(propertyId));
        next();
        return;
    }
    if (documentFiles.length) {
        req.body.documents = yield Promise.all(documentFiles.map((file) => __awaiter(void 0, void 0, void 0, function* () {
            const url = yield (0, s3_1.uploadToS3)({
                file,
                fileName: `documents/property/${Date.now()}-${sanitizeFileName(file.originalname)}`,
            });
            return {
                name: file.originalname,
                size: formatFileSize(file.size),
                updated: new Date().toISOString(),
                url,
            };
        })));
    }
    next();
}));
exports.default = processPropertyFiles;
