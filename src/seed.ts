import dns from 'dns';
import mongoose from 'mongoose';
import config from './app/config';
import { defaultTask } from './app/utils/defaultTask';

dns.setServers(['8.8.8.8', '1.1.1.1']);

const seed = async () => {
  await mongoose.connect(config.database_url as string);
  console.log('MongoDB connected');
  await defaultTask();
  await mongoose.disconnect();
};

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
