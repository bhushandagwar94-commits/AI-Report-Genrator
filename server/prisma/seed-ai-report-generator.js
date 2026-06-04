const { PrismaClient } = require("@prisma/client");
const {
  ensureAiReportGeneratorSeeded,
} = require("../utils/aiReportGeneratorSeed");

const prisma = new PrismaClient();

async function main() {
  const { template, version } = await ensureAiReportGeneratorSeeded(prisma);
  console.log("AI Report Generator seed complete.");
  console.log(`Template: ${template.name} (${template.slug})`);
  console.log(`Active version: ${version.versionNumber}`);
}

main()
  .catch((error) => {
    console.error("AI Report Generator seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
