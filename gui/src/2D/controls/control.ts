import { Container } from "./container";
import { AdvancedDynamicTexture } from "../advancedDynamicTexture";
import { ValueAndUnit } from "../valueAndUnit";
import { Nullable, Observer, Vector2, AbstractMesh, Observable, Vector3, Scene, Tools, Matrix, PointerEventTypes } from "babylonjs";
import { Measure } from "../measure";
import { Style } from "../style";
import { Matrix2D, Vector2WithInfo } from "../math2D";

/**
 * Root class used for all 2D controls
 * @see http://doc.babylonjs.com/how_to/gui#controls
 */
export class Control {
    /**
     * Gets or sets a boolean indicating if alpha must be an inherited value (false by default)
     */
    public static AllowAlphaInheritance = false;

    private _alpha = 1;
    private _alphaSet = false;
    private _zIndex = 0;
    /** @hidden */
    public _root: Nullable<Container>;
    /** @hidden */
    public _host: AdvancedDynamicTexture;
    /** Gets or sets the control parent */
    public parent: Nullable<Container>;
    /** @hidden */
    public _currentMeasure = Measure.Empty();
    private _fontFamily = "Arial";
    private _fontStyle = "";
    private _fontWeight = "";
    private _fontSize = new ValueAndUnit(18, ValueAndUnit.UNITMODE_PIXEL, false);
    private _font: string;
    /** @hidden */
    public _width = new ValueAndUnit(1, ValueAndUnit.UNITMODE_PERCENTAGE, false);
    /** @hidden */
    public _height = new ValueAndUnit(1, ValueAndUnit.UNITMODE_PERCENTAGE, false);
    /** @hidden */
    protected _fontOffset: { ascent: number, height: number, descent: number };
    private _color = "";
    private _style: Nullable<Style> = null;
    private _styleObserver: Nullable<Observer<Style>>;
    /** @hidden */
    protected _horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    /** @hidden */
    protected _verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    private _isDirty = true;
    /** @hidden */
    public _tempParentMeasure = Measure.Empty();
    /** @hidden */
    protected _cachedParentMeasure = Measure.Empty();
    private _paddingLeft = new ValueAndUnit(0);
    private _paddingRight = new ValueAndUnit(0);
    private _paddingTop = new ValueAndUnit(0);
    private _paddingBottom = new ValueAndUnit(0);
    /** @hidden */
    public _left = new ValueAndUnit(0);
    /** @hidden */
    public _top = new ValueAndUnit(0);
    private _scaleX = 1.0;
    private _scaleY = 1.0;
    private _rotation = 0;
    private _transformCenterX = 0.5;
    private _transformCenterY = 0.5;
    private _transformMatrix = Matrix2D.Identity();
    /** @hidden */
    protected _invertTransformMatrix = Matrix2D.Identity();
    /** @hidden */
    protected _transformedPosition = Vector2.Zero();
    private _onlyMeasureMode = false;
    private _isMatrixDirty = true;
    private _cachedOffsetX: number;
    private _cachedOffsetY: number;
    private _isVisible = true;
    private _isHighlighted = false;
    /** @hidden */
    public _linkedMesh: Nullable<AbstractMesh>;
    private _fontSet = false;
    private _dummyVector2 = Vector2.Zero();
    private _downCount = 0;
    private _enterCount = -1;
    private _doNotRender = false;
    private _downPointerIds: { [id: number]: boolean } = {};
    protected _isEnabled = true;
    protected _disabledColor = "#9a9a9a";
    /** @hidden */
    public _tag: any;

    /**
     * Gets or sets the unique id of the node. Please note that this number will be updated when the control is added to a container
     */
    public uniqueId: number;

    /**
     * Gets or sets an object used to store user defined information for the node
     */
    public metadata: any = null;

    /** Gets or sets a boolean indicating if the control can be hit with pointer events */
    public isHitTestVisible = true;
    /** Gets or sets a boolean indicating if the control can block pointer events */
    public isPointerBlocker = false;
    /** Gets or sets a boolean indicating if the control can be focusable */
    public isFocusInvisible = false;

    /** Gets or sets a boolean indicating if the children are clipped to the current control bounds */
    public clipChildren = true;

    /** Gets or sets a value indicating the offset to apply on X axis to render the shadow */
    public shadowOffsetX = 0;
    /** Gets or sets a value indicating the offset to apply on Y axis to render the shadow */
    public shadowOffsetY = 0;
    /** Gets or sets a value indicating the amount of blur to use to render the shadow */
    public shadowBlur = 0;
    /** Gets or sets a value indicating the color of the shadow (black by default ie. "#000") */
    public shadowColor = '#000';

    /** Gets or sets the cursor to use when the control is hovered */
    public hoverCursor = "";

    /** @hidden */
    protected _linkOffsetX = new ValueAndUnit(0);
    /** @hidden */
    protected _linkOffsetY = new ValueAndUnit(0);

    // Properties

    /** Gets the control type name */
    public get typeName(): string {
        return this._getTypeName();
    }

    /**
     * Get the current class name of the control.
     * @returns current class name
     */
    public getClassName(): string {
        return this._getTypeName();
    }

    /**
    * An event triggered when the pointer move over the control.
    */
    public onPointerMoveObservable = new Observable<Vector2>();

    /**
    * An event triggered when the pointer move out of the control.
    */
    public onPointerOutObservable = new Observable<Control>();

    /**
    * An event triggered when the pointer taps the control
    */
    public onPointerDownObservable = new Observable<Vector2WithInfo>();

    /**
    * An event triggered when pointer up
    */
    public onPointerUpObservable = new Observable<Vector2WithInfo>();

    /**
    * An event triggered when a control is clicked on
    */
    public onPointerClickObservable = new Observable<Vector2WithInfo>();

