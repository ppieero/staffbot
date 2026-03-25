import dotenv from "dotenv";
dotenv.config();

import { startDocumentWorker } from "./processors/document.processor";

console.log("[worker] starting StaffBot workers...");

startDocumentWorker();
