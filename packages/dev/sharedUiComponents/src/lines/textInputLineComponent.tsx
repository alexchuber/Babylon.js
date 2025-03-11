/* eslint-disable no-console */
import * as React from "react";
import type { Observable } from "core/Misc/observable";
import type { PropertyChangedEvent } from "../propertyChangedEvent";
import type { LockObject } from "../tabs/propertyGrids/lockObject";
import { conflictingValuesPlaceholder } from "./targetsProxy";
import { InputArrowsComponent } from "./inputArrowsComponent";

export interface ITextInputLineComponentProps {
    label?: string;
    lockObject?: LockObject;
    target?: any;
    propertyName?: string;
    value?: string;
    onChange?: (value: string) => void;
    onPropertyChangedObservable?: Observable<PropertyChangedEvent>;
    icon?: string;
    iconLabel?: string;
    noUnderline?: boolean;
    numbersOnly?: boolean;
    delayInput?: boolean;
    arrows?: boolean;
    arrowsIncrement?: (amount: number) => void;
    step?: number;
    numeric?: boolean;
    roundValues?: boolean;
    min?: number;
    max?: number;
    placeholder?: string;
    unit?: React.ReactNode;
    validator?: (input: string) => boolean;
    onValidateChangeFailed?: (invalidInput: string) => void;
    multilines?: boolean;
    throttlePropertyChangedNotification?: boolean;
    throttlePropertyChangedNotificationDelay?: number;
    disabled?: boolean;
}

interface ITextInputLineComponentState {
    input: string;
    dragging: boolean;
    inputValid: boolean;
}

let throttleTimerId = -1;

function getCurrentNumericValue(value: string, props: ITextInputLineComponentProps) {
    const numeric = parseFloat(value);
    if (!isNaN(numeric)) {
        return numeric;
    }
    if (props.placeholder !== undefined) {
        const placeholderNumeric = parseFloat(props.placeholder);
        if (!isNaN(placeholderNumeric)) {
            return placeholderNumeric;
        }
    }
    return 0;
}

function raiseOnPropertyChanged(newValue: string, previousValue: string, props: ITextInputLineComponentProps) {
    if (props.onChange) {
        console.log("Raising onChange event", newValue, props);
        props.onChange(newValue);
        return;
    }

    if (!props.onPropertyChangedObservable) {
        return;
    }

    props.onPropertyChangedObservable.notifyObservers({
        object: props.target,
        property: props.propertyName!,
        value: newValue,
        initialValue: previousValue,
    });
}

function updateValue(value: string, props: ITextInputLineComponentProps) {
    console.log("updateValue to", value, props);
    if (props.numbersOnly) {
        if (!value) {
            value = "0";
        }

        //Removing starting zero if there is a number of a minus after it.
        if (value.search(/0+[0-9-]/g) === 0) {
            value = value.substring(1);
        }
    }

    if (props.numeric) {
        let numericValue = getCurrentNumericValue(value, props);
        if (props.roundValues) {
            numericValue = Math.round(numericValue);
        }
        if (props.min !== undefined) {
            numericValue = Math.max(props.min, numericValue);
        }
        if (props.max !== undefined) {
            numericValue = Math.min(props.max, numericValue);
        }
        value = numericValue.toString();
    }

    const store = props.value !== undefined ? props.value : props.target[props.propertyName!];

    if (props.validator && props.validator(value) == false) {
        if (props.onValidateChangeFailed) {
            props.onValidateChangeFailed(value);
        }
        return;
    }

    if (props.propertyName && !props.delayInput) {
        props.target[props.propertyName] = value;
    }

    if (props.throttlePropertyChangedNotification) {
        if (throttleTimerId >= 0) {
            window.clearTimeout(throttleTimerId);
        }
        throttleTimerId = window.setTimeout(() => {
            raiseOnPropertyChanged(value, store, props);
        }, props.throttlePropertyChangedNotificationDelay ?? 200);
    } else {
        raiseOnPropertyChanged(value, store, props);
    }
}

export class TextInputLineComponent extends React.Component<ITextInputLineComponentProps, ITextInputLineComponentState> {
    private _localChange = false;

    constructor(props: ITextInputLineComponentProps) {
        super(props);

        const emptyValue = this.props.numeric ? "0" : "";

        this.state = {
            input: (this.props.value !== undefined ? this.props.value : this.props.target[this.props.propertyName!]) || emptyValue,
            dragging: false,
            inputValid: true,
        };
    }

    override componentWillUnmount() {
        console.log("onComponentWillUnmount", this.props, this.state);
        updateValue(this.state.input, this.props);
        if (this.props.lockObject) {
            this.props.lockObject.lock = false;
        }
    }

    override shouldComponentUpdate(nextProps: ITextInputLineComponentProps, nextState: ITextInputLineComponentState) {
        if (this._localChange) {
            this._localChange = false;
            return true;
        }

        if (nextProps.value !== undefined && nextProps.value === this.props.value) {
            return false;
        }
        if (nextProps.target === this.props.target && nextProps.propertyName === this.props.propertyName) {
            if (nextProps.propertyName !== undefined && nextProps.target[nextProps.propertyName] === this.props.target[this.props.propertyName!]) {
                return false;
            }
        }

        // const newValue = nextProps.value !== undefined ? nextProps.value : nextProps.target[nextProps.propertyName!];
        // if (newValue !== nextState.value) {
        //     nextState.value = newValue || "";
        //     return true;
        // }

        // From here on, this means the component has changed from the outside (e.g. prop changed)

        // Store previous value
        console.log(`onComponentDidUpdate (not local) - storing previous value ${this.state.input}`);
        updateValue(this.state.input, this.props);

        // Construct state for new target / value
        const emptyValue = this.props.numeric ? "0" : "";

        this._localChange = true;
        nextState.input = (nextProps.value !== undefined ? nextProps.value : nextProps.target[nextProps.propertyName!]) || emptyValue;

        return true;
    }

