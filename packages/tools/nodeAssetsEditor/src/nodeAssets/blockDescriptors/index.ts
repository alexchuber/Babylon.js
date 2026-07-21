/**
 * Imports every built-in block descriptor module for its registration side effect, so the palette
 * and load-time descriptor lookups see all built-in blocks. The import order here is the palette
 * display order. Adding a block means adding its descriptor module and one import line here.
 */

import "./importGLTFBlockDescriptor";
import "./importOBJAggregateBlockDescriptor";
import "./importUSDBlockDescriptor";
import "./importBabylonAggregateBlockDescriptor";
import "./importNodeGeometryBlockDescriptor";

import "./universalToGLTFBlockDescriptor";
import "./weldVerticesBlockDescriptor";
import "./deduplicateResourcesBlockDescriptor";
import "./removeUnusedResourcesBlockDescriptor";
import "./removeDegenerateGeometryBlockDescriptor";
import "./fixFaceWindingBlockDescriptor";
import "./quantizeAttributesBlockDescriptor";
import "./simplifyMeshesBlockDescriptor";
import "./flattenHierarchyBlockDescriptor";
import "./joinMeshesBlockDescriptor";
import "./splitMeshesByMaterialBlockDescriptor";
import "./mergeScenesBlockDescriptor";
import "./transformSceneBlockDescriptor";
import "./centerSceneBlockDescriptor";
import "./recomputeNormalsBlockDescriptor";
import "./generateTangentsBlockDescriptor";
import "./stripAttributesBlockDescriptor";
import "./resizeTexturesBlockDescriptor";

import "./dracoCompressionBlockDescriptor";
import "./ktx2CompressionBlockDescriptor";
import "./exportGLTFBlockDescriptor";

import "./readGLTFBlockDescriptor";
import "./readOBJBlockDescriptor";
import "./readUSDBlockDescriptor";
import "./readBabylonBlockDescriptor";
import "./readNodeGeometryBlockDescriptor";
import "./gltfToUniversalBlockDescriptor";
import "./objToUniversalBlockDescriptor";
import "./writeGLTFBlockDescriptor";
import "./usdToUniversalBlockDescriptor";
import "./babylonToUniversalBlockDescriptor";
import "./nodeGeometryToUniversalBlockDescriptor";

import "./legacyImportGLTFBlockDescriptor";
import "./legacyExportGLTFBlockDescriptor";
import "./legacyImportUSDBlockDescriptor";
import "./weldBlockDescriptor";
import "./dedupBlockDescriptor";
import "./pruneBlockDescriptor";
import "./flattenBlockDescriptor";
import "./joinBlockDescriptor";
import "./normalsBlockDescriptor";
import "./centerBlockDescriptor";
import "./numberLiteralDescriptor";
import "./stringLiteralDescriptor";
import "./jsonLiteralDescriptor";
import "./mergeScenesDescriptor";
import "./selectorDescriptor";
import "./getPropertyDescriptor";
import "./setPropertyDescriptor";
import "./importImageBlockDescriptor";
import "./exportImageBlockDescriptor";
import "./buildPBRMaterialDescriptor";
import "./resizeImageBlockDescriptor";
import "./convertImageFormatBlockDescriptor";
import "./flipImageBlockDescriptor";
import "./extractTextureDescriptor";
import "./compositeImageBlockDescriptor";
import "./setTextureDescriptor";
import "./importBabylonBlockDescriptor";
import "./legacyImportNodeGeometryBlockDescriptor";
import "./usd2GLTFBlockDescriptor";
import "./usd2BabylonBlockDescriptor";
import "./gltf2BabylonBlockDescriptor";
import "./babylon2GLTFBlockDescriptor";
import "./evaluateNodeGeometryBlockDescriptor";
import "./decomposeGLTFMaterialBlockDescriptor";
import "./composeGLTFMaterialBlockDescriptor";
import "./customAggregateBlockDescriptor";
import "./getBabylonMeshBlockDescriptor";
import "./setBabylonPropertyBlockDescriptor";
import "./getUSDPrimBlockDescriptor";
import "./gltfSelectorBlockDescriptor";
import "./usdSelectorBlockDescriptor";
import "./babylonSelectorBlockDescriptor";
