var hl7 = require('simple-hl7');
const ExcelJS = require('exceljs');
const sqlite3 = require('sqlite3').verbose();
const winston = require('winston');  // 引入winston进行
const path = require('path');

// 配置winston日志系统
const logger = winston.createLogger({
    level: 'info',  // 设置日志级别（info、warn、error 等）
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),  // 错误日志
        new winston.transports.File({ filename: 'logs/combined.log' }),               // 所有日志
    ],
});

// 还可以同时开启控制台输出（开发阶段方便查看）
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
    }));
}

const databaseFile = path.join(__dirname, 'hl7_messages.db'); // SQLite数据库路径
const excelFile = path.join(__dirname, 'patients.xlsx'); // 生成的Excel文件路径


// 导出到excel
function exportPatientsToExcel(databasePath, outputExcelPath) {
    const db = new sqlite3.Database(databasePath);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('HL7 Patients');

    db.serialize(() => {
        // 获取列名
        db.all("PRAGMA table_info('hl7_patients')", [], (err, columns) => {
            if (err) {
                logger.error('Error fetching column info:', err);
                return;
            }

            const columnNames = columns.map(col => col.name);

            // 使用数据库字段名作为Excel表头
            sheet.columns = columnNames.map(name => ({ header: name, key: name }));

            // 读取表中数据
            db.all('SELECT * FROM hl7_patients', [], (err, rows) => {
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


function convertToUTCDateTime(hl7DateTime) {
    const year = parseInt(hl7DateTime.substring(0, 4));
    const month = parseInt(hl7DateTime.substring(4, 6)) - 1; // months are zero indexed
    const day = parseInt(hl7DateTime.substring(6, 8));
    const hour = parseInt(hl7DateTime.substring(8, 10));
    const minute = parseInt(hl7DateTime.substring(10, 12));
    const second = parseInt(hl7DateTime.substring(12, 14)) || 0; // 若字段缺少秒则设为0

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return date.toISOString().replace('T', ' ').substring(0, 19);
}

function convertToUTCDate(hl7DateTime) {
    const year = parseInt(hl7DateTime.substring(0, 4));
    const month = parseInt(hl7DateTime.substring(4, 6)) - 1; // months are zero indexed
    const day = parseInt(hl7DateTime.substring(6, 8));

    return new Date(Date.UTC(year, month, day)).toISOString().substring(0, 10);
}

function convertToUTCTime(hl7DateTime) {
    const year = parseInt(hl7DateTime.substring(0, 4));
    const month = parseInt(hl7DateTime.substring(4, 6)) - 1;
    const day = parseInt(hl7DateTime.substring(6, 8));
    const hour = parseInt(hl7DateTime.substring(8, 10)) || 0;
    const minute = parseInt(hl7DateTime.substring(10, 12)) || 0;
    const second = parseInt(hl7DateTime.substring(12, 14)) || 0;

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return date.toISOString().replace('T', ' ').substring(11, 15);
}

function convertToUTCHour(hl7DateTime) {
    const year = parseInt(hl7DateTime.substring(0, 4));
    const month = parseInt(hl7DateTime.substring(4, 6)) - 1;
    const day = parseInt(hl7DateTime.substring(6, 8));
    const hour = parseInt(hl7DateTime.substring(8, 10)) || 0;
    const minute = parseInt(hl7DateTime.substring(10, 12)) || 0;
    const second = parseInt(hl7DateTime.substring(12, 14)) || 0;

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return date.toISOString().replace('T', ' ').substring(11, 13);
}
/**
 * 获取字段中某个子组件
 * @param {string} field - 字段内容，如 "12345^MySubID"
 * @param {number} index - 要提取的子组件索引，从 0 开始计数
 * @param {string} delimiter - 子组件分隔符（默认 "^"）
 * @returns {string|null} - 返回目标子组件的值，或 null（如果不存在）
 */
function getComponentFromField(field, index, delimiter = "^") {
    if (!field || typeof field !== 'string') {
        logger.error('Invalid field');
        return null;
    }
    const components = field.split(delimiter); // 分割子组件
    return components[index] || null; // 返回指定索引的值，无值则返回 null
}

/**
 * 从HL7消息中根据观察标识符查找并提取OBX段的特定值
 * @param {Object} hl7Message - 已解析的HL7消息对象
 * @param {string} identifierText - 要查找的观察标识符文本（如'MDC_ATTR_ALARM_PRIORITY'）
 * @param {number} valueFieldIndex - 要提取的值字段索引，默认为5（OBX-5是观察值）
 * @returns {string|null} - 找到的值或null（如果未找到）
 */
function getObxValueByIdentifier(hl7Message, identifierText, delimiter = "^", valueFieldIndex = 5) {
    if (!hl7Message || !hl7Message.msg) {
        logger.error('Invalid HL7 message');
        return null;
    }

    // 获取所有OBX段
    const obxSegments = hl7Message.msg.getSegments('OBX');
    if (!obxSegments || obxSegments.length === 0) {
        logger.error('No OBX segments found in received HL7 message');
        return null;
    }

    // 查找包含指定标识符的OBX段
    let targetOBX = null;
    for (const obx of obxSegments) {
        const observationIdentifier = obx.getField(3); // OBX-3是观察标识符
        if (observationIdentifier && observationIdentifier.includes(identifierText)) {
            targetOBX = obx;
            break;
        }
    }

    if (!targetOBX) {
        logger.warn(`OBX segment with identifier '${identifierText}' not found in HL7 message`);
        return null;
    }

    // 获取目标值
    const value = targetOBX.getField(valueFieldIndex);
    if (value === undefined || value === null) {
        logger.warn(`Value at field index ${valueFieldIndex} is undefined or null in found OBX segment`);
        return null;
    }

    const value0 = value.split(delimiter); // 分割子组件
    return value0[0]; // 返回index=0的值
}

/**
 * 从OBX段中提取特定值类型的字段代码值
 * @param {Object} hl7Message - HL7消息对象
 * @param {string} valueType - 要查找的值类型（如'NM'表示数值类型）
 * @returns {Array} - 包含所有匹配值类型的OBX段解析结果的数组
 */
function extractObxCodesByValueType(hl7Message, valueType = "NM") {
    if (!hl7Message || !hl7Message.msg) {
        logger.error('Invalid HL7 message');
        return [];
    }

    // 获取所有OBX段
    const obxSegments = hl7Message.msg.getSegments('OBX');
    if (!obxSegments || obxSegments.length === 0) {
        logger.error('No OBX segments found in received HL7 message');
        return [];
    }

    // 查找所有匹配指定值类型的OBX段
    const results = [];

    for (const obx of obxSegments) {
        const obxValueType = obx.getField(2); // OBX-2是值类型

        if (obxValueType === valueType) {
            // 提取结果对象
            const result = {
                setId: obx.getField(1), // OBX段序号
                valueType: obxValueType,
                observationCode: null,
                observationName: null,
                observationValue: null,
                unitCode: null,
                unitName: null,
                lowLim: null,
                upperLim: null,
            };

            // 从OBX-3提取观察项目代码和名称
            const observationId = obx.getField(3);
            if (observationId) {
                const components = observationId.split('^');
                result.observationCode = components[0] || null;
                result.observationName = components[1] || null;
            }

            // 获取观察值
            result.observationValue = obx.getField(5);

            // 从OBX-6提取单位代码和名称
            const unitField = obx.getField(6);
            if (unitField) {
                const unitComponents = unitField.split('^');
                result.unitCode = unitComponents[0] || null;
                result.unitName = unitComponents[1] || null;
            }

            // 从OBX-7提取范围
            const rangeField = obx.getField(7);
            if (rangeField) {
                const rangeComponents = rangeField.split('-');
                result.lowLim = rangeComponents[0] || null;
                result.upperLim = rangeComponents[1] || null;
            }

            results.push(result);
        }
    }

    if (results.length === 0) {
        logger.warn(`No OBX segments with value type '${valueType}' found`);
    }

    return results;
}


function savePatientData(hl7Message) {
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
        msgDateTime = getComponentFromField(msgDateTimeField, 0);
    } else {
        logger.warn('Date Time message field is undefined or malformed');
    }

    logger.info('Date Time:', {msgDateTime: safeValue(msgDateTime)});

    const localDataTime = convertToUTCDateTime(msgDateTimeField);
    logger.info('Local Date Time:', {localDataTime: safeValue(localDataTime)} );

    const utcDate = convertToUTCDate(msgDateTimeField);
    logger.info('UTC Date:', {utcDate: safeValue(utcDate)} );


    const utcTime = convertToUTCTime(msgDateTimeField);
    logger.info('UTC Time:', {utcTime: safeValue(utcTime)} );

    const utcHour = convertToUTCHour(msgDateTimeField);
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
        careUnit = getComponentFromField(apl, 0);
    } else {
        logger.warn('Care Unit field is undefined or malformed');
    }

    logger.info('Care unit :', {careUnit: safeValue(careUnit)} );

    // 如果字段中包含子组件（例如 '^' 分隔）
    let bedLabel;
    if (typeof apl === 'string') {
        bedLabel = getComponentFromField(apl, 2);
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
        patientID = getComponentFromField(patientIDField, 0);
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
    const alarmPriority = getObxValueByIdentifier(hl7Message, 'MDC_ATTR_ALARM_PRIORITY');
    if (alarmPriority) {
        logger.info('Alarm Priority:', {alarmPriority: safeValue(alarmPriority)} );
    }

    // 获取告警状态
    const alarmState = getObxValueByIdentifier(hl7Message, 'MDC_ATTR_ALARM_STATE');
    if (alarmState) {
        logger.info('Alarm State:', {alarmState: safeValue(alarmState)} );
    }

    // 获取告警内容
    const alarmMessage = getObxValueByIdentifier(hl7Message, 'MDC_EVT_ALARM');
    if (alarmMessage) {
        logger.info('Alarm Message:',{alarmMessage: safeValue(alarmMessage)} );
    }

    // 使用修改后的函数查找所有数值类型的OBX段
    const numericObxData = extractObxCodesByValueType(hl7Message);
    let targetObxData = null;
    // 检查是否找到了数据
    if (numericObxData.length > 0) {
        let lastData = null;
        // 打印所有NM类型的OBX段信息
        numericObxData.forEach((data, index) => {
            logger.info(`数值型OBX(${index + 1}):`, {
                序号: data.setId,
                观察代码: data.observationCode,
                观察名称: data.observationName,
                值: data.observationValue,
                单位代码: data.unitCode,
                单位名称: data.unitName,
                最小值: data.lowLim,
                最大值: data.upperLim
            });
            // 一个文件只有一个
            // 所以在循环内保存一个值
            lastData = data;

        });

        if (lastData) {
            targetObxData = {...lastData};
        }

    } else {
        logger.warn('未找到数值类型的OBX段');
    }

    logger.info('传入参数', {
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
        Limit_Violation_Type: null,
        Limit_Violation_Value: null,
        onset_tick: null,
        alarm_duration: null,
        change_time_UTC: null,
        change_tick: null,
        aborted: null,
        raw_message: safeValue(hl7Message.msg)
    });




    db.run(
        `INSERT INTO hl7_patients (local_time, Date, Time, Hour, bed_label, pat_ID, mon_unit, care_unit, alarm_grade,
                                   alarm_state, Alarm_Grade_2, alarm_message, param_id, param_value, param_uom,
                                   param_upper_lim, param_lower_lim, Limit_Violation_Type, Limit_Violation_Value, onset_tick,
                                   alarm_duration, change_time_UTC, change_tick, aborted,
                                       raw_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                                                                                                 ?)`,
        [ safeValue(localDataTime), safeValue(utcDate), safeValue(utcTime), safeValue(utcHour), safeValue(bedLabel), safeValue(patientID), null, safeValue(careUnit), safeValue(alarmPriority), safeValue(alarmState),
            null, safeValue(alarmMessage), safeValue(targetObxData.observationCode), safeValue(targetObxData.observationValue), safeValue(targetObxData.unitCode), safeValue(targetObxData.upperLim), safeValue(targetObxData.lowLim), null, null, null,
            null, null, null, null,
            safeValue(hl7Message.msg)],
        function (err) {
            if (err) logger.error('Error inserting patient:', err);
            else {
                logger.info('Patient saved with ID:', this.lastID);
                exportPatientsToExcel(databaseFile, excelFile);

            }
        }
    );
}

////////////////////SERVER///////////////////
var app = hl7.tcp();

const db = new sqlite3.Database('hl7_messages.db');

// Create a table to store HL7 messages
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS hl7_patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            local_time TEXT,
            Date TEXT,
            Time TEXT,
            Hour TEXT,
            bed_label TEXT,
            pat_ID TEXT,
            mon_unit TEXT,
            care_unit TEXT,
            alarm_grade TEXT,
            alarm_state TEXT,
            Alarm_Grade_2 TEXT,
            alarm_message TEXT,
            param_id TEXT,
            param_value TEXT,
            param_uom TEXT,
            param_upper_lim TEXT,
            param_lower_lim TEXT,
            Limit_Violation_Type TEXT,
            Limit_Violation_Value TEXT,
            onset_tick TEXT,
            alarm_duration TEXT,
            change_time_UTC TEXT,
            change_tick TEXT,
            aborted TEXT,                       
            raw_message TEXT,
            received_at DATETIME DEFAULT CURRENT_TIMESTAMP

        )
    `);
    logger.info('HL7 table created or already exists');

});

app.use(function(req, res, next) {
    logger.info('Received HL7 message:\n' + req.msg.toString());
    next();
});

//create middleware
app.use(function(req, res, next) {
    //create middleware for certain message types
    if (req.type != 'ORU' || req.event != 'R40') {
        return next();
    }

    savePatientData(req);
    next();
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
    exportPatientsToExcel(databaseFile, excelFile);
    res.json({ message: "Exporting data initiated, please check logs." });
});

// API端点：查询所有病人
httpApp.get('/api/patients', (req, res) => {
    db.all('SELECT * FROM hl7_patients', (err, rows) => {
        if (err) {
            logger.error('Error querying patients:', err);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// API端点：按姓名查询病人
httpApp.get('/api/patients/search', (req, res) => {
    const { name } = req.query;
    db.all(
        'SELECT * FROM hl7_patients WHERE last_name LIKE ? OR first_name LIKE ?',
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
httpApp.get('/api/patients/:id', (req, res) => {
    db.get('SELECT * FROM hl7_patients WHERE pat_ID = ?', [req.params.id], (err, row) => {
        if (err) {
            logger.error('Error querying patient:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) return res.status(404).json({ message: '未找到患者' });
        res.json(row);
    });
});

// 启动HTTP服务器在8080端口
httpApp.listen(port, () => {
    logger.info('HTTP API listening on port ${port}\n');
    logger.info('HTTP API server started on port ${port}\n');
});
