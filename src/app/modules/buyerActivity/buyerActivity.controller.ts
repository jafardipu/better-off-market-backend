import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { buyerActivityService } from './buyerActivity.service';

const getAllBuyerActivities = catchAsync(async (req: Request, res: Response) => {
  const result = await buyerActivityService.getAllBuyerActivities(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Buyer activities fetched successfully',
    data: result.data,
    meta: result.meta,
  });
});

export const buyerActivityController = {
  getAllBuyerActivities,
};
