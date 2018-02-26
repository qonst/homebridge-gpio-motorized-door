var Service;
var Characteristic;
const process = require("process");
const rpio = require("rpio");
const GpioSensor = require("./GpioSensor.js");
const BaseSensor = require("./BaseSensor.js");
const DummySensor = require("./DummySensor.js");
const AutoResetSwitch = require("./AutoResetSwitch.js");
const EventEmitter = require('events');

class MotorizedDoor extends EventEmitter
{

    doorStateToString(state)
    {
        switch (state)
        {
        case Characteristic.CurrentDoorState.OPEN:
            return "Open";
        case Characteristic.CurrentDoorState.CLOSED:
            return "Closed";
        case Characteristic.CurrentDoorState.OPENING:
            return "Opening";
        case Characteristic.CurrentDoorState.CLOSING:
            return "Closing";
        case Characteristic.CurrentDoorState.STOPPED:
            return "Stopped";
        default:
            return "UNKNOWN (" + state + ")";
        }
    }

    constructor(homebridge, log, config)
    {
        super();
        Service = homebridge.hap.Service;
        Characteristic = homebridge.hap.Characteristic;
        this.log = log;
        this.version = require("./package.json").version;
        log("MotorizedDoor version " + this.version);

        this.config = Object.assign(
        {},
        {
            openSensor: null,
            closedSensor: null,
            switch: Object.assign(
                {},
                {
                    activeValue: 1,
                    cycle: 600
                },
                config.switch),
            canBeStopped: true,
            rpioSettings: Object.assign(
                {},
                {
                    gpiomem: true,
                    mapping: "physical"
                },
                config.rpioSettings),
            maxTransitionTime: 30,
            // https://developer.apple.com/documentation/homekit/hmcharacteristicvaluedoorstate
            initialFallbackState: Characteristic.TargetDoorState.CLOSED,
            type: Object.assign(
                {},
                {
                    manufacturer: "Opensource Community",
                    model: "RaspPi GPIO GarageDoor",
                    serialNumber: "Version 2.0.0"
                },
                config.type
            )
        }, config);

        if (process.geteuid() !== 0 && this.config.rpioSettings.gpiomem === false)
        {
            log("WARN! WARN! WARN! Using /dev/mem and not running as root");
        }

        rpio.init(this.config.rpioSettings);
        log("Door switch on pin: " + this.config.switch.pin + " with active set to " + (this.config.switch.activeValue === 1 ? "high" : "low"));
        log("Door switch cycle time: " + this.config.switch.cycle + "ms");
        log("Trigger to stop door: " + this.config.canBeStopped);

        if (this.config.closedSensor !== null)
        {
            log("Door closed sensor configured on pin " + this.config.closedSensor.pin + " with active set to " + (this.config.closedSensor.activeValue === 1 ? "high" : "low"));
        }
        else
        {
            log("Door closed sensor not configured");
        }

        if (this.config.openSensor !== null)
        {
            log("Door open sensor configured on pin " + this.config.openSensor.pin + " with active set to " + (this.config.openSensor.activeValue === 1 ? "high" : "low"));
        }
        else
        {
            log("Door open sensor not configured");
        }

        if (this.config.closedSensor === null && this.config.openSensor === null)
        {
            log("Neither open nor closed sensor is configured. Initial state is " + this.doorStateToString(this.config.initialFallbackState));
        }
        log("Door transition time in seconds: " + this.config.maxTransitionTime);

        this.garageDoorOpener = new Service.GarageDoorOpener(this.config.name, this.config.name);
        this.currentDoorState = this.garageDoorOpener.getCharacteristic(Characteristic.CurrentDoorState);
        this.currentDoorState.on("get", this.getState.bind(this));
        this.targetDoorState = this.garageDoorOpener.getCharacteristic(Characteristic.TargetDoorState);
        this.targetDoorState.on("set", this.setTargetState.bind(this));
        this.targetDoorState.on("get", this.getTargetState.bind(this));

        this.infoService = new Service.AccessoryInformation();
        this.infoService
            .setCharacteristic(Characteristic.Manufacturer, this.config.type.manufacturer)
            .setCharacteristic(Characteristic.Model, this.config.type.model)
            .setCharacteristic(Characteristic.SerialNumber, this.config.type.serialNumber);

        // binding to sensors change events
        if (this.config.openSensor !== null)
        {
            this.openSensor = new GpioSensor("Open", this.config.openSensor.pin, this.config.openSensor.activeValue);
        }
        else
        {
            this.openSensor = null;
        }
        if (this.config.closedSensor !== null)
        {
            this.closedSensor = new GpioSensor("Closed", this.config.closedSensor.pin, this.config.closedSensor.activeValue);
        }
        else
        {
            this.closedSensor = null;
        }

        if (this.closedSensor === null && this.openSensor !== null)
        {
            this.closedSensor = new DummySensor("Closed (dummy)", this.openSensor, this.config.maxTransitionTime, this.log);
            this.on("stopped", this.closedSensor.resetTimeoutHandler.bind(this));

        }
        if (this.openSensor === null && this.closedSensor !== null)
        {
            this.openSensor = new DummySensor("Open (dummy)", this.closedSensor, this.config.maxTransitionTime, this.log);
            this.on("stopped", this.openSensor.resetTimeoutHandler.bind(this));
        }

        if (this.openSensor!= null && this.closedSensor != null)
        {
            this.openSensor.on("activated", this.opened.bind(this));
            this.openSensor.on("deactivated", this.closing.bind(this));
            this.closedSensor.on("activated", this.closed.bind(this));
            this.closedSensor.on("deactivated", this.opening.bind(this));
        }

        // Should be retrieved from sensors if any
        this.currentState = this.determineState(this.config.initialFallbackState);

        this.previousDirection = null;
        switch (this.currentState)
        {
        case Characteristic.CurrentDoorState.OPEN:
        case Characteristic.CurrentDoorState.CLOSED:
            this.targetState = this.currentState;
            break;
        default:
            // unknown state, assume stopped
            this.currentState = Characteristic.CurrentDoorState.STOPPED;
        }

        this.log(`Initial door state: ${this.doorStateToString(this.currentState)}`);

        // Setting output to off
        this._switch = new AutoResetSwitch(this.log, this.config.switch.pin, this.config.switch.activeValue, this.config.switch.cycle);
    }

