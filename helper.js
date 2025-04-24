const logger = require('./logger');

const helpFunctions = {
    AlarmTypeEnum: {
        UNKNOWN: 0,
        LOW_ALARM: 1,
        HIGH_ALARM: 2
    },

    getAlarmType(alarmType) {
        switch (alarmType) {
            case '196652':
                return this.AlarmTypeEnum.HIGH_ALARM;
            case '196674':
                return this.AlarmTypeEnum.LOW_ALARM;
            default:
                return this.AlarmTypeEnum.UNKNOWN;
        }
    },
    getLimViolation(encode) {
        if (encode == null) {
            return 'NA';
        }
        if (this.getAlarmType(encode) === this.AlarmTypeEnum.LOW_ALARM) {
            return 'below';
        } else if (this.getAlarmType(encode) === this.AlarmTypeEnum.HIGH_ALARM){
            return 'high';
        } else {
            return 'NA'
        }
    },
    getLimViolationValue(upperLim, lowLim, value, encode) {
        if (upperLim == null || lowLim == null || value == null || encode == null) {
            return 'NA';
        }

        // 强制转换为数值类型
        upperLim = parseFloat(upperLim);
        lowLim = parseFloat(lowLim);
        value = parseFloat(value);

        // 检测转换结果是否合法（非数字值会导致NaN）
        if (isNaN(upperLim) || isNaN(lowLim) || isNaN(value)) {
            return 'NA';
        }

        const alarmType = this.getAlarmType(encode);
        if (alarmType === this.AlarmTypeEnum.LOW_ALARM) {
            return Math.abs(lowLim - value);
        } else if (alarmType === this.AlarmTypeEnum.HIGH_ALARM) {
            return Math.abs(upperLim - value);
        } else {
            return 'NA';
        }
    },

    convertToUTCDateTime(hl7DateTime) {
    const year = parseInt(hl7DateTime.substring(0, 4));
    const month = parseInt(hl7DateTime.substring(4, 6)) - 1; // months are zero indexed
    const day = parseInt(hl7DateTime.substring(6, 8));
    const hour = parseInt(hl7DateTime.substring(8, 10));
    const minute = parseInt(hl7DateTime.substring(10, 12));
    const second = parseInt(hl7DateTime.substring(12, 14)) || 0; // 若字段缺少秒则设为0

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return date.toISOString().replace('T', ' ').substring(0, 19);
},

 convertToUTCDate(hl7DateTime) {
    const year = parseInt(hl7DateTime.substring(0, 4));
    const month = parseInt(hl7DateTime.substring(4, 6)) - 1; // months are zero indexed
    const day = parseInt(hl7DateTime.substring(6, 8));

    return new Date(Date.UTC(year, month, day)).toISOString().substring(0, 10);
},

 convertToUTCTime(hl7DateTime) {
    const year = parseInt(hl7DateTime.substring(0, 4));
    const month = parseInt(hl7DateTime.substring(4, 6)) - 1;
    const day = parseInt(hl7DateTime.substring(6, 8));
    const hour = parseInt(hl7DateTime.substring(8, 10)) || 0;
    const minute = parseInt(hl7DateTime.substring(10, 12)) || 0;
    const second = parseInt(hl7DateTime.substring(12, 14)) || 0;

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return date.toISOString().replace('T', ' ').substring(11, 16);
},

 convertToUTCHour(hl7DateTime) {
    const year = parseInt(hl7DateTime.substring(0, 4));
    const month = parseInt(hl7DateTime.substring(4, 6)) - 1;
    const day = parseInt(hl7DateTime.substring(6, 8));
    const hour = parseInt(hl7DateTime.substring(8, 10)) || 0;
    const minute = parseInt(hl7DateTime.substring(10, 12)) || 0;
    const second = parseInt(hl7DateTime.substring(12, 14)) || 0;

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return date.toISOString().replace('T', ' ').substring(11, 13);
},
/**
 * 获取字段中某个子组件
 * @param {string} field - 字段内容，如 "12345^MySubID"
 * @param {number} index - 要提取的子组件索引，从 0 开始计数
 * @param {string} delimiter - 子组件分隔符（默认 "^"）
 * @returns {string|null} - 返回目标子组件的值，或 null（如果不存在）
 */
 getComponentFromField(field, index, delimiter = "^") {
    if (!field || typeof field !== 'string') {
        logger.error('Invalid field');
        return null;
    }
    const components = field.split(delimiter); // 分割子组件
    // 增加对 -1 的支持，返回最后一个元素
    if (index === -1) {
        return components[components.length - 1] || null;
    }

    return components[index] || null; // 返回指定索引的值，无值则返回 null
},
    getAlarmPriority(value) {
    const mapping = {
        PN: 'not indicated',
        PL: 'Low',
        PM: 'Medium',
        PH: 'High',
    };

    // 默认输出为原值或 "Unknown"（防止意外值未定义）
    return mapping[value] || 'Unknown';
},

/**
 * 从HL7消息中根据观察标识符查找并提取OBX段的特定值
 * @param {Object} hl7Message - 已解析的HL7消息对象
 * @param {string} identifierText - 要查找的观察标识符文本（如'MDC_ATTR_ALARM_PRIORITY'）
 * @param {number} valueFieldIndex - 要提取的值字段索引，默认为5（OBX-5是观察值）
 * @returns {string|null} - 找到的值或null（如果未找到）
 */
 getObxValueByIdentifier(hl7Message, identifierText, delimiter = "^", valueFieldIndex = 5) {
    if (!hl7Message ) {
        logger.error('Invalid HL7 message');
        return null;
    }

    // 获取所有OBX段
    const obxSegments = hl7Message.getSegments('OBX');
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
},

    /**
 * 从OBX段中提取特定值类型的字段代码值
 * @param {Object} hl7Message - HL7消息对象
 * @param {string} valueType - 要查找的值类型（如'NM'表示数值类型）
 * @returns {Array} - 包含所有匹配值类型的OBX段解析结果的数组
 */
 extractObxCodesByValueType(hl7Message, valueType = "NM") {
    if (!hl7Message) {
        logger.error('Invalid HL7 message');
        return [];
    }

    // 获取所有OBX段
    const obxSegments = hl7Message.getSegments('OBX');
    if (!obxSegments || obxSegments.length === 0) {
        logger.error('No OBX segments found in received HL7 message');
        return [];
    }

    // 查找所有匹配指定值类型的OBX段
    const results = [];

    for (const obx of obxSegments) {
        const obxValueType = obx.getField(2); // OBX-2是值类型

        // 仅处理 NM 和 CWE 类型
        if (obxValueType !== valueType) {
            continue;  // 如果不是这两种类型，跳过本次循环
        }

        // 提取结果对象（基础结构）
        const result = {
            setId: obx.getField(1),
            valueType: obxValueType,
            observationCode: null,
            observationName: null,
            observationValue: null,
            subId: null,
            unitCode: null,
            unitName: null,
            lowLim: null,
            upperLim: null,
            limViolation: null,
            limViolationValue: null,
        };

// 从OBX-3提取观察项目代码和名称（公共部分）
        const observationId = obx.getField(3);
        if (observationId) {
            const components = observationId.split('^');
            result.observationCode = components[0] || null;
            result.observationName = components[1] || null;
        }

// 从OBX-4提取subid（公共部分）
        const observationSubId = obx.getField(4);
        if (observationSubId) {
            const components = observationSubId.split('.');
            const usefulComponents = components.length > 1 ? components.slice(0, -1) : components;
            result.subId = usefulComponents.join('.') || null;
        }

// 根据 obxValueType 处理其他不同的字段
        switch (obxValueType) {
            case 'NM':
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
                break;

            case 'CWE':
                // 从OBX-5提取limViolation信息
                const evtType = obx.getField(5);
                if(evtType){
                    const evtComponents = evtType.split('^');
                    result.limViolation = evtComponents[0] || null;
                }
                break;


        }

        // 最终将 result 添加到结果数组
        results.push(result);

    }

    if (results.length === 0) {
        logger.warn(`No OBX segments with value type '${valueType}' found`);
    }

    return results;
},
}
module.exports = helpFunctions;
