import { Router } from 'express';
import auth from '../../middleware/auth';
import validateRequest from '../../middleware/validateRequest';
import { USER_ROLE } from '../user/user.constants';
import { propertyContractController } from './propertyContract.controller';
import { propertyContractValidation } from './propertyContract.validation';
import { PROPERTY_CONTRACT_ADMIN_ROLES } from './propertyContract.constants';

const router = Router();

// Seller marks their listing Under Contract (ownership is checked in the service).
router.post(
  '/',
  auth(USER_ROLE.user),
  validateRequest(propertyContractValidation.createPropertyContractValidationSchema),
  propertyContractController.createPropertyContract,
);

router.get(
  '/',
  auth(...PROPERTY_CONTRACT_ADMIN_ROLES),
  propertyContractController.getAllPropertyContracts,
);

router.get(
  '/:id',
  auth(...PROPERTY_CONTRACT_ADMIN_ROLES),
  propertyContractController.getPropertyContractById,
);

export const propertyContractRoutes = router;
