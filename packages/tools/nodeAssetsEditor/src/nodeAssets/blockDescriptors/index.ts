/**
 * Imports every built-in block descriptor module for its registration side effect, so the palette
 * and load-time descriptor lookups see all built-in blocks. The import order here is the palette
 * display order. Adding a block means adding its descriptor module and one import line here.
 */

import "./importGLTFBlockDescriptor";
import "./importUSDBlockDescriptor";
import "./dracoCompressionBlockDescriptor";
import "./exportGLTFBlockDescriptor";
import "./ktx2CompressionBlockDescriptor";
import "./weldBlockDescriptor";
import "./dedupBlockDescriptor";
import "./pruneBlockDescriptor";
import "./quantizeBlockDescriptor";
import "./simplifyBlockDescriptor";
import "./flattenBlockDescriptor";
import "./joinBlockDescriptor";
import "./normalsBlockDescriptor";
import "./centerBlockDescriptor";
import "./numberLiteralDescriptor";
import "./stringLiteralDescriptor";
import "./jsonLiteralDescriptor";
import "./mergeScenesDescriptor";