    /**
    * An event triggered when pointer enters the control
    */
    public onPointerEnterObservable = new Observable<Control>();

    /**
    * An event triggered when the control is marked as dirty
    */
    public onDirtyObservable = new Observable<Control>();

    /**
     * An event triggered before drawing the control
     */
    public onBeforeDrawObservable = new Observable<Control>();

    /**
     * An event triggered after the control was drawn
     */
    public onAfterDrawObservable = new Observable<Control>();

    /** Gets or set information about font offsets (used to render and align text) */
    public get fontOffset(): { ascent: number, height: number, descent: number } {
        return this._fontOffset;
    }

    public set fontOffset(offset: { ascent: number, height: number, descent: number }) {
        this._fontOffset = offset;
    }

    /** Gets or sets alpha value for the control (1 means opaque and 0 means entirely transparent) */
    public get alpha(): number {
        return this._alpha;
    }

    public set alpha(value: number) {
        if (this._alpha === value) {
            return;
        }
        this._alphaSet = true;
        this._alpha = value;
        this._markAsDirty();
    }

    /**
     * Gets or sets a boolean indicating that we want to highlight the control (mostly for debugging purpose)
     */
    public get isHighlighted(): boolean {
        return this._isHighlighted;
    }

    public set isHighlighted(value: boolean) {
        if (this._isHighlighted === value) {
            return;
        }

        this._isHighlighted = value;
        this._markAsDirty();
    }

    /** Gets or sets a value indicating the scale factor on X axis (1 by default)
     * @see http://doc.babylonjs.com/how_to/gui#rotation-and-scaling
    */
    public get scaleX(): number {
        return this._scaleX;
    }

    public set scaleX(value: number) {
        if (this._scaleX === value) {
            return;
        }

        this._scaleX = value;
        this._markAsDirty();
        this._markMatrixAsDirty();
    }

    /** Gets or sets a value indicating the scale factor on Y axis (1 by default)
     * @see http://doc.babylonjs.com/how_to/gui#rotation-and-scaling
    */
    public get scaleY(): number {
        return this._scaleY;
    }

    public set scaleY(value: number) {
        if (this._scaleY === value) {
            return;
        }

        this._scaleY = value;
        this._markAsDirty();
        this._markMatrixAsDirty();
    }

    /** Gets or sets the rotation angle (0 by default)
     * @see http://doc.babylonjs.com/how_to/gui#rotation-and-scaling
    */
    public get rotation(): number {
        return this._rotation;
    }

    public set rotation(value: number) {
        if (this._rotation === value) {
            return;
        }

        this._rotation = value;
        this._markAsDirty();
        this._markMatrixAsDirty();
    }

    /** Gets or sets the transformation center on Y axis (0 by default)
     * @see http://doc.babylonjs.com/how_to/gui#rotation-and-scaling
    */
    public get transformCenterY(): number {
        return this._transformCenterY;
    }

    public set transformCenterY(value: number) {
        if (this._transformCenterY === value) {
            return;
        }

        this._transformCenterY = value;
        this._markAsDirty();
        this._markMatrixAsDirty();
    }

    /** Gets or sets the transformation center on X axis (0 by default)
     * @see http://doc.babylonjs.com/how_to/gui#rotation-and-scaling
    */
    public get transformCenterX(): number {
        return this._transformCenterX;
    }

    public set transformCenterX(value: number) {
        if (this._transformCenterX === value) {
            return;
        }

        this._transformCenterX = value;
        this._markAsDirty();
        this._markMatrixAsDirty();
    }

    /**
     * Gets or sets the horizontal alignment
     * @see http://doc.babylonjs.com/how_to/gui#alignments
     */
    public get horizontalAlignment(): number {
        return this._horizontalAlignment;
    }

    public set horizontalAlignment(value: number) {
        if (this._horizontalAlignment === value) {
            return;
        }

        this._horizontalAlignment = value;
        this._markAsDirty();
    }

    /**
     * Gets or sets the vertical alignment
     * @see http://doc.babylonjs.com/how_to/gui#alignments
     */
    public get verticalAlignment(): number {
        return this._verticalAlignment;
    }

    public set verticalAlignment(value: number) {
        if (this._verticalAlignment === value) {
            return;
        }

        this._verticalAlignment = value;
        this._markAsDirty();
    }

    /**
     * Gets or sets control width
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get width(): string | number {
        return this._width.toString(this._host);
    }

    /**
     * Gets control width in pixel
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get widthInPixels(): number {
        return this._width.getValueInPixel(this._host, this._cachedParentMeasure.width);
    }

    public set width(value: string | number) {
        if (this._width.toString(this._host) === value) {
            return;
        }

        if (this._width.fromString(value)) {
            this._markAsDirty();
        }
    }

    /**
     * Gets or sets control height
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get height(): string | number {
        return this._height.toString(this._host);
    }

    /**
     * Gets control height in pixel
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get heightInPixels(): number {
        return this._height.getValueInPixel(this._host, this._cachedParentMeasure.height);
    }

    public set height(value: string | number) {
        if (this._height.toString(this._host) === value) {
            return;
        }

        if (this._height.fromString(value)) {
            this._markAsDirty();
        }
    }

    /** Gets or set font family */
    public get fontFamily(): string {
        return this._fontFamily;
    }

    public set fontFamily(value: string) {
        if (this._fontFamily === value) {
            return;
        }

        this._fontFamily = value;
        this._resetFontCache();
    }

    /** Gets or sets font style */
    public get fontStyle(): string {
        return this._fontStyle;
    }

    public set fontStyle(value: string) {
        if (this._fontStyle === value) {
            return;
        }

        this._fontStyle = value;
        this._resetFontCache();
    }

