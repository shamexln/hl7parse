/**
 * This file is a facade that re-exports the functionality from the modular hl7 directory.
 * It maintains backward compatibility with existing code that imports from this file.
 */

// Re-export everything from the processor module
module.exports = require('./hl7/processor');
