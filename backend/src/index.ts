import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT ?? 4000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "staffbot-backend" });
});

app.listen(port, () => {
  console.log(`[backend] listening on port ${port}`);
});

export default app;
