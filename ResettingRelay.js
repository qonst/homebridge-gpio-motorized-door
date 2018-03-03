"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rpio = require("rpio");
class Relay {
    constructor(log, config) {
        this.log = log;
        this.config = config;
        rpio.open(this.config.pin, rpio.OUTPUT, this.config.activeValue ? rpio.PULL_DOWN : rpio.PULL_UP);
    }
    on() {
        rpio.write(this.config.pin, this.config.activeValue ? rpio.HIGH : rpio.LOW);
    }
    off() {
        rpio.write(this.config.pin, !this.config.activeValue ? rpio.HIGH : rpio.LOW);
    }
    get state() {
        return rpio.read(this.config.pin) === (this.config.activeValue ? rpio.HIGH : rpio.LOW);
    }
}
exports.Relay = Relay;
class PulseRelay extends Relay {
    constructor(log, config) {
        super(log, config);
        this.log = log;
        this.config = config;
    }
    on(pulse = 1, cycleTime = this.config.cycle) {
        this.pulse(pulse, cycleTime);
    }
    pulse(count, cycleTime) {
        if (count === 0) {
            return;
        }
        super.on();
        setTimeout(() => {
            super.off();
            count -= 1;
            if (count > 0) {
                setTimeout(() => this.pulse(count, cycleTime), cycleTime);
            }
        }, cycleTime);
    }
}
exports.PulseRelay = PulseRelay;
//# sourceMappingURL=ResettingRelay.js.map