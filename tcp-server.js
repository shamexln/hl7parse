const net = require('net');
const logger = require('./logger');
const hl7 = require('simple-hl7');
const { processHL7Message } = require('./hl7-processor');

// Track active connections and message statistics
const connectionStats = {
    activeConnections: 0,
    totalConnections: 0,
    clients: new Map(), // Map to store client information
    totalMessagesReceived: 0
};

/**
 * Creates a TCP server for receiving HL7 messages
 * @param {number} port - Port number to listen on
 * @returns {net.Server} - TCP server instance
 */
function createTcpServer(port) {
    const parser = new hl7.Parser();

    const server = net.createServer(socket => {
        let buffer = Buffer.alloc(0);

        // Get client information
        const clientId = `${socket.remoteAddress}:${socket.remotePort}`;

        // Update connection statistics
        connectionStats.activeConnections++;
        connectionStats.totalConnections++;

        // Initialize client info in the map
        connectionStats.clients.set(clientId, {
            ip: socket.remoteAddress,
            port: socket.remotePort,
            connectedAt: new Date(),
            messagesReceived: 0,
            lastMessageAt: null,
            messages: [] // Array to store message history
        });

        logger.info(`New client connected: ${clientId}`, {
            clientId,
            activeConnections: connectionStats.activeConnections,
            totalConnections: connectionStats.totalConnections
        });

        socket.on('data', async data => {
            buffer = Buffer.concat([buffer, data]);

            // Find and process complete MLLP messages
            let startMarker = buffer.indexOf(0x0b); // MLLP start marker
            while (startMarker !== -1) {
                let endMarker = buffer.indexOf(Buffer.from([0x1c, 0x0d]), startMarker);
                if (endMarker === -1) break; // Message incomplete

                // Extract complete message
                const message = buffer.slice(startMarker + 1, endMarker).toString('utf8');

                // Update message statistics
                connectionStats.totalMessagesReceived++;
                const clientInfo = connectionStats.clients.get(clientId);
                clientInfo.messagesReceived++;
                clientInfo.lastMessageAt = new Date();

                // Store message in history (limit to last 10 messages to prevent memory issues)
                const messageInfo = {
                    timestamp: new Date(),
                    content: message,
                    size: message.length
                };
                clientInfo.messages.push(messageInfo);
                if (clientInfo.messages.length > 10) {
                    clientInfo.messages.shift(); // Remove oldest message if more than 10
                }

                // Log message receipt
                logger.info(`Received HL7 message from ${clientId}`, {
                    clientId,
                    messageNumber: clientInfo.messagesReceived,
                    messageSize: message.length,
                    messagePreview: message.substring(0, 100) + (message.length > 100 ? '...' : '')
                });

                try {
                    // Process message...
                    logger.debug('processHL7Message begin');
                    await processHL7Message(message, parser);
                    logger.debug('processHL7Message end');

                    // Send acknowledgment
                    socket.write("\x0b" + "ok" + "\x1c\x0d");

                    // Log successful processing
                    logger.info(`Successfully processed HL7 message from ${clientId}`, {
                        clientId,
                        messageNumber: clientInfo.messagesReceived
                    });
                } catch (error) {
                    logger.error('Error processing HL7 message:', error);
                    // Optional: send error response
                    socket.write("\x0b" + "AE|Error processing message" + "\x1c\x0d");

                    // Log processing error
                    logger.error(`Failed to process HL7 message from ${clientId}`, {
                        clientId,
                        messageNumber: clientInfo.messagesReceived,
                        error: error.message
                    });
                }

                // Update buffer, remove processed message
                buffer = buffer.slice(endMarker + 2);
                startMarker = buffer.indexOf(0x0b);
            }
        });

        socket.on('error', err => {
            logger.error(`Socket error for client ${clientId}:`, err);
            socket.destroy();
        });

        socket.on('end', () => {
            logger.info(`Client disconnected: ${clientId}`);
            cleanupSocket();
        });

        socket.on('close', hadError => {
            logger.info(`Socket closed for client ${clientId} with exception: ${hadError}`);
            cleanupSocket();
        });

        // Define cleanup method
        function cleanupSocket() {
            if (!socket.destroyed) {
                socket.end();
                socket.destroy();
            }

            // Update connection statistics
            connectionStats.activeConnections--;

            // Log final client statistics
            const clientInfo = connectionStats.clients.get(clientId);
            if (clientInfo) {
                const connectionDuration = new Date() - clientInfo.connectedAt;
                logger.info(`Client ${clientId} statistics:`, {
                    clientId,
                    messagesReceived: clientInfo.messagesReceived,
                    connectionDuration: `${Math.floor(connectionDuration / 1000)} seconds`,
                    activeConnections: connectionStats.activeConnections
                });
            }

            buffer = null; // Clear buffer
            logger.info(`Cleaned socket resources for client ${clientId}`);
        }
    });

    server.listen(port, () => {
        logger.info(`TCP interface listening on ${port}`);
    });

    return server;
}

/**
 * Restarts the TCP server on a new port
 * @param {net.Server} currentServer - Current TCP server instance
 * @param {number} newPort - New port number to listen on
 * @returns {Promise<net.Server>} - New TCP server instance
 */
function restartTcpServer(currentServer, newPort) {
    return new Promise((resolve) => {
        if (currentServer) {
            currentServer.close(() => {
                logger.info(`TCP server closed, restarting on port ${newPort}`);
                resolve(createTcpServer(newPort));
            });
        } else {
            resolve(createTcpServer(newPort));
        }
    });
}

/**
 * Validates if a port number is valid
 * @param {number} port - Port number to validate
 * @returns {boolean} - True if port is valid
 */
function isValidPort(port) {
    return Number.isInteger(port) && port > 0 && port < 65536;
}

/**
 * Gets the current connection statistics
 * @returns {Object} - Connection statistics
 */
function getConnectionStats() {
    // Convert the clients Map to an array of client objects for easier consumption
    const clientsArray = Array.from(connectionStats.clients.entries()).map(([id, info]) => {
        return {
            id,
            ip: info.ip,
            port: info.port,
            connectedAt: info.connectedAt,
            messagesReceived: info.messagesReceived,
            lastMessageAt: info.lastMessageAt,
            messages: info.messages // Include message history
        };
    });

    return {
        activeConnections: connectionStats.activeConnections,
        totalConnections: connectionStats.totalConnections,
        totalMessagesReceived: connectionStats.totalMessagesReceived,
        clients: clientsArray
    };
}

/**
 * Gets detailed information about a specific client
 * @param {string} clientId - Client ID (IP:PORT)
 * @returns {Object|null} - Client information or null if not found
 */
function getClientInfo(clientId) {
    const clientInfo = connectionStats.clients.get(clientId);
    if (!clientInfo) {
        return null;
    }

    return {
        id: clientId,
        ip: clientInfo.ip,
        port: clientInfo.port,
        connectedAt: clientInfo.connectedAt,
        messagesReceived: clientInfo.messagesReceived,
        lastMessageAt: clientInfo.lastMessageAt,
        messages: clientInfo.messages
    };
}

module.exports = {
    createTcpServer,
    restartTcpServer,
    isValidPort,
    getConnectionStats,
    getClientInfo
};
