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

module.exports = {
    initializeCodeSystem,
    getDescription,
    getObservationType,
    getSourceChannel
};