    determineState(fallbackState)
    {
        var isOpen = null;
        var isClosed = null;
        if (this.closedSensor !== null)
        {
            isClosed = this.closedSensor.currentValue;
        }
        if (this.openSensor !== null)
        {
            isOpen = this.openSensor.currentValue;
        }

        if ((isOpen || false) === true && (isClosed || false) === false)
        {
            this.log("State detected by sensor: " + this.doorStateToString(Characteristic.TargetDoorState.OPEN));
            return Characteristic.TargetDoorState.OPEN;
        }
        else if ((isOpen || false) === false && (isClosed || false) === true)
        {
            this.log("State detected by sensor: " + this.doorStateToString(Characteristic.TargetDoorState.CLOSED));
            return Characteristic.TargetDoorState.CLOSED;
        }
        else if (isClosed === false && isOpen === false)
        {
            this.log("State detected by sensor: " + this.doorStateToString(Characteristic.TargetDoorState.STOPPED));
            return Characteristic.TargetDoorState.STOPPED;
        }
        else if (isClosed === null && isOpen === null && this.currentState === Characteristic.CurrentDoorState.OPENING)
        {
            this.log("State deduced by state: " + this.doorStateToString(Characteristic.TargetDoorState.OPEN));
            return Characteristic.TargetDoorState.OPEN;
        }
        else if (isClosed === null && isOpen === null && this.currentState === Characteristic.CurrentDoorState.CLOSING)
        {
            this.log("State deduced by state: " + this.doorStateToString(Characteristic.TargetDoorState.CLOSED));
            return Characteristic.TargetDoorState.CLOSED;
        }
        else if (fallbackState !== null)
        {
            this.log("State deduced by fallback: " + this.doorStateToString(fallbackState));
            return fallbackState;
        }
        else
        {
            this.log("State deduced by default-state: " + this.doorStateToString(Characteristic.TargetDoorState.CLOSED));
            return Characteristic.TargetDoorState.CLOSED; // Assumed closed; got no state
        }
    }

