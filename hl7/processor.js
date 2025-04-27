const logger = require('../logger');
const { savePatientData } = require('./database');
const { logAndGetLastData, logInputParameters } = require('./logging');

/**
 * Process an HL7 message and save patient data
 * @param {string} rawMessage - Raw HL7 message string
 * @param {Object} hl7Parser - HL7 parser instance
 * @returns {Promise<Object>} - Parsed HL7 message
 */
async function processHL7Message(rawMessage, hl7Parser) {
  logger.info("Received Raw HL7 message type:", { RawMsg: rawMessage });
  // Parse the message using the provided parser
  const parsedMessage = hl7Parser.parse(rawMessage);
  logger.debug('savePatientData begin');
  await savePatientData(parsedMessage);
  logger.debug('savePatientData end');
  
  return parsedMessage;
}

module.exports = {
  logAndGetLastData,
  logInputParameters,
  savePatientData,
  processHL7Message
};