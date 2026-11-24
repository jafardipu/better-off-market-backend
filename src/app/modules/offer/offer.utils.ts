import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { IOffer } from './offer.interface';
import { uploadToS3 } from '../../utils/s3';
import AppError from '../../error/AppError';
import httpStatus from 'http-status';
// NEW FLOW: offer-accept notifications
import { sendNotificationMessage } from '../notification/notification.utils';


const formatCurrency = (value: number | string | null | undefined): string => {
    const numericValue = Number(value ?? 0);
    if (!Number.isFinite(numericValue)) {
        return '$0';
    }

    return `${numericValue.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })}`;
};

const formatPdfDate = (value: unknown): string => {
    if (value === null || value === undefined || value === '') {
        return '';
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return '';
        }

        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            });
        }

        return trimmed;
    }

    if (value instanceof Date) {
        return value.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }

    return String(value);
};

const getPropertyAddress = (property: unknown): string => {
    if (!property || typeof property !== 'object') {
        return '';
    }

    const record = property as Record<string, unknown>;
    return [
        record.streetAddress,
        record.city,
        record.state,
        record.zipCode,
        record.county,
    ]
        .filter((value) => Boolean(value))
        .map((value) => String(value).trim())
        .join(', ');
};

const setFieldText = (form: any, fieldName: string, value: string | number | null | undefined) => {
    try {
        const field = form.getTextField(fieldName);
        field.setText(value == null || value === '' ? '' : String(value));
    } catch {
        // ignore missing field names in the template
    }
};

const setCheckedField = (form: any, fieldName: string, checked: boolean, symbolFont?: any) => {
    if (!checked) {
        setFieldText(form, fieldName, '');
        return;
    }

    try {
        const field = form.getTextField(fieldName);
        // Use the PDF-safe ZapfDingbats check mark glyph instead of Unicode ✓,
        // because the template fonts are WinAnsi-based and reject non-encoded characters.
        field.setText('\u2713');
        field.setFontSize(12);
        if (symbolFont) {
            field.updateAppearances(symbolFont);
        }
    } catch {
        // ignored if the template field is absent
    }
};

const uploadGeneratedPdf = async (pdfBuffer: Uint8Array, fileName: string, pdfType: 'offer' | 'property') => {
    try {
        const uploadedUrl = await uploadToS3({
            file: { buffer: pdfBuffer, mimetype: 'application/pdf' },
            fileName,
        });

        if (uploadedUrl) {
            return uploadedUrl;
        }
    } catch (error) {
        console.warn(`S3 upload failed for generated ${pdfType} PDF:`, error);
        throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, `Failed to generate ${pdfType} PDF`);
    }

    return null;
};

export const generateOfferPdf = async (offer: IOffer): Promise<string | undefined | null> => {
    try {
        const pdfPath = path.join(process.cwd(), 'offer_agreement.pdf');

        if (!fs.existsSync(pdfPath)) {
            console.error('Offer PDF template not found at:', pdfPath);
            return null;
        }

        const pdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();

        const property = (offer as any)?.property ?? {};
        const terms = (offer as any)?.currentTerms ?? {};

        const propertyAddress = getPropertyAddress(property);
        const offerAmount = Number(terms?.offerAmount ?? property?.listingPrice ?? 0);
        const commissionAmount = offerAmount * 0.02;

        setFieldText(form, 'property_address', propertyAddress);
        setFieldText(form, 'property_amount', formatCurrency(offerAmount));
        setFieldText(form, 'property_amount_with_commission', formatCurrency(commissionAmount));
        setFieldText(form, 'buyer_1_name', '');
        setFieldText(form, 'buyer_1_signature', '');
        setFieldText(form, 'buyer_1_signature_date', '');
        setFieldText(form, 'buyer_2_name', '');
        setFieldText(form, 'buyer_2_signature', '');
        setFieldText(form, 'buyer_2_signature_date', '');

        form.flatten();
        const generatedPdf = await pdfDoc.save();
        const fileName = `offers/offer_agreement_${Date.now()}.pdf`;

        return uploadGeneratedPdf(generatedPdf, fileName, 'offer');
    } catch (error) {
        console.error('Error generating offer PDF:', error);
        return null;
    }
};

