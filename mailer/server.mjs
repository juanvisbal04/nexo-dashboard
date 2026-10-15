import http from "node:http";

const PORT = Number(process.env.PORT || 10000);
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const TEMPLATE_ID = process.env.RESEND_TEAM_INVITE_TEMPLATE || "nexo-team-invite";

const allowedOrigins = new Set([
  "https://dashboard.nexobyjv.online",
  "https://nexo-dashboard-pcfq.onrender.com",
]);

function json(res, status, body, origin="") {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (allowedOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) throw new Error("Payload too large");
  }
  return raw ? JSON.parse(raw) : {};
}

async function isPlatformAdmin(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return false;

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
  });
  if (!userRes.ok) return false;

  const user = await userRes.json();
  if (!user?.id) return false;

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=platform_role`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
        accept: "application/json",
      },
    }
  );
  if (!profileRes.ok) return false;

  const rows = await profileRes.json();
  return Array.isArray(rows) && rows[0]?.platform_role === "platform_admin";
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendTeamInvite(payload) {
  const to = String(payload.to || "").trim().toLowerCase();
  const collaboratorName = String(payload.collaborator_name || "").trim().slice(0, 120);
  const roleName = String(payload.role_name || "Colaborador NEXO").trim().slice(0, 120);
  const inviteUrl = String(payload.invite_url || "").trim();
  const inviteId = String(payload.invite_id || "invite").trim().slice(0, 120);

  if (!validEmail(to)) throw new Error("Invalid recipient email");
  if (!inviteUrl.startsWith("https://")) throw new Error("Invalid invite URL");
  if (!RESEND_API_KEY) throw new Error("Mailer not configured");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": `nexo-team-invite/${inviteId}`,
    },
    body: JSON.stringify({
      from: "NEXO by Juan Visbal <equipo@nexobyjv.online>",
      to: [to],
      subject: "Has sido invitado al equipo NEXO",
      template: {
        id: TEMPLATE_ID,
        variables: {
          COLLABORATOR_NAME: collaboratorName || "Colaborador",
          ROLE_NAME: roleName || "Colaborador NEXO",
          INVITE_URL: inviteUrl,
        },
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Resend delivery failed");
  }
  return data;
}


function emailSafe(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function cleanPdf(value) {
  return String(value ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ").replace(/([\\()])/g, "\\$1").slice(0, 105);
}

function invoicePdf(invoice, organizationName) {
  const fmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  const total = "$ " + fmt.format(Number(invoice.amount_cop || 0)) + " COP";
  const outstanding = ["pending", "overdue"].includes(invoice.status);
  const items = [
    ["NEXO", 21, 60, 760, true],
    ["by Juan Visbal", 11, 60, 740, false],
    ["CUENTA DE COBRO", 16, 60, 688, true],
    ["Numero: " + (invoice.invoice_number || ""), 11, 60, 662, false],
    ["Cliente: " + organizationName, 11, 60, 632, false],
    ["Concepto: " + (invoice.reference || "Servicios NEXO"), 11, 60, 610, false],
    ["Vencimiento: " + (invoice.due_date || ""), 11, 60, 588, false],
    ["Estado: " + (invoice.status || ""), 11, 60, 566, false],
    ["TOTAL: " + total, 16, 60, 518, true],
    [outstanding ? "El enlace seguro de pago Wompi se incluye en el correo." : "Documento registrado en NEXO.", 10, 60, 474, false],
    ["No constituye factura electronica DIAN.", 10, 60, 440, false],
    ["nexobyjv.online | Medellin, Colombia", 9, 60, 80, false],
  ];
  const content = items.map(([value, size, x, y, bold]) =>
    "BT /" + (bold ? "F2" : "F1") + " " + size +
    " Tf 0.08 0.16 0.29 rg 1 0 0 1 " + x + " " + y +
    " Tm (" + cleanPdf(value) + ") Tj ET"
  ).join("\n") + "\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Length " + Buffer.byteLength(content, "latin1") + " >>\nstream\n" + content + "endstream",
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(document, "latin1"));
    document += (i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n";
  }
  const xref = Buffer.byteLength(document, "latin1");
  document += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  document += offsets.slice(1).map((position) => String(position).padStart(10, "0") + " 00000 n \n").join("");
  document += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(document, "latin1").toString("base64");
}

async function billingRow(token, table, query, columns) {
  const url = new URL(SUPABASE_URL + "/rest/v1/" + table);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("select", columns);
  const response = await fetch(url, {
    headers: {
      authorization: "Bearer " + token,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      accept: "application/json",
    },
  });
  if (!response.ok) throw new Error("No se pudo consultar la informacion de facturacion.");
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function setInvoiceEmailStatus(token, invoiceId, fields) {
  const url = SUPABASE_URL + "/rest/v1/client_invoices?id=eq." + encodeURIComponent(invoiceId);
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      authorization: "Bearer " + token,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("El proveedor acepto el correo, pero no fue posible registrar el envio.");
}

function approvedWompiUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.wompi.co" ? url.href : "";
  } catch { return ""; }
}

async function sendInvoiceEmail(token, payload) {
  const invoiceId = String(payload.invoice_id || "").trim();
  const resend = payload.resend === true;
  if (!/^[a-f0-9-]{36}$/i.test(invoiceId)) {
    return { status: 400, body: { error: "Identificador de cuenta de cobro no valido." } };
  }
  const invoice = await billingRow(token, "client_invoices", { id: "eq." + invoiceId }, "*");
  if (!invoice) return { status: 404, body: { error: "Cuenta de cobro no encontrada." } };
  if (invoice.archived_at) return { status: 409, body: { error: "No se puede enviar por email una prueba archivada." } };
  if (["cancelled", "waived"].includes(invoice.status)) {
    return { status: 409, body: { error: "No se envia una cuenta anulada o exonerada." } };
  }
  if (invoice.email_status === "sent" && !resend) {
    return { status: 200, body: { ok: true, already_sent: true } };
  }
  const orgId = String(invoice.organization_id);
  const [organization, commercial, settings] = await Promise.all([
    billingRow(token, "organizations", { id: "eq." + orgId }, "name"),
    billingRow(token, "organization_commercials", { organization_id: "eq." + orgId }, "billing_email,billing_contact_name"),
    billingRow(token, "organization_settings", { organization_id: "eq." + orgId }, "allow_billing_emails,notification_email"),
  ]);
  if (settings?.allow_billing_emails === false || invoice.email_status === "disabled") {
    return { status: 403, body: { error: "El cliente tiene los correos de facturacion desactivados." } };
  }
  const to = String(commercial?.billing_email || settings?.notification_email || "").trim().toLowerCase();
  if (!validEmail(to)) {
    return { status: 422, body: { error: "Configura un correo de facturacion valido para este cliente antes de enviar." } };
  }
  if (!RESEND_API_KEY) {
    return { status: 503, body: { error: "El servicio de correo no tiene configurado Resend." } };
  }
  const number = String(invoice.invoice_number || invoice.id);
  const fmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
  const amount = fmt.format(Number(invoice.amount_cop || 0));
  const org = organization?.name || "Cliente NEXO";
  const payUrl = ["pending", "overdue"].includes(invoice.status) ? approvedWompiUrl(invoice.payment_url) : "";
  const payBlock = payUrl
    ? '<p style="margin:24px 0"><a href="' + emailSafe(payUrl) + '" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#0c2240;color:white;text-decoration:none;font-weight:700">Pagar de forma segura con Wompi</a></p>'
    : "";
  const html = '<div style="max-width:600px;margin:auto;font-family:Arial,sans-serif;color:#152c4d;line-height:1.65">' +
    '<div style="padding:26px;background:#0c2240;color:#fff;border-radius:14px 14px 0 0"><strong style="font-size:26px">NEXO</strong><br><span>by Juan Visbal · Facturacion</span></div>' +
    '<div style="padding:28px;border:1px solid #e1e9f2;border-top:0;border-radius:0 0 14px 14px">' +
    '<p>Hola' + (commercial?.billing_contact_name ? ", " + emailSafe(commercial.billing_contact_name) : "") + '.</p>' +
    '<p>Compartimos la <strong>cuenta de cobro ' + emailSafe(number) + '</strong> correspondiente a ' + emailSafe(org) + '.</p>' +
    '<p><strong>Concepto:</strong> ' + emailSafe(invoice.reference || "Servicios NEXO") + '<br>' +
    '<strong>Valor:</strong> ' + emailSafe(amount) + '<br><strong>Vencimiento:</strong> ' +
    emailSafe(invoice.due_date || "—") + '<br><strong>Estado:</strong> ' + emailSafe(invoice.status) + '</p>' +
    payBlock + '<p>Adjuntamos el documento PDF para tus registros.</p>' +
    '<p style="font-size:12px;color:#728098">Este documento es una cuenta de cobro y no constituye factura electronica DIAN.</p>' +
    '<p>Gracias por confiar en NEXO.<br>NEXO by Juan Visbal</p></div></div>';
  const idempotencyKey = "nexo-invoice/" + invoice.id + (resend ? "/resend/" + Date.now() : "/initial");
  const filename = "NEXO_Cuenta_de_Cobro_" + number.replace(/[^A-Za-z0-9_-]/g, "_") + ".pdf";
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: "Bearer " + RESEND_API_KEY,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({
        from: "NEXO Facturacion <facturacion@nexobyjv.online>",
        reply_to: "nexobyjuanvisbal@gmail.com",
        to: [to],
        subject: "NEXO | Cuenta de cobro " + number,
        html,
        attachments: [{ filename, content: invoicePdf(invoice, org) }],
      }),
    });
  } catch (err) {
    try { await setInvoiceEmailStatus(token, invoiceId, { email_status: "failed", email_error: "Proveedor de correo no disponible." }); } catch {}
    throw err;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = String(data?.message || data?.error || "El correo no pudo enviarse.").slice(0, 250);
    try { await setInvoiceEmailStatus(token, invoiceId, { email_status: "failed", email_error: msg }); } catch {}
    return { status: 502, body: { error: msg } };
  }
  await setInvoiceEmailStatus(token, invoiceId, {
    email_status: "sent", email_sent_at: new Date().toISOString(), email_error: null,
  });
  return { status: 200, body: { ok: true, recipient: to, email_id: data?.id || null } };
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";

  if (req.method === "OPTIONS") {
    const headers = {
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "cache-control": "no-store",
    };
    if (allowedOrigins.has(origin)) {
      headers["access-control-allow-origin"] = origin;
      headers["vary"] = "Origin";
    }
    res.writeHead(204, headers);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { ok: true, service: "nexo-mailer", billing_email_endpoint: true, version: "2026-10-15-invoice" }, origin);
  }

  if (req.method !== "POST" || !["/v1/team-invite", "/v1/invoice-email"].includes(req.url)) {
    return json(res, 404, { error: "Not found" }, origin);
  }

  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!(await isPlatformAdmin(token))) {
      return json(res, 403, { error: "Not authorized" }, origin);
    }

    const body = await readBody(req);
    if (req.url === "/v1/invoice-email") {
      const result = await sendInvoiceEmail(token, body);
      return json(res, result.status, result.body, origin);
    }
    const email = await sendTeamInvite(body);
    return json(res, 200, { ok: true, email_id: email?.id || null }, origin);
  } catch (error) {
    console.error("NEXO_MAILER_ERROR", error?.message || "Unknown error");
    return json(res, 500, { error: error?.message || "Email delivery failed" }, origin);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXO mailer listening on ${PORT}`);
});
