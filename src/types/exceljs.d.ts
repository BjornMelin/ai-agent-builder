import type { Workbook, XlsxReadOptions } from "exceljs";

declare module "exceljs" {
  /**
   * Adds buffer-based workbook loading to the ExcelJS Xlsx interface.
   */
  interface Xlsx {
    /**
     * Loads a workbook from a buffer.
     *
     * `@param` buffer - The buffer containing workbook data.
     * `@param` options - Optional configuration for reading the workbook.
     * `@returns` A promise that resolves to the loaded Workbook.
     */
    load(
      buffer: Uint8Array,
      options?: Partial<XlsxReadOptions>,
    ): Promise<Workbook>;
  }
}
