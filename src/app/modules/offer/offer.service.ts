import httpStatus from 'http-status';
import AppError from '../../error/AppError';
import QueryBuilder from '../../class/builder/QueryBuilder';
import { IDocument, IOfferTerms, OfferParty } from './offer.interface';
import { OFFER_STATUS, CLOSED_OFFER_STATUSES } from './offer.constants';
import { Offer } from './offer.models';
import { Property } from '../properties/properties.models';
import { STATUS } from '../properties/properties.constants';
import { generateOfferPdf, generatePropertyPdf } from './offer.utils';
import { Agreement } from '../agreement/agreement.model';
import mongoose from 'mongoose';
import { sendNotificationMessage } from '../notification/notification.utils';
import { propertyAddress } from '../properties/properties.utils';
import { User } from '../user/user.models';
import { sendActivityEmail } from '../../utils/activityEmail';
import config from '../../config';

// Buyer submits the first offer on a property
const createOffer = async (
  buyerId: string,
  propertyId: string,
  terms: IOfferTerms,
  supportingDocuments: IDocument[],
) => {
  const property = await Property.findById(propertyId).populate('seller');
  if (!property) {
    throw new AppError(httpStatus.NOT_FOUND, 'Property not found');
  }

  if (property.status === STATUS.rejected || property.status === STATUS.sold || property.status === STATUS.pending) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Property is not available for offer');
  }

  if (property.seller._id.toString() === buyerId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You cannot make an offer on your own property',
    );
  }

  const existing = await Offer.findOne({
    property: propertyId,
    buyer: buyerId,
    status: { $nin: CLOSED_OFFER_STATUSES },
  });
  if (existing) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You already have an active offer on this property',
    );
  }

  const result = await Offer.create({
    property: propertyId,
    buyer: buyerId,
    seller: property.seller._id,
    status: OFFER_STATUS.pending,
    currentRound: 1,
    lastActionBy: 'buyer',
    currentTerms: terms,
    supportingDocuments: supportingDocuments || [],
    history: [
      {
        ...terms,
        status: OFFER_STATUS.pending,
        round: 1,
        madeBy: 'buyer',
        madeByUser: buyerId,
      },
    ],
  });

  await Property.findByIdAndUpdate(propertyId, { $inc: { totalOffers: 1 } });

  const seller = property.seller as any;
  const buyer = await User.findById(buyerId).select('-password');

  const notificationPayload = {
    message: `A Offer received from ${buyer?.name} for your property `,
    description: `Please review the offer for your property ${propertyAddress(property.streetAddress, property.city, property.state, property.zipCode, property.county)} and respond accordingly.`,
    userId: seller._id.toString(),
    fcmToken: seller?.fcmToken,
    link: `/user/offers-received/${result._id}`,
  };

  sendNotificationMessage(notificationPayload);

  const offerAddress = propertyAddress(
    property.streetAddress,
    property.city,
    property.state,
    property.zipCode,
    property.county,
  );
  sendActivityEmail({
    to: seller?.email,
    userName: seller?.name,
    subject: 'You received an offer on your listing',
    title: 'New Offer',
    body: `${buyer?.name || 'A buyer'} submitted an offer on your listing. Review it and respond from your offers.`,
    detailLabel: 'Property',
    detailValue: offerAddress,
    actionUrl: `${config.client_Url}/user/offers-received/${result._id}`,
    actionLabel: 'Review Offer',
  });

  const admin = await User.GetAdminUser();

  const adminNotificationPayload = {
    message: `A Offer submitted for  property ${propertyAddress(property.streetAddress, property.city, property.state, property.zipCode, property.county)} by ${buyer?.name}`,
    description: `${buyer?.name} has  submitted an offer for ${seller?.name} property ${propertyAddress(property.streetAddress, property.city, property.state, property.zipCode, property.county)}.`,
    userId: admin._id?.toString()!,
    fcmToken: admin?.fcmToken!,
    link: `/orders/${result._id}`,
  };

  sendNotificationMessage(adminNotificationPayload);

  return result;
};

