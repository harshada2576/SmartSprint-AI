import { NextResponse } from "next/server";
import { getAllProjects } from "../../../repositories/project.repository";

export async function GET() {
  try {
    const projects = await getAllProjects();

    return NextResponse.json({
      success: true,
      data: projects,
    });
  } catch (error) {
    console.error("GET /api/projects failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch projects",
      },
      { status: 500 }
    );
  }
}