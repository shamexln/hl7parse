const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');
const { getFilePath } = require('./init_codesystem');

/**
 * Configuration for the combined load test
 */
const config = {
  // Message generation
  generateMessages: true,
  messageCount: 50,
  templateFile: '300HL7_temp1.hl7',
  outputDir: './generated-messages',

  // Test parameters
  numClients: 10,
  messagesPerClient: 100,
  delayBetweenMessages: 10,

  // Server configuration
  host: 'localhost',
  port: 8080,

  // Performance tracking
  logInterval: 1000,
};

// Parse command line arguments
process.argv.slice(2).forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value) {
    switch (key) {
      case 'generate':
        config.generateMessages = value.toLowerCase() === 'true';
        break;
      case 'msgcount':
        config.messageCount = parseInt(value, 10);
        break;
      case 'template':
        config.templateFile = value;
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
      case 'port':
        config.port = parseInt(value, 10);
        break;
    }
  }
});

/**
 * Run a Node.js script as a child process
 * @param {string} scriptPath - Path to the script
 * @param {Array<string>} args - Command line arguments
 * @returns {Promise<void>} - Promise that resolves when the process completes
 */
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    logger.info(`Running script: ${scriptPath} ${args.join(' ')}`);

    const process = spawn('node', [scriptPath, ...args], {
      stdio: 'inherit',
      shell: true
    });

    process.on('close', (code) => {
      if (code === 0) {
        logger.info(`Script ${scriptPath} completed successfully`);
        resolve();
      } else {
        const error = new Error(`Script ${scriptPath} exited with code ${code}`);
        logger.error(error);
        reject(error);
      }
    });

    process.on('error', (err) => {
      logger.error(`Failed to start script ${scriptPath}:`, err);
      reject(err);
    });
  });
}

/**
 * Generate HL7 test messages
 * @returns {Promise<void>}
 */
async function generateMessages() {
  if (!config.generateMessages) {
    logger.info('Message generation skipped (generate=false)');
    return;
  }

  logger.info('Generating HL7 test messages...');

  const args = [
    `count=${config.messageCount}`,
    `template=${config.templateFile}`,
    `output=${config.outputDir}`
  ];

  await runScript('./generate-hl7-messages.js', args);
}

/**
 * Run the multi-client test
 * @returns {Promise<void>}
 */
async function runMultiClientTest() {
  logger.info('Running multi-client test...');

  // If we generated messages, update the multi-client-test.js to use them
  if (config.generateMessages) {
    // Create a temporary configuration file for the test
    const tempConfigPath = getFilePath('temp-test-config.js');

    try {
      // Get list of generated message files
      const messageDir = getFilePath(config.outputDir);
      let messageFiles = [];

      if (fs.existsSync(messageDir)) {
        messageFiles = fs.readdirSync(messageDir)
          .filter(file => file.endsWith('.hl7'))
          .map(file => path.join(config.outputDir, file));
      }

      if (messageFiles.length === 0) {
        logger.warn('No generated message files found. Using default message files.');
      } else {
        logger.info(`Found ${messageFiles.length} generated message files to use for testing.`);
      }

      // Create config content
      const configContent = `
// Temporary configuration for multi-client test
module.exports = {
  // Server configuration
  host: '${config.host}',
  port: ${config.port},

  // Test parameters
  numClients: ${config.numClients},
  messagesPerClient: ${config.messagesPerClient},
  delayBetweenMessages: ${config.delayBetweenMessages},

  // Message configuration
  messageFiles: ${messageFiles.length > 0 ? 
    JSON.stringify(messageFiles, null, 2) : 
    `[
    '300HL7_temp1.hl7',
    '300HL7_temp2.hl7',
    'msg-03272025-121407-438.hl7',
    'msg-03272025-121412-439.hl7',
    'msg-03272025-121412-440.hl7',
    'msg-03272025-121412-441.hl7'
  ]`},

  // Performance tracking
  logInterval: ${config.logInterval},
};
      `;

      // Write config file
      fs.writeFileSync(tempConfigPath, configContent);
      logger.info('Created temporary test configuration file.');

      // Run the test with the config file
      await runScript('./multi-client-test.js', [`config=${tempConfigPath}`]);

      // Clean up temp file
      fs.unlinkSync(tempConfigPath);
      logger.info('Removed temporary test configuration file.');

    } catch (error) {
      logger.error('Error during test configuration:', error);
      throw error;
    }
  } else {
    // Run with command line arguments
    const args = [
      `port=${config.port}`,
      `clients=${config.numClients}`,
      `messages=${config.messagesPerClient}`,
      `delay=${config.delayBetweenMessages}`
    ];

    await runScript('./multi-client-test.js', args);
  }
}

/**
 * Run the complete load test
 */
async function runLoadTest() {
  logger.info('Starting HL7 load test with configuration:', config);

  try {
    // Step 1: Generate messages if enabled
    await generateMessages();

    // Step 2: Run multi-client test
    await runMultiClientTest();

    logger.info('Load test completed successfully.');
  } catch (error) {
    logger.error('Load test failed:', error);
    process.exit(1);
  }
}

// Run the load test
runLoadTest();
