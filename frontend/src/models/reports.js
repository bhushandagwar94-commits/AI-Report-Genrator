import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

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
        client_name:    publicForm.clientName    || "",
        facility_name:  publicForm.facilityName  || "",
        location:       publicForm.location      || "",
        audit_period:   publicForm.auditPeriod   || "",
        report_date:    publicForm.reportDate    || "",
        contact_person: publicForm.contactPerson || "",
        output_format:  publicForm.outputFormat  || "pdf",
      },
      uploaded_files:  uploadedFiles,
      generation_mode: "public",
      status:          "submitted",
    };

    return await fetch(`${API_BASE}/reports/generate`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return { error: e.message };
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
