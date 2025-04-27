const winston = require('winston');
const { LOG_CONFIG } = require('./config');

// Custom format to deduplicate repeated log messages
const dedupeFormat = winston.format((info, opts) => {
    // If deduplication is disabled, just pass through the log message
    if (!LOG_CONFIG.deduplication || !LOG_CONFIG.deduplication.enabled) {
        return info;
    }

    const timeWindow = LOG_CONFIG.deduplication.timeWindow || 60000; // Default: 1 minute
    const currentTime = Date.now();

    // Initialize message cache if it doesn't exist
    if (!dedupeFormat.messageCache) {
        dedupeFormat.messageCache = new Map();
    }

    // Check if this message was logged recently
    if (dedupeFormat.messageCache.has(info.message)) {
        const lastLogTime = dedupeFormat.messageCache.get(info.message);
        if (currentTime - lastLogTime < timeWindow) {
            return false; // Skip logging this message
        }
    }

    // Update the cache with current timestamp
    dedupeFormat.messageCache.set(info.message, currentTime);

    // Clean up old entries from cache (roughly every 5 minutes)
    if (currentTime % 300000 < 1000) {
        for (const [msg, time] of dedupeFormat.messageCache.entries()) {
            if (currentTime - time > timeWindow) {
                dedupeFormat.messageCache.delete(msg);
            }
        }
    }

    return info;
});

const logger = winston.createLogger({
    level: LOG_CONFIG.level,
    format: winston.format.combine(
        winston.format.timestamp({ format: LOG_CONFIG.format.timestampFormat }),
        dedupeFormat(),
        winston.format[LOG_CONFIG.format.outputFormat]()
    ),
    transports: [
        new winston.transports.File({ 
            filename: LOG_CONFIG.file.errorLog, 
            level: 'error',
            maxsize: LOG_CONFIG.file.maxsize,
            maxFiles: LOG_CONFIG.file.maxFiles,
            tailable: LOG_CONFIG.file.tailable
        }),
        new winston.transports.File({ 
            filename: LOG_CONFIG.file.combinedLog,
            maxsize: LOG_CONFIG.file.maxsize,
            maxFiles: LOG_CONFIG.file.maxFiles,
            tailable: LOG_CONFIG.file.tailable
        }),
    ],
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format[LOG_CONFIG.format.consoleFormat](),
    }));
}

module.exports = logger;
