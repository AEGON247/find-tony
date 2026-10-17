import { NextRequest, NextResponse } from "next/server";
import { isSydneyCoordinate } from "@/lib/geo";
import { savePlaceReport } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const reportReasons = ["not_a_place", "closed", "incorrect"] as const;

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "A JSON report body is required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const placeId = typeof input.placeId === "string" ? input.placeId.trim() : "";
  const reason = input.reason;
  const lat = input.lat;
  const lng = input.lng;

  if (!/^(alert|luma|osm|nominatim|foursquare|eventbrite)-[a-zA-Z0-9._:-]{1,180}$/.test(placeId)) {
    return NextResponse.json({ error: "A valid place ID is required." }, { status: 400 });
  }
  if (typeof reason !== "string" || !reportReasons.includes(reason as typeof reportReasons[number])) {
    return NextResponse.json({ error: "Choose a valid report reason." }, { status: 400 });
  }
  if ((lat === undefined) !== (lng === undefined) ||
    (lat !== undefined && (typeof lat !== "number" || typeof lng !== "number" || !isSydneyCoordinate(lat, lng)))) {
    return NextResponse.json({ error: "Report coordinates must be a valid Sydney location." }, { status: 400 });
  }

  const report = {
    id: `report-${crypto.randomUUID()}`,
    placeId,
    reason: reason as typeof reportReasons[number],
    reportedAt: new Date().toISOString(),
    ...(typeof lat === "number" && typeof lng === "number" ? { userCoordinates: [lat, lng] as [number, number] } : {}),
  };
  try {
    await savePlaceReport(report);
  } catch (error) {
    console.error("Place report could not be persisted.", error);
    return NextResponse.json({ error: "The report could not be saved. Try again shortly." }, { status: 500 });
  }
  return NextResponse.json({ accepted: true, reportId: report.id }, { status: 201 });
}
