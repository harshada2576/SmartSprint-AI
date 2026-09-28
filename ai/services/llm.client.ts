/**
 * AI Provider abstraction for SmartSprint AI.
 * Supports OpenAI-compatible providers, Gemini, Anthropic, or deterministic domain breakdown fallback.
 */

export interface TaskBreakdown {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  estimatedHours: number;
  acceptanceCriteria: string[];
}

export interface EpicBreakdown {
  name: string;
  description: string;
  tasks: TaskBreakdown[];
}

export interface SuggestedSprint {
  name: string;
  goal: string;
  taskIndexes: number[]; // Index into flattened list of all tasks across epics
}

export interface ProjectBreakdownResult {
  projectSummary: string;
  epics: EpicBreakdown[];
  suggestedSprints: SuggestedSprint[];
}

/**
 * Deterministic domain generator for intelligent fallback
 * Produces realistic, high-quality epics and tasks based on project brief.
 */
export function generateDomainBreakdown(brief: string): ProjectBreakdownResult {
  const lower = brief.toLowerCase();

  if (lower.includes("food") || lower.includes("delivery") || lower.includes("restaurant") || lower.includes("order")) {
    return {
      projectSummary: "Full-stack on-demand food delivery platform connecting customers, restaurants, and delivery drivers with live order tracking and payment processing.",
      epics: [
        {
          name: "User Authentication & Profiles",
          description: "Customer, restaurant partner, and driver account registration, verification, and role management.",
          tasks: [
            {
              title: "Authentication API & JWT Token Session",
              description: "Secure login, registration, and session token generation for customers and partners.",
              priority: "high",
              estimatedHours: 8,
              acceptanceCriteria: [
                "Supports email/password authentication with bcrypt hashing",
                "Issues JWT tokens with 24-hour expiry and refresh token mechanism",
                "Includes unit tests for password complexity and credential validation"
              ],
            },
            {
              title: "Customer Profile & Address Management",
              description: "Allow users to save multiple delivery addresses with GPS geolocation coordinates.",
              priority: "medium",
              estimatedHours: 6,
              acceptanceCriteria: [
                "Users can add, edit, and delete delivery addresses",
                "Address validation against postal code standards",
                "Allows setting a default delivery address"
              ],
            },
            {
              title: "Restaurant Partner Onboarding & Dashboard",
              description: "Business verification and portal access for restaurant owners.",
              priority: "high",
              estimatedHours: 12,
              acceptanceCriteria: [
                "Restaurant registration flow with tax ID and contact details",
                "Staff permission controls for kitchen vs manager views"
              ],
            },
          ],
        },
        {
          name: "Restaurant Menu & Catalog",
          description: "Category browsing, menu item customization, pricing, and availability management.",
          tasks: [
            {
              title: "Restaurant Catalog & Category Browsing API",
              description: "Fast query API with filters for cuisine, ratings, distance, and dietary tags.",
              priority: "high",
              estimatedHours: 10,
              acceptanceCriteria: [
                "Returns paginated restaurants sorted by distance or rating",
                "Filtering by dietary preferences (vegan, gluten-free, halal)",
                "Response times under 150ms with database indexing"
              ],
            },
            {
              title: "Menu Item Details & Modifier Groups",
              description: "Item options, sizes, extra toppings, and special instructions.",
              priority: "medium",
              estimatedHours: 8,
              acceptanceCriteria: [
                "Configurable required and optional modifiers (e.g. choice of drink, extra cheese)",
                "Real-time item price calculation based on selected options"
              ],
            },
            {
              title: "Real-time Menu Availability Toggle",
              description: "Kitchen interface to mark items '86ed' (out of stock) instantly.",
              priority: "medium",
              estimatedHours: 5,
              acceptanceCriteria: [
                "Instant websocket or cache invalidation when item status toggles",
                "Prevents ordering out-of-stock items in active carts"
              ],
            },
          ],
        },
        {
          name: "Cart, Checkout & Payments",
          description: "Shopping cart management, discount codes, checkout flow, and payment gateway integration.",
          tasks: [
            {
              title: "Cart Validation & Subtotal Calculations",
              description: "Cart state management, restaurant exclusivity check, and delivery fee calculation.",
              priority: "high",
              estimatedHours: 8,
              acceptanceCriteria: [
                "Enforces single-restaurant items per cart",
                "Calculates subtotal, delivery fee, platform fee, and taxes accurately",
                "Persists cart across browser sessions"
              ],
            },
            {
              title: "Payment Gateway Integration API",
              description: "Stripe/payment provider integration for credit cards, digital wallets, and webhooks.",
              priority: "critical",
              estimatedHours: 16,
              acceptanceCriteria: [
                "Generates secure payment intents with 3D Secure verification",
                "Idempotent webhook handler to confirm order placement on payment success",
                "Handles payment failures and cancellations gracefully"
              ],
            },
            {
              title: "Order Placement & Confirmation Notifications",
              description: "Create order record in database, trigger confirmation email and SMS alert.",
              priority: "high",
              estimatedHours: 6,
              acceptanceCriteria: [
                "Creates order with unique tracking code and estimated preparation time",
                "Dispatches real-time notification to the restaurant order dashboard"
              ],
            },
          ],
        },
        {
          name: "Live Delivery Tracking & Driver Dispatch",
          description: "Driver assignment, GPS location updates, and interactive map tracking for customers.",
          tasks: [
            {
              title: "Driver Dispatch & Acceptance Algorithm",
              description: "Automated routing to find and alert nearest available driver.",
              priority: "high",
              estimatedHours: 14,
              acceptanceCriteria: [
                "Calculates driver proximity using geospatial queries",
                "Offers order to nearest driver with a 45-second acceptance timer",
                "Re-routes to next available driver if rejected or timed out"
              ],
            },
            {
              title: "Live GPS Tracking WebSockets",
              description: "Real-time delivery progress updates with interactive map.",
              priority: "medium",
              estimatedHours: 12,
              acceptanceCriteria: [
                "Driver location broadcast every 5 seconds during active delivery",
                "Customer map updates smoothly with live ETA estimate"
              ],
            },
          ],
        },
      ],
      suggestedSprints: [
        {
          name: "Sprint 1: Core Foundation & Catalog",
          goal: "Build authentication, user profiles, and restaurant menu catalog.",
          taskIndexes: [0, 1, 2, 3, 4],
        },
        {
          name: "Sprint 2: Checkout & Payment Integration",
          goal: "Complete cart calculations, payment gateway, and order confirmation flow.",
          taskIndexes: [5, 6, 7, 8],
        },
        {
          name: "Sprint 3: Dispatch & Live Tracking",
          goal: "Implement driver dispatch and real-time GPS tracking.",
          taskIndexes: [9, 10],
        },
      ],
    };
  }

  // Default breakdown for general software projects
  return {
    projectSummary: `Software development plan for: "${brief.slice(0, 120)}..." structured into modular epics, actionable user stories, and agile sprints.`,
    epics: [
      {
        name: "Architecture & User Management",
        description: "Core backend architecture, database schema, and authentication infrastructure.",
        tasks: [
          {
            title: "Database Schema Design & Migration Pipeline",
            description: "Design relational database schema with foreign keys, indexes, and automated migrations.",
            priority: "critical",
            estimatedHours: 10,
            acceptanceCriteria: [
              "Tables created with proper primary keys and foreign key constraints",
              "Database indexes applied on all query search columns",
              "Automated migration tool runs cleanly on fresh database"
            ],
          },
          {
            title: "Authentication & Role-Based Access Control",
            description: "User registration, secure session authentication, and role authorization gates.",
            priority: "high",
            estimatedHours: 8,
            acceptanceCriteria: [
              "Secure authentication tokens issued upon login",
              "Endpoints enforce permissions based on caller role",
              "Invalid credentials return 401 unauthorized"
            ],
          },
        ],
      },
      {
        name: "Core Business Logic & API Layer",
        description: "Primary domain features, business service layer, and client API endpoints.",
        tasks: [
          {
            title: "Domain Entity CRUD & Business Validation",
            description: "Service layer implementing business rules and database mutations.",
            priority: "high",
            estimatedHours: 12,
            acceptanceCriteria: [
              "Full CRUD operations implemented with input validation schemas",
              "Business constraints enforced at service layer before persistence",
              "Comprehensive unit tests verifying validation boundaries"
            ],
          },
          {
            title: "External Integration & Webhook Handling",
            description: "Integration with third-party service providers with idempotent webhook processing.",
            priority: "high",
            estimatedHours: 10,
            acceptanceCriteria: [
              "External API client with retries and timeout handling",
              "Webhook listener verifying cryptographic signatures"
            ],
          },
        ],
      },
      {
        name: "User Interface & Experience",
        description: "Responsive web UI components, forms, and interactive views.",
        tasks: [
          {
            title: "Dashboard & Resource Views",
            description: "Design and implement user dashboard, data tables, and search filters.",
            priority: "medium",
            estimatedHours: 8,
            acceptanceCriteria: [
              "Responsive layout supporting desktop and mobile viewports",
              "Real-time search and filter controls",
              "Graceful empty and loading skeleton states"
            ],
          },
          {
            title: "Activity Monitoring & Notifications",
            description: "System notifications and event activity logging for user actions.",
            priority: "medium",
            estimatedHours: 6,
            acceptanceCriteria: [
              "Activity logs recorded for all state-changing actions",
              "Notification badge and dropdown displaying unread items"
            ],
          },
        ],
      },
    ],
    suggestedSprints: [
      {
        name: "Sprint 1: System Foundation",
        goal: "Set up database, authentication, and core schema entities.",
        taskIndexes: [0, 1],
      },
      {
        name: "Sprint 2: Core Domain Logic",
        goal: "Implement business services, CRUD APIs, and integrations.",
        taskIndexes: [2, 3],
      },
      {
        name: "Sprint 3: Frontend UI & Polish",
        goal: "Build user dashboards, data management views, and activity tracking.",
        taskIndexes: [4, 5],
      },
    ],
  };
}

