import { NextResponse } from "next/server";
import { getAllRequirements } from "../../../repositories/requirement.repository";

export async function GET() {
  try {
    const requirements = await getAllRequirements();

    return NextResponse.json({
      success: true,
      data: requirements,
    });
  } catch (error) {
    console.error("GET /api/requirements failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch requirements",
      },
      { status: 500 }
    );
  }
}