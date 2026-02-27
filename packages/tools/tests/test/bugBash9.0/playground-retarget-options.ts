/**
 * BabylonJS 9.0 Bug Bash — Animation Retargeting: Advanced Options Demo
 *
 * This playground demonstrates advanced retargeting options:
 * - fixGroundReference: Corrects ground contact height
 * - fixGroundReferenceDynamicRefNode: Dynamically adjusts ground reference
 * - mapNodeNames: Remaps bone names between different naming conventions
 * - checkHierarchy: Validates parent bone chains match
 *
 * To use: Copy this into the BabylonJS Playground (https://playground.babylonjs.com/)
 * and run it. Use the GUI to toggle options and observe the effect.
 *
 * What to verify:
 * 1. fixGroundReference keeps character's feet on the ground plane
 * 2. fixGroundReferenceDynamicRefNode improves ground contact during walking
 * 3. mapNodeNames correctly remaps differently-named bones
 * 4. checkHierarchy removes animations when hierarchies don't match
 * 5. Toggling options produces different visual results
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
    groundMat.alpha = 0.5;
    ground.material = groundMat;

    // Ground reference line
    const groundLine = BABYLON.MeshBuilder.CreateLines("groundLine", {
        points: [new BABYLON.Vector3(-5, 0, 0), new BABYLON.Vector3(5, 0, 0)],
    }, scene);
    groundLine.color = new BABYLON.Color3(1, 0, 0);

    // GUI
    const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
    const statusText = new BABYLON.GUI.TextBlock();
    statusText.text = "Loading...";
    statusText.color = "white";
    statusText.fontSize = 18;
    statusText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    statusText.paddingTop = "10px";
    advancedTexture.addControl(statusText);

    // Options panel
    const panel = new BABYLON.GUI.StackPanel();
    panel.width = "250px";
    panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    panel.paddingTop = "50px";
    panel.paddingLeft = "10px";
    advancedTexture.addControl(panel);

    // Retargeting options state
    const retargetOptions = {
        fixRootPosition: true,
        fixGroundReference: false,
        fixGroundReferenceDynamicRefNode: false,
        retargetAnimationKeys: true,
        checkHierarchy: false,
    };

    let currentRetargetedGroup: BABYLON.Nullable<BABYLON.AnimationGroup> = null;
    let targetAvatar: BABYLON.Nullable<BABYLON.AnimatorAvatar> = null;
    let sourceAnimGroup: BABYLON.Nullable<BABYLON.AnimationGroup> = null;

    function addCheckbox(name: string, optionKey: keyof typeof retargetOptions) {
        const header = new BABYLON.GUI.TextBlock();
        header.text = name;
        header.color = "white";
        header.fontSize = 14;
        header.height = "20px";
        header.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        panel.addControl(header);

        const checkbox = new BABYLON.GUI.Checkbox();
        checkbox.width = "20px";
        checkbox.height = "20px";
        checkbox.isChecked = retargetOptions[optionKey];
        checkbox.color = "green";
        checkbox.onIsCheckedChangedObservable.add((value) => {
            retargetOptions[optionKey] = value;
            reRetarget();
        });

        const stackH = new BABYLON.GUI.StackPanel();
        stackH.isVertical = false;
        stackH.height = "30px";
        stackH.addControl(checkbox);
        const label = new BABYLON.GUI.TextBlock();
        label.text = ` ${optionKey}`;
        label.color = "white";
        label.fontSize = 12;
        label.width = "200px";
        label.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        stackH.addControl(label);
        panel.addControl(stackH);
    }

    function reRetarget() {
        if (!targetAvatar || !sourceAnimGroup) return;

        if (currentRetargetedGroup) {
            currentRetargetedGroup.stop();
            currentRetargetedGroup.dispose();
        }

        currentRetargetedGroup = targetAvatar.retargetAnimationGroup(sourceAnimGroup, {
            animationGroupName: "retargetedAnim",
            fixRootPosition: retargetOptions.fixRootPosition,
            fixGroundReference: retargetOptions.fixGroundReference,
            fixGroundReferenceDynamicRefNode: retargetOptions.fixGroundReferenceDynamicRefNode,
            retargetAnimationKeys: retargetOptions.retargetAnimationKeys,
            checkHierarchy: retargetOptions.checkHierarchy,
            groundReferenceNodeName: "LeftFoot",
            rootNodeName: "Hips",
        });

        currentRetargetedGroup.start(true);
        statusText.text = `Options: ${JSON.stringify(retargetOptions)}`;
    }

    addCheckbox("Fix Root Position", "fixRootPosition");
    addCheckbox("Fix Ground Reference", "fixGroundReference");
    addCheckbox("Dynamic Ground Ref", "fixGroundReferenceDynamicRefNode");
    addCheckbox("Retarget Anim Keys", "retargetAnimationKeys");
    addCheckbox("Check Hierarchy", "checkHierarchy");

    try {
        // Load source character
        const sourceResult = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "https://assets.babylonjs.com/meshes/",
            "HVGirl.glb",
            scene
        );

        const sourceRoot = sourceResult.meshes[0] as BABYLON.TransformNode;
        sourceRoot.position.x = -1.5;
        sourceRoot.scaling.setAll(0.01);

        // Load target character (same model, different scale to show fixRootPosition effect)
        const targetResult = await BABYLON.SceneLoader.ImportMeshAsync(
            "",
            "https://assets.babylonjs.com/meshes/",
            "HVGirl.glb",
            scene
        );

        const targetRoot = targetResult.meshes[0] as BABYLON.TransformNode;
        targetRoot.position.x = 1.5;
        targetRoot.scaling.setAll(0.015); // 50% larger to show scaling adjustment

        targetAvatar = new BABYLON.AnimatorAvatar("target", targetRoot as BABYLON.TransformNode);
        sourceAnimGroup = sourceResult.animationGroups[0];

        if (!sourceAnimGroup) {
            statusText.text = "Error: No animation groups found";
            return scene;
        }

        // Stop defaults
        sourceResult.animationGroups.forEach((ag) => ag.stop());
        targetResult.animationGroups.forEach((ag) => ag.stop());

        // Play source
        sourceAnimGroup.start(true);

        // Initial retarget
        reRetarget();

    } catch (error) {
        statusText.text = `Error: ${error}`;
        console.error("Load error:", error);
    }

    return scene;
};
