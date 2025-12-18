import type { ServiceDefinition } from "../../../modularity/serviceDefinition";
import { ToolsServiceIdentity } from "../toolsService";
import type { IToolsService } from "../toolsService";
import type { IDisposable } from "core/scene";
import { ExportBabylonTools, ExportGltfTools } from "../../../components/tools/export/exportTools";

export const ExportServiceDefinition: ServiceDefinition<[], [IToolsService]> = {
    friendlyName: "Export Tools",
    consumes: [ToolsServiceIdentity],
    factory: (toolsService) => {
        const contentRegistrations: IDisposable[] = [];

        // .gltf
        contentRegistrations.push(
            toolsService.addSectionContent({
                key: "glTF Export",
                section: "glTF Export",
                component: ({ context }) => <ExportGltfTools scene={context} />,
            })
        );

        // .babylon
        contentRegistrations.push(
            toolsService.addSectionContent({
                key: "Babylon Export",
                section: "Babylon Export",
                component: ({ context }) => <ExportBabylonTools scene={context} />,
            })
        );

        return {
            dispose: () => {
                contentRegistrations.forEach((registration) => registration.dispose());
            },
        };
    },
};

export default {
    serviceDefinitions: [ExportServiceDefinition],
} as const;
