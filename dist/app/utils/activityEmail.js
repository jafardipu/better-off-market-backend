"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendActivityEmail = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mailSender_1 = require("./mailSender");
const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => {
    const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    };
    return entities[character];
});
const templatePath = path_1.default.join(__dirname, '../../../public/view/activity_notification.html');
const sendActivityEmail = (payload) => {
    var _a, _b;
    const to = (_a = payload.to) === null || _a === void 0 ? void 0 : _a.trim();
    if (!to)
        return;
    try {
        const replacements = {
            userName: ((_b = payload.userName) === null || _b === void 0 ? void 0 : _b.trim()) || 'there',
            title: payload.title,
            body: payload.body,
            detailLabel: payload.detailLabel,
            detailValue: payload.detailValue,
            actionUrl: payload.actionUrl,
            actionLabel: payload.actionLabel,
            year: new Date().getFullYear().toString(),
        };
        const html = Object.entries(replacements).reduce((content, [placeholder, value]) => {
            const safeValue = placeholder === 'actionUrl' ? value : escapeHtml(value);
            return content.replace(new RegExp(`{{${placeholder}}}`, 'g'), safeValue);
        }, fs_1.default.readFileSync(templatePath, 'utf8'));
        void (0, mailSender_1.sendEmail)(to, payload.subject, html).catch((error) => {
            console.error(`Failed to send activity email to ${to}:`, error);
        });
    }
    catch (error) {
        console.error(`Failed to send activity email to ${to}:`, error);
    }
};
exports.sendActivityEmail = sendActivityEmail;
