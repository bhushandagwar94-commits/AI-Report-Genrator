import React from "react";
import type { ReportImage } from "../types";
import { safeValue } from "../utils/formatting";

export default function ImageBlock({ image }: { image?: ReportImage }) {
  const source = image?.src || image?.url || image?.filename;

  if (!source) {
    return <div className="image-required">Image required</div>;
  }

  return (
    <figure className="image-block">
      <img src={String(source)} alt={safeValue(image?.caption)} />
      <figcaption>{safeValue(image?.caption)}</figcaption>
    </figure>
  );
}
