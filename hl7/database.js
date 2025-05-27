const sqlite3 = require("sqlite3").verbose();
const logger = require("../logger");
const { DATABASE_FILE, TABLE_HL7_PATIENTS } = require("../config");
const helpFunctions = require("../helper");
const { getDescription, getObservationType, getSourceChannel } = require("../codesystem");
const { logInputParameters } = require("./logging");

/**
 * Executes a database query asynchronously
 * @param {sqlite3.Database} db - Database connection
 * @param {string} query - SQL query to execute
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
function dbRunAsync(db, query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      } // Use this to get lastID, changes, etc.
    });
  });
}

/**
 * Safely gets a property from an object with default value
 * @param {Object} obj - Source object
 * @param {string} property - Property name
 * @param {*} defaultValue - Default value if property doesn't exist
 * @returns {*} - Property value or default
 */
function safeGetProperty(obj, property, defaultValue = null) {
  const safeValue = (value) => (value == null ? null : value.toString());
  return obj ? safeValue(obj[property]) : defaultValue;
}

/**
 * Saves patient data from HL7 message to database
 * @param {Object} hl7Message - Parsed HL7 message
 * @returns {Promise<void>}
 */
async function savePatientData(hl7Message) {
  let db;
  try {
    db = new sqlite3.Database(DATABASE_FILE);
    const safeValue = (value) => (value == null ? null : value.toString());
    const msh = hl7Message.header;
    if (!msh) {
      logger.error("No MSH segment found in received HL7 message");
      return;
    }
    if (typeof msh.getComponent !== "function") {
      logger.warn("mshSegment.getComponent is not a function");
    }

    // get msg type MSH-9-1 is ORU , event MSH-9-2 is R40
    const msgTypeField = msh.getField(7);
    if (typeof msgTypeField === "string") {
      const msgType = helpFunctions.getComponentFromField(msgTypeField, 0);
      const msgEvent = helpFunctions.getComponentFromField(msgTypeField, 1);
      if (msgType != 'ORU' || msgEvent != 'R40') {
        logger.warn("Received HL7 message type:", { msgType: safeValue(msgType) , msgEvent: safeValue(msgEvent) });
        return;
      }
    } else {
      logger.warn("Care Unit field is undefined or malformed");
    }

    const msgDateTimeField = msh.getField(5);
    // If field contains subcomponents (e.g., separated by '^')
    let msgDateTime;
    if (typeof msgDateTimeField === "string") {
      msgDateTime = helpFunctions.getComponentFromField(msgDateTimeField, 0);
    } else {
      logger.warn("Date Time message field is undefined or malformed");
    }

    logger.info("Date Time:", { msgDateTime: safeValue(msgDateTime) });

    const localDataTime = helpFunctions.convertToUTCDateTime(msgDateTimeField);
    logger.info("Local Date Time:", { localDataTime: safeValue(localDataTime) });

    const utcDate = helpFunctions.convertToUTCDate(msgDateTimeField);
    logger.info("UTC Date:", { utcDate: safeValue(utcDate) });

    const utcTime = helpFunctions.convertToUTCTime(msgDateTimeField);
    logger.info("UTC Time:", { utcTime: safeValue(utcTime) });

    const utcHour = helpFunctions.convertToUTCHour(msgDateTimeField);
    logger.info("UTC Hour:", { utcHour: safeValue(utcHour) });

    const pv1 = hl7Message.getSegment("PV1");
    if (!pv1) {
      logger.warn("No pv1 segment found in received HL7 message");
      return;
    }
    if (typeof pv1.getComponent !== "function") {
      logger.warn("pv1.getComponent is not a function");
    }
    const apl = pv1.getField(3);

    // If field contains subcomponents (e.g., separated by '^')
    let careUnit;
    if (typeof apl === "string") {
      careUnit = helpFunctions.getComponentFromField(apl, 0);
    } else {
      logger.warn("Care Unit field is undefined or malformed");
    }

    logger.info("Care unit :", { careUnit: safeValue(careUnit) });

    // If field contains subcomponents (e.g., separated by '^')
    let bedLabel;
    if (typeof apl === "string") {
      bedLabel = helpFunctions.getComponentFromField(apl, 2);
    } else {
      logger.warn("Bed label field is undefined or malformed");
    }

    logger.info("Bed label:", { bedLabel: safeValue(bedLabel) });

    const pid = hl7Message.getSegment("PID");
    if (!pid) {
      logger.warn("No PID segment found in received HL7 message");
      return;
    }
    if (typeof pid.getComponent !== "function") {
      logger.warn("pidSegment.getComponent is not a function");
    }

    const patientIDField = pid.getField(3);
    // If field contains subcomponents (e.g., separated by '^')
    let patientID;
    if (typeof patientIDField === "string") {
      patientID = helpFunctions.getComponentFromField(patientIDField, 0);
    } else {
      logger.warn("Patient ID field is undefined or malformed");
    }

    logger.info("Patient ID:", { patientID: safeValue(patientID) });

    const patientName = pid.getComponent(5, 2) + " " + pid.getComponent(5, 1); // Field 5: Name
    const secondpatientID = pid.getComponent(4, 1); // Field 7: Date of Birth

    const [lastName, firstName] = patientName.split(" "); // Split Last and First Name

    // OBR
    const obr = hl7Message.getSegment("OBR");
    if (!obr) {
      logger.error("No OBR segment found in received HL7 message");
      return;
    }
    if (typeof obr.getComponent !== "function") {
      logger.warn("obrSegment.getComponent is not a function");
    }
    const deviceGUIDField = obr.getField(13);
    // If field contains subcomponents (e.g., separated by '^')
    let deviceGUID;
    if (typeof deviceGUIDField === "string") {
      deviceGUID = helpFunctions.getComponentFromField(deviceGUIDField, -1);
    } else {
      logger.warn("Device GUID field is undefined or malformed");
    }

    // 68484^MDC_ATTR_ALARM_PRIORITY
    // alarm grade
    // Get alarm priority
    let alarmPriority = helpFunctions.getObxValueByIdentifier(
        hl7Message,
        "MDC_ATTR_ALARM_PRIORITY",
    );

    // Check if empty or invalid
    if (!alarmPriority || alarmPriority.trim() === '') {
      logger.warn('Alarm priority is empty or undefined, setting to default priority.');
      alarmPriority = 'Normal'; // Or use default value like "Normal", "Low", etc.
    } else {
      alarmPriority = helpFunctions.getAlarmPriority(alarmPriority);
    }

    if (alarmPriority) {
      logger.info("Alarm Priority:", { alarmPriority: safeValue(alarmPriority) });
    }

    // Get alarm state
    const alarmState = helpFunctions.getObxValueByIdentifier(
        hl7Message,
        "MDC_ATTR_ALARM_STATE",
    );
    if (alarmState) {
      logger.info("Alarm State:", { alarmState: safeValue(alarmState) });
    }

    const cweObxData = helpFunctions.extractObxCodesByValueType(
        hl7Message,
        "CWE",
    );
    
    // Import logAndGetLastData from logging module
    const { logAndGetLastData } = require('./logging');
    const targetObxCWEData = logAndGetLastData(cweObxData, "CWE");

    const numericObxData = helpFunctions.extractObxCodesByValueType(hl7Message);
    const targetObxNMData = logAndGetLastData(numericObxData, "Numeric");

    // Get alarm message
    let alarmMessage = helpFunctions.getObxValueByIdentifier(
        hl7Message,
        "MDC_EVT_ALARM",
    );

    // subid
    const subId = targetObxCWEData?.subId || null;
    if (subId) {
      logger.info("Sub Id:", { subid: safeValue(subId) });
    }

    // source-channel
    const sourcechannel = subId ? getSourceChannel(targetObxCWEData?.observationCode, subId) : null;
    if (sourcechannel) {
      logger.info("Source-Channel:", { sourcechannel: safeValue(sourcechannel) });
    }


    // Check if alarmMessage is empty
    if (!alarmMessage || alarmMessage.trim() === '') {
      logger.warn('Alarm message is empty or undefined, no further processing will occur.');
      alarmMessage = "Unknown"; // Or set default value
    } else {
      // Process based on encode value
      const observationDescription = getDescription(targetObxNMData?.observationCode, subId);
      switch (alarmMessage) {

        case '196674': // Concatenate observationName and lowLim
          if (targetObxNMData && safeValue(targetObxNMData.lowLim) !== undefined) {
            alarmMessage = `${observationDescription} < ${targetObxNMData.lowLim}`;
            logger.info('Processed observationName with lowLim:', alarmMessage);
          } else {
          if (!targetObxNMData) {
            logger.warn('targetObxNMData is null for encode 196674');
          } else {
            logger.warn('lowLim is undefined for encode 196674');
          }
        }
          break;

        case '196652': // Concatenate observationName and upperLim
          if (targetObxNMData && safeValue(targetObxNMData.upperLim) !== undefined) {
            alarmMessage = `${observationDescription} > ${targetObxNMData.upperLim}`;
            logger.info('Processed observationName with upperLim:', alarmMessage);
          } else {
            if (!targetObxNMData) {
              logger.warn('targetObxNMData is null for encode 196652');
            } else {
              logger.warn('upperLim is undefined for encode 196652');
            }
          }
          break;

        default: // Default handling for other encode values
          logger.info('No special handling for encode:', safeValue(alarmMessage));
          // Call encapsulated method to get description
          alarmMessage = getDescription(alarmMessage) + '/' +  getObservationType(alarmMessage);
          break;
      }
    }

    if (alarmMessage) {
      logger.info("Alarm Message:", { alarmMessage: safeValue(alarmMessage) });
    }


    logInputParameters({
      deviceGUID,
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
      param_description: targetObxNMData?.observationName || null,
      param_value: targetObxNMData?.observationValue || null,
      param_uom: targetObxNMData?.unitCode || null,
      param_upper_lim: targetObxNMData?.upperLim || null,
      param_lower_lim: targetObxNMData?.lowLim || null,
      Limit_Violation_Type: helpFunctions.getLimViolation(
          targetObxCWEData?.limViolation,
      ),
      Limit_Violation_Value: helpFunctions.getLimViolationValue(
          targetObxNMData?.upperLim,
          targetObxNMData?.lowLim,
          targetObxNMData?.observationValue,
          targetObxCWEData?.limViolation,
      ),
      subId,
      sourcechannel,
      onset_tick: null,
      alarm_duration: null,
      change_time_UTC: null,
      change_tick: null,
      aborted: null,
      raw_message: hl7Message,
    });

    const limViolationValue = (() => {
      // Only call function if both objects are not null and required properties exist
      if (targetObxNMData && targetObxCWEData) {
        return helpFunctions.getLimViolationValue(
            targetObxNMData.upperLim,
            targetObxNMData.lowLim,
            targetObxNMData.observationValue,
            targetObxCWEData.limViolation
        );
      }
      return null;
    })();

    const limViolation = targetObxCWEData
        ? safeValue(helpFunctions.getLimViolation(targetObxCWEData.limViolation))
        : null;

    const unitCode = targetObxNMData && targetObxNMData.unitCode
        ? safeValue(getDescription(targetObxNMData.unitCode))
        : null;

    const result = await dbRunAsync(
        db,
        `INSERT INTO ${TABLE_HL7_PATIENTS} (device_id, local_time, Date, Time, Hour, bed_label, pat_ID, mon_unit, care_unit, alarm_grade,
                                   alarm_state, Alarm_Grade_2, alarm_message, param_id, param_description, param_value, param_uom,
                                   param_upper_lim, param_lower_lim, Limit_Violation_Type, Limit_Violation_Value, subid, sourcechannel, onset_tick,
                                   alarm_duration, change_time_UTC, change_tick, aborted,
                                       raw_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,
                                                                                                                 ?)`,
        [
          safeValue(deviceGUID),
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
          safeGetProperty(targetObxNMData, 'observationCode'),
          safeGetProperty(targetObxNMData, 'observationName'),
          safeGetProperty(targetObxNMData, 'observationValue'),
          unitCode,
          safeGetProperty(targetObxNMData, 'upperLim'),
          safeGetProperty(targetObxNMData, 'lowLim'),
          limViolation,
          limViolationValue,
          subId,
          sourcechannel,
          null,
          null,
          null,
          null,
          null,
          safeValue(hl7Message),
        ],
    );

    // Logic after successful insertion
    logger.info("Patient saved with ID:", result.lastID);
  } catch (error) {
    logger.error('Database operation failed', error);
    throw error; // Throw exception so caller knows save failed
  } finally {
    if (db) {
      db.close((err) => {
        if (err) {
          logger.error('Database closing error', err);
        } else {
          logger.info('Database connection closed');
        }
      });
    }
  }
}

module.exports = {
  savePatientData,
  dbRunAsync,
  safeGetProperty
};