// Same-origin web gateway for the YBM API. Native clients call the API directly.
const UPSTREAM = "https://test.yourbuildmart.com/api";

async function forward(request: Request): Promise<Response> {
  const path = new URL(request.url).searchParams.get("path");
  const allowed = path === "/auth/login" || path === "/auth/otp/request" ||
    /^\/(picker-app|packer-app)\/(profile|change-password|stats|orders\/assigned)$/.test(path || "") ||
    /^\/picker-app\/available-packers$/.test(path || "") ||
    /^\/packer-app\/riders\/available$/.test(path || "") ||
    /^\/(picker-app|packer-app)\/orders\/\d+(?:\/(scan|items|assign-packer|assign-rider))?$/.test(path || "");
  if (!path || !allowed) {
    return Response.json({ success: false, message: "Invalid API path" }, { status: 400 });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const upstream = await fetch(`${UPSTREAM}${path}`, {
      method: request.method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(request.headers.get("authorization") ? { Authorization: request.headers.get("authorization")! } : {}),
      },
      body: request.method === "GET" ? undefined : await request.text(),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      return Response.json({ success: false, message: `YBM API did not respond within 30 seconds for ${path}. Please retry.` }, { status: 504 });
    }
    const reason = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause
      ? String(error.cause.code) : "NETWORK_ERROR";
    return Response.json({ success: false, message: `YBM API is unreachable from the web server (${reason}). Check server network or DNS.` }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
