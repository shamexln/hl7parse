const sqlite3 = require('sqlite3').verbose();
const { TABLE_HL7_PATIENTS, DATABASE_FILE } = require('./config');
const winston = require('winston');

// 日志配置示例（仅供参考，你项目中可能已有此配置）
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

function initializeDatabase() {
    const db = new sqlite3.Database(DATABASE_FILE);

    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS ${TABLE_HL7_PATIENTS} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                local_time TEXT,
                Date TEXT,
                Time TEXT,
                Hour TEXT,
                bed_label TEXT,
                pat_ID TEXT,
                mon_unit TEXT,
                care_unit TEXT,
                alarm_grade TEXT,
                alarm_state TEXT,
                Alarm_Grade_2 TEXT,
                alarm_message TEXT,
                param_id TEXT,
                param_description TEXT,
                param_value TEXT,
                param_uom TEXT,
                param_upper_lim TEXT,
                param_lower_lim TEXT,
                Limit_Violation_Type TEXT,
                Limit_Violation_Value TEXT,
                subid TEXT,
                sourcechannel TEXT,
                onset_tick TEXT,
                alarm_duration TEXT,
                change_time_UTC TEXT,
                change_tick TEXT,
                aborted TEXT,                       
                raw_message TEXT,
                received_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, function(err) {
            if (err) {
                logger.error('Error creating table:', err);
            } else {
                logger.info(`Table "${TABLE_HL7_PATIENTS}" created or already exists.`);
            }
        });
    });

    db.close();
}

module.exports = {
    initializeDatabase
};
