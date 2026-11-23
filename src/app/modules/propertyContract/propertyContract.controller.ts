import { Request, Response } from 'express';
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { propertyContractService } from './propertyContract.service';

const createPropertyContract = catchAsync(async (req: Request, res: Response) => {
  // The seller always comes from the token, never from the request body.
  const result = await propertyContractService.createPropertyContract(
    req.user?.userId,
    req.body,
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Property marked as Under Contract',
    data: result,
  });
});

const getAllPropertyContracts = catchAsync(async (req: Request, res: Response) => {
  const result = await propertyContractService.getAllPropertyContracts(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Property contracts fetched successfully',
    data: result.data,
    meta: result.meta,
  });
});

const getPropertyContractById = catchAsync(async (req: Request, res: Response) => {
  const result = await propertyContractService.getPropertyContractById(req.params.id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Property contract fetched successfully',
    data: result,
  });
});

export const propertyContractController = {
  createPropertyContract,
  getAllPropertyContracts,
  getPropertyContractById,
};