// Either party (whoever did NOT act last) submits a counter
const counterOffer = async (
  offerId: string,
  userId: string,
  terms: IOfferTerms,
) => {
  const offer = await Offer.findById(offerId)?.populate('property')?.populate('buyer')?.populate('seller');
  if (!offer) {
    throw new AppError(httpStatus.NOT_FOUND, 'Offer not found');
  }

  if (CLOSED_OFFER_STATUSES.includes(offer.status)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This offer is closed and can no longer be countered',
    );
  }

  const isBuyer = offer.buyer._id.toString() === userId;
  const isSeller = offer.seller._id.toString() === userId;

  if (!isBuyer && !isSeller) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not a party to this offer',
    );
  }

  const actingAs: OfferParty = isBuyer ? 'buyer' : 'seller';

  // enforce turn-taking: you can't counter your own still-pending offer
  if (offer.lastActionBy === actingAs) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Waiting for the other party to respond before you can counter again',
    );
  }

  const nextRound = offer.currentRound + 1;

  const result = await Offer.findByIdAndUpdate(
    offerId,
    {
      status: OFFER_STATUS.countered,
      currentRound: nextRound,
      lastActionBy: actingAs,
      currentTerms: terms,
      $push: {
        history: {
          ...terms,
          status: OFFER_STATUS.countered,
          round: nextRound,
          madeBy: actingAs,
          madeByUser: userId,
        },
      },
    },
    { new: true, runValidators: true },
  );


  const buyer = offer?.buyer as any;
  const seller = offer?.seller as any;
  const property = offer?.property as any;

  const notificationPayload = {
    message: `A counter offer has been received from ${actingAs} ${actingAs === 'buyer' ? buyer?.name : seller?.name}.`,
    description: `${actingAs === 'buyer' ? buyer?.name : seller?.name} has submitted a counter offer for the property ${propertyAddress(property.streetAddress, property.city, property.state, property.zipCode, property.county)}.`,
    userId: actingAs === 'buyer' ? seller._id.toString() : buyer._id.toString(),
    fcmToken: actingAs === 'buyer' ? seller.fcmToken : buyer.fcmToken,
    link: actingAs === 'buyer' ? `/user/offers-received/${offerId}` : `/review-sent-offer?offer=${offerId}`,
  };

  sendNotificationMessage(notificationPayload);

  const counterAddress = propertyAddress(
    property.streetAddress,
    property.city,
    property.state,
    property.zipCode,
    property.county,
  );
  const recipient = actingAs === 'buyer' ? seller : buyer;
  sendActivityEmail({
    to: recipient?.email,
    userName: recipient?.name,
    subject: 'You received a counter offer',
    title: 'Counter Offer',
    body: `${actingAs === 'buyer' ? buyer?.name : seller?.name} sent a counter offer. Review the updated terms and respond.`,
    detailLabel: 'Property',
    detailValue: counterAddress,
    actionUrl: `${config.client_Url}${actingAs === 'buyer' ? `/user/offers-received/${offerId}` : `/review-sent-offer?offer=${offerId}`}`,
    actionLabel: 'Review Counter Offer',
  });

  const admin = await User.GetAdminUser();

  const adminNotificationPayload = {
    message: `A new counter offer has been submitted.`,
    description: `A counter offer has been submitted from ${actingAs} ${actingAs === 'buyer' ? buyer?.name : seller?.name} for the property ${propertyAddress(property.streetAddress, property.city, property.state, property.zipCode, property.county)}.`,
    userId: admin._id?.toString()!,
    fcmToken: admin.fcmToken,
  };

  sendNotificationMessage(adminNotificationPayload);

  return result;
};

const getAllOffers = async (query: Record<string, unknown>) => {
  const offerQuery = new QueryBuilder(
    Offer.find().populate('property').populate('buyer').populate('seller'),
    query,
  )
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await offerQuery.modelQuery;
  const meta = await offerQuery.countTotal();
  return { data, meta };
};

const getMyOffers = async (
  buyerId: string,
  query: Record<string, unknown>,
) => {
  const offerQuery = new QueryBuilder(
    Offer.find({ buyer: buyerId }).populate('property').populate('seller'),
    query,
  )
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await offerQuery.modelQuery;
  const meta = await offerQuery.countTotal();
  return { data, meta };
};

