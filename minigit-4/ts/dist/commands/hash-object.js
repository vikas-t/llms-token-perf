"use strict";
// hash-object command - Compute object hash
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
exports.hashObjectCmd = hashObjectCmd;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const utils_1 = require("../utils");
const objects_1 = require("../objects");
function hashObjectCmd(args) {
    let write = false;
    let objectType = 'blob';
    let filePath = null;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '-w') {
            write = true;
        }
        else if (args[i] === '-t' && i + 1 < args.length) {
            objectType = args[++i];
        }
        else if (!args[i].startsWith('-')) {
            filePath = args[i];
        }
    }
    if (!filePath) {
        console.error('fatal: file path required');
        return 1;
    }
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
        console.error(`fatal: could not open '${filePath}' for reading: No such file or directory`);
        return 1;
    }
    const content = fs.readFileSync(absolutePath);
    // Currently only blob type is fully supported
    let objectContent;
    if (objectType === 'blob') {
        objectContent = (0, objects_1.createBlobContent)(content);
    }
    else {
        // For other types, just use blob format for now
        const header = `${objectType} ${content.length}\0`;
        objectContent = Buffer.concat([Buffer.from(header), content]);
    }
    const sha = (0, objects_1.hashObject)(objectContent);
    if (write) {
        const repoRoot = (0, utils_1.findRepoRoot)();
        if (!repoRoot) {
            console.error('fatal: not a minigit repository');
            return 1;
        }
        (0, objects_1.writeObject)(repoRoot, objectContent);
    }
    console.log(sha);
    return 0;
}
