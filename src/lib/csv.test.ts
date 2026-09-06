import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./csv";

describe("rowsToCsv", () => {
  it("joins headers and rows with CRLF", () => {
    expect(rowsToCsv(["Name", "Amount"], [["Acme", 100]])).toBe(
      "Name,Amount\r\nAcme,100\r\n",
    );
  });

  it("quotes a cell containing a comma", () => {
    expect(rowsToCsv(["Note"], [["hello, world"]])).toBe(
      'Note\r\n"hello, world"\r\n',
    );
  });

  it("quotes and doubles internal quotes", () => {
    expect(rowsToCsv(["Note"], [['she said "hi"']])).toBe(
      'Note\r\n"she said ""hi"""\r\n',
    );
  });

  it("quotes a cell containing a newline", () => {
    expect(rowsToCsv(["Note"], [["line1\nline2"]])).toBe(
      'Note\r\n"line1\nline2"\r\n',
    );
  });

  it("renders null as an empty cell", () => {
    expect(rowsToCsv(["A", "B"], [[null, "x"]])).toBe("A,B\r\n,x\r\n");
  });

  it("handles multiple rows", () => {
    expect(
      rowsToCsv(
        ["Name"],
        [["Alpha"], ["Beta"]],
      ),
    ).toBe("Name\r\nAlpha\r\nBeta\r\n");
  });
});
