import axios from "axios";
import { ReminderJob, ReminderJobDocument, ReminderStep, ReminderStepType } from "../models/ReminderJob";

const RETRY_DELAY_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const DEFAULT_LEADCONNECTOR_WEBHOOK_URL =
  "https://services.leadconnectorhq.com/hooks/Mi698GRnau2R4Z1oR1nG/webhook-trigger/651a9c64-bab3-4b46-b70a-b2fd7267722e";

type ReminderInput = {
  appointmentAt: string;
  timezone?: string;
  webhookUrl?: string;
  webhookToken?: string;
  customerName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerPhone?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
};

type ReminderDispatchResult = {
  jobId: string;
  reminderType: ReminderStepType;
  status: "sent" | "failed";
  attempts: number;
};

function getLocalDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffset(date: Date, timeZone: string) {
  const localParts = getLocalDateParts(date, timeZone);
  const localAsUtc = Date.UTC(localParts.year, localParts.month - 1, localParts.day, localParts.hour, localParts.minute, localParts.second);
  return localAsUtc - date.getTime();
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number, timeZone: string) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcTime = utcGuess;

  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffset(new Date(utcTime), timeZone);
    utcTime = utcGuess - offset;
  }

  return new Date(utcTime);
}

function previousDayAtNineAm(appointmentAt: Date, timezone: string) {
  const local = getLocalDateParts(appointmentAt, timezone);
  const previousDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);

  return zonedTimeToUtc(previousDay.getUTCFullYear(), previousDay.getUTCMonth() + 1, previousDay.getUTCDate(), 9, 0, 0, timezone);
}

export function buildReminderSchedule(appointmentAt: Date, timezone: string): ReminderStep[] {
  const firstReminder = previousDayAtNineAm(appointmentAt, timezone);
  const secondReminder = new Date(firstReminder.getTime() + 10 * 60 * 60 * 1000);
  const thirdReminder = new Date(appointmentAt.getTime() - 60 * 60 * 1000);

  return [
    { type: "day_before_9am", scheduledAt: firstReminder, status: "pending", attempts: 0, nextAttemptAt: null, sentAt: null, lastError: null },
    { type: "ten_hours_after_first", scheduledAt: secondReminder, status: "pending", attempts: 0, nextAttemptAt: null, sentAt: null, lastError: null },
    { type: "one_hour_before", scheduledAt: thirdReminder, status: "pending", attempts: 0, nextAttemptAt: null, sentAt: null, lastError: null },
  ];
}

function normalizeWebhookUrl(input?: string) {
  const value = input || process.env.LEADCONNECTOR_WEBHOOK_URL || process.env.RESERVO_WEBHOOK_URL || DEFAULT_LEADCONNECTOR_WEBHOOK_URL;
  if (!value) {
    throw new Error("LEADCONNECTOR_WEBHOOK_URL is not defined");
  }

  return value;
}

function normalizeTimezone(input?: string) {
  return input || process.env.APP_TIMEZONE || "America/Guayaquil";
}

export function getReminderCondition(reminder: ReminderStep) {
  return reminder.type;
}

export function getReminderMessage(reminder: ReminderStep) {
  switch (reminder.type) {
    case "day_before_9am":
      return "Recordatorio: tu cita está confirmada para mañana.";
    case "ten_hours_after_first":
      return "Segundo recordatorio: tu cita se acerca.";
    case "one_hour_before":
      return "Último recordatorio: tu cita es en 1 hora.";
    default:
      return "Recordatorio de cita.";
  }
}

export function getReminderBranchLabel(reminder: ReminderStep) {
  switch (reminder.type) {
    case "day_before_9am":
      return "dia_anterior_9am";
    case "ten_hours_after_first":
      return "10_horas_despues";
    case "one_hour_before":
      return "1_hora_antes";
    default:
      return "recordatorio";
  }
}

export function buildWebhookPayload(job: ReminderJobDocument, reminder: ReminderStep) {
  return {
    key: job.externalId || job._id.toString(),
    condition: getReminderCondition(reminder),
    tipo_recordatorio: getReminderBranchLabel(reminder),
    message: getReminderMessage(reminder),
    event: "appointment.reminder",
    reminderType: reminder.type,
    scheduledAt: reminder.scheduledAt.toISOString(),
    appointmentAt: job.appointmentAt.toISOString(),
    timezone: job.timezone,
    customerName: job.customerName || null,
    customerLastName: job.customerLastName || null,
    customerEmail: job.customerEmail || null,
    customerPhone: job.customerPhone || null,
    firstName: job.customerName || null,
    lastName: job.customerLastName || null,
    nombre: job.customerName || null,
    apellido: job.customerLastName || null,
    email: job.customerEmail || null,
    phone: job.customerPhone || null,
    externalId: job.externalId || null,
    metadata: job.metadata || {},
  };
}