    // override componentDidUpdate(prevProps: ITextInputLineComponentProps, prevState: ITextInputLineComponentState) {
    //     if (this._localChange) {
    //         this._localChange = false;
    //         return;
    //     }
    //     if (prevProps.target === this.props.target && prevProps.propertyName === this.props.propertyName) {
    //         return;
    //     }
    //     if (prevProps.value !== undefined && prevProps.value === this.props.value) {
    //         return;
    //     }

    //     // From here on, this means the value has changed from the outside (e.g. prop changed)

    //     // Store previous value
    //     console.log(`onComponentDidUpdate (not local) - storing previous value ${prevState.input}`);
    //     updateValue(prevState.input, prevProps);

    //     // Construct state for new target / value
    //     const emptyValue = this.props.numeric ? "0" : "";

    //     this._localChange = true;
    //     this.setState({
    //         input: (this.props.value !== undefined ? this.props.value : this.props.target[this.props.propertyName!]) || emptyValue,
    //         dragging: false,
    //         inputValid: true,
    //     });
    // }

    setInput(input: string) {
        if (this.props.disabled) {
            return;
        }
        if (this.props.numbersOnly) {
            if (/[^0-9.px%-]/g.test(input)) {
                return;
            }
        }

        this._localChange = true;
        this.setState({
            input,
            inputValid: this.props.validator ? this.props.validator(input) : true,
        });
    }

    // Event handlers

    setDragging = (dragging: boolean) => {
        this._localChange = true;
        this.setState({ dragging });
    };

    incrementValue = (amount: number) => {
        if (this.props.step) {
            amount *= this.props.step;
        }
        if (this.props.arrowsIncrement) {
            this.props.arrowsIncrement(amount);
        }
        const currentValue = getCurrentNumericValue(this.state.input, this.props);
        const newValue = (currentValue + amount).toFixed(2);

        console.log(`incrementValue to ${newValue}`);

        this.setInput(newValue);

        if (!this.props.arrowsIncrement) {
            updateValue(newValue, this.props);
        }
    };

    onChange = (event: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        console.log("onChange", event.target.value);
        this.setInput(event.target.value);
    };

    onKeyDown = (event: React.KeyboardEvent) => {
        if (!this.props.disabled) {
            // Submit on enter
            if (event.key === "Enter") {
                updateValue(this.state.input, this.props);
            }
            if (this.props.arrows) {
                if (event.key === "ArrowUp") {
                    this.incrementValue(1);
                    event.preventDefault();
                }
                if (event.key === "ArrowDown") {
                    this.incrementValue(-1);
                    event.preventDefault();
                }
            }
        }
    };

    onBlur = () => {
        console.log("onBlur", this.state.input);
        updateValue(this.state.input, this.props);
        if (this.props.lockObject) {
            this.props.lockObject.lock = false;
        }
    };

    onFocus = () => {
        console.log("onFocus");
        if (this.props.lockObject) {
            this.props.lockObject.lock = true;
        }
    };

    override render() {
        const value = this.state.input === conflictingValuesPlaceholder ? "" : this.state.input;
        const placeholder = this.state.input === conflictingValuesPlaceholder ? conflictingValuesPlaceholder : this.props.placeholder || "";
        const step = this.props.step || (this.props.roundValues ? 1 : 0.01);
        const className = this.props.multilines ? "textInputArea" : this.props.unit !== undefined ? "textInputLine withUnits" : "textInputLine";
        const style = { background: this.state.inputValid ? undefined : "lightpink" };
        return (
            <div className={className}>
                {this.props.icon && <img src={this.props.icon} title={this.props.iconLabel} alt={this.props.iconLabel} color="black" className="icon" />}
                {this.props.label !== undefined && (
                    <div className="label" title={this.props.label}>
                        {this.props.label}
                    </div>
                )}
                {this.props.multilines && (
                    <>
                        <textarea
                            className={this.props.disabled ? "disabled" : ""}
                            style={style}
                            value={this.state.input}
                            onBlur={this.onBlur}
                            onFocus={this.onFocus}
                            onChange={this.onChange}
                            disabled={this.props.disabled}
                        />
                    </>
                )}
                {!this.props.multilines && (
                    <div
                        className={`value${this.props.noUnderline === true ? " noUnderline" : ""}${this.props.arrows ? " hasArrows" : ""}${this.state.dragging ? " dragging" : ""}`}
                    >
                        <input
                            className={this.props.disabled ? "disabled" : ""}
                            style={style}
                            value={value}
                            onBlur={this.onBlur}
                            onFocus={this.onFocus}
                            onChange={this.onChange}
                            onKeyDown={this.onKeyDown}
                            placeholder={placeholder}
                            type={this.props.numeric ? "number" : "text"}
                            step={step}
                            disabled={this.props.disabled}
                        />
                        {this.props.arrows && <InputArrowsComponent incrementValue={this.incrementValue} setDragging={this.setDragging} />}
                    </div>
                )}
                {this.props.unit}
            </div>
        );
    }
}
