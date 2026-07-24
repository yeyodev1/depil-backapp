import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReminderSchedule,
  buildWebhookPayload,
  getReminderBranchLabel,
  getReminderMessage,
} from "./reminders.service";

test("buildReminderSchedule creates the 3 reminder windows", () => {
  const appointmentAt = new Date("2026-07-10T14:00:00.000Z");
  const reminders = buildReminderSchedule(appointmentAt, "America/Guayaquil");

  assert.equal(reminders.length, 3);
  assert.equal(reminders[0].type, "day_before_9am");
  assert.equal(reminders[0].scheduledAt.toISOString(), "2026-07-09T14:00:00.000Z");
  assert.equal(reminders[1].type, "ten_hours_after_first");
  assert.equal(reminders[1].scheduledAt.toISOString(), "2026-07-10T00:00:00.000Z");
  assert.equal(reminders[2].type, "one_hour_before");
  assert.equal(reminders[2].scheduledAt.toISOString(), "2026-07-10T13:00:00.000Z");
});

test("getReminderMessage returns a distinct message per reminder type", () => {
  assert.equal(getReminderMessage({ type: "day_before_9am" } as never), "Recordatorio: tu cita está confirmada para mañana.");
  assert.equal(getReminderMessage({ type: "ten_hours_after_first" } as never), "Segundo recordatorio: tu cita se acerca.");
  assert.equal(getReminderMessage({ type: "one_hour_before" } as never), "Último recordatorio: tu cita es en 1 hora.");
});

test("buildWebhookPayload exposes key and condition clearly", () => {
  const payload = buildWebhookPayload(
    {
      _id: { toString: () => "mongo-job-id" } as never,
      appointmentAt: new Date("2026-07-10T14:00:00.000Z"),
      timezone: "America/Guayaquil",
      webhookUrl: "https://example.com/webhook",
      webhookToken: "",
      customerName: "Daniela",
      customerEmail: "daniela@example.com",
      customerPhone: "+593987179785",
      externalId: "appointment-123",
      metadata: { source: "leadconnector" },
      reminders: [],
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    },
    {
      type: "one_hour_before",
      scheduledAt: new Date("2026-07-10T13:00:00.000Z"),
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      sentAt: null,
      lastError: null,
    },
  );

  assert.equal(payload.key, "appointment-123");
  assert.equal(payload.condition, "one_hour_before");
  assert.equal(payload.tipo_recordatorio, "1_hora_antes");
  assert.equal(payload.message, "Último recordatorio: tu cita es en 1 hora.");
  assert.equal(payload.customerName, "Daniela");
  assert.equal(payload.externalId, "appointment-123");
});

test("getReminderBranchLabel returns Spanish branch labels", () => {
  assert.equal(getReminderBranchLabel({ type: "day_before_9am" } as never), "dia_anterior_9am");
  assert.equal(getReminderBranchLabel({ type: "ten_hours_after_first" } as never), "10_horas_despues");
  assert.equal(getReminderBranchLabel({ type: "one_hour_before" } as never), "1_hora_antes");
});
