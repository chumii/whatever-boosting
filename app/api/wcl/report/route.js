import { wclQuery } from "@/lib/wcl-client";
import { REPORT_SUMMARY } from "@/lib/wcl-queries";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const code = new URL(request.url).searchParams.get("code")?.trim();

  if (!code) {
    return Response.json({ error: "Fehlender Parameter: code" }, { status: 400 });
  }

  // WCL report codes are alphanumeric, 16 chars
  if (!/^[A-Za-z0-9]{16}$/.test(code)) {
    return Response.json({ error: "Ungültige Report-ID (erwartet: 16 alphanumerische Zeichen)" }, { status: 400 });
  }

  try {
    const data = await wclQuery(REPORT_SUMMARY, { code });
    if (!data?.reportData?.report) {
      return Response.json({ error: "Report nicht gefunden" }, { status: 404 });
    }
    return Response.json(data);
  } catch (e) {
    console.error("[wcl/report]", e.message);
    return Response.json({ error: e.message }, { status: 502 });
  }
}
