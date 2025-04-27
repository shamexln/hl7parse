# HL7 Load Testing Suite

This suite provides a comprehensive set of tools for load testing the HL7 TCP server. It allows you to simulate multiple clients sending large volumes of HL7 messages to test the server's performance, stability, and scalability.

## Overview

The suite consists of three main components:

1. **Message Generator** (`generate-hl7-messages.js`): Creates random HL7 messages for testing
2. **Multi-Client Test** (`multi-client-test.js`): Simulates multiple clients sending messages
3. **Combined Load Test** (`run-load-test.js`): Integrates both tools for one-command testing

## Quick Start

For a complete load test with default settings:

```bash
node run-load-test.js
```

This will:
- Generate 50 random HL7 messages
- Create 10 client connections
- Each client will send 100 messages
- Performance metrics will be logged throughout the test

## Tools in Detail

### 1. Message Generator

Generates random HL7 messages by taking a template and randomizing fields like patient ID, bed label, vital signs, and timestamps.

**Basic Usage:**
```bash
node generate-hl7-messages.js [count=10] [template=300HL7_temp1.hl7] [output=./generated-messages]
```

See [generate-hl7-messages-README.md](generate-hl7-messages-README.md) for detailed documentation.

### 2. Multi-Client Test

Simulates multiple clients connecting to the HL7 TCP server and sending messages in parallel. Tracks performance metrics like throughput and latency.

**Basic Usage:**
```bash
node multi-client-test.js [port=8080] [clients=5] [messages=100] [delay=10]
```

See [multi-client-test-README.md](multi-client-test-README.md) for detailed documentation.

### 3. Combined Load Test

Integrates both tools for a complete testing workflow. Generates messages and immediately uses them for testing.

**Basic Usage:**
```bash
node run-load-test.js [generate=true] [msgcount=50] [clients=10] [messages=100]
```

See [run-load-test-README.md](run-load-test-README.md) for detailed documentation.

## Test Scenarios

Here are some common test scenarios you might want to run:

### Basic Load Test
```bash
node run-load-test.js clients=5 messages=50
```

### High Volume Test
```bash
node run-load-test.js clients=20 messages=500 delay=0
```

### Sustained Load Test
```bash
node run-load-test.js clients=10 messages=1000 delay=100
```

### Maximum Throughput Test
```bash
node run-load-test.js clients=50 messages=200 delay=0
```

## Analyzing Results

The test scripts log detailed performance metrics during and after the test:

- **Messages per second**: Overall throughput of the system
- **Average latency**: Round-trip time for messages
- **Error count**: Number of errors encountered
- **Completion rate**: Percentage of messages successfully processed

Look for these metrics in the logs to evaluate the server's performance.

## Troubleshooting

Common issues and solutions:

1. **Connection refused**: Ensure the TCP server is running and the port is correct
2. **Memory issues**: For very large tests, you may need to increase Node.js memory limit
3. **File not found errors**: Check that all referenced HL7 message files exist
4. **Slow performance**: Try reducing the delay between messages or increasing client count

## Extending the Suite

To extend the testing suite:

1. **Add more message templates**: Create additional HL7 message templates with different structures
2. **Modify randomization**: Edit the generator to randomize additional fields
3. **Add new metrics**: Extend the metrics tracking in the multi-client test
4. **Create specialized tests**: Develop tests for specific scenarios (e.g., error handling)

## Contributing

Contributions to improve the testing suite are welcome:

1. Fork the repository
2. Create your feature branch
3. Add your changes
4. Submit a pull request

## License

This project is licensed under the terms specified in the repository's license file.