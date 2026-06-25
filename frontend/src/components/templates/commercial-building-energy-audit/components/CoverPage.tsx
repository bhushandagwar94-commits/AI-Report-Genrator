import React from "react";
import type { ReportInfo } from "../types";
import { safeValue } from "../utils/formatting";
import { cleanMetadataValue } from "../../../../../utils/cleanMetadata";

export default function CoverPage({ data }: { data: ReportInfo }) {
  return (
    <section className="report-page cover-page">
      <div className="brand-bar">
        <div>
          <p className="eyebrow">SEE-Tech Solutions</p>
          <h1>{safeValue(data.reportTitle) || "Commercial Building Energy Audit Report"}</h1>
        </div>
        <div className="brand-mark">SEE</div>
      </div>

      <div className="cover-content">
        <p className="cover-label">Commercial Building Energy Audit</p>
        <h2>{cleanMetadataValue("Client Name", data.clientName)}</h2>
        <p>{cleanMetadataValue("Building Type", data.buildingType)}</p>
        <p>{cleanMetadataValue("Location", data.location)}</p>
      </div>

      <div className="cover-grid">
        <div>
          <span>Audit Period</span>
          <strong>{cleanMetadataValue("Audit Period", data.auditPeriod)}</strong>
        </div>
        <div>
          <span>Report Date</span>
          <strong>{cleanMetadataValue("Report Date", data.reportDate)}</strong>
        </div>
        <div>
          <span>Prepared By</span>
          <strong>{cleanMetadataValue("Prepared By", data.preparedBy)}</strong>
        </div>
        <div>
          <span>Document Version</span>
          <strong>{cleanMetadataValue("Document Version", data.documentVersion)}</strong>
        </div>
      </div>
    </section>
  );
}