    /** Gets or sets font weight */
    public get fontWeight(): string {
        return this._fontWeight;
    }

    public set fontWeight(value: string) {
        if (this._fontWeight === value) {
            return;
        }

        this._fontWeight = value;
        this._resetFontCache();
    }

    /**
     * Gets or sets style
     * @see http://doc.babylonjs.com/how_to/gui#styles
     */
    public get style(): Nullable<Style> {
        return this._style;
    }

    public set style(value: Nullable<Style>) {
        if (this._style) {
            this._style.onChangedObservable.remove(this._styleObserver);
            this._styleObserver = null;
        }

        this._style = value;

        if (this._style) {
            this._styleObserver = this._style.onChangedObservable.add(() => {
                this._markAsDirty();
                this._resetFontCache();
            });
        }

        this._markAsDirty();
        this._resetFontCache();
    }

    /** @hidden */
    public get _isFontSizeInPercentage(): boolean {
        return this._fontSize.isPercentage;
    }

    /** Gets font size in pixels */
    public get fontSizeInPixels(): number {
        let fontSizeToUse = this._style ? this._style._fontSize : this._fontSize;

        if (fontSizeToUse.isPixel) {
            return fontSizeToUse.getValue(this._host);
        }

        return fontSizeToUse.getValueInPixel(this._host, this._tempParentMeasure.height || this._cachedParentMeasure.height);
    }

    /** Gets or sets font size */
    public get fontSize(): string | number {
        return this._fontSize.toString(this._host);
    }

    public set fontSize(value: string | number) {
        if (this._fontSize.toString(this._host) === value) {
            return;
        }

        if (this._fontSize.fromString(value)) {
            this._markAsDirty();
            this._resetFontCache();
        }
    }

    /** Gets or sets foreground color */
    public get color(): string {
        return this._color;
    }

    public set color(value: string) {
        if (this._color === value) {
            return;
        }

        this._color = value;
        this._markAsDirty();
    }

    /** Gets or sets z index which is used to reorder controls on the z axis */
    public get zIndex(): number {
        return this._zIndex;
    }

    public set zIndex(value: number) {
        if (this.zIndex === value) {
            return;
        }

        this._zIndex = value;

        if (this._root) {
            this._root._reOrderControl(this);
        }
    }

    /** Gets or sets a boolean indicating if the control can be rendered */
    public get notRenderable(): boolean {
        return this._doNotRender;
    }

    public set notRenderable(value: boolean) {
        if (this._doNotRender === value) {
            return;
        }

        this._doNotRender = value;
        this._markAsDirty();
    }

    /** Gets or sets a boolean indicating if the control is visible */
    public get isVisible(): boolean {
        return this._isVisible;
    }

    public set isVisible(value: boolean) {
        if (this._isVisible === value) {
            return;
        }

        this._isVisible = value;
        this._markAsDirty(true);
    }

    /** Gets a boolean indicating that the control needs to update its rendering */
    public get isDirty(): boolean {
        return this._isDirty;
    }

    /**
     * Gets the current linked mesh (or null if none)
     */
    public get linkedMesh(): Nullable<AbstractMesh> {
        return this._linkedMesh;
    }

    /**
     * Gets or sets a value indicating the padding to use on the left of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get paddingLeft(): string | number {
        return this._paddingLeft.toString(this._host);
    }

    /**
     * Gets a value indicating the padding in pixels to use on the left of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get paddingLeftInPixels(): number {
        return this._paddingLeft.getValueInPixel(this._host, this._cachedParentMeasure.width);
    }

    public set paddingLeft(value: string | number) {
        if (this._paddingLeft.fromString(value)) {
            this._markAsDirty();
        }
    }

    /**
     * Gets or sets a value indicating the padding to use on the right of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get paddingRight(): string | number {
        return this._paddingRight.toString(this._host);
    }

    /**
     * Gets a value indicating the padding in pixels to use on the right of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get paddingRightInPixels(): number {
        return this._paddingRight.getValueInPixel(this._host, this._cachedParentMeasure.width);
    }

    public set paddingRight(value: string | number) {
        if (this._paddingRight.fromString(value)) {
            this._markAsDirty();
        }
    }

    /**
     * Gets or sets a value indicating the padding to use on the top of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get paddingTop(): string | number {
        return this._paddingTop.toString(this._host);
    }

    /**
     * Gets a value indicating the padding in pixels to use on the top of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get paddingTopInPixels(): number {
        return this._paddingTop.getValueInPixel(this._host, this._cachedParentMeasure.height);
    }

    public set paddingTop(value: string | number) {
        if (this._paddingTop.fromString(value)) {
            this._markAsDirty();
        }
    }

    /**
     * Gets or sets a value indicating the padding to use on the bottom of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get paddingBottom(): string | number {
        return this._paddingBottom.toString(this._host);
    }

    /**
     * Gets a value indicating the padding in pixels to use on the bottom of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get paddingBottomInPixels(): number {
        return this._paddingBottom.getValueInPixel(this._host, this._cachedParentMeasure.height);
    }

    public set paddingBottom(value: string | number) {
        if (this._paddingBottom.fromString(value)) {
            this._markAsDirty();
        }
    }

    /**
     * Gets or sets a value indicating the left coordinate of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get left(): string | number {
        return this._left.toString(this._host);
    }

    /**
     * Gets a value indicating the left coordinate in pixels of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get leftInPixels(): number {
        return this._left.getValueInPixel(this._host, this._cachedParentMeasure.width);
    }

    public set left(value: string | number) {
        if (this._left.fromString(value)) {
            this._markAsDirty();
        }
    }

    /**
     * Gets or sets a value indicating the top coordinate of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get top(): string | number {
        return this._top.toString(this._host);
    }

    /**
     * Gets a value indicating the top coordinate in pixels of the control
     * @see http://doc.babylonjs.com/how_to/gui#position-and-size
     */
    public get topInPixels(): number {
        return this._top.getValueInPixel(this._host, this._cachedParentMeasure.height);
    }

