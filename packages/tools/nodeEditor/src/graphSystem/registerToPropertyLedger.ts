import { PropertyLedger } from "shared-ui-components/nodeGraphSystem/propertyLedger";
import { ColorMergerPropertyTabComponent } from "./properties/colorMergerPropertyComponent";
import { GenericPropertyComponent } from "./properties/genericNodePropertyComponent";
import { GradientPropertyTabComponent } from "./properties/gradientNodePropertyComponent";
import { ImageSourcePropertyTabComponent } from "./properties/imageSourcePropertyTabComponent";
import { InputPropertyTabComponent } from "./properties/inputNodePropertyComponent";
import { LightInformationPropertyTabComponent } from "./properties/lightInformationPropertyTabComponent";
import { TexturePropertyTabComponent } from "./properties/texturePropertyTabComponent";
import { VectorMergerPropertyTabComponent } from "./properties/vectorMergerPropertyComponent";
import { TeleportOutPropertyTabComponent } from "./properties/teleportOutNodePropertyComponent";

export const RegisterToPropertyTabManagers = () => {
    PropertyLedger.DefaultControl = GenericPropertyComponent;
    PropertyLedger.RegisteredControls["InputBlock"] = InputPropertyTabComponent;
    PropertyLedger.RegisteredControls["GradientBlock"] = GradientPropertyTabComponent;
    PropertyLedger.RegisteredControls["LightInformationBlock"] = LightInformationPropertyTabComponent;
    PropertyLedger.RegisteredControls["TextureBlock"] = TexturePropertyTabComponent;
    PropertyLedger.RegisteredControls["ReflectionTextureBlock"] = TexturePropertyTabComponent;
    PropertyLedger.RegisteredControls["ReflectionBlock"] = TexturePropertyTabComponent;
    PropertyLedger.RegisteredControls["RefractionBlock"] = TexturePropertyTabComponent;
    PropertyLedger.RegisteredControls["CurrentScreenBlock"] = TexturePropertyTabComponent;
    PropertyLedger.RegisteredControls["ParticleTextureBlock"] = TexturePropertyTabComponent;
    PropertyLedger.RegisteredControls["TriPlanarBlock"] = TexturePropertyTabComponent;
    PropertyLedger.RegisteredControls["BiPlanarBlock"] = TexturePropertyTabComponent;
    PropertyLedger.RegisteredControls["ImageSourceBlock"] = ImageSourcePropertyTabComponent;
    PropertyLedger.RegisteredControls["VectorMergerBlock"] = VectorMergerPropertyTabComponent;
    PropertyLedger.RegisteredControls["ColorMergerBlock"] = ColorMergerPropertyTabComponent;
    PropertyLedger.RegisteredControls["NodeMaterialTeleportOutBlock"] = TeleportOutPropertyTabComponent;
};
