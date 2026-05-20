import React from "react";
import type { CommercialBuildingEnergyAuditData } from "./types";
import CoverPage from "./components/CoverPage";
import TableOfContents from "./components/TableOfContents";
import ExecutiveSummaryPage from "./components/ExecutiveSummaryPage";
import BuildingEnergyProfilePage from "./components/BuildingEnergyProfilePage";
import ProjectChapterPage from "./components/ProjectChapterPage";
import { ensureAuditData } from "./utils/validation";

export default function CommercialBuildingEnergyAuditTemplate({
  data,
}: {
  data: CommercialBuildingEnergyAuditData;
}) {
  const reportData = ensureAuditData(data);

  return (
    <div className="commercial-building-energy-audit-report">
      <style>{reportStyles}</style>
      <CoverPage data={reportData.reportInfo} />
      <div className="page-break" />
      <TableOfContents projects={reportData.projects} />
      <div className="page-break" />
      <ExecutiveSummaryPage data={reportData} />
      <div className="page-break" />
      <BuildingEnergyProfilePage data={reportData} />
      <div className="page-break" />
      {reportData.projects.map((project, index) => (
        <React.Fragment key={String(project.projectNo || index)}>
          <ProjectChapterPage
            project={project}
            chapterNumber={index + 3}
          />
          <div className="page-break" />
        </React.Fragment>
      ))}
    </div>
  );
}

