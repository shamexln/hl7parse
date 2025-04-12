var hl7 = require('simple-hl7');
const ExcelJS = require('exceljs');
const sqlite3 = require('sqlite3').verbose();
const winston = require('winston');  // 引入winston进行
const path = require('path');
const logger = require('./logger');
const { initializeDatabase } = require('./init_database');
const { initializeCodeSystem, getDescription } = require('./init_codesystem');
const { DATABASE_FILE, EXCEL_FILE, TABLE_HL7_PATIENTS, CODE_SYSTEM} = require('./config');
const helpFunctions = require('./helper');

// 调用数据库初始化函数
initializeDatabase();
initializeCodeSystem();

// 导出到excel
function exportPatientsToExcel(databasePath, outputExcelPath) {
    const db = new sqlite3.Database(databasePath);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('HL7 Patients');

    db.serialize(() => {
        // 获取列名
        db.all(`PRAGMA table_info(\`${TABLE_HL7_PATIENTS}\`)`, [], (err, columns) => {
            if (err) {
                logger.error('Error fetching column info:', err);
                return;
            }

            const columnNames = columns.map(col => col.name);

            // 使用数据库字段名作为Excel表头
            sheet.columns = columnNames.map(name => ({ header: name, key: name }));

            // 读取表中数据
            db.all(`SELECT * FROM ${TABLE_HL7_PATIENTS}`, [], (err, rows) => {
                if (err) {
                    logger.error('Error fetching data from hl7_patients:', err);
                    return;
                }

                // 将数据添加到 Excel 工作表中
                rows.forEach(row => sheet.addRow(row));

                workbook.xlsx.writeFile(outputExcelPath)
                    .then(() => {
                        logger.info('Data exported successfully to:', outputExcelPath);
                    })
                    .catch(err => {
                        logger.error('Error writing Excel file:', err);
                    })
                    .finally(() => db.close());  // 确保关闭数据库
            });
        });
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
    logger.info('Input Parameter', Object.keys(params).reduce((acc, key) => {
        acc[key] = safeValue(params[key]);
        return acc;
    }, {}));
}

async function savePatientData(hl7Message) {
    const db = new sqlite3.Database(DATABASE_FILE);
    const safeValue = (value) => (value == null ? null : value.toString());
    const msh = hl7Message.msg.header
    if (!msh) {
        logger.error('No MSH segment found in received HL7 message');

        return;
    }
    if (typeof msh.getComponent !== "function") {
        logger.error("mshSegment.getComponent is not a function");
    }

    const msgDateTimeField = msh.getField(5);
    // 如果字段中包含子组件（例如 '^' 分隔）
    let msgDateTime;
    if (typeof msgDateTimeField === 'string') {
        msgDateTime = helpFunctions.getComponentFromField(msgDateTimeField, 0);
    } else {
        logger.warn('Date Time message field is undefined or malformed');
    }

    logger.info('Date Time:', {msgDateTime: safeValue(msgDateTime)});

    const localDataTime = helpFunctions.convertToUTCDateTime(msgDateTimeField);
    logger.info('Local Date Time:', {localDataTime: safeValue(localDataTime)} );

    const utcDate = helpFunctions.convertToUTCDate(msgDateTimeField);
    logger.info('UTC Date:', {utcDate: safeValue(utcDate)} );


    const utcTime = helpFunctions.convertToUTCTime(msgDateTimeField);
    logger.info('UTC Time:', {utcTime: safeValue(utcTime)} );

    const utcHour = helpFunctions.convertToUTCHour(msgDateTimeField);
    logger.info('UTC Hour:', {utcHour: safeValue(utcHour)} );

    const pv1 = hl7Message.msg.getSegment('PV1');
    if (!pv1) {
        logger.error('No pv1 segment found in received HL7 message');

        return;
    }
    if (typeof pv1.getComponent !== "function") {
        logger.error("pv1.getComponent is not a function");
    }
    const apl = pv1.getField(3);

    // 如果字段中包含子组件（例如 '^' 分隔）
    let careUnit;
    if (typeof apl === 'string') {
        careUnit = helpFunctions.getComponentFromField(apl, 0);
    } else {
        logger.warn('Care Unit field is undefined or malformed');
    }

    logger.info('Care unit :', {careUnit: safeValue(careUnit)} );

    // 如果字段中包含子组件（例如 '^' 分隔）
    let bedLabel;
    if (typeof apl === 'string') {
        bedLabel = helpFunctions.getComponentFromField(apl, 2);
    } else {
        logger.warn('Bed label field is undefined or malformed');
    }

    logger.info('Bed label:',{bedLabel: safeValue(bedLabel)} );

    const pid = hl7Message.msg.getSegment('PID');
    if (!pid) {
        logger.error('No PID segment found in received HL7 message');

        return;
    }
    if (typeof pid.getComponent !== "function") {
        logger.error("pidSegment.getComponent is not a function");
    }

    const patientIDField = pid.getField(3);
    // 如果字段中包含子组件（例如 '^' 分隔）
    let patientID;
    if (typeof patientIDField === 'string') {
        patientID = helpFunctions.getComponentFromField(patientIDField, 0);
    } else {
        logger.warn('Patient ID field is undefined or malformed');
    }

    logger.info('Patient ID:', {patientID: safeValue(patientID)} );



    const patientName = pid.getComponent(5, 2) + ' ' + pid.getComponent(5, 1); // Field 5: Name
    const secondpatientID = pid.getComponent(4,1); // Field 7: Date of Birth

    const [lastName, firstName] = patientName.split(' '); // Split Last and First Name

    // 68484^MDC_ATTR_ALARM_PRIORITY
    // alarm grade
    // 获取告警优先级
    const alarmPriority = helpFunctions.getObxValueByIdentifier(hl7Message, 'MDC_ATTR_ALARM_PRIORITY');
    if (alarmPriority) {
        logger.info('Alarm Priority:', {alarmPriority: safeValue(alarmPriority)} );
    }

    // 获取告警状态
    const alarmState = helpFunctions.getObxValueByIdentifier(hl7Message, 'MDC_ATTR_ALARM_STATE');
    if (alarmState) {
        logger.info('Alarm State:', {alarmState: safeValue(alarmState)} );
    }

    // 获取告警内容
    const alarmMessage = helpFunctions.getObxValueByIdentifier(hl7Message, 'MDC_EVT_ALARM');
    if (alarmMessage) {
        logger.info('Alarm Message:',{alarmMessage: safeValue(alarmMessage)} );
    }

    // 使用修改后的函数查找所有数值类型的OBX-CWE
    /*const cweObxData = helpFunctions.extractObxCodesByValueType(hl7Message,'CWE');
    let targetObxCWEData = null;
    // 检查是否找到了数据
    if (cweObxData.length > 0) {
        let lastData = null;
        // 打印所有NM类型的OBX段信息
        cweObxData.forEach((data, index) => {
            logger.info(`数值型OBX(${index + 1}):`, {
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
            // 一个文件只有一个
            // 所以在循环内保存一个值
            lastData = data;

        });

        if (lastData) {
            targetObxCWEData = {...lastData};
        }

    } else {
        logger.warn('Not find OBX in targetObxCWEData');
    }
    // 使用修改后的函数查找所有数值类型的OBX-NM
    const numericObxData = helpFunctions.extractObxCodesByValueType(hl7Message);

    let targetObxNMData = null;
    // 检查是否找到了数据
    if (numericObxData.length > 0) {
        let lastData = null;
        // 打印所有NM类型的OBX段信息
        numericObxData.forEach((data, index) => {
            logger.info(`数值型OBX(${index + 1}):`, {
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
            // 一个文件只有一个
            // 所以在循环内保存一个值
            lastData = data;

        });

        if (lastData) {
            targetObxNMData = {...lastData};
        }

    } else {
        logger.warn('Not find OBX in targetObxNMData');
    }*/


   /* logger.info('Input Parameter', {
        local_time: safeValue(localDataTime),
        utcDate: safeValue(utcDate),
        utcTime: safeValue(utcTime),
        utcHour: safeValue(utcHour),
        bedLabel: safeValue(bedLabel),
        patientID: safeValue(patientID),
        mon_unit: null,
        careUnit: safeValue(careUnit),
        alarmPriority: safeValue(alarmPriority),
        alarmState: safeValue(alarmState),
        Alarm_Grade_2: null,
        alarmMessage: safeValue(alarmMessage),
        param_id: safeValue(targetObxData.observationCode),
        param_value: safeValue(targetObxData.observationValue),
        param_uom: safeValue(targetObxData.unitCode),
        param_upper_lim: safeValue(targetObxData.upperLim),
        param_lower_lim: safeValue(targetObxData.lowLim),
        Limit_Violation_Type: safeValue(helpFunctions.getLimViolation(targetObxData.limViolation)),
        Limit_Violation_Value: safeValue(helpFunctions.getLimViolationValue(targetObxData.upperLim, targetObxData.lowLim, targetObxData.observationCode, targetObxNMData.limViolation)),
        onset_tick: null,
        alarm_duration: null,
        change_time_UTC: null,
        change_tick: null,
        aborted: null,
        raw_message: safeValue(hl7Message.msg)
    });*/


    const cweObxData = helpFunctions.extractObxCodesByValueType(hl7Message, 'CWE');
    const targetObxCWEData = logAndGetLastData(cweObxData, 'CWE');

    const numericObxData = helpFunctions.extractObxCodesByValueType(hl7Message);
    const targetObxNMData = logAndGetLastData(numericObxData, 'Numeric');

    logInputParameters({
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
        param_value: targetObxNMData?.observationValue || null,
        param_uom: targetObxNMData?.unitCode || null,
        param_upper_lim: targetObxNMData?.upperLim || null,
        param_lower_lim: targetObxNMData?.lowLim || null,
        Limit_Violation_Type: helpFunctions.getLimViolation(targetObxCWEData?.limViolation),
        Limit_Violation_Value: helpFunctions.getLimViolationValue(
            targetObxNMData?.upperLim,
            targetObxNMData?.lowLim,
            targetObxNMData?.observationValue,
            targetObxCWEData?.limViolation
        ),
        onset_tick: null,
        alarm_duration: null,
        change_time_UTC: null,
        change_tick: null,
        aborted: null,
        raw_message: hl7Message.msg
    });

    const dbRunAsync = (db, query, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(query, params, function(err) {
                if (err) reject(err);
                else resolve(this); // 使用this可以得到lastID、changes等信息
            });
        });
    };

    (async () => {
        try {
            const result = await dbRunAsync(
                db,
                `INSERT INTO ${TABLE_HL7_PATIENTS} (local_time, Date, Time, Hour, bed_label, pat_ID, mon_unit, care_unit, alarm_grade,
                                   alarm_state, Alarm_Grade_2, alarm_message, param_id, param_value, param_uom,
                                   param_upper_lim, param_lower_lim, Limit_Violation_Type, Limit_Violation_Value, onset_tick,
                                   alarm_duration, change_time_UTC, change_tick, aborted,
                                       raw_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                                                                                                 ?)`,
                [
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
                    safeValue(targetObxNMData.observationCode),
                    safeValue(targetObxNMData.observationValue),
                    safeValue(getDescription(targetObxNMData.unitCode)),
                    safeValue(targetObxNMData.upperLim),
                    safeValue(targetObxNMData.lowLim),
                    safeValue(helpFunctions.getLimViolation(targetObxCWEData.limViolation)),
                    helpFunctions.getLimViolationValue(
                        targetObxNMData?.upperLim,
                        targetObxNMData?.lowLim,
                        targetObxNMData?.observationValue,
                        targetObxCWEData?.limViolation
                    ),
                    null,
                    null,
                    null,
                    null,
                    null,
                    safeValue(hl7Message.msg)
                ]
            );

            // 成功插入后的逻辑
            logger.info('Patient saved with ID:', result.lastID);
            /*exportPatientsToExcel(DATABASE_FILE, EXCEL_FILE);*/
        } catch (error) {
            // 插入数据失败的逻辑
            logger.error('Error inserting patient:', error);
        }
    })();

    /*db.run(
        `INSERT INTO ${TABLE_HL7_PATIENTS} (local_time, Date, Time, Hour, bed_label, pat_ID, mon_unit, care_unit, alarm_grade,
                                   alarm_state, Alarm_Grade_2, alarm_message, param_id, param_value, param_uom,
                                   param_upper_lim, param_lower_lim, Limit_Violation_Type, Limit_Violation_Value, onset_tick,
                                   alarm_duration, change_time_UTC, change_tick, aborted,
                                       raw_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                                                                                                 ?)`,
        [ safeValue(localDataTime), safeValue(utcDate), safeValue(utcTime), safeValue(utcHour), safeValue(bedLabel), safeValue(patientID), null, safeValue(careUnit), safeValue(alarmPriority), safeValue(alarmState),
            null, safeValue(alarmMessage), safeValue(targetObxData.observationCode), safeValue(targetObxData.observationValue), safeValue(getDescription(targetObxData.unitCode)), safeValue(targetObxData.upperLim), safeValue(targetObxData.lowLim), safeValue(helpFunctions.getLimViolation(targetObxData.limViolation)), helpFunctions.getLimViolationValue(
            targetObxNMData?.upperLim,
            targetObxNMData?.lowLim,
            targetObxNMData?.observationValue,
            targetObxCWEData?.limViolation), null,
            null, null, null, null,
            safeValue(hl7Message.msg)],
        function (err) {
            if (err) logger.error('Error inserting patient:', err);
            else {
                logger.info('Patient saved with ID:', this.lastID);
                exportPatientsToExcel(DATABASE_FILE, EXCEL_FILE);

            }
        }
    );*/
}

