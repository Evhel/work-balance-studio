import assert from "node:assert/strict";
import StyledXLSX from "xlsx-js-style";
import { readExcelRows } from "../src/lib/excel-reader.ts";

const workbook = StyledXLSX.utils.book_new();
const sheet = StyledXLSX.utils.aoa_to_sheet([
  ["Табель АРВ сентябрь 2026"],
  [],
  ["ФИО", 1, 2],
  ["Тестовый сотрудник", 8, "Н"],
]);
sheet.A1.s = { font: { bold: true }, fill: { fgColor: { rgb: "E7DCF5" } } };
StyledXLSX.utils.book_append_sheet(workbook, sheet, "Сентябрь 2026");

const bytes = StyledXLSX.write(workbook, { type: "array", bookType: "xlsx" });
const file = new File([bytes], "АРВ_Шаблон_2026_сентябрь.xlsx");
const parsed = await readExcelRows(file);

assert.equal(parsed.length, 1);
assert.equal(parsed[0].name, "Сентябрь 2026");
assert.deepEqual(parsed[0].rows[2].slice(0, 3), ["ФИО", "1", "2"]);
assert.deepEqual(parsed[0].rows[3].slice(0, 3), ["Тестовый сотрудник", "8", "Н"]);

await assert.rejects(() => readExcelRows(new File([bytes], "табель.txt")), /только файлы Excel/);

const tooWideWorkbook = StyledXLSX.utils.book_new();
const tooWideSheet = StyledXLSX.utils.aoa_to_sheet([["данные"]]);
tooWideSheet["!ref"] = `A1:${StyledXLSX.utils.encode_col(500)}1`;
StyledXLSX.utils.book_append_sheet(tooWideWorkbook, tooWideSheet, "Лист");
const tooWideBytes = StyledXLSX.write(tooWideWorkbook, { type: "array", bookType: "xlsx" });
await assert.rejects(
  () => readExcelRows(new File([tooWideBytes], "слишком-широкий.xlsx")),
  /больше 500 столбцов/,
);

console.log("Excel import compatibility and limits: OK");