    getTargetState(callback)
    {
        this.log(`TargetState read as ${this.doorStateToString(this.currentState)}`);
        callback(null, this.targetState);
    }

    setTargetState(state, callback)
    {
        if (state === this.currentState)
        {
            this.log("Already at target state");
            callback(null, this.targetState);
            return true;
        }

        switch(state)
        {
            case Characteristic.TargetDoorState.CLOSED:
                this.close();
                break;
            case Characteristic.TargetDoorState.OPEN:
                this.open();
                break;
            default:
                this.log(`Unhandled state: ${this.doorStateToString(state)}`);
        }

        callback();
        
        this.currentDoorState.updateValue(this.currentState);
        this.log(`Target state set to ${this.doorStateToString(this.targetState)}`);
        return true;
    }

    close()
    {
        this.log(`close called`);
        if (this.currentState === Characteristic.CurrentDoorState.CLOSED || this.currentState === Characteristic.CurrentDoorState.CLOSING)
        {
            return; // Do nothing
        }
        if (this.currentState === Characteristic.CurrentDoorState.OPEN)
        {
            this._switch.trigger(1);
        }
        if (this.currentState === Characteristic.CurrentDoorState.OPENING)
        {
            if (this.config.canBeStopped)
            {
                this._switch.trigger( 2 );
            }
        }
        if (this.currentState === Characteristic.CurrentDoorState.STOPPED)
        {
            if (this.previousDirection !== null && this.canBeStopped)
            {
                if (this.previousDirection === Characteristic.CurrentDoorState.OPENING)
                {
                    this._switch.trigger( 1 );
                }
                else if (this.previousDirection === Characteristic.CurrentDoorState.CLOSING)
                {
                    this._switch.trigger( 2 );
                }
            }
            else
            {
                // Stopped but cannot trigger stop (faulty hardware)
                this.previousDirection = null;
                this.emit("stopped");
                return;
            }
        }
        this.previousDirection = Characteristic.CurrentDoorState.CLOSING;
        this.currentState = Characteristic.CurrentDoorState.CLOSING;
        this.targetState = Characteristic.TargetDoorState.CLOSED;
        this.emit("closing");
    }

    open()
    {
        this.log(`Open called`);
        if (this.currentState === Characteristic.CurrentDoorState.OPEN || this.currentState === Characteristic.CurrentDoorState.OPENING)
        {
            return; // Do nothing
        }
        if (this.currentState === Characteristic.CurrentDoorState.CLOSED)
        {
            this._switch.trigger(1);
        }
        if (this.currentState === Characteristic.CurrentDoorState.CLOSING)
        {
            if (this.config.canBeStopped)
            {
                this._switch.trigger( 2 );
            }
        }
        if (this.currentState === Characteristic.CurrentDoorState.STOPPED)
        {
            if (this.previousDirection !== null && this.canBeStopped)
            {
                if (this.previousDirection === Characteristic.CurrentDoorState.OPENING)
                {
                    this._switch.trigger( 2 );
                }
                else if (this.previousDirection === Characteristic.CurrentDoorState.CLOSING)
                {
                    this._switch.trigger( 1 );
                }
            }
            else
            {
                // Stopped but cannot trigger stop (faulty hardware)
                this.previousDirection = null;
                this.emit("stopped");
                return;
            }
        }
        this.previousDirection = Characteristic.CurrentDoorState.OPENING;
        this.currentState = Characteristic.CurrentDoorState.OPENING;
        this.targetState = Characteristic.TargetDoorState.OPEN;
        this.emit("opening");
    }

