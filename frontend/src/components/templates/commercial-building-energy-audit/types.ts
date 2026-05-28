export type PrimitiveValue = string | number | boolean | null | undefined;

export interface ReportInfo {
  reportTitle: PrimitiveValue;
  clientName: PrimitiveValue;
  buildingType: PrimitiveValue;
  location: PrimitiveValue;
  auditPeriod: PrimitiveValue;
  reportDate: PrimitiveValue;
  preparedBy: PrimitiveValue;
  documentVersion: PrimitiveValue;
}

export interface ExecutiveSummary {
  purposeText: PrimitiveValue;
  totalAnnualElectricityConsumption: PrimitiveValue;
  annualElectricityCost: PrimitiveValue;
  averageTariff: PrimitiveValue;
  numberOfProjects: PrimitiveValue;
  totalEnergySavingPotential: PrimitiveValue;
  totalAnnualCostSavingPotential: PrimitiveValue;
  totalEstimatedInvestment: PrimitiveValue;
  simplePaybackPeriod: PrimitiveValue;
  co2ReductionPotential: PrimitiveValue;
  keyObservations: PrimitiveValue[] | PrimitiveValue;
  conclusionAndWayForward: PrimitiveValue;
}

export interface BuildingProfile {
  facilityName: PrimitiveValue;
  address: PrimitiveValue;
  typeOfBuilding: PrimitiveValue;
  yearOfConstruction: PrimitiveValue;
  totalBuiltUpArea: PrimitiveValue;
  conditionedArea: PrimitiveValue;
  numberOfFloors: PrimitiveValue;
  occupancyType: PrimitiveValue;
  averageOccupancy: PrimitiveValue;
  operatingDaysAndHours: PrimitiveValue;
  facilityContactPerson: PrimitiveValue;
  auditDate: PrimitiveValue;
  seeTechAuditTeam: PrimitiveValue;
}

export interface BuildingOperationDetail {
  areaFunction: PrimitiveValue;
  operatingHours: PrimitiveValue;
  remarks: PrimitiveValue;
}

export interface UtilityAndEnergySource {
  energySource: PrimitiveValue;
  use: PrimitiveValue;
  annualConsumption: PrimitiveValue;
  annualCost: PrimitiveValue;
}

export interface ElectricalSupplyDetails {
  supplyVoltage: PrimitiveValue;
  consumerNumber: PrimitiveValue;
  tariffCategory: PrimitiveValue;
  contractDemand: PrimitiveValue;
  connectedLoad: PrimitiveValue;
  transformerCapacity: PrimitiveValue;
  dgCapacity: PrimitiveValue;
  apfcPanelCapacity: PrimitiveValue;
  averagePowerFactor: PrimitiveValue;
  billingType: PrimitiveValue;
  averageElectricityTariff: PrimitiveValue;
}

export interface ElectricityBillingSummaryItem {
  month: PrimitiveValue;
  kwh: PrimitiveValue;
  kvah: PrimitiveValue;
  maximumDemandKva: PrimitiveValue;
  pf: PrimitiveValue;
  billAmount: PrimitiveValue;
  specificConsumption: PrimitiveValue;
}

export interface SpecificEnergyBenchmark {
  buildingType: PrimitiveValue;
  recommendedBenchmark: PrimitiveValue;
  annualElectricityConsumption: PrimitiveValue;
  builtUpArea: PrimitiveValue;
  conditionedArea: PrimitiveValue;
  annualOccupancy: PrimitiveValue;
  specificEnergyConsumption: PrimitiveValue;
  referenceBenchmark: PrimitiveValue;
  improvementPotential: PrimitiveValue;
}

export interface MajorEnergyConsumingSystem {
  system: PrimitiveValue;
  majorEquipment: PrimitiveValue;
  estimatedShare: PrimitiveValue;
  remarks: PrimitiveValue;
}

export interface HvacSystemDetail {
  equipment: PrimitiveValue;
  capacity: PrimitiveValue;
  quantity: PrimitiveValue;
  connectedLoad: PrimitiveValue;
  controlSystem: PrimitiveValue;
  remarks: PrimitiveValue;
}

export interface LightingSystemDetail {
  area: PrimitiveValue;
  existingFixture: PrimitiveValue;
  wattage: PrimitiveValue;
  quantity: PrimitiveValue;
  operatingHours: PrimitiveValue;
  controlType: PrimitiveValue;
}

