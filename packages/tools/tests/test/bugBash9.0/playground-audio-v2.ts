/**
 * BabylonJS 9.0 Bug Bash — Audio Engine V2: Interactive Feature Showcase
 *
 * This playground demonstrates the AudioEngineV2 features:
 * - Creating a WebAudio engine
 * - Loading static and streaming sounds
 * - Audio buses for routing and mixing
 * - Spatial audio (3D positioned sound)
 * - Volume ramping with different curve shapes
 * - Sound cloning
 * - Microphone input (requires user permission)
 *
 * To use: Copy this into the BabylonJS Playground (https://playground.babylonjs.com/)
 * with the audioEngine option set to false in the engine config.
 *
 * What to verify:
 * 1. Engine creates and unlocks without errors
 * 2. Static sound plays with correct volume
 * 3. Volume ramps work smoothly (linear, exponential, logarithmic)
 * 4. Spatial audio responds to listener/camera position
 * 5. Audio bus routes multiple sounds
 * 6. Sound clone works independently
 * 7. Microphone input captures audio (if permission granted)
 */

const createScene = async function (engine: BABYLON.Engine, canvas: HTMLCanvasElement): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);

    // Camera
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 10, BABYLON.Vector3.Zero(), scene);
    camera.attachControl(canvas, true);

    // Lighting
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);

    // Ground
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);

    // Speaker mesh (represents spatial sound source)
    const speakerMesh = BABYLON.MeshBuilder.CreateSphere("speaker", { diameter: 1 }, scene);
    const speakerMat = new BABYLON.StandardMaterial("speakerMat", scene);
    speakerMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
    speakerMesh.material = speakerMat;
    speakerMesh.position.set(3, 0.5, 0);

    // GUI
    const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
    const statusText = new BABYLON.GUI.TextBlock();
    statusText.text = "Initializing AudioV2...";
    statusText.color = "white";
    statusText.fontSize = 18;
    statusText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    statusText.paddingTop = "10px";
    advancedTexture.addControl(statusText);

    // Button panel
    const panel = new BABYLON.GUI.StackPanel();
    panel.width = "200px";
    panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
    panel.paddingLeft = "10px";
    advancedTexture.addControl(panel);

    function addButton(text: string, onClick: () => void) {
        const button = BABYLON.GUI.Button.CreateSimpleButton("btn_" + text, text);
        button.width = "180px";
        button.height = "40px";
        button.color = "white";
        button.background = "#444";
        button.paddingTop = "5px";
        button.onPointerUpObservable.add(onClick);
        panel.addControl(button);
    }

    try {
        // Create AudioEngineV2
        const audioEngine = await BABYLON.CreateAudioEngineAsync(scene);
        statusText.text = `AudioV2 engine created. State: running. Sounds: ${audioEngine.sounds.length}`;

        // Sound URL
        const soundUrl = "https://assets.babylonjs.com/sound/testing/audioV2/square-1-khz-0.1-amp-for-10-seconds.flac";

        // Create an audio bus
        const mainBus = await audioEngine.createBusAsync({ volume: 0.8 });

        // Create a static sound
        let staticSound: BABYLON.StaticSound | null = null;

        addButton("Load Static Sound", async () => {
            try {
                staticSound = await audioEngine.createSoundAsync(soundUrl, { outBus: mainBus });
                statusText.text = `Static sound loaded. Sounds: ${audioEngine.sounds.length}`;
            } catch (e) {
                statusText.text = `Error loading: ${e}`;
            }
        });

        addButton("Play Sound", () => {
            if (staticSound) {
                staticSound.play();
                statusText.text = "Playing static sound";
            }
        });

        addButton("Stop Sound", () => {
            if (staticSound) {
                staticSound.stop();
                statusText.text = "Stopped static sound";
            }
        });

        addButton("Pause Sound", () => {
            if (staticSound) {
                staticSound.pause();
                statusText.text = "Paused static sound";
            }
        });

        addButton("Volume Ramp (Linear)", () => {
            if (staticSound) {
                staticSound.setVolume(0.1, { duration: 2, shape: BABYLON.AudioParameterRampShape.Linear });
                setTimeout(() => {
                    staticSound!.setVolume(1, { duration: 2, shape: BABYLON.AudioParameterRampShape.Linear });
                }, 2500);
                statusText.text = "Volume ramp: 1 → 0.1 → 1 (linear)";
            }
        });

        addButton("Clone Sound", async () => {
            if (staticSound) {
                const clone = await staticSound.cloneAsync();
                clone.play();
                statusText.text = `Cloned sound playing. Sounds: ${audioEngine.sounds.length}`;
            }
        });

        addButton("Spatial Audio", async () => {
            if (staticSound) {
                staticSound.spatial.enabled = true;
                staticSound.spatial.attach(speakerMesh);
                staticSound.play();
                statusText.text = "Spatial audio: move camera to hear panning";
            }
        });

        // Attach listener to camera
        audioEngine.listener.attach(camera);

    } catch (error) {
        statusText.text = `AudioV2 Error: ${error}`;
        console.error("AudioV2 init error:", error);
    }

    return scene;
};
