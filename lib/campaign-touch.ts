/** Nome sugerido do template UTILITY alternativo, derivado do nome do toque. */
export function utilityAltName(templateName: string): string {
  return templateName ? `${templateName}_util` : "";
}
