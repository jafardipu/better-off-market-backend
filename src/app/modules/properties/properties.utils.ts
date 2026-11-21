import config from "../../config";
import { sendEmail } from "../../utils/mailSender";
import GetInTouch from "../getInTouch/getInTouch.models";
import { IProperty } from "./properties.interface";
import path from "path";
import fs from "fs";

export interface PropertySearchQuery {
    county?: string | string[];
    propertyType?: string | string[];
    status?: string | string[];
    minPrice?: string;
    maxPrice?: string;
    sortBy?: 'newest' | 'oldest' | 'lowest' | 'highest';
    lat?: string;
    lng?: string;
    page?: string;
    limit?: string;
    searchTerm?: string;
}

export const toArray = (value?: string | string[]): string[] | undefined => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return value.split(',').map((v) => v.trim()).filter(Boolean);
};

export const propertyAddress = (
    streetAddress?: string,
    city?: string,
    state?: string,
    zipCode?: string,
    county?: string
) => {

    return [streetAddress, city, state, zipCode, county]
        .filter(Boolean)
        .join(", ");
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

type SubscriberNotice = {
    subject: string;
    heading: string;
    intro: string;
    extraFields?: string;
};

const fieldRow = (label: string, value: string) =>
    `<tr><td class="field-label">${escapeHtml(label)}</td><td class="field-value">${escapeHtml(value)}</td></tr>`;

const formatUsd = (amount?: number | null) => {
    const value = Number(amount);
    if (!Number.isFinite(value)) return '—';
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    });
};

export const notifyGetInTouchSubscribers = async (
    property: IProperty,
    sellerName: string,
    notice?: SubscriberNotice,
) => {
    const subscribers = await GetInTouch.find({
        counties: property.county,
        propertyTypes: property.propertyType,
    }).select('email');

    if (!subscribers.length) {
        return;
    }

    const templatePath = path.join(__dirname, '../../../../public/view/subscription_area.html');
    const template = fs.readFileSync(templatePath, 'utf8');
    const emailNotice: SubscriberNotice = notice ?? {
        subject: 'New Listing in Your Subscription Area',
        heading: 'New Listing in Your Subscription Area',
        intro: 'Your subscription area has a new listing added on BetterOffMarket. You can view the full details below:',
        extraFields: fieldRow('Buyer Name', 'Not applicable'),
    };
    const replacements: Record<string, string> = {
        userName: escapeHtml('there'),
        heading: escapeHtml(emailNotice.heading),
        intro: escapeHtml(emailNotice.intro),
        propertyAddress: escapeHtml(propertyAddress(
            property.streetAddress,
            property.city,
            property.state,
            property.zipCode,
            property.county,
        )),
        sellerName: escapeHtml(sellerName),
        extraFields: emailNotice.extraFields ?? '',
        propertyUrl: escapeHtml(`${config.client_Url}/properties-list/${property._id}`),
        year: escapeHtml(new Date().getFullYear().toString()),
    };

    const html = Object.entries(replacements).reduce(
        (content, [placeholder, value]) => content.replace(`{{${placeholder}}}`, value),
        template,
    );

    const emailResults = await Promise.allSettled(
        subscribers.map((subscriber) =>
            sendEmail(subscriber.email, emailNotice.subject, html),
        ),
    );

    emailResults.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(
                `Failed to notify GetInTouch subscriber ${subscribers[index].email}:`,
                result.reason,
            );
        }
    });
};

export const notifySubscribersOfPriceChange = async (
    property: IProperty,
    sellerName: string,
    previousPrice?: number | null,
) =>
    notifyGetInTouchSubscribers(property, sellerName, {
        subject: 'Listing Price Updated in Your Subscription Area',
        heading: 'Listing Price Updated',
        intro: 'A listing in your subscription area has a new asking price on BetterOffMarket.',
        extraFields:
            fieldRow('Previous Price', formatUsd(previousPrice)) +
            fieldRow('New Price', formatUsd(property.listingPrice)),
    });