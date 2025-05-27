const index = require('./index');

// Wait a short time to allow the async initialization to complete
setTimeout(() => {
  console.log('Checking server initialization...');
  
  // Check if the servers are initialized
  if (index.tcpServer && index.httpServer) {
    console.log('SUCCESS: Both TCP and HTTP servers are initialized');
  } else {
    console.log('FAILURE: Servers are not properly initialized');
    if (!index.tcpServer) console.log('TCP server is not initialized');
    if (!index.httpServer) console.log('HTTP server is not initialized');
  }
  
  // Exit the process
  process.exit(0);
}, 2000);