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

    private _targetState: TargetState;
    public get targetState(): TargetState { return this._targetState; }

    /** handle for timeout triggering failure state */
    private transitionTimeoutHandler: NodeJS.Timer | null;
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
                this.onOpen.subscribe(() => sensor.trigger(false));;
                this.onClose.subscribe(() => sensor.delayedTrigger(true));
                closedSensor = sensor;
            }

            if (openSensor === null) {
                let state = closedSensor !== null ? !closedSensor.active : this.config.initialFallbackState === TargetState.OPEN;
                let sensor = new TimedSensor("Open sensor (virtual)", state, this._config.maxTransitionTime * 1000, this.log);
                this.onStopped.subscribe(() => sensor.clearTimeTrigger());
                this.onClose.subscribe(() => sensor.trigger(false));
                this.onOpen.subscribe(() => sensor.delayedTrigger(true));
                openSensor = sensor;
            }
            this.openSensor = openSensor;
            this.closedSensor = closedSensor;

            this.openSensor.onActivated.subscribe((sender) => this.targetReached(sender, TargetState.OPEN, this.onOpenedEvent));
            this.openSensor.onDeactivated.subscribe((sender) => this.transitioning(sender, CurrentState.CLOSING, TargetState.CLOSED, this.onClosingEvent));

            this.closedSensor.onActivated.subscribe((sender) => this.targetReached(sender, TargetState.CLOSED, this.onClosedEvent));
            this.closedSensor.onDeactivated.subscribe((sender) => this.transitioning(sender, CurrentState.OPENING, TargetState.OPEN, this.onOpeningEvent));

            this.log(`Open sensor reporting ${this.openSensor.active}`);
            this.log(`Closed sensor reporting ${this.closedSensor.active}`);

            switch (this.currentState) {
                case CurrentState.OPEN:
                case CurrentState.OPENING:
                    this._targetState = TargetState.OPEN;
                    break;

                case CurrentState.CLOSED:
                case CurrentState.CLOSING:
                    this._targetState = TargetState.CLOSED;
                    break;

                default:
                    this._targetState = this.config.initialFallbackState;
            }
        }

        this.log(`Initial door state: ${MotorizedDoor.doorStateToString(this.currentState)}`);

        this.transitionTimeoutHandler = null;

        // Setting output to off
        this.relay = new PulseDecorator(new GpioRelay("relay", this._config.switch, log), this._config.switch.cycle);
    }

    //#region open/close from external source

    public close(): void {
        this.log(`close() invoked`);
        this.onCloseEvent.dispatch();
        this.initiatTransition(TargetState.OPEN, TargetState.CLOSED, CurrentState.CLOSING);
    }

    public open(): void {
        this.log(`open() invoked`);
        this.onOpenEvent.dispatch();
        this.initiatTransition(TargetState.CLOSED, TargetState.OPEN, CurrentState.OPENING);
    }

    private initiatTransition(from: TargetState, to: TargetState, via: CurrentState) {
        let fromAsCurrent = <CurrentState><number>from;
        let toAsCurrent = <CurrentState><number>to;

        this.log(`Transitioning from ${MotorizedDoor.doorStateToString(from)} to ${MotorizedDoor.doorStateToString(to)}`);
        if (this.currentState === toAsCurrent || this.currentState === via) {
            return; // Do nothing
        } else if (this.currentState === fromAsCurrent) {
            this.relay.on(1);
        } else if (this.currentState === CurrentState.STOPPED) {
            if (this._config.canBeStopped) {
                if (this.targetState === to) {
                    this.relay.on(2);
                } else if (this.targetState === from) {
                    this.relay.on(1);
                }
            } else {
                // Stopped but cannot trigger stop (faulty hardware)
                this.onStoppedEvent.dispatch();
                return;
            }
        } else {
            if (this._config.canBeStopped) {
                this.relay.on(2);
            }
        }
    }

    public stop(): void {
        if (!this._config.canBeStopped) {
            return; // can't do anything
        }
        if (this.currentState === CurrentState.CLOSING || this.currentState === CurrentState.OPENING) {
            this.relay.on(1);
        }
        this.onStoppedEvent.dispatch();
    }

    //#endregion

    private transitioning(sensor: Sensor, via: CurrentState, to: TargetState, event: SignalDispatcher): void {
        if (this.currentState === via && this.targetState === to) {
            return;
        }
        if (sensor.active) {
            // Still at sensor?
            this.log(`${sensor.name} raised transition, but it's still active; ignoreing message`);
            return;
        }
        this.setFailureTimeout();
        this._targetState = to;
        this.log(`${sensor.name}: door is transitioning to ${MotorizedDoor.doorStateToString(to)} by ${MotorizedDoor.doorStateToString(via)}`);
        event.dispatch();
    }

    private targetReached(sensor: Sensor, at: TargetState, event: SignalDispatcher): void {
        if (!sensor.active) {
            // Might have moved away again?
            this.log(`${sensor.name} raised target reached, but it's not active; ignoreing message`);
            return;
        }
        this.removeFailureTimeout();
        if (this.targetState !== at) {
            this.log(`!!! Arrived at ${MotorizedDoor.doorStateToString(at)}; expected ${MotorizedDoor.doorStateToString(this.targetState)}`);
            this._targetState = at;
            // Raising event to make sure everybody is notified
            switch (this.targetState) {
                case TargetState.CLOSED:
                    this.onClosedEvent.dispatch();
                    break;
                case TargetState.OPEN:
                    this.onOpenedEvent.dispatch();
                    break;
            }
        }
        this.log(`${sensor.name}: door is ${MotorizedDoor.doorStateToString(this.currentState)}`);
        event.dispatch();
    }

    //#region Failure timeout

    private setFailureTimeout(): void {
        this.removeFailureTimeout();
        this.transitionTimeoutHandler = setTimeout(() => this.handleFailureTimeout(), (this._config.maxTransitionTime + MotorizedDoor.failureTimeoutLeniency) * 1000);
    }

    private handleFailureTimeout(): void {
        this.log("!!! Transition timeout reached; stopped door or faulty hardware?");
        this._stopped = true;
        this.onStoppedEvent.dispatch();
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
        } else if (!this.openSensor.active && this.closedSensor.active) {
            return CurrentState.CLOSED;
        } else if (!this.openSensor.active && !this.closedSensor.active) {
            if (this._stopped) {
                return CurrentState.STOPPED;
            } else {
                this.log(`currentState: no sensors active, guess from last known direction/target-states (${MotorizedDoor.doorStateToString(this.targetState)}`);
                switch (this.targetState) {
                    case TargetState.OPEN:
                        return CurrentState.OPENING;

                    case TargetState.CLOSED:
                        return CurrentState.CLOSING;
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