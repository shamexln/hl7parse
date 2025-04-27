# HL7 Message Generator

This tool generates random HL7 messages for testing purposes. It takes a template HL7 message and creates multiple variations by randomizing specific fields.

## Features

- Generates multiple unique HL7 messages from a template
- Randomizes patient IDs, bed labels, vital signs, alarm priorities, and timestamps
- Configurable via command line arguments
- Creates realistic test data for load testing

## Requirements

- Node.js
- A template HL7 message file

## Usage

Run the generator script with Node.js:

```bash
node generate-hl7-messages.js [options]
```

### Command Line Options

The script accepts the following command line options:

- `count=<number>` - Number of messages to generate (default: 10)
- `template=<filename>` - Template HL7 message file to use (default: '300HL7_temp1.hl7')
- `output=<directory>` - Output directory for generated messages (default: './generated-messages')

### Examples

Generate 10 messages using the default template:
```bash
node generate-hl7-messages.js
```

Generate 100 messages:
```bash
node generate-hl7-messages.js count=100
```

Use a different template file:
```bash
node generate-hl7-messages.js template=msg-03272025-121407-438.hl7
```

Specify a custom output directory:
```bash
node generate-hl7-messages.js output=./test-data
```

Combine multiple options:
```bash
node generate-hl7-messages.js count=50 template=300HL7_temp2.hl7 output=./large-test
```

## Configuration

You can also modify the configuration directly in the script:

```javascript
const config = {
  // Output configuration
  outputDir: './generated-messages',
  numberOfMessages: 10,
  
  // Template file to use as base
  templateFile: '300HL7_temp1.hl7',
  
  // Fields to randomize
  randomizePatientId: true,
  randomizeBedLabel: true,
  randomizeTemperature: true,
  randomizeAlarmPriority: true,
  randomizeDateTime: true
};
```

## Generated Fields

The script randomizes the following fields:

- **Patient ID**: Random 4-digit number
- **Bed Label**: Format like "210A" (floor, room, bed)
- **Temperature**: Random value between 35.0 and 40.0 °C
- **Alarm Priority**: Random priority (PM, PH, PL)
- **Date/Time**: Random timestamp within the last 30 days

## Using with Multi-Client Test

The generated messages can be used with the multi-client test script:

1. Generate a set of messages:
   ```bash
   node generate-hl7-messages.js count=100
   ```

2. Update the multi-client-test.js configuration to use these messages:
   ```javascript
   messageFiles: [
     './generated-messages/generated-msg-001.hl7',
     './generated-messages/generated-msg-002.hl7',
     // ... add more as needed
   ]
   ```

3. Or use a wildcard pattern to include all generated messages:
   ```javascript
   const fs = require('fs');
   const generatedDir = './generated-messages';
   const messageFiles = fs.readdirSync(generatedDir)
     .filter(file => file.endsWith('.hl7'))
     .map(file => `${generatedDir}/${file}`);
   ```

## Troubleshooting

If you encounter issues:

1. Ensure the template file exists and is a valid HL7 message
2. Check that the output directory is writable
3. Verify that the template contains the expected segments (MSH, PID, PV1, OBR, OBX)