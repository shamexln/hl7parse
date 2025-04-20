var hl7 = require("simple-hl7");
const ExcelJS = require('exceljs'); // 引入exceljs库
const sqlite3 = require("sqlite3").verbose();
const winston = require("winston"); // 引入winston进行
const path = require("path");
const logger = require("./logger");
const { initializeDatabase } = require("./init_database");
const { initializeCodeSystem, getDescription, getObservationType} = require("./init_codesystem");
const {
  DATABASE_FILE,
  TABLE_HL7_PATIENTS,
  CODE_SYSTEM,
} = require("./config");
const helpFunctions = require("./helper");

// 调用数据库初始化函数
initializeDatabase();
initializeCodeSystem();

// 导出到excel
function exportPatientsToExcel(databasePath, outputExcelPath) {
  const db = new sqlite3.Database(databasePath);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("HL7 Patients");

  db.serialize(() => {
    // 获取列名
    db.all(
      `PRAGMA table_info(\`${TABLE_HL7_PATIENTS}\`)`,
      [],
      (err, columns) => {
        if (err) {
          logger.error("Error fetching column info:", err);
          return;
        }

        const columnNames = columns.map((col) => col.name);

        // 使用数据库字段名作为Excel表头
        sheet.columns = columnNames.map((name) => ({
          header: name,
          key: name,
        }));

        // 读取表中数据
        db.all(`SELECT * FROM ${TABLE_HL7_PATIENTS}`, [], (err, rows) => {
          if (err) {
            logger.error("Error fetching data from hl7_patients:", err);
            return;
          }

          // 将数据添加到 Excel 工作表中
          rows.forEach((row) => sheet.addRow(row));

          workbook.xlsx
            .writeFile(outputExcelPath)
            .then(() => {
              logger.info("Data exported successfully to:", outputExcelPath);
            })
            .catch((err) => {
              logger.error("Error writing Excel file:", err);
            })
            .finally(() => db.close()); // 确保关闭数据库
        });
      },
    );
  });
}

function logAndGetLastData(obxData, obxType) {
  if (!obxData || obxData.length === 0) {
    logger.warn(`Not find OBX in target ${obxType} data`);
    return null;
  }

  obxData.forEach((data, index) => {
    logger.info(`${obxType} OBX(${index + 1}):`, {
      obxIndex: data.setId,
      observationCode: data.observationCode,
      observationName: data.observationName,
      observationValue: data.observationValue,
      unitCode: data.unitCode,
      unitName: data.unitName,
      lowLim: data.lowLim,
      upperLim: data.upperLim,
      limViolation: data.limViolation,
      limViolationValue: data.limViolationValue,
    });
  });

  // 返回最后一个元素的副本
  return { ...obxData[obxData.length - 1] };
}

function logInputParameters(params) {
  const safeValue = (value) => (value == null ? null : value.toString());
  logger.info(
    "Input Parameter",
    Object.keys(params).reduce((acc, key) => {
      acc[key] = safeValue(params[key]);
      return acc;
    }, {}),
  );
}

