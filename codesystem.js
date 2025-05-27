const { CODE_SYSTEM, DATABASE_FILE, TABLE_HL7_PATIENTS, TABLE_HL7_CODESYSTEMS, TABLE_HL7_CODESYSTEM_300} = require('./config');
const fs = require('fs');
const xml2js = require('xml2js');
const winston = require("winston");
const parser = new xml2js.Parser();
const path = require('path');
const util = require('util');
const {initializeDatabase} = require("./init_database");
const sqlite3 = require('sqlite3').verbose();
// Add this line to import the crypto module
const crypto = require('crypto');

// 日志配置示例（仅供参考，你项目中可能已有此配置）
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

let encodeToTagMap = new Map();
let allTags = [];
// Store  mappings in memory
// Structure: { [mappingName]: { tags: [...], descrMap:encodeToDescriptionMap, obsTypMap:encodeToObservationTypeMap, srcChaMap:subidToSourceChannelMap,  createdAt: Date, updatedAt: Date } }
const CodeSystemMappings = {};

function getFilePath(filename) {
    // 尝试多种可能的路径
    const possiblePaths = [
        path.join(__dirname, filename),
        path.join(process.cwd(), filename),
        path.join(path.dirname(process.execPath), filename)
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    // 如果都找不到，返回默认路径
    return path.join(__dirname, filename);
}

async function updateCodesysteminDB(data, detailtablename = TABLE_HL7_CODESYSTEM_300, codesystemname = '300') {
    const db = new sqlite3.Database(DATABASE_FILE);
    try {
        // 将 get 和 run 方法转为 Promise 形式
        const dbGet = util.promisify(db.get).bind(db);
        const dbRun = util.promisify(db.run).bind(db);
        // 查询总记录数
        const countRow = await dbGet(`SELECT COUNT(*) AS count FROM ${TABLE_HL7_CODESYSTEMS}`);
        const totalCount = countRow.count;
        logger.info(`当前表总记录数为：${totalCount}`);

        // 查询是否已存在
        const row = await dbGet(
            `SELECT * FROM ${TABLE_HL7_CODESYSTEMS} WHERE codesystem_name = ?`,
            [codesystemname]
        );

        const xmlData = data.toString();

        if (row) {
            // 已存在则更新
            await dbRun(
                `UPDATE ${TABLE_HL7_CODESYSTEMS} SET codesystem_filename = ?,  codesystem_tablename = ?,  codesystem_xml = ? WHERE codesystem_name = ?`,
                [`${codesystemname}_map.xml`, detailtablename, xmlData, codesystemname]
            );
            logger.info(`Codesystem ${codesystemname} updated successfully`);
        } else {
            // 不存在则插入
            await dbRun(
                `INSERT INTO ${TABLE_HL7_CODESYSTEMS} (codesystem_id, codesystem_name, codesystem_filename, codesystem_tablename, codesystem_isdeault, codesystem_iscurrent, codesystem_xml) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [totalCount, codesystemname, `${codesystemname}_map.xml`, detailtablename, 'true', 'true', xmlData]
            );
            logger.info(`Codesystem ${codesystemname} inserted successfully`);
        }

    }catch (err) {
        logger.error("Database operation failed\n:", err);
    } finally {
        db.close((closeErr) => {
            if (closeErr) {
                logger.error("Database close failed\n:", closeErr);
            }
        });
    }

}

async function updateDetailCodeSystem(tablename, tags) {
    const db = new sqlite3.Database(DATABASE_FILE);
    try {
        const dbGet = util.promisify(db.get).bind(db);
        const dbRun = util.promisify(db.run).bind(db);

        await dbRun(
            `CREATE TABLE IF NOT EXISTS ${tablename} (
                                                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                    tagkey TEXT,
                                                    observationtype TEXT,
                                                    datatype TEXT,
                                                    encode TEXT,
                                                    parameterlabel TEXT,
                                                    encodesystem TEXT,
                                                    subid TEXT,
                                                    description TEXT,
                                                    source TEXT,
                                                    mds TEXT,
                                                    mdsid TEXT,
                                                    vmd TEXT,
                                                    vmdid TEXT,
                                                    channel TEXT,
                                                    channelid TEXT
             )`
        );




        for (const item of tags) {

            const row = await dbGet(
                `SELECT tagkey FROM ${tablename} WHERE tagkey = ?`,
                [item.tagkey]
            );

            if (row) {
                // 存在，执行 UPDATE
                await dbRun(
                    `UPDATE ${tablename}
                SET observationtype = ?, datatype = ?, encode = ?, parameterlabel = ?, encodesystem = ?, subid = ?, description = ?, source = ?, mds = ?, mdsid = ?, vmd = ?, vmdid = ?, channel = ?, channelid = ?
             WHERE tagkey = ?`,
                    [item.observationtype, item.datatype, item.encode, item.parameterlabel, item.encodesystem, item.subid, item.description,
                        item.source, item.mds, item.mdsid, item.vmd, item.vmdid, item.channel, item.channelid, item.tagkey]
                );
                logger.info(`Table ${tablename} updated successfully`);
            } else {
                // 不存在，执行 INSERT
                await dbRun(
                    `INSERT INTO ${tablename}
                (tagkey, observationtype, datatype, encode, parameterlabel, encodesystem, subid, description, source, mds, mdsid, vmd, vmdid, channel, channelid)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [item.tagkey, item.observationtype, item.datatype, item.encode, item.parameterlabel, item.encodesystem, item.subid,
                        item.description, item.source, item.mds, item.mdsid, item.vmd, item.vmdid, item.channel, item.channelid]
                );
                logger.info(`Table ${tablename} inserted successfully`);
            }

        }

        // update value in  encodeMap with new tags
        for (const tag of tags) {
            const result = encodeToTagMap.get(tag.encode) || [];
            const matchingResult = result.find(item =>
                 tag.encode === item.encode && tag.subid === item.subid
            );
            if (matchingResult) {
                matchingResult.description = tag.description;
            }

        }



    }catch (err) {
        logger.error("Database operation failed\n:", err);
    } finally {
        db.close((closeErr) => {
            if (closeErr) {
                logger.error("Database close failed\n:", closeErr);
            }
        });
    }
}

