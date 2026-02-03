import type { Workbook, XlsxReadOptions } from "exceljs";

declare module "exceljs" {
  interface Xlsx {
    load(
      buffer: Uint8Array,
      options?: Partial<XlsxReadOptions>,
    ): Promise<Workbook>;
  }
}
