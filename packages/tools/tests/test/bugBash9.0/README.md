# BabylonJS 9.0 Bug Bash: Audio Engine V2 & Animation Retargeting

## Objective

Bug bash two key BabylonJS 9.0 features to validate correctness and improve test coverage:

1. **Audio Engine V2** (by docEdub / Andy) — Complete rewrite of the audio system with the legacy `Sound`/`AudioEngine` classes reimplemented as wrappers around the new `AudioEngineV2`/`WebAudioEngine` architecture.
2. **Animation Retargeting** (by Popov72 / Alexis) — New `AnimatorAvatar` class enabling animation transfer between different character models.

## What Was Done

### Animation Retargeting

**Unit Tests** (`packages/dev/core/test/unit/Animations/babylon.animatorAvatar.test.ts`) — 47 tests covering:
- `AnimatorAvatar` constructor: hierarchy scanning, mesh/skeleton/morph collection, empty avatar, root node renaming
- Bone lookup: `findBoneByTransformNode` (by name and instance), `findBoneByName`
- Morph target map: lazy building, meshName_targetName key format
- Dispose: resource cleanup with `_disposeResources` flag
- `retargetAnimationGroup()`: cloning behavior, bone name matching, missing bone removal, non-TransformNode targets, warning suppression
- Retarget options: `animationGroupName`, `retargetAnimationKeys`, `fixRootPosition`, `checkHierarchy`, `mapNodeNames`
- Morph target retargeting: influence animations, missing target removal
- Bones without linked transform nodes (#17926): bone name matching, preference for linked TN name, findBoneByTransformNode behavior
- Source animation immutability: targets unchanged, keyframe values unchanged
- Rotation and scaling animations: rotationQuaternion retargeting, scaling retargeting, mixed types in same group, keyframe modification verification
- fixAnimations: orthogonal quaternion correction
- fixGroundReference/fixRootPosition warnings: missing groundReferenceNodeName, fixGroundReferenceDynamicRefNode without fixGroundReference, proper execution with config
- Edge cases: empty group, all bones unmatched, multiple skeletons, partial mapNodeNames

**Unit Tests** (`packages/dev/core/test/unit/Animations/babylon.skeletonFunctions.test.ts`) — 9 tests covering:
- `CreateSkeletonFromTransformNodeHierarchy()`: hierarchy creation, transform node linking, parent-child relationships, `rotationQuaternion` filter, Mesh node skipping, custom naming, mesh attachment, visualization mesh creation

**Playground Demos** (`packages/tools/tests/test/bugBash9.0/`):
- `playground-retarget-basic.ts` — Basic retargeting: two characters, animation transfer
- `playground-retarget-options.ts` — Interactive options: toggle `fixGroundReference`, `fixRootPosition`, `checkHierarchy`, etc.

### Audio Engine V2

**Unit Tests** (`packages/dev/core/test/unit/Audio/sound.bugBash.test.ts`) — 12 tests covering:
- `SoundState` lifecycle: Stopped → Started → Stopped, Started → Paused, Paused resume
- Loop regression (#17774): independent loop options per sound, no option bleeding between sounds
- Dispose safety: playing, paused, and never-played states
- Volume: `setVolume()` method, constructor volume option

**Playground Demo** (`packages/tools/tests/test/bugBash9.0/`):
- `playground-audio-v2.ts` — Interactive AudioV2 showcase: engine creation, static sounds, buses, spatial audio, volume ramping, sound cloning

### Coverage Summary

| Feature | Before | After |
|---------|--------|-------|
| AnimatorAvatar constructor/API | 0 tests | 14 tests |
| retargetAnimationGroup | 0 tests | 33 tests |
| CreateSkeletonFromTransformNodeHierarchy | 0 tests | 9 tests |
| Sound state lifecycle (SoundState enum) | 3 tests (only Stopped) | 8 tests (all states) |
| Sound loop independence | 0 tests | 2 tests |
| Sound dispose robustness | 1 test (engine only) | 4 tests |
| Sound volume via legacy API | 0 tests | 2 tests |

## How to Run

### Unit Tests (Jest)

```bash
# Run all bug bash tests
npx jest --selectProjects unit --testPathPattern="(animatorAvatar|skeletonFunctions|sound.bugBash)" --no-coverage

# Run just animation retargeting tests
npx jest --selectProjects unit --testPathPattern="animatorAvatar" --no-coverage

# Run just skeleton helper tests
npx jest --selectProjects unit --testPathPattern="skeletonFunctions" --no-coverage

# Run just audio bug bash tests
npx jest --selectProjects unit --testPathPattern="sound.bugBash" --no-coverage
```

### Playground Demos

The playground files in `packages/tools/tests/test/bugBash9.0/` are self-contained TypeScript snippets designed to be copy-pasted into the [BabylonJS Playground](https://playground.babylonjs.com/).

## Issues Discovered

1. **Animation removal tied to `showWarnings`**: In `animatorAvatar.ts` (lines 337-345), animations targeting non-existent bones are only removed when `showWarnings` is `true`. If `showWarnings` is `false`, the animation stays in the group with the original (wrong) target. This may be intentional but is potentially surprising.

2. **Duplicate animation detection unreachable**: The `retargetAnimationGroup` method checks for duplicate animations using a Set, but it calls `clone(name, undefined, true, true)` which creates new Animation instances for each targeted animation. Since each clone is a new object, the duplicate detection on line 304 can never trigger.

3. **Sound resume from Paused stays in Paused state**: Calling `play()` on a paused Sound through the legacy API doesn't immediately transition the internal `_soundV2.state` to `Started` — it remains `Paused`. This likely requires async processing (audio context) to fully resolve.

## Files Created

```
packages/dev/core/test/unit/Animations/babylon.animatorAvatar.test.ts
packages/dev/core/test/unit/Animations/babylon.skeletonFunctions.test.ts
packages/dev/core/test/unit/Audio/sound.bugBash.test.ts
packages/tools/tests/test/bugBash9.0/playground-retarget-basic.ts
packages/tools/tests/test/bugBash9.0/playground-retarget-options.ts
packages/tools/tests/test/bugBash9.0/playground-audio-v2.ts
packages/tools/tests/test/bugBash9.0/README.md   (this file)
```
