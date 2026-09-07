import { NextResponse } from "next/server";
import { getAllTasks } from "../../../repositories/task.repository";

export async function GET() {
  try {
    const tasks = await getAllTasks();

    return NextResponse.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error("GET /api/tasks failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch tasks",
      },
      { status: 500 }
    );
  }
}