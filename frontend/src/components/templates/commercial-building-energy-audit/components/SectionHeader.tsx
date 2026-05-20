import React from "react";

export default function SectionHeader({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="section-header">
      <span className="section-number">{number}</span>
      <h2>{title}</h2>
    </div>
  );
}
