const http = require("http");

const data = JSON.stringify({
  template_id: "commercial-building-energy-audit",
  uploaded_files: [],
  public_form: {}
});

const req = http.request(
  "http://localhost:3001/api/reports/generate",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data),
    },
  },
  (res) => {
    let body = "";
    res.on("data", (chunk) => (body += chunk));
    res.on("end", () => {
      console.log("Status:", res.statusCode);
      console.log("Body:", body);
    });
  }
);

req.on("error", (e) => {
  console.error("Error:", e.message);
});

req.write(data);
req.end();