////////////////////SERVER///////////////////
var app = hl7.tcp();

app.use(function(req, res, next) {
    logger.info('Received HL7 message:\n' + req.msg.toString());
    next();
});

//create middleware
app.use(async (req, res, next) => {
    //create middleware for certain message types
    if (req.type != 'ORU' || req.event != 'R40') {
        return next();
    }

    try {
        await savePatientData(req); // 确保数据已完成存储
        next();                     // 然后再去下一个中间件
    } catch (error) {
        next(error);                // 出错时传递给Express错误处理中间件
    }

});

//Send Ack
app.use(function(req, res, next) {
    logger.info('************sending ack****************')
    res.end();
})

//Error Handler
app.use(function(err, req, res, next) {
    var msa = res.ack.getSegment('MSA');
    msa.setField(1, 'AE');
    msa.setField(2, req.msg.getSegment('MSH').getField(10)); // 返回消息ID作为ACK消息引用
    logger.error('HL7 handle message error', err);
    res.end();
});


app.start(3359);
logger.info('tcp interface listening on ' + 3359);

// 添加需要的新依赖
const express = require('express');
const cors = require('cors');
const port = 3000;

// 创建HTTP API服务
const httpApp = express();

// 启用CORS，允许前端访问
httpApp.use(cors());
httpApp.use(express.json());

