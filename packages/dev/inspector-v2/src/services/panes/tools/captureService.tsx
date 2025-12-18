import type { ServiceDefinition } from "../../../modularity/serviceDefinition";
import { ToolsServiceIdentity } from "../toolsService";
import type { IToolsService } from "../toolsService";
import type { IDisposable } from "core/scene";
import { CaptureScreenshotTools, ReplayTools } from "../../../components/tools/capture/captureTools";
import { GIFTools, VideoTools } from "../../../components/tools/capture/recordingTools";

export const CaptureToolsDefinition: ServiceDefinition<[], [IToolsService]> = {
    friendlyName: "Capture Tools",
    consumes: [ToolsServiceIdentity],
    factory: (toolsService) => {
        const contentRegistrations: IDisposable[] = [];

        // Screenshot
        contentRegistrations.push(
            toolsService.addSectionContent({
                key: "Screenshot Capture",
                section: "Screenshot Capture",
                component: ({ context }) => <CaptureScreenshotTools scene={context} />,
            })
        );

        // Scene replay
        contentRegistrations.push(
            toolsService.addSectionContent({
                key: "Scene Replay",
                section: "Scene Replay",
                component: ({ context }) => <ReplayTools scene={context} />,
            })
        );

        // GIF recorder
        contentRegistrations.push(
            toolsService.addSectionContent({
                key: "GIF Capture",
                section: "GIF Capture",
                component: ({ context }) => <GIFTools scene={context} />,
            })
        );

        // Video recorder
        contentRegistrations.push(
            toolsService.addSectionContent({
                key: "Video Capture",
                section: "Video Capture",
                component: ({ context }) => <VideoTools scene={context} />,
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
    serviceDefinitions: [CaptureToolsDefinition],
} as const;
