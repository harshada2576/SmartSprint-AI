import { NextResponse } from "next/server";
import { getAllSprints } from "../../../repositories/sprint.repository";

export async function GET() {
  try {
    const sprints = await getAllSprints();

    return NextResponse.json({
      success: true,
      data: sprints,
    });
  } catch (error) {
    console.error("GET /api/sprints failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch sprints",
      },
      { status: 500 }
    );
  }
}