// 提供静态文件服务（加载界面）
httpApp.use(express.static(path.join(__dirname, 'public')));

// 当访问根路径时，发送 index.html
httpApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API端点: Excel 导出的功能（可以供前端调用）
httpApp.get('/exportExcel', (req, res) => {
    exportPatientsToExcel(DATABASE_FILE, excelFile);
    res.json({ message: "Exporting data initiated, please check logs." });
});

// API端点：查询所有病人
httpApp.get('/api/patients', (req, res) => {
    const db = new sqlite3.Database(DATABASE_FILE, sqlite3.OPEN_READONLY, (openErr) => {
        if (openErr) {
            logger.error('Failed to open database:', openErr);
            return res.status(500).json({ error: "Failed to connect to database" });
        }
    });

    db.all(`SELECT * FROM ${TABLE_HL7_PATIENTS}`, (err, rows) => {
        if (err) {
            logger.error('Error querying patients:', err);
            res.status(500).json({ error: "Internal server error while querying database" });
        } else {
            res.json(rows);
        }

        // 安全关闭数据库连接，不管成功还是失败，都必须安全关闭连接
        db.close((closeErr) => {
            if (closeErr) {
                logger.error('Error closing database:', closeErr);
            }
        });
    });

});

// API端点：按姓名查询病人
httpApp.get('/api/patients/search', (req, res) => {
    const { name } = req.query;
    const db = new sqlite3.Database(DATABASE_FILE);
    db.all(
        `SELECT * FROM ${TABLE_HL7_PATIENTS} WHERE last_name LIKE ? OR first_name LIKE ?`,
        [`%${name}%`, `%${name}%`],
        (err, rows) => {
            if (err) {
                logger.error('Error searching patients:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});

// API端点：按ID查询病人
httpApp.get('/api/patients/:id/paginated', (req, res) => {
    const { id } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;


    getPaginatedData(DATABASE_FILE, TABLE_HL7_PATIENTS, id, page, pageSize, (err, result) => {
        if (err) {
            res.status(500).json({ error: "Internal Server Error" });
        } else {
            // 使用map移除raw_message字段
            const modifiedRows = result.rows.map(({ raw_message, ...rest }) => rest);

            res.json({
                ...result,
                rows: modifiedRows
            });

        }
    });

});

// 数据库分页查询逻辑
function getPaginatedData(databaseFile, tableName, patID, page = 1, pageSize = 10, callback) {
    const offset = (page - 1) * pageSize;
    const db = new sqlite3.Database(databaseFile);


    db.serialize(() => {
        db.get(`SELECT COUNT(*) AS total FROM ${tableName} WHERE pat_ID = ?`, [patID], (err, totalResult) => {
            if (err) {
                logger.error("Error counting records:", err);
                callback(err);
                db.close();
                return;
            }

            const total = totalResult.total;

            db.all(`SELECT * FROM ${tableName} WHERE pat_ID = ? LIMIT ? OFFSET ?`, [patID, pageSize, offset], (err, rows) => {
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
                    totalPages: Math.ceil(total / pageSize)
                });

                db.close();
            });
        });
    });

}

// 启动HTTP服务器在8080端口
httpApp.listen(port, () => {
    logger.info(`HTTP API listening on port ${port}\n`);
    logger.info(`HTTP API server started on port ${port}\n`);
});
