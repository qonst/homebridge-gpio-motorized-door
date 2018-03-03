import * as process from "process";
import { GpioRelay, GpioRelayConfiguration } from "./Actuators/GpioRelay";
import { SignalDispatcher } from "strongly-typed-events/dist/signals";
import { ISignal } from "strongly-typed-events/dist/definitions/subscribables";
import { isUndefined, isNullOrUndefined } from "util";
import { Sensor } from "./Sensors/Sensor";
import { GpioSensor, GpioSensorConfiguration } from "./Sensors/GpioSensor";
import { TimedSensor } from "./Sensors/TimedSensor";
import { IRelay } from "./Actuators/Relay";
import { PulseDecorator } from "./Actuators/PulseDecorator";

export class MotorizedDoor {
    /** set if the door doesn't reach a sensor with the expected time */
    private _stopped: boolean = false;
    /** state the door is transitioning to */
    protected targetState: TargetState = TargetState.CLOSED;
    /** handle for timeout triggering failure state */
    private transitionTimeoutHandler: NodeJS.Timer | null;
    /** keeps track of which direction the door were moving in before it might have been stopped */
    private lastDirection: TargetState | null;
    /** time waited from when the sensors were expected to be reach and until a failure is declared */
    private static failureTimeoutLeniency: number = 5;
    /** relay to control the door */
    private readonly relay: PulseDecorator;
    /** sensor at closed position */
    private readonly closedSensor: Sensor;
    /** sensor at opened position */
    private readonly openSensor: Sensor;

    /** end user configuration */
    private readonly _config: DoorConfiguration;

    protected get config() { return this._config; }
    protected get stopped() { return this._stopped; }

    //#region Events

    private readonly onStoppedEvent = new SignalDispatcher();

    /** Raised when the door is stopped mid-transition */
    public get onStopped() {
        return this.onStoppedEvent.asEvent();
    }

    private readonly onClosingEvent = new SignalDispatcher();

    /** Raised when door is closing */
    public get onClosing() {
        return this.onClosingEvent.asEvent();
    }

    private readonly onOpeningEvent = new SignalDispatcher();

    /** Raised when door is opening */
    public get onOpening() {
        return this.onOpeningEvent.asEvent();
    }

    private readonly onOpenedEvent = new SignalDispatcher();

    /** Raised when door is opened */
    public get onOpened() {
        return this.onOpenedEvent.asEvent();
    }

    private readonly onClosedEvent = new SignalDispatcher();

    /** Raised when door is closed */
    public get onClosed() {
        return this.onClosedEvent.asEvent();
    }

    private readonly onCloseEvent = new SignalDispatcher();

    /** Raised when door set to close */
    public get onClose() {
        return this.onCloseEvent.asEvent();
    }

    private readonly onOpenEvent = new SignalDispatcher();

    /** Raised when door is open */
    public get onOpen() {
        return this.onOpenEvent.asEvent();
    }

    //#endregion

    protected static doorStateToString(state: CurrentState | TargetState): string {
        switch (state) {
            case CurrentState.OPEN:
                return "Open";
            case CurrentState.CLOSED:
                return "Closed";
            case CurrentState.OPENING:
                return "Opening";
            case CurrentState.CLOSING:
                return "Closing";
            case CurrentState.STOPPED:
                return "Stopped";
            default:
                return `Undefined (${state})`;
        }
    }

