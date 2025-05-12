const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require('fs');
const sqlite3 = require("sqlite3").verbose();
const logger = require("./logger");
const { DATABASE_FILE, TABLE_HL7_PATIENTS } = require("./config");
const { createPatientExcelWorkbook } = require("./export");
const { getConnectionStats, getClientInfo } = require("./tcp-server");
const { getAllTags } = require("./init_codesystem");
const { 
  createCustomTagMapping, 
  getCustomTagMapping, 
  updateCustomTagMapping, 
  deleteCustomTagMapping, 
  getAllCustomTagMappingNames,
  initializeCustomTagMappings,
  cloneCustomTagMapping
} = require("./custom_tags");

/**
 * Creates an Express application for the HTTP API
 * @returns {express.Application} - Express application
 */
function createHttpApp() {
  const app = express();

  // Enable CORS for frontend access
  app.use(cors());
  app.use(express.json());

  // Serve root path
  app.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "browser", "index.html"));
  });

  // API endpoint: Query all patients
  app.get("/api/patients", (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const db = new sqlite3.Database(
      DATABASE_FILE,
      sqlite3.OPEN_READONLY,
      (openErr) => {
        if (openErr) {
          logger.error("Failed to open database:", openErr);
          return res.status(500).json({ error: "Failed to connect to database" });
        }
      },
    );

    db.all(`SELECT * FROM ${TABLE_HL7_PATIENTS}`, (err, rows) => {
      if (err) {
        logger.error("Error querying patients:", err);
        res
          .status(500)
          .json({ error: "Internal server error while querying database" });
      } else {
        res.json(rows);
      }

      // Safely close database connection
      db.close((closeErr) => {
        if (closeErr) {
          logger.error("Error closing database:", closeErr);
        }
      });
    });
  });

  // API endpoint: Search patients by name
  app.get("/api/patients/search", (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { name } = req.query;
    const db = new sqlite3.Database(DATABASE_FILE);
    db.all(
      `SELECT * FROM ${TABLE_HL7_PATIENTS} WHERE last_name LIKE ? OR first_name LIKE ?`,
      [`%${name}%`, `%${name}%`],
      (err, rows) => {
        if (err) {
          logger.error("Error searching patients:", err);
          return res.status(500).json({ error: err.message });
        }
        res.json(rows);
      },
    );
  });

  // API endpoint: Paginated patient query
  app.get("/api/patients/paginated/:id?", (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { startTime, endTime } = req.query;
    let { id } = req.params;
    if (!id || id.trim() === '') {
      id = null; // Explicitly indicate search for all patients
    }
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;

    getPaginatedData(
      DATABASE_FILE,
      TABLE_HL7_PATIENTS,
      id,
      startTime,
      endTime,
      page,
      pageSize,
      (err, result) => {
        if (err) {
          res.status(500).json({ error: "Internal Server Error" });
        } else {
          // Use map to remove raw_message field
          const modifiedRows = result.rows.map(
            ({ raw_message, ...rest }) => rest,
          );

          res.json({
            ...result,
            rows: modifiedRows,
          });
        }
      },
    );
  });

  // API endpoint: Export patient data to Excel
  app.get('/api/patients/export/:id?', async (req, res) => {
    const patientId = req.params.id && req.params.id.trim();
    const { startTime, endTime } = req.query;
    const db = new sqlite3.Database(DATABASE_FILE);
    const tableName = TABLE_HL7_PATIENTS;

    // Fetch data from database for patientId
    const fetchDataFromDB = (patientId) => {
      return new Promise((resolve, reject) => {
        let query = `SELECT * FROM ${tableName}`;
        let conditions = [];
        let params = [];

        if (patientId) {
          conditions.push('pat_ID = ?');
          params.push(patientId);
        }
        if (startTime) {
          conditions.push('Date >= ?');
          params.push(startTime);
        }
        if (endTime) {
          conditions.push('Date <= ?');
          params.push(endTime);
        }
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        db.all(query, params, (err, rows) => {
          if (err) {
            logger.error('Database query error:', err);
            reject(err);
          } else {
            resolve(rows); // Return queried data
          }
        });
      });
    };

    try {
      const filteredData = await fetchDataFromDB(patientId, startTime, endTime);
      // Create a new Excel workbook and worksheet
      const workbook = createPatientExcelWorkbook(filteredData);

      res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
          'Content-Disposition',
          `attachment; filename=patients_data_${patientId || 'all'}_${Date.now()}.xlsx`
      );
      await workbook.xlsx.write(res);
      // Must call end to explicitly notify client that transmission is complete
      res.end();

    } catch (error) {
      console.error('export excel fail:', error);
      res.status(500).send('export excel fail');
    } finally {
      db.close();
    }
  });

  // API endpoint: Get connection statistics
  app.get("/api/connections", (req, res) => {
    try {
      const stats = getConnectionStats();
      res.json({
        success: true,
        stats
      });
      logger.debug("Connection statistics accessed via API");
    } catch (error) {
      logger.error(`Error retrieving connection statistics: ${error.message}`);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve connection statistics",
        error: error.message
      });
    }
  });

  // API endpoint: Get detailed information about a specific client
  app.get("/api/connections/:clientId", (req, res) => {
    try {
      const { clientId } = req.params;
      const clientInfo = getClientInfo(clientId);

      if (!clientInfo) {
        return res.status(404).json({
          success: false,
          message: `Client with ID ${clientId} not found`
        });
      }

      res.json({
        success: true,
        client: clientInfo
      });
      logger.debug(`Client information accessed via API for client ${clientId}`);
    } catch (error) {
      logger.error(`Error retrieving client information: ${error.message}`);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve client information",
        error: error.message
      });
    }
  });

  // API endpoint: Update port configuration
  app.post("/api/port-config", (req, res) => {
    try {
      const { tcpPort, httpPort } = req.body;
      const portConfigPath = path.join(process.cwd(), 'port-config.json');

      // Validate port values
      if (!tcpPort && !httpPort) {
        return res.status(400).json({ 
          success: false, 
          message: "At least one port (tcpPort or httpPort) must be provided" 
        });
      }

      // Read current configuration
      const currentConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));
      const newConfig = { ...currentConfig };

      // Update TCP port (if provided)
      if (tcpPort !== undefined) {
        if (!isValidPort(Number(tcpPort))) {
          return res.status(400).json({ 
            success: false, 
            message: "Invalid TCP port. Port must be a number between 1 and 65535." 
          });
        }
        newConfig.tcpPort = Number(tcpPort);
      }

      // Update HTTP port (if provided)
      if (httpPort !== undefined) {
        if (!isValidPort(Number(httpPort))) {
          return res.status(400).json({ 
            success: false, 
            message: "Invalid HTTP port. Port must be a number between 1 and 65535." 
          });
        }
        newConfig.httpPort = Number(httpPort);
      }

      // Write new configuration to file
      fs.writeFileSync(portConfigPath, JSON.stringify(newConfig, null, 2));

      // Return success response
      res.json({ 
        success: true, 
        message: "Port configuration updated successfully",
        config: newConfig
      });

      logger.info(`Port configuration updated via API: TCP port ${newConfig.tcpPort}, HTTP port ${newConfig.httpPort}`);
    } catch (error) {
      logger.error(`Error updating port configuration: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update port configuration", 
        error: error.message 
      });
    }
  });

  // API endpoint: Get port configuration
  app.get("/api/port-config", (req, res) => {
    try {
      const portConfigPath = path.join(process.cwd(), 'port-config.json');

      // Read current configuration
      const currentConfig = JSON.parse(fs.readFileSync(portConfigPath, 'utf8'));

      // Return success response
      res.json({ 
        success: true, 
        config: currentConfig
      });

      logger.info(`Port configuration retrieved via API`);
    } catch (error) {
      logger.error(`Error retrieving port configuration: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to retrieve port configuration", 
        error: error.message 
      });
    }
  });

  // API endpoint: Get all tags from 300.xml (read-only default mapping)
  app.get("/api/default/tags", (req, res) => {
    try {
      const tags = getAllTags();

      // Return success response
      res.json({ 
        success: true, 
        tags: tags
      });

      logger.info(`Default tags retrieved via API`);
    } catch (error) {
      logger.error(`Error retrieving default tags: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to retrieve default tags", 
        error: error.message 
      });
    }
  });

  // API endpoint: Initialize custom tag mappings from a specific file
  app.post("/api/custom-tags/initialize", (req, res) => {
    try {
      const { filename } = req.body;

      if (!filename) {
        return res.status(400).json({ 
          success: false, 
          message: "Filename is required" 
        });
      }

      // Initialize custom tag mappings from the specified file
      initializeCustomTagMappings(filename);

      // Return success response
      res.json({ 
        success: true, 
        message: `Custom tag mappings initialized from ${filename}`
      });

      logger.info(`Custom tag mappings initialized from ${filename} via API`);
    } catch (error) {
      logger.error(`Error initializing custom tag mappings: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to initialize custom tag mappings", 
        error: error.message 
      });
    }
  });

  // API endpoint: List all custom tag mappings
  app.get("/api/custom-tags", (req, res) => {
    try {
      const mappingNames = getAllCustomTagMappingNames();

      // Return success response
      res.json({ 
        success: true, 
        mappings: mappingNames
      });

      logger.info(`All custom tag mappings list retrieved via API`);
    } catch (error) {
      logger.error(`Error retrieving custom tag mappings list: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to retrieve custom tag mappings list", 
        error: error.message 
      });
    }
  });

  // API endpoint: Get custom tag mapping by name
  app.get("/api/:mappingName/tags", (req, res) => {
    try {
      const { mappingName } = req.params;

      // Get the custom mapping
      const result = getCustomTagMapping(mappingName);

      if (!result.success) {
        return res.status(404).json(result);
      }

      // Return success response
      res.json({ 
        success: true, 
        tags: result.mapping.tags,
        mappingName: mappingName,
        createdAt: result.mapping.createdAt,
        updatedAt: result.mapping.updatedAt
      });

      logger.info(`Custom tags for mapping "${mappingName}" retrieved via API`);
    } catch (error) {
      logger.error(`Error retrieving custom tags: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to retrieve custom tags", 
        error: error.message 
      });
    }
  });

  // API endpoint: Create a new custom tag mapping
  app.post("/api/custom-tags", (req, res) => {
    try {
      const { name, tags, filename } = req.body;

      if (!name) {
        return res.status(400).json({ 
          success: false, 
          message: "Mapping name is required" 
        });
      }

      // Create the custom mapping
      // Use the provided filename or default to 'custom_tags.json'
      const result = createCustomTagMapping(name, tags, filename);

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Return success response
      res.status(201).json(result);

      logger.info(`New custom tag mapping "${name}" created via API${filename ? ` using file ${filename}` : ''}`);
    } catch (error) {
      logger.error(`Error creating custom tag mapping: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to create custom tag mapping", 
        error: error.message 
      });
    }
  });

  // API endpoint: Update an existing custom tag mapping
  app.put("/api/custom-tags/:name", (req, res) => {
    try {
      const { name } = req.params;
      const { tags, filename } = req.body;

      if (!tags) {
        return res.status(400).json({ 
          success: false, 
          message: "Tags are required" 
        });
      }

      // Update the custom mapping
      // Use the provided filename or default to 'custom_tags.json'
      const result = updateCustomTagMapping(name, tags, filename);

      if (!result.success) {
        return res.status(404).json(result);
      }

      // Return success response
      res.json(result);

      logger.info(`Custom tag mapping "${name}" updated via API${filename ? ` using file ${filename}` : ''}`);
    } catch (error) {
      logger.error(`Error updating custom tag mapping: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update custom tag mapping", 
        error: error.message 
      });
    }
  });

  // API endpoint: Delete a custom tag mapping
  app.delete("/api/custom-tags/:name", (req, res) => {
    try {
      const { name } = req.params;
      // For DELETE requests, query parameters are used instead of body
      const { filename } = req.query;

      // Delete the custom mapping
      // Use the provided filename or default to 'custom_tags.json'
      const result = deleteCustomTagMapping(name, filename);

      if (!result.success) {
        return res.status(404).json(result);
      }

      // Return success response
      res.json(result);

      logger.info(`Custom tag mapping "${name}" deleted via API${filename ? ` from file ${filename}` : ''}`);
    } catch (error) {
      logger.error(`Error deleting custom tag mapping: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to delete custom tag mapping", 
        error: error.message 
      });
    }
  });

  // API endpoint: Clone a custom tag mapping
  app.post("/api/custom-tags/clone", (req, res) => {
    try {
      const { sourceName, targetName } = req.body;

      if (!sourceName) {
        return res.status(400).json({ 
          success: false, 
          message: "Source mapping name is required" 
        });
      }

      if (!targetName) {
        return res.status(400).json({ 
          success: false, 
          message: "Target mapping name is required" 
        });
      }

      // Clone the custom mapping
      // Use targetName as filename
      const result = cloneCustomTagMapping(sourceName, targetName, targetName);

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Return success response
      res.status(201).json(result);

      logger.info(`Custom tag mapping "${sourceName}" cloned to "${targetName}" via API using file ${targetName}`);
    } catch (error) {
      logger.error(`Error cloning custom tag mapping: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to clone custom tag mapping", 
        error: error.message 
      });
    }
  });

  // API endpoint: Delete a custom tag mapping (alternative endpoint)
  app.post("/api/custom-tags/delete", (req, res) => {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ 
          success: false, 
          message: "Mapping name is required" 
        });
      }

      // Delete the custom mapping
      // Use name as the filename
      const result = deleteCustomTagMapping(name, name);

      if (!result.success) {
        return res.status(404).json(result);
      }

      // Return success response
      res.json(result);

      logger.info(`Custom tag mapping "${name}" deleted via API from file ${name}`);
    } catch (error) {
      logger.error(`Error deleting custom tag mapping: ${error.message}`);
      res.status(500).json({ 
        success: false, 
        message: "Failed to delete custom tag mapping", 
        error: error.message 
      });
    }
  });

  // Serve static files (UI)
  app.use(express.static(path.join(process.cwd(), "public", "browser")));

  // For all other requests return index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), "public", "browser", "index.html"));
  });

  return app;
}

