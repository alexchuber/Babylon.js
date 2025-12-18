import { useState, useCallback } from "react";
import type { FunctionComponent } from "react";
import { SwitchPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/switchPropertyLine";
import { SyncedSliderPropertyLine } from "shared-ui-components/fluent/hoc/propertyLines/syncedSliderPropertyLine";
import { Collapse } from "shared-ui-components/fluent/primitives/collapse";
import type { IGLTFLoaderService } from "../../../services/panes/tools/gltfLoaderService";
import { useObservableState } from "../../../hooks/observableHooks";

export const GLTFExtensionOptions: FunctionComponent<{ gltfLoaderService: IGLTFLoaderService }> = ({ gltfLoaderService }) => {
    const [overrideExtensionOptions, setOverrideExtensionOptions] = useState(gltfLoaderService.isExtensionConfigOverrideEnabled());
    const extensionStates = useObservableState(
        useCallback(() => gltfLoaderService.getExtensionStates(), [gltfLoaderService]),
        gltfLoaderService.onExtensionConfigChangedObservable
    );

    const handleOverrideChange = (value: boolean) => {
        setOverrideExtensionOptions(value);
        gltfLoaderService.setExtensionConfigOverrideEnabled(value);
    };

    return (
        <>
            <SwitchPropertyLine label="Override glTF extension options" value={overrideExtensionOptions} onChange={handleOverrideChange} />
            <Collapse visible={overrideExtensionOptions}>
                <SwitchPropertyLine
                    label="EXT_lights_image_based"
                    value={extensionStates["EXT_lights_image_based"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("EXT_lights_image_based", value)}
                />
                <SwitchPropertyLine
                    label="EXT_mesh_gpu_instancing"
                    value={extensionStates["EXT_mesh_gpu_instancing"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("EXT_mesh_gpu_instancing", value)}
                />
                <SwitchPropertyLine
                    label="EXT_texture_webp"
                    value={extensionStates["EXT_texture_webp"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("EXT_texture_webp", value)}
                />
                <SwitchPropertyLine
                    label="EXT_texture_avif"
                    value={extensionStates["EXT_texture_avif"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("EXT_texture_avif", value)}
                />
                <SwitchPropertyLine
                    label="KHR_draco_mesh_compression"
                    value={extensionStates["KHR_draco_mesh_compression"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_draco_mesh_compression", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_pbrSpecularGlossiness"
                    value={extensionStates["KHR_materials_pbrSpecularGlossiness"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_pbrSpecularGlossiness", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_clearcoat"
                    value={extensionStates["KHR_materials_clearcoat"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_clearcoat", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_iridescence"
                    value={extensionStates["KHR_materials_iridescence"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_iridescence", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_anisotropy"
                    value={extensionStates["KHR_materials_anisotropy"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_anisotropy", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_emissive_strength"
                    value={extensionStates["KHR_materials_emissive_strength"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_emissive_strength", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_ior"
                    value={extensionStates["KHR_materials_ior"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_ior", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_sheen"
                    value={extensionStates["KHR_materials_sheen"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_sheen", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_specular"
                    value={extensionStates["KHR_materials_specular"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_specular", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_unlit"
                    value={extensionStates["KHR_materials_unlit"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_unlit", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_variants"
                    value={extensionStates["KHR_materials_variants"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_variants", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_transmission"
                    value={extensionStates["KHR_materials_transmission"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_transmission", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_diffuse_transmission"
                    value={extensionStates["KHR_materials_diffuse_transmission"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_diffuse_transmission", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_volume"
                    value={extensionStates["KHR_materials_volume"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_volume", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_dispersion"
                    value={extensionStates["KHR_materials_dispersion"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_dispersion", value)}
                />
                <SwitchPropertyLine
                    label="KHR_materials_diffuse_roughness"
                    value={extensionStates["KHR_materials_diffuse_roughness"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_materials_diffuse_roughness", value)}
                />
                <SwitchPropertyLine
                    label="KHR_mesh_quantization"
                    value={extensionStates["KHR_mesh_quantization"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_mesh_quantization", value)}
                />
                <SwitchPropertyLine
                    label="KHR_lights_punctual"
                    value={extensionStates["KHR_lights_punctual"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_lights_punctual", value)}
                />
                <SwitchPropertyLine
                    label="EXT_lights_area"
                    value={extensionStates["EXT_lights_area"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("EXT_lights_area", value)}
                />
                <SwitchPropertyLine
                    label="KHR_texture_basisu"
                    value={extensionStates["KHR_texture_basisu"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_texture_basisu", value)}
                />
                <SwitchPropertyLine
                    label="KHR_texture_transform"
                    value={extensionStates["KHR_texture_transform"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_texture_transform", value)}
                />
                <SwitchPropertyLine
                    label="KHR_xmp_json_ld"
                    value={extensionStates["KHR_xmp_json_ld"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("KHR_xmp_json_ld", value)}
                />
                <SwitchPropertyLine label="MSFT_lod" value={extensionStates["MSFT_lod"].enabled} onChange={(value) => gltfLoaderService.updateExtensionState("MSFT_lod", value)} />
                <Collapse visible={extensionStates["MSFT_lod"].enabled}>
                    <SyncedSliderPropertyLine
                        label="Maximum LODs"
                        value={extensionStates["MSFT_lod"].maxLODsToLoad}
                        onChange={(value) => gltfLoaderService.updateExtensionProperty("MSFT_lod", "maxLODsToLoad", value)}
                        min={1}
                        max={10}
                        step={1}
                    />
                </Collapse>
                <SwitchPropertyLine
                    label="MSFT_minecraftMesh"
                    value={extensionStates["MSFT_minecraftMesh"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("MSFT_minecraftMesh", value)}
                />
                <SwitchPropertyLine
                    label="MSFT_sRGBFactors"
                    value={extensionStates["MSFT_sRGBFactors"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("MSFT_sRGBFactors", value)}
                />
                <SwitchPropertyLine
                    label="MSFT_audio_emitter"
                    value={extensionStates["MSFT_audio_emitter"].enabled}
                    onChange={(value) => gltfLoaderService.updateExtensionState("MSFT_audio_emitter", value)}
                />
                <div style={{ padding: "8px", color: "#999", fontSize: "12px" }}>You need to reload your file to see these changes</div>
            </Collapse>
        </>
    );
};
