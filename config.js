const path = require('path');

module.exports = {
    DATABASE_FILE: path.join(__dirname, 'hl7_messages.db'),
    EXCEL_FILE: path.join(__dirname, 'patients.xlsx'),
    TABLE_HL7_PATIENTS: 'hl7_patients',
    CODE_SYSTEM: 'CodingSystem11073.xml',
    // Winston log config
    LOG_CONFIG: {
        level: 'info',
        format: {
            timestampFormat: 'YYYY-MM-DD HH:mm:ss',
            outputFormat: 'json',
            consoleFormat: 'simple'
        },
        file: {
            errorLog: path.join(__dirname, 'logs', 'error.log'),
            combinedLog: path.join(__dirname, 'logs', 'combined.log')
        }
    }

};