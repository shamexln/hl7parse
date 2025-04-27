const fs = require('fs');
const net = require('net');
const path = require('path');
const logger = require('./logger');

/**
 * Configuration for the test
 */
const config = {
  // Server configuration
  host: 'localhost',
  port: 8080, // Default port, can be overridden via command line

  // Test parameters
  numClients: 5,         // Number of concurrent clients
  messagesPerClient: 100, // Number of messages each client will send
  delayBetweenMessages: 10, // Milliseconds between messages (0 for no delay)

  // Message configuration
  messageFiles: [
    '300HL7_temp1.hl7',
    '300HL7_temp2.hl7',
    'msg-03272025-121407-438.hl7',
    'msg-03272025-121412-439.hl7',
    'msg-03272025-121412-440.hl7',
    'msg-03272025-121412-441.hl7'
  ],

  // Performance tracking
  logInterval: 1000, // Log performance stats every X milliseconds
};

// Parse command line arguments
process.argv.slice(2).forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    switch (key) {
      case 'port':
        config.port = parseInt(value, 10);
        break;
      case 'clients':
        config.numClients = parseInt(value, 10);
        break;
      case 'messages':
        config.messagesPerClient = parseInt(value, 10);
        break;
      case 'delay':
        config.delayBetweenMessages = parseInt(value, 10);
        break;
      case 'config':
        // Load configuration from file
        try {
          const configPath = value;
          logger.info(`Loading configuration from ${configPath}`);
          const fileConfig = require(configPath);

          // Override config with values from file
          Object.assign(config, fileConfig);
          logger.info('Configuration loaded successfully');
        } catch (error) {
          logger.error(`Error loading configuration file: ${error.message}`);
        }
        break;
    }
  }
});

// Performance metrics
const metrics = {
  startTime: null,
  endTime: null,
  totalMessagesSent: 0,
  totalMessagesAcknowledged: 0,
  errors: 0,
  clientsCompleted: 0,
  messageLatencies: [], // Array to store message round-trip times
};

/**
 * Load HL7 messages from files
 * @returns {Array<string>} Array of HL7 message strings
 */
function loadHL7Messages() {
  const messages = [];

  for (const fileName of config.messageFiles) {
    try {
      const filePath = path.join(__dirname, fileName);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        messages.push(content);
      } else {
        logger.warn(`Message file not found: ${fileName}`);
      }
    } catch (error) {
      logger.error(`Error loading message file ${fileName}:`, error);
    }
  }

  if (messages.length === 0) {
    throw new Error('No message files could be loaded. Test cannot proceed.');
  }

  return messages;
}

/**
 * Create a single client that sends messages to the server
 * @param {number} clientId - Unique identifier for this client
 * @param {Array<string>} messages - Array of HL7 messages to send
 * @returns {Promise} Promise that resolves when client completes
 */
function createClient(clientId, messages) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let messagesSent = 0;
    let messagesAcknowledged = 0;
    let buffer = Buffer.alloc(0);
    let pendingMessages = []; // Track messages waiting for acknowledgment

    client.connect(config.port, config.host, () => {
      logger.info(`Client ${clientId} connected to ${config.host}:${config.port}`);
      sendNextMessage();
    });

    client.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);

      // Process complete MLLP messages (acknowledgments)
      let startMarker = buffer.indexOf(0x0b);
      while (startMarker !== -1) {
        let endMarker = buffer.indexOf(Buffer.from([0x1c, 0x0d]), startMarker);
        if (endMarker === -1) break; // Message incomplete

        // Extract complete acknowledgment
        const ack = buffer.slice(startMarker + 1, endMarker).toString('utf8');

        // Update metrics
        messagesAcknowledged++;
        metrics.totalMessagesAcknowledged++;

        // Calculate latency if we have pending messages
        if (pendingMessages.length > 0) {
          const sentTime = pendingMessages.shift();
          const latency = Date.now() - sentTime;
          metrics.messageLatencies.push(latency);
        }

        // Update buffer, remove processed message
        buffer = buffer.slice(endMarker + 2);
        startMarker = buffer.indexOf(0x0b);

        // Send next message if we haven't sent all
        if (messagesSent < config.messagesPerClient) {
          if (config.delayBetweenMessages > 0) {
            setTimeout(sendNextMessage, config.delayBetweenMessages);
          } else {
            sendNextMessage();
          }
        } else if (messagesAcknowledged >= config.messagesPerClient) {
          // All messages sent and acknowledged
          client.end();
          metrics.clientsCompleted++;
          resolve();
        }
      }
    });

    client.on('error', (err) => {
      logger.error(`Client ${clientId} error:`, err);
      metrics.errors++;
      client.destroy();
      reject(err);
    });

    client.on('close', () => {
      logger.info(`Client ${clientId} connection closed. Sent: ${messagesSent}, Acknowledged: ${messagesAcknowledged}`);
      if (messagesAcknowledged < config.messagesPerClient) {
        metrics.errors++;
        reject(new Error(`Client ${clientId} closed before completing all messages`));
      }
    });

    function sendNextMessage() {
      if (messagesSent < config.messagesPerClient) {
        // Get a message (round-robin through available messages)
        const message = messages[messagesSent % messages.length];

        // Send message with MLLP framing
        const mlllpMessage = Buffer.from('\x0b' + message + '\x1c\r');
        client.write(mlllpMessage);

        // Track message send time for latency calculation
        pendingMessages.push(Date.now());

        messagesSent++;
        metrics.totalMessagesSent++;
      }
    }
  });
}

