"use strict";
// init command - Initialize a new repository
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = init;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
function init(args) {
    const targetDir = args[0] || process.cwd();
    const absPath = path.resolve(targetDir);
    const gitDir = path.join(absPath, '.minigit');
    if (fs.existsSync(gitDir)) {
        console.error(`Reinitialized existing Git repository in ${gitDir}/`);
        process.exit(1);
    }
    // Create directory structure
    (0, utils_1.ensureDir)(gitDir);
    (0, utils_1.ensureDir)(path.join(gitDir, 'objects'));
    (0, utils_1.ensureDir)(path.join(gitDir, 'objects', 'info'));
    (0, utils_1.ensureDir)(path.join(gitDir, 'objects', 'pack'));
    (0, utils_1.ensureDir)(path.join(gitDir, 'refs'));
    (0, utils_1.ensureDir)(path.join(gitDir, 'refs', 'heads'));
    (0, utils_1.ensureDir)(path.join(gitDir, 'refs', 'tags'));
    // Create HEAD
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    // Create config file
    fs.writeFileSync(path.join(gitDir, 'config'), '');
    console.log(`Initialized empty Git repository in ${gitDir}/`);
}
