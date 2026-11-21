import Contents from '../modules/contents/contents.models';
import Faqs from '../modules/faqs/faqs.models';
import { STATUS } from '../modules/properties/properties.constants';
import { Property } from '../modules/properties/properties.models';
import { USER_ROLE } from '../modules/user/user.constants';
import { User } from '../modules/user/user.models';

export async function defaultTask() {
  // Add your default task here

  // check admin is exist
  const admin = await User.findOne({ role: USER_ROLE?.admin });
  if (!admin) {
    await User.create({
      name: 'Mr. Admin',
      email: 'admin@gmail.com',
      phoneNumber: '+8801321834780',
      password: '112233',
      role: 'admin',
      verification: {
        otp: '0',
        status: true,
      },
    });
  }

  const content = await Contents.findOne({});
  if (!content) {
    await Contents.create({
      aboutUs: '',
      termsAndConditions: '',
      privacyPolicy: '',
      supports: '',
      faq: '',
      banner: [],
    });
    console.log('Default content created');
  } else {
    console.log('Content already exists, seed skipped');
  }

  // One-time backfill: existing price-dropped listings without priceDroppedAt
  // use updatedAt so they can still rank until the next real reduction.
  const backfillResult = await Property.updateMany(
    {
      oldListingPrice: { $ne: null },
      status: { $in: [STATUS.active, STATUS.under_contact] },
      $expr: { $gt: ['$oldListingPrice', '$listingPrice'] },
      $or: [{ priceDroppedAt: null }, { priceDroppedAt: { $exists: false } }],
    },
    [{ $set: { priceDroppedAt: '$updatedAt' } }],
  );
  if (backfillResult.modifiedCount > 0) {
    console.log(
      `Backfilled priceDroppedAt for ${backfillResult.modifiedCount} price-dropped listing(s)`,
    );
  }

  // One-time FAQ order backfill: preserve current list order (-createdAt) as 1..n
  const faqsNeedingOrder = await Faqs.find({
    $or: [{ order: { $exists: false } }, { order: null }],
  }).sort({ createdAt: -1 });

  if (faqsNeedingOrder.length > 0) {
    const faqOrderOps = faqsNeedingOrder.map((faq, index) => ({
      updateOne: {
        filter: { _id: faq._id },
        update: { $set: { order: index + 1 } },
      },
    }));
    await Faqs.bulkWrite(faqOrderOps);
    console.log(`Backfilled order for ${faqsNeedingOrder.length} FAQ(s)`);
  }
}
