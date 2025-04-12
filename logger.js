const winston = require('winston');
const { LOG_CONFIG } = require('./config');

const logger = winston.createLogger({
    level: LOG_CONFIG.level,
    format: winston.format.combine(
        winston.format.timestamp({ format: LOG_CONFIG.format.timestampFormat }),
        winston.format[LOG_CONFIG.format.outputFormat]()
    ),
    transports: [
        new winston.transports.File({ filename: LOG_CONFIG.file.errorLog, level: 'error' }),
        new winston.transports.File({ filename: LOG_CONFIG.file.combinedLog }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format[LOG_CONFIG.format.consoleFormat](),
    }));
}

module.exports = logger;