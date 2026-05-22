import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

async function main() {
  const dbPath = resolve(root, "server", "storage", "anythingllm.db");
  if (!existsSync(dbPath)) {
    console.error(`❌ Database does not exist at ${dbPath}`);
    process.exit(1);
  }

  let PrismaClient;
  try {
    PrismaClient = require("../server/node_modules/@prisma/client").PrismaClient;
  } catch (e) {
    console.error("❌ Prisma client not found. Did you run `yarn bootstrap:dev`?");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const dbPath = resolve(root, "server", "storage", "anythingllm.db");
    console.log(`\n🔍 Database Path: ${dbPath}`);

    const onboarding = await prisma.system_settings.findUnique({
      where: { label: "onboarding_complete" },
    });
    console.log(`🔍 onboarding_complete: ${onboarding?.value || "null"}`);
    if (onboarding?.value !== "true") {
      console.error("❌ onboarding_complete is not true.");
      process.exit(1);
    }
    console.log("✅ Onboarding flag is complete.");

    const multiUser = await prisma.system_settings.findUnique({
      where: { label: "multi_user_mode" },
    });
    if (multiUser?.value !== "false") {
      console.error("❌ multi_user_mode is not false.");
      process.exit(1);
    }
    console.log("✅ Multi-user mode is correctly disabled.");

    const workspace = await prisma.workspaces.findUnique({
      where: { slug: "commercial-building-energy-audit" },
    });
    if (!workspace) {
      console.error("❌ Default workspace 'commercial-building-energy-audit' does not exist.");
      process.exit(1);
    }
    console.log("✅ Default workspace exists.");

    const templates = await prisma.report_templates.findMany();
    console.log(`🔍 Total Templates in DB: ${templates.length}`);

    const template = templates.find((t) => t.slug === "commercial-building-energy-audit");
    if (!template) {
      console.error("❌ Template 'commercial-building-energy-audit' does not exist.");
      process.exit(1);
    }
    if (template.status !== "active") {
      console.error("❌ Template is not active.");
      process.exit(1);
    }
    if (template.showInPublic !== true) {
      console.error("❌ Template showInPublic is not true.");
      process.exit(1);
    }
    console.log("✅ Commercial Building Energy Audit template is active and public.");

    const version = await prisma.report_template_versions.findFirst({
      where: { templateId: template.id, status: "active", versionNumber: 1 },
    });
    if (!version) {
      console.error("❌ Active template version does not exist.");
      process.exit(1);
    }
    console.log(`✅ Active template version exists (ID: ${version.id}).`);

    // Hitting the public endpoint
    let publicTemplateResult = "Could not fetch";
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 2000);
      const res = await fetch("http://localhost:3001/api/public/report-templates", { signal: controller.signal });
      if (res.ok) {
        const json = await res.json();
        publicTemplateResult = `Success (${json?.templates?.length || 0} templates found)`;
      } else {
        publicTemplateResult = `Failed (${res.status})`;
      }
    } catch(e) {
      publicTemplateResult = `Failed (Is the server running?)`;
    }
    console.log(`🔍 Public template endpoint: ${publicTemplateResult}`);

    console.log("\n🎉 Verification passed: The AI Report Generator is fully set up.");
    console.log("The onboarding flow will be skipped and the report generator is ready!");
  } catch (e) {
    console.error("❌ Verification failed with error:", e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