    public set top(value: string | number) {
        if (this._top.fromString(value)) {
            this._markAsDirty();
        }
    }

    /**
     * Gets or sets a value indicating the offset on X axis to the linked mesh
     * @see http://doc.babylonjs.com/how_to/gui#tracking-positions
     */
    public get linkOffsetX(): string | number {
        return this._linkOffsetX.toString(this._host);
    }

    /**
     * Gets a value indicating the offset in pixels on X axis to the linked mesh
     * @see http://doc.babylonjs.com/how_to/gui#tracking-positions
     */
    public get linkOffsetXInPixels(): number {
        return this._linkOffsetX.getValueInPixel(this._host, this._cachedParentMeasure.width);
    }

    public set linkOffsetX(value: string | number) {
        if (this._linkOffsetX.fromString(value)) {
            this._markAsDirty();
        }
    }

    /**
     * Gets or sets a value indicating the offset on Y axis to the linked mesh
     * @see http://doc.babylonjs.com/how_to/gui#tracking-positions
     */
    public get linkOffsetY(): string | number {
        return this._linkOffsetY.toString(this._host);
    }

    /**
     * Gets a value indicating the offset in pixels on Y axis to the linked mesh
     * @see http://doc.babylonjs.com/how_to/gui#tracking-positions
     */
    public get linkOffsetYInPixels(): number {
        return this._linkOffsetY.getValueInPixel(this._host, this._cachedParentMeasure.height);
    }

    public set linkOffsetY(value: string | number) {
        if (this._linkOffsetY.fromString(value)) {
            this._markAsDirty();
        }
    }

    /** Gets the center coordinate on X axis */
    public get centerX(): number {
        return this._currentMeasure.left + this._currentMeasure.width / 2;
    }

    /** Gets the center coordinate on Y axis */
    public get centerY(): number {
        return this._currentMeasure.top + this._currentMeasure.height / 2;
    }

    /** Gets or sets if control is Enabled*/
    public get isEnabled(): boolean {
        return this._isEnabled;
    }

    public set isEnabled(value: boolean) {
        if (this._isEnabled === value) {
            return;
        }

        this._isEnabled = value;
        this._markAsDirty();
    }
    /** Gets or sets background color of control if it's disabled*/
    public get disabledColor(): string {
        return this._disabledColor;
    }

    public set disabledColor(value: string) {
        if (this._disabledColor === value) {
            return;
        }

        this._disabledColor = value;
        this._markAsDirty();
    }
    // Functions

    /**
     * Creates a new control
     * @param name defines the name of the control
     */
    constructor(
        /** defines the name of the control */
        public name?: string) {
    }

    /** @hidden */
    protected _getTypeName(): string {
        return "Control";
    }

    /** @hidden */
    public _resetFontCache(): void {
        this._fontSet = true;
        this._markAsDirty();
    }

    /**
     * Determines if a container is an ascendant of the current control
     * @param container defines the container to look for
     * @returns true if the container is one of the ascendant of the control
     */
    public isAscendant(container: Control): boolean {
        if (!this.parent) {
            return false;
        }

        if (this.parent === container) {
            return true;
        }

        return this.parent.isAscendant(container);
    }

    /**
     * Gets coordinates in local control space
     * @param globalCoordinates defines the coordinates to transform
     * @returns the new coordinates in local space
     */
    public getLocalCoordinates(globalCoordinates: Vector2): Vector2 {
        var result = Vector2.Zero();

        this.getLocalCoordinatesToRef(globalCoordinates, result);

        return result;
    }

    /**
     * Gets coordinates in local control space
     * @param globalCoordinates defines the coordinates to transform
     * @param result defines the target vector2 where to store the result
     * @returns the current control
     */
    public getLocalCoordinatesToRef(globalCoordinates: Vector2, result: Vector2): Control {
        result.x = globalCoordinates.x - this._currentMeasure.left;
        result.y = globalCoordinates.y - this._currentMeasure.top;
        return this;
    }

    /**
     * Gets coordinates in parent local control space
     * @param globalCoordinates defines the coordinates to transform
     * @returns the new coordinates in parent local space
     */
    public getParentLocalCoordinates(globalCoordinates: Vector2): Vector2 {
        var result = Vector2.Zero();

        result.x = globalCoordinates.x - this._cachedParentMeasure.left;
        result.y = globalCoordinates.y - this._cachedParentMeasure.top;

        return result;
    }

    /**
     * Move the current control to a vector3 position projected onto the screen.
     * @param position defines the target position
     * @param scene defines the hosting scene
     */
    public moveToVector3(position: Vector3, scene: Scene): void {
        if (!this._host || this._root !== this._host._rootContainer) {
            Tools.Error("Cannot move a control to a vector3 if the control is not at root level");
            return;
        }

        this.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;

        var globalViewport = this._host._getGlobalViewport(scene);
        var projectedPosition = Vector3.Project(position, Matrix.Identity(), scene.getTransformMatrix(), globalViewport);

        this._moveToProjectedPosition(projectedPosition);

        if (projectedPosition.z < 0 || projectedPosition.z > 1) {
            this.notRenderable = true;
            return;
        }
        this.notRenderable = false;
    }

