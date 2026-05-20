import { DATA_REQUIRED, safeValue } from "./formatting";
import type { CommercialBuildingEnergyAuditData } from "../types";

export function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "number" && Number.isNaN(value)) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

export function requiredText(value: unknown): string {
  return isMissing(value) ? DATA_REQUIRED : safeValue(value as never);
}

export function ensureAuditData(data: CommercialBuildingEnergyAuditData): CommercialBuildingEnergyAuditData {
  return {
    ...data,
    projects: Array.isArray(data.projects) ? data.projects : [],
    buildingOperationDetails: Array.isArray(data.buildingOperationDetails) ? data.buildingOperationDetails : [],
    utilityAndEnergySources: Array.isArray(data.utilityAndEnergySources) ? data.utilityAndEnergySources : [],
    electricityBillingSummary: Array.isArray(data.electricityBillingSummary) ? data.electricityBillingSummary : [],
    majorEnergyConsumingSystems: Array.isArray(data.majorEnergyConsumingSystems) ? data.majorEnergyConsumingSystems : [],
    hvacSystemDetails: Array.isArray(data.hvacSystemDetails) ? data.hvacSystemDetails : [],
    lightingSystemDetails: Array.isArray(data.lightingSystemDetails) ? data.lightingSystemDetails : [],
    pumpsAndMotors: Array.isArray(data.pumpsAndMotors) ? data.pumpsAndMotors : [],
    buildingAutomationControls: Array.isArray(data.buildingAutomationControls) ? data.buildingAutomationControls : [],
    auditObservations: Array.isArray(data.auditObservations) ? data.auditObservations : [],
  };
}