async function savePatientData(hl7Message) {
  const dbRunAsync = (db, query, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(query, params, function (err) {
        if (err) {
          reject(err);
        }  else {
          resolve(this);
        } // 使用this可以得到lastID、changes等信息
      });
    });
  };
  let db;
  try {
    db = new sqlite3.Database(DATABASE_FILE);
    const safeValue = (value) => (value == null ? null : value.toString());
    const msh = hl7Message.header;
    if (!msh) {
      logger.error("No MSH segment found in received HL7 message");

      return;
    }
    if (typeof msh.getComponent !== "function") {
      logger.warn("mshSegment.getComponent is not a function");
    }

    // get msg type MSH-9-1 is ORU , event MSH-9-2 is R40
    const msgTypeField = msh.getField(7);
    if (typeof msgTypeField === "string") {
      const msgType = helpFunctions.getComponentFromField(msgTypeField, 0);
      const msgEvent = helpFunctions.getComponentFromField(msgTypeField, 1);
      if (msgType != 'ORU' || msgEvent != 'R40') {
        logger.warn("Received HL7 message type:", { msgType: safeValue(msgType) , msgEvent: safeValue(msgEvent) });
        return;
      }
    } else {
      logger.warn("Care Unit field is undefined or malformed");
    }

    const msgDateTimeField = msh.getField(5);
    // 如果字段中包含子组件（例如 '^' 分隔）
    let msgDateTime;
    if (typeof msgDateTimeField === "string") {
      msgDateTime = helpFunctions.getComponentFromField(msgDateTimeField, 0);
    } else {
      logger.warn("Date Time message field is undefined or malformed");
    }

    logger.info("Date Time:", { msgDateTime: safeValue(msgDateTime) });

    const localDataTime = helpFunctions.convertToUTCDateTime(msgDateTimeField);
    logger.info("Local Date Time:", { localDataTime: safeValue(localDataTime) });

    const utcDate = helpFunctions.convertToUTCDate(msgDateTimeField);
    logger.info("UTC Date:", { utcDate: safeValue(utcDate) });

    const utcTime = helpFunctions.convertToUTCTime(msgDateTimeField);
    logger.info("UTC Time:", { utcTime: safeValue(utcTime) });

    const utcHour = helpFunctions.convertToUTCHour(msgDateTimeField);
    logger.info("UTC Hour:", { utcHour: safeValue(utcHour) });

    const pv1 = hl7Message.getSegment("PV1");
    if (!pv1) {
      logger.warn("No pv1 segment found in received HL7 message");

      return;
    }
    if (typeof pv1.getComponent !== "function") {
      logger.warn("pv1.getComponent is not a function");
    }
    const apl = pv1.getField(3);

    // 如果字段中包含子组件（例如 '^' 分隔）
    let careUnit;
    if (typeof apl === "string") {
      careUnit = helpFunctions.getComponentFromField(apl, 0);
    } else {
      logger.warn("Care Unit field is undefined or malformed");
    }

    logger.info("Care unit :", { careUnit: safeValue(careUnit) });

    // 如果字段中包含子组件（例如 '^' 分隔）
    let bedLabel;
    if (typeof apl === "string") {
      bedLabel = helpFunctions.getComponentFromField(apl, 2);
    } else {
      logger.warn("Bed label field is undefined or malformed");
    }

    logger.info("Bed label:", { bedLabel: safeValue(bedLabel) });

    const pid = hl7Message.getSegment("PID");
    if (!pid) {
      logger.warn("No PID segment found in received HL7 message");

      return;
    }
    if (typeof pid.getComponent !== "function") {
      logger.warn("pidSegment.getComponent is not a function");
    }

    const patientIDField = pid.getField(3);
    // 如果字段中包含子组件（例如 '^' 分隔）
    let patientID;
    if (typeof patientIDField === "string") {
      patientID = helpFunctions.getComponentFromField(patientIDField, 0);
    } else {
      logger.warn("Patient ID field is undefined or malformed");
    }

    logger.info("Patient ID:", { patientID: safeValue(patientID) });

    const patientName = pid.getComponent(5, 2) + " " + pid.getComponent(5, 1); // Field 5: Name
    const secondpatientID = pid.getComponent(4, 1); // Field 7: Date of Birth

    const [lastName, firstName] = patientName.split(" "); // Split Last and First Name

    // OBR
    const obr = hl7Message.getSegment("OBR");
    if (!obr) {
      logger.error("No OBR segment found in received HL7 message");

      return;
    }
    if (typeof obr.getComponent !== "function") {
      logger.warn("obrSegment.getComponent is not a function");
    }
    const deviceGUIDField = obr.getField(13);
    // 如果字段中包含子组件（例如 '^' 分隔）
    let deviceGUID;
    if (typeof deviceGUIDField === "string") {
      deviceGUID = helpFunctions.getComponentFromField(deviceGUIDField, -1);
    } else {
      logger.warn("Device GUID field is undefined or malformed");
    }

    // 68484^MDC_ATTR_ALARM_PRIORITY
    // alarm grade
    // 获取告警优先级
    let alarmPriority = helpFunctions.getObxValueByIdentifier(
        hl7Message,
        "MDC_ATTR_ALARM_PRIORITY",
    );

    // 检查是否为空或无效
    if (!alarmPriority || alarmPriority.trim() === '') {
      logger.warn('Alarm priority is empty or undefined, setting to default priority.');
      alarmPriority = 'Normal'; // 或使用默认值，例如 "Normal"、"Low" 等
    } else {
      alarmPriority = helpFunctions.getAlarmPriority(alarmPriority);
    }

    if (alarmPriority) {
      logger.info("Alarm Priority:", { alarmPriority: safeValue(alarmPriority) });
    }

    // 获取告警状态
    const alarmState = helpFunctions.getObxValueByIdentifier(
        hl7Message,
        "MDC_ATTR_ALARM_STATE",
    );
    if (alarmState) {
      logger.info("Alarm State:", { alarmState: safeValue(alarmState) });
    }


    const cweObxData = helpFunctions.extractObxCodesByValueType(
        hl7Message,
        "CWE",
    );
    const targetObxCWEData = logAndGetLastData(cweObxData, "CWE");

    const numericObxData = helpFunctions.extractObxCodesByValueType(hl7Message);
    const targetObxNMData = logAndGetLastData(numericObxData, "Numeric");

    // 获取告警内容
    let alarmMessage = helpFunctions.getObxValueByIdentifier(
        hl7Message,
        "MDC_EVT_ALARM",
    );
    // 判断 alarmMessage 是否为空
    if (!alarmMessage || alarmMessage.trim() === '') {
      logger.warn('Alarm message is empty or undefined, no further processing will occur.');
      alarmMessage = "Unknown"; // 或者设置默认值
    } else {

      // 根据 encode 值进行处理
      switch (alarmMessage) {
        case '196674': // 拼接 observationName 和 lowLim
          if (targetObxNMData && safeValue(targetObxNMData.lowLim) !== undefined) {
            alarmMessage = `${targetObxNMData.observationName} < ${targetObxNMData.lowLim}`;
            logger.info('Processed observationName with lowLim:', alarmMessage);
          } else {
          if (!targetObxNMData) {
            logger.warn('targetObxNMData is null for encode 196674');
          } else {
            logger.warn('lowLim is undefined for encode 196674');
          }
        }
          break;

        case '196652': // 拼接 observationName 和 upperLim
          if (targetObxNMData && safeValue(targetObxNMData.upperLim) !== undefined) {
            alarmMessage = `${targetObxNMData.observationName} > ${targetObxNMData.upperLim}`;
            logger.info('Processed observationName with upperLim:', alarmMessage);
          } else {
            if (!targetObxNMData) {
              logger.warn('targetObxNMData is null for encode 196652');
            } else {
              logger.warn('upperLim is undefined for encode 196652');
            }
          }

          break;

        default: // 其他 encode 的默认处理
          logger.info('No special handling for encode:', safeValue(alarmMessage));
          // 调用封装的方法获取描述
          alarmMessage = getDescription(alarmMessage) + getObservationType(alarmMessage);
          break;
      }

    }

    if (alarmMessage) {
      logger.info("Alarm Message:", { alarmMessage: safeValue(alarmMessage) });
    }

    logInputParameters({
      deviceGUID,
      local_time: localDataTime,
      utcDate,
      utcTime,
      utcHour,
      bedLabel,
      patientID,
      mon_unit: null,
      careUnit,
      alarmPriority,
      alarmState,
      Alarm_Grade_2: null,
      alarmMessage,
      param_id: targetObxNMData?.observationCode || null,
      param_description: targetObxNMData?.observationName || null,
      param_value: targetObxNMData?.observationValue || null,
      param_uom: targetObxNMData?.unitCode || null,
      param_upper_lim: targetObxNMData?.upperLim || null,
      param_lower_lim: targetObxNMData?.lowLim || null,
      Limit_Violation_Type: helpFunctions.getLimViolation(
          targetObxCWEData?.limViolation,
      ),
      Limit_Violation_Value: helpFunctions.getLimViolationValue(
          targetObxNMData?.upperLim,
          targetObxNMData?.lowLim,
          targetObxNMData?.observationValue,
          targetObxCWEData?.limViolation,
      ),
      onset_tick: null,
      alarm_duration: null,
      change_time_UTC: null,
      change_tick: null,
      aborted: null,
      raw_message: hl7Message,
    });

    const safeGetProperty = (obj, property, defaultValue = null) => {
      return obj ? safeValue(obj[property]) : defaultValue;
    };

    const limViolationValue = (() => {
      // 仅在两个对象都不为null且所需属性都存在的情况下调用函数
      if (targetObxNMData && targetObxCWEData) {
        return helpFunctions.getLimViolationValue(
            targetObxNMData.upperLim,
            targetObxNMData.lowLim,
            targetObxNMData.observationValue,
            targetObxCWEData.limViolation
        );
      }
      return null;
    })();

    const limViolation = targetObxCWEData
        ? safeValue(helpFunctions.getLimViolation(targetObxCWEData.limViolation))
        : null;


    const unitCode = targetObxNMData && targetObxNMData.unitCode
        ? safeValue(getDescription(targetObxNMData.unitCode))
        : null;


    const result = await dbRunAsync(
        db,
        `INSERT INTO ${TABLE_HL7_PATIENTS} (device_id, local_time, Date, Time, Hour, bed_label, pat_ID, mon_unit, care_unit, alarm_grade,
                                   alarm_state, Alarm_Grade_2, alarm_message, param_id, param_description, param_value, param_uom,
                                   param_upper_lim, param_lower_lim, Limit_Violation_Type, Limit_Violation_Value, onset_tick,
                                   alarm_duration, change_time_UTC, change_tick, aborted,
                                       raw_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                                                                                                 ?)`,
        [
          safeValue(deviceGUID),
          safeValue(localDataTime),
          safeValue(utcDate),
          safeValue(utcTime),
          safeValue(utcHour),
          safeValue(bedLabel),
          safeValue(patientID),
          null,
          safeValue(careUnit),
          safeValue(alarmPriority),
          safeValue(alarmState),
          null,
          safeValue(alarmMessage),
          safeGetProperty(targetObxNMData, 'observationCode'),
          safeGetProperty(targetObxNMData, 'observationName'),
          safeGetProperty(targetObxNMData, 'observationValue'),
          unitCode,
          safeGetProperty(targetObxNMData, 'upperLim'),
          safeGetProperty(targetObxNMData, 'lowLim'),
          limViolation,
          limViolationValue,
          null,
          null,
          null,
          null,
          null,
          safeValue(hl7Message),
        ],
    );

    // 成功插入后的逻辑
    logger.info("Patient saved with ID:", result.lastID);
  } catch (error) {
    logger.error('Database operation failed', error);
    throw error; // 抛出异常，让调用者知道保存失败
  } finally {
    db.close((err) => {
      if (err) {
        logger.error('Database closing error', err);
      } else {
        logger.info('Database connection closed');
      }
    });
  }


}