export const generatePropertyPdf = async (offer: IOffer): Promise<string | undefined | null> => {
    try {
        const property = (offer as any)?.property ?? {};

        const pdfPath = path.join(process.cwd(), property?.countyType === 'OHIO' ? 'ohio_property_agreement.pdf' : 'kentuncky_property_agreement.pdf');

        if (!fs.existsSync(pdfPath)) {
            console.error('Property PDF template not found at:', pdfPath);
            return null;
        }

        const pdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const form = pdfDoc.getForm();


        const terms = (offer as any)?.currentTerms ?? {};
        const offerAmount = Number(terms?.offerAmount ?? 0);
        const earnestMoney = Number(terms?.earnestMoney ?? 0);
        const balanceDue = Math.max(offerAmount - earnestMoney, 0);
        const symbolFont = await pdfDoc.embedFont(StandardFonts.ZapfDingbats);

        setFieldText(form, 'property_address', getPropertyAddress(property));
        setFieldText(form, 'parcel_id', property?.parcelIds ?? '');
        setFieldText(form, 'purchase_price', formatCurrency(offerAmount));
        setFieldText(form, 'earnest_money', formatCurrency(earnestMoney));
        setFieldText(form, 'balance_due', formatCurrency(balanceDue));
        setFieldText(form, 'company_title', terms?.titleCompany ?? property?.titleCompany ?? '');

        setCheckedField(form, 'financing_check_cash', terms?.financingType === 'cash', symbolFont);
        setCheckedField(form, 'financing_check_conventional', terms?.financingType === 'conventional', symbolFont);
        setCheckedField(form, 'financing_check_hard', terms?.financingType === 'hard_money', symbolFont);
        setCheckedField(form, 'financing_check_other', terms?.financingType === 'other', symbolFont);
        setFieldText(form, 'financing_check_other_text', terms?.financingType === 'other' ? terms?.otherFinancingType ?? '' : '');
        setFieldText(form, 'financingTerms', terms?.financingTerms ?? '');

        setFieldText(form, 'seller_paid', Number(terms?.sellerContribution ?? 0));

        setCheckedField(form, 'inspection_waived', terms?.inspectionContingency === 'no', symbolFont);
        setCheckedField(form, 'inspection_applies', terms?.inspectionContingency === 'yes', symbolFont);
        setFieldText(form, 'inspection_days', terms?.inspectionContingency === 'yes' ? terms?.inspectionDays ?? '' : '');

        setCheckedField(form, 'appraisal_waived', terms?.appraisalContingency === 'no', symbolFont);
        setCheckedField(form, 'appraisal_applies', terms?.appraisalContingency === 'yes', symbolFont);

        setCheckedField(form, 'not_real_estate', terms?.hasAgent === 'no', symbolFont);
        setCheckedField(form, 'real_estate', terms?.hasAgent === 'yes', symbolFont);
        setFieldText(form, 'agent_name', terms?.hasAgent === 'yes' ? terms?.agentName ?? '' : '');
        setFieldText(form, 'brokerage_name', terms?.hasAgent === 'yes' ? terms?.brokerageName ?? '' : '');
        setFieldText(form, 'commission', terms?.hasAgent === 'yes' ? terms?.commission ?? '' : '');

        setCheckedField(form, 'commission_paid_buyer', terms?.paidBy === 'buyer', symbolFont);
        setCheckedField(form, 'commission_paid_seller', terms?.paidBy === 'seller', symbolFont);

        setFieldText(form, 'personal_property_included', terms?.personalPropertyIncluded ?? '');
        setFieldText(form, 'personal_property_excluded', terms?.itemsToBeRemoved ?? '');
        setFieldText(form, 'additional_terms', terms?.additionalTerms ?? '');
        setFieldText(form, 'closing_date', formatPdfDate(terms?.closingDate ?? property?.closingDate ?? ''));

        setCheckedField(form, 'at__closing', terms?.possession === 'at_closing', symbolFont);
        setCheckedField(form, 'post__closing', terms?.possession === 'post_closing', symbolFont);
        setFieldText(form, 'post__closing_days', terms?.possession === 'post_closing' ? terms?.sellerPostClosingDays ?? '' : '');

        setCheckedField(form, 'not_HOA', property?.hasHoa === 'no', symbolFont);
        setCheckedField(form, 'HOA', property?.hasHoa === 'yes', symbolFont);
        setFieldText(form, 'HOA_AMOUNT', property?.hasHoa === 'yes' ? property?.hoaAmount ?? '' : '');
        setFieldText(form, 'HOA_PAID', property?.hasHoa === 'yes' ? property?.hoaFrequency ?? '' : '');
        setFieldText(form, 'included_in_HOA', property?.hasHoa === 'yes' ? property?.hoaIncludes ?? '' : '');

        form.flatten();
        const generatedPdf = await pdfDoc.save();
        const fileName = `properties/${property?.countyType === 'OHIO' ? 'ohio' : "kentuncky"}_property_agreement_${Date.now()}.pdf`;

        return uploadGeneratedPdf(generatedPdf, fileName, 'property');
    } catch (error) {
        console.error('Error generating property PDF:', error);
        return null;
    }
};

