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
exports.notifySubscribersOfPriceChange = exports.notifyGetInTouchSubscribers = exports.propertyAddress = exports.toArray = void 0;
const config_1 = __importDefault(require("../../config"));
const mailSender_1 = require("../../utils/mailSender");
const getInTouch_models_1 = __importDefault(require("../getInTouch/getInTouch.models"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const toArray = (value) => {
    if (!value)
        return undefined;
    if (Array.isArray(value))
        return value;
    return value.split(',').map((v) => v.trim()).filter(Boolean);
};
exports.toArray = toArray;
const propertyAddress = (streetAddress, city, state, zipCode, county) => {
    return [streetAddress, city, state, zipCode, county]
        .filter(Boolean)
        .join(", ");
};
exports.propertyAddress = propertyAddress;
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
const fieldRow = (label, value) => `<tr><td class="field-label">${escapeHtml(label)}</td><td class="field-value">${escapeHtml(value)}</td></tr>`;
const formatUsd = (amount) => {
    const value = Number(amount);
    if (!Number.isFinite(value))
        return '—';
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    });
};
const notifyGetInTouchSubscribers = (property, sellerName, notice) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const subscribers = yield getInTouch_models_1.default.find({
        counties: property.county,
        propertyTypes: property.propertyType,
    }).select('email');
    if (!subscribers.length) {
        return;
    }
    const templatePath = path_1.default.join(__dirname, '../../../../public/view/subscription_area.html');
    const template = fs_1.default.readFileSync(templatePath, 'utf8');
    const emailNotice = notice !== null && notice !== void 0 ? notice : {
        subject: 'New Listing in Your Subscription Area',
        heading: 'New Listing in Your Subscription Area',
        intro: 'Your subscription area has a new listing added on BetterOffMarket. You can view the full details below:',
        extraFields: fieldRow('Buyer Name', 'Not applicable'),
    };
    const replacements = {
        userName: escapeHtml('there'),
        heading: escapeHtml(emailNotice.heading),
        intro: escapeHtml(emailNotice.intro),
        propertyAddress: escapeHtml((0, exports.propertyAddress)(property.streetAddress, property.city, property.state, property.zipCode, property.county)),
        sellerName: escapeHtml(sellerName),
        extraFields: (_a = emailNotice.extraFields) !== null && _a !== void 0 ? _a : '',
        propertyUrl: escapeHtml(`${config_1.default.client_Url}/properties-list/${property._id}`),
        year: escapeHtml(new Date().getFullYear().toString()),
    };
    const html = Object.entries(replacements).reduce((content, [placeholder, value]) => content.replace(`{{${placeholder}}}`, value), template);
    const emailResults = yield Promise.allSettled(subscribers.map((subscriber) => (0, mailSender_1.sendEmail)(subscriber.email, emailNotice.subject, html)));
    emailResults.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Failed to notify GetInTouch subscriber ${subscribers[index].email}:`, result.reason);
        }
    });
});
exports.notifyGetInTouchSubscribers = notifyGetInTouchSubscribers;
const notifySubscribersOfPriceChange = (property, sellerName, previousPrice) => __awaiter(void 0, void 0, void 0, function* () {
    return (0, exports.notifyGetInTouchSubscribers)(property, sellerName, {
        subject: 'Listing Price Updated in Your Subscription Area',
        heading: 'Listing Price Updated',
        intro: 'A listing in your subscription area has a new asking price on BetterOffMarket.',
        extraFields: fieldRow('Previous Price', formatUsd(previousPrice)) +
            fieldRow('New Price', formatUsd(property.listingPrice)),
    });
});
exports.notifySubscribersOfPriceChange = notifySubscribersOfPriceChange;