    constructor(config: DoorConfiguration, readonly log: (msg: string) => void) {
        this.log = log;

        if (config === undefined)
            throw "No config provided";

        this._config = {
            ...{
                openSensor: null,
                closedSensor: null,
                switch: {
                    ...{
                        pin: -1,
                        activeValue: true,
                        cycle: 600
                    },
                    ...config.switch
                },
                canBeStopped: true,
                maxTransitionTime: 30,
                initialFallbackState: TargetState.CLOSED
            },
            ...config
        };

        { // Create sensors
            let closedSensor: Sensor | null = null;
            let openSensor: Sensor | null = null;

            // binding to sensors change events
            if (!isNullOrUndefined(this._config.openSensor)) {
                openSensor = new GpioSensor("Open sensor (GPIO)", this._config.openSensor, this.log);
            }

            if (!isNullOrUndefined(this._config.closedSensor)) {
                closedSensor = new GpioSensor("Closed sensor (GPIO)", this._config.closedSensor, this.log);
            }

            if (closedSensor === null) {
                let state = openSensor !== null ? !openSensor.active : this.config.initialFallbackState === TargetState.CLOSED;
                let sensor = new TimedSensor("Closed sensor (virtual)", state, this._config.maxTransitionTime * 1000, this.log);
                this.onStopped.subscribe(() => sensor.clearTimeTrigger());
                this.onOpening.subscribe(() => sensor.trigger(false));;
                this.onClosing.subscribe(() => sensor.delayedTrigger(true));
                closedSensor = sensor;
            }

            if (openSensor === null) {
                let state = closedSensor !== null ? !closedSensor.active : this.config.initialFallbackState === TargetState.OPEN;
                let sensor = new TimedSensor("Open sensor (virtual)", state, this._config.maxTransitionTime * 1000, this.log);
                this.onStopped.subscribe(() => sensor.clearTimeTrigger());
                this.onClosing.subscribe(() => sensor.trigger(false));
                this.onOpening.subscribe(() => sensor.delayedTrigger(true));
                openSensor = sensor;
            }
            this.openSensor = openSensor;
            this.closedSensor = closedSensor;

            this.openSensor.onActivated.subscribe((sender) => this.opened(sender));
            this.openSensor.onDeactivated.subscribe((sender) => this.closing(sender));
            this.closedSensor.onActivated.subscribe((sender) => this.closed(sender));
            this.closedSensor.onDeactivated.subscribe((sender) => this.opening(sender));

            this.log(`Open sensor reporting ${this.openSensor.active}`);
            this.log(`Closed sensor reporting ${this.closedSensor.active}`);
        }

        this.log(`Initial door state: ${MotorizedDoor.doorStateToString(this.currentState)}`);

        this.transitionTimeoutHandler = null;
        this.lastDirection = null;

        // Setting output to off
        this.relay = new PulseDecorator(new GpioRelay("relay", this._config.switch, log), this._config.switch.cycle);
    }

    public close(): void {
        this.log(`close() invoked`);
        if (this.currentState !== CurrentState.OPEN) {
            // fakes we've reached open if the door is transitioning
            this.onOpenedEvent.dispatch();
        }
        this.onCloseEvent.dispatchAsync();
        this.transition(TargetState.OPEN, TargetState.CLOSED, CurrentState.CLOSING, this.onClosingEvent);
    }

    public open(): void {
        this.log(`open() invoked`);
        if (this.currentState !== CurrentState.CLOSED) {
            // fakes we've reached open if the door is transitioning
            this.onOpenedEvent.dispatch();
        }
        this.onOpenEvent.dispatchAsync();
        this.transition(TargetState.CLOSED, TargetState.OPEN, CurrentState.OPENING, this.onOpeningEvent);
    }

    private transition(from: TargetState, to: TargetState, via: CurrentState, event: SignalDispatcher) {
        let fromAsCurrent = <CurrentState><number>from;
        let toAsCurrent = <CurrentState><number>to;

        this.log(`Transitioning from ${MotorizedDoor.doorStateToString(from)} to ${MotorizedDoor.doorStateToString(to)}`);
        if (this.currentState === toAsCurrent || this.currentState === via) {
            return; // Do nothing
        } else if (this.currentState === fromAsCurrent) {
            this.relay.on(1);
        } else if (this.currentState === CurrentState.STOPPED) {
            if (this.lastDirection !== null && this._config.canBeStopped) {
                if (this.lastDirection === to) {
                    this.relay.on(2);
                } else if (this.lastDirection === from) {
                    this.relay.on(1);
                }
            } else {
                // Stopped but cannot trigger stop (faulty hardware)
                this.lastDirection = null;
                this.onStoppedEvent.dispatchAsync();
                return;
            }
        } else {
            if (this._config.canBeStopped) {
                this.relay.on(2);
            }
        }

        this.lastDirection = to;
        this.targetState = to;

        event.dispatchAsync();
    }

    public stop(): void {
        if (!this._config.canBeStopped) {
            return; // can't do anything
        }
        if (this.currentState === CurrentState.CLOSING || this.currentState === CurrentState.OPENING) {
            this.relay.on(1);
        }
        this.onStoppedEvent.dispatchAsync();
    }

