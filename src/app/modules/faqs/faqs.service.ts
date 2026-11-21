import httpStatus from 'http-status';
import { IFaqs } from './faqs.interface';
import Faqs from './faqs.models';
import AppError from '../../error/AppError';
import QueryBuilder from '../../class/builder/QueryBuilder';
import mongoose from 'mongoose';

const createFaqs = async (payload: IFaqs) => {
  const lastFaq = await Faqs.findOne({}).sort({ order: -1 }).select('order');
  const nextOrder = (lastFaq?.order ?? 0) + 1;

  const result = await Faqs.create({
    ...payload,
    order: nextOrder,
  });
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create faqs');
  }
  return result;
};

const getAllFaqs = async (query: Record<string, any>) => {
  query['isDeleted'] = false;
  const { sort: _ignoredSort, ...restQuery } = query;

  // Always rank by admin order; ignore client sort.
  const faqsModel = new QueryBuilder(
    Faqs.find().sort({ order: 1, createdAt: 1 }),
    restQuery,
  )
    .search([])
    .filter()
    .paginate()
    .fields();

  const data = await faqsModel.modelQuery;
  const meta = await faqsModel.countTotal();

  return {
    data,
    meta,
  };
};

const getFaqsById = async (id: string) => {
  const result = await Faqs.findById(id);
  if (!result || result?.isDeleted) {
    throw new Error('Faqs not found!');
  }
  return result;
};

const updateFaqs = async (id: string, payload: Partial<IFaqs>) => {
  const result = await Faqs.findByIdAndUpdate(id, payload, { new: true });
  if (!result) {
    throw new Error('Failed to update Faqs');
  }
  return result;
};

const reorderFaqs = async (orders: { id: string; order: number }[]) => {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'orders is required');
  }

  const bulkOps = orders.map(({ id, order }) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new AppError(httpStatus.BAD_REQUEST, `Invalid FAQ id: ${id}`);
    }
    if (typeof order !== 'number' || !Number.isFinite(order)) {
      throw new AppError(httpStatus.BAD_REQUEST, `Invalid order for FAQ id: ${id}`);
    }

    return {
      updateOne: {
        filter: { _id: id, isDeleted: false },
        update: { $set: { order } },
      },
    };
  });

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await Faqs.bulkWrite(bulkOps, { session });
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }

  return { updated: orders.length };
};

const deleteFaqs = async (id: string) => {
  const result = await Faqs.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true },
  );
  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Failed to delete faqs');
  }
  return result;
};

export const faqsService = {
  createFaqs,
  getAllFaqs,
  getFaqsById,
  updateFaqs,
  reorderFaqs,
  deleteFaqs,
};
