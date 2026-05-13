import dotenv from "dotenv";
dotenv.config();

import { startDocumentWorker } from "./processors/document.processor";
import { startNotionWorker } from "./processors/notion.processor";

console.log("[worker] starting StaffBot workers...");

startDocumentWorker();
startNotionWorker();
