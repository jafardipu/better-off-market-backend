"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const http_1 = require("http");
const colors_1 = __importDefault(require("colors"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("./app/config"));
const socket_1 = __importDefault(require("./app/socket"));
const defaultTask_1 = require("./app/utils/defaultTask");
const dns_1 = __importDefault(require("dns"));
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const socketServer = (0, http_1.createServer)(app_1.default);
let server;
const connectDB = () => __awaiter(void 0, void 0, void 0, function* () {
    yield mongoose_1.default.connect(config_1.default.database_url);
    console.log(colors_1.default.cyan.bold('🗄️  MongoDB connected'));
});
const startSocket = () => (0, socket_1.default)(socketServer).then((io) => {
    io.listen(Number(config_1.default.socket_port));
    console.log(colors_1.default.yellow.bold(`⚡ Socket.io running on http://${config_1.default.ip}:${config_1.default.socket_port}`));
    return io;
});
const startHttpServer = () => new Promise((resolve, reject) => {
    const s = app_1.default.listen(Number(config_1.default.port), config_1.default === null || config_1.default === void 0 ? void 0 : config_1.default.ip, () => {
        console.log(colors_1.default.italic.green.bold(`💫 Server running on http://${config_1.default === null || config_1.default === void 0 ? void 0 : config_1.default.ip}:${config_1.default.port}`));
        resolve(s);
    });
    s.on('error', reject);
});
const shutdown = (reason) => (err) => {
    console.log(colors_1.default.red.bold(`😈 ${reason} detected, shutting down...`), err !== null && err !== void 0 ? err : '');
    if (server) {
        server.close(() => process.exit(1));
    }
    else {
        process.exit(1);
    }
};
connectDB()
    .then(() => (0, defaultTask_1.defaultTask)())
    .then(startSocket)
    .then(startHttpServer)
    .then((s) => {
    server = s;
})
    .catch(shutdown('Startup error'));
process.on('unhandledRejection', shutdown('unhandledRejection'));
process.on('uncaughtException', shutdown('uncaughtException'));
