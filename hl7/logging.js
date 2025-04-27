const logger = require('../logger');

/**
 * Logs OBX data and returns the last element
 * @param {Array} obxData - Array of OBX data objects
 * @param {string} obxType - Type of OBX data (for logging)
 * @returns {Object|null} - Copy of the last OBX data element or null if empty
 */
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
      subId: data.subId,
    });
  });

  // Return a copy of the last element
  return { ...obxData[obxData.length - 1] };
}

/**
 * Logs input parameters with safe value conversion
 * @param {Object} params - Parameters to log
 */
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

module.exports = {
  logAndGetLastData,
  logInputParameters
};