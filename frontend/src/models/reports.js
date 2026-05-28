import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const GENERATION_MAX_WAIT_MS = Number(
  import.meta.env.VITE_GENERATION_MAX_WAIT_MS || 420000
);

const Reports = {
  // ── Admin ────────────────────────────────────────────────────────────────────

  getTemplates: async () => {
    return await fetch(`${API_BASE}/reports/templates`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { templates: [] };
      });
  },

  createTemplate: async (data) => {
    return await fetch(`${API_BASE}/reports/templates`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { error: e.message };
      });
  },

  updateTemplate: async (id, data) => {
    return await fetch(`${API_BASE}/reports/templates/${id}`, {
      method: "PUT",
      headers: baseHeaders(),
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { error: e.message };
      });
  },

  deleteTemplate: async (id) => {
    return await fetch(`${API_BASE}/reports/templates/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  // ── Public ───────────────────────────────────────────────────────────────────

  /**
   * Fetch public-facing templates (id, slug, name only — no admin data).
   */
  getPublicTemplates: async () => {
    return await fetch(`${API_BASE}/reports/public-templates`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { templates: [] };
      });
  },

  /**
   * Upload a single file for report generation.
   * @param {FormData} formData - must contain a "file" field
   */
  uploadFile: async (formData) => {
    const headers = baseHeaders();
    delete headers["Content-Type"]; // let browser set multipart boundary

    return await fetch(`${API_BASE}/reports/upload`, {
      method: "POST",
      headers,
      body: formData,
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },

  validateUpload: async (formData) => {
    const headers = baseHeaders();
    delete headers["Content-Type"];

    return await fetch(`${API_BASE}/reports/validate-upload`, {
      method: "POST",
      headers,
      body: formData,
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, files: [], error: e.message };
      });
  },

  /**
   * Generate a report using the NEW structured public payload.
   *
   * Payload sent to the server:
   * {
   *   "template_id": "seetech-ea-001",          // slug or numeric id
   *   "public_form": {
   *     "client_name":    "",
   *     "facility_name":  "",
   *     "location":       "",
   *     "audit_period":   "",
   *     "report_date":    "",
   *     "contact_person": "",
   *     "output_format":  "pdf"                  // pdf | docx | both
   *   },
   *   "uploaded_files": [{ location, filename, token_count_estimate }],
   *   "generation_mode": "public",
   *   "status": "submitted"
   * }
   *
   * @param {Object} params
   * @param {string|number} params.templateId   - slug (e.g. "seetech-ea-001") or DB numeric id
   * @param {Object}        params.publicForm   - form field values (camelCase from the React state)
   * @param {Array}         params.uploadedFiles
   */
  generateReport: async ({ templateId, publicForm = {}, uploadedFiles = [] }) => {
    const payload = {
      template_id: templateId,
      public_form: {
        client_name: publicForm.clientName || "",
        facility_name: publicForm.facilityName || "",
        location: publicForm.location || "",
        audit_period: publicForm.auditPeriod || "",
        report_date: publicForm.reportDate || "",
        contact_person: publicForm.contactPerson || "",
        output_format: publicForm.outputFormat || "pdf",
      },
      uploaded_files: uploadedFiles,
      generation_mode: "public",
      status: "submitted",
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GENERATION_MAX_WAIT_MS);

    return await fetch(`${API_BASE}/reports/generate`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return {
          error:
            e.name === "AbortError"
              ? "Generation is taking too long. Please check backend logs or retry."
              : e.message,
        };
      })
      .finally(() => clearTimeout(timeoutId));
  },

  enhanceReportWithAi: async (id) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GENERATION_MAX_WAIT_MS);

    return await fetch(`${API_BASE}/reports/${id}/enhance-ai`, {
      method: "POST",
      headers: baseHeaders(),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return {
          error:
            e.name === "AbortError"
              ? "AI enhancement is taking too long. Your deterministic report is still available."
              : e.message,
        };
      })
      .finally(() => clearTimeout(timeoutId));
  },

  recheckQC: async (id) => {
    return await fetch(`${API_BASE}/reports/${id}/qc/recheck`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { error: e.message };
      });
  },

  downloadDocx: async (id, allowDraft = false) => {
    return await fetch(`${API_BASE}/reports/${id}/export/docx${allowDraft ? '?allowDraft=true' : ''}`, {
      method: "POST",
      headers: baseHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const contentType = res.headers.get("content-type") || "";
          let text = "";
          let errJson = null;
          try {
            if (contentType.includes("application/json")) {
              errJson = await res.json();
            } else {
              text = await res.text();
              errJson = JSON.parse(text);
            }
          } catch (e) {
            if (!text) {
              try {
                text = await res.text();
              } catch (_) { }
            }
            return { success: false, error: text || "Export failed." };
          }
          return {
            success: false,
            error: errJson.error || "Export failed.",
            qcFailed: errJson.qcFailed,
            qcErrors: errJson.qcErrors,
            qcWarnings: errJson.qcWarnings,
            summary: errJson.summary,
            raw: errJson
          };
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition");
        let filename = "SEE-Tech_Detailed_Energy_Audit_Report.docx";
        if (disposition && disposition.indexOf("filename=") !== -1) {
          filename = disposition.split("filename=")[1].replace(/"/g, "");
        }
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return { success: true };
      })
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message, raw: e };
      });
  },

  // ── Shared ───────────────────────────────────────────────────────────────────

  getReports: async () => {
    return await fetch(`${API_BASE}/reports/list`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { reports: [] };
      });
  },

  getReport: async (id) => {
    return await fetch(`${API_BASE}/reports/${id}`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { error: e.message };
      });
  },

  deleteReport: async (id) => {
    return await fetch(`${API_BASE}/reports/${id}`, {
      method: "DELETE",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { success: false, error: e.message };
      });
  },
};

export default Reports;
