import { Router } from 'express';
import { faqsController } from './faqs.controller';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';
import validateRequest from '../../middleware/validateRequest';
import { faqsValidation } from './faqs.validation';

const router = Router();

router.post(
  '/',
  auth(USER_ROLE.admin),
  validateRequest(faqsValidation.createFaqsValidationSchema),
  faqsController.createFaqs,
);

router.patch(
  '/reorder',
  auth(USER_ROLE.admin),
  validateRequest(faqsValidation.reorderFaqsValidationSchema),
  faqsController.reorderFaqs,
);

router.patch(
  '/:id',
  auth(USER_ROLE.admin),
  validateRequest(faqsValidation.updateFaqsValidationSchema),
  faqsController.updateFaqs,
);
router.delete('/:id', auth(USER_ROLE.admin), faqsController.deleteFaqs);
router.get('/:id', faqsController.getFaqsById);
router.get('/', faqsController.getAllFaqs);

export const faqsRoutes = router;