    private closed(sensor: Sensor): void {
        this.log(`closed() called by ${sensor.name}: ${sensor.active ? "" : "de"}activated: Door ${MotorizedDoor.doorStateToString(this.currentState)}`);
        this.targetStateReached(sensor, TargetState.CLOSED, this.onClosedEvent);
    }

    private opened(sensor: Sensor): void {
        this.log(`opened() called by ${sensor.name}: ${sensor.active ? "" : "de"}activated: Door ${MotorizedDoor.doorStateToString(this.currentState)}`);
        this.targetStateReached(sensor, TargetState.OPEN, this.onOpenedEvent);
    }

    private opening(sensor: Sensor): void {
        this.log(`opening() called by ${sensor.name}: ${sensor.active ? "" : "de"}activated: Door ${MotorizedDoor.doorStateToString(this.currentState)}`);
        this.transitioning(this.openSensor, CurrentState.OPENING, TargetState.OPEN, this.onOpeningEvent);
    }

    private closing(sensor: Sensor): void {
        this.log(`closing() called by ${sensor.name}: ${sensor.active ? "" : "de"}activated: Door ${MotorizedDoor.doorStateToString(this.currentState)}`);
        this.transitioning(this.closedSensor, CurrentState.CLOSING, TargetState.CLOSED, this.onClosingEvent);
    }

    private transitioning(sensor: Sensor, via: CurrentState, to: TargetState, event: SignalDispatcher): void {
        if (this.currentState === via && this.targetState === to) {
            return;
        }
        this.lastDirection = to;
        this.setFailureTimeout();
        this.targetState = to;
        this.log(`${sensor.name}: door is transitioning to ${MotorizedDoor.doorStateToString(to)} by ${MotorizedDoor.doorStateToString(via)}`);
        event.dispatchAsync();
    }

    private targetStateReached(sensor: Sensor, at: TargetState, event: SignalDispatcher): void {
        this.lastDirection = null; // Arrived at the terminal, no previous direction should be stored
        this.removeFailureTimeout();
        this.targetState = at;
        this.log(`${sensor.name}: door is ${MotorizedDoor.doorStateToString(this.currentState)}`);
        event.dispatchAsync();
    }

    //#region Failure timeout

    private setFailureTimeout(): void {
        this.removeFailureTimeout();
        this.transitionTimeoutHandler = setTimeout(() => this.handleFailureTimeout(), (this._config.maxTransitionTime + MotorizedDoor.failureTimeoutLeniency) * 1000);
    }

    private handleFailureTimeout(): void {
        this.log("!!! Transition timeout reached; stopped door or faulty hardware?");
        this._stopped = true;
        this.onStoppedEvent.dispatchAsync();
    }

    private removeFailureTimeout(): void {
        if (this.transitionTimeoutHandler !== null) {
            clearTimeout(this.transitionTimeoutHandler);
            this.transitionTimeoutHandler = null;
        }
    }

    //#endregion

    get currentState(): CurrentState {
        if (this.openSensor.active && !this.closedSensor.active) {
            return CurrentState.OPEN;
        }
        if (!this.openSensor.active && this.closedSensor.active) {
            return CurrentState.CLOSED;
        }
        if (!this.openSensor.active && !this.closedSensor.active) {
            if (this._stopped) {
                return CurrentState.STOPPED;
            } else {
                switch (this.lastDirection) {
                    case TargetState.OPEN:
                        return CurrentState.OPENING;

                    case TargetState.CLOSED:
                        return CurrentState.CLOSING;

                    default:
                        return <any>this.targetState;
                }
            }
        }
        throw "Invalid state - both sensors active at once";
    }
};

export interface DoorConfiguration {
    name: string;
    openSensor: GpioSensorConfiguration;
    closedSensor: GpioSensorConfiguration;
    switch: SwitchConfig;
    canBeStopped: boolean;
    maxTransitionTime: number;
    initialFallbackState: TargetState;
};

export interface SwitchConfig extends GpioRelayConfiguration {
    cycle: number;
}

export enum TargetState {
    OPEN = 0,
    CLOSED = 1
}

export enum CurrentState {
    OPEN = TargetState.OPEN,
    CLOSED = TargetState.CLOSED,
    OPENING = 2,
    CLOSING = 3,
    STOPPED = 4
}