////////////////////SERVER///////////////////
// 在初始化服务器前添加自定义 MLLP 消息解析
const net = require('net');
const server = net.createServer(socket => {
  let buffer = Buffer.alloc(0);

  socket.on('data', async data => {
    buffer = Buffer.concat([buffer, data]);

    // 查找并处理完整的 MLLP 消息
    let startMarker = buffer.indexOf(0x0b); // MLLP 开始标记
    while (startMarker !== -1) {
      let endMarker = buffer.indexOf(Buffer.from([0x1c, 0x0d]), startMarker);
      if (endMarker === -1) break; // 消息不完整

      // 提取完整消息
      const message = buffer.slice(startMarker + 1, endMarker).toString('utf8');

      try {
        // 处理消息...
        logger.debug('processHL7Message begin');
        await processHL7Message(message, socket);
        logger.debug('processHL7Message end');
      } catch (error) {
        logger.error('Error processing HL7 message:', error);
        // 可选：发送错误响应
        socket.write("\x0b" + "AE|Error processing message" + "\x1c\x0d");
      }

      // 更新 buffer，移除已处理的消息
      buffer = buffer.slice(endMarker + 2);
      startMarker = buffer.indexOf(0x0b);
    }
  });

  socket.on('error', err => {
    logger.error('Socket error:', err);
    socket.destroy();
  });

  socket.on('end', () => {
    logger.info('connection disconnect');
    cleanupSocket();
  });


  socket.on('close', hadError => {
    logger.info(`Socket is closed with exception: ${hadError}`);
    cleanupSocket();
  });

  // 定义资源清理方法
  function cleanupSocket() {
    if (!socket.destroyed) {
      socket.end();
      socket.destroy();
    }
    buffer = null; // 清空缓存
    logger.info('clean socket resource');
  }

});