    /**
     * Link current control with a target mesh
     * @param mesh defines the mesh to link with
     * @see http://doc.babylonjs.com/how_to/gui#tracking-positions
     */
    public linkWithMesh(mesh: Nullable<AbstractMesh>): void {
        if (!this._host || this._root && this._root !== this._host._rootContainer) {
            if (mesh) {
                Tools.Error("Cannot link a control to a mesh if the control is not at root level");
            }
            return;
        }

        var index = this._host._linkedControls.indexOf(this);
        if (index !== -1) {
            this._linkedMesh = mesh;
            if (!mesh) {
                this._host._linkedControls.splice(index, 1);
            }
            return;
        } else if (!mesh) {
            return;
        }

        this.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
        this._linkedMesh = mesh;
        this._onlyMeasureMode = this._currentMeasure.width === 0 || this._currentMeasure.height === 0;
        this._host._linkedControls.push(this);
    }

    /** @hidden */
    public _moveToProjectedPosition(projectedPosition: Vector3): void {
        let oldLeft = this._left.getValue(this._host);
        let oldTop = this._top.getValue(this._host);

        var newLeft = ((projectedPosition.x + this._linkOffsetX.getValue(this._host)) - this._currentMeasure.width / 2);
        var newTop = ((projectedPosition.y + this._linkOffsetY.getValue(this._host)) - this._currentMeasure.height / 2);

        if (this._left.ignoreAdaptiveScaling && this._top.ignoreAdaptiveScaling) {
            if (Math.abs(newLeft - oldLeft) < 0.5) {
                newLeft = oldLeft;
            }

            if (Math.abs(newTop - oldTop) < 0.5) {
                newTop = oldTop;
            }
        }

        this.left = newLeft + "px";
        this.top = newTop + "px";

        this._left.ignoreAdaptiveScaling = true;
        this._top.ignoreAdaptiveScaling = true;
    }

    /** @hidden */
    public _markMatrixAsDirty(): void {
        this._isMatrixDirty = true;
        this._flagDescendantsAsMatrixDirty();
    }

    /** @hidden */
    public _flagDescendantsAsMatrixDirty(): void {
        // No child
    }

    /** @hidden */
    public _markAsDirty(force = false): void {
        if (!this._isVisible && !force) {
            return;
        }

        this._isDirty = true;

        if (!this._host) {
            return; // Not yet connected
        }
        this._host.markAsDirty();
    }

    /** @hidden */
    public _markAllAsDirty(): void {
        this._markAsDirty();

        if (this._font) {
            this._prepareFont();
        }
    }

    /** @hidden */
    public _link(root: Nullable<Container>, host: AdvancedDynamicTexture): void {
        this._root = root;
        this._host = host;
        if (this._host) {
            this.uniqueId = this._host.getScene()!.getUniqueId();
        }
    }

    /** @hidden */
    protected _transform(context: CanvasRenderingContext2D): void {
        if (!this._isMatrixDirty && this._scaleX === 1 && this._scaleY === 1 && this._rotation === 0) {
            return;
        }

        // postTranslate
        var offsetX = this._currentMeasure.width * this._transformCenterX + this._currentMeasure.left;
        var offsetY = this._currentMeasure.height * this._transformCenterY + this._currentMeasure.top;
        context.translate(offsetX, offsetY);

        // rotate
        context.rotate(this._rotation);

        // scale
        context.scale(this._scaleX, this._scaleY);

        // preTranslate
        context.translate(-offsetX, -offsetY);

        // Need to update matrices?
        if (this._isMatrixDirty || this._cachedOffsetX !== offsetX || this._cachedOffsetY !== offsetY) {
            this._cachedOffsetX = offsetX;
            this._cachedOffsetY = offsetY;
            this._isMatrixDirty = false;
            this._flagDescendantsAsMatrixDirty();

            Matrix2D.ComposeToRef(-offsetX, -offsetY, this._rotation, this._scaleX, this._scaleY, this._root ? this._root._transformMatrix : null, this._transformMatrix);

            this._transformMatrix.invertToRef(this._invertTransformMatrix);
        }
    }

    /** @hidden */
    public _renderHighlight(context: CanvasRenderingContext2D): void {
        if (!this.isHighlighted) {
            return;
        }

        context.strokeStyle = "#4affff";
        context.lineWidth = 2;

        this._renderHighlightSpecific(context);
    }

    /** @hidden */
    protected _renderHighlightSpecific(context: CanvasRenderingContext2D): void {
        context.strokeRect(this._currentMeasure.left, this._currentMeasure.top, this._currentMeasure.width, this._currentMeasure.height);
    }

    /** @hidden */
    protected _applyStates(context: CanvasRenderingContext2D): void {
        if (this._isFontSizeInPercentage) {
            this._fontSet = true;
        }

        if (this._fontSet) {
            this._prepareFont();
            this._fontSet = false;
        }

        if (this._font) {
            context.font = this._font;
        }

        if (this._color) {
            context.fillStyle = this._color;
        }

        if (Control.AllowAlphaInheritance) {
            context.globalAlpha *= this._alpha;
        } else if (this._alphaSet) {
            context.globalAlpha = this.parent ? this.parent.alpha * this._alpha : this._alpha;
        }
    }

