import axios from "axios";
import { ReminderJob } from "../models/ReminderJob";
import { createReminderJob, ReminderInput, REMINDER_SCHEDULE_VERSION, rescheduleReminderJob } from "./reminders.service";

const RESERVO_API_URL = "https://reservo.cl/APIpublica/v2";
const DEFAULT_SYNC_DAYS = 2;

type ReservoAppointment = {
  uuid?: string;
  inicio?: string;
  zona_horaria?: string;
  sucursal?: {
    nombre?: string;
  };
  cliente?: {
    nombre?: string;
    apellido_paterno?: string;
    apellido_materno?: string;
    telefono_1?: string;
    telefono_2?: string;
    mail?: string;
  };
};

type ReservoAppointmentsPage = {
  pagina_siguiente?: string | null;
  resultados?: ReservoAppointment[];
};

type ReservoAppointmentWithDetails = ReservoAppointment & { uuid: string; inicio: string };

function getReservoToken() {
  const token = process.env.RESERVO_TOKEN;
  if (!token) {
    throw new Error("RESERVO_TOKEN is not defined");
  }

  return token;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getSyncDays() {
  const value = Number(process.env.RESERVO_SYNC_DAYS || DEFAULT_SYNC_DAYS);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_SYNC_DAYS;
}

function normalizeBranchName(value?: string) {
  return (value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function getExcludedBranches() {
  return new Set(
    (process.env.RESERVO_EXCLUDED_BRANCHES || "")
      .split(",")
      .map(normalizeBranchName)
      .filter(Boolean),
  );
}

function hasAppointmentDetails(appointment: ReservoAppointment): appointment is ReservoAppointmentWithDetails {
  return Boolean(appointment.uuid && appointment.inicio);
}

function toReminderInput(appointment: ReservoAppointmentWithDetails): ReminderInput {
  const client = appointment.cliente || {};
  return {
    externalId: appointment.uuid,
    appointmentAt: appointment.inicio,
    timezone: appointment.zona_horaria,
    branchName: appointment.sucursal?.nombre,
    customerName: client.nombre,
    customerLastName: [client.apellido_paterno, client.apellido_materno].filter(Boolean).join(" "),
    customerEmail: client.mail,
    customerPhone: client.telefono_1 || client.telefono_2,
    metadata: { source: "reservo" },
  };
}

async function fetchAppointmentsPage(url: string) {
  const response = await axios.get<ReservoAppointmentsPage>(url, {
    headers: { Authorization: `Token ${getReservoToken()}` },
    timeout: 15000,
  });

  return response.data;
}

async function getReservoAppointments() {
  const now = new Date();
  const url = new URL(`${RESERVO_API_URL}/citas/`);
  url.searchParams.set("fecha_inicial", toDateOnly(now));
  url.searchParams.set("fecha_final", toDateOnly(new Date(now.getTime() + getSyncDays() * 24 * 60 * 60 * 1000)));

  const appointments: ReservoAppointment[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const page = await fetchAppointmentsPage(nextUrl);
    appointments.push(...(page.resultados || []));
    nextUrl = page.pagina_siguiente || null;
  }

  return appointments;
}

async function removeDuplicateReminderJobs() {
  const duplicates = await ReminderJob.aggregate<{
    _id: string;
    jobIds: string[];
  }>([
    { $match: { externalId: { $type: "string", $ne: "" } } },
    { $sort: { createdAt: 1 } },
    { $group: { _id: "$externalId", jobIds: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).exec();
  const duplicateIds = duplicates.flatMap((group) => group.jobIds.slice(1));

  if (!duplicateIds.length) {
    return 0;
  }

  const result = await ReminderJob.deleteMany({ _id: { $in: duplicateIds } }).exec();
  return result.deletedCount || 0;
}

export async function syncReservoAppointments() {
  const appointments = await getReservoAppointments();
  const deduplicated = await removeDuplicateReminderJobs();
  const excludedBranches = getExcludedBranches();
  const excludedAppointments = appointments.filter(
    (appointment) => appointment.uuid && excludedBranches.has(normalizeBranchName(appointment.sucursal?.nombre)),
  );
  const excludedIds = excludedAppointments.map((appointment) => appointment.uuid as string);
  const removed = excludedIds.length
    ? await ReminderJob.deleteMany({ externalId: { $in: excludedIds } }).exec()
    : { deletedCount: 0 };
  const appointmentsWithDetails = appointments
    .filter((appointment) => !excludedBranches.has(normalizeBranchName(appointment.sucursal?.nombre)))
    .filter(hasAppointmentDetails);
  const externalIds = appointmentsWithDetails.map((appointment) => appointment.uuid);
  const existingJobs = await ReminderJob.find({ externalId: { $in: externalIds } }).exec();
  const existingExternalIds = new Set(existingJobs.map((job) => job.externalId));
  const newAppointments = appointmentsWithDetails.filter((appointment) => !existingExternalIds.has(appointment.uuid));

  await Promise.all(newAppointments.map((appointment) => createReminderJob(toReminderInput(appointment))));
  const jobsNeedingBranchSchedule = existingJobs.filter((job) => job.scheduleVersion !== REMINDER_SCHEDULE_VERSION);
  await Promise.all(jobsNeedingBranchSchedule.map((job) => {
    const appointment = appointmentsWithDetails.find((item) => item.uuid === job.externalId);
    return appointment ? rescheduleReminderJob(job, toReminderInput(appointment)) : job;
  }));

  return {
    found: appointments.length,
    excluded: excludedAppointments.length,
    removed: removed.deletedCount || 0,
    created: newAppointments.length,
    rescheduled: jobsNeedingBranchSchedule.length,
    deduplicated,
  };
}
