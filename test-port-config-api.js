const http = require('http');
const fs = require('fs');
const path = require('path');

// Path to the port configuration file
const portConfigPath = path.join(process.cwd(), 'port-config.json');

// Backup the current configuration
function backupConfig() {
  try {
    if (fs.existsSync(portConfigPath)) {
      const backupPath = `${portConfigPath}.backup`;
      fs.copyFileSync(portConfigPath, backupPath);
      console.log(`Configuration backed up to ${backupPath}`);
      return true;
    }
  } catch (error) {
    console.error('Error backing up configuration:', error.message);
  }
  return false;
}

// Restore the configuration from backup
function restoreConfig() {
  try {
    const backupPath = `${portConfigPath}.backup`;
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, portConfigPath);
      console.log('Configuration restored from backup');
      return true;
    }
  } catch (error) {
    console.error('Error restoring configuration:', error.message);
  }
  return false;
}

// Backup the current configuration
backupConfig();

// Read the current configuration
console.log('\n--- TEST: Port Configuration API ---');
console.log('Reading current port configuration...');
const currentConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));
console.log('Current configuration:', currentConfig);

// Test the GET endpoint before making any changes
console.log('\n--- Testing GET /api/port-config endpoint (before update) ---');
testGetPortConfig(currentConfig.httpPort);

// Add a delay before sending the POST request to ensure the GET request completes
setTimeout(() => {
  // Continue with the POST request test
  console.log('\n--- Testing POST /api/port-config endpoint ---');
  sendPostRequest();
}, 1000);

// Function to test the GET /api/port-config endpoint
function testGetPortConfig(httpPort) {
  const getOptions = {
    hostname: 'localhost',
    port: httpPort,
    path: '/api/port-config',
    method: 'GET'
  };

  const getReq = http.request(getOptions, (res) => {
    console.log(`GET Status Code: ${res.statusCode}`);

    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      console.log('GET Response:', JSON.parse(responseData));
    });
  });

  getReq.on('error', (error) => {
    console.error('Error sending GET request:', error.message);
  });

  getReq.end();
}

// Create a new configuration with different ports
const newConfig = {
  tcpPort: currentConfig.tcpPort === 3359 ? 6060 : 3359,
  httpPort: currentConfig.httpPort === 3000 ? 4000 : 3000
};
console.log('New configuration to send:', newConfig);

// Function to send the POST request to update port configuration
function sendPostRequest() {
  console.log('Sending request to update port configuration...');

  const data = JSON.stringify(newConfig);

  const options = {
    hostname: 'localhost',
    port: currentConfig.httpPort,
    path: '/api/port-config',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    console.log(`POST Status Code: ${res.statusCode}`);

    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      console.log('POST Response:', JSON.parse(responseData));
      console.log('Check the application logs to confirm the servers restarted with the new ports.');

      // Test the GET endpoint after updating the configuration
      console.log('\n--- Testing GET /api/port-config endpoint (after update) ---');
      testGetPortConfig(currentConfig.httpPort);

      // Wait a moment and then restore the original configuration
      setTimeout(() => {
        console.log('\n--- Restoring Original Configuration ---');
        if (restoreConfig()) {
          console.log('Original configuration restored successfully.');
        } else {
          console.log('Failed to restore original configuration.');
        }
      }, 5000);
    });
  });

  req.on('error', (error) => {
    console.error('Error sending POST request:', error.message);
    console.log('Restoring original configuration...');
    if (restoreConfig()) {
      console.log('Original configuration restored successfully.');
    } else {
      console.log('Failed to restore original configuration.');
    }
  });

  req.write(data);
  req.end();

  console.log('POST request sent. Waiting for response...');
}
