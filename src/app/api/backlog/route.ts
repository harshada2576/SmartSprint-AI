import { NextResponse } from "next/server";
import { getAllBacklogItems } from "../../../repositories/backlog.repository";

export async function GET() {
  try {
    const backlogItems = await getAllBacklogItems();

    return NextResponse.json({
      success: true,
      data: backlogItems,
    });
  } catch (error) {
    console.error("GET /api/backlog failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch backlog",
      },
      { status: 500 }
    );
  }
}