import { Router } from 'express';
import auth from '../../middleware/auth';
import { buyerActivityController } from './buyerActivity.controller';
import { BUYER_ACTIVITY_ADMIN_ROLES } from './buyerActivity.constants';

const router = Router();

// Admin Buyer Activity page, plus the per-user (?buyer=) and per-listing
// (?property=) views.
router.get(
  '/',
  auth(...BUYER_ACTIVITY_ADMIN_ROLES),
  buyerActivityController.getAllBuyerActivities,
);

export const buyerActivityRoutes = router;
