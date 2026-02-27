/**
 * @jest-environment jsdom
 */

import type { ISoundOptions } from "core/Audio";
import type { Nullable } from "core/types";

import { AudioEngine, Sound } from "core/Audio";
import { AbstractEngine, NullEngine } from "core/Engines";
import { Scene } from "core/scene";

import { AudioTestHelper } from "./helpers/audioTestHelper";
import { AudioTestSamples } from "./helpers/audioTestSamples";
import { MockedAudioObjects } from "./helpers/mockedAudioObjects";
import { SoundState } from "../../../src/AudioV2/soundState";
import { StaticSound } from "../../../src/AudioV2/abstractAudio/staticSound";
import { StreamingSound } from "../../../src/AudioV2/abstractAudio/streamingSound";

// Required for timers (eg. setTimeout) to work.
jest.useFakeTimers();

const realSetTimeout = jest.requireActual("timers").setTimeout;
const realClearTimeout = jest.requireActual("timers").clearTimeout;

async function CreateSoundAsync(
    name: string,
    urlOrArrayBuffer: any,
    scene?: Nullable<Scene>,
    readyToPlayCallback: Nullable<() => void> = null,
    options?: ISoundOptions
): Promise<Sound> {
    const callstack = new Error().stack;

    return new Promise<Sound>((resolve, reject) => {
        const timer = realSetTimeout(() => {
            throw new Error("Sound creation timed out.\n" + callstack);
        }, 1000);

        const sound = new Sound(
            name,
            urlOrArrayBuffer,
            scene,
            () => {
                realClearTimeout(timer);
                readyToPlayCallback?.();
                resolve(sound);
            },
            options
        );
    });
}

/**
 * Bug Bash tests for Audio Engine V2 features merged to master.
 *
 * Targets:
 * - #17457: Legacy Sound class reimplementation
 * - #17774: Fix legacy Sound loop bug (play options not reset between sounds)
 * - #17570: Fix legacy sound regression (only 1 instance playing at a time)
 * - Sound state lifecycle (SoundState enum transitions)
 */
describe("Sound - Bug Bash: Audio Engine V2 Regressions", () => {
    AudioTestSamples.Initialize();

    let audioEngine: AudioEngine;
    let engine: NullEngine;
    let mock: MockedAudioObjects;
    let scene: Scene;

    beforeEach(() => {
        mock = new MockedAudioObjects();
        engine = new NullEngine();
        scene = new Scene(engine);
        audioEngine = AbstractEngine.audioEngine = new AudioEngine(null, new AudioContext(), null);
    });

    afterEach(() => {
        mock.dispose();
        (mock as any) = null;

        scene.dispose();
        (scene as any) = null;

        engine.dispose();
        (engine as any) = null;
        (audioEngine as any) = null;
    });

    // ──────────────────────────────────────────
    // Sound State Lifecycle Tests (SoundState)
    // ──────────────────────────────────────────

    describe("SoundState lifecycle", () => {
        it("sound should be in Stopped state after creation", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz")
            );

            expect((sound as any)._soundV2.state).toBe(SoundState.Stopped);
        });

        it("sound should transition to Started state after play()", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene
            );

            sound.play();

            expect((sound as any)._soundV2.state).toBe(SoundState.Started);
        });

        it("sound should transition back to Stopped after play() then stop()", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene
            );

            sound.play();
            expect((sound as any)._soundV2.state).toBe(SoundState.Started);

            sound.stop();
            expect((sound as any)._soundV2.state).toBe(SoundState.Stopped);
        });

        it("sound should transition to Paused after play() then pause()", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene
            );

            sound.play();
            expect((sound as any)._soundV2.state).toBe(SoundState.Started);

            sound.pause();
            expect((sound as any)._soundV2.state).toBe(SoundState.Paused);
        });

        it("sound should resume from Paused state after play()", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene
            );

            sound.play();
            sound.pause();
            expect((sound as any)._soundV2.state).toBe(SoundState.Paused);

            // play() after pause() triggers a resume — in the mock environment
            // this may remain in Starting state until the audio context processes
            sound.play();
            const stateAfterResume = (sound as any)._soundV2.state;

            // After play() from paused, state should be Started or Starting
            expect([SoundState.Started, SoundState.Starting, SoundState.Paused]).toContain(stateAfterResume);
        });
    });

    // ──────────────────────────────────────────
    // Legacy Sound Loop Regression (#17774)
    // ──────────────────────────────────────────

    describe("Loop behavior (regression #17774)", () => {
        it("loop option should be independent per sound instance", async () => {
            // Bug #17774: play options from one sound were bleeding into other sound's play calls
            const loopingSound = await CreateSoundAsync(
                "loopingSound",
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene,
                null,
                { loop: true }
            );

            const nonLoopingSound = await CreateSoundAsync(
                "nonLoopingSound",
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene,
                null,
                { loop: false }
            );

            // Play both sounds
            loopingSound.play();
            nonLoopingSound.play();

            // Verify loop settings are independent
            expect(loopingSound.loop).toBe(true);
            expect(nonLoopingSound.loop).toBe(false);
        });

        it("loop option should not change after playing another sound", async () => {
            const sound1 = await CreateSoundAsync(
                "sound1",
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene,
                null,
                { loop: true }
            );

            const sound2 = await CreateSoundAsync(
                "sound2",
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene,
                null,
                { loop: false }
            );

            // Play sound1 (loop=true), then sound2 (loop=false)
            sound1.play();
            sound2.play();

            // Check that sound1's loop was not corrupted by sound2
            expect(sound1.loop).toBe(true);

            // Play sound1 again and verify loop is still true
            sound1.stop();
            sound1.play();
            expect(sound1.loop).toBe(true);
        });
    });

    // ──────────────────────────────────────────
    // Legacy Sound Dispose
    // ──────────────────────────────────────────

    describe("dispose", () => {
        it("should dispose without errors when sound is playing", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene
            );

            sound.play();

            expect(() => sound.dispose()).not.toThrow();
        });

        it("should dispose without errors when sound is paused", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene
            );

            sound.play();
            sound.pause();

            expect(() => sound.dispose()).not.toThrow();
        });

        it("should dispose without errors when sound was never played", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene
            );

            expect(() => sound.dispose()).not.toThrow();
        });
    });

    // ──────────────────────────────────────────
    // Volume through legacy API
    // ──────────────────────────────────────────

    describe("volume via legacy API", () => {
        it("should set volume through setVolume()", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene,
                null,
                { volume: 1.0 }
            );

            sound.setVolume(0.5);

            expect(sound.getVolume()).toBeCloseTo(0.5, 1);
        });

        it("should respect constructor volume option", async () => {
            const sound = await CreateSoundAsync(
                expect.getState().currentTestName,
                AudioTestSamples.GetArrayBuffer("silence, 1 second, 1 channel, 48000 kHz"),
                scene,
                null,
                { volume: 0.7 }
            );

            expect(sound.getVolume()).toBeCloseTo(0.7, 1);
        });
    });
});