    /** @hidden */
    protected _processMeasures(parentMeasure: Measure, context: CanvasRenderingContext2D): boolean {
        if (this._isDirty || !this._cachedParentMeasure.isEqualsTo(parentMeasure)) {
            this._isDirty = false;
            this._currentMeasure.copyFrom(parentMeasure);

            // Let children take some pre-measurement actions
            this._preMeasure(parentMeasure, context);

            this._measure();
            this._computeAlignment(parentMeasure, context);

            // Convert to int values
            this._currentMeasure.left = this._currentMeasure.left | 0;
            this._currentMeasure.top = this._currentMeasure.top | 0;
            this._currentMeasure.width = this._currentMeasure.width | 0;
            this._currentMeasure.height = this._currentMeasure.height | 0;

            // Let children add more features
            this._additionalProcessing(parentMeasure, context);

            this._cachedParentMeasure.copyFrom(parentMeasure);

            if (this.onDirtyObservable.hasObservers()) {
                this.onDirtyObservable.notifyObservers(this);
            }
        }

        if (this._currentMeasure.left > parentMeasure.left + parentMeasure.width) {
            return false;
        }

        if (this._currentMeasure.left + this._currentMeasure.width < parentMeasure.left) {
            return false;
        }

        if (this._currentMeasure.top > parentMeasure.top + parentMeasure.height) {
            return false;
        }

        if (this._currentMeasure.top + this._currentMeasure.height < parentMeasure.top) {
            return false;
        }

        // Transform
        this._transform(context);

        if (this._onlyMeasureMode) {
            this._onlyMeasureMode = false;
            return false; // We do not want rendering for this frame as they are measure dependant information that need to be gathered
        }

        // Clip
        if (this.clipChildren) {
            this._clip(context);
            context.clip();
        }

        if (this.onBeforeDrawObservable.hasObservers()) {
            this.onBeforeDrawObservable.notifyObservers(this);
        }

        return true;
    }

    /** @hidden */
    protected _clip(context: CanvasRenderingContext2D) {
        context.beginPath();

        if (this.shadowBlur || this.shadowOffsetX || this.shadowOffsetY) {
            var shadowOffsetX = this.shadowOffsetX;
            var shadowOffsetY = this.shadowOffsetY;
            var shadowBlur = this.shadowBlur;

            var leftShadowOffset = Math.min(Math.min(shadowOffsetX, 0) - shadowBlur * 2, 0);
            var rightShadowOffset = Math.max(Math.max(shadowOffsetX, 0) + shadowBlur * 2, 0);
            var topShadowOffset = Math.min(Math.min(shadowOffsetY, 0) - shadowBlur * 2, 0);
            var bottomShadowOffset = Math.max(Math.max(shadowOffsetY, 0) + shadowBlur * 2, 0);

            context.rect(this._currentMeasure.left + leftShadowOffset,
                this._currentMeasure.top + topShadowOffset,
                this._currentMeasure.width + rightShadowOffset - leftShadowOffset,
                this._currentMeasure.height + bottomShadowOffset - topShadowOffset);
        } else {
            context.rect(this._currentMeasure.left, this._currentMeasure.top, this._currentMeasure.width, this._currentMeasure.height);
        }
    }

    /** @hidden */
    public _measure(): void {
        // Width / Height
        if (this._width.isPixel) {
            this._currentMeasure.width = this._width.getValue(this._host);
        } else {
            this._currentMeasure.width *= this._width.getValue(this._host);
        }

        if (this._height.isPixel) {
            this._currentMeasure.height = this._height.getValue(this._host);
        } else {
            this._currentMeasure.height *= this._height.getValue(this._host);
        }
    }

    /** @hidden */
    protected _computeAlignment(parentMeasure: Measure, context: CanvasRenderingContext2D): void {
        var width = this._currentMeasure.width;
        var height = this._currentMeasure.height;

        var parentWidth = parentMeasure.width;
        var parentHeight = parentMeasure.height;

        // Left / top
        var x = 0;
        var y = 0;

        switch (this.horizontalAlignment) {
            case Control.HORIZONTAL_ALIGNMENT_LEFT:
                x = 0;
                break;
            case Control.HORIZONTAL_ALIGNMENT_RIGHT:
                x = parentWidth - width;
                break;
            case Control.HORIZONTAL_ALIGNMENT_CENTER:
                x = (parentWidth - width) / 2;
                break;
        }

        switch (this.verticalAlignment) {
            case Control.VERTICAL_ALIGNMENT_TOP:
                y = 0;
                break;
            case Control.VERTICAL_ALIGNMENT_BOTTOM:
                y = parentHeight - height;
                break;
            case Control.VERTICAL_ALIGNMENT_CENTER:
                y = (parentHeight - height) / 2;
                break;
        }

        if (this._paddingLeft.isPixel) {
            this._currentMeasure.left += this._paddingLeft.getValue(this._host);
            this._currentMeasure.width -= this._paddingLeft.getValue(this._host);
        } else {
            this._currentMeasure.left += parentWidth * this._paddingLeft.getValue(this._host);
            this._currentMeasure.width -= parentWidth * this._paddingLeft.getValue(this._host);
        }

        if (this._paddingRight.isPixel) {
            this._currentMeasure.width -= this._paddingRight.getValue(this._host);
        } else {
            this._currentMeasure.width -= parentWidth * this._paddingRight.getValue(this._host);
        }

        if (this._paddingTop.isPixel) {
            this._currentMeasure.top += this._paddingTop.getValue(this._host);
            this._currentMeasure.height -= this._paddingTop.getValue(this._host);
        } else {
            this._currentMeasure.top += parentHeight * this._paddingTop.getValue(this._host);
            this._currentMeasure.height -= parentHeight * this._paddingTop.getValue(this._host);
        }

        if (this._paddingBottom.isPixel) {
            this._currentMeasure.height -= this._paddingBottom.getValue(this._host);
        } else {
            this._currentMeasure.height -= parentHeight * this._paddingBottom.getValue(this._host);
        }

        if (this._left.isPixel) {
            this._currentMeasure.left += this._left.getValue(this._host);
        } else {
            this._currentMeasure.left += parentWidth * this._left.getValue(this._host);
        }

        if (this._top.isPixel) {
            this._currentMeasure.top += this._top.getValue(this._host);
        } else {
            this._currentMeasure.top += parentHeight * this._top.getValue(this._host);
        }

        this._currentMeasure.left += x;
        this._currentMeasure.top += y;
    }