// 处理 HL7 消息的函数
async function processHL7Message(rawMessage, socket) {
  logger.info("Received Raw HL7 message type:", { RawMsg: rawMessage  });
  // 使用 simple-hl7 解析消息
  const parser = new hl7.Parser();
  const parsedMessage = parser.parse(rawMessage);
  logger.debug('savePatientData begin');
  await savePatientData(parsedMessage);
  logger.debug('savePatientData end');

  socket.write("\x0b" + "ok" + "\x1c\x0d");
}

server.listen(3359, () => {
  logger.info("TCP interface listening on 3359");
});


// 添加需要的新依赖
const express = require("express");
const cors = require("cors");
const port = 3000;

// 创建HTTP API服务
const httpApp = express();


// 启用CORS，允许前端访问
httpApp.use(cors());
httpApp.use(express.json());


// 当访问根路径时，发送 index.html
httpApp.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "browser", "index.html"));
});

// API端点：查询所有病人
httpApp.get("/api/patients", (req, res) => {
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

    // 安全关闭数据库连接，不管成功还是失败，都必须安全关闭连接
    db.close((closeErr) => {
      if (closeErr) {
        logger.error("Error closing database:", closeErr);
      }
    });
  });
});

// API端点：按姓名查询病人
httpApp.get("/api/patients/search", (req, res) => {
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

// API端点：按ID查询病人
// Express原生并不直接支持路径内可选参数位于中间位置，但位于末尾时是允许的：
httpApp.get("/api/patients/paginated/:id?", (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  let { id } = req.params;
  if (!id || id.trim() === '') {
    id = null; // 明确表示搜索所有病人
  }
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 10;

  getPaginatedData(
    DATABASE_FILE,
    TABLE_HL7_PATIENTS,
    id,
    page,
    pageSize,
    (err, result) => {
      if (err) {
        res.status(500).json({ error: "Internal Server Error" });
      } else {
        // 使用map移除raw_message字段
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

// 数据库分页查询逻辑
function getPaginatedData(
  databaseFile,
  tableName,
  patID,
  page = 1,
  pageSize = 10,
  callback,
) {
  const offset = (page - 1) * pageSize;
  const db = new sqlite3.Database(databaseFile);
  const hasPatientId = patID != null && patID.trim() !== '';
  const whereClause = hasPatientId ? 'WHERE pat_ID = ?' : '';
  const totalQuery = `SELECT COUNT(*) AS total FROM ${tableName} ${whereClause}`;
  const dataQuery = `SELECT * FROM ${tableName} ${whereClause} LIMIT ? OFFSET ?`;
  const totalParams = hasPatientId ? [patID] : [];
  const dataParams = hasPatientId ? [patID, pageSize, offset] : [pageSize, offset];


  db.serialize(() => {
    db.get(totalQuery, totalParams,(err, totalResult) => {
        if (err) {
          logger.error("Error counting records:", err);
          callback(err);
          db.close();
          return;
        }

        const total = totalResult.total;

        db.all(dataQuery, dataParams,(err, rows) => {
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

// 提供 Excel 文件导出接口
httpApp.get('/api/patients/export/:id?',async (req, res) => {
  const patientId = req.params.id && req.params.id.trim();
  const db = new sqlite3.Database(DATABASE_FILE);
  const tableName = TABLE_HL7_PATIENTS;

  // 从数据库查询 patientId 对应的数据
  const fetchDataFromDB = (patientId) => {
    return new Promise((resolve, reject) => {

      let query = `SELECT * FROM ${tableName}`;
      let params = [];

      if (patientId) {
        query += ' WHERE pat_ID = ?';
        params.push(patientId);
      }


      db.all(query, params, (err, rows) => {
        if (err) {
          logger.error('Database query error:', err);
          reject(err);
        } else {
          resolve(rows); // 查询到的数据返回
        }
      });
    });
  };



  try {
    const filteredData = await fetchDataFromDB(patientId);
    // ===== Step 2: 创建一个新的Excel workbook 和 worksheet =====
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Patients Data Export');

    if (filteredData.length > 0) {
      // 动态生成表头 (基于数据库返回的第一条数据的字段)
      worksheet.columns = Object.keys(filteredData[0]).map((field) => ({
        header: field,       // 表头显示数据库字段名，也可以进行中文映射
        key: field,
        width: 20
      }));

      // 填充所有行
      filteredData.forEach((item) => {
        worksheet.addRow(item);
      });
    } else {
      worksheet.columns = [{ header: '提示', key: 'info', width: 30 }];
      worksheet.addRow({ info: '没有找到匹配的数据' });
    }


    res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
        'Content-Disposition',
        `attachment; filename=patients_data_${patientId}_${Date.now()}.xlsx`
    );
    await workbook.xlsx.write(res);
    // 完成后必须调用 end，明确通知客户端传输完成
    res.end();


  } catch (error) {
    console.error('导出Excel文件失败:', error);
    res.status(500).send('导出Excel文件失败');
  }
});


// 提供静态文件服务（加载界面）
httpApp.use(express.static(path.join(process.cwd(), "public", "browser")));

// 对于所有其他请求返回 index.html
httpApp.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "browser", "index.html"));
});

// 启动HTTP服务器
httpApp.listen(port, () => {
  logger.info(`HTTP API listening on port ${port}\n`);
  logger.info(`HTTP API server started on port ${port}\n`);
});
