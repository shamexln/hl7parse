# HL7 Combined Load Test Tool

This tool provides an all-in-one solution for load testing the HL7 TCP server. It combines message generation and multi-client testing in a single command, making it easy to run comprehensive performance tests.

## Features

- One-command solution for complete load testing
- Generates random HL7 messages and immediately uses them for testing
- Configurable number of clients, messages, and other parameters
- Detailed performance metrics and logging
- Automatic cleanup of temporary files

## Requirements

- Node.js
- Access to the HL7 TCP server

## Usage

Run the load test script with Node.js:

```bash
node run-load-test.js [options]
```

### Command Line Options

The script accepts the following command line options:

- `generate=<true|false>` - Whether to generate new messages (default: true)
- `msgcount=<number>` - Number of messages to generate (default: 50)
- `template=<filename>` - Template HL7 message file to use (default: '300HL7_temp1.hl7')
- `clients=<number>` - Number of concurrent clients (default: 10)
- `messages=<number>` - Number of messages per client (default: 100)
- `delay=<number>` - Delay between messages in milliseconds (default: 10)
- `port=<number>` - TCP server port (default: 8080)

### Examples

Run with default settings (generate 50 messages, test with 10 clients sending 100 messages each):
```bash
node run-load-test.js
```

Skip message generation and use existing messages:
```bash
node run-load-test.js generate=false
```

Generate 200 messages and test with 20 clients:
```bash
node run-load-test.js msgcount=200 clients=20
```

High-volume test with 50 clients, 1000 messages each, no delay:
```bash
node run-load-test.js clients=50 messages=1000 delay=0
```

Use a specific template and port:
```bash
node run-load-test.js template=300HL7_temp2.hl7 port=8888
```

## How It Works

The script performs the following steps:

1. **Message Generation** (if enabled):
   - Calls the `generate-hl7-messages.js` script to create random HL7 messages
   - Saves the generated messages to the specified output directory

2. **Test Configuration**:
   - Creates a temporary configuration file for the multi-client test
   - Includes all generated message files in the configuration

3. **Multi-Client Testing**:
   - Calls the `multi-client-test.js` script with the appropriate configuration
   - Simulates multiple clients sending messages to the server
   - Tracks and reports performance metrics

4. **Cleanup**:
   - Removes temporary configuration files

## Configuration

You can also modify the configuration directly in the script:

```javascript
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
```

## Troubleshooting

If you encounter issues:

1. Ensure the TCP server is running and accessible
2. Check that the port number matches the server's listening port
3. Verify that the template HL7 message file exists
4. Check the logs for detailed error messages
5. For high-volume tests, you may need to increase system limits (e.g., max open files)

## Related Tools

This script uses two other tools that can also be run independently:

- `generate-hl7-messages.js` - Generates random HL7 messages for testing
- `multi-client-test.js` - Simulates multiple clients sending HL7 messages

See their respective README files for more details on using them individually.