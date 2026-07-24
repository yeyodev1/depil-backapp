import express, { Application } from "express";
import { createReminderJob, processDueReminders, serializeReminderJob } from "../services/reminders.service";
import { syncReservoAppointments } from "../services/reservo.service";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.post("/reminders", async (req, res, next) => {
    try {
      const job = await createReminderJob(req.body || {});
      res.status(201).json({ ok: true, data: serializeReminderJob(job) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/cron/tumesero-sync", async (_req, res, next) => {
    try {
      const sync = await syncReservoAppointments();
      const results = await processDueReminders();
      res.status(200).json({
        ok: true,
        sync,
        processed: results.length,
        results,
      });
    } catch (error) {
      next(error);
    }
  });
}

export default routerApi;
