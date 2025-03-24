var hl7 = require('simple-hl7');
const sqlite3 = require('sqlite3').verbose();
const winston = require('winston');  // 引入winston进行


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
        console.error('Invalid field');
        return null;
    }
    const components = field.split(delimiter); // 分割子组件
    return components[index] || null; // 返回指定索引的值，无值则返回 null
}

function savePatientData(hl7Message) {
    const msh = hl7Message.msg.header
    if (!msh) {
        logger.error('No MSH segment found in received HL7 message');

        return;
    }
    if (typeof msh.getComponent !== "function") {
        console.error("mshSegment.getComponent is not a function");
    }

    const msgDateTimeField = msh.getField(5);
    // 如果字段中包含子组件（例如 '^' 分隔）
    let msgDateTime;
    if (typeof msgDateTimeField === 'string') {
        msgDateTime = getComponentFromField(msgDateTimeField, 0);
    } else {
        logger.warn('Date Time message field is undefined or malformed');
    }

    console.log('Date Time:', msgDateTime);
    const localDataTime = convertToUTCDateTime(msgDateTimeField);
    console.log('Local Date Time:', localDataTime);

    const utcDate = convertToUTCDate(msgDateTimeField);
    console.log('UTC Time:', utcDate);


    const utcTime = convertToUTCTime(msgDateTimeField);
    console.log('UTC Time:', utcTime);

    const utcHour = convertToUTCHour(msgDateTimeField);
    console.log('UTC Hour:', utcHour);

    const pv1 = hl7Message.msg.getSegment('PV1');
    if (!pv1) {
        logger.error('No pv1 segment found in received HL7 message');

        return;
    }
    if (typeof pv1.getComponent !== "function") {
        console.error("pv1.getComponent is not a function");
    }
    const apl = pv1.getField(3);

    // 如果字段中包含子组件（例如 '^' 分隔）
    let careUnit;
    if (typeof apl === 'string') {
        careUnit = getComponentFromField(apl, 0);
    } else {
        logger.warn('Care Unit field is undefined or malformed');
    }

    console.log('Care unit :', careUnit);

    // 如果字段中包含子组件（例如 '^' 分隔）
    let bedLabel;
    if (typeof apl === 'string') {
        bedLabel = getComponentFromField(apl, 2);
    } else {
        logger.warn('Bed label field is undefined or malformed');
    }

    console.log('Bed label:', bedLabel);

    const pid = hl7Message.msg.getSegment('PID');
    if (!pid) {
        logger.error('No PID segment found in received HL7 message');

        return;
    }
    if (typeof pid.getComponent !== "function") {
        console.error("pidSegment.getComponent is not a function");
    }

    const patientIDField = pid.getField(3);
    // 如果字段中包含子组件（例如 '^' 分隔）
    let patientID;
    if (typeof patientIDField === 'string') {
        patientID = getComponentFromField(patientIDField, 0);
    } else {
        logger.warn('Patient ID field is undefined or malformed');
    }

    console.log('Patient ID:', patientID);



    const patientName = pid.getComponent(5, 2) + ' ' + pid.getComponent(5, 1); // Field 5: Name
    const secondpatientID = pid.getComponent(4,1); // Field 7: Date of Birth

    const [lastName, firstName] = patientName.split(' '); // Split Last and First Name

    db.run(
        `INSERT INTO hl7_patients (local_time, Date, Time, Hour, bed_label, pat_ID, mon_unit, care_unit, alarm_grade,
                                   alarm_state, Alarm_Grade_2, alarm_message, param_id, param_value, param_uom,
                                   param_upper_lim, param_lower_lim, Limit_Violation_Type, Limit_Violation_Value, onset_tick,
                                   alarm_duration, change_time_UTC, change_tick, aborted,
                                       patient_id, last_name, first_name, secondpatient_id, raw_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                                                                                                                 ?, ?, ?, ?, ?)`,
        [ localDataTime.toString(), utcDate.toString(), utcTime.toString(), utcHour.toString(), bedLabel.toString(), patientID.toString(), null, careUnit.toString(), null, null,
            null, null, null, null, null, null, null, null, null, null,
            null, null, null, null,
            patientID, lastName, firstName, secondpatientID, hl7Message.msg.toString()],
        function (err) {
            if (err) console.error('Error inserting patient:', err);
            else console.log('Patient saved with ID:', this.lastID);
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
            param_value REAL,
            param_uom TEXT,
            param_upper_lim REAL,
            param_lower_lim REAL,
            Limit_Violation_Type TEXT,
            Limit_Violation_Value TEXT,
            onset_tick INTEGER,
            alarm_duration INTEGER,
            change_time_UTC TEXT,
            change_tick INTEGER,
            aborted INTEGER,                       
            patient_id TEXT,
            last_name TEXT,
            first_name TEXT,
            secondpatient_id TEXT,
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
    if (req.type != 'ORU' /*|| req.event != 'A04'*/) {
        return next();
    }

    savePatientData(req);
    next();
});

//Send Ack
app.use(function(req, res, next) {
    console.log('************sending ack****************')
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


app.start(7777);
console.log('tcp interface listening on ' + 7777);

// 添加需要的新依赖
const express = require('express');
const cors = require('cors');

// 创建HTTP API服务
const httpApp = express();

// 启用CORS，允许前端访问
httpApp.use(cors());
httpApp.use(express.json());

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
    db.get('SELECT * FROM hl7_patients WHERE patient_id = ?', [req.params.id], (err, row) => {
        if (err) {
            logger.error('Error querying patient:', err);
            return res.status(500).json({ error: err.message });
        }
        if (!row) return res.status(404).json({ message: '未找到患者' });
        res.json(row);
    });
});

// 启动HTTP服务器在8080端口
httpApp.listen(8080, () => {
    console.log('HTTP API listening on port 8080');
    logger.info('HTTP API server started on port 8080');
});
