const { CODE_SYSTEM } = require('./config');
const fs = require('fs');
const xml2js = require('xml2js');
const winston = require("winston");
const parser = new xml2js.Parser();
const path = require('path');

// 日志配置示例（仅供参考，你项目中可能已有此配置）
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.simple()
    ),
    transports: [new winston.transports.Console()]
});

const encodeToDescriptionMap = new Map();
const encodeToObservationTypeMap = new Map();
const subidToSourceChannelMap = new Map();
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

async function initializeCodeSystem(xmlData= CODE_SYSTEM) {
    try {
        let bomRemovedData;
        const xmlPath = getFilePath(xmlData);

        const data = await fs.promises.readFile(xmlPath);
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
                Object.keys(tag).forEach(key => {
                    if (Array.isArray(tag[key]) && tag[key].length > 0) {
                        processedTag[key] = tag[key][0];
                    }
                });
                return processedTag;
            });

            tags.forEach(tag => {
                if (tag.encode && tag.encode[0] && tag.description && tag.description[0]) {
                    const encode = tag.encode[0];
                    const description = tag.description[0];
                    encodeToDescriptionMap.set(encode, description);
                }

                if (tag.encode && tag.encode[0] && tag.observationtype && tag.observationtype[0]) {
                    const encode = tag.encode[0];
                    const observationtype = tag.observationtype[0];
                    encodeToObservationTypeMap.set(encode, observationtype);
                }

                if (tag.subid && tag.subid[0] && tag.source && tag.source[0] && tag.channel && tag.channel[0]) {
                    const subid = tag.subid[0];
                    const source = tag.source[0];
                    const channel = tag.channel[0];
                    subidToSourceChannelMap.set(subid, source + '/' + channel);
                }
            });

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
                descrMap: encodeToDescriptionMap,
                obsTypMap: encodeToObservationTypeMap,
                srcChaMap: subidToSourceChannelMap,
                createdAt: now,
                updatedAt: now
            };

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
function getDescription(encode) {
    return encodeToDescriptionMap.get(encode);
}

function getObservationType(encode) {
    return encodeToObservationTypeMap.get(encode);
}

function getSourceChannel(subid) {
    return subidToSourceChannelMap.get(subid);
}

function getAllTags() {
    return allTags;
}


/**
 * Clone a custom tag mapping
 * @param {string} sourceName - Name of the source mapping to clone
 * @param {string} targetName - Name for the new cloned mapping
 * @param {string} filename - Name of the custom tags file (optional)
 * @returns {Object} - Result object with success status and message
 */
function cloneMapping(sourceName, targetName, filename = 'custom_tags.json') {
    // Validate source name
    if (!CodeSystemMappings[sourceName]) {
        return { success: false, message: 'Source mapping not found' };
    }

    // Validate target name
    if (!targetName || typeof targetName !== 'string' || targetName.trim() === '') {
        return { success: false, message: 'Invalid target mapping name' };
    }

    // Check if target name already exists
    if (CodeSystemMappings[targetName]) {
        return { success: false, message: 'A mapping with the target name already exists' };
    }

    // Create a deep copy of the source mapping's tags
    const clonedTags = JSON.parse(JSON.stringify(CodeSystemMappings[sourceName].tags));

    // Create the new mapping
    const now = new Date();
    CodeSystemMappings[targetName] = {
        tags: clonedTags,
        createdAt: now,
        updatedAt: now
    };

    // Save to disk
    saveMappings(filename);

    return {
        success: true,
        message: `Custom tag mapping "${sourceName}" cloned to "${targetName}" successfully`,
        mapping: CodeSystemMappings[targetName]
    };
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
        descrMap: codesystem.encodeToDescriptionMap,
        obsTypMap: codesystem.encodeToObservationTypeMap,
        srcChaMap: codesystem.subidToSourceChannelMap,
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
    try {
        const filePath = getCodeSystemFilePath(filename);
        fs.writeFileSync(filePath, JSON.stringify(codesystem.tags, null, 2));
        logger.info(`Custom tag mappings saved to ${filename}`);
    } catch (error) {
        logger.error(`Error saving custom tag mappings to ${filename}: ${error.message}`);
    }
}

// Function to get the path for custom tag mappings file
function getCodeSystemFilePath(filename = 'custom_tags.json') {
    return path.join(process.cwd(), filename);
}

module.exports = {
    initializeCodeSystem,
    getDescription,
    getObservationType,
    getSourceChannel,
    getAllTags,
    getCodeSystemNames,
    createCodeSystem,
    saveCodeSystemToFile
};
