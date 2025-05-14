const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { initializeDatabase } = require('./init_database');
const { initializeCodeSystem } = require('./codesystem');
const { createTcpServer, restartTcpServer, isValidPort } = require('./tcp-server');
const { startHttpServer, restartHttpServer } = require('./http-server');

// Initialize database and code system
initializeDatabase();
initializeCodeSystem();

// Read port configuration
const portConfigPath = path.join(process.cwd(), 'port-config.json');
let portConfig = { tcpPort: 3359, httpPort: 3000 };

try {
  if (fs.existsSync(portConfigPath)) {
    portConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));
    logger.info(`Loaded port configuration: TCP port ${portConfig.tcpPort}, HTTP port ${portConfig.httpPort}`);
  } else {
    // If config file doesn't exist, create default config
    fs.writeFileSync(portConfigPath, JSON.stringify(portConfig, null, 2));
    logger.info(`Created default port configuration file at ${portConfigPath}`);
  }
} catch (error) {
  logger.error(`Error loading port configuration: ${error.message}`);
}

// Start servers
let tcpServer = createTcpServer(portConfig.tcpPort);
let httpServer = startHttpServer(portConfig.httpPort);

// Watch for configuration file changes
let watchDebounceTimer = null;
const debounceTime = 300; // 300ms debounce time

fs.watch(portConfigPath, (eventType) => {
  if (eventType === 'change') {
    // Use debounce technique to avoid multiple triggers
    if (watchDebounceTimer) {
      clearTimeout(watchDebounceTimer);
    }

    watchDebounceTimer = setTimeout(async () => {
      logger.info('Port configuration file changed, reloading...');
      try {
        // Check if file exists
        if (!fs.existsSync(portConfigPath)) {
          logger.warn('Port configuration file was deleted, recreating with default settings');
          fs.writeFileSync(portConfigPath, JSON.stringify(portConfig, null, 2));
          return;
        }

        const fileContent = fs.readFileSync(portConfigPath, 'utf8');
        if (!fileContent.trim()) {
          logger.warn('Port configuration file is empty, recreating with default settings');
          fs.writeFileSync(portConfigPath, JSON.stringify(portConfig, null, 2));
          return;
        }

        const newConfig = JSON.parse(fileContent);

        // Validate port configuration
        if (!newConfig.tcpPort || !isValidPort(newConfig.tcpPort)) {
          logger.warn(`Invalid TCP port: ${newConfig.tcpPort}, using current port: ${portConfig.tcpPort}`);
          newConfig.tcpPort = portConfig.tcpPort;
        }

        if (!newConfig.httpPort || !isValidPort(newConfig.httpPort)) {
          logger.warn(`Invalid HTTP port: ${newConfig.httpPort}, using current port: ${portConfig.httpPort}`);
          newConfig.httpPort = portConfig.httpPort;
        }

        // Check if TCP port changed
        if (newConfig.tcpPort !== portConfig.tcpPort) {
          logger.info(`TCP port changed from ${portConfig.tcpPort} to ${newConfig.tcpPort}`);
          tcpServer = await restartTcpServer(tcpServer, newConfig.tcpPort);
        }

        // Check if HTTP port changed
        if (newConfig.httpPort !== portConfig.httpPort) {
          logger.info(`HTTP port changed from ${portConfig.httpPort} to ${newConfig.httpPort}`);
          httpServer = await restartHttpServer(httpServer, newConfig.httpPort);
        }

        // Update current configuration
        portConfig = newConfig;

        // Ensure config file contains valid configuration
        fs.writeFileSync(portConfigPath, JSON.stringify(portConfig, null, 2));
      } catch (error) {
        logger.error(`Error reloading port configuration: ${error.message}`);
        // If parsing fails, try to restore config file
        try {
          logger.warn('Attempting to restore port configuration file with current settings');
          fs.writeFileSync(portConfigPath, JSON.stringify(portConfig, null, 2));
        } catch (writeError) {
          logger.error(`Failed to restore port configuration file: ${writeError.message}`);
        }
      }
    }, debounceTime);
  }
});

// Export for testing
module.exports = {
  tcpServer,
  httpServer,
  portConfig
};