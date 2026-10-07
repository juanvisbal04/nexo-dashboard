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
    return json(res, 200, { ok: true, service: "nexo-mailer" }, origin);
  }

  if (req.method !== "POST" || req.url !== "/v1/team-invite") {
    return json(res, 404, { error: "Not found" }, origin);
  }

  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!(await isPlatformAdmin(token))) {
      return json(res, 403, { error: "Not authorized" }, origin);
    }

    const body = await readBody(req);
    const email = await sendTeamInvite(body);
    return json(res, 200, { ok: true, email_id: email?.id || null }, origin);
  } catch (error) {
    console.error("NEXO_MAILER_ERROR", error);
    return json(res, 500, { error: error?.message || "Email delivery failed" }, origin);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXO mailer listening on ${PORT}`);
});