async function dispatchReminder(job: ReminderJobDocument, reminder: ReminderStep) {
  const webhookUrl = normalizeWebhookUrl(job.webhookUrl);
  const webhookToken = job.webhookToken || process.env.LEADCONNECTOR_WEBHOOK_TOKEN || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (webhookToken) {
    headers.Authorization = `Bearer ${webhookToken}`;
  }

  await axios.post(
    webhookUrl,
    buildWebhookPayload(job, reminder),
    {
      headers,
      timeout: 15000,
    },
  );
}

export async function createReminderJob(input: ReminderInput) {
  const appointmentAt = new Date(input.appointmentAt);

  if (Number.isNaN(appointmentAt.getTime())) {
    throw new Error("appointmentAt must be a valid date");
  }

  const timezone = normalizeTimezone(input.timezone);
  const reminders = buildReminderSchedule(appointmentAt, timezone).filter((reminder) => reminder.scheduledAt > new Date());
  const webhookUrl = normalizeWebhookUrl(input.webhookUrl);

  const job = await ReminderJob.create({
    externalId: input.externalId || "",
    appointmentAt,
    timezone,
    webhookUrl,
    webhookToken: input.webhookToken || process.env.LEADCONNECTOR_WEBHOOK_TOKEN || "",
    customerName: input.customerName || "",
    customerLastName: input.customerLastName || "",
    customerEmail: input.customerEmail || "",
    customerPhone: input.customerPhone || "",
    metadata: input.metadata || {},
    reminders,
  });

  return job;
}

export async function createReminderJobIfMissing(input: ReminderInput) {
  if (input.externalId) {
    const existing = await ReminderJob.findOne({ externalId: input.externalId }).exec();
    if (existing) {
      return { job: existing, created: false };
    }
  }

  return { job: await createReminderJob(input), created: true };
}

export async function processDueReminders(now = new Date()): Promise<ReminderDispatchResult[]> {
  const jobs = await ReminderJob.find({
    "reminders.scheduledAt": { $lte: now },
  }).exec();

  const results: ReminderDispatchResult[] = [];

  for (const job of jobs) {
    for (const reminder of job.reminders) {
      const dueForRetry = !reminder.nextAttemptAt || reminder.nextAttemptAt <= now;
      const isDue = reminder.status === "pending" && reminder.scheduledAt <= now && dueForRetry;

      if (!isDue) {
        continue;
      }

      reminder.status = "processing";
      await job.save();

      try {
        await dispatchReminder(job, reminder);
        reminder.status = "sent";
        reminder.sentAt = now;
        reminder.lastError = null;
        reminder.nextAttemptAt = null;
        await job.save();

        results.push({
          jobId: job._id.toString(),
          reminderType: reminder.type,
          status: "sent",
          attempts: reminder.attempts,
        });
      } catch (error) {
        reminder.attempts += 1;
        reminder.lastError = error instanceof Error ? error.message : "Unknown error";
        if (reminder.attempts >= MAX_ATTEMPTS) {
          reminder.status = "failed";
          reminder.nextAttemptAt = null;
        } else {
          reminder.status = "pending";
          reminder.nextAttemptAt = new Date(now.getTime() + RETRY_DELAY_MS);
        }

        await job.save();

        results.push({
          jobId: job._id.toString(),
          reminderType: reminder.type,
          status: "failed",
          attempts: reminder.attempts,
        });
      }
    }
  }

  return results;
}

export function serializeReminderJob(job: ReminderJobDocument) {
  return {
    id: job._id.toString(),
    externalId: job.externalId || null,
    appointmentAt: job.appointmentAt,
    timezone: job.timezone,
    webhookUrl: job.webhookUrl,
    customerName: job.customerName || null,
    customerLastName: job.customerLastName || null,
    customerEmail: job.customerEmail || null,
    customerPhone: job.customerPhone || null,
    metadata: job.metadata || {},
    reminders: job.reminders,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