    /** @hidden */
    protected _preMeasure(parentMeasure: Measure, context: CanvasRenderingContext2D): void {
        // Do nothing
    }

    /** @hidden */
    protected _additionalProcessing(parentMeasure: Measure, context: CanvasRenderingContext2D): void {
        // Do nothing
    }

    /** @hidden */
    public _draw(parentMeasure: Measure, context: CanvasRenderingContext2D): void {
        // Do nothing
    }

    /**
     * Tests if a given coordinates belong to the current control
     * @param x defines x coordinate to test
     * @param y defines y coordinate to test
     * @returns true if the coordinates are inside the control
     */
    public contains(x: number, y: number): boolean {
        // Invert transform
        this._invertTransformMatrix.transformCoordinates(x, y, this._transformedPosition);

        x = this._transformedPosition.x;
        y = this._transformedPosition.y;

        // Check
        if (x < this._currentMeasure.left) {
            return false;
        }

        if (x > this._currentMeasure.left + this._currentMeasure.width) {
            return false;
        }

        if (y < this._currentMeasure.top) {
            return false;
        }

        if (y > this._currentMeasure.top + this._currentMeasure.height) {
            return false;
        }

        if (this.isPointerBlocker) {
            this._host._shouldBlockPointer = true;
        }
        return true;
    }

    /** @hidden */
    public _processPicking(x: number, y: number, type: number, pointerId: number, buttonIndex: number): boolean {
        if (!this._isEnabled) {
            return false;
        }
        if (!this.isHitTestVisible || !this.isVisible || this._doNotRender) {
            return false;
        }

        if (!this.contains(x, y)) {
            return false;
        }

        this._processObservables(type, x, y, pointerId, buttonIndex);

        return true;
    }

    /** @hidden */
    public _onPointerMove(target: Control, coordinates: Vector2): void {
        var canNotify: boolean = this.onPointerMoveObservable.notifyObservers(coordinates, -1, target, this);

        if (canNotify && this.parent != null) { this.parent._onPointerMove(target, coordinates); }
    }

    /** @hidden */
    public _onPointerEnter(target: Control): boolean {
        if (!this._isEnabled) {
            return false;
        }
        if (this._enterCount > 0) {
            return false;
        }

        if (this._enterCount === -1) { // -1 is for touch input, we are now sure we are with a mouse or pencil
            this._enterCount = 0;
        }
        this._enterCount++;

        var canNotify: boolean = this.onPointerEnterObservable.notifyObservers(this, -1, target, this);

        if (canNotify && this.parent != null) { this.parent._onPointerEnter(target); }

        return true;
    }

    /** @hidden */
    public _onPointerOut(target: Control): void {
        if (!this._isEnabled || target === this) {
            return;
        }
        this._enterCount = 0;

        var canNotify: boolean = true;

        if (!target.isAscendant(this)) {
            canNotify = this.onPointerOutObservable.notifyObservers(this, -1, target, this);
        }

        if (canNotify && this.parent != null) { this.parent._onPointerOut(target); }
    }

    /** @hidden */
    public _onPointerDown(target: Control, coordinates: Vector2, pointerId: number, buttonIndex: number): boolean {
        // Prevent pointerout to lose control context.
        // Event redundancy is checked inside the function.
        this._onPointerEnter(this);

        if (this._downCount !== 0) {
            return false;
        }

        this._downCount++;

        this._downPointerIds[pointerId] = true;

        var canNotify: boolean = this.onPointerDownObservable.notifyObservers(new Vector2WithInfo(coordinates, buttonIndex), -1, target, this);

        if (canNotify && this.parent != null) { this.parent._onPointerDown(target, coordinates, pointerId, buttonIndex); }

        return true;
    }

    /** @hidden */
    public _onPointerUp(target: Control, coordinates: Vector2, pointerId: number, buttonIndex: number, notifyClick: boolean): void {
        if (!this._isEnabled) {
            return;
        }
        this._downCount = 0;

        delete this._downPointerIds[pointerId];

        var canNotifyClick: boolean = notifyClick;
        if (notifyClick && (this._enterCount > 0 || this._enterCount === -1)) {
            canNotifyClick = this.onPointerClickObservable.notifyObservers(new Vector2WithInfo(coordinates, buttonIndex), -1, target, this);
        }
        var canNotify: boolean = this.onPointerUpObservable.notifyObservers(new Vector2WithInfo(coordinates, buttonIndex), -1, target, this);

        if (canNotify && this.parent != null) { this.parent._onPointerUp(target, coordinates, pointerId, buttonIndex, canNotifyClick); }
    }

    /** @hidden */
    public _forcePointerUp(pointerId: Nullable<number> = null) {
        if (pointerId !== null) {
            this._onPointerUp(this, Vector2.Zero(), pointerId, 0, true);
        } else {
            for (var key in this._downPointerIds) {
                this._onPointerUp(this, Vector2.Zero(), +key as number, 0, true);
            }
        }
    }

    /** @hidden */
    public _processObservables(type: number, x: number, y: number, pointerId: number, buttonIndex: number): boolean {
        if (!this._isEnabled) {
            return false;
        }
        this._dummyVector2.copyFromFloats(x, y);
        if (type === PointerEventTypes.POINTERMOVE) {
            this._onPointerMove(this, this._dummyVector2);

            var previousControlOver = this._host._lastControlOver[pointerId];
            if (previousControlOver && previousControlOver !== this) {
                previousControlOver._onPointerOut(this);
            }

            if (previousControlOver !== this) {
                this._onPointerEnter(this);
            }

            this._host._lastControlOver[pointerId] = this;
            return true;
        }

        if (type === PointerEventTypes.POINTERDOWN) {
            this._onPointerDown(this, this._dummyVector2, pointerId, buttonIndex);
            this._host._registerLastControlDown(this, pointerId);
            this._host._lastPickedControl = this;
            return true;
        }

        if (type === PointerEventTypes.POINTERUP) {
            if (this._host._lastControlDown[pointerId]) {
                this._host._lastControlDown[pointerId]._onPointerUp(this, this._dummyVector2, pointerId, buttonIndex, true);
            }
            delete this._host._lastControlDown[pointerId];
            return true;
        }

        return false;
    }

