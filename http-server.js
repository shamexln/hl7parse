const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require('fs');
const sqlite3 = require("sqlite3").verbose();
const logger = require("./logger");
const { DATABASE_FILE, TABLE_HL7_PATIENTS , LISTCODESYSTEM_API, CODESYSTEMTAGS_API, TABLE_HL7_CODESYSTEMS} = require("./config");
const { createPatientExcelWorkbook } = require("./export");
const { getConnectionStats, getClientInfo } = require("./tcp-server");
const { getAllTags, getCodeSystemNames, createCodeSystem, getCodesystemTableNameByName, updateDetailCodeSystem} = require("./codesystem");

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



  // API endpoint: List all codesystem names
  app.get(LISTCODESYSTEM_API, (req, res) => {
    try {
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

      db.all(`SELECT * FROM ${TABLE_HL7_CODESYSTEMS}`, (err, rows) => {
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


  // API endpoint: Paginated patient query
  app.get("/api/codesystem-detail/paginated/:id", async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { startTime, endTime } = req.query;
    let { id } = req.params;
    if (!id || id.trim() === '') {
      return res.status(400).json({ error: "invalid id" });
    }
    const codesystemName = req.query.codesystemname;
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;

    try {
      // Get the appropriate table name for the codesystem
      const tableName = await getCodesystemTableNameByName(codesystemName);

      getPaginatedData(
          DATABASE_FILE,
          tableName,
          "",
          "",
          "",
          page,
          pageSize,
          (err, result) => {
            if (err) {
              logger.error("Error in codesystem pagination:", err);
              res.status(500).json({ error: "Internal Server Error" });
            } else {

              res.json({
                ...result
              });
            }
          },
      );
    } catch (error) {
      logger.error("Error getting codesystem table name:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // API endpoint: get tags of a codesystem
  app.get(CODESYSTEMTAGS_API, (req, res) => {
    try {
      const { name } = req.params;
      if (!CodeSystemMappings[name]) {
        return { success: false, message: 'Custom tag mapping not found' };
      }

      // Return success response
      res.json({
        success: true,
        codesystem: CodeSystemMappings[name]
      });

      logger.info(`All ${name} tag list retrieved via API`);
    } catch (error) {
      logger.error(`Error retrieving tags list: ${error.message}`);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve tags list",
        error: error.message
      });
    }
  });

  // 更新CodeSystem接口
  app.post('/api/updatecodesystem', async (req, res) => {
    const { codesystemName, changedData } = req.body;

    if (!codesystemName || !Array.isArray(changedData)) {
      logger.error("parameter error: lack of codesystemName or changedData");
      return res.status(400).json({ error: "Invalid request body" });
    }

    // 获取表名: 你应该有类似 getCodesystemTableName 的工具函数
    const tableName = await getCodesystemTableNameByName(codesystemName);
    if (!tableName) {
      logger.error(`can not find table name, codesystemName: ${codesystemName}`);
      return res.status(400).json({ error: "Unknown codesystemName" });
    }

    // 打开SQLite数据库
    const db = new sqlite3.Database(DATABASE_FILE);

    // 批量更新逻辑（假设每个changedData内有id字段）
    let errorOccurred = false;
    let updateCount = 0;

    db.serialize(() => {
      const stmt = db.prepare(
          `UPDATE ${tableName} SET observationtype = ?, datatype = ?, encode = ? , parameterlabel = ?, encodesystem = ? , subid = ? , description = ? , source = ?, channel = ?, channelid = ? WHERE tagkey = ?`
      );

      changedData.forEach(item => {
        // 假设数据形如 {id, code, display, other_field}
        if (!item.observationtype) {
          errorOccurred = true;
          logger.error("lack of necessary field id:", item);
          return;
        }
        if (!item.datatype) {
          errorOccurred = true;
          logger.error("lack of necessary field datatype:", item);
          return;
        }
        if (!item.encode) {
          errorOccurred = true;
          logger.error("lack of necessary field encode:", item);
          return;
        }
        if (!item.parameterlabel) {
          errorOccurred = true;
          logger.error("lack of necessary field parameterlabel:", item);
          return;
        }
        if (!item.encodesystem) {
          errorOccurred = true;
          logger.error("lack of necessary field encodesystem:", item);
          return;
        }
        if (!item.subid) {
          errorOccurred = true;
          logger.error("lack of necessary field subid:", item);
          return;
        }
        if (!item.description) {
          errorOccurred = true;
          logger.error("lack of necessary field description:", item);
          return;
        }
        if (!item.source) {
          errorOccurred = true;
          logger.error("lack of necessary field source:", item);
          return;
        }
        if (!item.channel) {
          errorOccurred = true;
          logger.error("lack of necessary field channel:", item);
          return;
        }

        if (!item.channelid) {
          errorOccurred = true;
          logger.error("lack of necessary field channelid:", item);
          return;
        }

        stmt.run([item.observationtype, item.datatype, item.encode, item.parameterlabel, item.encodesystem,  item.subid, item.description, item.source, item.channel, item.channelid, item.tagkey], function (err) {
          if (err) {
            errorOccurred = true;
            logger.error("update fail:", err.message);
          } else {
            updateCount++;
          }
        });
      });


      stmt.finalize(err => {
        db.close();
        if (err || errorOccurred) {
          logger.error("batch update data fail:", err?.message);
          return res.status(500).json({ error: "batch update data fail" });
        }
        res.json({ success: true, updated: updateCount }); // 返回更新数量
      });
    });

    await updateDetailCodeSystem(tableName, changedData);
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
 * @param {string} id - Patient ID to filter by
 * @param {string} startTime - Start time to filter by
 * @param {string} endTime - End time to filter by
 * @param {number} page - Page number
 * @param {number} pageSize - Page size
 * @param {Function} callback - Callback function
 */
function getPaginatedData(
    databaseFile,
    tableName,
    id,
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
  if (id != null && id.trim() !== '') {
    whereParts.push('pat_ID = ?');
    params.push(id);
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
