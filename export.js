const ExcelJS = require('exceljs');
const sqlite3 = require("sqlite3").verbose();
const logger = require("./logger");
const { TABLE_HL7_PATIENTS } = require("./config");

/**
 * Exports patient data from the database to an Excel file
 * @param {string} databasePath - Path to the SQLite database file
 * @param {string} outputExcelPath - Path where the Excel file will be saved
 */
function exportPatientsToExcel(databasePath, outputExcelPath) {
  const db = new sqlite3.Database(databasePath);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("HL7 Patients");

  db.serialize(() => {
    // Get column names
    db.all(
      `PRAGMA table_info(\`${TABLE_HL7_PATIENTS}\`)`,
      [],
      (err, columns) => {
        if (err) {
          logger.error("Error fetching column info:", err);
          return;
        }

        const columnNames = columns.map((col) => col.name);

        // Use database field names as Excel headers
        sheet.columns = columnNames.map((name) => ({
          header: name,
          key: name,
        }));

        // Read data from table
        db.all(`SELECT * FROM ${TABLE_HL7_PATIENTS}`, [], (err, rows) => {
          if (err) {
            logger.error("Error fetching data from hl7_patients:", err);
            return;
          }

          // Add data to Excel worksheet
          rows.forEach((row) => sheet.addRow(row));

          workbook.xlsx
            .writeFile(outputExcelPath)
            .then(() => {
              logger.info("Data exported successfully to:", outputExcelPath);
            })
            .catch((err) => {
              logger.error("Error writing Excel file:", err);
            })
            .finally(() => db.close()); // Ensure database is closed
        });
      },
    );
  });
}

/**
 * Creates an Excel workbook from filtered patient data
 * @param {Array} filteredData - Array of patient data objects
 * @returns {ExcelJS.Workbook} - Excel workbook with patient data
 */
function createPatientExcelWorkbook(filteredData) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Patients Data Export');

  if (filteredData.length > 0) {
    // Dynamically generate headers based on the first data item's fields
    worksheet.columns = Object.keys(filteredData[0]).map((field) => ({
      header: field,
      key: field,
      width: 20
    }));

    // Fill all rows
    filteredData.forEach((item) => {
      worksheet.addRow(item);
    });
  } else {
    worksheet.columns = [{ header: 'prompt', key: 'info', width: 30 }];
    worksheet.addRow({ info: 'not found data' });
  }

  return workbook;
}

module.exports = {
  exportPatientsToExcel,
  createPatientExcelWorkbook
};