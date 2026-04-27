/** Escape HTML to prevent XSS in email body */
export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip newlines for safe use in email subjects */
export function stripNewlines(str: string): string {
  return String(str).replace(/[\r\n]/g, '');
}
