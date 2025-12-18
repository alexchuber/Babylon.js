import type { ServiceDefinition } from "../../../modularity/serviceDefinition";
import { ToolsServiceIdentity } from "../toolsService";
import type { IToolsService } from "../toolsService";
import { ImportAnimationsTools } from "../../../components/tools/import/importAnimations";
import { GLTFLoaderOptions } from "../../../components/tools/import/gltfLoaderOptions";
import { GLTFLoaderServiceIdentity } from "./gltfLoaderService";
import type { IGLTFLoaderService } from "./gltfLoaderService";
import { GLTFValidationTools } from "../../../components/tools/import/gltfValidator";
import { GLTFExtensionOptions } from "../../../components/tools/import/gltfExtensionOptions";

export const SceneImportServiceDefinition: ServiceDefinition<[], [IToolsService]> = {
    friendlyName: "Import Tool",
    consumes: [ToolsServiceIdentity],
    factory: (toolsService) => {
        const contentRegistration = toolsService.addSectionContent({
            key: "AnimationImport",
            section: "Animation Import",
            component: ({ context }) => <ImportAnimationsTools scene={context} />,
        });

        return {
            dispose: () => {
                contentRegistration.dispose();
            },
        };
    },
};

export const GLTFToolsServiceDefinition: ServiceDefinition<[], [IToolsService, IGLTFLoaderService]> = {
    friendlyName: "GLTF Tools",
    consumes: [ToolsServiceIdentity, GLTFLoaderServiceIdentity],
    factory: (toolsService, gltfLoaderService) => {
        // Register all three glTF tool sections
        const loaderToolsRegistration = toolsService.addSectionContent({
            key: "GLTFLoader",
            section: "GLTF Loader",
            component: () => <GLTFLoaderOptions gltfLoaderService={gltfLoaderService} />,
        });

        const extensionsToolsRegistration = toolsService.addSectionContent({
            key: "GLTFExtensions",
            section: "GLTF Extensions",
            component: () => <GLTFExtensionOptions gltfLoaderService={gltfLoaderService} />,
        });

        const validationToolsRegistration = toolsService.addSectionContent({
            key: "GLTFValidation",
            section: "GLTF Validation",
            component: () => <GLTFValidationTools gltfLoaderService={gltfLoaderService} />,
        });

        return {
            dispose: () => {
                loaderToolsRegistration.dispose();
                extensionsToolsRegistration.dispose();
                validationToolsRegistration.dispose();
            },
        };
    },
};

export default {
    serviceDefinitions: [SceneImportServiceDefinition, GLTFToolsServiceDefinition],
} as const;
