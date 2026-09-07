require("dotenv").config();
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const tables = [
  "organizations",
  "users",
  "organization_members",
  "teams",
  "team_members",
  "projects",
  "project_members",
  "invitations",
  "sprints",
  "requirements",
  "backlog",
  "tasks",
  "ai_predictions",
  "activity_logs",
  "notifications",
  "budget_line_items",
  "contracts",
  "approvals",
  "risks",
  "change_requests",
  "milestones",
  "folders",
  "documents",
  "user_preferences",
];

async function main() {
  try {
    await client.connect();

    console.log("\nCURRENT ROW COUNTS:\n");

    for (const table of tables) {
      const result = await client.query(
        `SELECT COUNT(*) AS count FROM "${table}"`
      );

      console.log(`${table}: ${result.rows[0].count}`);
    }

    await client.end();
  } catch (error) {
    console.error("CHECK FAILED:", error.message);
    process.exit(1);
  }
}

main();