import fs from 'fs';
import path from 'path';
import { sendEmail } from './mailSender';

type ActivityEmail = {
    to?: string;
    userName?: string;
    subject: string;
    title: string;
    body: string;
    detailLabel: string;
    detailValue: string;
    actionUrl: string;
    actionLabel: string;
};

const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };
        return entities[character];
    });

const templatePath = path.join(__dirname, '../../../public/view/activity_notification.html');

export const sendActivityEmail = (payload: ActivityEmail) => {
    const to = payload.to?.trim();
    if (!to) return;

    try {
        const replacements: Record<string, string> = {
            userName: payload.userName?.trim() || 'there',
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
        }, fs.readFileSync(templatePath, 'utf8'));

        void sendEmail(to, payload.subject, html).catch((error) => {
            console.error(`Failed to send activity email to ${to}:`, error);
        });
    } catch (error) {
        console.error(`Failed to send activity email to ${to}:`, error);
    }
};
