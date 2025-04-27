# Port Configuration Feature

This document describes the port configuration feature added to the HL7 Parse application.

## Overview

The application now supports dynamic port configuration through a JSON configuration file. This allows you to change the listening ports for both the TCP server (for HL7 messages) and the HTTP server (for the web interface) without restarting the application manually.

## Configuration File

The port configuration is stored in a file named `port-config.json` in the root directory of the application. The file has the following structure:

```json
{
  "tcpPort": 3359,
  "httpPort": 3000
}
```

- `tcpPort`: The port on which the TCP server listens for HL7 messages (must be a valid port number between 1 and 65535)
- `httpPort`: The port on which the HTTP server listens for web requests (must be a valid port number between 1 and 65535)

## How It Works

1. When the application starts, it reads the port configuration from `port-config.json`.
2. If the file doesn't exist, it creates a default configuration with TCP port 3359 and HTTP port 3000.
3. The application sets up a file watcher to monitor changes to the configuration file.
4. When the file is modified, the application:
   - Waits for a short period (300ms) to ensure all changes are complete (debouncing)
   - Reads the new configuration
   - Validates the port values to ensure they are valid
   - Compares the valid port values with the current configuration
   - If the TCP port has changed, it restarts the TCP server with the new port
   - If the HTTP port has changed, it restarts the HTTP server with the new port
   - Updates the configuration file with the validated settings

## Error Handling

The application includes robust error handling for the port configuration:

1. If the configuration file is deleted, it will be recreated with the current settings
2. If the file is empty, it will be recreated with the current settings
3. If the file contains invalid JSON, an error will be logged and the file will be restored with the current settings
4. If a port value is invalid (not a number or outside the valid range), the current port value will be used instead

## Testing the Feature

You can test the port configuration feature using the provided `test-port-change.js` script:

```bash
node test-port-change.js
```

This script will:
1. Read the current port configuration
2. Create a new configuration with different ports
3. Write the new configuration to the file
4. The application should detect the change and restart the servers with the new ports

## Manual Testing

You can also manually edit the `port-config.json` file while the application is running:

1. Open `port-config.json` in a text editor
2. Change the `tcpPort` value (e.g., from 3359 to 6060)
3. Change the `httpPort` value (e.g., from 3000 to 4000)
4. Save the file
5. The application should detect the changes and restart the servers with the new ports

## Logs

When the port configuration changes, the application logs the following information:
- When the configuration file is loaded or created
- When changes to the configuration file are detected
- When servers are restarted with new ports

Check the application logs to confirm that the servers have been restarted with the new ports.
