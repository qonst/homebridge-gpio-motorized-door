"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const process = require("process");
const rpio = require("rpio");
const GpioSensor_1 = require("./Sensors/GpioSensor");
const TimedSensor_1 = require("./Sensors/TimedSensor");
const ResettingRelay_1 = require("./ResettingRelay");
const signals_1 = require("strongly-typed-events/dist/signals");
class MotorizedDoor {
    constructor(log, config) {
        this.log = log;
        /** set if the door doesn't reach a sensor with the expected time */
        this._stopped = false;
        /** state the door is transitioning to */
        this.targetState = TargetState.CLOSED;
        /** handle for timeout triggering failure state */
        this.transitionTimeoutHandler = null;
        /** keeps track of which direction the door were moving in before it might have been stopped */
        this.lastDirection = null;
        /** relay to control the door */
        this.relay = null;
        /** sensor at closed position */
        this.closedSensor = null;
        /** sensor at opened position */
        this.openSensor = null;
        //#region Events
        this.onStoppedEvent = new signals_1.SignalDispatcher();
        this.onClosingEvent = new signals_1.SignalDispatcher();
        this.onOpeningEvent = new signals_1.SignalDispatcher();
        this.onOpenedEvent = new signals_1.SignalDispatcher();
        this.onClosedEvent = new signals_1.SignalDispatcher();
        this.onCloseEvent = new signals_1.SignalDispatcher();
        this.onOpenEvent = new signals_1.SignalDispatcher();
        this.log = log;
        this._config = Object.assign({}, {
            openSensor: null,
            closedSensor: null,
            switch: Object.assign({}, {
                activeValue: true,
                cycle: 600
            }, config.switch),
            canBeStopped: true,
            rpioSettings: Object.assign({}, {
                gpiomem: true,
                mapping: "physical"
            }, config.rpioSettings),
            maxTransitionTime: 30,
            // https://developer.apple.com/documentation/homekit/hmcharacteristicvaluedoorstate
            initialFallbackState: TargetState.CLOSED
        }, config);
        if (process.geteuid() !== 0 && this._config.rpioSettings.gpiomem === false) {
            log("WARN! WARN! WARN! Using /dev/mem and not running as root");
        }
        rpio.init(this._config.rpioSettings);
        // binding to sensors change events
        if (this._config.openSensor !== null) {
            this.openSensor = new GpioSensor_1.GpioSensor("Open sensor (GPIO)", this._config.openSensor);
        }
        if (this._config.closedSensor !== null) {
            this.closedSensor = new GpioSensor_1.GpioSensor("Closed sensor (GPIO)", this._config.closedSensor);
        }
        if (this.closedSensor === null) {
            let state = this.openSensor !== null ? !this.openSensor.active : this.config.initialFallbackState === TargetState.CLOSED;
            let sensor = new TimedSensor_1.TimedSensor("Closed sensor (virtual)", state, this._config.maxTransitionTime, this.log);
            this.onStopped.subscribe(() => sensor.clearTimeTrigger());
            this.onOpening.subscribe(() => sensor.trigger(false));
            ;
            this.onClosing.subscribe(() => sensor.delayedTrigger(true));
            this.closedSensor = sensor;
        }
        if (this.openSensor === null) {
            let state = this.closedSensor !== null ? !this.closedSensor.active : this.config.initialFallbackState === TargetState.OPEN;
            let sensor = new TimedSensor_1.TimedSensor("Open sensor (virtual)", false, this._config.maxTransitionTime, this.log);
            this.onStopped.subscribe(() => sensor.clearTimeTrigger());
            this.onClosing.subscribe(() => sensor.trigger(false));
            this.onOpening.subscribe(() => sensor.delayedTrigger(true));
            this.openSensor = sensor;
        }
        this.openSensor.onActivated.subscribe((sender) => this.opened(sender));
        this.openSensor.onDeactivated.subscribe((sender) => this.closing(sender));
        this.closedSensor.onActivated.subscribe((sender) => this.closed(sender));
        this.closedSensor.onDeactivated.subscribe((sender) => this.opening(sender));
        this.log(`Open sensor reporting ${this.openSensor.active}`);
        this.log(`Closed sensor reporting ${this.closedSensor.active}`);
        this.log(`Initial door state: ${MotorizedDoor.doorStateToString(this.currentState)}`);
        // Setting output to off
        this.relay = new ResettingRelay_1.PulseRelay(this.log, this._config.switch);
    }
    get config() { return this._config; }
    get stopped() { return this._stopped; }
    /** Raised when the door is stopped mid-transition */
    get onStopped() {
        return this.onStoppedEvent.asEvent();
    }
    /** Raised when door is closing */
    get onClosing() {
        return this.onClosingEvent.asEvent();
    }
    /** Raised when door is opening */
    get onOpening() {
        return this.onOpeningEvent.asEvent();
    }
    /** Raised when door is opened */
    get onOpened() {
        return this.onOpenedEvent.asEvent();
    }
    /** Raised when door is closed */
    get onClosed() {
        return this.onClosedEvent.asEvent();
    }
    /** Raised when door set to close */
    get onClose() {
        return this.onCloseEvent.asEvent();
    }
    /** Raised when door is open */
    get onOpen() {
        return this.onOpenEvent.asEvent();
    }
    //#endregion
    static doorStateToString(state) {
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
        }
    }
    close() {
        this.log(`close() invoked`);
        if (this.currentState !== CurrentState.OPEN) {
            // fakes we've reached open if the door is transitioning
            this.onOpenedEvent.dispatch();
        }
        this.onCloseEvent.dispatchAsync();
        this.transition(TargetState.OPEN, TargetState.CLOSED, CurrentState.CLOSING, this.onClosingEvent);
    }
    open() {
        this.log(`open() invoked`);
        if (this.currentState !== CurrentState.CLOSED) {
            // fakes we've reached open if the door is transitioning
            this.onOpenedEvent.dispatch();
        }
        this.onOpenEvent.dispatchAsync();
        this.transition(TargetState.CLOSED, TargetState.OPEN, CurrentState.OPENING, this.onOpeningEvent);
    }
    transition(from, to, via, event) {
        let fromAsCurrent = from;
        let toAsCurrent = to;
        this.log(`Transitioning from ${MotorizedDoor.doorStateToString(from)} to ${MotorizedDoor.doorStateToString(to)}`);
        if (this.currentState === toAsCurrent || this.currentState === via) {
            return; // Do nothing
        }
        else if (this.currentState === fromAsCurrent) {
            this.relay.on(1);
        }
        else if (this.currentState === CurrentState.STOPPED) {
            if (this.lastDirection !== null && this._config.canBeStopped) {
                if (this.lastDirection === to) {
                    this.relay.on(2);
                }
                else if (this.lastDirection === from) {
                    this.relay.on(1);
                }
            }
            else {
                // Stopped but cannot trigger stop (faulty hardware)
                this.lastDirection = null;
                this.onStoppedEvent.dispatchAsync();
                return;
            }
        }
        else {
            if (this._config.canBeStopped) {
                this.relay.on(2);
            }
        }
        this.lastDirection = to;
        this.targetState = to;
        event.dispatchAsync();
    }
    stop() {
        if (!this._config.canBeStopped) {
            return; // can't do anything
        }
        if (this.currentState === CurrentState.CLOSING || this.currentState === CurrentState.OPENING) {
            this.relay.on(1);
        }
        this.onStoppedEvent.dispatchAsync();
    }
    closed(sensor) {
        this.log(`closed() called by ${sensor.name}: ${sensor.active ? "" : "de"}activated: Door ${MotorizedDoor.doorStateToString(this.currentState)}`);
        this.targetStateReached(sensor, TargetState.CLOSED, this.onClosedEvent);
    }
    opened(sensor) {
        this.log(`opened() called by ${sensor.name}: ${sensor.active ? "" : "de"}activated: Door ${MotorizedDoor.doorStateToString(this.currentState)}`);
        this.targetStateReached(sensor, TargetState.OPEN, this.onOpenedEvent);
    }
    opening(sensor) {
        this.log(`opening() called by ${sensor.name}: ${sensor.active ? "" : "de"}activated: Door ${MotorizedDoor.doorStateToString(this.currentState)}`);
        this.transitioning(this.openSensor, CurrentState.OPENING, TargetState.OPEN, this.onOpeningEvent);
    }
    closing(sensor) {
        this.log(`closing() called by ${sensor.name}: ${sensor.active ? "" : "de"}activated: Door ${MotorizedDoor.doorStateToString(this.currentState)}`);
        this.transitioning(this.closedSensor, CurrentState.CLOSING, TargetState.CLOSED, this.onClosingEvent);
    }
    transitioning(sensor, via, to, event) {
        if (this.currentState === via && this.targetState === to) {
            return;
        }
        this.lastDirection = to;
        this.setFailureTimeout();
        this.targetState = to;
        this.log(`${sensor.name}: door is transitioning to ${MotorizedDoor.doorStateToString(to)} by ${MotorizedDoor.doorStateToString(via)}`);
        event.dispatchAsync();
    }
    targetStateReached(sensor, at, event) {
        this.lastDirection = null; // Arrived at the terminal, no previous direction should be stored
        this.removeFailureTimeout();
        this.targetState = at;
        this.log(`${sensor.name}: door is ${MotorizedDoor.doorStateToString(this.currentState)}`);
        event.dispatchAsync();
    }
    //#region Failure timeout
    setFailureTimeout() {
        this.removeFailureTimeout();
        this.transitionTimeoutHandler = setTimeout(() => this.handleFailureTimeout(), (this._config.maxTransitionTime + MotorizedDoor.failureTimeoutLeniency) * 1000);
    }
    handleFailureTimeout() {
        this.log("!!! Transition timeout reached; stopped door or faulty hardware?");
        this._stopped = true;
        this.onStoppedEvent.dispatchAsync();
    }
    removeFailureTimeout() {
        if (this.transitionTimeoutHandler !== null) {
            clearTimeout(this.transitionTimeoutHandler);
            this.transitionTimeoutHandler = null;
        }
    }
    //#endregion
    get currentState() {
        if (this.openSensor.active && !this.closedSensor.active) {
            return CurrentState.OPEN;
        }
        if (!this.openSensor.active && this.closedSensor.active) {
            return CurrentState.CLOSED;
        }
        if (!this.openSensor.active && !this.closedSensor.active) {
            if (this._stopped) {
                return CurrentState.STOPPED;
            }
            else {
                switch (this.lastDirection) {
                    case TargetState.OPEN:
                        return CurrentState.OPENING;
                    case TargetState.CLOSED:
                        return CurrentState.CLOSING;
                }
            }
        }
    }
}
/** time waited from when the sensors were expected to be reach and until a failure is declared */
MotorizedDoor.failureTimeoutLeniency = 5;
exports.MotorizedDoor = MotorizedDoor;
;
;
var TargetState;
(function (TargetState) {
    TargetState[TargetState["OPEN"] = 0] = "OPEN";
    TargetState[TargetState["CLOSED"] = 1] = "CLOSED";
})(TargetState = exports.TargetState || (exports.TargetState = {}));
var CurrentState;
(function (CurrentState) {
    CurrentState[CurrentState["OPEN"] = 0] = "OPEN";
    CurrentState[CurrentState["CLOSED"] = 1] = "CLOSED";
    CurrentState[CurrentState["OPENING"] = 2] = "OPENING";
    CurrentState[CurrentState["CLOSING"] = 3] = "CLOSING";
    CurrentState[CurrentState["STOPPED"] = 4] = "STOPPED";
})(CurrentState = exports.CurrentState || (exports.CurrentState = {}));
//# sourceMappingURL=MotorizedDoor.js.map