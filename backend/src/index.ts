import dotenv from "dotenv";
dotenv.config();

import express from "express";
import authRoutes from "./routes/auth.routes";
import tenantRoutes from "./routes/tenant.routes";
import profileRoutes from "./routes/profile.routes";
import employeeRoutes from "./routes/employee.routes";
import employeeProfileRoutes from "./routes/employee-profiles.routes";
import documentRoutes from "./routes/document.routes";
import conversationRoutes from "./routes/conversation.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import userRoutes from "./routes/user.routes";
import tokensRoutes from "./routes/tokens.routes";
import webhookRoutes from "./routes/webhook.routes";

const app = express();
const port = process.env.PORT ?? 4000;

app.use(express.json());

const healthHandler = (_req: express.Request, res: express.Response) =>
  res.json({ status: "ok", service: "staffbot-backend" });

app.get("/health", healthHandler);
app.get("/api/health", healthHandler); // Nginx proxies /api/* → backend keeping prefix

app.use("/api/auth", authRoutes);
app.use("/api/tenants", tenantRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/employees", employeeProfileRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tokens", tokensRoutes);

// Webhooks — no auth middleware, Meta verifies via WHATSAPP_VERIFY_TOKEN
app.use("/webhooks", webhookRoutes);

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON in request body" });
    return;
  }
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`[backend] listening on port ${port}`);
});

export default app;