/**
 * Log current performance metrics
 */
function logPerformanceMetrics() {
  const currentTime = Date.now();
  const elapsedSeconds = (currentTime - metrics.startTime) / 1000;
  const messagesPerSecond = metrics.totalMessagesSent / elapsedSeconds;
  const acknowledgedPerSecond = metrics.totalMessagesAcknowledged / elapsedSeconds;

  // Calculate average latency
  let avgLatency = 0;
  if (metrics.messageLatencies.length > 0) {
    avgLatency = metrics.messageLatencies.reduce((sum, latency) => sum + latency, 0) / metrics.messageLatencies.length;
  }

  logger.info('Performance Metrics:', {
    elapsedSeconds: elapsedSeconds.toFixed(2),
    totalSent: metrics.totalMessagesSent,
    totalAcknowledged: metrics.totalMessagesAcknowledged,
    messagesPerSecond: messagesPerSecond.toFixed(2),
    acknowledgedPerSecond: acknowledgedPerSecond.toFixed(2),
    avgLatencyMs: avgLatency.toFixed(2),
    errors: metrics.errors,
    clientsCompleted: metrics.clientsCompleted
  });
}

/**
 * Run the test
 */
async function runTest() {
  logger.info('Starting multi-client HL7 test with configuration:', config);

  try {
    // Load messages
    const messages = loadHL7Messages();
    logger.info(`Loaded ${messages.length} unique HL7 messages for testing`);

    // Start performance tracking
    metrics.startTime = Date.now();

    // Set up periodic logging
    const logIntervalId = setInterval(logPerformanceMetrics, config.logInterval);

    // Create clients
    const clients = [];
    for (let i = 0; i < config.numClients; i++) {
      clients.push(createClient(i + 1, messages));
    }

    // Wait for all clients to complete
    await Promise.all(clients).catch(err => {
      logger.error('Test failed:', err);
    });

    // Stop performance tracking
    metrics.endTime = Date.now();
    clearInterval(logIntervalId);

    // Log final results
    const totalTime = (metrics.endTime - metrics.startTime) / 1000;
    logger.info('Test completed. Final results:', {
      totalClients: config.numClients,
      totalMessages: config.numClients * config.messagesPerClient,
      messagesSent: metrics.totalMessagesSent,
      messagesAcknowledged: metrics.totalMessagesAcknowledged,
      errors: metrics.errors,
      totalTimeSeconds: totalTime.toFixed(2),
      messagesPerSecond: (metrics.totalMessagesSent / totalTime).toFixed(2),
      avgLatencyMs: metrics.messageLatencies.length > 0 
        ? (metrics.messageLatencies.reduce((sum, latency) => sum + latency, 0) / metrics.messageLatencies.length).toFixed(2)
        : 'N/A'
    });

  } catch (error) {
    logger.error('Test failed with error:', error);
  }
}

// Run the test
runTest();
