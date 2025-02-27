import * as React from "react";
import type { Observable } from "core/Misc/observable";
import type { PropertyChangedEvent } from "../propertyChangedEvent";
import type { LockObject } from "../tabs/propertyGrids/lockObject";
import { conflictingValuesPlaceholder } from "./targetsProxy";
import { InputArrowsComponent } from "./inputArrowsComponent";
import { Logger } from "core/Misc";

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

export class TextInputLineComponent extends React.Component<ITextInputLineComponentProps, ITextInputLineComponentState> {
    private _localChange: boolean;

    constructor(props: ITextInputLineComponentProps) {
        super(props);

        const emptyValue = this.props.numeric ? "0" : "";

        this.state = {
            input: (this.props.value !== undefined ? this.props.value : this.props.target[this.props.propertyName!]) || emptyValue,
            dragging: false,
            inputValid: true,
        };

        this._localChange = true; // to avoid update on mount
    }

    override componentWillUnmount() {
        // Save input into target before closing
        const value = this._formatValue(this.state.input, this.props);
        this._updateTargetValue(value, this.props);
        if (this.props.lockObject) {
            this.props.lockObject.lock = false;
        }
    }

    override shouldComponentUpdate(nextProps: ITextInputLineComponentProps, nextState: ITextInputLineComponentState): boolean {
        if (this._localChange) {
            this._localChange = false;
            return true;
        }

        if (this.props.target !== nextProps.target || this.props.value !== nextProps.value) {
            // Save previous input into target if the update was not result of a local change
            const value = this._formatValue(this.state.input, this.props);
            this._updateTargetValue(value, this.props);

            // Update input if target or value changed
            const newValue = nextProps.value !== undefined ? nextProps.value : nextProps.target[nextProps.propertyName!];
            nextState.input = newValue || "";

            Logger.Warn("eeee");
            return true;
        }

        return false;
    }

    raiseOnPropertyChanged(newValue: string, previousValue: string, props: ITextInputLineComponentProps) {
        if (props.onChange) {
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

    getCurrentNumericValue(value: string) {
        const numeric = parseFloat(value);
        if (!isNaN(numeric)) {
            return numeric;
        }
        if (this.props.placeholder !== undefined) {
            const placeholderNumeric = parseFloat(this.props.placeholder);
            if (!isNaN(placeholderNumeric)) {
                return placeholderNumeric;
            }
        }
        return 0;
    }

    updateInput(input: string) {
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

    _formatValue(value: string, props: ITextInputLineComponentProps) {
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
            let numericValue = this.getCurrentNumericValue(value);
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

        return value;
    }

    _updateTargetValue(value: string, props: ITextInputLineComponentProps) {
        const store = props.value !== undefined ? props.value : props.target[props.propertyName!];

        if (props.validator && props.validator(value) == false && props.onValidateChangeFailed) {
            props.onValidateChangeFailed(value);
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
                this.raiseOnPropertyChanged(value, store, props);
            }, props.throttlePropertyChangedNotificationDelay ?? 200);
        } else {
            this.raiseOnPropertyChanged(value, store, props);
        }
    }

    updateValue(adjustedInput?: string, updateState: boolean = true) {
        let value = adjustedInput ?? this.state.input;

        value = this._formatValue(value, this.props);

        if (updateState) {
            this._localChange = true;
            this.setState({ input: value });
        }

        this._updateTargetValue(value, this.props);
    }

    incrementValue(amount: number) {
        if (this.props.step) {
            amount *= this.props.step;
        }
        if (this.props.arrowsIncrement) {
            this.props.arrowsIncrement(amount);
            return;
        }
        const currentValue = this.getCurrentNumericValue(this.state.input);
        this.updateValue((currentValue + amount).toFixed(2));
    }

    onKeyDown(event: React.KeyboardEvent) {
        if (!this.props.disabled) {
            if (event.key === "Enter") {
                this.updateValue();
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
    }

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
                            onFocus={() => {
                                if (this.props.lockObject) {
                                    this.props.lockObject.lock = true;
                                }
                            }}
                            onChange={(evt) => this.updateInput(evt.target.value)}
                            onBlur={(evt) => {
                                this.updateValue();
                                if (this.props.lockObject) {
                                    this.props.lockObject.lock = false;
                                }
                            }}
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
                            onBlur={(evt) => {
                                if (this.props.lockObject) {
                                    this.props.lockObject.lock = false;
                                }
                                this.updateValue();
                            }}
                            onFocus={() => {
                                if (this.props.lockObject) {
                                    this.props.lockObject.lock = true;
                                }
                            }}
                            onChange={(evt) => this.updateInput(evt.target.value)}
                            onKeyDown={(evt) => this.onKeyDown(evt)}
                            placeholder={placeholder}
                            type={this.props.numeric ? "number" : "text"}
                            step={step}
                            disabled={this.props.disabled}
                        />
                        {this.props.arrows && (
                            <InputArrowsComponent incrementValue={(amount) => this.incrementValue(amount)} setDragging={(dragging) => this.setState({ dragging })} />
                        )}
                    </div>
                )}
                {this.props.unit}
            </div>
        );
    }
}
