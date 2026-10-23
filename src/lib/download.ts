// Descarga en el navegador de un fichero generado en cliente (AI-082): CSV de las
// tablas y el .xlsx que devuelve el servidor. Antes, el mismo bloque blob → <a> → click
// estaba copiado en cada página.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, filename: string, type = "text/csv;charset=utf-8"): void {
  downloadBlob(new Blob([content], { type }), filename);
}
