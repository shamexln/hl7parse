const path = require('path');

module.exports = {
    DATABASE_FILE: path.join(process.cwd(), 'hl7_messages.db'),
    TABLE_HL7_PATIENTS: 'hl7_patients',
    CODE_SYSTEM: '300_map.xml',
    // Winston log config
    LOG_CONFIG: {
        level: 'info',
        format: {
            timestampFormat: 'YYYY-MM-DD HH:mm:ss',
            outputFormat: 'json',
            consoleFormat: 'simple'
        },
        file: {
            errorLog: path.join(process.cwd(), 'logs', 'error.log'),
            combinedLog: path.join(process.cwd(), 'logs', 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            tailable: true
        },
        deduplication: {
            enabled: true,
            timeWindow: 60000 // 1 minute in milliseconds
        }
    },
    LISTCODESYSTEM_API: '/api/codesystem',
    CODESYSTEMTAGS_API: '/api/codesystem/:name',

};