    stop()
    {
        if (!this.config.canBeStopped)
        {
            return; // can't do anything
        }
        if (this.currentState === this.currentState === Characteristic.CurrentDoorState.CLOSING || this.currentState === this.currentState === Characteristic.CurrentDoorState.OPENING)
        {
            this._switch.trigger(1);
        }
        this.emit("stopped");
    }

    closed()
    {
        this._terminalState(this.closedSensor.name, Characteristic.CurrentDoorState.CLOSED, "closed");
    }

    opened()
    {
        this._terminalState(this.openSensor.name, Characteristic.CurrentDoorState.OPEN, "opened");
    }

    opening()
    {
        this._transitioning(this.openSensor.name, Characteristic.CurrentDoorState.OPENING, Characteristic.TargetDoorState.OPEN, "opening");
    }

    closing()
    {
        this._transitioning(this.closedSensor.name, Characteristic.CurrentDoorState.CLOSING, Characteristic.TargetDoorState.CLOSED, "closing");
    }

    _transitioning(name, transition, target, event)
    {
        if (this.currentState === transition && this.targetState === target)
        {
            return;
        }

        this.previousDirection = null; // Left the terminal, no previous direction should be stored
        this.currentState = transition;
        this.targetState = target;
        this.targetDoorState.updateValue(this.targetState);
        this.currentDoorState.updateValue(this.currentState);
        this.log(`${name}: door is transitioning (${this.doorStateToString(transition)}) to ${this.doorStateToString(target)}`);
        this.emit(event);
    }

    _terminalState(name, state, event)
    {
        if (this.currentState === state)
        {
            return;
        }
        
        this.previousDirection = null; // Arrived at the terminal, no previous direction should be stored
        this.currentState = state;
        this.targetState = state;
        this.targetDoorState.updateValue(this.targetState);
        this.currentDoorState.updateValue(this.currentState);
        this.log(`${name}: door is ${this.doorStateToString(this.currentState)}`);
        this.emit(event);
    }

    _setTransitionTimeout(timeout)
    {
        if (this.transitionTimeoutHandler !== null)
        {
            clearTimeout(this.transitionTimeoutHandler);
            this.transitionTimeoutHandler = null;
        }
        if (timeout !== null && timeout > 0)
        {
            this.transitionTimeoutHandler = setTimeout(function(){
                {
                    this.log("Transition timeout reached; stopped door or faulty hardware?");
                    this.currentState = Characteristic.CurrentDoorState.STOPPED;
                    this.currentDoorState.updateValue(this.currentState);
                    if (this.currentState !== this.targetState)
                    {
                        this.targetState = this.currentState;
                        this.targetDoorState.updateValue(this.targetState);
                    }
                }}.bind(this), timeout);
        }
    }

    getState(callback)
    {
        this.log(`State read as ${this.doorStateToString(this.currentState)}`);
        callback(null, this.currentState);
    }

    getServices()
    {
        return [this.infoService, this.garageDoorOpener];
    }

    get targetState()
    {
        return this._targetState;
    }

    set targetState(value)
    {
        this.log(`Setting target-state to ${this.doorStateToString(value)}`);
        this._targetState = value;
    }

    get currentState()
    {
        return this._currentState;
    }

    set currentState(value)
    {
        if (value === Characteristic.CurrentDoorState.STOPPED || value === Characteristic.CurrentDoorState.OPEN || value === Characteristic.CurrentDoorState.CLOSED)
        {
            this._setTransitionTimeout(null);
        }
        else
        {
            this._setTransitionTimeout((this.config.maxTransitionTime + 5) * 1000); // add 5 seconds for dummy sensors to trigger first
        }
        this.log(`Setting current-state to ${this.doorStateToString(value)}`);
        this._currentState = value;
    }
};

module.exports = MotorizedDoor;

