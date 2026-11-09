import { Router } from 'express';
import multer, { memoryStorage } from 'multer';
import { propertyController } from './properties.controller';
import validateRequest from '../../middleware/validateRequest';
import { propertyValidation } from './properties.validation';
import parseData from '../../middleware/parseData';
import auth from '../../middleware/auth';
import { USER_ROLE } from '../user/user.constants';
import processPropertyFiles from './properties.upload.middleware';

const router = Router();
const upload = multer({ storage: memoryStorage() });

const propertyUploadFields = upload.fields([
    { name: 'photos', maxCount: 50 },
    { name: 'documents', maxCount: 10 },
]);

router.post(
    '/',
    auth(USER_ROLE.user),
    propertyUploadFields,
    parseData(),
    processPropertyFiles,
    validateRequest(propertyValidation.createPropertyValidationSchema as any),
    propertyController.createProperty,
);
router.get('/', propertyController.getAllProperties);

router.get('/dashboard', auth(USER_ROLE.admin), propertyController.getAllPropertiesForDashboard);

router.get('/property-type-counts', propertyController.getPropertyTypeCounts);

router.get('/web-content', propertyController.getAllPropertiesForWeb);

router.get('/price-dropped', propertyController.getPriceDroppedProperties);

router.get('/my-listing', auth(USER_ROLE.user), propertyController.getMyListingProperties);

router.get('/seller/:sellerId/dashboard', propertyController.getPropertiesBySellerForDashboard);

router.get('/seller/:sellerId', propertyController.getPropertiesBySeller);

router.get('/:id', propertyController.getPropertyById);

router.patch(
    '/:id',
    auth(USER_ROLE.user),
    propertyUploadFields,
    parseData(),
    processPropertyFiles,
    validateRequest(propertyValidation.updatePropertyValidationSchema),
    propertyController.updateProperty,
);

router.patch(
    '/increase-views/:id',
    propertyController.increaseViewCount
),

    router.patch(
        '/increase-rsvp/:id',
        propertyController.increaseRSVPCount
    ),


    router.delete(
        '/:id',
        auth(USER_ROLE.user, USER_ROLE.admin),
        propertyController.deleteProperty,
    );



// ============================================== admin routes ================================================
router.patch('/approve/:id', auth(USER_ROLE.admin), propertyController.approveProperty);
router.patch('/reject/:id', auth(USER_ROLE.admin), propertyController.rejectProperty);

export const propertiesRoutes = router;