// NEW FLOW: offer-accept notifications (replace the old "add your authorized signer" notification)

type TAcceptedOfferParty = {
    _id?: { toString(): string };
    fcmToken?: string;
};

type TAcceptedOfferProperty = {
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
};

const joinPresent = (parts: (string | null | undefined)[], separator: string) =>
    parts
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean)
        .join(separator);

// "<streetAddress>, <city>, <state> <zipCode>"
export const formatAcceptedOfferAddress = (property: TAcceptedOfferProperty) =>
    joinPresent(
        [
            property?.streetAddress,
            property?.city,
            joinPresent([property?.state, property?.zipCode], ' '),
        ],
        ', ',
    );

// Sent to the buyer on every accept, whoever clicked Accept.
export const buildBuyerAgreementNotification = (
    offerId: string,
    property: TAcceptedOfferProperty,
) => ({
    message: "Congratulations! You've Reached an Agreement!",
    description: [
        `Congratulations on reaching an agreement to purchase ${formatAcceptedOfferAddress(property)}!`,
        'Now that both parties have agreed to the terms, the next step is to prepare and execute a formal purchase agreement outlining the agreed-upon terms and conditions.',
        'Once the agreement is signed by both parties, notify a trusted title company to begin coordinating the closing process and handling the necessary next steps.',
        'This is your first step toward closing. Congratulations again!',
    ].join('\n\n'),
    link: `/review-sent-offer?offer=${offerId}`,
});

// Sent to the seller only when the BUYER clicked Accept. When the seller
// clicks Accept, the website shows the contract-details pop-up on screen.
export const buildSellerContractDetailsNotification = (
    offerId: string,
    property: TAcceptedOfferProperty,
) => ({
    message: `Congratulations! The buyer accepted the offer on ${joinPresent([property?.streetAddress, property?.city], ', ')}`,
    description:
        'Please submit the contract details for this property and confirm how the buyer first contacted you.',
    link: `/user/offers-received/${offerId}?contractDetails=1`,
});

// Sends the accept notifications through the usual notification service
// (saved record + push). Never throws; each failure is logged.
export const notifyOfferAccepted = async ({
    offerId,
    acceptedBy,
    buyer,
    seller,
    property,
}: {
    offerId: string;
    acceptedBy: 'buyer' | 'seller';
    buyer: TAcceptedOfferParty | null | undefined;
    seller: TAcceptedOfferParty | null | undefined;
    property: TAcceptedOfferProperty;
}) => {
    const sends: { recipient: string; send: () => Promise<void> }[] = [];

    if (buyer?._id) {
        sends.push({
            recipient: 'buyer',
            send: () =>
                sendNotificationMessage({
                    ...buildBuyerAgreementNotification(offerId, property),
                    userId: buyer._id!.toString(),
                    fcmToken: buyer.fcmToken,
                }),
        });
    }

    if (acceptedBy === 'buyer' && seller?._id) {
        sends.push({
            recipient: 'seller',
            send: () =>
                sendNotificationMessage({
                    ...buildSellerContractDetailsNotification(offerId, property),
                    userId: seller._id!.toString(),
                    fcmToken: seller.fcmToken,
                }),
        });
    }

    const results = await Promise.allSettled(sends.map(({ send }) => send()));
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(
                `Offer ${offerId}: accept notification to ${sends[index].recipient} failed:`,
                result.reason,
            );
        }
    });
};







