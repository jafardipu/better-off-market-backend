
import { Request, Response } from 'express';
import catchAsync from '../../utils/catchAsync';  
import { faqsService } from './faqs.service';
import sendResponse from '../../utils/sendResponse';
import { storeFile } from '../../utils/fileHelper';
import { uploadToS3 } from '../../utils/s3';

const createFaqs = catchAsync(async (req: Request, res: Response) => {
 const result = await faqsService.createFaqs(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Faqs created successfully',
    data: result,
  });

});

const getAllFaqs = catchAsync(async (req: Request, res: Response) => {

 const result = await faqsService.getAllFaqs(req.query);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All faqs fetched successfully',
    data: result,
  });

});

const getFaqsById = catchAsync(async (req: Request, res: Response) => {
 const result = await faqsService.getFaqsById(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Faqs fetched successfully',
    data: result,
  });

});
const updateFaqs = catchAsync(async (req: Request, res: Response) => {
const result = await faqsService.updateFaqs(req.params.id, req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Faqs updated successfully',
    data: result,
  });

});

const reorderFaqs = catchAsync(async (req: Request, res: Response) => {
  const result = await faqsService.reorderFaqs(req.body.orders);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Faqs reordered successfully',
    data: result,
  });
});

const deleteFaqs = catchAsync(async (req: Request, res: Response) => {
 const result = await faqsService.deleteFaqs(req.params.id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Faqs deleted successfully',
    data: result,
  });

});

export const faqsController = {
  createFaqs,
  getAllFaqs,
  getFaqsById,
  updateFaqs,
  reorderFaqs,
  deleteFaqs,
};