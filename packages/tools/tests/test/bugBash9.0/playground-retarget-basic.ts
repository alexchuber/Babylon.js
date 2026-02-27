/**
 * BabylonJS 9.0 Bug Bash — Animation Retargeting: Basic Demo
 *
 * This playground demonstrates the core animation retargeting feature.
 * It loads two different character models and retargets an animation from one to the other.
 *
 * To use: Copy this into the BabylonJS Playground (https://playground.babylonjs.com/)
 * and run it. You should see two characters side by side, both playing the same animation.
 *
 * What to verify:
 * 1. Both characters animate correctly (no broken bones, no frozen limbs)
 * 2. The retargeted animation preserves the general motion of the original
 * 3. Root position is adjusted for size differences between the two characters
 * 4. The animation plays smoothly without glitches
 */

const createScene = async function (engine: BABYLON.Engine, canvas: HTMLCanvasElement): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);

    // Camera
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 5, new BABYLON.Vector3(0, 1, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 15;

    // Lighting
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.8;
    const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, 1), scene);
    dirLight.intensity = 0.5;

    // Ground
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 10, height: 10 }, scene);
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    ground.material = groundMat;

    // UI for status
    const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
    const statusText = new BABYLON.GUI.TextBlock();
    statusText.text = "Loading models...";
    statusText.color = "white";
    statusText.fontSize = 20;
    statusText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    statusText.paddingTop = "10px";
    advancedTexture.addControl(statusText);

    try {
        // Load first character (source) — this character has an animation
        // Using the Babylon.js default Dummy character for demo
        const sourceResult = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "https://assets.babylonjs.com/meshes/",
            "HVGirl.glb",
            scene
        );

        const sourceRoot = sourceResult.meshes[0] as BABYLON.TransformNode;
        sourceRoot.position.x = -1.5;
        sourceRoot.scaling.setAll(0.01); // Scale down the model

        // Load second character (target) — this character will receive the retargeted animation
        const targetResult = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "https://assets.babylonjs.com/meshes/",
            "HVGirl.glb",
            scene
        );

        const targetRoot = targetResult.meshes[0] as BABYLON.TransformNode;
        targetRoot.position.x = 1.5;
        targetRoot.scaling.setAll(0.012); // Slightly different scale to test size adjustment

        // Create AnimatorAvatar for the target
        const targetAvatar = new BABYLON.AnimatorAvatar("targetAvatar", targetRoot as BABYLON.TransformNode);

        // Get the source animation group (first one)
        const sourceAnimGroup = sourceResult.animationGroups[0];
        if (!sourceAnimGroup) {
            statusText.text = "Error: No animation groups found in source model";
            return scene;
        }

        // Stop source animations before retargeting
        sourceResult.animationGroups.forEach((ag) => ag.stop());
        targetResult.animationGroups.forEach((ag) => ag.stop());

        // Retarget the animation
        const retargetedAnimGroup = targetAvatar.retargetAnimationGroup(sourceAnimGroup, {
            animationGroupName: "retargetedAnim",
            fixRootPosition: true,
            retargetAnimationKeys: true,
        });

        // Play both animations
        sourceAnimGroup.start(true);
        retargetedAnimGroup.start(true);

        statusText.text = `Source: "${sourceAnimGroup.name}" | Retargeted: "${retargetedAnimGroup.name}" — Both playing`;

        // Add labels
        const sourceLabel = new BABYLON.GUI.TextBlock();
        sourceLabel.text = "Source (original)";
        sourceLabel.color = "cyan";
        sourceLabel.fontSize = 16;
        sourceLabel.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        sourceLabel.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        sourceLabel.paddingBottom = "30px";
        sourceLabel.paddingLeft = "30%";
        advancedTexture.addControl(sourceLabel);

        const targetLabel = new BABYLON.GUI.TextBlock();
        targetLabel.text = "Target (retargeted)";
        targetLabel.color = "lime";
        targetLabel.fontSize = 16;
        targetLabel.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        targetLabel.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        targetLabel.paddingBottom = "30px";
        targetLabel.paddingRight = "30%";
        advancedTexture.addControl(targetLabel);

    } catch (error) {
        statusText.text = `Error: ${error}`;
        console.error("Failed to load models:", error);
    }

    return scene;
};
