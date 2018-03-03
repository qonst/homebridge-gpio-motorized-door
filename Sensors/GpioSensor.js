"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rpio = require("rpio");
const Sensor_1 = require("./Sensor");
class GpioSensor extends Sensor_1.Sensor {
    constructor(name, config) {
        super(name);
        this.config = config;
        rpio.open(this.config.pin, rpio.INPUT, this.config.activeValue ? rpio.PULL_DOWN : rpio.PULL_UP);
        rpio.poll(this.config.pin, (pin) => this.stateChanged(pin), rpio.POLL_BOTH);
        this.confirmTimeout = null;
    }
    get active() {
        return rpio.read(this.config.pin) === (this.config.activeValue ? 1 : 0);
    }
    stateChanged(pin) {
        if (this.confirmTimeout !== null) {
            clearTimeout(this.confirmTimeout);
        }
        this.confirmTimeout = setTimeout(() => this.confirmState(this.active), 100);
    }
    confirmState(triggeredeValue) {
        if (this.confirmTimeout !== null) {
            clearTimeout(this.confirmTimeout);
        }
        // once in a while rpio raises a state changed while the sensor hasn't been activated.
        // rereading the value after a short while acts a guard against a faulty reads
        if (triggeredeValue === this.active) {
            if (triggeredeValue) {
                this.onSensorActivating.dispatch(this);
            }
            else {
                this.onSensorDeactivating.dispatch(this);
            }
        }
        else {
            this.onErrorEvent.dispatch(triggeredeValue);
        }
    }
    onError() {
        return this.onErrorEvent.asEvent();
    }
}
exports.GpioSensor = GpioSensor;
//# sourceMappingURL=GpioSensor.js.map