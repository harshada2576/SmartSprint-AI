const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. Check your .env file in the project root."
  );
}

const seedDir = path.join(process.cwd(), "seed");

function loadJson(fileName) {
  const filePath = path.join(seedDir, fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing seed file: ${fileName}`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (!Array.isArray(data)) {
    throw new Error(`${fileName} must contain a JSON array.`);
  }

  return data;
}

function quoteIdentifier(identifier) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function insertRows(client, tableName, rows, options = {}) {
  if (!rows.length) {
    console.log(`✓ ${tableName}: 0 rows`);
    return;
  }

  const columns = Object.keys(rows[0]);

  const values = [];
  const placeholders = [];

  rows.forEach((row, rowIndex) => {
    const rowPlaceholders = [];

    columns.forEach((column, columnIndex) => {
      const parameterIndex =
        rowIndex * columns.length + columnIndex + 1;

      rowPlaceholders.push(`$${parameterIndex}`);

      let value = row[column];

      if (
        options.nullColumns &&
        options.nullColumns.includes(column)
      ) {
        value = null;
      }

      values.push(value);
    });

    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  });

  const query = `
    INSERT INTO ${quoteIdentifier(tableName)}
    (${columns.map(quoteIdentifier).join(", ")})
    VALUES ${placeholders.join(", ")}
    ON CONFLICT DO NOTHING
  `;

  await client.query(query, values);

  console.log(`✓ ${tableName}: ${rows.length} rows processed`);
}

async function updateRequirementDependencies(client, rows) {
  const dependencyRows = rows.filter(
    (row) => row.dependency_id
  );

  if (!dependencyRows.length) {
    return;
  }

  for (const row of dependencyRows) {
    await client.query(
      `
      UPDATE "requirements"
      SET "dependency_id" = $1
      WHERE "id" = $2
      `,
      [row.dependency_id, row.id]
    );
  }

  console.log(
    `✓ requirements: ${dependencyRows.length} dependencies restored`
  );
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log("\n========================================");
    console.log(" SmartSprint AI - Database Seed");
    console.log("========================================\n");

    console.log("Connecting to Supabase PostgreSQL...");

    await client.connect();

    console.log("✓ Database connection successful\n");

    await client.query("BEGIN");

    /*
     * IMPORTANT:
     * Insert tables in dependency-safe order.
     *
     * The JSON files use the same snake_case column names
     * as the PostgreSQL tables.
     */

    const organizations = loadJson("organizations.json");
    const users = loadJson("users.json");
    const organizationMembers = loadJson(
      "organization_members.json"
    );
    const teams = loadJson("teams.json");
    const teamMembers = loadJson("team_members.json");
    const projects = loadJson("projects.json");
    const projectMembers = loadJson(
      "project_members.json"
    );
    const invitations = loadJson("invitations.json");
    const sprints = loadJson("sprints.json");
    const requirements = loadJson("requirements.json");
    const backlog = loadJson("backlog.json");
    const tasks = loadJson("tasks.json");
    const aiPredictions = loadJson(
      "ai_predictions.json"
    );
    const activityLogs = loadJson(
      "activity_logs.json"
    );
    const notifications = loadJson(
      "notifications.json"
    );
    const budgetLineItems = loadJson(
      "budget_line_items.json"
    );
    const contracts = loadJson("contracts.json");
    const approvals = loadJson("approvals.json");
    const risks = loadJson("risks.json");
    const changeRequests = loadJson(
      "change_requests.json"
    );
    const milestones = loadJson("milestones.json");
    const folders = loadJson("folders.json");
    const documents = loadJson("documents.json");
    const userPreferences = loadJson(
      "user_preferences.json"
    );

    console.log("Seed files loaded successfully.\n");

    // -------------------------------------------------
    // 1. ORGANIZATIONS
    // -------------------------------------------------

    await insertRows(
      client,
      "organizations",
      organizations
    );

    // -------------------------------------------------
    // 2. USERS
    // -------------------------------------------------

    await insertRows(client, "users", users);

    // -------------------------------------------------
    // 3. ORGANIZATION MEMBERS
    // -------------------------------------------------

    await insertRows(
      client,
      "organization_members",
      organizationMembers
    );

    // -------------------------------------------------
    // 4. TEAMS
    // -------------------------------------------------

    await insertRows(client, "teams", teams);

    // -------------------------------------------------
    // 5. TEAM MEMBERS
    // -------------------------------------------------

    await insertRows(
      client,
      "team_members",
      teamMembers
    );

    // -------------------------------------------------
    // 6. PROJECTS
    // -------------------------------------------------

    await insertRows(client, "projects", projects);

    // -------------------------------------------------
    // 7. PROJECT MEMBERS
    // -------------------------------------------------

    await insertRows(
      client,
      "project_members",
      projectMembers
    );

    // -------------------------------------------------
    // 8. INVITATIONS
    // -------------------------------------------------

    await insertRows(
      client,
      "invitations",
      invitations
    );

    // -------------------------------------------------
    // 9. SPRINTS
    // -------------------------------------------------

    await insertRows(client, "sprints", sprints);

    // -------------------------------------------------
    // 10. REQUIREMENTS
    //
    // dependency_id is a self-reference.
    // Insert requirements first with dependency_id
    // temporarily set to NULL, then restore it.
    // -------------------------------------------------

    await insertRows(
      client,
      "requirements",
      requirements,
      {
        nullColumns: ["dependency_id"],
      }
    );

    await updateRequirementDependencies(
      client,
      requirements
    );

    // -------------------------------------------------
    // 11. BACKLOG
    // -------------------------------------------------

    await insertRows(client, "backlog", backlog);

    // -------------------------------------------------
    // 12. TASKS
    // -------------------------------------------------

    await insertRows(client, "tasks", tasks);

    // -------------------------------------------------
    // 13. AI PREDICTIONS
    // -------------------------------------------------

    await insertRows(
      client,
      "ai_predictions",
      aiPredictions
    );

    // -------------------------------------------------
    // 14. ACTIVITY LOGS
    // -------------------------------------------------

    await insertRows(
      client,
      "activity_logs",
      activityLogs
    );

    // -------------------------------------------------
    // 15. NOTIFICATIONS
    // -------------------------------------------------

    await insertRows(
      client,
      "notifications",
      notifications
    );

    // -------------------------------------------------
    // 16. BUDGET LINE ITEMS
    // -------------------------------------------------

    await insertRows(
      client,
      "budget_line_items",
      budgetLineItems
    );

    // -------------------------------------------------
    // 17. CONTRACTS
    // -------------------------------------------------

    await insertRows(
      client,
      "contracts",
      contracts
    );

    // -------------------------------------------------
    // 18. APPROVALS
    // -------------------------------------------------

    await insertRows(
      client,
      "approvals",
      approvals
    );

    // -------------------------------------------------
    // 19. RISKS
    // -------------------------------------------------

    await insertRows(client, "risks", risks);

    // -------------------------------------------------
    // 20. CHANGE REQUESTS
    // -------------------------------------------------

    await insertRows(
      client,
      "change_requests",
      changeRequests
    );

    // -------------------------------------------------
    // 21. MILESTONES
    // -------------------------------------------------

    await insertRows(
      client,
      "milestones",
      milestones
    );

    // -------------------------------------------------
    // 22. FOLDERS
    // -------------------------------------------------

    await insertRows(client, "folders", folders);

    // -------------------------------------------------
    // 23. DOCUMENTS
    // -------------------------------------------------

    await insertRows(
      client,
      "documents",
      documents
    );

    // -------------------------------------------------
    // 24. USER PREFERENCES
    // -------------------------------------------------

    await insertRows(
      client,
      "user_preferences",
      userPreferences
    );

    await client.query("COMMIT");

    console.log("\n========================================");
    console.log(" SEED COMPLETED SUCCESSFULLY");
    console.log("========================================");
    console.log("\nAll seed data has been committed to Supabase.");
    console.log("You can now verify the tables in Supabase.\n");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      // Ignore rollback errors.
    }

    console.error("\n========================================");
    console.error(" SEED FAILED");
    console.error("========================================\n");
    console.error(error.message);
    console.error("\nNo partial seed was committed.");
    console.error("Fix the reported issue and run the seed again.\n");

    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();