/**
 * Database paginated query logic
 * @param {string} databaseFile - Path to database file
 * @param {string} tableName - Table name to query
 * @param {string} patID - Patient ID to filter by
 * @param {string} startTime - Start time to filter by
 * @param {string} endTime - End time to filter by
 * @param {number} page - Page number
 * @param {number} pageSize - Page size
 * @param {Function} callback - Callback function
 */
function getPaginatedData(
  databaseFile,
  tableName,
  patID,
  startTime,
  endTime,
  page = 1,
  pageSize = 10,
  callback,
) {
  const offset = (page - 1) * pageSize;
  const db = new sqlite3.Database(databaseFile);
  let whereParts = [];
  let params = [];
  if (patID != null && patID.trim() !== '') {
    whereParts.push('pat_ID = ?');
    params.push(patID);
  }
  if (startTime) {
    whereParts.push('Date >= ?');
    params.push(startTime);
  }
  if (endTime) {
    whereParts.push('Date <= ?');
    params.push(endTime);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const totalQuery = `SELECT COUNT(*) AS total FROM ${tableName} ${whereClause}`;
  const dataQuery = `SELECT * FROM ${tableName} ${whereClause} LIMIT ? OFFSET ?`;
  const dataParams = params.concat([pageSize, offset]);

  db.serialize(() => {
    db.get(totalQuery, params, (err, totalResult) => {
        if (err) {
          logger.error("Error counting records:", err);
          callback(err);
          db.close();
          return;
        }

        const total = totalResult.total;

        db.all(dataQuery, dataParams, (err, rows) => {
            if (err) {
              logger.error("Error fetching paginated data:", err);
              callback(err);
              db.close();
              return;
            }

            callback(null, {
              rows,
              total,
              page,
              pageSize,
              totalPages: Math.ceil(total / pageSize),
            });

            db.close();
          },
        );
      },
    );
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
 * Creates an HTTP server
 * @param {number} port - Port number to listen on
 * @returns {http.Server} - HTTP server instance
 */
function startHttpServer(port) {
  const app = createHttpApp();
  const server = app.listen(port, () => {
    logger.info(`HTTP API listening on port ${port}\n`);
    logger.info(`HTTP API server started on port ${port}\n`);
  });

  return server;
}

/**
 * Restarts the HTTP server on a new port
 * @param {http.Server} currentServer - Current HTTP server instance
 * @param {number} newPort - New port number to listen on
 * @returns {Promise<http.Server>} - New HTTP server instance
 */
function restartHttpServer(currentServer, newPort) {
  return new Promise((resolve) => {
    if (currentServer) {
      currentServer.close(() => {
        logger.info(`HTTP server closed, restarting on port ${newPort}`);
        resolve(startHttpServer(newPort));
      });
    } else {
      resolve(startHttpServer(newPort));
    }
  });
}

module.exports = {
  createHttpApp,
  startHttpServer,
  restartHttpServer,
  isValidPort,
  getPaginatedData
};
