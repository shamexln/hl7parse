const fs = require('fs');
const path = require('path');

// Path to the port configuration file
const portConfigPath = path.join(process.cwd(), 'port-config.json');

// Function to backup the current configuration
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

// Function to restore the configuration from backup
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
console.log('\n--- TEST 1: Normal Port Change ---');
console.log('Reading current port configuration...');
const currentConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));
console.log('Current configuration:', currentConfig);

// Create a new configuration with different ports
const newConfig = {
  tcpPort: currentConfig.tcpPort === 3359 ? 6060 : 3359,
  httpPort: currentConfig.httpPort === 3000 ? 4000 : 3000
};
console.log('New configuration:', newConfig);

// Write the new configuration to the file
console.log('Writing new port configuration...');
fs.writeFileSync(portConfigPath, JSON.stringify(newConfig, null, 2));
console.log('Port configuration updated. The application should detect this change and restart the servers.');

// Wait a moment and then read the configuration again to verify it was updated
setTimeout(() => {
  const updatedConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));
  console.log('Verified updated configuration:', updatedConfig);
  console.log('Check the application logs to confirm the servers restarted with the new ports.');

  // Test invalid port values
  console.log('\n--- TEST 2: Invalid Port Values ---');
  const invalidConfig = {
    tcpPort: -1,
    httpPort: 999999
  };
  console.log('Invalid configuration:', invalidConfig);
  console.log('Writing invalid port configuration...');
  fs.writeFileSync(portConfigPath, JSON.stringify(invalidConfig, null, 2));
  console.log('Invalid port configuration written. The application should detect invalid values and use current values.');

  setTimeout(() => {
    const correctedConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));
    console.log('Corrected configuration:', correctedConfig);
    console.log('Check the application logs to confirm the invalid ports were handled correctly.');

    // Test empty file
    console.log('\n--- TEST 3: Empty Configuration File ---');
    console.log('Writing empty configuration file...');
    fs.writeFileSync(portConfigPath, '');
    console.log('Empty configuration file written. The application should recreate the file with current settings.');

    setTimeout(() => {
      const recreatedConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));
      console.log('Recreated configuration:', recreatedConfig);
      console.log('Check the application logs to confirm the empty file was handled correctly.');

      // Test invalid JSON
      console.log('\n--- TEST 4: Invalid JSON ---');
      console.log('Writing invalid JSON...');
      fs.writeFileSync(portConfigPath, '{invalid json}');
      console.log('Invalid JSON written. The application should restore the file with current settings.');

      setTimeout(() => {
        try {
          const restoredConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));
          console.log('Restored configuration:', restoredConfig);
          console.log('Check the application logs to confirm the invalid JSON was handled correctly.');

          // Restore the original configuration
          console.log('\n--- Restoring Original Configuration ---');
          if (restoreConfig()) {
            console.log('Original configuration restored successfully.');
          } else {
            console.log('Failed to restore original configuration.');
          }
        } catch (error) {
          console.error('Error parsing configuration after invalid JSON test:', error.message);
          console.log('Restoring original configuration...');
          if (restoreConfig()) {
            console.log('Original configuration restored successfully.');
          } else {
            console.log('Failed to restore original configuration.');
          }
        }
      }, 1000);
    }, 1000);
  }, 1000);
}, 1000);
