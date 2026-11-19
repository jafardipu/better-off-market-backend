
import app from './app';
import { createServer, type Server } from 'http';
import colors from 'colors';
import mongoose from 'mongoose';
import config from './app/config';
import initializeSocket from './app/socket';
import { defaultTask } from './app/utils/defaultTask';
import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

const socketServer = createServer(app);
let server: Server;

const connectDB = async () => {
  await mongoose.connect(config.database_url as string);
  console.log(colors.cyan.bold('🗄️  MongoDB connected'));
};

const startSocket = () =>
  initializeSocket(socketServer).then((io) => {
    io.listen(Number(config.socket_port));
    console.log(
      colors.yellow.bold(`⚡ Socket.io running on http://${config.ip}:${config.socket_port}`),
    );
    return io;
  });

const startHttpServer = () =>
  new Promise<Server>((resolve, reject) => {
    const s = app.listen(Number(config.port), config?.ip as string, () => {
      console.log(
        colors.italic.green.bold(`💫 Server running on http://${config?.ip}:${config.port}`),
      );
      resolve(s);
    });
    s.on('error', reject);
  });

const shutdown = (reason: string) => (err?: unknown) => {
  console.log(colors.red.bold(`😈 ${reason} detected, shutting down...`), err ?? '');
  if (server) {
    server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
};

connectDB()
  .then(() => defaultTask())
  .then(startSocket)
  .then(startHttpServer)
  .then((s) => {
    server = s;
  })
  .catch(shutdown('Startup error'));

process.on('unhandledRejection', shutdown('unhandledRejection'));
process.on('uncaughtException', shutdown('uncaughtException'));