const getOfferStats = async () => {
  const statusAgg: { _id: string; count: number }[] = await Offer.aggregate([
    { $match: { isDeleted: false } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const countMap = new Map(statusAgg.map((s) => [s._id, s.count]));

  const totalOffers = statusAgg.reduce((sum, s) => sum + s.count, 0);

  return {
    totalOffers,
    pending:
      (countMap.get(OFFER_STATUS.pending) || 0) +
      (countMap.get(OFFER_STATUS.countered) || 0),
    accepted: countMap.get(OFFER_STATUS.accepted) || 0,
    rejected: countMap.get(OFFER_STATUS.rejected) || 0,
    withdrawn: countMap.get(OFFER_STATUS.withdrawn) || 0,
  };
};

// offers I (seller) have received
const getReceivedOffers = async (
  sellerId: string,
  query: Record<string, unknown>,
) => {
  const offerQuery = new QueryBuilder(
    Offer.find({ seller: sellerId }).populate('property').populate('buyer'),
    query,
  )
    .filter()
    .paginate()
    .sort()
    .fields();

  const data = await offerQuery.modelQuery;
  const meta = await offerQuery.countTotal();
  return { data, meta };
};

const getOfferById = async (id: string) => {
  const result = await Offer.findById(id)
    .populate('property')
    .populate('buyer')
    .populate('seller');
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Offer not found');
  }
  return result;
};

// Edit — only allowed while the offer is still in its very first round
// and only by the buyer who created it (fixing a typo/mistake before anyone responds)
const updateOffer = async (
  offerId: string,
  userId: string,
  terms: Partial<IOfferTerms>,
) => {
  const offer = await Offer.findById(offerId);
  if (!offer) {
    throw new AppError(httpStatus.NOT_FOUND, 'Offer not found');
  }

  if (offer.buyer.toString() !== userId) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only the buyer who made this offer can edit it',
    );
  }

  if (offer.status !== OFFER_STATUS.pending || offer.currentRound !== 1) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This offer can no longer be edited — send a counter instead',
    );
  }

  const updatedTerms = { ...offer.currentTerms, ...terms };

  const result = await Offer.findByIdAndUpdate(
    offerId,
    {
      currentTerms: updatedTerms,
      'history.0': {
        ...updatedTerms,
        round: 1,
        madeBy: 'buyer',
        madeByUser: userId,
        createdAt: offer.history[0].createdAt,
      },
    },
    { new: true, runValidators: true },
  );

  return result;
};

const deleteOffer = async (offerId: string, userId: string) => {
  const offer = await Offer.findById(offerId);
  if (!offer) {
    throw new AppError(httpStatus.NOT_FOUND, 'Offer not found');
  }

  const isParty =
    offer.buyer.toString() === userId || offer.seller.toString() === userId;
  if (!isParty) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not a party to this offer',
    );
  }

  const result = await Offer.findByIdAndUpdate(
    offerId,
    { isDeleted: true, status: OFFER_STATUS.withdrawn },
    { new: true },
  );

  await Property.findByIdAndUpdate(offer.property, { $inc: { totalOffers: -1 } });

  return result;
};


// Seller accepts the current terms on the table
const acceptOffer = async (offerId: string, userId: string) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const offer = await Offer.findById(offerId)
      .populate('property')
      .populate('buyer')
      .populate('seller')
      .session(session);

    if (!offer) {
      throw new AppError(httpStatus.NOT_FOUND, 'Offer not found');
    }

    if (CLOSED_OFFER_STATUSES.includes(offer.status)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'This offer is already closed or on process');
    }

    await Property.findOneAndUpdate(
      { _id: offer.property._id },
      { status: STATUS.under_contact },
      { session },
    )

    const offerAcceptedBy =
      offer?.buyer?._id?.toString() === userId ? 'buyer' : 'seller';

    // PDF generation happens outside the DB transaction (it's not a DB write),
    // but if it throws, the catch block below still aborts before any writes commit
    const [agreementMainDoc, propertyAgreementDoc] = await Promise.all([
      generateOfferPdf(offer),
      generatePropertyPdf(offer),
    ]);


    const result = await Offer.findByIdAndUpdate(
      offerId,
      { status: OFFER_STATUS.accepted, offerAcceptedBy },
      { new: true, session },
    );

    await Agreement.create(
      [
        {
          offer: offer._id,
          property: offer.property._id,
          buyer: offer.buyer._id,
          seller: offer.seller._id,
          agreementMainDoc,
          propertyAgreementDoc,
        },
      ],
      { session },

    );


    // ======= notification logic =======
    const buyer = offer?.buyer as any;
    const seller = offer?.seller as any;
    const property = offer?.property as any;

    const notificationPayload = {
      message: offerAcceptedBy === 'seller' ? `Your offer has been accepted by seller. Please add your authorized signer` : `Your offer has been accepted by buyer. Please add your authorized signer`,
      description: `The offer has been accepted by ${offerAcceptedBy === 'seller' ? "buyer" : "seller"} ${seller?.name} for the property  ${property?.streetAddress}, ${property?.city}, ${property?.state}, ${property?.zipCode}, ${property?.county}.`,
      userId: offerAcceptedBy === 'seller' ? buyer?._id?.toString() : seller?._id?.toString(),
      fcmToken: offerAcceptedBy === 'seller' ? buyer?.fcmToken : seller?.fcmToken,
      link: offerAcceptedBy === 'seller' ? `/review-sent-offer?offer=${offer?._id}` : `/user/offers-received/${offer?._id}`,
    };

    sendNotificationMessage(notificationPayload);


    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