const reportStyles = `
  @page {
    size: A4;
    margin: 14mm;
  }

  .commercial-building-energy-audit-report {
    --see-blue: #075985;
    --see-blue-dark: #0f3f64;
    --see-green: #0f9f6e;
    --see-green-soft: #e7f7f1;
    --see-blue-soft: #e7f2f8;
    --see-line: #c8d7df;
    --see-text: #173141;
    --see-muted: #5d7280;
    background: #eef3f6;
    color: var(--see-text);
    font-family: "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif;
    line-height: 1.45;
  }

  .commercial-building-energy-audit-report * {
    box-sizing: border-box;
  }

  .report-page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 18mm 17mm;
    background: #ffffff;
    position: relative;
    box-shadow: 0 12px 34px rgba(15, 63, 100, 0.12);
    overflow: hidden;
  }

  .report-page::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 7mm;
    background: linear-gradient(90deg, var(--see-blue), var(--see-green));
  }

  .report-page::after {
    content: "SEE-Tech Solutions";
    position: absolute;
    bottom: 8mm;
    right: 17mm;
    color: #7d929f;
    font-size: 9px;
    letter-spacing: 0.3px;
  }

  .page-break {
    break-after: page;
    page-break-after: always;
    height: 18px;
  }

  h1 {
    color: var(--see-blue-dark);
    font-size: 24px;
    line-height: 1.2;
    margin: 0 0 18px;
    padding-top: 2mm;
    letter-spacing: 0;
  }

  h2, h3, p {
    margin-top: 0;
  }

  p {
    font-size: 12px;
    color: var(--see-text);
  }

  .cover-page {
    background:
      linear-gradient(135deg, rgba(7, 89, 133, 0.94), rgba(15, 159, 110, 0.86)),
      #075985;
    color: #ffffff;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .cover-page::before,
  .cover-page::after {
    display: none;
  }

  .brand-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
  }

  .brand-bar h1 {
    color: #ffffff;
    font-size: 34px;
    max-width: 560px;
    margin: 6px 0 0;
    padding: 0;
  }

  .eyebrow,
  .cover-label {
    color: rgba(255,255,255,0.78);
    text-transform: uppercase;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.8px;
  }

  .brand-mark {
    width: 72px;
    height: 72px;
    border: 2px solid rgba(255,255,255,0.45);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 21px;
    font-weight: 900;
  }

  .cover-content h2 {
    color: #ffffff;
    font-size: 30px;
    margin: 8px 0;
  }

  .cover-content p {
    color: rgba(255,255,255,0.88);
    font-size: 15px;
    margin-bottom: 6px;
  }

  .cover-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .cover-grid div {
    border: 1px solid rgba(255,255,255,0.28);
    border-radius: 8px;
    padding: 14px;
    background: rgba(255,255,255,0.1);
  }

  .cover-grid span,
  .metric-card span {
    display: block;
    font-size: 10px;
    color: rgba(255,255,255,0.68);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 800;
  }

  .cover-grid strong {
    display: block;
    margin-top: 5px;
    color: #ffffff;
    font-size: 14px;
  }

  .toc-page h1 {
    margin-bottom: 26px;
  }

  .toc-list,
  .toc-list ol {
    color: var(--see-text);
    font-size: 12px;
  }

  .toc-list > li {
    margin-bottom: 10px;
    font-weight: 800;
  }

  .toc-list ol {
    margin-top: 6px;
    color: var(--see-muted);
    font-weight: 600;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    border-bottom: 1px solid var(--see-line);
    margin: 18px 0 10px;
    padding-bottom: 5px;
    break-after: avoid;
  }

  .section-header h2 {
    margin: 0;
    color: var(--see-blue-dark);
    font-size: 15px;
    letter-spacing: 0;
  }

  .section-number {
    background: var(--see-blue);
    color: #ffffff;
    min-width: 44px;
    height: 24px;
    border-radius: 4px;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    font-size: 11px;
    font-weight: 900;
  }

  .report-table-wrap {
    margin: 10px 0 15px;
    break-inside: avoid;
  }

  .table-caption {
    color: var(--see-blue-dark);
    font-size: 11px;
    font-weight: 800;
    margin-bottom: 5px;
  }

  .report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
    color: var(--see-text);
  }

  .report-table th {
    background: var(--see-blue);
    color: #ffffff;
    border: 1px solid var(--see-blue);
    padding: 7px 8px;
    text-align: left;
    font-weight: 800;
  }

  .report-table td {
    border: 1px solid var(--see-line);
    padding: 7px 8px;
    vertical-align: top;
  }

  .report-table tbody tr:nth-child(even) td {
    background: #f5f9fb;
  }

  .align-center {
    text-align: center !important;
  }

  .align-right {
    text-align: right !important;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 10px 0 16px;
  }

  .metric-card {
    border: 1px solid var(--see-line);
    border-left: 4px solid var(--see-green);
    border-radius: 8px;
    padding: 10px;
    background: linear-gradient(180deg, #ffffff, #f6fbf9);
    break-inside: avoid;
  }

  .metric-card span {
    color: var(--see-muted);
    font-size: 9px;
  }

  .metric-card strong {
    display: block;
    margin-top: 4px;
    color: var(--see-blue-dark);
    font-size: 13px;
  }

  .metric-card small {
    font-size: 10px;
    color: var(--see-muted);
  }

  .report-list {
    margin: 6px 0 14px 18px;
    padding: 0;
    font-size: 12px;
  }

  .report-list li {
    margin-bottom: 5px;
  }

  .image-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 10px 0 16px;
  }

  .image-block,
  .image-required {
    border: 1px solid var(--see-line);
    border-radius: 8px;
    background: #f5f9fb;
    min-height: 118px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    break-inside: avoid;
  }

  .image-block {
    flex-direction: column;
    margin: 0;
  }

  .image-block img {
    max-width: 100%;
    max-height: 190px;
    object-fit: contain;
    display: block;
  }

  .image-block figcaption {
    width: 100%;
    padding: 7px 9px;
    color: var(--see-muted);
    font-size: 10px;
    background: #ffffff;
    border-top: 1px solid var(--see-line);
  }

  .image-required {
    color: var(--see-muted);
    font-size: 12px;
    font-weight: 800;
  }

  @media print {
    .commercial-building-energy-audit-report {
      background: #ffffff;
    }

    .report-page {
      box-shadow: none;
      margin: 0;
      width: auto;
      min-height: auto;
      page-break-after: always;
    }

    .page-break {
      height: 0;
    }
  }
`;
