import axios from "axios";
import { createReminderJobIfMissing } from "./reminders.service";

const RESERVO_API_URL = "https://reservo.cl/APIpublica/v2";

type ReservoAppointment = {
  uuid?: string;
  inicio?: string;
  zona_horaria?: string;
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
  url.searchParams.set("fecha_final", toDateOnly(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)));

  const appointments: ReservoAppointment[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const page = await fetchAppointmentsPage(nextUrl);
    appointments.push(...(page.resultados || []));
    nextUrl = page.pagina_siguiente || null;
  }

  return appointments;
}

export async function syncReservoAppointments() {
  const appointments = await getReservoAppointments();
  let created = 0;

  for (const appointment of appointments) {
    if (!appointment.uuid || !appointment.inicio) {
      continue;
    }

    const client = appointment.cliente || {};
    const lastName = [client.apellido_paterno, client.apellido_materno].filter(Boolean).join(" ");
    const result = await createReminderJobIfMissing({
      externalId: appointment.uuid,
      appointmentAt: appointment.inicio,
      timezone: appointment.zona_horaria,
      customerName: client.nombre,
      customerLastName: lastName,
      customerEmail: client.mail,
      customerPhone: client.telefono_1 || client.telefono_2,
      metadata: { source: "reservo" },
    });

    if (result.created) {
      created += 1;
    }
  }

  return { found: appointments.length, created };
}
