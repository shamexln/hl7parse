const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getAllTags } = require('./codesystem');

// Store custom tag mappings in memory
// Structure: { [mappingName]: { tags: [...], createdAt: Date, updatedAt: Date } }
const CodeSystemMappings = {};


/**
 * Initialize custom tag mappings from disk if available
 * @param {string} filename - Name of the custom tags file (optional)
 */
function initializeCustomTagMappings(filename = 'custom_tags.json') {
  try {
    const filePath = getMappingFilePath(filename);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsedData = JSON.parse(data);

      // Validate the structure of the loaded data
      if (typeof parsedData === 'object') {
        Object.assign(CodeSystemMappings, parsedData);
        logger.info(`Custom tag mappings loaded from ${filename}`);
      }
    } else {
      logger.info(`No custom tag mappings file found at ${filename}, starting with empty mappings`);
    }
  } catch (error) {
    logger.error(`Error initializing custom tag mappings from ${filename}: ${error.message}`);
  }
}





/**
 * Get a custom tag mapping by name
 * @param {string} name - Name of the custom mapping
 * @returns {Object} - Result object with success status and tags if found
 */
function getCustomTagMapping(name) {
  if (!CodeSystemMappings[name]) {
    return { success: false, message: 'Custom tag mapping not found' };
  }

  return { 
    success: true, 
    mapping: CodeSystemMappings[name]
  };
}

/**
 * Update a custom tag mapping
 * @param {string} name - Name of the custom mapping
 * @param {Array} tags - New array of tag objects
 * @param {string} filename - Name of the custom tags file (optional)
 * @returns {Object} - Result object with success status and message
 */
function updateCustomTagMapping(name, tags, filename = 'custom_tags.json') {
  // Check if mapping exists
  if (!CodeSystemMappings[name]) {
    return { success: false, message: 'Custom tag mapping not found' };
  }

  // Validate tags
  if (!Array.isArray(tags)) {
    return { success: false, message: 'Tags must be an array' };
  }

  // Update the mapping
  CodeSystemMappings[name].tags = tags;
  CodeSystemMappings[name].updatedAt = new Date();

  // Save to disk
  saveMappings(filename);

  return { 
    success: true, 
    message: 'Custom tag mapping updated successfully',
    mapping: CodeSystemMappings[name]
  };
}

/**
 * Delete a custom tag mapping
 * @param {string} name - Name of the custom mapping
 * @param {string} filename - Name of the custom tags file (optional)
 * @returns {Object} - Result object with success status and message
 */
function deleteCustomTagMapping(name, filename = 'custom_tags.json') {
  // Check if mapping exists
  if (!CodeSystemMappings[name]) {
    return { success: false, message: 'Custom tag mapping not found' };
  }

  // Delete the mapping
  delete CodeSystemMappings[name];

  // Save to disk
  saveMappings(filename);

  return { 
    success: true, 
    message: 'Custom tag mapping deleted successfully' 
  };
}

/**
 * Get all custom tag mapping names
 * @returns {Array} - Array of mapping names
 */
function getAllCustomTagMappingNames() {
  return Object.keys(CodeSystemMappings);
}



// Initialize custom tag mappings when module is loaded
// Default to 'custom_tags.json' if no filename is provided
initializeCustomTagMappings('custom_tags.json');

module.exports = {
  getCustomTagMapping,
  updateCustomTagMapping,
  deleteCustomTagMapping,
  getAllCustomTagMappingNames,
  initializeCustomTagMappings
};