function buildSpecificKeyIndex(tags, fields) {
    const index = new Map();
    tags.forEach(tag => {
        fields.forEach(field => {
            const val = tag[field];
            if (val !== undefined) {
                const key = String(val).trim();
                if (!index.has(key)) index.set(key, []);
                index.get(key).push(tag);
            }
        });
    });
    return index;
}

async function initializeCodeSystem(xmlData= CODE_SYSTEM) {
    try {
        let bomRemovedData;
        const xmlPath = getFilePath(xmlData);

        const data = await fs.promises.readFile(xmlPath);
        // write the raw data with default name 300 into db
        await updateCodesysteminDB(data);
        bomRemovedData = data.toString().replace("\ufeff", "");


        // 使用 Promise 包装解析过程
        const result = await parseXML(bomRemovedData);

        // 调试: 输出XML结构
        logger.info('XML structure:', JSON.stringify(result, null, 2).substring(0, 500) + '...');
        // 获取根元素名称
        const rootName = Object.keys(result)[0];
        logger.info('Root element name:', rootName);

        // 遍历解析后的 XML 数据
        const rootElement = result[rootName];

        // 查找包含encode和description的元素集合
        // 假设标签集合可能直接在根元素下或者在某个子元素下
        let tags;
        if (rootElement.tag) {
            tags = rootElement.tag;
        } else {
            // 如果没有直接的tag属性，需要查看实际结构
            // 这里需要根据实际XML结构进行调整
            logger.error('No "tag" element found. Please check XML structure');
            return;
        }


        // 将 encode 和 description 存入 Map
        if (Array.isArray(tags)) {
            // 存储所有标签
            allTags = tags.map(tag => {
                // 将每个标签的属性从数组转换为单个值
                const processedTag = {};
                // Add a random UUID as tagkey
               /* processedTag.tagkey = crypto.randomUUID().split('-')[0];*/
                Object.keys(tag).forEach(key => {
                    if (Array.isArray(tag[key]) && tag[key].length > 0) {
                        processedTag[key] = tag[key][0];
                    }
                });
                return processedTag;
            });

            encodeToTagMap = buildSpecificKeyIndex(allTags, ['encode']);


            // Create the new mapping
            const now = new Date();
            const name = xmlPath.substring(xmlPath.lastIndexOf(path.sep) + 1, xmlPath.lastIndexOf('_map'));
            // Validate name
            if (!name || typeof name !== 'string' || name.trim() === '') {
                return { success: false, message: 'Invalid mapping name' };
            }

            // Check if name already exists
            if (CodeSystemMappings[name]) {
                return { success: false, message: 'A mapping with this name already exists' };
            }

            CodeSystemMappings[name] = {
                tags: allTags,
                createdAt: now,
                updatedAt: now
            };
            // only for re-write to xml file, if there is new key in code
            //saveCodeSystemToFile(CodeSystemMappings[name], xmlData);
            await updateDetailCodeSystem(TABLE_HL7_CODESYSTEM_300,  CodeSystemMappings[name].tags);
            logger.info('Code system initialized successfully.');

        }
        else {
            logger.error('Tags element is not an array:', tags);
        }
    } catch (err) {
        logger.error('Error parsing XML:', err);
    }
}
function parseXML(xmlData) {
    return new Promise((resolve, reject) => {
        parser.parseString(xmlData, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}
function getDescription(encode, subid="") {
    const result = encodeToTagMap.get(encode) || [];
    if (subid) {
        // Find the first tag that matches both encode and subid
        const matchingTag = result.find(encodes =>
            encodes.encode && encodes.subid === subid && encodes.encode === encode
        );
        return matchingTag ? matchingTag.description : undefined;
    } else {
        // Find the first tag that matches encode
        const matchingTag = result.find(encodes =>
            encodes.encode && encodes.encode === encode
        );
        return matchingTag ? matchingTag.description : undefined;
    }
}

function getObservationType(encode, subid="") {
    const result = encodeToTagMap.get(encode) || [];
    if (subid) {
        // Find the first tag that matches both encode and subid
        const matchingTag = result.find(encodes =>
            encodes.encode && encodes.subid === subid && encodes.encode === encode
        );
        return matchingTag ? matchingTag.observationtype : undefined;
    } else {
        // Find the first tag that matches encode
        const matchingTag = result.find(encodes =>
            encodes.encode && encodes.encode === encode
        );
        return matchingTag ? matchingTag.observationtype : undefined;
    }
}

function getSourceChannel(encode, subid) {
    const result = encodeToTagMap.get(encode) || [];
    if (subid) {
        // Find the first tag that matches both encode and subid
        const matchingTag = result.find(encodes =>
            encodes.encode && encodes.subid === subid && encodes.encode === encode
        );
        return matchingTag ? encodes.source + '/' + encodes.channel : undefined;
    } else {
      return undefined;
    }

}

function getAllTags() {
    return allTags;
}
/**
 * Function to get the list of xml file
 * @param {string} filepath - default path
 * @returns {string[]} - mapping name
 */
function getCodeSystemNames(filepath = process.cwd()) {
    try {
        const files = fs.readdirSync(filepath);
        return files
            .filter(file => file.endsWith('_map.xml'))
            .map(file => file.substring(0, file.lastIndexOf('_map')));
    } catch (error) {
        logger.error(`Error reading mapping files: ${error.message}`);
        return [];
    }
}

/**
 * Create a new custom tag mapping
 * @param {string} name - Name of the new codesystem file name, e.g. ${name}._map.xml
 * @param {Array} tags - Array of tag objects
 * @param {string} filename - Name of the custom tags file (optional)
 * @returns {Object} - Result object with success status and message
 */
function createCodeSystem(name, codesystem , filename = 'custom_tags.json') {
    // Validate name
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return { success: false, message: 'Invalid mapping name' };
    }

    // Check if name already exists
    if (CodeSystemMappings[name]) {
        return { success: false, message: 'A mapping with this name already exists' };
    }

    // Create the new mapping
    const now = new Date();
    CodeSystemMappings[name] = {
        tags: codesystem.tags,
        createdAt: now,
        updatedAt: now
    };

    // Save to disk
    saveCodeSystemToFile(CodeSystemMappings[name], filename);

    return {
        success: true,
        message: 'Custom tag mapping created successfully',
        codesystem: CodeSystemMappings[name]
    };
}

/**
 * Save custom tag mappings to disk
 * @param {string} filename - Name of the custom tags file (optional)
 */
function saveCodeSystemToFile(codesystem, filename = 'custom_tags.json') {
    if (!codesystem || !Array.isArray(codesystem.tags)) {
        logger.error('codesystem 参数无效或缺少 tags 数组');
        return;
    }
    const { create } = require("xmlbuilder2");
    try {
        // 构建 XML
        const root = create({ version: "1.0", encoding: "UTF-8" }).ele("root");
        codesystem.tags.forEach(item => {
            const tag = root.ele("tag");
            Object.entries(item).forEach(([key, value]) => {
                tag.ele(key).txt(value);
            });
        });
        const xmlString = root.end({ prettyPrint: true });

        // 写入文件
        const filePath = getCodeSystemFilePath(filename);
        fs.writeFileSync(filePath, '\uFEFF' + xmlString, 'utf8');
        logger.info(`Code system saved to  ${filePath}`);
    } catch (error) {
        logger.error(`save code system into file fail: ${error.message}`);
    }

}

// Function to get the path for custom tag mappings file
function getCodeSystemFilePath(filename = 'custom_tags.json') {
    return path.join(process.cwd(), filename);
}
/**
 * Get the table name for a codesystem by ID
 * @param {string} id - Codesystem ID
 * @returns {Promise<string>} - Table name for the codesystem
 */
async function getCodesystemTableNameByName(name) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DATABASE_FILE);

        try {
            // If id is null or empty, return the default table name
            if (!name || name.trim() === '') {
                resolve(TABLE_HL7_CODESYSTEM_300);
                db.close();
                return;
            }

            // Build the query with proper parameter binding
            const query = `SELECT * FROM ${TABLE_HL7_CODESYSTEMS} WHERE codesystem_name = ?`;

            db.get(query, [name], (err, row) => {
                if (err) {
                    logger.error("Error getting codesystem table name:", err);
                    reject(err);
                    return;
                }

                if (row && row.codesystem_tablename) {
                    resolve(row.codesystem_tablename);
                } else {
                    // If no matching record found, return the default table name
                    resolve(TABLE_HL7_CODESYSTEM_300);
                }
            });
        } catch (error) {
            logger.error("Exception in getCodesystemTableByName:", error);
            reject(error);
        } finally {
            db.close((closeErr) => {
                if (closeErr) {
                    logger.error("Error closing database:", closeErr);
                }
            });
        }
    });
}


module.exports = {
    initializeCodeSystem,
    getDescription,
    getObservationType,
    getSourceChannel,
    getAllTags,
    getCodeSystemNames,
    createCodeSystem,
    getCodesystemTableNameByName,
    updateDetailCodeSystem
};
