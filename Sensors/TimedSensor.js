"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Sensor_1 = require("./Sensor");
class TimedSensor extends Sensor_1.Sensor {
    constructor(name, initialState, triggerTimeout, log) {
        super(name);
        this.timeoutHandler = null;
        this.state = false;
        this.log = log;
        this.triggerTimeout = triggerTimeout;
        this.state = initialState;
        this.log(`${this.name} created, timeout ${triggerTimeout}`);
    }
    delayedTrigger(newState) {
        this.clearTimeTrigger();
        this.log(`${this.name} setting timeout (${this.triggerTimeout} seconds)`);
        this.timeoutHandler = setTimeout(() => {
            this.log(`${this.name}: timeout reached`);
            this.trigger(newState);
        }, this.triggerTimeout * 1000);
    }
    get active() {
        return this.state;
    }
    clearTimeTrigger() {
        if (this.timeoutHandler !== null) {
            this.log(`${this.name} clearing timeout`);
            clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }
    }
    trigger(value) {
        this.log(`${this.name} triggerede: ${value}`);
        this.clearTimeTrigger();
        if (this.active === value) {
            return;
        }
        this.state = value;
        if (value) {
            this.onSensorActivating.dispatch(this);
        }
        else {
            this.onSensorDeactivating.dispatch(this);
        }
    }
}
exports.TimedSensor = TimedSensor;
//# sourceMappingURL=TimedSensor.js.map