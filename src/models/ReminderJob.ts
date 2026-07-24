import { Schema, model, models, Types } from "mongoose";

export type ReminderStepType = "day_before_9am" | "ten_hours_after_first" | "one_hour_before";
export type ReminderStepStatus = "pending" | "processing" | "sent" | "failed";

export interface ReminderStep {
  type: ReminderStepType;
  scheduledAt: Date;
  status: ReminderStepStatus;
  attempts: number;
  nextAttemptAt?: Date | null;
  sentAt?: Date | null;
  lastError?: string | null;
}

export interface ReminderJobDocument {
  _id: Types.ObjectId;
  externalId?: string;
  appointmentAt: Date;
  timezone: string;
  branchName?: string;
  scheduleVersion?: string;
  webhookUrl: string;
  webhookToken?: string;
  customerName?: string;
  customerLastName?: string;
  customerEmail?: string;
  customerPhone?: string;
  metadata: Record<string, unknown>;
  reminders: ReminderStep[];
  createdAt: Date;
  updatedAt: Date;
}

const ReminderStepSchema = new Schema<ReminderStep>(
  {
    type: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
    status: { type: String, required: true, default: "pending" },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { _id: false },
);

const ReminderJobSchema = new Schema<ReminderJobDocument>(
  {
    externalId: { type: String },
    appointmentAt: { type: Date, required: true },
    timezone: { type: String, required: true },
    branchName: { type: String, default: "" },
    scheduleVersion: { type: String, default: "" },
    webhookUrl: { type: String, required: true },
    webhookToken: { type: String, default: "" },
    customerName: { type: String, default: "" },
    customerLastName: { type: String, default: "" },
    customerEmail: { type: String, default: "" },
    customerPhone: { type: String, default: "" },
    metadata: { type: Schema.Types.Mixed, default: {} },
    reminders: { type: [ReminderStepSchema], required: true },
  },
  { timestamps: true },
);
ReminderJobSchema.index({ "reminders.scheduledAt": 1, "reminders.status": 1, "reminders.nextAttemptAt": 1 });
ReminderJobSchema.index({ externalId: 1 });

export const ReminderJob = models.ReminderJob || model<ReminderJobDocument>("ReminderJob", ReminderJobSchema);