export interface PumpAndMotor {
  pumpOrMotor: PrimitiveValue;
  application: PrimitiveValue;
  ratingKw: PrimitiveValue;
  quantity: PrimitiveValue;
  operatingHours: PrimitiveValue;
  controlMethod: PrimitiveValue;
  remarks: PrimitiveValue;
}

export interface BuildingAutomationControl {
  system: PrimitiveValue;
  existingControl: PrimitiveValue;
  observation: PrimitiveValue;
  savingOpportunity: PrimitiveValue;
}

export interface AuditObservation {
  srNo: PrimitiveValue;
  observation: PrimitiveValue;
  impact: PrimitiveValue;
  recommendedProject: PrimitiveValue;
}

export interface ReportImage {
  filename?: PrimitiveValue;
  src?: PrimitiveValue;
  url?: PrimitiveValue;
  caption?: PrimitiveValue;
}

export type ReportTableRow = Record<string, PrimitiveValue>;
export type FlexibleTableData = ReportTableRow[] | Record<string, PrimitiveValue> | PrimitiveValue;

export interface CommercialBuildingProject {
  projectNo: PrimitiveValue;
  projectTitle: PrimitiveValue;
  system: PrimitiveValue;
  location: PrimitiveValue;
  equipmentCovered: PrimitiveValue;
  existingOperatingCondition: PrimitiveValue;
  proposedIntervention: PrimitiveValue;
  expectedEnergySaving: PrimitiveValue;
  expectedAnnualCostSaving: PrimitiveValue;
  estimatedInvestment: PrimitiveValue;
  simplePaybackPeriod: PrimitiveValue;
  implementationDuration: PrimitiveValue;
  implementationPriority: PrimitiveValue;
  existingSystemDescription: PrimitiveValue;
  baselineData: FlexibleTableData;
  measurementData: FlexibleTableData;
  problemGapIdentified: PrimitiveValue;
  typicalGapTable: FlexibleTableData;
  proposedProjectDescription: PrimitiveValue;
  scopeOfWork: PrimitiveValue[] | PrimitiveValue;
  keyActivities: PrimitiveValue[] | PrimitiveValue;
  rationaleForEnergySaving: PrimitiveValue;
  savingRationaleTable: FlexibleTableData;
  energySavingCalculation: FlexibleTableData;
  keyMetrics: FlexibleTableData;
  technicalSpecifications: FlexibleTableData;
  schematicFramework: PrimitiveValue;
  implementationDurationTable: FlexibleTableData;
  precautions: PrimitiveValue[] | PrimitiveValue;
  aspectsToBeTakenCareOf?: PrimitiveValue[] | PrimitiveValue;
  measurementVerificationPlan: PrimitiveValue[] | PrimitiveValue;
  benefitsOtherThanEnergySaving: PrimitiveValue[] | PrimitiveValue;
  projectConclusion: PrimitiveValue;
  carbonFootprint?: {
    annualEnergySaving?: PrimitiveValue;
    emissionFactor?: PrimitiveValue;
    estimatedCO2Reduction?: PrimitiveValue;
    calculationBasis?: PrimitiveValue;
    remarks?: PrimitiveValue;
  };
  caseStudies?: {
    title?: PrimitiveValue;
    clientType?: PrimitiveValue;
    system?: PrimitiveValue;
    implementedMeasure?: PrimitiveValue;
    result?: PrimitiveValue;
    relevance?: PrimitiveValue;
  }[];
  finalConclusion?: PrimitiveValue;
  images: ReportImage[];
}

export interface CommercialBuildingEnergyAuditData {
  reportInfo: ReportInfo;
  executiveSummary: ExecutiveSummary;
  buildingProfile: BuildingProfile;
  buildingOperationDetails: BuildingOperationDetail[];
  utilityAndEnergySources: UtilityAndEnergySource[];
  electricalSupplyDetails: ElectricalSupplyDetails;
  electricityBillingSummary: ElectricityBillingSummaryItem[];
  specificEnergyBenchmark: SpecificEnergyBenchmark;
  majorEnergyConsumingSystems: MajorEnergyConsumingSystem[];
  hvacSystemDetails: HvacSystemDetail[];
  lightingSystemDetails: LightingSystemDetail[];
  pumpsAndMotors: PumpAndMotor[];
  buildingAutomationControls: BuildingAutomationControl[];
  auditObservations: AuditObservation[];
  projects: CommercialBuildingProject[];
}

export interface ReportTableColumn {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
}
