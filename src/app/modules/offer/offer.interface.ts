import { Model, Types } from 'mongoose';
import { OFFER_STATUS_OPTIONS } from './offer.constants';

export type OfferStatus = (typeof OFFER_STATUS_OPTIONS)[number];
export type OfferParty = 'buyer' | 'seller';

export interface IDocument {
    name: string;
    size: string;
    updated: string;
    url: string;
}

export interface IOfferTerms {
    offerAmount: number;
    earnestMoney: number;
    financingType: string;
    otherFinancingType?: string;
    financingTerms?: string;

    closingCostOption: string;
    sellerContribution?: number;

    inspectionContingency: 'yes' | 'no';
    inspectionDays?: number;
    appraisalContingency: 'yes' | 'no';
    // appraisalDays?: number;

    hasAgent: 'yes' | 'no';
    agentName?: string;
    brokerageName?: string;
    commission?: string;
    paidBy?: OfferParty;

    personalPropertyIncluded?: string;
    itemsToBeRemoved?: string;

    titleCompany?: string;
    closingDate?: string;
    possession?: string;
    sellerPostClosingDays?: number;

    additionalTerms?: string;
    notesToSeller?: string;
    notesToBuyer?: string;
}

export interface IOfferHistoryEntry extends IOfferTerms {
    round: number;
    madeBy: OfferParty;
    status: OfferStatus;
    madeByUser: Types.ObjectId;
    createdAt: Date;
}

export interface IOffer {
    _id?: Types.ObjectId;
    property: Types.ObjectId;
    buyer: Types.ObjectId;
    seller: Types.ObjectId;

    // offer accept part 
    offerAcceptedBy?: string;
    isBuyerAddedAuthorizedSigner: boolean;
    isSellerAddedAuthorizedSigner: boolean;

    // NEW FLOW: true once the seller submits contract details for this offer (POST /property-contracts with offerId)
    isContractDetailsSubmitted: boolean;

    status: OfferStatus;
    currentRound: number;
    lastActionBy: OfferParty;

    currentTerms: IOfferTerms; // latest terms on the table, whoever proposed them
    history: IOfferHistoryEntry[]; // full audit trail, oldest first

    supportingDocuments: IDocument[];

    isDeleted: boolean;
}

export interface OfferModel extends Model<IOffer> {
    IsOfferExistId(id: string): Promise<IOffer>;
}