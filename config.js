const path = require('path');

module.exports = {
    DATABASE_FILE: path.join(process.cwd(), 'hl7_messages.db'),
    TABLE_HL7_PATIENTS: 'hl7_patients',
    CODE_SYSTEM: '300.xml',
    // Winston log config
    LOG_CONFIG: {
        level: 'debug',
        format: {
            timestampFormat: 'YYYY-MM-DD HH:mm:ss',
            outputFormat: 'json',
            consoleFormat: 'simple'
        },
        file: {
            errorLog: path.join(process.cwd(), 'logs', 'error.log'),
            combinedLog: path.join(process.cwd(), 'logs', 'combined.log')
        }
    }

};