const { CODE_SYSTEM } = require('./config');
const fs = require('fs').promises;
const xml2js = require('xml2js');
const winston = require("winston");
const parser = new xml2js.Parser();

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

async function initializeCodeSystem(xmlData= CODE_SYSTEM) {
    try {
        let bomRemovedData;
        const data = await fs.readFile(xmlData);
        bomRemovedData = data.toString().replace("\ufeff", "");


        // 使用 Promise 包装解析过程
        const result = await parseXML(bomRemovedData);

        // 调试: 输出XML结构
        logger.info('XML structure:', JSON.stringify(result, null, 2).substring(0, 500) + '...');
        // 获取根元素名称
        const rootName = Object.keys(result)[0];
        console.log('Root element name:', rootName);

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
            console.error('No "tag" element found. Please check XML structure');
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

module.exports = {
    initializeCodeSystem,
    getDescription
};
