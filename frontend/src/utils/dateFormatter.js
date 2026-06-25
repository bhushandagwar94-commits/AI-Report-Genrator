export function formatReportDate(value) {
  if (!value || (typeof value !== "string" && !(value instanceof Date))) return "To be confirmed";
  
  const strValue = String(value).trim();
  if (strValue.toLowerCase() === "data required" || strValue === "") return "To be confirmed";
  if (strValue.toLowerCase() === "to be confirmed") return "To be confirmed";
  
  try {
    let d = new Date(value);
    
    if (isNaN(d.getTime())) {
      const parts = strValue.split(/[\/\-]/);
      if (parts.length === 3) {
        d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
    }
    
    if (isNaN(d.getTime())) return strValue;
    
    const months = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    
    return `${day} ${month} ${year}`;
  } catch (e) {
    return strValue;
  }
}