    private _prepareFont() {
        if (!this._font && !this._fontSet) {
            return;
        }

        if (this._style) {
            this._font = this._style.fontStyle + " " + this._style.fontWeight + " " + this.fontSizeInPixels + "px " + this._style.fontFamily;
        } else {
            this._font = this._fontStyle + " " + this._fontWeight + " " + this.fontSizeInPixels + "px " + this._fontFamily;
        }

        this._fontOffset = Control._GetFontOffset(this._font);
    }

    /** Releases associated resources */
    public dispose() {
        this.onDirtyObservable.clear();
        this.onBeforeDrawObservable.clear();
        this.onAfterDrawObservable.clear();
        this.onPointerDownObservable.clear();
        this.onPointerEnterObservable.clear();
        this.onPointerMoveObservable.clear();
        this.onPointerOutObservable.clear();
        this.onPointerUpObservable.clear();
        this.onPointerClickObservable.clear();

        if (this._styleObserver && this._style) {
            this._style.onChangedObservable.remove(this._styleObserver);
            this._styleObserver = null;
        }

        if (this._root) {
            this._root.removeControl(this);
            this._root = null;
        }

        if (this._host) {
            var index = this._host._linkedControls.indexOf(this);
            if (index > -1) {
                this.linkWithMesh(null);
            }
        }
    }

    // Statics
    private static _HORIZONTAL_ALIGNMENT_LEFT = 0;
    private static _HORIZONTAL_ALIGNMENT_RIGHT = 1;
    private static _HORIZONTAL_ALIGNMENT_CENTER = 2;

    private static _VERTICAL_ALIGNMENT_TOP = 0;
    private static _VERTICAL_ALIGNMENT_BOTTOM = 1;
    private static _VERTICAL_ALIGNMENT_CENTER = 2;

    /** HORIZONTAL_ALIGNMENT_LEFT */
    public static get HORIZONTAL_ALIGNMENT_LEFT(): number {
        return Control._HORIZONTAL_ALIGNMENT_LEFT;
    }

    /** HORIZONTAL_ALIGNMENT_RIGHT */
    public static get HORIZONTAL_ALIGNMENT_RIGHT(): number {
        return Control._HORIZONTAL_ALIGNMENT_RIGHT;
    }

    /** HORIZONTAL_ALIGNMENT_CENTER */
    public static get HORIZONTAL_ALIGNMENT_CENTER(): number {
        return Control._HORIZONTAL_ALIGNMENT_CENTER;
    }

    /** VERTICAL_ALIGNMENT_TOP */
    public static get VERTICAL_ALIGNMENT_TOP(): number {
        return Control._VERTICAL_ALIGNMENT_TOP;
    }

    /** VERTICAL_ALIGNMENT_BOTTOM */
    public static get VERTICAL_ALIGNMENT_BOTTOM(): number {
        return Control._VERTICAL_ALIGNMENT_BOTTOM;
    }

    /** VERTICAL_ALIGNMENT_CENTER */
    public static get VERTICAL_ALIGNMENT_CENTER(): number {
        return Control._VERTICAL_ALIGNMENT_CENTER;
    }

    private static _FontHeightSizes: { [key: string]: { ascent: number, height: number, descent: number } } = {};

    /** @hidden */
    public static _GetFontOffset(font: string): { ascent: number, height: number, descent: number } {

        if (Control._FontHeightSizes[font]) {
            return Control._FontHeightSizes[font];
        }

        var text = document.createElement("span");
        text.innerHTML = "Hg";
        text.style.font = font;

        var block = document.createElement("div");
        block.style.display = "inline-block";
        block.style.width = "1px";
        block.style.height = "0px";
        block.style.verticalAlign = "bottom";

        var div = document.createElement("div");
        div.appendChild(text);
        div.appendChild(block);

        document.body.appendChild(div);

        var fontAscent = 0;
        var fontHeight = 0;
        try {
            fontHeight = block.getBoundingClientRect().top - text.getBoundingClientRect().top;
            block.style.verticalAlign = "baseline";
            fontAscent = block.getBoundingClientRect().top - text.getBoundingClientRect().top;
        } finally {
            document.body.removeChild(div);
        }
        var result = { ascent: fontAscent, height: fontHeight, descent: fontHeight - fontAscent };
        Control._FontHeightSizes[font] = result;

        return result;
    }

    /**
     * Creates a stack panel that can be used to render headers
     * @param control defines the control to associate with the header
     * @param text defines the text of the header
     * @param size defines the size of the header
     * @param options defines options used to configure the header
     * @returns a new StackPanel
     * @ignore
     * @hidden
     */
    public static AddHeader: (control: Control, text: string, size: string | number, options: { isHorizontal: boolean, controlFirst: boolean }) => any = () => { };

    /** @hidden */
    protected static drawEllipse(x: number, y: number, width: number, height: number, context: CanvasRenderingContext2D): void {
        context.translate(x, y);
        context.scale(width, height);

        context.beginPath();
        context.arc(0, 0, 1, 0, 2 * Math.PI);
        context.closePath();

        context.scale(1 / width, 1 / height);
        context.translate(-x, -y);
    }
}
