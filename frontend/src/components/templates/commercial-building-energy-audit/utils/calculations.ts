import type { CommercialBuildingProject, PrimitiveValue } from "../types";

function parseNumber(value: PrimitiveValue): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function calculateTotalInvestment(projects: CommercialBuildingProject[] = []): number {
  return projects.reduce((total, project) => total + parseNumber(project.estimatedInvestment), 0);
}

export function calculateTotalAnnualSavings(projects: CommercialBuildingProject[] = []): number {
  return projects.reduce((total, project) => total + parseNumber(project.expectedAnnualCostSaving), 0);
}

export function calculateTotalEnergySavings(projects: CommercialBuildingProject[] = []): number {
  return projects.reduce((total, project) => total + parseNumber(project.expectedEnergySaving), 0);
}

export function calculateWeightedPayback(projects: CommercialBuildingProject[] = []): number {
  const totalSavings = calculateTotalAnnualSavings(projects);
  if (!totalSavings) return 0;
  return calculateTotalInvestment(projects) / totalSavings;
}

export function calculateCO2Reduction(kwhSaving: PrimitiveValue, emissionFactor: PrimitiveValue = 0.82): number {
  return parseNumber(kwhSaving) * parseNumber(emissionFactor) / 1000;
}
