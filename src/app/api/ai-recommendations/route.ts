import { NextResponse } from "next/server";
import { getAllAIRecommendations } from "../../../repositories/ai-recommendation.repository";

export async function GET() {
  try {
    const recommendations = await getAllAIRecommendations();

    return NextResponse.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    console.error(
      "GET /api/ai-recommendations failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch AI recommendations",
      },
      { status: 500 }
    );
  }
}