// Either party rejects the current terms on the table, closing the thread
const rejectOffer = async (offerId: string, userId: string) => {
  const offer = await Offer.findById(offerId)
    .populate('property')
    .populate('buyer')
    .populate('seller');

  if (!offer) {
    throw new AppError(httpStatus.NOT_FOUND, 'Offer not found');
  }


  const isBuyer = offer.buyer._id.toString() === userId;
  const isSeller = offer.seller._id.toString() === userId;

  const offerRejectedBy =
    offer?.buyer?._id?.toString() === userId ? 'buyer' : 'seller';


  if (!isBuyer && !isSeller) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not a party to this offer',
    );
  }

  if (CLOSED_OFFER_STATUSES.includes(offer.status)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This offer is already closed');
  }

  const actingAs: OfferParty = isBuyer ? 'buyer' : 'seller';

  // you can only reject terms the OTHER party proposed —
  // rejecting your own pending offer is a withdrawal, not a rejection
  if (offer.lastActionBy === actingAs) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You cannot reject your own pending offer — withdraw it instead',
    );
  }

  const result = await Offer.findByIdAndUpdate(
    offerId,
    { status: OFFER_STATUS.rejected },
    { new: true },
  );


  // ======= notification logic =======
  const buyer = offer?.buyer as any;
  const seller = offer?.seller as any;
  const property = offer?.property as any;

  const notificationPayload = {
    message: offerRejectedBy === 'seller' ? `Your offer has been rejected by seller. ` : `Your offer has been rejected by buyer. `,
    description: `The offer has been rejected by ${offerRejectedBy === 'seller' ? "seller" : "buyer"} ${offerRejectedBy === 'seller' ? seller?.name : buyer?.name} for the property  ${property?.streetAddress}, ${property?.city}, ${property?.state}, ${property?.zipCode}, ${property?.county}.`,
    userId: offerRejectedBy === 'seller' ? buyer?._id?.toString() : seller?._id?.toString(),
    fcmToken: offerRejectedBy === 'seller' ? buyer?.fcmToken : seller?.fcmToken,
    link: offerRejectedBy === 'seller' ? `/review-sent-offer?offer=${offer?._id}` : `/user/offers-received/${offer?._id}`,
  };

  sendNotificationMessage(notificationPayload);


  return result;
};

// The party who currently has an offer on the table pulls it back —
// only allowed while the offer is still pending (i.e. no counter has been made yet)
const withdrawOffer = async (offerId: string, userId: string) => {
  const offer = await Offer.findById(offerId);
  if (!offer) {
    throw new AppError(httpStatus.NOT_FOUND, 'Offer not found');
  }

  const isBuyer = offer.buyer.toString() === userId;
  const isSeller = offer.seller.toString() === userId;

  if (!isBuyer && !isSeller) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not a party to this offer',
    );
  }

  if (offer.status !== OFFER_STATUS.pending) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Only a pending offer can be withdrawn',
    );
  }

  const actingAs: OfferParty = isBuyer ? 'buyer' : 'seller';

  // you can only withdraw terms YOU proposed
  if (offer.lastActionBy !== actingAs) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You can only withdraw your own offer',
    );
  }

  const result = await Offer.findByIdAndUpdate(
    offerId,
    { status: OFFER_STATUS.withdrawn },
    { new: true },
  );

  return result;
};


export const offerService = {
  createOffer,
  counterOffer,
  getAllOffers,
  getMyOffers,
  getReceivedOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
  acceptOffer,
  rejectOffer,
  withdrawOffer,
  getOfferStats
};