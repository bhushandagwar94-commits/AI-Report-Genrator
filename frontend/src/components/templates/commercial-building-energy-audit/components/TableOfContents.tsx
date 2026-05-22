import React from "react";
import type { CommercialBuildingProject } from "../types";
import { safeValue } from "../utils/formatting";

const executiveSections = [
  "Purpose of the Energy Audit",
  "Overall Energy Saving Potential",
  "Summary of Identified Energy Saving Projects",
  "Project Grouping",
  "Category-Wise Financial Summary",
  "Recommended Implementation Priority",
  "Key Observations",
  "Conclusion and Way Forward",
];

const profileSections = [
  "General Information",
  "Building Operation Details",
  "Utility and Energy Sources",
  "Electrical Supply Details",
  "Electricity Consumption and Billing Summary",
  "Specific Energy Consumption Benchmark",
  "Major Energy-Consuming Systems",
  "HVAC System Details",
  "Lighting System Details",
  "Pumps and Motors",
  "Building Automation and Controls",
  "Summary of Audit Observations",
];

const projectSections = [
  "Project Summary",
  "Existing System Description",
  "Baseline Data and Measurements",
  "Problem / Gap Identified",
  "Proposed Project",
  "Key Activities for Implementation",
  "Rationale for Energy Saving",
  "Energy Saving Calculation",
  "Carbon Footprint",
  "Key Metrics",
  "Technical Specifications",
  "Schematic / Conceptual Framework",
  "Implementation Duration",
  "Precautions / Aspects to be Taken Care Of",
  "Measurement and Verification Plan",
  "Benefits Other Than Energy Saving",
  "Case Studies",
  "Conclusion",
];

export default function TableOfContents({ projects = [] }: { projects: CommercialBuildingProject[] }) {
  return (
    <section className="report-page toc-page">
      <h1>Table of Contents</h1>
      <ol className="toc-list">
        <li>Cover Page</li>
        <li>Table of Contents</li>
        <li>
          Chapter 1: Executive Summary
          <ol>
            {executiveSections.map((section, index) => (
              <li key={section}>1.{index + 1} {section}</li>
            ))}
          </ol>
        </li>
        <li>
          Chapter 2: Plant / Building Details and Energy Profile
          <ol>
            {profileSections.map((section, index) => (
              <li key={section}>2.{index + 1} {section}</li>
            ))}
          </ol>
        </li>
        {projects.map((project, index) => {
          const chapterNumber = index + 3;
          return (
            <li key={String(project.projectNo || index)}>
              Chapter {chapterNumber}: {safeValue(project.projectTitle)}
              <ol>
                {projectSections.map((section, sectionIndex) => (
                  <li key={section}>{chapterNumber}.{sectionIndex + 1} {section}</li>
                ))}
              </ol>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
