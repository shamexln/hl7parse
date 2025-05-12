const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { getAllTags } = require('./init_codesystem');

// Store custom tag mappings in memory
// Structure: { [mappingName]: { tags: [...], createdAt: Date, updatedAt: Date } }
const customTagMappings = {};

// Function to get the path for custom tag mappings file
function getCustomTagsFilePath(filename = 'custom_tags.json') {
  return path.join(process.cwd(), filename);
}

/**
 * Initialize custom tag mappings from disk if available
 * @param {string} filename - Name of the custom tags file (optional)
 */
function initializeCustomTagMappings(filename = 'custom_tags.json') {
  try {
    const filePath = getCustomTagsFilePath(filename);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsedData = JSON.parse(data);

      // Validate the structure of the loaded data
      if (typeof parsedData === 'object') {
        Object.assign(customTagMappings, parsedData);
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
 * Save custom tag mappings to disk
 * @param {string} filename - Name of the custom tags file (optional)
 */
function saveCustomTagMappings(filename = 'custom_tags.json') {
  try {
    const filePath = getCustomTagsFilePath(filename);
    fs.writeFileSync(filePath, JSON.stringify(customTagMappings, null, 2));
    logger.info(`Custom tag mappings saved to ${filename}`);
  } catch (error) {
    logger.error(`Error saving custom tag mappings to ${filename}: ${error.message}`);
  }
}

/**
 * Create a new custom tag mapping
 * @param {string} name - Name of the custom mapping
 * @param {Array} tags - Array of tag objects (optional, defaults to copy of default tags)
 * @param {string} filename - Name of the custom tags file (optional)
 * @returns {Object} - Result object with success status and message
 */
function createCustomTagMapping(name, tags = null, filename = 'custom_tags.json') {
  // Validate name
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return { success: false, message: 'Invalid mapping name' };
  }

  // Check if name already exists
  if (customTagMappings[name]) {
    return { success: false, message: 'A mapping with this name already exists' };
  }

  // If no tags provided, use a deep copy of the default tags
  const tagData = tags || JSON.parse(JSON.stringify(getAllTags()));

  // Create the new mapping
  const now = new Date();
  customTagMappings[name] = {
    tags: tagData,
    createdAt: now,
    updatedAt: now
  };

  // Save to disk
  saveCustomTagMappings(filename);

  return { 
    success: true, 
    message: 'Custom tag mapping created successfully',
    mapping: customTagMappings[name]
  };
}

/**
 * Get a custom tag mapping by name
 * @param {string} name - Name of the custom mapping
 * @returns {Object} - Result object with success status and tags if found
 */
function getCustomTagMapping(name) {
  if (!customTagMappings[name]) {
    return { success: false, message: 'Custom tag mapping not found' };
  }

  return { 
    success: true, 
    mapping: customTagMappings[name]
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
  if (!customTagMappings[name]) {
    return { success: false, message: 'Custom tag mapping not found' };
  }

  // Validate tags
  if (!Array.isArray(tags)) {
    return { success: false, message: 'Tags must be an array' };
  }

  // Update the mapping
  customTagMappings[name].tags = tags;
  customTagMappings[name].updatedAt = new Date();

  // Save to disk
  saveCustomTagMappings(filename);

  return { 
    success: true, 
    message: 'Custom tag mapping updated successfully',
    mapping: customTagMappings[name]
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
  if (!customTagMappings[name]) {
    return { success: false, message: 'Custom tag mapping not found' };
  }

  // Delete the mapping
  delete customTagMappings[name];

  // Save to disk
  saveCustomTagMappings(filename);

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
  return Object.keys(customTagMappings);
}

/**
 * Clone a custom tag mapping
 * @param {string} sourceName - Name of the source mapping to clone
 * @param {string} targetName - Name for the new cloned mapping
 * @param {string} filename - Name of the custom tags file (optional)
 * @returns {Object} - Result object with success status and message
 */
function cloneCustomTagMapping(sourceName, targetName, filename = 'custom_tags.json') {
  // Validate source name
  if (!customTagMappings[sourceName]) {
    return { success: false, message: 'Source mapping not found' };
  }

  // Validate target name
  if (!targetName || typeof targetName !== 'string' || targetName.trim() === '') {
    return { success: false, message: 'Invalid target mapping name' };
  }

  // Check if target name already exists
  if (customTagMappings[targetName]) {
    return { success: false, message: 'A mapping with the target name already exists' };
  }

  // Create a deep copy of the source mapping's tags
  const clonedTags = JSON.parse(JSON.stringify(customTagMappings[sourceName].tags));

  // Create the new mapping
  const now = new Date();
  customTagMappings[targetName] = {
    tags: clonedTags,
    createdAt: now,
    updatedAt: now
  };

  // Save to disk
  saveCustomTagMappings(filename);

  return { 
    success: true, 
    message: `Custom tag mapping "${sourceName}" cloned to "${targetName}" successfully`,
    mapping: customTagMappings[targetName]
  };
}

// Initialize custom tag mappings when module is loaded
// Default to 'custom_tags.json' if no filename is provided
initializeCustomTagMappings('custom_tags.json');

module.exports = {
  createCustomTagMapping,
  getCustomTagMapping,
  updateCustomTagMapping,
  deleteCustomTagMapping,
  getAllCustomTagMappingNames,
  getCustomTagsFilePath,
  initializeCustomTagMappings,
  cloneCustomTagMapping
};
