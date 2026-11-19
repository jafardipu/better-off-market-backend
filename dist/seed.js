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
const dns_1 = __importDefault(require("dns"));
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("./app/config"));
const defaultTask_1 = require("./app/utils/defaultTask");
dns_1.default.setServers(['8.8.8.8', '1.1.1.1']);
const seed = () => __awaiter(void 0, void 0, void 0, function* () {
    yield mongoose_1.default.connect(config_1.default.database_url);
    console.log('MongoDB connected');
    yield (0, defaultTask_1.defaultTask)();
    yield mongoose_1.default.disconnect();
});
seed()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
});
