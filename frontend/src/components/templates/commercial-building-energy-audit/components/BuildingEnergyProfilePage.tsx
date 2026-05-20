import React from "react";
import type { CommercialBuildingEnergyAuditData, ReportTableRow } from "../types";
import { safeValue } from "../utils/formatting";
import ReportTable from "./ReportTable";
import SectionHeader from "./SectionHeader";

function objectRows(data: Record<string, unknown>, labels: Record<string, string>): ReportTableRow[] {
  return Object.entries(labels).map(([key, label]) => ({
    parameter: label,
    value: safeValue(data?.[key] as never),
  }));
}

export default function BuildingEnergyProfilePage({ data }: { data: CommercialBuildingEnergyAuditData }) {
  return (
    <section className="report-page">
      <h1>Chapter 2: Plant / Building Details and Energy Profile</h1>

      <SectionHeader number="2.1" title="General Information" />
      <ReportTable
        columns={[
          { key: "parameter", header: "Parameter" },
          { key: "value", header: "Details" },
        ]}
        rows={objectRows(data.buildingProfile as never, {
          facilityName: "Facility Name",
          address: "Address",
          typeOfBuilding: "Type of Building",
          yearOfConstruction: "Year of Construction",
          totalBuiltUpArea: "Total Built-up Area",
          conditionedArea: "Conditioned Area",
          numberOfFloors: "Number of Floors",
          occupancyType: "Occupancy Type",
          averageOccupancy: "Average Occupancy",
          operatingDaysAndHours: "Operating Days and Hours",
          facilityContactPerson: "Facility Contact Person",
          auditDate: "Audit Date",
          seeTechAuditTeam: "SEE-Tech Audit Team",
        })}
      />

      <SectionHeader number="2.2" title="Building Operation Details" />
      <ReportTable
        columns={[
          { key: "areaFunction", header: "Area / Function" },
          { key: "operatingHours", header: "Operating Hours" },
          { key: "remarks", header: "Remarks" },
        ]}
        rows={data.buildingOperationDetails as ReportTableRow[]}
      />

      <SectionHeader number="2.3" title="Utility and Energy Sources" />
      <ReportTable
        columns={[
          { key: "energySource", header: "Energy Source" },
          { key: "use", header: "Use" },
          { key: "annualConsumption", header: "Annual Consumption" },
          { key: "annualCost", header: "Annual Cost (₹/year)" },
        ]}
        rows={data.utilityAndEnergySources as ReportTableRow[]}
      />

      <SectionHeader number="2.4" title="Electrical Supply Details" />
      <ReportTable
        columns={[
          { key: "parameter", header: "Parameter" },
          { key: "value", header: "Details" },
        ]}
        rows={objectRows(data.electricalSupplyDetails as never, {
          supplyVoltage: "Supply Voltage",
          consumerNumber: "Consumer Number",
          tariffCategory: "Tariff Category",
          contractDemand: "Contract Demand",
          connectedLoad: "Connected Load",
          transformerCapacity: "Transformer Capacity",
          dgCapacity: "DG Capacity",
          apfcPanelCapacity: "APFC Panel Capacity",
          averagePowerFactor: "Average Power Factor",
          billingType: "Billing Type",
          averageElectricityTariff: "Average Electricity Tariff",
        })}
      />

      <SectionHeader number="2.5" title="Electricity Consumption and Billing Summary" />
      <ReportTable
        columns={[
          { key: "month", header: "Month" },
          { key: "kwh", header: "kWh" },
          { key: "kvah", header: "kVAh" },
          { key: "maximumDemandKva", header: "Maximum Demand (kVA)" },
          { key: "pf", header: "PF" },
          { key: "billAmount", header: "Bill Amount (₹)" },
          { key: "specificConsumption", header: "Specific Consumption" },
        ]}
        rows={data.electricityBillingSummary as ReportTableRow[]}
      />

      <SectionHeader number="2.6" title="Specific Energy Consumption Benchmark" />
      <ReportTable
        columns={[
          { key: "parameter", header: "Parameter" },
          { key: "value", header: "Details" },
        ]}
        rows={objectRows(data.specificEnergyBenchmark as never, {
          buildingType: "Building Type",
          recommendedBenchmark: "Recommended Benchmark",
          annualElectricityConsumption: "Annual Electricity Consumption",
          builtUpArea: "Built-up Area",
          conditionedArea: "Conditioned Area",
          annualOccupancy: "Annual Occupancy",
          specificEnergyConsumption: "Specific Energy Consumption",
          referenceBenchmark: "Reference Benchmark",
          improvementPotential: "Improvement Potential",
        })}
      />

      <SectionHeader number="2.7" title="Major Energy-Consuming Systems" />
      <ReportTable
        columns={[
          { key: "system", header: "System" },
          { key: "majorEquipment", header: "Major Equipment" },
          { key: "estimatedShare", header: "Estimated Share" },
          { key: "remarks", header: "Remarks" },
        ]}
        rows={data.majorEnergyConsumingSystems as ReportTableRow[]}
      />

      <SectionHeader number="2.8" title="HVAC System Details" />
      <ReportTable
        columns={[
          { key: "equipment", header: "Equipment" },
          { key: "capacity", header: "Capacity" },
          { key: "quantity", header: "Quantity" },
          { key: "connectedLoad", header: "Connected Load" },
          { key: "controlSystem", header: "Control System" },
          { key: "remarks", header: "Remarks" },
        ]}
        rows={data.hvacSystemDetails as ReportTableRow[]}
      />

      <SectionHeader number="2.9" title="Lighting System Details" />
      <ReportTable
        columns={[
          { key: "area", header: "Area" },
          { key: "existingFixture", header: "Existing Fixture" },
          { key: "wattage", header: "Wattage" },
          { key: "quantity", header: "Quantity" },
          { key: "operatingHours", header: "Operating Hours" },
          { key: "controlType", header: "Control Type" },
        ]}
        rows={data.lightingSystemDetails as ReportTableRow[]}
      />

      <SectionHeader number="2.10" title="Pumps and Motors" />
      <ReportTable
        columns={[
          { key: "pumpOrMotor", header: "Pump / Motor" },
          { key: "application", header: "Application" },
          { key: "ratingKw", header: "Rating (kW)" },
          { key: "quantity", header: "Quantity" },
          { key: "operatingHours", header: "Operating Hours" },
          { key: "controlMethod", header: "Control Method" },
          { key: "remarks", header: "Remarks" },
        ]}
        rows={data.pumpsAndMotors as ReportTableRow[]}
      />

      <SectionHeader number="2.11" title="Building Automation and Controls" />
      <ReportTable
        columns={[
          { key: "system", header: "System" },
          { key: "existingControl", header: "Existing Control" },
          { key: "observation", header: "Observation" },
          { key: "savingOpportunity", header: "Saving Opportunity" },
        ]}
        rows={data.buildingAutomationControls as ReportTableRow[]}
      />

      <SectionHeader number="2.12" title="Summary of Audit Observations" />
      <ReportTable
        columns={[
          { key: "srNo", header: "Sr. No." },
          { key: "observation", header: "Observation" },
          { key: "impact", header: "Impact" },
          { key: "recommendedProject", header: "Recommended Project" },
        ]}
        rows={data.auditObservations as ReportTableRow[]}
      />
    </section>
  );
}
