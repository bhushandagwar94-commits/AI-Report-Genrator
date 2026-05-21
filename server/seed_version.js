const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  let template = await prisma.report_templates.findFirst({
    where: { slug: 'commercial-building-energy-audit' }
  });
  
  if (!template) {
    template = await prisma.report_templates.create({
      data: {
        slug: 'commercial-building-energy-audit',
        name: 'Detailed Energy Audit Report',
        prompt: 'Default system prompt for this template',
        status: 'active',
        showInPublic: true,
        publicBadge: 'AVAILABLE'
      }
    });
    console.log('Created missing template ID:', template.id);
  } else {
    console.log('Found template ID:', template.id);
  }
  
  const existingVersion = await prisma.report_template_versions.findFirst({
    where: { templateId: template.id }
  });
  
  if (existingVersion) {
    console.log('Version already exists:', existingVersion.id);
  } else {
    const version = await prisma.report_template_versions.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        status: 'active',
        templateName: 'Detailed Energy Audit Report',
        componentPath: 'frontend/src/components/templates/commercial-building-energy-audit/CommercialBuildingEnergyAuditTemplate.tsx',
        changeNote: 'Initial active version created during Phase 2 migration'
      }
    });
    console.log('Created version:', version.id);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
