# HL7 Multi-Client Test Tool

This tool is designed to test the HL7 TCP server with large data volumes and multiple concurrent clients. It simulates real-world load by creating multiple TCP connections and sending HL7 messages in parallel.

## Features

- Configurable number of concurrent clients
- Configurable message volume per client
- Customizable delay between messages
- Performance metrics tracking (throughput, latency)
- Uses real HL7 message samples from the project

## Requirements

- Node.js
- Access to the HL7 TCP server

## Usage

Run the test script with Node.js:

```bash
node multi-client-test.js [options]
```

### Command Line Options

The script accepts the following command line options:

- `port=<number>` - TCP server port (default: 8080)
- `clients=<number>` - Number of concurrent clients (default: 5)
- `messages=<number>` - Number of messages per client (default: 100)
- `delay=<number>` - Delay between messages in milliseconds (default: 10)

### Examples

Run with default settings:
```bash
node multi-client-test.js
```

Run with 10 clients, 1000 messages each:
```bash
node multi-client-test.js clients=10 messages=1000
```

Run with 20 clients, 500 messages each, no delay between messages:
```bash
node multi-client-test.js clients=20 messages=500 delay=0
```

Run with custom port:
```bash
node multi-client-test.js port=8888
```

## Configuration

You can also modify the configuration directly in the script:

```javascript
const config = {
  // Server configuration
  host: 'localhost',
  port: 8080,
  
  // Test parameters
  numClients: 5,
  messagesPerClient: 100,
  delayBetweenMessages: 10,
  
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
  logInterval: 1000,
};
```

## Performance Metrics

The script logs performance metrics during the test and provides a summary at the end:

- Total messages sent and acknowledged
- Messages per second (throughput)
- Average message latency (round-trip time)
- Error count
- Total test duration

## Troubleshooting

If you encounter issues:

1. Ensure the TCP server is running and accessible
2. Check that the port number matches the server's listening port
3. Verify that the HL7 message files exist in the project directory
4. For high-volume tests, you may need to increase system limits (e.g., max open files)

## Extending the Test

To add more test scenarios:

1. Add more HL7 message samples to the `messageFiles` array
2. Modify the client behavior in the `createClient` function
3. Add additional metrics to the `metrics` object