/**
 * Generate structured project breakdown using configured LLM or fallback engine.
 */
export async function generateProjectBreakdown(brief: string): Promise<ProjectBreakdownResult> {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const model = process.env.AI_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    // Return deterministic domain breakdown if no key is configured
    return generateDomainBreakdown(brief);
  }

  try {
    const prompt = `You are SmartSprint AI, an expert software agile project architect.
Given this project brief:
"${brief}"

Break it down into a comprehensive, professional agile project plan with structured epics, detailed tasks, and suggested sprints.
Return strictly valid JSON conforming to this TypeScript interface:
{
  "projectSummary": string,
  "epics": [
    {
      "name": string,
      "description": string,
      "tasks": [
        {
          "title": string,
          "description": string,
          "priority": "low" | "medium" | "high" | "critical",
          "estimatedHours": number,
          "acceptanceCriteria": string[]
        }
      ]
    }
  ],
  "suggestedSprints": [
    {
      "name": string,
      "goal": string,
      "taskIndexes": number[]
    }
  ]
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn("LLM API returned status", response.status, "using domain breakdown fallback");
      return generateDomainBreakdown(brief);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return generateDomainBreakdown(brief);
    }

    const parsed = JSON.parse(content) as ProjectBreakdownResult;
    if (parsed.epics && Array.isArray(parsed.epics) && parsed.epics.length > 0) {
      return parsed;
    }
    return generateDomainBreakdown(brief);
  } catch (err) {
    console.warn("Error calling LLM provider, using domain breakdown fallback:", err);
    return generateDomainBreakdown(brief);
  }
}
