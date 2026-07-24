import dotenv from "dotenv";
import { dbConnect } from "./config/mongo";
import { createApp } from "./app";

const port = process.env.PORT || 8100;
let cachedApp: ReturnType<typeof createApp>["app"] | null = null;
let cachedAppInit: Promise<ReturnType<typeof createApp>["app"]> | null = null;

async function main() {
  dotenv.config();
  await dbConnect();

  const { app, server } = createApp();

  server.timeout = 10 * 60 * 1000;

  server.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

async function getApp() {
  if (cachedApp) {
    return cachedApp;
  }

  if (!cachedAppInit) {
    cachedAppInit = (async () => {
      dotenv.config();
      await dbConnect();

      const { app } = createApp();
      cachedApp = app;
      return app;
    })();
  }

  return cachedAppInit;
}

export default async function handler(req: unknown, res: unknown) {
  const app = await getApp();
  return app(req as never, res as never);
}

if (require.main === module && !process.env.VERCEL) {
  void main();
}
