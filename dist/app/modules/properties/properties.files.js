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
exports.deleteRemovedPropertyFiles = exports.urlsRemovedFrom = exports.resolveKeptDocuments = exports.isUrlList = exports.resolvePhotoOrder = void 0;
const http_status_1 = __importDefault(require("http-status"));
const AppError_1 = __importDefault(require("../../error/AppError"));
const config_1 = __importDefault(require("../../config"));
const s3_1 = require("../../utils/s3");
const MIN_PHOTOS = 5;
const resolvePhotoOrder = (photoOrder, uploadedUrls, existingUrls) => {
    if (!Array.isArray(photoOrder)) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'photoOrder must be an array');
    }
    const ownedUrls = new Set(existingUrls !== null && existingUrls !== void 0 ? existingUrls : []);
    const photos = [];
    photoOrder.forEach((item, position) => {
        const entry = item;
        if (!entry || typeof entry !== 'object') {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `Invalid photoOrder item at position ${position}`);
        }
        if (entry.type === 'url') {
            const url = typeof entry.url === 'string' ? entry.url.trim() : '';
            if (!url) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `photoOrder url is missing at position ${position}`);
            }
            if (existingUrls && !ownedUrls.has(url)) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'photoOrder contains a photo URL that does not belong to this property');
            }
            photos.push(url);
            return;
        }
        if (entry.type === 'file') {
            const index = entry.index;
            if (typeof index !== 'number' ||
                !Number.isInteger(index) ||
                index < 0 ||
                index >= uploadedUrls.length ||
                !uploadedUrls[index]) {
                throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `Invalid photo file index at position ${position}`);
            }
            photos.push(uploadedUrls[index]);
            return;
        }
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, `Invalid photoOrder type at position ${position}`);
    });
    if (photos.length < MIN_PHOTOS) {
        throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'Minimum 5 high-res photos required');
    }
    return photos;
};
exports.resolvePhotoOrder = resolvePhotoOrder;
const isUrlList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
exports.isUrlList = isUrlList;
const resolveKeptDocuments = (urls, existingDocuments) => {
    const byUrl = new Map(existingDocuments.map((document) => [document.url, document]));
    return urls.map((url) => {
        const document = byUrl.get(url);
        if (!document) {
            throw new AppError_1.default(http_status_1.default.BAD_REQUEST, 'documents contains a URL that does not belong to this property');
        }
        return {
            name: document.name,
            size: document.size,
            updated: document.updated,
            url: document.url,
        };
    });
};
exports.resolveKeptDocuments = resolveKeptDocuments;
const urlsRemovedFrom = (previous, next) => {
    const kept = new Set(next);
    return previous.filter((url) => !kept.has(url));
};
exports.urlsRemovedFrom = urlsRemovedFrom;
const toS3Key = (url) => {
    var _a;
    const base = (_a = config_1.default.aws.s3BaseUrl) === null || _a === void 0 ? void 0 : _a.replace(/\/$/, '');
    if (!base || !url.startsWith(`${base}/`))
        return null;
    const key = url.slice(base.length + 1).split('?')[0];
    if (!key)
        return null;
    try {
        return decodeURIComponent(key);
    }
    catch (_b) {
        return key;
    }
};
const deleteRemovedPropertyFiles = (urls) => __awaiter(void 0, void 0, void 0, function* () {
    const keys = [...new Set(urls.map(toS3Key).filter((key) => Boolean(key)))];
    if (!keys.length)
        return;
    try {
        yield (0, s3_1.deleteManyFromS3)(keys);
    }
    catch (error) {
        console.error('Failed to delete removed property files:', error);
    }
});
exports.deleteRemovedPropertyFiles = deleteRemovedPropertyFiles;
