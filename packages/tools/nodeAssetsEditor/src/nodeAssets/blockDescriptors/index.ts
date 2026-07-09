/**
 * Imports every built-in block descriptor module for its registration side effect, so the palette
 * and load-time descriptor lookups see all built-in blocks. The import order here is the palette
 * display order. Adding a block means adding its descriptor module and one import line here.
 */

import "./importGLTFBlockDescriptor";
import "./dracoCompressionBlockDescriptor";
import "./exportGLTFBlockDescriptor";
import "./ktx2CompressionBlockDescriptor";
